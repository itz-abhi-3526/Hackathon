-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Registration email service (additive)
--   Adds the single column the admin → email flow needs:
--
--     teams.rejection_reason text (nullable)
--       Admin-entered reason captured when a payment is marked
--       REJECTED. Sent back to the team lead by the
--       send-registration-email Edge Function. NULL for teams that
--       were never rejected (or rejected without a note).
--
--   No tables, RLS policies or triggers are touched. teams already
--   has admin-only UPDATE RLS (see 20260913000000), so the admin UI
--   can write this column with its existing authenticated client.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

alter table public.teams add column if not exists rejection_reason text;

comment on column public.teams.rejection_reason is
  'Admin-supplied reason attached when teams.payment_status is set to rejected; used by the registration email Edge Function.';