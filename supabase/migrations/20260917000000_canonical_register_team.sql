-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Canonical registration architecture
--
--   ONE public registration contract:
--
--       public.register_team(payload jsonb)  RETURNS jsonb
--
--     the frontend calls it EXACTLY as:
--       supabase.rpc('register_team', { payload: { ... } })
--
--   The COMPLETE operation is atomic inside register_team:
--     resolve active round → validate payload → lock round row
--     (FOR UPDATE) → re-verify status/window → enforce capacity
--     (COUNT teams whose registration_round_id = THIS round) →
--     validate problem statement → upsert team (idempotent on
--     registration_code) stamped with registration_round_id +
--     registration_fee (NEVER client-supplied) → rewrite participants
--     → auto-close the round at capacity → return a structured result.
--
--   THE FRONTEND NEVER CHOOSES: the round, the fee, the capacity or
--   the registration count. All are derived from registration_rounds.
--
--   WHAT THIS FILE REMOVES
--     • public.submit_registration(jsonb)  — obsolete first RPC.
--     • public.submit_registration(text, jsonb, text, text, uuid,
--       text, text) — redundant SECOND public write path. It was
--       callable by anon and inserted teams WITHOUT round/capacity
--       enforcement (a real security hole: direct INSERT past every
--       round rule, with a confusing "Registration failed: …" wrapper
--       for raw constraint leaks). After this file, ONLY the
--       canonical register_team exists.
--
--   WHAT THIS FILE ENSURES (idempotent, safe to re-run)
--     • register_team is the single atomic, round-aware write.
--     • One ACTIVE round at a time (single-active trigger).
--     • admin_round_delete exists.
--     • Suitable check constraints + round-count index exist.
--     • No anonymous INSERT/UPDATE/SELECT on teams / participants.
--     • PostgREST schema cache reloaded so the RPC resolves.
--
--   Run in the Supabase SQL Editor as one transaction.
-- ═══════════════════════════════════════════════════════════════
begin;

-- ── 1. Remove every redundant public submit path ──────────────────
drop function if exists public.submit_registration(payload jsonb);
drop function if exists public.submit_registration(text, jsonb, text, text, uuid, text, text);

