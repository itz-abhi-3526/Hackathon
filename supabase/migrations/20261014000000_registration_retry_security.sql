-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Secure anonymous registration retries (6B)
--   (backend-only, additive, one transaction, safe to re-run)
--
--   PROBLEM
--     register_team(payload jsonb) re-opened an existing team from the
--     client-supplied registration_code ALONE and then rewrote the team
--     row + every participant. Anyone who learned or guessed a code
--     could overwrite another team's name, college, participant list and
--     payment proof, and could force payment_status to 'verified' or
--     'rejected' by sending that value in the payload.
--
--   FIX
--     1. teams.retry_token_hash (new nullable column). On EVERY new
--        team the server mints a 256-bit random token, stores ONLY its
--        SHA-256 hash, and returns the raw token ONCE as retry_token.
--     2. A submission whose registration_code matches an existing team
--        is a RETRY and is now authorized by registration_code +
--        retry_token (hashed and compared). Without a valid token the
--        call raises the single generic error
--        'REGISTRATION RETRY NOT AUTHORIZED.' and mutates NOTHING.
--     3. A concurrent insert that loses the registration_code unique
--        race is no longer adopted: it re-reads the row and must pass
--        the same token check (the round row lock serializes it).
--     4. The public path can never write 'verified' or 'rejected':
--        any client payment_status other than 'pending'/'submitted' is
--        ignored and stored as 'submitted'. Admin verification
--        (is_admin() + RLS UPDATE) remains the only route to
--        'verified', so the referral reward trigger is unchanged.
--     5. An authorized retry may not touch a team that is already
--        'verified' (the admin decision is final).
--
--   UNCHANGED
--     Signature (jsonb in / jsonb out), the full validation chain, the
--     optional referral_code, the active-round resolution, the FOR
--     UPDATE round lock, the window + fee + capacity rules, the
--     idempotent participant rewrite, every existing response field,
--     the referral trigger, RLS and grants. A retry still consumes no
--     new capacity slot.
--
--   NOTE
--     Pre-existing teams have retry_token_hash IS NULL. The raw token
--     was never stored, so there is no secure way to let those rows be
--     retried without a login: they fail closed with the same generic
--     error. No row is deleted or altered by this migration.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

alter table public.teams
  add column if not exists retry_token_hash text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'teams_retry_token_hash_check'
       and conrelid = 'public.teams'::regclass
  ) then
    alter table public.teams
      add constraint teams_retry_token_hash_check
      check (
        retry_token_hash is null
        or retry_token_hash ~ '^[0-9a-f]{64}$'
      );
  end if;
end $$;

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
  v_referral_code text;
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
  v_team_retry_hash text;
  v_team_status   text;
  v_retry_token   text := nullif(btrim(coalesce(payload->>'retry_token', '')), '');
  v_retry_raw     text := null;
  v_retry_hash    text;
  v_is_new_team   boolean := false;
  v_result        jsonb;
  v_p             jsonb;
