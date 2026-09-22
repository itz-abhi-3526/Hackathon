/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Admin layout: sidebar + header + main
   Sidebar is collapsible on desktop and a drawer on mobile. This
   layout renders ONLY inside #admin — nothing here touches the
   public site.
   ═══════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import { initials } from '../utils/format.js';

export const SIDEBAR_ITEMS = [
  { view: 'dashboard', label: 'OVERVIEW', icon: '◈' },
  { view: 'teams', label: 'TEAMS', icon: '▣' },
  { view: 'participants', label: 'PARTICIPANTS', icon: '◉' },
  { view: 'attendance', label: 'ATTENDANCE', icon: '☑' },
  { view: 'scanner', label: 'SCANNER', icon: '◢' },
  { view: 'problem-statements', label: 'PROBLEM STATEMENTS', icon: '✎' },
  { view: 'rounds', label: 'REGISTRATION', icon: '◫' },
  { view: 'payments', label: 'PAYMENTS', icon: '₹' },
  { view: 'reports', label: 'REPORTS / DOWNLOADS', icon: '⇩' },
];

const VIEW_TITLES = {
  dashboard: 'DASHBOARD',
  teams: 'TEAMS',
  participants: 'PARTICIPANTS',
  attendance: 'ATTENDANCE',
  scanner: 'ATTENDANCE SCANNER',
  'problem-statements': 'PROBLEM STATEMENTS',
  rounds: 'REGISTRATION ROUNDS',
  payments: 'PAYMENTS',
  reports: 'REPORTS & DOWNLOADS',
};

export function AdminSidebar({ view, navigate, collapsed, onNavigate }) {
  return (
    <nav className={`cpa-side${collapsed ? ' cpa-side--collapsed' : ''}`} aria-label="Admin navigation">
      <div className="cpa-side__brand">
        <span className="cpa-side__mark" aria-hidden="true">V/</span>
        {!collapsed && (
          <span className="cpa-side__brandtext">
            <strong>VOIDHACK</strong>
            <em>CONTROL CENTER / 2026</em>
          </span>
        )}
      </div>
      <ul className="cpa-side__list">
        {SIDEBAR_ITEMS.map((item) => (
          <li key={item.view}>
            <button
              type="button"
              className={`cpa-side__link${view === item.view ? ' cpa-side__link--on' : ''}`}
              title={item.label}
              aria-current={view === item.view ? 'page' : undefined}
              onClick={() => {
                navigate(item.view);
                onNavigate?.();
              }}
            >
              <span className="cpa-side__icon" aria-hidden="true">{item.icon}</span>
              {!collapsed && <span className="cpa-side__label">{item.label}</span>}
            </button>
          </li>
        ))}
      </ul>
      <div className="cpa-side__foot">
        {!collapsed && (
          <span className="cpa-side__footnote">
            VOIDHACK 2026
            <br />
            OPS PLATFORM v1.0
          </span>
        )}
      </div>
    </nav>
  );
}

export function AdminHeader({
  view,
  user,
  collapsed,
  onToggleCollapse,
  mobileOpen,
  onToggleMobile,
  onSignOut,
  onViewSite,
}) {
  return (
    <header className="cpa-top">
      <div className="cpa-top__left">
        <button
          type="button"
          className="cpa-top__burger cpa-top__burger--mobile"
          onClick={onToggleMobile}
          aria-label="Toggle navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? '×' : '☰'}
        </button>
        <button
          type="button"
          className="cpa-top__burger cpa-top__burger--desktop"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '»' : '«'}
        </button>
        <h2 className="cpa-top__title">{VIEW_TITLES[view] ?? 'DASHBOARD'}</h2>
      </div>
      <div className="cpa-top__right">
        <span className="cpa-top__status" title="Supabase session live">
          <span className="cpa-top__status-dot" aria-hidden="true" />
          <span className="cpa-top__status-text">LIVE</span>
        </span>
        <div className="cpa-top__user">
          <span className="cpa-top__avatar" aria-hidden="true">{initials(user?.email)}</span>
          <span className="cpa-top__identity">
            <span className="cpa-top__name">{user?.user_metadata?.full_name || user?.email}</span>
            <span className="cpa-top__email">{user?.email}</span>
          </span>
        </div>
        <button type="button" className="cpa-top__link" onClick={onViewSite}>VIEW SITE</button>
        <button type="button" className="cpa-top__link cpa-top__link--danger" onClick={onSignOut}>SIGN OUT</button>
      </div>
    </header>
  );
}

export default function AdminLayout({ view, navigate, user, onSignOut, onViewSite, children }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className={`cpa${collapsed ? ' cpa--collapsed' : ''}`}>
      <div className={`cpa-mobile-scrim${mobileOpen ? ' cpa-mobile-scrim--on' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <div className={`cpa-sidewrap${mobileOpen ? ' cpa-sidewrap--open' : ''}`}>
        <AdminSidebar
          view={view}
          navigate={navigate}
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />
      </div>
      <div className="cpa__body">
        <AdminHeader
          view={view}
          user={user}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((v) => !v)}
          mobileOpen={mobileOpen}
          onToggleMobile={() => setMobileOpen((v) => !v)}
          onSignOut={onSignOut}
          onViewSite={onViewSite}
        />
        <main className="cpa__main">{children}</main>
      </div>
    </div>
  );
}