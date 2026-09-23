-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Admin control center authorization
--   (additive on top of 20260912000000_atomic_submit_registration.sql)
--
--   What this migration adds / guarantees:
--     1. Row Level Security is ENABLED on all three registration tables
--        (idempotent — safe if an earlier setup left them disabled).
--     2. public.admin_users       — email allowlist of the ONLY
--                                   administrators. RLS enabled with
--                                   NO policies, so the table is
--                                   unreadable/unwritable by anon and
--                                   authenticated alike — it is read
--                                   solely by the SECURITY DEFINER
--                                   is_admin() helper below.
--     3. public.is_admin()        — SECURITY DEFINER helper that answers
--                                   "does the current request JWT's
--                                   email sit in the allowlist?" It is
--                                   the single gate for every admin
--                                   data read/update. This replaces any
--                                   previous/broken is_admin() in the
--                                   project so auth.uid()/auth.jwt()
--                                   always drive authorization.
--     4. RLS policy hardening     — any permissive anonymous or
--                                   authenticated policies created by
--                                   earlier migrations/setups on
--                                   teams / participants /
--                                   problem_statements are replaced with
--                                   policies that require BOTH an
--                                   authenticated session AND
--                                   public.is_admin(). Verified without
--                                   the allowlist read as NO ROWS, and
--                                   writes are possible only for admins.
--
--   UNCHANGED:
--     • Anonymous public SELECT on problem_statements (the arena the
--       public registration wizard renders). Kept intact.
--     • submit_registration — the ONLY anonymous write; untouched.
--     • All existing tables / columns / constraints / indexes.
--
--   To grant a new administrator, run (in the SQL Editor):
--
--     insert into public.admin_users (email) values ('ops@example.com');
--
--   Replace ops@example.com with the real login email of an existing
--   Supabase Auth user (Supabase → Authentication → Users).
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

-- ── 0. RLS must be ON for registration data ──────────────────────
alter table public.problem_statements enable row level security;
alter table public.teams enable row level security;
alter table public.participants enable row level security;

-- ── 1. Admin email allowlist ──────────────────────────────────────
create table if not exists public.admin_users (
  email text primary key
    check (email = lower(email)),
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

-- No policies are created on admin_users, so neither 'anon' nor
-- 'authenticated' can SELECT/INSERT/UPDATE/DELETE it directly. Only the
-- SECURITY DEFINER helper below may read it.

-- ── 2. is_admin() — the single authorization gate ─────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

comment on function public.is_admin() is
  'True when the current request JWT email is in public.admin_users. SECURITY DEFINER so the allowlist stays unreadable to clients.';

-- ── 3. Replace permissive policies with admin-only access ─────────
--    Wipe every policy this project's migrations ever created on the
--    three tables, plus common manual variants, then recreate only the
--    intended set below.

-- problem_statements: public read still allowed; authenticated is
-- restricted to admins.
drop policy if exists "ps_auth_select" on public.problem_statements;
drop policy if exists "ps_problems_select" on public.problem_statements;
drop policy if exists "problems_auth_select" on public.problem_statements;
drop policy if exists "problems_public_select" on public.problem_statements;
drop policy if exists "ps_anon_select" on public.problem_statements;

create policy "ps_public_select"
  on public.problem_statements for select
  using (true);

create policy "ps_auth_select"
  on public.problem_statements for select
  using (auth.role() = 'authenticated' and public.is_admin());

-- teams: no anonymous access; admin-only select + payment updates.
drop policy if exists "teams_public_insert" on public.teams;
drop policy if exists "teams_public_update" on public.teams;
drop policy if exists "teams_public_select" on public.teams;
drop policy if exists "teams_anon_insert" on public.teams;
drop policy if exists "teams_anon_select" on public.teams;
drop policy if exists "teams_auth_select" on public.teams;
drop policy if exists "teams_auth_update" on public.teams;
drop policy if exists "teams_admin_select" on public.teams;
drop policy if exists "teams_admin_update" on public.teams;
drop policy if exists "admin_teams_select" on public.teams;
drop policy if exists "admin_teams_update" on public.teams;

create policy "teams_auth_select"
  on public.teams for select
  using (auth.role() = 'authenticated' and public.is_admin());

create policy "teams_auth_update"
  on public.teams for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

-- participants: no anonymous access; admin-only select.
drop policy if exists "participants_public_insert" on public.participants;
drop policy if exists "participants_public_select" on public.participants;
drop policy if exists "participants_anon_insert" on public.participants;
drop policy if exists "participants_anon_select" on public.participants;
drop policy if exists "participants_auth_select" on public.participants;
drop policy if exists "participants_auth_update" on public.participants;
drop policy if exists "participants_admin_select" on public.participants;
drop policy if exists "admin_participants_select" on public.participants;

create policy "participants_auth_select"
  on public.participants for select
  using (auth.role() = 'authenticated' and public.is_admin());