-- ═══════════════════════════════════════════════════════════════
--   VOIDHACK 2026 — Verification email tracking (additive)
--   Adds the columns needed to track the admin → verification-email
--   flow on the teams row (the registration itself):
--
--     teams.verification_email_status       text (pending|sent|failed)
--     teams.verification_email_sent_at      timestamptz (last successful send)
--     teams.verification_email_last_error   text (last failure detail)
--     teams.verification_email_send_count   integer (resends increment)
--     teams.verification_email_last_sent_to text (recipient = team lead)
--
--   Only the READ/UPDATE paths change — no new RLS policies, tables or
--   triggers. teams already has admin-only UPDATE RLS (see
--   20260913000000), so the admin Edge Function can write these with
--   the caller session; anon can never reach them.
--
--   Run in the Supabase SQL Editor as one transaction. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

alter table public.teams
  add column if not exists verification_email_status text not null default 'pending',
  add column if not exists verification_email_sent_at timestamptz,
  add column if not exists verification_email_last_error text,
  add column if not exists verification_email_send_count integer not null default 0,
  add column if not exists verification_email_last_sent_to text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_verification_email_status_check'
  ) then
    alter table public.teams
      add constraint teams_verification_email_status_check
      check (verification_email_status in ('pending', 'sent', 'failed'));
  end if;
end $$;

comment on column public.teams.verification_email_status is
  'Tracking for the admin-sent verification email: pending (not sent), sent (delivered), failed (send error). Written only after a successful SMTP send.';
comment on column public.teams.verification_email_sent_at is
  'Timestamp of the last successful verification-email send.';
comment on column public.teams.verification_email_last_error is
  'Last failure detail when verification_email_status = failed (SMTP errors only, never secrets).';
comment on column public.teams.verification_email_send_count is
  'Number of successful verification-email sends (resends increment this).';
comment on column public.teams.verification_email_last_sent_to is
  'Email address of the recipient of the last successful send (the team lead).';

notify pgrst, 'reload schema';

commit;