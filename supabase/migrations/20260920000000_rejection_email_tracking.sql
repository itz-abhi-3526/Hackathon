-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Rejection email tracking (additive)
--   Mirrors the verification-email tracking (20260919000000) for the
--   admin → reject → rejection-email flow. The rejection email is now
--   sent manually from the admin Registrations page (never automatic),
--   using the reason stored in teams.rejection_reason.
--
--     teams.rejection_email_status       text (pending|sent|failed)
--     teams.rejection_email_sent_at      timestamptz (last successful send)
--     teams.rejection_email_last_error   text (last failure detail)
--     teams.rejection_email_send_count   integer (resends increment)
--     teams.rejection_email_last_sent_to text (recipient = team lead)
--
--   Run in the Supabase SQL Editor as one transaction. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

alter table public.teams
  add column if not exists rejection_email_status text not null default 'pending',
  add column if not exists rejection_email_sent_at timestamptz,
  add column if not exists rejection_email_last_error text,
  add column if not exists rejection_email_send_count integer not null default 0,
  add column if not exists rejection_email_last_sent_to text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_rejection_email_status_check'
  ) then
    alter table public.teams
      add constraint teams_rejection_email_status_check
      check (rejection_email_status in ('pending', 'sent', 'failed'));
  end if;
end $$;

comment on column public.teams.rejection_email_status is
  'Tracking for the admin-sent rejection email: pending (not sent), sent (delivered), failed (send error). Written only after a successful SMTP send.';
comment on column public.teams.rejection_email_sent_at is
  'Timestamp of the last successful rejection-email send.';
comment on column public.teams.rejection_email_last_error is
  'Last failure detail when rejection_email_status = failed (SMTP errors only, never secrets).';
comment on column public.teams.rejection_email_send_count is
  'Number of successful rejection-email sends (resends increment this).';
comment on column public.teams.rejection_email_last_sent_to is
  'Email address of the recipient of the last successful send (the team lead).';

notify pgrst, 'reload schema';

commit;