-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Atomic registration submit + RLS hardening
--   (supersedes 20260910000000 / 20260911000000 on live projects)
--
--   Data model (the ONLY tables — no registrations / team_members /
--   payments / hackathons compatibility tables):
--
--     problem_statements            ← public readable challenge arena
--        ↓
--      teams                        ← one row per registration
--        ↓
--   participants                    ← one row per team member
--
--   Security model:
--     • RLS ENABLED on all three tables.
--     • Anonymous clients may ONLY:
--         - SELECT problem_statements    (public challenges)
--         - EXECUTE submit_registration  (the single atomic write)
--       There is NO anonymous INSERT/UPDATE/SELECT on teams or
--       participants — a partially-saved registration cannot exist.
--     • Admin (authenticated) role reads everything and updates
--       payment_status.
--
--   The tables in this file match the ACTUAL live schema (teams has
--   NO hackathon_id column — unlike the older migrations which
--   UNCONDITIONALLY referenced it and therefore failed on real data).
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. Ensure the canonical tables exist (idempotent) ──────────────
--    Constraints are intentionally kept loose to match existing rows;
--    the RPC below is the real validator.

create table if not exists public.problem_statements (
  id uuid primary key default gen_random_uuid(),
  track text not null,
  title text not null,
  description text not null,
  difficulty text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  registration_code text not null unique,
  team_name text not null,
  college text not null,
  problem_statement_id uuid references public.problem_statements(id),
  payment_status text not null default 'pending',
  payment_image_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  food_preference text not null,
  role text not null,
  created_at timestamptz not null default now()
);

create index if not exists participants_team_id_idx
  on public.participants (team_id);
create index if not exists teams_registration_code_idx
  on public.teams (registration_code);
create index if not exists teams_problem_statement_id_idx
  on public.teams (problem_statement_id);

-- ── 2. Row Level Security ──────────────────────────────────────────

alter table public.problem_statements enable row level security;
alter table public.teams enable row level security;
alter table public.participants enable row level security;

-- problem_statements: public read (the arena users pick from).
drop policy if exists "ps_public_select" on public.problem_statements;
create policy "ps_public_select"
  on public.problem_statements for select using (true);

-- teams / participants: REMOVE any anonymous write/read policies that
-- older migrations may have installed. Anon has NO direct table access
-- here — registration happens only through submit_registration.
drop policy if exists "teams_public_insert" on public.teams;
drop policy if exists "teams_public_update" on public.teams;
drop policy if exists "teams_public_select" on public.teams;
drop policy if exists "participants_public_insert" on public.participants;
drop policy if exists "participants_public_select" on public.participants;

-- Admin (authenticated) reads everything and verifies payments.
drop policy if exists "ps_auth_select" on public.problem_statements;
create policy "ps_auth_select"
  on public.problem_statements for select using (auth.role() = 'authenticated');

drop policy if exists "teams_auth_select" on public.teams;
create policy "teams_auth_select"
  on public.teams for select using (auth.role() = 'authenticated');

drop policy if exists "teams_auth_update" on public.teams;
create policy "teams_auth_update"
  on public.teams for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');

drop policy if exists "participants_auth_select" on public.participants;
create policy "participants_auth_select"
  on public.participants for select using (auth.role() = 'authenticated');

-- ── 3. submit_registration — the ONLY anonymous write ───────────────
--    SECURITY DEFINER: performs the whole team + participants +
--    payment write in ONE transaction. Idempotent: passing the same
--    registration_code (or team_id) updates the existing entry instead
--    of creating a duplicate. Returns the accepted code that the
--    browser shows on the issued pass.

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

  /* ── Team: reuse the same entry on retry, else create. ──
       Idempotency key order: registration_code, then team_id. Both are
       optional so a fresh submit creates a brand-new entry. */
  v_code := nullif(trim(both from coalesce(payload->>'registration_code', '')), '');

  if v_code is not null then
    update public.teams
       set team_name = v_name,
           college = v_college,
           problem_statement_id = v_ps,
           payment_status = v_status,
           payment_image_url = v_proof
     where registration_code = v_code
    returning id into v_team_id;
  end if;

  if v_team_id is null
     and nullif(trim(both from coalesce(payload->>'team_id', '')), '') is not null
  then
    begin
      v_team_id := (payload->>'team_id')::uuid;
    exception when invalid_text_representation then
      v_team_id := null;
    end;
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
        v_code := null;
      end if;
    end if;
  end if;

  if v_team_id is null then
    if v_code is null then
      loop
        v_code := 'VH-2026-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        begin
          insert into public.teams
            (registration_code, team_name, college,
             problem_statement_id, payment_status, payment_image_url)
          values
            (v_code, v_name, v_college,
             v_ps, v_status, v_proof)
          returning id into v_team_id;
          exit;
        exception when unique_violation then
          v_team_id := null;
        end;
      end loop;
    else
      insert into public.teams
        (registration_code, team_name, college,
         problem_statement_id, payment_status, payment_image_url)
      values
        (v_code, v_name, v_college,
         v_ps, v_status, v_proof)
      returning id into v_team_id;
    end if;
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
  'Atomic VOIDHACK 2026 registration submit. SECURITY DEFINER: validates the team + crew, enforces exactly one lead, upserts the team (idempotent on registration_code/team_id) and rewrites participants in one transaction, returning team_id + registration_code.';