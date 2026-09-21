-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Per-team-size registration fees (additive)
--
--   Sits ON TOP of the live database. Adds three fee columns to
--   registration_rounds so every round can price 2-, 3- and 4-member
--   teams independently:
--
--       fee_2_members   numeric(10,2)   — fee for a 2-member team
--       fee_3_members   numeric(10,2)   — fee for a 3-member team
--       fee_4_members   numeric(10,2)   — fee for a 4-member team
--
--   BACKWARD COMPATIBILITY
--     • The existing single `fee` column is KEPT (never deleted).
--     • Every existing round is backfilled fee_2/3/4_members = fee,
--       so NOTHING changes for already-configured rounds until the
--       admin intentionally re-prices them.
--     • Historical teams.registration_fee values are NEVER touched.
--
--   SAFETY / CONSTRAINTS
--     • Each fee >= 0 (guarded check constraints).
--     • Columns are NOT NULL after backfill, defaulting to 0 — an
--       active round is guaranteed to have a valid fee for every size.
--
--   AUTHORITATIVE FEE
--     • public_active_round() now also returns fee_2/3/4_members
--       (with a legacy fallback to `fee`) so the public form can show
--       the price for the selected crew size.
--     • register_team(payload jsonb) KEEPS its signature and now
--       computes the fee from the ACTIVE round + the participant
--       count in the payload. The client-supplied fee is ignored —
--       the database is the only source of truth. Capacity still
--       counts TEAMS, never participants.
--
--   Run in the Supabase SQL Editor as one transaction. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

-- ── 1. Team-size fee columns (additive) ───────────────────────────
alter table public.registration_rounds
  add column if not exists fee_2_members numeric(10,2);
alter table public.registration_rounds
  add column if not exists fee_3_members numeric(10,2);
alter table public.registration_rounds
  add column if not exists fee_4_members numeric(10,2);

-- ── 2. Backfill existing rounds: fee_2/3/4_members = fee ──────────
--    Preserves the CURRENT behavior of every pre-existing round until
--    the admin intentionally changes a per-size price.
update public.registration_rounds
   set fee_2_members = coalesce(fee_2_members, fee, 0),
       fee_3_members = coalesce(fee_3_members, fee, 0),
       fee_4_members = coalesce(fee_4_members, fee, 0)
 where fee_2_members is null
    or fee_3_members is null
    or fee_4_members is null;

-- ── 3. NOT NULL + sane defaults (new rounds via the API must send
--    all three; adminCreateRound enforces it app-side). ─────────────
alter table public.registration_rounds
  alter column fee_2_members set default 0,
  alter column fee_3_members set default 0,
  alter column fee_4_members set default 0;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'registration_rounds'
       and column_name = 'fee_2_members'
       and is_nullable = 'YES'
  ) then
    execute 'alter table public.registration_rounds alter column fee_2_members set not null';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'registration_rounds'
       and column_name = 'fee_3_members'
       and is_nullable = 'YES'
  ) then
    execute 'alter table public.registration_rounds alter column fee_3_members set not null';
  end if;
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'registration_rounds'
       and column_name = 'fee_4_members'
       and is_nullable = 'YES'
  ) then
    execute 'alter table public.registration_rounds alter column fee_4_members set not null';
  end if;
end $$;

-- ── 4. Non-negative fee constraints (guarded, additive) ────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'registration_rounds_fee_2_members_check'
  ) then
    alter table public.registration_rounds
      add constraint registration_rounds_fee_2_members_check check (fee_2_members >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'registration_rounds_fee_3_members_check'
  ) then
    alter table public.registration_rounds
      add constraint registration_rounds_fee_3_members_check check (fee_3_members >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'registration_rounds_fee_4_members_check'
  ) then
    alter table public.registration_rounds
      add constraint registration_rounds_fee_4_members_check check (fee_4_members >= 0);
  end if;
end $$;

-- ── 5. public_active_round(): also return the team-size fees ───────
--    Preserves every existing field. The legacy `fee` stays for
--    old consumers; the new fee_2/3/4_members fields power the
--    team-size-aware pricing. A legacy round whose new columns are
--    somehow NULL falls back to the generic `fee`.
create or replace function public.public_active_round()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_round      public.registration_rounds%rowtype;
  v_registered integer := 0;
  v_now        timestamptz := now();
