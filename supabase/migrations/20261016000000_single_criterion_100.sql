-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Single-criterion rubric (ONE mark per round, /100)
--
--   Replaces the 3 × 20 rubric with ONE criterion named "Score",
--   maximum 100 marks, for every fixed stage round
--   (round_1 | round_2 | final). The cumulative ceiling becomes
--   100 × 3 = 300. The rest of the pipeline is unchanged: shared
--   saves, explicit qualification (top 20 / top 8 / top 3) and the
--   public leaderboard all keep working off the same totals.
--
--   NON-DESTRUCTIVE:
--     • No scores are deleted. Legacy criteria are removed only when
--       they carry no evaluation rows; if any exist they are kept and
--       simply stop counting toward the single-mark flow.
--     • Existing marks on the surviving criterion are left untouched;
--       only its name/maximum are retuned.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

-- ─── 1. FIXED RUBRIC: EXACTLY ONE CRITERION, MAX 100 ────────────
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
    if v_stage is not null and old.name = 'Score' then
      raise exception 'THE STAGE SCORE CRITERION CANNOT BE DELETED'
        using errcode = '23514';
    end if;
    return old;
  end if;

  select stage into v_stage
    from public.judging_rounds where id = new.judging_round_id;
  if v_stage is null then
    return new;
  end if;

  if new.name <> 'Score' then
    raise exception 'FIXED STAGE ROUNDS USE A SINGLE CRITERION NAMED "Score"'
      using errcode = '23514';
  end if;
  if new.max_score <> 100 then
    raise exception 'THE STAGE SCORE CRITERION HAS A MAXIMUM OF 100 MARKS'
      using errcode = '23514';
  end if;

  select count(*) into v_others
    from public.evaluation_criteria
   where judging_round_id = new.judging_round_id
     and id <> new.id;
  if v_others >= 1 then
    raise exception 'A FIXED STAGE ROUND HAS EXACTLY ONE CRITERION'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

-- ─── 2. DROP LEGACY EXTRA CRITERIA (only when unused) ───────────
delete from public.evaluation_criteria ec
 using public.judging_rounds r
 where ec.judging_round_id = r.id
   and r.stage is not null
   and ec.name <> 'Score'
   and not exists (
     select 1 from public.judge_evaluations je
      where je.evaluation_criteria_id = ec.id
   );

-- ─── 3. RETUNE THE SURVIVING CRITERION TO "Score" / 100 ─────────
update public.evaluation_criteria ec
   set name = 'Score',
       max_score = 100,
       updated_at = now()
  from public.judging_rounds r
 where ec.judging_round_id = r.id
   and r.stage is not null
   and ec.name <> 'Score';

-- ─── 4. ENSURE EVERY STAGE ROUND HAS ITS SINGLE CRITERION ───────
insert into public.evaluation_criteria (judging_round_id, name, max_score, sort_order)
select r.id, 'Score', 100, 0
  from public.judging_rounds r
 where r.stage is not null
   and not exists (
     select 1 from public.evaluation_criteria ec
      where ec.judging_round_id = r.id
   );

-- ─── 5. REFRESH THE score_possible CEILINGS ─────────────────────
do $$
declare
  r record;
begin
  for r in select id from public.judging_rounds where stage is not null loop
    perform public.recompute_score_possible_for_round(r.id);
  end loop;
end $$;

-- ─── 6. COMMENTS ────────────────────────────────────────────────
comment on table public.evaluation_criteria is
  'Scoring dimensions within a judging round. Fixed stage rounds carry a single criterion named "Score" with a 100-mark ceiling; the cumulative total is out of 300.';

notify pgrst, 'reload schema';

commit;
