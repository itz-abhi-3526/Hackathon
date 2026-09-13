/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Admin authentication service
   Wraps the existing authenticated Supabase client (publishable key
   only — never a service-role key in the browser). Authorization is a
   two-layer check:
     1. Supabase Auth session (the only way to obtain `authenticated`).
     2. public.is_admin() RPC          — email must sit in the
        public.admin_users allowlist. The same predicate is enforced by
        database RLS, so a forged UI can never read registration data.
   ═══════════════════════════════════════════════════════════════ */

import { getAdminSupabase } from '../../lib/supabase.js';
import { AppError } from '../../lib/api.js';

/**
 * True only when the signed-in user's email is on the server-side
 * admin allowlist (public.admin_users). Secure failure: on any RPC /
 * policy breakdown the caller is NOT treated as an admin.
 */
export async function verifyIsAdmin() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc('is_admin');
  if (error) {
    throw new AppError(
      'ADMIN AUTHORIZATION UNAVAILABLE \u2014 The is_admin() database function is not deployed. Run the admin control center migration.',
      'ADMIN_GATE_MISSING',
      error
    );
  }
  return data === true;
}

export async function adminSignIn(email, password) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data?.session?.user) throw new AppError('ADMIN SIGN-IN FAILED', 'SIGN_IN_FAILED');
  return data.session.user;
}

export async function adminSignOut() {
  const supabase = getAdminSupabase();
  try {
    await supabase.auth.signOut();
  } catch {
    /* session already gone — treat as signed out */
  }
}

export async function adminGetSession() {
  const supabase = getAdminSupabase();
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}