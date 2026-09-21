-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Judging completion: persisted totals + read model
--   (additive on top of 20260922000000_judging_system.sql and
--    20260927000000_judging_snapshots_and_judge_auth.sql)
--
--   Closes the remaining Prompt 7 database gaps WITHOUT creating any
--   duplicate table:
--
--     1. judging_team_round_totals  — a derived AGGREGATE (not a copy of
--        the detail rows): one row per (team × round) holding the team's
--        total, the score_possible ceiling and how many evaluation rows
--        contributed. Maintained automatically by triggers whenever a
--        judge_evaluation is inserted / updated / deleted or a round's
--        criteria ceiling changes, so totals are always exactly
--        sum(judge_evaluations.score) at query time. Authoritative
--        detail stays in judge_evaluations.
--
--     2. judging_evaluation_rows    — a security_invoker VIEW (a read
--        model, not a table) returning every persisted evaluation with
--        full context: judge, team, round, criterion, marks, remark,
--        timestamps AND the historical snapshot. For deleted / renamed
--        criteria the snapshot (criterion_name / max_marks as scored)
--        is returned instead of the live rubric, so history stays
--        exactly as it was judged.
--
--     Per-criterion scores, judge, team, round, remarks, timestamps and
--     historical criteria info were already persisted in prompt-turn 2;
--     RLS here keeps the new artefacts admin/judge-readable only.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ─── 1. PERSISTED TEAM × ROUND TOTALS ───────────────────────────

create table if not exists public.judging_team_round_totals (
  judging_round_id uuid not null,
  team_id uuid not null,
  total_score numeric(10,2) not null default 0,
  score_possible numeric(10,2) not null default 0,
  entries_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (judging_round_id, team_id),
  constraint jtrt_round_fk
    foreign key (judging_round_id) references public.judging_rounds(id)
    on delete cascade,
  constraint jtrt_team_fk
    foreign key (team_id) references public.teams(id)
    on delete cascade,
  constraint jtrt_total_non_negative check (total_score >= 0),
  constraint jtrt_entries_non_negative check (entries_count >= 0)
);

alter table public.judging_team_round_totals enable row level security;

drop policy if exists "jtrt_staff_select" on public.judging_team_round_totals;
create policy "jtrt_staff_select"
  on public.judging_team_round_totals for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

