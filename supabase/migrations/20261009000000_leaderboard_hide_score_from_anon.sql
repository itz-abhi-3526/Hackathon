-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Public scoreboard: actually hide the score
--
--   Fixes 20261007000000, which did NOT lock anything.
--
--   That migration used
--       revoke select (score) on table public.leaderboard from anon;
--   and PostgreSQL treats a column-level ACL as a fallback only:
--   when a role already holds a TABLE-level grant, the column entry
--   is never consulted, and the table grant still wins. anon kept
--   its full table grant (relacl contained anon=arwdDxtm/postgres),
--   so the column ACL stayed empty, has_column_privilege('anon',
--   'public.leaderboard', 'score', 'SELECT') stayed true, and the
--   REST API went on serving the score column.
--
--   The only correct order is: drop the table grant, THEN re-grant
--   the individual columns the public board is allowed to read.
--
--   The admin panel is untouched. admin_judging_leaderboard is a
--   security_invoker view over teams / judging_team_round_totals /
--   judging_team_stage_status and never reads this table, the
--   authenticated role keeps its full table grant, and
--   leaderboard_sync_cumulative is SECURITY DEFINER (postgres).
--
--   Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;
-- ─── 1. DROP THE TABLE-LEVEL GRANT THAT OVERRODE THE COLUMN ACL ──
revoke all on table public.leaderboard from anon;
revoke all on table public.leaderboard from public;
-- ─── 2. RE-GRANT ONLY WHAT THE PUBLIC BOARD MAY SEE ──────────────
grant select (id, team_name) on table public.leaderboard to anon;
-- ─── 3. SELF-CHECK — fail loudly instead of shipping a no-op ────
do $$
begin
  if has_column_privilege('anon', 'public.leaderboard', 'score', 'SELECT') then
    raise exception
      'anon can still SELECT public.leaderboard.score — the table-level grant was not dropped';
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
