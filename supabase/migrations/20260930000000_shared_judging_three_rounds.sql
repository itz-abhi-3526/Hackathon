-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Shared judging: fixed 3-round pipeline
--   (additive on top of 20260922000000_judging_system.sql,
--    20260927000000_judging_snapshots_and_judge_auth.sql,
--    20260928000000_judging_totals_and_read_models.sql and
--    20260929000000_leaderboard_judging_aggregation.sql)
--
--   WHAT THIS CHANGES (deliberate, per product decision)
--     1. FIXED STAGES — judging_rounds gains a nullable `stage`
--        (round_1 | round_2 | final). Exactly one round may exist per
--        stage. Deferred product rounds created by the old "NEW ROUND"
--        flow keep `stage = NULL` and are retired (status = closed).
--        The three stage rounds ("Round 1", "Round 2",
--        "Final Presentation") are seeded idempotently.
--     2. FIXED CRITERIA — every stage round has exactly three criteria
--        named "Criteria 1/2/3", each with a FIXED maximum of 20 marks
--        (60 per round, 180 cumulative). A trigger enforces this for
--        stage rounds only; legacy rounds stay flexible.
--     3. SHARED EVALUATIONS — judge_evaluations is repurposed from
--        per-judge rows to ONE shared row per
--        (round, team, criterion): judge_id is made nullable (kept as
--        attribution only), the old four-column unique constraint is
--        dropped, and a partial unique index on
--        (judging_round_id, team_id, evaluation_criteria_id) is added.
--        Existing duplicate rows are collapsed to the most recently
--        updated row, so the index can be built.
--     4. PER-ROUND REMARKS — team_round_remarks holds ONE remark per
--        (round, team). Criterion-level remarks are retired.
--     5. QUALIFICATION STATE — judging_team_stage_status records per
--        (team, stage) status (pending | qualified | eliminated |
--        winner). Nothing is eliminated automatically; only the
--        explicit qualify/finalize RPCs change it. Every action is
--        audited in judging_qualification_events.
--     6. REPORTS — admin_judging_leaderboard view (Rank, Team, R1, R2,
--        Final, Cumulative) and leaderboard_sync_cumulative(), the
--        explicit "UPDATE MAIN LEADERBOARD" publish. The old weighted
--        leaderboard_sync_from_judgings() is left intact but unused.
--     7. REALTIME — judge_evaluations, team_round_remarks,
--        judging_team_stage_status and judging_team_round_totals are
--        added to the supabase_realtime publication with REPLICA
--        IDENTITY FULL so live saves broadcast the full row. RLS still
--        gates who may read them.
--
--   UNCHANGED / PROTECTED
--     • Registration, payments, email tracking, admin auth, judges
--       table and is_admin()/is_judge() gates.
--     • leaderboard table, its RLS, leaderboard_adjust_score() and the
--       standalone public scoreboard site.
--     • No existing migration file is edited.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ─── 1. FIXED STAGES ─────────────────────────────────────────────
alter table public.judging_rounds add column if not exists stage text;

do $$
begin
  alter table public.judging_rounds
    add constraint judging_rounds_stage_check
    check (stage is null or stage in ('round_1', 'round_2', 'final'));
exception
  when duplicate_object then null;
end $$;

create unique index if not exists judging_rounds_stage_uniq
  on public.judging_rounds (stage)
  where stage is not null;

-- Seed the three fixed stage rounds (idempotent, deterministic ids).
insert into public.judging_rounds (id, title, slug, description, status, stage, weight)
select 'a1000000-0000-4000-8000-000000000001', 'Round 1', 'round-1',
       'Round 1 — every registered team is evaluated.', 'active', 'round_1', 1.00
where not exists (select 1 from public.judging_rounds where stage = 'round_1');

insert into public.judging_rounds (id, title, slug, description, status, stage, weight)
select 'a1000000-0000-4000-8000-000000000002', 'Round 2', 'round-2',
       'Round 2 — top 20 teams from Round 1.', 'draft', 'round_2', 1.00
where not exists (select 1 from public.judging_rounds where stage = 'round_2');

insert into public.judging_rounds (id, title, slug, description, status, stage, weight)
select 'a1000000-0000-4000-8000-000000000003', 'Final Presentation', 'final-presentation',
       'Final Presentation — top 8 teams from Round 2.', 'draft', 'final', 1.00
where not exists (select 1 from public.judging_rounds where stage = 'final');