begin
  select * into v_round
    from public.registration_rounds
   where status = 'active'
   order by created_at desc, id desc
   limit 1;

  if not found then
    return '{}'::jsonb;
  end if;

  select count(*) into v_registered
    from public.teams
   where registration_round_id = v_round.id;

  return jsonb_build_object(
    'id',           v_round.id,
    'title',        v_round.title,
    'slug',         v_round.slug,
    'fee',          v_round.fee,
    'fee_2_members', coalesce(v_round.fee_2_members, v_round.fee, 0),
    'fee_3_members', coalesce(v_round.fee_3_members, v_round.fee, 0),
    'fee_4_members', coalesce(v_round.fee_4_members, v_round.fee, 0),
    'capacity',     v_round.capacity,
    'status',       v_round.status,
    'starts_at',    v_round.starts_at,
    'ends_at',      v_round.ends_at,
    'registered',   v_registered,
    'remaining',    greatest(v_round.capacity - v_registered, 0),
    'open',
      v_round.status = 'active'
      and v_registered < v_round.capacity
      and (v_round.starts_at is null or v_round.starts_at <= v_now)
      and (v_round.ends_at is null or v_round.ends_at > v_now)
  );
end;
$$;

revoke all on function public.public_active_round() from public;
grant execute on function public.public_active_round() to anon, authenticated;

comment on function public.public_active_round() is
  'Public read of the current active registration round + live availability, including per-team-size fees (2/3/4 members). Returns {} when registration is closed.';

-- ── 6. register_team(payload jsonb): fee from ACTIVE ROUND + SIZE ──
--    Signature unchanged. The authoritative fee is derived here from
--    the locked active round and the participant count; any fee sent
--    by the browser is ignored. Capacity still counts TEAMS.
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
  v_registration_fee numeric(10,2);
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
        into v_round_id, v_registration_fee
        from public.teams where id = v_team_id;

      return jsonb_build_object(
        'team_id',               v_team_id,
        'registration_code',     v_code,
        'registration_round_id', v_round_id,
        'registration_fee',      v_registration_fee,
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

  /* ── THE AUTHORITATIVE FEE ──
       Active round + participant count decide the amount. The browser
       never supplies the fee; the value sent with the payload (if any)
       is ignored. Legacy rounds with NULL per-size fees fall back to
       the single generic `fee`, preserving old behavior. Its value is
       snapshotted onto teams.registration_fee below. ── */
  case v_count
    when 2 then v_registration_fee := coalesce(v_round.fee_2_members, v_round.fee, 0);
    when 3 then v_registration_fee := coalesce(v_round.fee_3_members, v_round.fee, 0);
    when 4 then v_registration_fee := coalesce(v_round.fee_4_members, v_round.fee, 0);
    else raise exception 'INVALID TEAM SIZE.' using errcode = '23514';
  end case;

  /* ── Capacity — only NEW teams consume it; a closed round stays
       closed regardless of capacity until the admin explicitly sets
       status = 'active'. Capacity counts TEAMS, never participants. ── */
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
             v_round_id, v_registration_fee)
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
           v_round_id, v_registration_fee)
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
           registration_fee = v_registration_fee
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
    'registration_fee',      v_registration_fee,
    'round_title',           v_round.title,
    'payment_status',        v_status,
    'submitted_at',          now()
  );
end;
$$;

revoke all on function public.register_team(jsonb) from public;
grant execute on function public.register_team(jsonb) to anon, authenticated;

comment on function public.register_team(jsonb) is
  'VOIDHACK 2026 canonical registration submit. SECURITY DEFINER: validates the team + crew, resolves the ACTIVE round, enforces dates + team capacity with a row lock (round auto-closes at capacity; closed rounds stay closed until an admin explicitly reopens), computes the AUTHORITATIVE fee from the active round and the participant count (fee_2_members / fee_3_members / fee_4_members, legacy fallback to fee), stamps registration_round_id + registration_fee, upserts the team idempotent on registration_code, and rewrites participants — all in ONE transaction. Public round/fee/capacity are NEVER client-chosen; the client-supplied fee is ignored.';

-- ── 7. Make the changed signatures discoverable by the deployed app ──
notify pgrst, 'reload schema';

commit;