-- Recompute the summary row for one (team × round) from the detail rows.
-- SECURITY DEFINER (owned by the migration run, i.e. postgres) so the
-- trigger-maintained writes bypass RLS for regular admins/judges.
create or replace function public.recompute_team_round_total(p_round uuid, p_team uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total    numeric(10,2);
  v_entries  integer;
  v_possible numeric(10,2);
begin
  if p_round is null or p_team is null then
    return;
  end if;

  -- The round/team is gone (cascade): drop the summary row instead of
  -- resurrecting it for a deleted parent.
  if not exists (select 1 from public.judging_rounds where id = p_round)
     or not exists (select 1 from public.teams where id = p_team) then
    delete from public.judging_team_round_totals
     where judging_round_id = p_round and team_id = p_team;
    return;
  end if;

  select coalesce(sum(score), 0)::numeric(10,2), count(*)::integer
    into v_total, v_entries
    from public.judge_evaluations
   where judging_round_id = p_round and team_id = p_team;

  select coalesce(sum(max_score), 0)::numeric(10,2)
    into v_possible
    from public.evaluation_criteria
   where judging_round_id = p_round;

  insert into public.judging_team_round_totals
    (judging_round_id, team_id, total_score, score_possible, entries_count, updated_at)
  values (p_round, p_team, v_total, v_possible, v_entries, now())
  on conflict (judging_round_id, team_id) do update set
    total_score    = excluded.total_score,
    score_possible = excluded.score_possible,
    entries_count  = excluded.entries_count,
    updated_at     = now();
end;
$$;

-- Refresh only the score_possible ceiling for every team in a round
-- after the round's criteria change (insert / delete / re-max).
create or replace function public.recompute_score_possible_for_round(p_round uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_possible numeric(10,2);
begin
  if p_round is null then
    return;
  end if;
  select coalesce(sum(max_score), 0)::numeric(10,2)
    into v_possible
    from public.evaluation_criteria
   where judging_round_id = p_round;
  update public.judging_team_round_totals
     set score_possible = v_possible, updated_at = now()
   where judging_round_id = p_round;
end;
$$;

create or replace function public.refresh_team_round_total_trg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round uuid;
  v_team  uuid;
begin
  v_round := coalesce(new.judging_round_id, old.judging_round_id);
  v_team  := coalesce(new.team_id, old.team_id);
  perform public.recompute_team_round_total(v_round, v_team);
  return null;
end;
$$;

drop trigger if exists trg_refresh_team_round_total on public.judge_evaluations;
create trigger trg_refresh_team_round_total
  after insert or update or delete on public.judge_evaluations
  for each row execute function public.refresh_team_round_total_trg();

create or replace function public.refresh_round_score_possible_trg()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_round uuid;
begin
  v_round := coalesce(new.judging_round_id, old.judging_round_id);
  if v_round is not null then
    perform public.recompute_score_possible_for_round(v_round);
  end if;
  return null;
end;
$$;

drop trigger if exists trg_refresh_round_score_possible on public.evaluation_criteria;
create trigger trg_refresh_round_score_possible
  after insert or update of max_score or delete on public.evaluation_criteria
  for each row execute function public.refresh_round_score_possible_trg();

-- Backfill the summary for any evaluations that already exist.
select count(*) from (
  select public.recompute_team_round_total(judging_round_id, team_id)
    from (select distinct judging_round_id, team_id from public.judge_evaluations) d
) _backfill;

-- ─── 1.5 CEILING CHECK MUST SKIP RETIRED ROWS ────────────────────
-- Since je_criteria_fk became ON DELETE SET NULL, deleting a criterion
-- updates the trailing evaluation rows (evaluation_criteria_id = NULL).
-- The deferred ceiling trigger below would then look up criteria by NULL
-- and raise 'EVALUATION CRITERIA NOT FOUND.', silently blocking the
-- very cascade-decision history is meant to survive. Historical rows
-- carry their ceiling in max_marks, so the check should only run for
-- rows that still reference a live criterion.
create or replace function public.enforce_evaluation_score_ceiling()
returns trigger
language plpgsql
as $$
declare
  v_max numeric;
begin
  if new.evaluation_criteria_id is null then
    return new;
  end if;

  select max_score into v_max
    from public.evaluation_criteria
    where id = new.evaluation_criteria_id;

  if v_max is null then
    raise exception 'EVALUATION CRITERIA NOT FOUND.' using errcode = '23503';
  end if;

  if new.score > v_max then
    raise exception 'SCORE % EXCEEDS MAXIMUM % FOR THIS CRITERION.',
      new.score, v_max
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_evaluation_ceiling
  on public.judge_evaluations;
create constraint trigger trg_enforce_evaluation_ceiling
  after insert or update on public.judge_evaluations
  deferrable initially deferred
  for each row execute function public.enforce_evaluation_score_ceiling();

-- ─── 2. DETAIL READ MODEL (view, not a table) ───────────────────
-- One row per persisted evaluation with full context + the historical
-- snapshot. security_invoker keeps the underlying RLS: admins and judges
-- see rows, everyone else sees none.
create or replace view public.judging_evaluation_rows
with (security_invoker = true) as
select
  je.id                                       as evaluation_id,
  je.judging_round_id                          as judging_round_id,
  jr.title                                     as round_title,
  je.team_id                                   as team_id,
  t.team_name                                  as team_name,
  t.registration_code                          as registration_code,
  je.judge_id                                  as judge_id,
  j.full_name                                  as judge_name,
  j.email                                      as judge_email,
  je.evaluation_criteria_id                    as evaluation_criteria_id,
  coalesce(je.criterion_name, ec.name)         as criterion_name,
  coalesce(je.max_marks, ec.max_score)         as criterion_max,
  je.score                                     as score,
  je.remark                                    as remark,
  je.created_at                                as scored_at,
  je.updated_at                                as updated_at
from public.judge_evaluations je
left join public.judging_rounds     jr on jr.id = je.judging_round_id
left join public.teams              t  on t.id  = je.team_id
left join public.judges             j  on j.id  = je.judge_id
left join public.evaluation_criteria ec on ec.id = je.evaluation_criteria_id;

-- ─── 3. COMMENTS ────────────────────────────────────────────────

comment on table public.judging_team_round_totals is
  'Derived aggregate (team × round) of judge_evaluations. Not a duplicate detail store — always recomputed by triggers from the detail rows.';

comment on column public.judging_team_round_totals.total_score is
  'Sum of every evaluation score for the team in the round (across all judges and criteria, including preserved retired criteria).';

comment on column public.judging_team_round_totals.score_possible is
  'Sum of the round''s current criterion ceilings.';

comment on column public.judging_team_round_totals.entries_count is
  'Number of evaluation rows contributing to the total (judge × criterion).';

comment on view public.judging_evaluation_rows is
  'Read model: one row per persisted evaluation with judge/team/round/criteria context. Deleted or renamed criteria fall back to the snapshot (criterion_name / max_marks) recorded at scoring time.';

-- ─── DONE ───────────────────────────────────────────────────────

notify pgrst, 'reload schema';

commit;