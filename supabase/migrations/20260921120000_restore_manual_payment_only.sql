-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — ROLLBACK: RESTORE MANUAL-PAYMENT ARCHITECTURE
--
--   Razorpay is permanently abandoned. This migration rolls the
--   Supabase database back to the pre-Razorpay manual (screenshot)
--   payment architecture ONLY.
--
--   Remote files that are referenced by them:
--
--   RAZORPAY ADDITIVE MIGRATION (BEING REVERSED):
--     supabase/migrations/20260920120000_razorpay_payment_flow.sql
--
--   KNOWN-GOOD ORIGINAL (SOURCE OF THE RESTORED OBJECTS):
--     supabase/migrations/20260918090000_restore_team_size_pricing.sql
--
--   WHAT THIS DOES
--     1. Restores public.register_team(payload jsonb) to the EXACT
--        original implementation from
--        20260918090000_restore_team_size_pricing.sql — the payment
--        screenshot (payment_image_url) is REQUIRED again, the URL must
--        be http(s), 'failed' is NOT accepted, fees come from
--        fee_2_members / fee_3_members / fee_4_members, and the
--        active-round / capacity / participants / registration-code
--        idempotency / registration_round_id / registration_fee /
--        security-definer execute behaviour is preserved verbatim.
--     2. Drops the four Razorpay-only indexes (if they exist).
--     3. Drops the Razorpay-only payment-status RPC
--        get_registration_payment_status(uuid, text).
--     4. Recreates teams_payment_status_check with EXACTLY:
--        pending | submitted | verified | rejected
--     5. Drops the Razorpay-specific columns + the payment-failure
--        email tracking columns from public.teams.
--     6. Does NOT delete any team/participant row in this migration.
--     7. Notifies PostgREST to reload its schema cache.
--
--   UNTOUCHED: registration_rounds, participants, capacity semantics,
--   problem_statements, admin tables, and the ORIGINAL manual email
--   tracking columns (verification_email_* / rejection_email_*).
--
--   Safe to re-run. One transaction. Run in the Supabase SQL Editor.
-- ═══════════════════════════════════════════════════════════════
begin;

-- ── 1. register_team(payload jsonb): EXACT original implementation ──
--    Sourced verbatim from
--    supabase/migrations/20260918090000_restore_team_size_pricing.sql
--    (create or replace function ... commit).
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

  /* ── Problem statement: REQUIRED and must reference a real challenge. ── */
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

  /* ── Participants: JSON array, 2-4 members, exactly one lead ── */
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
        Any client-supplied fee/registration_fee/amount/price is IGNORED.
        NULL or <= 0 configured price rejects the registration. ── */
  case v_count
    when 2 then v_registration_fee := v_round.fee_2_members;
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
  'VOIDHACK 2026 canonical registration submit. SECURITY DEFINER: validates the team + crew, resolves the ACTIVE round, enforces dates + team capacity with a row lock (round auto-closes at capacity), computes the AUTHORITATIVE fee from the active round and the participant count (fee_2_members / fee_3_members / fee_4_members — the ONLY source of truth, rejected when NULL or <= 0), stamps registration_round_id + registration_fee, upserts the team idempotent on registration_code, and rewrites participants — all in ONE transaction. The client-supplied fee is ignored.';

-- ── 2. Drop the Razorpay-only indexes (if they exist) ─────────────
--    Handled generically so it works whether the object exists as a
--    plain index or as the index backing a UNIQUE constraint.
do $$
declare
  v_name text;
begin
  foreach v_name in array array[
    'teams_razorpay_order_id_unique',
    'teams_razorpay_payment_id_unique',
    'teams_razorpay_webhook_event_id_unique',
    'teams_razorpay_order_id_idx'
  ]
  loop
    if exists (
      select 1 from pg_constraint
       where conname = v_name
         and conrelid = 'public.teams'::regclass
    ) then
      execute format('alter table public.teams drop constraint %I', v_name);
    end if;
    if exists (
      select 1 from pg_indexes
       where schemaname = 'public'
         and tablename = 'teams'
         and indexname = v_name
    ) then
      execute format('drop index public.%I', v_name);
    end if;
  end loop;
end $$;

-- ── 3. Drop the Razorpay-only payment-status RPC ─────────────────
--    public_active_round() is deliberately NOT touched.
drop function if exists public.get_registration_payment_status(uuid, text);

-- ── 4. Restore the ORIGINAL payment_status check constraint ──────
alter table public.teams
  drop constraint if exists teams_payment_status_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_payment_status_check'
  ) then
    alter table public.teams
      add constraint teams_payment_status_check
      check (payment_status in ('pending', 'submitted', 'verified', 'rejected'));
  end if;
end $$;

-- ── 5. Drop the Razorpay-specific columns + failure-email tracking ─
--    Dropping a column also drops its own check constraint, so the
--    payment_failed_email_status CHECK goes away with its column.
alter table public.teams
  drop column if exists razorpay_order_id,
  drop column if exists razorpay_payment_id,
  drop column if exists razorpay_signature,
  drop column if exists razorpay_webhook_event_id,
  drop column if exists payment_verified_at,
  drop column if exists payment_amount_paise,
  drop column if exists payment_method,
  drop column if exists payment_failure_reason,
  drop column if exists payment_failed_email_status,
  drop column if exists payment_failed_email_sent_at,
  drop column if exists payment_failed_email_last_error,
  drop column if exists payment_failed_email_send_count,
  drop column if exists payment_failed_email_last_sent_to;

-- ── 6. NO team/participant row is deleted here ────────────────────
--    The 7 test teams are cleaned up separately, after this migration
--    has been verified.

-- ── 7. Make the schema changes discoverable by the deployed app ──
notify pgrst, 'reload schema';

commit;