-- Retire legacy (non-staged) rounds so the pipeline is unambiguous.
update public.judging_rounds
   set status = 'closed'
 where stage is null
   and status = 'active';

-- ─── 2. FIXED CRITERIA ───────────────────────────────────────────
-- Exactly three criteria per stage round, named Criteria 1/2/3, max 20.
insert into public.evaluation_criteria (judging_round_id, name, max_score, sort_order)
select r.id, c.name, 20, c.ord
from public.judging_rounds r
cross join (values ('Criteria 1', 0), ('Criteria 2', 1), ('Criteria 3', 2)) as c(name, ord)
where r.stage is not null
  and not exists (
    select 1 from public.evaluation_criteria ec
    where ec.judging_round_id = r.id and ec.name = c.name
  );

create or replace function public.enforce_stage_criteria()
returns trigger
language plpgsql
as $$
declare
  v_stage text;
  v_others integer;
begin
  if tg_op = 'DELETE' then
    select stage into v_stage
      from public.judging_rounds where id = old.judging_round_id;
    if v_stage is not null then
      raise exception 'CRITERIA FOR A FIXED STAGE ROUND CANNOT BE DELETED'
        using errcode = '23514';
    end if;
    return old;
  end if;

  select stage into v_stage
    from public.judging_rounds where id = new.judging_round_id;
  if v_stage is null then
    return new;
  end if;

  if new.name not in ('Criteria 1', 'Criteria 2', 'Criteria 3') then
    raise exception 'FIXED STAGE ROUNDS USE CRITERIA 1, 2 AND 3 ONLY'
      using errcode = '23514';
  end if;
  if new.max_score <> 20 then
    raise exception 'FIXED STAGE CRITERIA HAVE A MAXIMUM OF 20 MARKS'
      using errcode = '23514';
  end if;

  select count(*) into v_others
    from public.evaluation_criteria
   where judging_round_id = new.judging_round_id
     and id <> new.id;
  if v_others >= 3 then
    raise exception 'A FIXED STAGE ROUND HAS EXACTLY THREE CRITERIA'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_stage_criteria on public.evaluation_criteria;
create trigger trg_enforce_stage_criteria
  before insert or update or delete on public.evaluation_criteria
  for each row execute function public.enforce_stage_criteria();

-- ─── 3. SHARED EVALUATIONS ───────────────────────────────────────
-- Collapse duplicate per-judge rows (keep the most recent mark for each
-- round × team × criterion) so the shared unique index can be built.
with ranked as (
  select id,
         row_number() over (
           partition by judging_round_id, team_id, evaluation_criteria_id
           order by updated_at desc nulls last, created_at desc nulls last, id
         ) as rn
    from public.judge_evaluations
   where evaluation_criteria_id is not null
)
delete from public.judge_evaluations je
 using ranked r
 where je.id = r.id
   and r.rn > 1;

alter table public.judge_evaluations
  drop constraint if exists judge_evaluations_unique_evaluation;

alter table public.judge_evaluations
  alter column judge_id drop not null;

create unique index if not exists judge_evaluations_shared_uniq
  on public.judge_evaluations (judging_round_id, team_id, evaluation_criteria_id)
  where evaluation_criteria_id is not null;

-- ─── 4. PER-ROUND REMARKS ────────────────────────────────────────
create table if not exists public.team_round_remarks (
  judging_round_id uuid not null
    constraint trr_round_fk references public.judging_rounds(id) on delete cascade,
  team_id uuid not null
    constraint trr_team_fk references public.teams(id) on delete cascade,
  remark text not null default '',
  updated_at timestamptz not null default now(),
  primary key (judging_round_id, team_id)
);

alter table public.team_round_remarks enable row level security;

drop policy if exists "trr_staff_select" on public.team_round_remarks;
create policy "trr_staff_select"
  on public.team_round_remarks for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

