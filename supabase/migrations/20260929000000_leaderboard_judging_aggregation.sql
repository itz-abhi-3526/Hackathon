-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Leaderboard ↔ judging aggregation
--   (additive on top of 20260922000000_judging_system.sql,
--    20260927000000_judging_snapshots_and_judge_auth.sql and
--    20260928000000_judging_totals_and_read_models.sql)
--
--   Takes the stored evaluation scores (judge_evaluations, live-totaled
--   per team × round in judging_team_round_totals) and aggregates them
--   INTO THE LEADERBOARD, separated by round, without flattening any
--   judge/criterion detail:
--
--     1. leaderboard_round_results — a security_invoker VIEW (read model,
--        not a table) that shows every scored team, separated by round,
--        with the raw total, the round's weight multiplier and the
--        weighted contribution, the score_possible ceiling and how many
--        judges / criteria entries fed the total. The individual
--        judge × criterion rows stay authoritative in judge_evaluations
--        and are still retrievable via judging_evaluation_rows, so this
--        view never duplicates detail — it only rolls it up per round.
--
--     2. leaderboard_sync_from_judgings(uuid) — an admin-only, SECURITY
--        DEFINER RPC that publishes the judged aggregates onto the LIVE
--        leaderboard table (the public broadcast board):
--          • p_round NULL      → combined standings: per team, sum of
--                                (total_score × round.weight) across all
--                                non-draft rounds, rounded to a whole
--                                number and clamped to [0, 2147483647].
--          • p_round = <uuid>  → that round alone, published UNWEIGHTED
--                                (raw totals) so a single-round board
--                                shows the actual marks of that round.
--        Draft rounds never count. Rows are upserted by team name (the
--        leaderboard's existing unique key) so a team judged without a
--        board row gets one, and a team already bridged to a registered
--        team gets linked via team_id. Manual entries are untouched.
--
--   SECURITY
--     • The view is security_invoker: admins and judges see it through
--       the judging tables' RLS; the public never sees raw per-round
--       numbers (the flat board totals remain the public broadcast
--       surface via leaderboard's existing RLS).
--     • The RPC runs owner-privileged but self-gates on public.is_admin()
--       — the same allowlist gate as leaderboard_adjust_score.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ─── 1. ROUND-SEPARATED READ MODEL (view, not a table) ──────────
-- One row per scored (team × round): raw total, weight, weighted
-- contribution, possible ceiling, entry/judge/criterion counts. The
-- individual judge × criterion detail lives on in judge_evaluations /
-- judging_evaluation_rows — this view only rolls it up.
create or replace view public.leaderboard_round_results
with (security_invoker = true) as
select
  jtrt.judging_round_id                     as judging_round_id,
  jr.title                                  as round_title,
  jr.status                                 as round_status,
  jr.weight                                 as round_weight,
  jtrt.team_id                              as team_id,
  t.team_name                               as team_name,
  t.registration_code                       as registration_code,
  jtrt.total_score                          as raw_score,
  round((jtrt.total_score * jr.weight), 2)  as weighted_score,
  jtrt.score_possible                       as score_possible,
  jtrt.entries_count                        as entries_count,
  (select count(distinct je.judge_id)::integer
     from public.judge_evaluations je
    where je.judging_round_id = jtrt.judging_round_id
      and je.team_id = jtrt.team_id)        as judges_count,
  (select count(distinct je.evaluation_criteria_id)::integer
     from public.judge_evaluations je
    where je.judging_round_id = jtrt.judging_round_id
      and je.team_id = jtrt.team_id
      and je.evaluation_criteria_id is not null)
  + (select count(*)::integer
     from public.judge_evaluations je
    where je.judging_round_id = jtrt.judging_round_id
      and je.team_id = jtrt.team_id
      and je.evaluation_criteria_id is null) as criteria_count,
  jtrt.updated_at                           as last_scored_at
from public.judging_team_round_totals jtrt
join public.judging_rounds            jr on jr.id = jtrt.judging_round_id
join public.teams                     t  on t.id  = jtrt.team_id;

-- ─── 2. PUBLISH AGGREGATES ONTO THE LIVE BOARD ─────────────────
-- Admin-only. NULL p_round → combined, weight-multiplied standings
-- across every non-draft round. A specific p_round → that round's raw
-- totals (a standalone round board). Scores are rounded to whole
-- numbers and clamped to the INTEGER column range; upsert is keyed on
-- leaderboard.team_name (the existing UNIQUE key) so judged teams get a
-- board row and manual/curated entries update in place.
create or replace function public.leaderboard_sync_from_judgings(p_round uuid default null)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_score integer;
  r record;
begin
  if not public.is_admin() then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;

  for r in
    select
      jtrt.team_id            as team_id,
      t.team_name             as team_name,
      coalesce(sum(
        case
          when p_round is null then jtrt.total_score * jr.weight
          else jtrt.total_score
        end
      ), 0)::numeric(14,2)    as combined
    from public.judging_team_round_totals jtrt
    join public.judging_rounds  jr on jr.id = jtrt.judging_round_id
    join public.teams           t  on t.id  = jtrt.team_id
   where (p_round is null or jtrt.judging_round_id = p_round)
     and jr.status <> 'draft'
   group by jtrt.team_id, t.team_name
   order by combined desc
  loop
    v_score := least(
      2147483647,
      greatest(0, round(r.combined, 0))
    )::integer;

    insert into public.leaderboard (team_name, team_id, score)
    values (r.team_name, r.team_id, v_score)
    on conflict (team_name) do update set
      team_id    = excluded.team_id,
      score      = excluded.score,
      updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.leaderboard_sync_from_judgings(uuid) from public;
grant execute on function public.leaderboard_sync_from_judgings(uuid) to authenticated;

-- ─── 3. COMMENTS ────────────────────────────────────────────────

comment on view public.leaderboard_round_results is
  'Round-separated leaderboard aggregates (team × round) rolled up from judge_evaluations via judging_team_round_totals. Individual judge/criterion detail stays in judging_evaluation_rows; no detail is flattened here.';

comment on column public.leaderboard_round_results.weighted_score is
  'raw_score × round weight — the contribution this round would make to the combined leaderboard total.';

comment on function public.leaderboard_sync_from_judgings(uuid) is
  'Admin-only: publishes judged aggregates onto the leaderboard. NULL p_round publishes the weight-multiplied combined standings across all non-draft rounds; a specific p_round publishes that round''s raw totals. Returns the number of leaderboard rows written.';

-- ─── DONE ───────────────────────────────────────────────────────

notify pgrst, 'reload schema';

commit;