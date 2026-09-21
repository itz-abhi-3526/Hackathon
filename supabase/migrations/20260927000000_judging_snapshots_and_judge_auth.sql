-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Judging: dynamic criteria + historical snapshots
--   (additive on top of 20260922000000_judging_system.sql and
--    20260913000000_admin_control_center.sql)
--
--   WHAT THIS ADDITION DELIVERS
--     1. evaluation_criteria.updated_at — every criterion now carries a
--        modified timestamp (auto-touched), so admins can audit when a
--        round's marking scheme changed.
--     2. judge_evaluations snapshots — the criterion's name and ceiling
--        are copied into each evaluation row AT SCORING TIME. Historical
--        scores therefore survive later changes to the live rubric:
--          • deleting a criterion keeps every already-saved score (the
--            FK becomes ON DELETE SET NULL and evaluation_criteria_id
--            becomes nullable; the idle row keeps its snapshot).
--          • renaming / re-maxing a criterion affects only FUTURE rows;
--            old rows keep exactly what the judge scored against.
--     3. is_judge() — judge-analogue of is_admin(): true when the
--        request JWT email matches a public.judges row. This is the
--        single gate for judge authorisation (a future judge portal
--        reuses it — no admin control centre changes required).
--     4. RLS widened from admin-only to admin-OR-judge ("staff") for
--        reading the judging tables. Criteria CRUD is staff-writable
--        (prompt: only authorised admin/judge users manage criteria).
--        Evaluations are staff-inserable/updatable (judges score, admins
--        correct / reopen) but stay ADMIN-deletable only. Structure
--        tables (judges, judging_rounds, assignments) stay admin-writable.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

begin;

-- ─── 1. EVALUATION CRITERIA: updated_at ─────────────────────────
alter table public.evaluation_criteria add column if not exists updated_at timestamptz;

update public.evaluation_criteria
   set updated_at = created_at
 where updated_at is null;

alter table public.evaluation_criteria
  alter column updated_at set default now(),
  alter column updated_at set not null;

create or replace function public.touch_criterion_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_evaluation_criteria_touch_updated_at
  on public.evaluation_criteria;
create trigger trg_evaluation_criteria_touch_updated_at
  before update on public.evaluation_criteria
  for each row execute function public.touch_criterion_updated_at();

-- ─── 2. JUDGE EVALUATIONS: historical snapshots ─────────────────
-- Snapshot the criterion's name + ceiling so a saved score is never
-- re-narrated when the live rubric later changes.
alter table public.judge_evaluations add column if not exists criterion_name text;
alter table public.judge_evaluations add column if not exists max_marks numeric(8,2);

update public.judge_evaluations je
   set criterion_name = ec.name,
       max_marks      = ec.max_score
  from public.evaluation_criteria ec
 where je.evaluation_criteria_id = ec.id
   and je.criterion_name is null;

-- Freeze the CURRENT scheme into every new row at insert time. An
-- upsert / later update keeps the original snapshot, so reopening an
-- evaluation to correct a score never changes what was scored against.
create or replace function public.snapshot_evaluation_criteria()
returns trigger
language plpgsql
as $$
declare
  v_name text;
  v_max  numeric(8,2);
begin
  select name, max_score into v_name, v_max
    from public.evaluation_criteria
   where id = new.evaluation_criteria_id;

  if not found then
    raise exception 'EVALUATION CRITERIA NOT FOUND.' using errcode = '23503';
  end if;

  new.criterion_name := coalesce(new.criterion_name, v_name);
  new.max_marks := coalesce(new.max_marks, v_max);
  return new;
end;
$$;

drop trigger if exists trg_snapshot_evaluation_criteria
  on public.judge_evaluations;
create trigger trg_snapshot_evaluation_criteria
  before insert on public.judge_evaluations
  for each row execute function public.snapshot_evaluation_criteria();

-- Decouple historical marks from the live marking scheme: deleting a
-- criterion must never erase the scores already recorded for it.
alter table public.judge_evaluations drop constraint if exists je_criteria_fk;
alter table public.judge_evaluations alter column evaluation_criteria_id drop not null;
alter table public.judge_evaluations
  add constraint je_criteria_fk
  foreign key (evaluation_criteria_id)
  references public.evaluation_criteria(id)
  on delete set null;

-- ─── 3. is_judge() — judge authorisation gate ───────────────────
-- Mirrors is_admin(): a user is an authorised judge iff their JWT
-- email matches a public.judges row. SECURITY DEFINER so the judge
-- list stays admin-managed and judge auth never depends on its RLS.
create or replace function public.is_judge()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.judges
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_judge() from public;
grant execute on function public.is_judge() to anon, authenticated;

