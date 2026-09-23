/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Atomic registration submission
   Additive on top of 20260910000000_setup_registration_flow.sql.
   Nothing is dropped, renamed or relaxed; RLS stays enabled for every
   table and NO blanket policy is added. This migration only adds ONE
   SECURITY DEFINER function that performs the entire submit in a
   single transaction:

     • validates team_name / college / problem statement / proof URL
     • validates every participant (name, email, phone, food, role)
     • enforces EXACTLY ONE 'lead' per team
     • reuses the caller's team_id when supplied (safe retry) or
       creates a new team with a server-generated unique code
     • rewrites the team's participants to exactly the submitted crew
     • returns { team_id, registration_code, payment_status, submitted_at }

   Anonymous clients may ONLY execute this function; the existing table
   policies are untouched.

   Run in the Supabase SQL Editor. Safe to re-run.
   ═══════════════════════════════════════════════════════════════ */

-- ── Idempotent reconcile: teams.hackathon_id (same statements as the
--    setup migration, repeated so this file works on a partially
--    migrated database too). ──
alter table if exists public.teams add column if not exists hackathon_id text;
update public.teams set hackathon_id = 'voidhack-2026' where hackathon_id is null;
alter table if exists public.teams alter column hackathon_id set default 'voidhack-2026';
alter table if exists public.teams alter column hackathon_id set not null;

create or replace function public.submit_registration(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_team_id      uuid;
  v_code         text;
  v_name         text := trim(both from coalesce(payload->>'team_name', ''));
  v_college      text := trim(both from coalesce(payload->>'college', ''));
  v_proof        text := trim(both from coalesce(payload->>'payment_image_url', ''));
  v_status       text := coalesce(nullif(trim(both from payload->>'payment_status'), ''), 'submitted');
  v_ps_text      text := nullif(trim(both from coalesce(payload->>'problem_statement_id', '')), '');
  v_ps           uuid;
  v_participants jsonb := coalesce(payload->'participants', '[]'::jsonb);
  v_count        integer := 0;
  v_leads        integer := 0;
  v_dummy        integer;
  v_p            jsonb;
begin
  /* ── Team fields ── */
  if length(v_name) < 2 then
    raise exception 'TEAM NAME IS REQUIRED.' using errcode = '23514';
  end if;
  if v_college = '' then
    raise exception 'COLLEGE IS REQUIRED.' using errcode = '23514';
  end if;
  if v_status not in ('pending', 'submitted', 'verified', 'rejected') then
    raise exception 'INVALID PAYMENT STATUS.' using errcode = '23514';
  end if;
  if v_proof = '' or v_proof !~* '^https?://' then
    raise exception 'PAYMENT PROOF URL IS REQUIRED.' using errcode = '23514';
  end if;

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

  /* ── Participants ── */
  if jsonb_typeof(v_participants) <> 'array' then
    raise exception 'PARTICIPANTS MUST BE A LIST.' using errcode = '23514';
  end if;

  for v_p in select value from jsonb_array_elements(v_participants)
  loop
    v_count := v_count + 1;

    if trim(both from coalesce(v_p->>'full_name', '')) = '' then
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

  /* ── Team: reuse the supplied id when it exists, else create. ── */
  if nullif(trim(both from coalesce(payload->>'team_id', '')), '') is not null then
    begin
      v_team_id := (payload->>'team_id')::uuid;
    exception when invalid_text_representation then
      v_team_id := null;
    end;
  end if;

  if v_team_id is not null then
    update public.teams
       set team_name = v_name,
           college = v_college,
           problem_statement_id = v_ps,
           payment_status = v_status,
           payment_image_url = v_proof
     where id = v_team_id
    returning registration_code into v_code;
    if not found then
      v_team_id := null;  -- stale id from the client — create fresh
    end if;
  end if;

  if v_team_id is null then
    loop
      v_code := 'VH-2026-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
      begin
        insert into public.teams
          (hackathon_id, registration_code, team_name, college,
           problem_statement_id, payment_status, payment_image_url)
        values
          ('voidhack-2026', v_code, v_name, v_college,
           v_ps, v_status, v_proof)
        returning id into v_team_id;
        exit;
      exception when unique_violation then
        v_team_id := null;
      end;
    end loop;
  end if;

  /* ── Participants: rewrite to exactly the submitted crew. ── */
  delete from public.participants where team_id = v_team_id;

  for v_p in select value from jsonb_array_elements(v_participants)
  loop
    insert into public.participants
      (team_id, full_name, email, phone, food_preference, role)
    values
      (v_team_id,
       trim(both from v_p->>'full_name'),
       lower(trim(both from v_p->>'email')),
       trim(both from v_p->>'phone'),
       v_p->>'food_preference',
       case when v_p->>'role' in ('lead', 'team_lead') then 'lead' else 'member' end);
  end loop;

  return jsonb_build_object(
    'team_id', v_team_id,
    'registration_code', v_code,
    'payment_status', v_status,
    'submitted_at', now()
  );
end;
$$;

revoke all on function public.submit_registration(jsonb) from public;
grant execute on function public.submit_registration(jsonb) to anon, authenticated;

comment on function public.submit_registration(jsonb) is
  'Atomic HACK2PITCH 2026 registration submit. SECURITY DEFINER: validates the team + crew, enforces exactly one lead, upserts the team and rewrites participants in one transaction, returning team_id + registration_code.';
