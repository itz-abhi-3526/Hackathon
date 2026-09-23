/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Admin hash router
   The public site routes on #hash (App.jsx), so the control center
   keeps the same architecture: #admin/<view>. Deep links, refresh and
   browser back/forward all work through the native hashchange event.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';

export const ADMIN_VIEWS = {
  '': 'login',
  login: 'login',
  dashboard: 'dashboard',
  teams: 'teams',
  participants: 'participants',
  attendance: 'attendance',
  scanner: 'scanner',
  'problem-statements': 'problem-statements',
  rounds: 'rounds',
  leaderboard: 'leaderboard',
  judging: 'judging',
  payments: 'payments',
  reports: 'reports',
};

export function parseAdminHash() {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  if (!hash.startsWith('#admin')) return 'login';
  const rest = hash.slice('#admin'.length).replace(/^\/+/, '');
  if (rest === '') return 'login';
  return ADMIN_VIEWS[rest] ? rest : 'dashboard';
}

export function useAdminRoute() {
  const [view, setView] = useState(() => parseAdminHash());

  useEffect(() => {
    const onHash = () => setView(parseAdminHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((next) => {
    const target = next ? `#admin/${next}` : '#admin';
    if (window.location.hash !== target) {
      window.location.hash = target;
    } else {
      setView(parseAdminHash());
    }
  }, []);

  return { view, navigate };
}