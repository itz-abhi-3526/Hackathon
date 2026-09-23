-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Leaderboard sync honours qualification cut-offs
--   Fixes the public scoreboard publishing EVERY judged team even after
--   an elimination cut has been run:
--
--     • After "QUALIFY TOP 20 FOR ROUND 2" only those 20 may appear.
--     • After "QUALIFY TOP 8 FOR FINAL"  only those 8  may appear.
--     • Winners/finalists stay visible; manual (curated) rows without a
--       team_id are never touched.
--
--   The rule: a team is ON the board iff its DEEPEST qualification
--   record is 'qualified' or 'winner'. A team with no qualification
--   record yet (Round 1 not yet cut) stays visible.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

create or replace function public.leaderboard_sync_cumulative()
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

  -- Active pool = teams still "in" the tournament.
  --   • A team drops out the moment its deepest qualification record is
  --     'eliminated' (e.g. the 21st team after the top-20 cut, or the
  --     Round-2 qualifiers that missed the top-8 Final cut).
  --   • Teams scored in Round 1 but never yet processed by a cut have no
  --     qualification record and stay visible.
  --   • 'qualified' and 'winner' both keep a team on the board.
  create temp table active_pool on commit drop as
    select jtrt.team_id
      from public.judging_team_round_totals jtrt
      join public.judging_rounds jr on jr.id = jtrt.judging_round_id
     where jr.stage is not null
     group by jtrt.team_id
    except
    select ds.team_id
      from (
        select distinct on (st.team_id) st.team_id, st.status
          from public.judging_team_stage_status st
         where st.stage = any (array['round_2', 'final'])
         order by st.team_id, (st.stage = 'final') desc, st.updated_at desc
      ) ds
     where ds.status = 'eliminated';

  for r in
    select
      a.team_id                             as team_id,
      t.team_name                           as team_name,
      coalesce(sum(jtrt.total_score), 0)::numeric(14,2) as cumulative
    from active_pool a
    join public.judging_team_round_totals jtrt on jtrt.team_id = a.team_id
    join public.judging_rounds           jr   on jr.id        = jtrt.judging_round_id
    join public.teams                    t    on t.id         = a.team_id
   where jr.stage is not null
   group by a.team_id, t.team_name
   order by cumulative desc
  loop
    v_score := least(2147483647, greatest(0, round(r.cumulative, 0)))::integer;

    insert into public.leaderboard (team_name, team_id, score)
    values (r.team_name, r.team_id, v_score)
    on conflict (team_name) do update set
      team_id    = excluded.team_id,
      score      = excluded.score,
      updated_at = now();

    v_count := v_count + 1;
  end loop;

  -- Sweep rows that fell out of the active pool (previously published
  -- eliminated teams). Manual/curated entries without a team_id survive.
  delete from public.leaderboard lb
   where lb.team_id is not null
     and not exists (select 1 from active_pool a where a.team_id = lb.team_id);

  return v_count;
end;
$$;

revoke all on function public.leaderboard_sync_cumulative() from public;
grant execute on function public.leaderboard_sync_cumulative() to authenticated;

comment on function public.leaderboard_sync_cumulative() is
  'Admin-only "UPDATE MAIN LEADERBOARD": publishes cumulative scores (Round 1 + Round 2 + Final) for the ACTIVE pool only — teams whose deepest qualification record is qualified/winner. Eliminated teams are removed from the board.';

notify pgrst, 'reload schema';

commit;