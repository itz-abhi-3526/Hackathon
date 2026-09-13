/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — AdminApp (the whole control center)
   Mounted only inside the App.jsx `admin` phase. Owns:
     • Supabase auth session + admin allowlist gate (useAdminAuth)
     • #admin/<view> hash routing (useAdminRoute)
     • the shell (sidebar + header) and every page
   The public site never imports anything from here.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { ToastProvider } from './components/Toast.jsx';
import { useAdminAuth } from './hooks/useAdminAuth.js';
import { useAdminRoute } from './hooks/useAdminRoute.js';
import AdminLayout from './components/Layout.jsx';
import TeamDetailsDrawer from './components/TeamDetailsDrawer.jsx';
import AdminLogin from './pages/AdminLogin.jsx';
import AccessDenied from './pages/AccessDenied.jsx';
import Overview from './pages/Overview.jsx';
import Teams from './pages/Teams.jsx';
import Participants from './pages/Participants.jsx';
import ProblemStatements from './pages/ProblemStatements.jsx';
import Payments from './pages/Payments.jsx';
import Rounds from './pages/Rounds.jsx';
import Reports from './pages/Reports.jsx';
import './admin.css';

function BootScreen({ label }) {
  return (
    <div className="cpa-boot">
      <div className="cpa-boot__card">
        <span className="cpa-boot__mark" aria-hidden="true">V/</span>
        <span className="cpa-boot__label">{label}</span>
        <span className="cpa-boot__bar"><span /></span>
      </div>
    </div>
  );
}

function PageFor({ view, onOpenTeam, refreshToken }) {
  switch (view) {
    case 'teams':
      return <Teams />;
    case 'participants':
      return <Participants />;
    case 'problem-statements':
      return <ProblemStatements />;
    case 'rounds':
      return <Rounds />;
    case 'payments':
      return <Payments />;
    case 'reports':
      return <Reports />;
    default:
      return <Overview onOpenTeam={onOpenTeam} refreshToken={refreshToken} />;
  }
}

export default function AdminApp({ onExit }) {
  const { status, user, error, busy, signIn, signOut } = useAdminAuth();
  const { view, navigate } = useAdminRoute();
  const [topTeam, setTopTeam] = useState(null);
  const [tick, setTick] = useState(0);

  /* A signed-in admin landing on the bare `#admin` hash gets the 'login'
     route view; promote them to the dashboard so the URL matches the UI. */
  useEffect(() => {
    if (status === 'ready' && view === 'login') navigate('dashboard');
  }, [status, view, navigate]);

  if (status === 'checking') {
    return (
      <ToastProvider>
        <BootScreen label="AUTHENTICATING SESSION…" />
      </ToastProvider>
    );
  }

  if (status === 'signed_out') {
    return (
      <ToastProvider>
        <AdminLogin signIn={signIn} busy={busy} error={error} onViewSite={onExit} />
      </ToastProvider>
    );
  }

  if (status === 'access_denied' || status === 'error') {
    return (
      <ToastProvider>
        <AccessDenied email={user?.email} error={error} onSignOut={signOut} onViewSite={onExit} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <AdminLayout
        view={view}
        navigate={navigate}
        user={user}
        onSignOut={signOut}
        onViewSite={onExit}
      >
        <PageFor view={view} onOpenTeam={setTopTeam} refreshToken={tick} />
      </AdminLayout>

      {topTeam && (
        <TeamDetailsDrawer
          teamId={topTeam}
          onClose={() => setTopTeam(null)}
          onChanged={() => setTick((t) => t + 1)}
        />
      )}
    </ToastProvider>
  );
}