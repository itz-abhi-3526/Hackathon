-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — WhatsApp confirmation tracking (ADDITIVE)
--   Mirror of 20260919000000_verification_email_tracking.sql for the
--   WhatsApp delivery channel, so the admin UI can show SENT / FAILED
--   and an operator can see whether a confirmation already went out.
--
--     teams.whatsapp_status        text (pending|sent|failed)
--     teams.whatsapp_sent_at       timestamptz (last successful send)
--     teams.whatsapp_last_error    text (last failure CODE only)
--     teams.whatsapp_send_count    integer (resends increment)
--     teams.whatsapp_last_sent_to  text (E.164 recipient = team lead)
--
--   NOTHING else changes:
--     • no new table, no trigger, no RLS policy — teams already has
--       admin-only UPDATE (20260913000000), so the Edge Function can
--       write these with the caller session; anon can never reach them
--     • payment_status / registration state are NEVER touched, and the
--       email tracking columns are NOT reused
--     • the columns are written ONLY after Meta accepts the message, so
--       a failure can never look like a delivered confirmation
--
--   Run in the Supabase SQL Editor as one transaction. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════
begin;

alter table public.teams
  add column if not exists whatsapp_status text not null default 'pending',
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists whatsapp_last_error text,
  add column if not exists whatsapp_send_count integer not null default 0,
  add column if not exists whatsapp_last_sent_to text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teams_whatsapp_status_check'
  ) then
    alter table public.teams
      add constraint teams_whatsapp_status_check
      check (whatsapp_status in ('pending', 'sent', 'failed'));
  end if;
end $$;

comment on column public.teams.whatsapp_status is
  'Tracking for the WhatsApp confirmation channel: pending (not sent), sent (Meta accepted the message), failed (send error). Written only after a successful Meta send.';
comment on column public.teams.whatsapp_sent_at is
  'Timestamp of the last successful WhatsApp confirmation send.';
comment on column public.teams.whatsapp_last_error is
  'Failure CODE of the last failed WhatsApp send (e.g. WHATSAPP_SEND_FAILED, LEAD_PHONE_INVALID). Never a Meta error body — it can echo the recipient number.';
comment on column public.teams.whatsapp_send_count is
  'Number of successful WhatsApp confirmation sends (resends increment this).';
comment on column public.teams.whatsapp_last_sent_to is
  'E.164 recipient number of the last successful WhatsApp send (the team lead).';

notify pgrst, 'reload schema';

commit;
