/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Single Supabase clients
   The public publisher key only. Two clients:

     getSupabase()        — anonymous flow (registration): RLS grants
                            SELECT on problem_statements and anonymous
                            INSERT on teams / participants.
     getAdminSupabase()   — admin interface: uses an authenticated
                            Supabase Auth session so the RLS "authentic­
                            ated" SELECT/UPDATE policies apply.

   Both are created lazily so the landing page never crashes when env
   vars are absent — the registration/admin screens surface config
   errors instead.
   ═══════════════════════════════════════════════════════════════ */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

let client = null;
let adminClient = null;

export function getSupabase() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export function getAdminSupabase() {
  if (!adminClient) {
    adminClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'vh_admin_session',
        detectSessionInUrl: false,
      },
    });
  }
  return adminClient;
}