-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Registration data model (idempotent, data only)
--
--   problem_statements
--        ↓
--      teams            ← one row per registration
--        ↓
--   participants        ← one row per team member
--
--   The team record IS the registration. Payment is a field pair on
--   teams (payment_status + payment_image_url). There are NO other
--   tables and no compatibility tables.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ── problem_statements ──
create table if not exists public.problem_statements (
  id uuid primary key default gen_random_uuid(),
  track text not null,
  title text not null,
  description text not null,
  difficulty text not null
    check (difficulty in ('Beginner', 'Intermediate', 'Advanced')),
  created_at timestamptz not null default now()
);

-- ── teams ──
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  hackathon_id text not null default 'voidhack-2026',
  registration_code text not null unique,
  team_name text not null,
  college text not null,
  problem_statement_id uuid references public.problem_statements(id),
  payment_status text not null default 'pending'
    check (payment_status in ('pending', 'submitted', 'verified', 'rejected')),
  payment_image_url text,
  created_at timestamptz not null default now()
);

-- teams.hackathon_id — idempotent backfill for databases created before
-- this column existed. Every registration must belong to the single
-- active HACK2PITCH edition so reads/writes never depend on a slug lookup.
alter table if exists public.teams add column if not exists hackathon_id text;
update public.teams set hackathon_id = 'voidhack-2026' where hackathon_id is null;
alter table if exists public.teams alter column hackathon_id set default 'voidhack-2026';
alter table if exists public.teams alter column hackathon_id set not null;

-- ── participants ──
create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text not null,
  food_preference text not null
    check (food_preference in ('Veg', 'Non-Veg')),
  role text not null
    check (role in ('lead', 'member')),
  created_at timestamptz not null default now()
);

create index if not exists participants_team_id_idx
  on public.participants (team_id);

create index if not exists teams_problem_statement_id_idx
  on public.teams (problem_statement_id);

-- ── Row Level Security ──
alter table public.problem_statements enable row level security;
alter table public.teams enable row level security;
alter table public.participants enable row level security;

-- Public (anonymous): read problems, submit a team, submit participants.
drop policy if exists "ps_public_select" on public.problem_statements;
create policy "ps_public_select"
  on public.problem_statements for select using (true);

drop policy if exists "teams_public_insert" on public.teams;
create policy "teams_public_insert"
  on public.teams for insert with check (true);

drop policy if exists "participants_public_insert" on public.participants;
create policy "participants_public_insert"
  on public.participants for insert with check (true);

-- Authenticated / admin: read everything, verify payments.
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

-- ── Seed the six problem statements ──
insert into public.problem_statements (track, title, description, difficulty)
select 'FINTECH', 'The Invisible Fraud Problem',
       'Build intelligent systems that detect and prevent financial fraud in real-time, protecting millions of transactions from sophisticated attack vectors.',
       'Advanced'
where not exists (select 1 from public.problem_statements where track = 'FINTECH');

insert into public.problem_statements (track, title, description, difficulty)
select 'HEALTH', 'Bridging The Rural Health Divide',
       'Design accessible health monitoring solutions for underserved communities using limited hardware and intermittent connectivity.',
       'Advanced'
where not exists (select 1 from public.problem_statements where track = 'HEALTH');

insert into public.problem_statements (track, title, description, difficulty)
select 'CLIMATE', 'Carbon Intelligence Platform',
       'Create tools that help organizations measure, track, and reduce their carbon footprint through actionable data visualization and predictive analytics.',
       'Intermediate'
where not exists (select 1 from public.problem_statements where track = 'CLIMATE');

insert into public.problem_statements (track, title, description, difficulty)
select 'SECURITY', 'Zero-Trust For The Rest Of Us',
       'Democratize enterprise-grade security for small businesses through intuitive, affordable zero-trust architecture solutions.',
       'Advanced'
where not exists (select 1 from public.problem_statements where track = 'SECURITY');

insert into public.problem_statements (track, title, description, difficulty)
select 'EDUCATION', 'The Adaptive Learning Engine',
       'Build personalized learning systems that adapt to individual student progress, learning style, and knowledge gaps in real-time.',
       'Intermediate'
where not exists (select 1 from public.problem_statements where track = 'EDUCATION');

insert into public.problem_statements (track, title, description, difficulty)
select 'LOGISTICS', 'Supply Chain Resilience Engine',
       'Develop predictive systems that identify supply chain vulnerabilities and suggest resilient alternatives before disruptions occur.',
       'Advanced'
where not exists (select 1 from public.problem_statements where track = 'LOGISTICS');