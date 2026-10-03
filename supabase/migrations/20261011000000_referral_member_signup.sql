-- ═══════════════════════════════════════════════════════════════
--   HACK2PITCH 2026 — Referral program signup RPC (additive)
--
--   Adds ONE public function:
--     register_referral_member(p_full_name text, p_email text)
--
--   • Callable by anon/authenticated (the existing anonymous
--     architecture — no auth required).
--   • SECURITY DEFINER because referral_members has NO public INSERT
--     policy (and must keep it that way — the browser can never write
--     it directly).
--   • Generates the referral code SERVER-SIDE from cryptographically
--     secure randomness (extensions.gen_random_bytes) — never from a
--     UUID/email/name/timestamp/id — and retries on collision while
--     the INSERT stays protected by UNIQUE(referral_code).
--   • Returns only the caller's own signup result. Duplicate emails
--     (including a concurrent-insert race) return a clean
--     ALREADY_REGISTERED application result — no raw PG errors.
--
--   SECURITY
--     • search_path pinned to ''; every schema object qualified.
--     • EXECUTE revoked from public, then granted to anon/authenticated.
--     • referral_members stays RLS-on with NO new policies.
--
--   Does NOT touch register_team, teams, payments, rounds, capacity,
--   registration, or any existing object.
--
--   Run in the Supabase SQL Editor. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════

create or replace function public.register_referral_member(p_full_name text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_name     text;
  v_email    text;
  v_code     text;
  v_id       uuid;
  v_bytes    bytea;
  v_num      bigint;
  v_idx      integer;
  v_i        integer;
  v_attempt  integer;
  v_constraint text;
begin
  v_name  := btrim(coalesce(p_full_name, ''));
  v_email := lower(btrim(coalesce(p_email, '')));

  if v_name = '' then
    return jsonb_build_object(
      'success', false,
      'code',    'INVALID_NAME',
      'message', 'Full name is required.'
    );
  end if;

  if length(v_name) > 200 then
    return jsonb_build_object(
      'success', false,
      'code',    'INVALID_NAME',
      'message', 'Full name is too long.'
    );
  end if;

  if v_email = '' then
    return jsonb_build_object(
      'success', false,
      'code',    'INVALID_EMAIL',
      'message', 'An email address is required.'
    );
  end if;

  if length(v_email) > 254 then
    return jsonb_build_object(
      'success', false,
      'code',    'INVALID_EMAIL',
      'message', 'Email address is too long.'
    );
  end if;

  if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object(
      'success', false,
      'code',    'INVALID_EMAIL',
      'message', 'Please enter a valid email address.'
    );
  end if;

  -- First-line duplicate guard (UNIQUE(email) remains the final stop).
  if exists (
    select 1 from public.referral_members where email = v_email
  ) then
    return jsonb_build_object(
      'success', false,
      'code',    'ALREADY_REGISTERED',
      'message', 'This email is already registered for the referral program.'
    );
  end if;

  -- Server-side code generation: 30 unbiased random bits -> six 5-bit
  -- symbols from the 32-char alphabet (no 0/O/1/I). Retry on collision.
  for v_attempt in 1 .. 10 loop
    v_code  := 'H2P-';
    v_bytes := extensions.gen_random_bytes(4);
    v_num   := get_byte(v_bytes, 0)::bigint * 16777216
             + get_byte(v_bytes, 1)::bigint * 65536
             + get_byte(v_bytes, 2)::bigint * 256
             + get_byte(v_bytes, 3)::bigint;

    for v_i in 1 .. 6 loop
      v_idx  := (v_num % 32) + 1;
      v_code := v_code || substr(v_alphabet, v_idx, 1);
      v_num  := v_num >> 5;
    end loop;

    begin
      insert into public.referral_members (full_name, email, referral_code)
      values (v_name, v_email, v_code)
      returning id, referral_code into v_id, v_code;

      return jsonb_build_object(
        'success', true,
        'referral_member', jsonb_build_object(
          'id',            v_id,
          'full_name',     v_name,
          'referral_code', v_code,
          'points',        0
        )
      );
    exception when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'referral_members_email_key' then
        return jsonb_build_object(
          'success', false,
          'code',    'ALREADY_REGISTERED',
          'message', 'This email is already registered for the referral program.'
        );
      end if;
      -- else: referral-code collision -> loop and generate a fresh one
    end;
  end loop;

  return jsonb_build_object(
    'success', false,
    'code',    'SIGNUP_FAILED',
    'message', 'Could not complete the signup. Please try again.'
  );
end;
$$;

revoke all on function public.register_referral_member(text, text) from public;
grant execute on function public.register_referral_member(text, text) to anon, authenticated;

comment on function public.register_referral_member(text, text) is
  'HACK2PITCH 2026 referral-program signup. SECURITY DEFINER: validates + lowercases the email, rejects duplicates with ALREADY_REGISTERED, generates a unique H2P-XXXXXX referral code server-side from cryptographically secure randomness, and inserts the referral member. Returns ONLY the caller''s own result.';

notify pgrst, 'reload schema';