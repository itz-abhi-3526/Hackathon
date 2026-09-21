/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Judging dev seed (additive, safe to re-run)
   Seeds TWO DEV judging rounds with COMPLETELY DIFFERENT placeholder
   marking schemes (Screening: five × 20; Finals: 40/25/20/15) plus one
   dev judge, so round-scoped, configurable criteria can be verified
   end-to-end before the real marking scheme is handed over. Nothing
   about the scoring architecture depends on these values — every row
   is a normal table row an admin can edit/delete/replace from the
   admin UI. Fixed ids make every insert idempotent.

   PLACEHOLDERS ONLY (dev scaffolding). Replace or delete these rows
   via the admin criteria manager; the real scheme will differ.
   ═══════════════════════════════════════════════════════════════ */

begin;

-- Active dev round used by the Judging page until real rounds are built.
insert into public.judging_rounds (id, title, slug, description, status)
values (
  'd0000000-0000-4000-8000-000000000001',
  'Screening — DEV',
  'screening-dev',
  'DEVELOPMENT PLACEHOLDER ROUND. The final marking scheme will replace this configuration.',
  'active'
)
on conflict (id) do nothing;

-- Single "Head Judge" so evaluations have a real judge row. Admins
-- using the admin flow evaluate through this row; the final flow can
-- add real judges per assignment.
insert into public.judges (id, full_name, email, affiliation)
values (
  'd0000000-0000-4000-8000-000000000002',
  'Head Judge (Admin)',
  'head-judge@voidhack.in',
  'VOIDHACK 2026'
)
on conflict (id) do nothing;

insert into public.evaluation_criteria
  (id, judging_round_id, name, description, max_score, sort_order)
values
  (
    'd0000000-0000-4000-8000-000000000011',
    'd0000000-0000-4000-8000-000000000001',
    'UI & Design',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    20,
    0
  ),
  (
    'd0000000-0000-4000-8000-000000000012',
    'd0000000-0000-4000-8000-000000000001',
    'Idea & Novelty',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    20,
    1
  ),
  (
    'd0000000-0000-4000-8000-000000000013',
    'd0000000-0000-4000-8000-000000000001',
    'Backend & Technology',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    20,
    2
  ),
  (
    'd0000000-0000-4000-8000-000000000014',
    'd0000000-0000-4000-8000-000000000001',
    'Innovation',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    20,
    3
  ),
  (
    'd0000000-0000-4000-8000-000000000015',
    'd0000000-0000-4000-8000-000000000001',
    'Presentation',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    20,
    4
  )
on conflict (id) do nothing;

-- Second dev round with a DIFFERENT marking scheme, so round-scoped
-- criteria (Round 1 =/= Round 2) can be verified before real rounds are
-- created from the admin UI. Placeholder only.
insert into public.judging_rounds (id, title, slug, description, status)
values (
  'd0000000-0000-4000-8000-000000000003',
  'Finals — DEV',
  'finals-dev',
  'DEVELOPMENT PLACEHOLDER ROUND. Demonstrates that every round carries its own completely different criteria set.',
  'draft'
)
on conflict (id) do nothing;

insert into public.evaluation_criteria
  (id, judging_round_id, name, description, max_score, sort_order)
values
  (
    'd0000000-0000-4000-8000-000000000021',
    'd0000000-0000-4000-8000-000000000003',
    'Innovation & Impact',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    40,
    0
  ),
  (
    'd0000000-0000-4000-8000-000000000022',
    'd0000000-0000-4000-8000-000000000003',
    'Technical Execution',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    25,
    1
  ),
  (
    'd0000000-0000-4000-8000-000000000023',
    'd0000000-0000-4000-8000-000000000003',
    'Live Demo',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    20,
    2
  ),
  (
    'd0000000-0000-4000-8000-000000000024',
    'd0000000-0000-4000-8000-000000000003',
    'Q&A / Presentation',
    'PLACEHOLDER CRITERION — REPLACE WITH FINAL MARKING SCHEME',
    15,
    3
  )
on conflict (id) do nothing;

commit;