comment on function public.is_judge() is
  'True when the current request JWT email matches a public.judges row. SECURITY DEFINER so the judge list stays admin-managed.';

-- ─── 4. RLS: staff (admin OR judge) reads, gated writes ─────────
--   structure tables (judges, judging_rounds, assignments):
--       SELECT  -> admin OR judge (judges need round/rubric/team data)
--       WRITES  -> admin only
--   evaluation_criteria:
--       all commands -> admin OR judge
--       (only authorised admin/judge users configure judging criteria)
--   judge_evaluations:
--       SELECT / INSERT / UPDATE -> admin OR judge
--       (judges record marks, admins reopen + correct)
--       DELETE -> admin only

-- judges
drop policy if exists "judges_admin_select" on public.judges;
drop policy if exists "judges_admin_insert" on public.judges;
drop policy if exists "judges_admin_update" on public.judges;
drop policy if exists "judges_admin_delete" on public.judges;

create policy "judges_staff_select" on public.judges
  for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "judges_admin_insert" on public.judges
  for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

create policy "judges_admin_update" on public.judges
  for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

create policy "judges_admin_delete" on public.judges
  for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- judging_rounds
drop policy if exists "judging_rounds_admin_select" on public.judging_rounds;
drop policy if exists "judging_rounds_admin_insert" on public.judging_rounds;
drop policy if exists "judging_rounds_admin_update" on public.judging_rounds;
drop policy if exists "judging_rounds_admin_delete" on public.judging_rounds;

create policy "judging_rounds_staff_select" on public.judging_rounds
  for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "judging_rounds_admin_insert" on public.judging_rounds
  for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

create policy "judging_rounds_admin_update" on public.judging_rounds
  for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

create policy "judging_rounds_admin_delete" on public.judging_rounds
  for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- evaluation_criteria (staff-writable)
drop policy if exists "eval_criteria_admin_select" on public.evaluation_criteria;
drop policy if exists "eval_criteria_admin_insert" on public.evaluation_criteria;
drop policy if exists "eval_criteria_admin_update" on public.evaluation_criteria;
drop policy if exists "eval_criteria_admin_delete" on public.evaluation_criteria;

create policy "eval_criteria_staff_select" on public.evaluation_criteria
  for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "eval_criteria_staff_insert" on public.evaluation_criteria
  for insert
  with check (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "eval_criteria_staff_update" on public.evaluation_criteria
  for update
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()))
  with check (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "eval_criteria_staff_delete" on public.evaluation_criteria
  for delete
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

-- judge_round_assignments
drop policy if exists "jra_admin_select" on public.judge_round_assignments;
drop policy if exists "jra_admin_insert" on public.judge_round_assignments;
drop policy if exists "jra_admin_update" on public.judge_round_assignments;
drop policy if exists "jra_admin_delete" on public.judge_round_assignments;

create policy "jra_staff_select" on public.judge_round_assignments
  for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "jra_admin_insert" on public.judge_round_assignments
  for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

create policy "jra_admin_update" on public.judge_round_assignments
  for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

create policy "jra_admin_delete" on public.judge_round_assignments
  for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- judge_evaluations (judges can score; only admins delete)
drop policy if exists "je_admin_select" on public.judge_evaluations;
drop policy if exists "je_admin_insert" on public.judge_evaluations;
drop policy if exists "je_admin_update" on public.judge_evaluations;
drop policy if exists "je_admin_delete" on public.judge_evaluations;

create policy "je_staff_select" on public.judge_evaluations
  for select
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "je_staff_insert" on public.judge_evaluations
  for insert
  with check (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "je_staff_update" on public.judge_evaluations
  for update
  using (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()))
  with check (auth.role() = 'authenticated' and (public.is_admin() or public.is_judge()));

create policy "je_admin_delete" on public.judge_evaluations
  for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- teams: judges need team data to evaluate, so grant them SELECT
-- alongside the existing admin-only teams_auth_select policy.
drop policy if exists "teams_judge_select" on public.teams;
create policy "teams_judge_select" on public.teams
  for select
  using (auth.role() = 'authenticated' and public.is_judge());

-- ─── 5. COMMENTS ────────────────────────────────────────────────

comment on column public.evaluation_criteria.updated_at is
  'Last time this criterion was modified in the live marking scheme.';

comment on column public.judge_evaluations.criterion_name is
  'Snapshot of the criterion name at scoring time; preserved when the live rubric later changes.';

comment on column public.judge_evaluations.max_marks is
  'Snapshot of the criterion ceiling at scoring time; preserved when the live rubric later changes.';

-- ─── DONE ───────────────────────────────────────────────────────

notify pgrst, 'reload schema';

commit;