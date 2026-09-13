/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Admin auth hook
   Owns the Supabase session + admin allowlist check + login/logout.
   status: 'checking' | 'signed_out' | 'access_denied' | 'ready' | 'error'
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAdminSupabase } from '../../lib/supabase.js';
import { adminSignIn, adminSignOut, verifyIsAdmin } from '../services/adminAuth.js';
import { friendlyError } from '../../lib/api.js';

export function useAdminAuth() {
  const supabase = getAdminSupabase();
  const [status, setStatus] = useState('checking');
  const [user, setUser] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);

  const runGate = useCallback(async (u) => {
    if (!u) {
      setUser(null);
      setStatus('signed_out');
      return;
    }
    setUser(u);
    setStatus('checking');
    setError('');
    try {
      const ok = await verifyIsAdmin();
      if (!alive.current) return;
      if (ok) setStatus('ready');
      else setStatus('access_denied');
    } catch (err) {
      if (!alive.current) return;
      setError(friendlyError(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      if (!u) {
        if (alive.current) {
          setUser(null);
          setStatus('signed_out');
        }
        return;
      }
      runGate(u);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!alive.current) return;
      if (data?.session?.user) runGate(data.session.user);
      else setStatus('signed_out');
    });

    return () => {
      alive.current = false;
      sub?.subscription?.unsubscribe();
    };
  }, [supabase, runGate]);

  const signIn = useCallback(
    async (email, password) => {
      setBusy(true);
      setError('');
      try {
        const u = await adminSignIn(email, password);
        await runGate(u);
      } catch (err) {
        setError(/Invalid login credentials/i.test(String(err?.message ?? ''))
          ? 'INVALID CREDENTIALS \u2014 Check the email and password.'
          : friendlyError(err));
        setStatus('signed_out');
      } finally {
        setBusy(false);
      }
    },
    [runGate]
  );

  const signOut = useCallback(async () => {
    setStatus('checking');
    await adminSignOut();
    if (alive.current) {
      setUser(null);
      setStatus('signed_out');
    }
  }, []);

  return { supabase, status, user, error, busy, signIn, signOut };
}