-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Live leaderboard (additive)
--   New standalone table for the event's live scoreboard, managed from
--   the Control Center:
--
--     leaderboard
--       id          uuid PK
--       team_name   text UNIQUE (one row per team on the board)
--       score       integer (>= 0) — rank is ORDERED, never stored
--       created_at  timestamptz
--       updated_at  timestamptz (auto-bumped by trigger)
--
--   Rank is computed from ordering (score DESC, created_at ASC) so it
--   can never drift from the real order — there is no rank column.
--
--   SECURITY
--     • RLS ON. Public may SELECT (the board is broadcast to everyone).
--     • All writes (INSERT / UPDATE / DELETE) require an authenticated
--       session AND public.is_admin() — the same gate used by teams,
--       participants and registration_rounds.
--     • leaderboard_adjust_score(uuid, integer) — SECURITY DEFINER RPC
--       that atomically bumps a score by a delta, clamped at 0. Used by
--       the + / − controls so two clicks can never race.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  team_name text not null unique,
  score integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leaderboard_score_non_negative check (score >= 0)
);

create index if not exists leaderboard_score_idx
  on public.leaderboard (score desc);

alter table public.leaderboard enable row level security;

-- Public read — the scoreboard is a broadcast surface.
drop policy if exists "leaderboard_public_select" on public.leaderboard;
create policy "leaderboard_public_select"
  on public.leaderboard for select using (true);

-- Admin (authenticated + allowlist) — reads and every write op.
drop policy if exists "leaderboard_auth_select" on public.leaderboard;
create policy "leaderboard_auth_select"
  on public.leaderboard for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "leaderboard_auth_insert" on public.leaderboard;
create policy "leaderboard_auth_insert"
  on public.leaderboard for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "leaderboard_auth_update" on public.leaderboard;
create policy "leaderboard_auth_update"
  on public.leaderboard for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "leaderboard_auth_delete" on public.leaderboard;
create policy "leaderboard_auth_delete"
  on public.leaderboard for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- Auto-bump updated_at on every write so the board shows fresh state.
create or replace function public.touch_leaderboard_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leaderboard_touch_updated_at
  on public.leaderboard;
create trigger trg_leaderboard_touch_updated_at
  before update on public.leaderboard
  for each row execute function public.touch_leaderboard_updated_at();

-- Atomic + / − adjust with a server-side floor of 0. SECURITY DEFINER
-- so the RPC runs owner-privileged while STILL checking the admin
-- allowlist. Exact-score writes go through PostgREST (RLS-gated); this
-- RPC exists only for the increment controls so concurrent clicks never
-- lose an adjustment.
create or replace function public.leaderboard_adjust_score(p_id uuid, p_delta integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_score integer;
begin
  if not public.is_admin() then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;
  if p_delta is null or p_delta = 0 then
    raise exception 'INVALID SCORE ADJUSTMENT.' using errcode = '23514';
  end if;

  update public.leaderboard
     set score = greatest(0, score + p_delta)
   where id = p_id
  returning score into v_score;

  if not found then
    raise exception 'LEADERBOARD TEAM NOT FOUND.' using errcode = '23503';
  end if;

  return v_score;
end;
$$;

revoke all on function public.leaderboard_adjust_score(uuid, integer) from public;
grant execute on function public.leaderboard_adjust_score(uuid, integer) to authenticated;

comment on table public.leaderboard is
  'VOIDHACK 2026 live leaderboard. One row per participating team; rank is ordering by score DESC then created_at ASC, never stored.';

comment on function public.leaderboard_adjust_score(uuid, integer) is
  'Admin-only, atomic score adjustment for the leaderboard +/− controls. Clamps the score at 0 and returns the new value.';

notify pgrst, 'reload schema';

commit;