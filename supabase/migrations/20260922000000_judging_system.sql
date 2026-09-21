-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Judging system (additive)
--   Extends the live leaderboard with a full judging infrastructure
--   that supports multiple rounds, per-criterion scoring, judge
--   assignments and granular evaluation history.
--
--   TABLES ADDED
--     judges                  — judge profiles (Supabase auth users)
--     judging_rounds          — evaluation phases (e.g. "Round 1 Screening",
--                               "Finals Presentation")
--     evaluation_criteria     — scoring dimensions within a round
--                               (e.g. "Innovation (0-25)")
--     judge_round_assignments — which judges evaluate which teams within
--                               a specific round
--     judge_evaluations       — one mark + remark per judge × team × criterion
--
--   LEADERBOARD LINK
--     A nullable team_id FK is added to the existing leaderboard table so
--     leaderboard rows can reference a real registration. The existing
--     manual workflow (team_name + score) keeps working unchanged; the FK
--     becomes the bridge when the judging system feeds scores.
--
--   HOW SCORES WILL FLOW (not wired yet — this migration lays the
--   foundation only)
--     1. Admin creates judging_rounds + evaluation_criteria for a round.
--     2. Admin assigns judges via judge_round_assignments.
--     3. Judges (or admins) submit judge_evaluations — one per
--        judge × team × criterion.
--     4. A future migration or Edge Function sums evaluations per team,
--        optionally per-round, and writes the total to leaderboard.score.
--     5. Leaderboard.rank stays derived (ORDER BY score DESC, created_at ASC).
--
--   SECURITY
--     • Every table has RLS ON.
--     • Public may only SELECT the leaderboard (the broadcast scoreboard).
--     • judging_rounds, evaluation_criteria, judge_round_assignments,
--       and judge_evaluations are admin-only for both reads and writes.
--     • All write policies use auth.role() = 'authenticated' AND is_admin().
--     • No service-role credentials are exposed in frontend code.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

-- ─── 0. LEADERBOARD LINK ──────────────────────────────────────
-- Add a nullable FK so leaderboard rows can reference a registered
-- team. Existing rows and the manual admin workflow are unaffected.

alter table public.leaderboard
  add column if not exists team_id uuid;

do $$
begin
  alter table public.leaderboard
    add constraint leaderboard_team_id_fk
    foreign key (team_id) references public.teams(id)
    on delete set null;
exception
  when duplicate_object then null;
end $$;

create index if not exists leaderboard_team_id_idx
  on public.leaderboard (team_id);

-- ─── 1. JUDGES ────────────────────────────────────────────────
-- Profiles for people who evaluate teams. Each row corresponds to a
-- Supabase Auth user. The is_admin() gate means only admins can
-- manage this list; the table is not publicly readable.

