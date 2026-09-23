-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Corrective migration: schema-qualify
--   gen_random_bytes() in the attendance token function
--   (ADDITIVE, IDEMPOTENT, SAFE TO RE-RUN)
--
--   ROOT CAUSE (observed in production, error 42883
--   "function gen_random_bytes(integer) does not exist")
--   pgcrypto's gen_random_bytes(integer) is installed in the
--   'extensions' schema (Supabase default). The trigger function
--   public.ensure_attendance_token() is SECURITY DEFINER and pins
--   search_path = public, pg_temp, which never includes 'extensions',
--   so the UNQUALIFIED call gen_random_bytes(24) cannot resolve at
--   runtime — even though the function exists. Every admin VERIFIED
--   action (UPDATE teams SET payment_status='verified') aborts in the
--   before-update trigger, so verification and the success email fail.
--
--   FIX
--   Call the exact same builtin with an explicit schema qualifier:
--   extensions.gen_random_bytes(24). Schema-qualified calls bypass
--   search_path entirely, so no extension changes and no search_path
--   changes are needed. The token format, length, uniqueness,
--   stability and behavior are preserved byte-for-byte.
--
--   SCOPE
--   This file ONLY recreates the single affected attendance function.
--   No tables, no RLS, no triggers, no policies, no grants, no other
--   functions, and no registration/payment/email logic are touched.
--   The 20260921140000_attendance_system.sql migration was ALREADY
--   applied to production and is intentionally NOT re-run here; this
--   corrective file heals the deployed function in place.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.ensure_attendance_token()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.payment_status = 'verified' and new.attendance_token is null then
    new.attendance_token := encode(extensions.gen_random_bytes(24), 'hex');
  end if;
  return new;
end;
$$;