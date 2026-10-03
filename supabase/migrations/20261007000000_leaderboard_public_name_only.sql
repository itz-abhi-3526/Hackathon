-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Public scoreboard becomes name-only
--   Scores stay visible ONLY in the admin panel; the public leaderboard
--   shows rank + team name.
--
--     1. Revoke anon's SELECT on leaderboard.score (column privilege).
--        The judging-based admin board reads admin_judging_leaderboard,
--        so admins keep full scores via their own tables — untouched.
--     2. Add leaderboard_public_board() — a SECURITY DEFINER RPC that
--        returns ONLY team names, ordered by score DESC / created_at ASC.
--        PostgREST cannot ORDER BY a column anon can no longer read, so
--        the ordering runs inside the definer RPC.
--     3. Drop leaderboard from the realtime publication. Realtime streams
--        the full WAL row (including score) to subscribers, which would
--        defeat the lock; the public UI polls instead.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

-- ─── 1. LOCK THE SCORE COLUMN FROM ANONYMOUS READERS ────────────
revoke select (score) on table public.leaderboard from anon;
revoke select (score) on table public.leaderboard from public;

-- ─── 2. PUBLIC FEED — NAME ONLY, SERVER-ORDERED ─────────────────
create or replace function public.leaderboard_public_board()
returns table (team_name text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select lb.team_name
    from public.leaderboard lb
   order by lb.score desc, lb.created_at asc;
$$;

revoke all on function public.leaderboard_public_board() from public;
grant execute on function public.leaderboard_public_board() to anon;

comment on function public.leaderboard_public_board() is
  'Anonymous name-only leaderboard feed. Returns team names in rank order (score DESC, created_at ASC) without ever exposing the score column.';

-- ─── 3. STOP STREAMING THE SCORE VIA REALTIME ───────────────────
-- Realtime sends the full row; column privileges are not a reliable
-- filter at the stream level, so the broadcast table leaves the
-- publication. The public board stays live via its poll interval.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'leaderboard'
  ) then
    alter publication supabase_realtime drop table public.leaderboard;
  end if;
end $$;

notify pgrst, 'reload schema';

commit;