create table if not exists public.judges (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  affiliation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists judges_email_idx
  on public.judges (email);

alter table public.judges enable row level security;

drop policy if exists "judges_admin_select" on public.judges;
create policy "judges_admin_select"
  on public.judges for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "judges_admin_insert" on public.judges;
create policy "judges_admin_insert"
  on public.judges for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "judges_admin_update" on public.judges;
create policy "judges_admin_update"
  on public.judges for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "judges_admin_delete" on public.judges;
create policy "judges_admin_delete"
  on public.judges for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- ─── 2. JUDGING ROUNDS ────────────────────────────────────────
-- Distinct from registration_rounds — these are evaluation phases
-- ("Screening", "Semi-Finals", "Finals"). Each round has its own
-- criteria, judge assignments, and produces scores that feed the
-- leaderboard. The single-active-round invariant is NOT enforced
-- here (multiple rounds can run concurrently or sequentially).

create table if not exists public.judging_rounds (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text,
  description text,
  status text not null default 'draft'
    constraint judging_rounds_status_check
    check (status in ('draft', 'active', 'closed')),
  starts_at timestamptz,
  ends_at timestamptz,
  weight numeric(5,2) not null default 1.00
    constraint judging_rounds_weight_non_negative check (weight >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists judging_rounds_status_idx
  on public.judging_rounds (status);

alter table public.judging_rounds enable row level security;

drop policy if exists "judging_rounds_admin_select" on public.judging_rounds;
create policy "judging_rounds_admin_select"
  on public.judging_rounds for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "judging_rounds_admin_insert" on public.judging_rounds;
create policy "judging_rounds_admin_insert"
  on public.judging_rounds for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "judging_rounds_admin_update" on public.judging_rounds;
create policy "judging_rounds_admin_update"
  on public.judging_rounds for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "judging_rounds_admin_delete" on public.judging_rounds;
create policy "judging_rounds_admin_delete"
  on public.judging_rounds for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- ─── 3. EVALUATION CRITERIA ───────────────────────────────────
-- Scoring dimensions within a judging round. Each criterion has a
-- numeric ceiling so judges score on a known scale.
--
--   Example for a "Finals Presentation" round:
--     Innovation (0-25), Technical Depth (0-25),
--     Presentation (0-25), Feasibility (0-25)

create table if not exists public.evaluation_criteria (
  id uuid primary key default gen_random_uuid(),
  judging_round_id uuid not null
    constraint evaluation_criteria_round_fk
    references public.judging_rounds(id) on delete cascade,
  name text not null,
  description text,
  max_score numeric(8,2) not null
    constraint evaluation_criteria_max_score_positive check (max_score > 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint evaluation_criteria_unique_name_per_round
    unique (judging_round_id, name)
);

create index if not exists evaluation_criteria_round_idx
  on public.evaluation_criteria (judging_round_id);

alter table public.evaluation_criteria enable row level security;

drop policy if exists "eval_criteria_admin_select" on public.evaluation_criteria;
create policy "eval_criteria_admin_select"
  on public.evaluation_criteria for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "eval_criteria_admin_insert" on public.evaluation_criteria;
create policy "eval_criteria_admin_insert"
  on public.evaluation_criteria for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "eval_criteria_admin_update" on public.evaluation_criteria;
create policy "eval_criteria_admin_update"
  on public.evaluation_criteria for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "eval_criteria_admin_delete" on public.evaluation_criteria;
create policy "eval_criteria_admin_delete"
  on public.evaluation_criteria for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- ─── 4. JUDGE ROUND ASSIGNMENTS ───────────────────────────────
-- Maps judges to teams within a specific judging round. A judge
-- evaluates only the teams they are assigned to; this prevents
-- accidental cross-evaluation and gives admins fine-grained control.

create table if not exists public.judge_round_assignments (
  id uuid primary key default gen_random_uuid(),
  judging_round_id uuid not null
    constraint jra_round_fk
    references public.judging_rounds(id) on delete cascade,
  judge_id uuid not null
    constraint jra_judge_fk
    references public.judges(id) on delete cascade,
  team_id uuid not null
    constraint jra_team_fk
    references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint judge_round_assignments_unique_assignment
    unique (judging_round_id, judge_id, team_id)
);

create index if not exists jra_round_idx
  on public.judge_round_assignments (judging_round_id);
create index if not exists jra_judge_idx
  on public.judge_round_assignments (judge_id);
create index if not exists jra_team_idx
  on public.judge_round_assignments (team_id);

alter table public.judge_round_assignments enable row level security;

drop policy if exists "jra_admin_select" on public.judge_round_assignments;
create policy "jra_admin_select"
  on public.judge_round_assignments for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "jra_admin_insert" on public.judge_round_assignments;
create policy "jra_admin_insert"
  on public.judge_round_assignments for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "jra_admin_update" on public.judge_round_assignments;
create policy "jra_admin_update"
  on public.judge_round_assignments for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "jra_admin_delete" on public.judge_round_assignments;
create policy "jra_admin_delete"
  on public.judge_round_assignments for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- ─── 5. JUDGE EVALUATIONS ─────────────────────────────────────
-- The atomic scoring unit: one judge scores one team on one criterion
-- within one round. The score must not exceed the criterion's
-- max_score. The unique constraint prevents a judge from scoring the
-- same team on the same criterion twice.
--
-- This table also doubles as the score history — old evaluations are
-- never deleted when a score changes; they are either updated (admin
-- correcting a mark) or a new evaluation row is inserted for a
-- different round. A future history/audit layer can snapshot rows
-- before mutation.

create table if not exists public.judge_evaluations (
  id uuid primary key default gen_random_uuid(),
  judging_round_id uuid not null
    constraint je_round_fk
    references public.judging_rounds(id) on delete cascade,
  judge_id uuid not null
    constraint je_judge_fk
    references public.judges(id) on delete cascade,
  team_id uuid not null
    constraint je_team_fk
    references public.teams(id) on delete cascade,
  evaluation_criteria_id uuid not null
    constraint je_criteria_fk
    references public.evaluation_criteria(id) on delete cascade,
  score numeric(8,2) not null
    constraint je_score_non_negative check (score >= 0),
  remark text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint judge_evaluations_unique_evaluation
    unique (judging_round_id, judge_id, team_id, evaluation_criteria_id)
);

create index if not exists je_round_idx
  on public.judge_evaluations (judging_round_id);
create index if not exists je_judge_idx
  on public.judge_evaluations (judge_id);
create index if not exists je_team_idx
  on public.judge_evaluations (team_id);

alter table public.judge_evaluations enable row level security;

drop policy if exists "je_admin_select" on public.judge_evaluations;
create policy "je_admin_select"
  on public.judge_evaluations for select
  using (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "je_admin_insert" on public.judge_evaluations;
create policy "je_admin_insert"
  on public.judge_evaluations for insert
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "je_admin_update" on public.judge_evaluations;
create policy "je_admin_update"
  on public.judge_evaluations for update
  using (auth.role() = 'authenticated' and public.is_admin())
  with check (auth.role() = 'authenticated' and public.is_admin());

drop policy if exists "je_admin_delete" on public.judge_evaluations;
create policy "je_admin_delete"
  on public.judge_evaluations for delete
  using (auth.role() = 'authenticated' and public.is_admin());

-- ─── 6. AUTO-TOUCH TRIGGERS ──────────────────────────────────
-- Keep updated_at fresh on every mutating write.

create or replace function public.touch_judging_round_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_judging_rounds_touch_updated_at
  on public.judging_rounds;
create trigger trg_judging_rounds_touch_updated_at
  before update on public.judging_rounds
  for each row execute function public.touch_judging_round_updated_at();

create or replace function public.touch_judge_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_judges_touch_updated_at
  on public.judges;
create trigger trg_judges_touch_updated_at
  before update on public.judges
  for each row execute function public.touch_judge_updated_at();

create or replace function public.touch_evaluation_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_judge_evaluations_touch_updated_at
  on public.judge_evaluations;
create trigger trg_judge_evaluations_touch_updated_at
  before update on public.judge_evaluations
  for each row execute function public.touch_evaluation_updated_at();

-- ─── 7. SCORE CEILING ENFORCEMENT ─────────────────────────────
-- Prevent evaluations that exceed the criterion's max_score. Uses a
-- deferred trigger so the evaluation_criteria row is visible in the
-- same statement.

create or replace function public.enforce_evaluation_score_ceiling()
returns trigger
language plpgsql
as $$
declare
  v_max numeric;
begin
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

-- ─── 8. COMMENTS ──────────────────────────────────────────────

comment on table public.judges is
  'VOIDHACK 2026 judge profiles. Each row is a Supabase Auth user authorised to evaluate teams.';

comment on table public.judging_rounds is
  'VOIDHACK 2026 evaluation phases (e.g. Screening, Semi-Finals, Finals). Each round defines its own criteria and produces scores that feed the leaderboard.';

comment on table public.evaluation_criteria is
  'Scoring dimensions within a judging round. Each criterion has a numeric ceiling (max_score) that judges cannot exceed.';

comment on table public.judge_round_assignments is
  'Maps judges to teams within a specific judging round. Controls which teams each judge evaluates.';

comment on table public.judge_evaluations is
  'One score per judge × team × criterion within a round. The atomic scoring unit; also doubles as score history when scores are corrected.';

comment on column public.leaderboard.team_id is
  'Optional link to a registered team. When set, the leaderboard entry represents a real registration; when null, it is a manually managed entry.';

comment on column public.judging_rounds.weight is
  'Multiplier applied to this round''s scores when computing the final leaderboard total (e.g. 0.25 for screening, 1.00 for finals).';

-- ─── DONE ─────────────────────────────────────────────────────

notify pgrst, 'reload schema';

commit;