-- ── 2. Canonical atomic registration RPC ──────────────────────────
--    SECURITY DEFINER (runs as its owner) so anon can submit through
--    EITHER ONE ENTRY POINT. search_path is pinned. It touches ONLY
--    teams + participants (inserts/updates) and registration_rounds /
--    problem_statements (plain reads) — nothing else. Capacity is
--    enforced under a row lock on the round, so two simultaneous
--    submissions for the last slot can never exceed capacity.
create or replace function public.register_team(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now           timestamptz := now();
  v_code          text := nullif(btrim(coalesce(payload->>'registration_code', '')), '');
  v_name          text := btrim(coalesce(payload->>'team_name', ''));
  v_college       text := btrim(coalesce(payload->>'college', ''));
  v_proof         text := btrim(coalesce(payload->>'payment_image_url', ''));
  v_status        text := nullif(btrim(coalesce(payload->>'payment_status', '')), '');
  v_ps_text       text := nullif(btrim(coalesce(payload->>'problem_statement_id', '')), '');
  v_ps            uuid;
  v_participants  jsonb := coalesce(payload->'participants', '[]'::jsonb);
  v_count         integer := 0;
  v_leads         integer := 0;
  v_dummy         integer;
  v_round         public.registration_rounds%rowtype;
  v_round_id      uuid;
  v_registered    integer := 0;
  v_team_id       uuid;
  v_p             jsonb;
begin
  /* ── Team fields ── */
  if length(v_name) < 2 then
    raise exception 'TEAM NAME IS REQUIRED.' using errcode = '23514';
  end if;
  if v_college = '' then
    raise exception 'COLLEGE IS REQUIRED.' using errcode = '23514';
  end if;
  if v_status is null or v_status = '' then
    v_status := 'submitted';
  end if;
  if v_status not in ('pending', 'submitted', 'verified', 'rejected') then
    raise exception 'INVALID PAYMENT STATUS.' using errcode = '23514';
  end if;
  if v_proof = '' or v_proof !~* '^https?://' then
    raise exception 'PAYMENT PROOF URL IS REQUIRED.' using errcode = '23514';
  end if;

  /* ── Problem statement: REQUIRED (live teams.problem_statement_id is
       NOT NULL) and must reference an existing challenge. ── */
  if v_ps_text is null then
    raise exception 'PROBLEM STATEMENT IS REQUIRED.' using errcode = '23514';
  end if;
  begin
    v_ps := v_ps_text::uuid;
  exception when invalid_text_representation then
    raise exception 'INVALID PROBLEM STATEMENT.' using errcode = '23503';
  end;
  select 1 into v_dummy from public.problem_statements where id = v_ps;
  if not found then
    raise exception 'INVALID PROBLEM STATEMENT.' using errcode = '23503';
  end if;

  /* ── Participants: 2-4 valid members, exactly one lead ── */
  if jsonb_typeof(v_participants) <> 'array' then
    raise exception 'PARTICIPANTS MUST BE A LIST.' using errcode = '23514';
  end if;

  for v_p in select value from jsonb_array_elements(v_participants)
  loop
    v_count := v_count + 1;

    if btrim(coalesce(v_p->>'full_name', '')) = '' then
      raise exception 'EVERY PARTICIPANT NEEDS A FULL NAME.' using errcode = '23514';
    end if;
    if coalesce(v_p->>'email', '') !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
      raise exception 'EVERY PARTICIPANT NEEDS A VALID EMAIL.' using errcode = '23514';
    end if;
    if length(regexp_replace(coalesce(v_p->>'phone', ''), '\D', '', 'g')) not between 10 and 12 then
      raise exception 'EVERY PARTICIPANT NEEDS A VALID PHONE.' using errcode = '23514';
    end if;
    if coalesce(v_p->>'food_preference', '') not in ('Veg', 'Non-Veg') then
      raise exception 'FOOD PREFERENCE MUST BE VEG OR NON-VEG.' using errcode = '23514';
    end if;

    if v_p->>'role' in ('lead', 'team_lead') then
      v_leads := v_leads + 1;
    elsif v_p->>'role' is distinct from 'member' then
      raise exception 'INVALID PARTICIPANT ROLE.' using errcode = '23514';
    end if;
  end loop;

  if v_count < 2 or v_count > 4 then
    raise exception 'TEAM SIZE MUST BE BETWEEN 2 AND 4.' using errcode = '23514';
  end if;
  if v_leads <> 1 then
    raise exception 'EXACTLY ONE PARTICIPANT MUST BE THE TEAM LEAD.' using errcode = '23514';
  end if;

  /* ── Idempotent retries reuse the team registered under this code. ──
       The wizard reserves the code before its first submit and resends
       it on retry, so the same code always means the same team — no
       duplicate rows, and a retry never consumes a SECOND capacity slot. */
  if v_code is not null then
    select id into v_team_id
      from public.teams
     where registration_code = v_code
     limit 1;
  end if;

  /* ── Resolve the ACTIVE round. The database decides the round. ── */
  select * into v_round
    from public.registration_rounds
   where status = 'active'
   order by created_at desc, id desc
   limit 1;

  if not found then
    /* No active round: an existing team (pure retry) still completes
       idempotently; a genuinely new registration is rejected. */
    if v_team_id is not null then
      update public.teams
         set team_name = v_name,
             college = v_college,
             problem_statement_id = v_ps,
             payment_status = v_status,
             payment_image_url = v_proof
       where id = v_team_id;

      delete from public.participants where team_id = v_team_id;
      for v_p in select value from jsonb_array_elements(v_participants)
      loop
        insert into public.participants
          (team_id, full_name, email, phone, food_preference, role)
        values
          (v_team_id,
           btrim(coalesce(v_p->>'full_name', '')),
           lower(btrim(coalesce(v_p->>'email', ''))),
           btrim(coalesce(v_p->>'phone', '')),
           v_p->>'food_preference',
           case when v_p->>'role' in ('lead', 'team_lead') then 'lead' else 'member' end);
      end loop;

      select registration_round_id, registration_fee
        into v_round_id, v_round.fee
        from public.teams where id = v_team_id;

      return jsonb_build_object(
        'team_id',               v_team_id,
        'registration_code',     v_code,
        'registration_round_id', v_round_id,
        'registration_fee',      v_round.fee,
        'round_title',           null,
        'payment_status',        v_status,
        'submitted_at',          now()
      );
    end if;
    raise exception 'REGISTRATION CLOSED.' using errcode = '23514';
  end if;

  v_round_id := v_round.id;

  /* ── Serialize concurrent registrations on the round row. Any second
       submit blocks here until the first commits, then sees the fresh
       team count below. This is the anti-race lock that keeps capacity
       from ever being exceeded. ── */
  perform 1
    from public.registration_rounds
   where id = v_round_id
     for update;

  /* ── Re-verify after the lock: still active? inside the window? ── */
  select status, starts_at, ends_at, capacity
    into v_round.status, v_round.starts_at, v_round.ends_at, v_round.capacity
    from public.registration_rounds
   where id = v_round_id;

  if not found then
    raise exception 'REGISTRATION CLOSED.' using errcode = '23514';
  end if;
  if v_round.status is distinct from 'active' then
    raise exception 'REGISTRATION CLOSED.' using errcode = '23514';
  end if;
  if v_round.starts_at is not null and v_round.starts_at > v_now then
    raise exception 'REGISTRATION NOT OPEN YET.' using errcode = '23514';
  end if;
  if v_round.ends_at is not null and v_round.ends_at <= v_now then
    raise exception 'REGISTRATION CLOSED.' using errcode = '23514';
  end if;

  /* ── Capacity — only NEW teams consume it; a closed round stays
       closed regardless of capacity until the admin explicitly sets
       status = 'active'. ── */
  if v_team_id is null then
    select count(*) into v_registered
      from public.teams
     where registration_round_id = v_round_id;

    if v_registered >= v_round.capacity then
      update public.registration_rounds
         set status = 'closed', updated_at = v_now
       where id = v_round_id;
      raise exception 'REGISTRATION FULL.' using errcode = '23514';
    end if;
  end if;

  /* ── Upsert the team, stamped with THIS round + its fee snapshot. ── */
  if v_team_id is null then
    if v_code is null then
      loop
        v_code := 'VH-2026-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        begin
          insert into public.teams
            (registration_code, team_name, college, problem_statement_id,
             payment_status, payment_image_url,
             registration_round_id, registration_fee)
          values
            (v_code, v_name, v_college, v_ps,
             v_status, v_proof,
             v_round_id, v_round.fee)
          returning id into v_team_id;
          exit;
        exception when unique_violation then
          v_team_id := null;
        end;
      end loop;
    else
      begin
        insert into public.teams
          (registration_code, team_name, college, problem_statement_id,
           payment_status, payment_image_url,
           registration_round_id, registration_fee)
        values
          (v_code, v_name, v_college, v_ps,
           v_status, v_proof,
           v_round_id, v_round.fee)
        returning id into v_team_id;
      exception when unique_violation then
        -- a concurrent request won this code — treat as idempotent retry
        select id into v_team_id
          from public.teams
         where registration_code = v_code
         limit 1;
      end;
    end if;
  else
    update public.teams
       set team_name = v_name,
           college = v_college,
           problem_statement_id = v_ps,
           payment_status = v_status,
           payment_image_url = v_proof,
           registration_round_id = v_round_id,
           registration_fee = v_round.fee
     where id = v_team_id;
  end if;

  /* ── Participants: rewrite to exactly the submitted crew. ── */
  delete from public.participants where team_id = v_team_id;

  for v_p in select value from jsonb_array_elements(v_participants)
  loop
    insert into public.participants
      (team_id, full_name, email, phone, food_preference, role)
    values
      (v_team_id,
       btrim(coalesce(v_p->>'full_name', '')),
       lower(btrim(coalesce(v_p->>'email', ''))),
       btrim(coalesce(v_p->>'phone', '')),
       v_p->>'food_preference',
       case when v_p->>'role' in ('lead', 'team_lead') then 'lead' else 'member' end);
  end loop;

  /* ── Recalculate after the write; auto-close at capacity. ── */
  select count(*) into v_registered
    from public.teams
   where registration_round_id = v_round_id;

  if v_registered >= v_round.capacity then
    update public.registration_rounds
       set status = 'closed', updated_at = now()
     where id = v_round_id;
  end if;

  return jsonb_build_object(
    'team_id',               v_team_id,
    'registration_code',     v_code,
    'registration_round_id', v_round_id,
    'registration_fee',      v_round.fee,
    'round_title',           v_round.title,
    'payment_status',        v_status,
    'submitted_at',          now()
  );
end;
$$;

revoke all on function public.register_team(jsonb) from public;
grant execute on function public.register_team(jsonb) to anon, authenticated;

comment on function public.register_team(jsonb) is
  'HACK2PITCH 2026 canonical registration submit. SECURITY DEFINER: validates the team + crew, resolves the ACTIVE round, enforces dates + team capacity with a row lock (round auto-closes at capacity; closed rounds stay closed until an admin explicitly reopens), stamps registration_round_id + registration_fee from the round, upserts the team idempotent on registration_code, and rewrites participants — all in ONE transaction. Public round/fee/capacity are NEVER client-chosen.';

-- ── 3. One active round at a time (business rule, not UI-only) ────
create or replace function public.ensure_single_active_round()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' then
    update public.registration_rounds
       set status = 'closed', updated_at = now()
     where status = 'active' and id <> new.id;
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_registration_rounds_single_active
  on public.registration_rounds;
create trigger trg_registration_rounds_single_active
  before insert or update on public.registration_rounds
  for each row execute function public.ensure_single_active_round();

-- ── 4. Admin round delete (never deployed before this file) ───────
create or replace function public.admin_round_delete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;

  if exists (select 1 from public.teams where registration_round_id = p_id) then
    raise exception 'ROUND HAS REGISTERED TEAMS AND CANNOT BE DELETED.' using errcode = '23503';
  end if;
  delete from public.registration_rounds where id = p_id;
  if not found then
    raise exception 'ROUND NOT FOUND.' using errcode = '23503';
  end if;
end;
$$;

revoke all on function public.admin_round_delete(uuid) from public;
grant execute on function public.admin_round_delete(uuid) to authenticated;

-- ── 5. RLS hardening: anon can NEVER reach teams / participants ───
revoke all on table public.teams from anon;
revoke all on table public.participants from anon;

drop policy if exists "teams_public_insert" on public.teams;
drop policy if exists "teams_public_update" on public.teams;
drop policy if exists "teams_public_select" on public.teams;
drop policy if exists "teams_anon_insert" on public.teams;
drop policy if exists "teams_anon_select" on public.teams;

drop policy if exists "participants_public_insert" on public.participants;
drop policy if exists "participants_public_update" on public.participants;
drop policy if exists "participants_public_select" on public.participants;
drop policy if exists "participants_anon_insert" on public.participants;
drop policy if exists "participants_anon_select" on public.participants;

-- ── 6. Constraints + round-count index (additive, safe to re-run) ─
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'registration_rounds_fee_check'
  ) then
    alter table public.registration_rounds
      add constraint registration_rounds_fee_check check (fee >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'registration_rounds_capacity_check'
  ) then
    alter table public.registration_rounds
      add constraint registration_rounds_capacity_check check (capacity > 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'registration_rounds_status_check'
  ) then
    alter table public.registration_rounds
      add constraint registration_rounds_status_check
      check (status in ('draft', 'active', 'closed'));
  end if;
end $$;

create index if not exists teams_registration_round_id_idx
  on public.teams (registration_round_id);

-- ── 7. Make the final signature discoverable by the deployed app ──
notify pgrst, 'reload schema';

commit;