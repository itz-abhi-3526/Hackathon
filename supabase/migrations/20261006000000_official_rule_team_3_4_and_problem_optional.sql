-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — FINAL OFFICIAL RULES (NEW REGISTRATIONS)
--
--   The one canonical state. Run LAST in the Supabase SQL Editor —
--   it supersedes every earlier draft migration. Two rules applied
--   together:
--
--     RULE A  Team size: a HACK2PITCH 2026 team MUST contain exactly
--             3 or 4 members. The 2-member / DUO option is REMOVED.
--             (This fixes the residual 2-4 gate left by the earlier
--              "problem statements private" draft.)
--
--     RULE B  Problem statements are NOT released in advance — they
--             are revealed during the hackathon. problem_statement_id
--             is OPTIONAL for new registrations: absent/blank → NULL;
--             a provided id must still reference a real row.
--             (This fixes the residual "PROBLEM STATEMENT IS
--             REQUIRED." rejection from the earlier 3-4 draft.)
--
--   WHAT THIS DOES
--     1. Recreates public.register_team(payload jsonb) — the single
--        canonical submit RPC (same signature, same body) so that:
--
--          participant count   : 3 <= count <= 4   (enforced)
--          exactly one lead    : enforced
--          problem_statement_id: OPTIONAL (absent/blank → NULL;
--                                provided must reference a real row)
--          fee                 : active round fee_3_members /
--                                fee_4_members only (never hardcoded;
--                                the size-2 fee branch is removed)
--          round / capacity    : resolved server-side, row-locked,
--                                auto-closes at capacity (unchanged)
--          idempotency         : retries reuse the team registered
--                                under the same registration_code
--
--        The participant JSONB array IS the team size (there is no
--        separate team_size column), so the count gate rejects every
--        invalid registration (0/1/2 or >4 participants, null,
--        non-array).
--
--     2. Revokes the anonymous SELECT on problem_statements (drops
--        ps_public_select / ps_anon_select) and keeps the authenticated
--        admin-only read (ps_auth_select requires is_admin()) so the
--        admin UI and the send-registration-email function keep
--        working. register_team is SECURITY DEFINER, so its internal
--        lookup is unaffected by RLS.
--
--     3. Does NOT touch the teams / participants / problem_statements
--        tables or any rows. Existing historical registrations —
--        including any 2-member teams and any already-assigned
--        problem_statement_id values — are NOT modified, migrated, or
--        deleted. They remain intact and visible in admin.
--
--   Safe to re-run. One transaction. Run in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════
begin;

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

  /* ── Problem statement: OPTIONAL (challenges are revealed during the
        hackathon). Absent/blank → NULL. When one IS provided it must
        reference a real challenge. teams.problem_statement_id is
        NULLABLE, so NULL is stored as-is. ── */
  if v_ps_text is not null then
    begin
      v_ps := v_ps_text::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID PROBLEM STATEMENT.' using errcode = '23503';
    end;
    select 1 into v_dummy from public.problem_statements where id = v_ps;
    if not found then
      raise exception 'INVALID PROBLEM STATEMENT.' using errcode = '23503';
    end if;
  end if;

  /* ── Participants: JSON array, 3-4 members, exactly one lead ── */
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

  /* OFFICIAL TEAM-SIZE RULE: exactly 3 or 4 members. 2-member (DUO)
     registrations are rejected. */
  if v_count < 3 or v_count > 4 then
    raise exception 'TEAM SIZE MUST BE BETWEEN 3 AND 4.' using errcode = '23514';
  end if;
  if v_leads <> 1 then
    raise exception 'EXACTLY ONE PARTICIPANT MUST BE THE TEAM LEAD.' using errcode = '23514';
  end if;

  /* ── Idempotent retries reuse the team registered under this code ── */
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

  /* ── Serialize concurrent registrations on the round row. ── */
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

  /* ── THE AUTHORITATIVE FEE — active round + participant count only.
        v_count is ALWAYS 3 or 4 (enforced above), so only the 3- and
        4-member prices exist. Any client-supplied fee / registration_fee
        / amount / price is IGNORED. NULL or <= 0 configured price
        rejects the registration. ── */
  case v_count
    when 3 then v_registration_fee := v_round.fee_3_members;
    when 4 then v_registration_fee := v_round.fee_4_members;
    else raise exception 'INVALID TEAM SIZE.' using errcode = '23514';
  end case;

  if v_registration_fee is null or v_registration_fee <= 0 then
    raise exception
      'NO REGISTRATION FEE CONFIGURED FOR A %-MEMBER TEAM IN THE ACTIVE ROUND.', v_count
      using errcode = '23514';
  end if;

  /* ── Capacity — only NEW teams consume it. Counts TEAMS. ── */
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

  /* ── Upsert the team, stamped with THIS round + its fee snapshot ── */
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

  /* ── Participants: rewrite to exactly the submitted crew ── */
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
  'HACK2PITCH 2026 canonical registration submit (FINAL RULES). SECURITY DEFINER: validates the team + crew (team size MUST be between 3 and 4 participants — the 2-member/DUO option is removed), accepts a problem_statement_id that is OPTIONAL (challenges are revealed during the hackathon — NULL is stored when absent; a provided id must reference a real row), resolves the ACTIVE round, enforces dates + team capacity with a row lock (round auto-closes at capacity), computes the AUTHORITATIVE fee from the active round and the participant count (fee_3_members / fee_4_members — the ONLY source of truth, rejected when NULL or <= 0), stamps registration_round_id + registration_fee, upserts the team idempotent on registration_code, and rewrites participants — all in ONE transaction. The client-supplied fee is ignored.';

-- ── Problem statements are PRIVATE until the hackathon ─────────────
--    Drop the anonymous public read; keep the authenticated admin-only
--    read (ps_auth_select requires is_admin()). register_team is
--    SECURITY DEFINER, so its internal problem_statements lookup is
--    unaffected by RLS.
drop policy if exists "ps_public_select" on public.problem_statements;
drop policy if exists "ps_anon_select" on public.problem_statements;

drop policy if exists "ps_auth_select" on public.problem_statements;
create policy "ps_auth_select"
  on public.problem_statements for select
  using (auth.role() = 'authenticated' and public.is_admin());

-- ── Existing registrations are NEVER touched by this migration ─────
--    No teams / participants / problem_statements rows are modified,
--    migrated, or deleted. Existing 2-member historical teams and any
--    already-assigned problem_statement_id values remain intact and
--    visible in admin. Only NEW registrations: 3 or 4 members and a
--    NULL problem_statement_id.

notify pgrst, 'reload schema';

commit;