drop policy if exists "trr_staff_insert" on public.team_round_remarks;
create policy "trr_staff_insert"
  on public.team_round_remarks for insert
  with check (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

drop policy if exists "trr_staff_update" on public.team_round_remarks;
create policy "trr_staff_update"
  on public.team_round_remarks for update
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()))
  with check (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

drop policy if exists "trr_admin_delete" on public.team_round_remarks;
create policy "trr_admin_delete"
  on public.team_round_remarks for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- ─── 5. QUALIFICATION STATE ──────────────────────────────────────
create table if not exists public.judging_team_stage_status (
  team_id uuid not null
    constraint jtss_team_fk references public.teams(id) on delete cascade,
  stage text not null
    constraint jtss_stage_check check (stage in ('round_1', 'round_2', 'final')),
  status text not null default 'pending'
    constraint jtss_status_check
    check (status in ('pending', 'qualified', 'eliminated', 'winner')),
  qualified_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (team_id, stage)
);

alter table public.judging_team_stage_status enable row level security;

-- Readable by staff; mutated only through the SECURITY DEFINER RPCs.
drop policy if exists "jtss_staff_select" on public.judging_team_stage_status;
create policy "jtss_staff_select"
  on public.judging_team_stage_status for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create table if not exists public.judging_qualification_events (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  from_stage text,
  to_stage text,
  cutoff integer,
  team_ids uuid[] not null default '{}',
  actor uuid,
  created_at timestamptz not null default now()
);

alter table public.judging_qualification_events enable row level security;

drop policy if exists "jqe_staff_select" on public.judging_qualification_events;
create policy "jqe_staff_select"
  on public.judging_qualification_events for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

-- ─── 6. SHARED SAVE RPC ──────────────────────────────────────────
-- Atomic upsert of one team's shared marks + per-round remark. Admin or
-- judge gated; row-locked per (round, team) so concurrent editors cannot
-- interleave. Only the criteria present in p_rows are written — omitted
-- criteria are left untouched (never auto-zeroed).
create or replace function public.save_shared_evaluation(
  p_round uuid,
  p_team uuid,
  p_rows jsonb,
  p_remark text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_stage text;
  v_row jsonb;
  v_crit uuid;
  v_score numeric(8,2);
  v_max numeric(8,2);
  v_count integer := 0;
begin
  if not (public.is_admin() or public.is_judge()) then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;

  select stage into v_stage from public.judging_rounds where id = p_round;
  if v_stage is null then
    raise exception 'NOT A FIXED STAGE ROUND.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.teams where id = p_team) then
    raise exception 'TEAM NOT FOUND.' using errcode = '23503';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'ROWS MUST BE A JSON ARRAY.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_round::text || ':' || p_team::text));

  for v_row in select * from jsonb_array_elements(p_rows) loop
    v_crit := (v_row ->> 'evaluationCriteriaId')::uuid;
    v_score := (v_row ->> 'score')::numeric;

    select max_score into v_max
      from public.evaluation_criteria
     where id = v_crit and judging_round_id = p_round;
    if v_max is null then
      raise exception 'CRITERION DOES NOT BELONG TO THIS ROUND.' using errcode = '23503';
    end if;
    if v_score < 0 or v_score > v_max then
      raise exception 'SCORE % IS OUT OF RANGE FOR THIS CRITERION.', v_score
        using errcode = '23514';
    end if;

    update public.judge_evaluations
       set score = v_score,
           judge_id = null,
           remark = null,
           updated_at = now()
     where judging_round_id = p_round
       and team_id = p_team
       and evaluation_criteria_id = v_crit;

    if not found then
      insert into public.judge_evaluations
        (judging_round_id, judge_id, team_id, evaluation_criteria_id, score)
      values (p_round, null, p_team, v_crit, v_score);
    end if;

    v_count := v_count + 1;
  end loop;

  if p_remark is not null then
    insert into public.team_round_remarks (judging_round_id, team_id, remark, updated_at)
    values (p_round, p_team, coalesce(p_remark, ''), now())
    on conflict (judging_round_id, team_id) do update
      set remark = excluded.remark, updated_at = now();
  end if;

  return v_count;
end;
$$;

revoke all on function public.save_shared_evaluation(uuid, uuid, jsonb, text) from public;
grant execute on function public.save_shared_evaluation(uuid, uuid, jsonb, text) to authenticated;

-- ─── 7. QUALIFICATION RPCs ───────────────────────────────────────
-- Ranks eligible teams by cumulative score up to p_from_stage, then
-- writes an explicit qualified/eliminated status for p_to_stage. No team
-- is ever deleted; eliminated teams keep every score.
create or replace function public.judging_qualify(
  p_from_stage text,
  p_to_stage text,
  p_count integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order text[] := array['round_1', 'round_2', 'final'];
  v_from_round uuid;
  v_to_round uuid;
  v_team uuid;
  v_rank integer := 0;
  v_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;
  if p_count is null or p_count < 1 then
    raise exception 'INVALID CUTOFF.' using errcode = '22023';
  end if;
  if array_position(v_order, p_from_stage) is null
     or array_position(v_order, p_to_stage) is null
     or array_position(v_order, p_to_stage) <= array_position(v_order, p_from_stage) then
    raise exception 'INVALID QUALIFICATION STAGES.' using errcode = '22023';
  end if;

  select id into v_from_round from public.judging_rounds where stage = p_from_stage;
  select id into v_to_round from public.judging_rounds where stage = p_to_stage;
  if v_from_round is null or v_to_round is null then
    raise exception 'STAGE ROUND NOT FOUND.' using errcode = '23503';
  end if;

  for v_team in
    with stages_up_to as (
      select s
        from unnest(v_order) as s
       where array_position(v_order, s) <= array_position(v_order, p_from_stage)
    ),
    eligible as (
      select jtrt.team_id
        from public.judging_team_round_totals jtrt
       where jtrt.judging_round_id = v_from_round
         and (
           p_from_stage = 'round_1'
           or exists (
             select 1 from public.judging_team_stage_status st
              where st.team_id = jtrt.team_id
                and st.stage = p_from_stage
                and st.status = 'qualified'
           )
         )
    )
    select e.team_id
      from eligible e
     order by
       (select coalesce(sum(jt.total_score), 0)
          from public.judging_team_round_totals jt
          join public.judging_rounds jr on jr.id = jt.judging_round_id
         where jt.team_id = e.team_id
           and jr.stage in (select s from stages_up_to)) desc,
       e.team_id asc
  loop
    v_rank := v_rank + 1;
    insert into public.judging_team_stage_status (team_id, stage, status, qualified_at, updated_at)
    values (
      v_team,
      p_to_stage,
      case when v_rank <= p_count then 'qualified' else 'eliminated' end,
      case when v_rank <= p_count then now() else null end,
      now()
    )
    on conflict (team_id, stage) do update
      set status = excluded.status,
          qualified_at = excluded.qualified_at,
          updated_at = now();

    if v_rank <= p_count then
      v_ids := array_append(v_ids, v_team);
    end if;
  end loop;

  insert into public.judging_qualification_events
    (action, from_stage, to_stage, cutoff, team_ids, actor)
  values
    ('qualify', p_from_stage, p_to_stage, p_count, v_ids, auth.uid());

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function public.judging_qualify(text, text, integer) from public;
grant execute on function public.judging_qualify(text, text, integer) to authenticated;

-- Mark the top three finalists as winners (cumulative across all stages).
create or replace function public.judging_finalize_top3()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order text[] := array['round_1', 'round_2', 'final'];
  v_final_round uuid;
  v_team uuid;
  v_rank integer := 0;
  v_ids uuid[] := '{}';
begin
  if not public.is_admin() then
    raise exception 'ACCESS DENIED.' using errcode = '42501';
  end if;

  select id into v_final_round from public.judging_rounds where stage = 'final';
  if v_final_round is null then
    raise exception 'FINAL ROUND NOT FOUND.' using errcode = '23503';
  end if;

  -- Any prior winner is demoted back to a finalist before re-finalising,
  -- so the operation is idempotent.
  update public.judging_team_stage_status
     set status = 'qualified'
   where stage = 'final' and status = 'winner';

  for v_team in
    select st.team_id
      from public.judging_team_stage_status st
     where st.stage = 'final'
       and st.status = 'qualified'
     order by
       (select coalesce(sum(jt.total_score), 0)
          from public.judging_team_round_totals jt
          join public.judging_rounds jr on jr.id = jt.judging_round_id
         where jt.team_id = st.team_id
           and jr.stage = any (v_order)) desc,
       st.team_id asc
  loop
    v_rank := v_rank + 1;
    if v_rank <= 3 then
      update public.judging_team_stage_status
         set status = 'winner', updated_at = now()
       where team_id = v_team and stage = 'final';
      v_ids := array_append(v_ids, v_team);
    end if;
  end loop;

  insert into public.judging_qualification_events
    (action, from_stage, to_stage, cutoff, team_ids, actor)
  values
    ('finalize_top3', 'final', 'final', 3, v_ids, auth.uid());

  return coalesce(array_length(v_ids, 1), 0);
end;
$$;

revoke all on function public.judging_finalize_top3() from public;
grant execute on function public.judging_finalize_top3() to authenticated;

-- ─── 8. ADMIN LEADERBOARD READ MODEL ─────────────────────────────
create or replace view public.admin_judging_leaderboard
with (security_invoker = true) as
select
  t.id                                   as team_id,
  t.team_name                            as team_name,
  t.registration_code                    as registration_code,
  t.college                              as college,
  t.problem_statement_id                 as problem_statement_id,
  r1.total_score                         as round_1,
  r2.total_score                         as round_2,
  rf.total_score                         as final_presentation,
  (coalesce(r1.total_score, 0)
   + coalesce(r2.total_score, 0)
   + coalesce(rf.total_score, 0))        as cumulative,
  s2.status                              as round_2_status,
  sf.status                              as final_status,
  row_number() over (
    order by (coalesce(r1.total_score, 0)
              + coalesce(r2.total_score, 0)
              + coalesce(rf.total_score, 0)) desc,
             t.created_at asc,
             t.id asc
  )                                      as rank_no
from public.teams t
left join public.judging_rounds gr1 on gr1.stage = 'round_1'
left join public.judging_rounds gr2 on gr2.stage = 'round_2'
left join public.judging_rounds grf on grf.stage = 'final'
left join public.judging_team_round_totals r1 on r1.team_id = t.id and r1.judging_round_id = gr1.id
left join public.judging_team_round_totals r2 on r2.team_id = t.id and r2.judging_round_id = gr2.id
left join public.judging_team_round_totals rf on rf.team_id = t.id and rf.judging_round_id = grf.id
left join public.judging_team_stage_status s2 on s2.team_id = t.id and s2.stage = 'round_2'
left join public.judging_team_stage_status sf on sf.team_id = t.id and sf.stage = 'final';

comment on view public.admin_judging_leaderboard is
  'Admin read model: per team, Round 1 / Round 2 / Final Presentation scores, cumulative total, qualification state and rank. security_invoker keeps the teams/stage RLS.';

-- ─── 9. UPDATE MAIN LEADERBOARD (cumulative publish) ─────────────
-- Explicit admin action. Publishes each judged team's cumulative score
-- (R1 + R2 + Final) onto the public leaderboard table, upserting by
-- team_name. Manual/curated entries with no judging totals are left
-- untouched. No automatic publishing happens anywhere.
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

  for r in
    select
      jtrt.team_id        as team_id,
      t.team_name         as team_name,
      coalesce(sum(jtrt.total_score), 0)::numeric(14,2) as cumulative
    from public.judging_team_round_totals jtrt
    join public.judging_rounds jr on jr.id = jtrt.judging_round_id
    join public.teams          t  on t.id  = jtrt.team_id
   where jr.stage is not null
   group by jtrt.team_id, t.team_name
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

  return v_count;
end;
$$;

revoke all on function public.leaderboard_sync_cumulative() from public;
grant execute on function public.leaderboard_sync_cumulative() to authenticated;

comment on function public.leaderboard_sync_cumulative() is
  'Admin-only "UPDATE MAIN LEADERBOARD": publishes each judged team''s cumulative (Round 1 + Round 2 + Final) score onto the public leaderboard. Returns the number of rows written.';

-- ─── 10. REALTIME ────────────────────────────────────────────────
alter table public.judge_evaluations            replica identity full;
alter table public.team_round_remarks           replica identity full;
alter table public.judging_team_stage_status    replica identity full;
alter table public.judging_team_round_totals    replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.judge_evaluations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.team_round_remarks;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.judging_team_stage_status;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.judging_team_round_totals;
exception when duplicate_object then null;
end $$;

-- ─── 11. COMMENTS ────────────────────────────────────────────────
comment on column public.judging_rounds.stage is
  'Fixed pipeline stage: round_1, round_2 or final. NULL for legacy/unstaged rounds.';

comment on table public.team_round_remarks is
  'One shared remark per (judging round × team). Replaces per-criterion remarks.';

comment on table public.judging_team_stage_status is
  'Per (team × stage) qualification state. Changed only by judging_qualify()/judging_finalize_top3(); never automatically.';

comment on table public.judging_qualification_events is
  'Audit trail of explicit qualification/finalisation actions (actor, cutoff, resulting team ids).';

comment on function public.save_shared_evaluation(uuid, uuid, jsonb, text) is
  'Admin/judge: atomically upserts one team''s shared marks for a stage round plus its per-round remark.';

comment on function public.judging_qualify(text, text, integer) is
  'Admin-only: ranks eligible teams by cumulative score up to p_from_stage and writes explicit qualified/eliminated state for p_to_stage.';

comment on function public.judging_finalize_top3() is
  'Admin-only: marks the top three finalists (cumulative across all stages) as winners.';

-- ─── DONE ────────────────────────────────────────────────────────
notify pgrst, 'reload schema';

commit;