begin
  /* ── Team fields ── */
  if length(v_name) < 2 then
    raise exception 'TEAM NAME IS REQUIRED.' using errcode = '23514';
  end if;
  if v_college = '' then
    raise exception 'COLLEGE IS REQUIRED.' using errcode = '23514';
  end if;
  /* The public form may only ever ask for review. 'verified' and
     'rejected' are admin decisions: any other client value is ignored
     and stored as 'submitted'. */
  if v_status is null or v_status not in ('pending', 'submitted') then
    v_status := 'submitted';
  end if;
  if v_proof = '' or v_proof !~* '^https?://' then
    raise exception 'PAYMENT PROOF URL IS REQUIRED.' using errcode = '23514';
  end if;

  /* ── Referral code: OPTIONAL. Trimmed + uppercased server-side and
        validated against public.referral_members (exists AND active).
        An invalid or inactive code REJECTS the whole registration here,
        before any team row is written. NULL / missing / empty means the
        legacy behaviour is preserved exactly. Points are NEVER touched
        in this function — the Step-2 verification trigger handles them. ── */
  v_referral_code := nullif(upper(btrim(coalesce(payload->>'referral_code', ''))), '');
  if v_referral_code is not null then
    perform 1
      from public.referral_members
     where referral_code = v_referral_code
       and active = true;
    if not found then
      raise exception 'INVALID REFERRAL CODE.' using errcode = '23503';
    end if;
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

  /* ── Idempotent retries reuse the team registered under this code, but
        only for the caller that owns the retry token issued with that
        team. The lookup and the authorization below run BEFORE any
        write, so an unauthorized retry cannot mutate a single row. ── */
  if v_code is not null then
    select id, retry_token_hash, payment_status
      into v_team_id, v_team_retry_hash, v_team_status
      from public.teams
     where registration_code = v_code
     limit 1;
  end if;

  if v_team_id is not null then
    if v_team_retry_hash is null or v_retry_token is null then
      raise exception 'REGISTRATION RETRY NOT AUTHORIZED.' using errcode = '42501';
    end if;

    v_retry_hash := encode(
      extensions.digest(convert_to(v_retry_token, 'UTF8'), 'sha256'),
      'hex'
    );
    if v_retry_hash <> v_team_retry_hash then
      raise exception 'REGISTRATION RETRY NOT AUTHORIZED.' using errcode = '42501';
    end if;

    /* An admin already verified this team: the decision is final and the
       public path may not rewrite it. */
    if v_team_status = 'verified' then
      raise exception 'REGISTRATION ALREADY VERIFIED.' using errcode = '23514';
    end if;
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
             payment_image_url = v_proof,
             referral_code = coalesce(v_referral_code, referral_code)
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

      v_result := jsonb_build_object(
        'team_id',               v_team_id,
        'registration_code',     v_code,
        'registration_round_id', v_round_id,
        'registration_fee',      v_registration_fee,
        'round_title',           null,
        'payment_status',        v_status,
        'submitted_at',          now()
      );
      return v_result;
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
        v_retry_raw := encode(extensions.gen_random_bytes(32), 'hex');
        begin
          insert into public.teams
            (registration_code, team_name, college, problem_statement_id,
             payment_status, payment_image_url,
             registration_round_id, registration_fee, referral_code,
             retry_token_hash)
          values
            (v_code, v_name, v_college, v_ps,
             v_status, v_proof,
             v_round_id, v_registration_fee, v_referral_code,
             encode(extensions.digest(convert_to(v_retry_raw, 'UTF8'), 'sha256'), 'hex'))
          returning id into v_team_id;
          v_is_new_team := true;
          exit;
        exception when unique_violation then
          v_team_id := null;
          v_retry_raw := null;
        end;
      end loop;
    else
      begin
        v_retry_raw := encode(extensions.gen_random_bytes(32), 'hex');
        insert into public.teams
          (registration_code, team_name, college, problem_statement_id,
           payment_status, payment_image_url,
           registration_round_id, registration_fee, referral_code,
           retry_token_hash)
        values
          (v_code, v_name, v_college, v_ps,
           v_status, v_proof,
           v_round_id, v_registration_fee, v_referral_code,
           encode(extensions.digest(convert_to(v_retry_raw, 'UTF8'), 'sha256'), 'hex'))
        returning id into v_team_id;
        v_is_new_team := true;
      exception when unique_violation then
        /* Another transaction created this code first. Adopting that row
           would be exactly the takeover this migration closes, so the
           winner's retry token is required before anything is touched. */
        v_retry_raw := null;
        select id, retry_token_hash, payment_status
          into v_team_id, v_team_retry_hash, v_team_status
          from public.teams
         where registration_code = v_code
         limit 1;

        if v_team_id is null then
          raise exception 'REGISTRATION CLOSED.' using errcode = '23514';
        end if;
        if v_team_retry_hash is null or v_retry_token is null then
          raise exception 'REGISTRATION RETRY NOT AUTHORIZED.' using errcode = '42501';
        end if;
        v_retry_hash := encode(
          extensions.digest(convert_to(v_retry_token, 'UTF8'), 'sha256'),
          'hex'
        );
        if v_retry_hash <> v_team_retry_hash then
          raise exception 'REGISTRATION RETRY NOT AUTHORIZED.' using errcode = '42501';
        end if;
        if v_team_status = 'verified' then
          raise exception 'REGISTRATION ALREADY VERIFIED.' using errcode = '23514';
        end if;
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
           registration_fee = v_registration_fee,
           referral_code = coalesce(v_referral_code, referral_code)
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

  v_result := jsonb_build_object(
    'team_id',               v_team_id,
    'registration_code',     v_code,
    'registration_round_id', v_round_id,
    'registration_fee',      v_registration_fee,
    'round_title',           v_round.title,
    'payment_status',        v_status,
    'submitted_at',          now()
  );

  /* The raw retry token leaves the database exactly once, on the
     response that created the team. A retry never re-issues it. */
  if v_is_new_team then
    v_result := v_result || jsonb_build_object('retry_token', v_retry_raw);
  end if;

  return v_result;
end;
$$;

revoke all on function public.register_team(jsonb) from public;
grant execute on function public.register_team(jsonb) to anon, authenticated;

comment on function public.register_team(jsonb) is
  'HACK2PITCH 2026 canonical registration submit (FINAL RULES + secure retries). SECURITY DEFINER: validates the team + crew (3 to 4 participants, exactly one lead), accepts an OPTIONAL problem_statement_id and an OPTIONAL referral_code, resolves the ACTIVE round, enforces dates + team capacity with a row lock (round auto-closes at capacity), computes the AUTHORITATIVE fee from the active round and the participant count (the client fee is ignored), stamps registration_round_id + registration_fee, and rewrites participants — all in ONE transaction. NEW teams receive a 256-bit retry token once (retry_token) of which only the SHA-256 hash is stored in teams.retry_token_hash. An update of an existing team (including a lost-response retry or a concurrent code collision) requires that exact retry token together with the registration_code and otherwise fails with the generic REGISTRATION RETRY NOT AUTHORIZED. error without mutating anything. The public path can only store payment_status pending/submitted: verified and rejected are admin-only decisions.';

notify pgrst, 'reload schema';

commit;
