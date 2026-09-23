import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAdminSupabase } from '../../lib/supabase.js';
import { TEAM_PAYMENT_STATUS } from '../../lib/schema.js';
import {
  adminFetchTeams,
  adminFetchParticipants,
  adminFetchProblems,
  adminUpdatePaymentStatus,
  foodPreferenceLabel,
} from '../../services/registrationService.js';
import './Admin.css';

const STATUS_ORDER = Object.values(TEAM_PAYMENT_STATUS);

function codeFor(team) {
  const suffix = String(team?.id ?? '').replace(/[^a-f0-9]/gi, '').slice(-6).toUpperCase();
  return suffix ? `VH-2026-${suffix}` : '\u2014';
}

function dateLabel(iso) {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Admin({ onExit }) {
  const supabase = getAdminSupabase();
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [teams, setTeams] = useState([]);
  const [participantsByTeam, setParticipantsByTeam] = useState({});
  const [problemsById, setProblemsById] = useState({});
  const [expanded, setExpanded] = useState({});
  const [updating, setUpdating] = useState({});
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive && data?.session?.user) setUser(data.session.user);
    });
    return () => { alive = false; };
  }, [supabase]);

  const refreshData = useCallback(async () => {
    const [teamRows, problemRows] = await Promise.all([
      adminFetchTeams(),
      adminFetchProblems(),
    ]);

    const ids = (teamRows ?? []).map((t) => t.id);
    const parts = ids.length ? await adminFetchParticipants(ids) : [];

    setTeams(teamRows ?? []);
    const byTeam = {};
    (parts ?? []).forEach((p) => {
      byTeam[p.team_id] = byTeam[p.team_id] || [];
      byTeam[p.team_id].push(p);
    });
    setParticipantsByTeam(byTeam);

    const byId = {};
    (problemRows ?? []).forEach((p) => { byId[p.id] = p; });
    setProblemsById(byId);
  }, []);

  useEffect(() => {
    if (user) {
      refreshData().catch((err) => setError(err.message));
    }
  }, [user, refreshData]);

  const signIn = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      if (!data?.session?.user) throw new Error('ADMIN SIGN-IN FAILED');
      setUser(data.session.user);
    } catch (err) {
      setError(/invalid/i.test(err?.message)
        ? 'INVALID CREDENTIALS — Check the email and password.'
        : err?.message ?? 'SIGN-IN FAILED');
    } finally {
      setBusy(false);
    }
  }, [supabase, email, password]);

  const signOut = useCallback(async () => {
    setError('');
    setNotice('');
    setUser(null);
    setTeams([]);
    setParticipantsByTeam({});
    setExpanded({});
    try {
      await supabase.auth.signOut();
    } catch {
      /* session already gone — treat as signed out */
    }
  }, [supabase]);

  const toggleExpand = useCallback((id) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const changeStatus = useCallback(async (teamId, status) => {
    setError('');
    setNotice('');
    setUpdating((prev) => ({ ...prev, [teamId]: true }));
    try {
      await adminUpdatePaymentStatus(teamId, status);
      setTeams((prev) => prev.map((t) => (t.id === teamId ? { ...t, payment_status: status } : t)));
      setNotice('STATUS UPDATED');
    } catch (err) {
      setError(err.message);
    } finally {
      setUpdating((prev) => ({ ...prev, [teamId]: false }));
    }
  }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'ALL') return teams;
    return teams.filter((t) => t.payment_status === statusFilter);
  }, [teams, statusFilter]);

  const stats = useMemo(() => {
    const out = { total: teams.length };
    STATUS_ORDER.forEach((s) => {
      out[s] = teams.filter((t) => t.payment_status === s).length;
    });
    return out;
  }, [teams]);

  /* ── sign-in screen ── */
  if (!user) {
    return (
      <div className="admin">
        <div className="admin__login">
          <button className="admin__back" onClick={onExit} type="button">&larr; BACK TO SITE</button>
          <p className="admin__eyebrow">HACK2PITCH 2026 / CONTROL SURFACE</p>
          <h1 className="admin__title">ADMIN ACCESS</h1>
          <form className="admin__form" onSubmit={signIn}>
            <label className="admin__label">EMAIL</label>
            <input
              className="admin__input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
            <label className="admin__label">PASSWORD</label>
            <input
              className="admin__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            {error && <p className="admin__error">{error}</p>}
            <button className="admin__submit" type="submit" disabled={busy}>
              {busy ? 'AUTHENTICATING&hellip;' : 'SIGN IN'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  /* ── control panel ── */
  return (
    <div className="admin">
      <header className="admin__head">
        <div className="admin__head-left">
          <span className="admin__head-flag">HACK2PITCH 2026 / CONTROL</span>
          <span className="admin__head-user">{user.email}</span>
        </div>
        <div className="admin__head-actions">
          <button className="admin__link" onClick={onExit} type="button">&larr; VIEW SITE</button>
          <button className="admin__link" onClick={signOut} type="button">SIGN OUT</button>
        </div>
      </header>

      <main className="admin__main">
        <section className="admin__stats">
          <div className="admin__stat">
            <span className="admin__stat-num">{String(stats.total).padStart(2, '0')}</span>
            <span className="admin__stat-label">TEAMS</span>
          </div>
          {STATUS_ORDER.map((s) => (
            <div key={s} className="admin__stat">
              <span className="admin__stat-num">{String(stats[s] ?? 0).padStart(2, '0')}</span>
              <span className="admin__stat-label">{s.toUpperCase()}</span>
            </div>
          ))}
        </section>

        {error && <div className="admin__error admin__error--bar">{error}</div>}
        {notice && <div className="admin__notice">{notice}</div>}

        <div className="admin__toolbar">
          <span className="admin__toolbar-label">FILTER BY STATUS</span>
          <div className="admin__filters">
            {['ALL', ...STATUS_ORDER].map((s) => (
              <button
                key={s}
                className={`admin__filter ${statusFilter === s ? 'admin__filter--on' : ''}`}
                onClick={() => setStatusFilter(s)}
                type="button"
              >
                {s === 'ALL' ? 'ALL' : s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <section className="admin__table">
          {filtered.length === 0 ? (
            <div className="admin__empty">NO ENTRIES MATCH THIS FILTER</div>
          ) : (
            filtered.map((team) => {
              const open = Boolean(expanded[team.id]);
              const members = participantsByTeam[team.id] ?? [];
              const problem = team.problem_statement_id ? problemsById[team.problem_statement_id] : null;
              const isUpdating = Boolean(updating[team.id]);

              return (
                <article key={team.id} className={`ateam ${open ? 'ateam--open' : ''}`}>
                  <button className="ateam__bar" onClick={() => toggleExpand(team.id)} type="button">
                    <span className="ateam__code">{codeFor(team)}</span>
                    <span className="ateam__names">
                      <span className="ateam__name">{team.team_name}</span>
                    </span>
                    <span className="ateam__track">
                      {problem ? `${String(problem.track ?? '').toUpperCase()} / ${problem.title}` : '\u2014'}
                    </span>
                    <span className="ateam__size">{String(members.length).padStart(2, '0')}</span>
                    <span className={`ateam__status ateam__status--${team.payment_status}`}>
                      {team.payment_status.toUpperCase()}
                    </span>
                    <span className="ateam__date">{dateLabel(team.created_at)}</span>
                    <span className="ateam__toggle">{open ? '\u2212' : '+'}</span>
                  </button>

                  {open && (
                    <div className="ateam__body">
                      <div className="ateam__grid">
                        <div className="ateam__col">
                          <h4 className="ateam__col-title">CREW</h4>
                          {members.length === 0 && <p className="ateam__muted">NO PARTICIPANTS FOUND</p>}
                          {members.map((p) => (
                            <div key={p.id} className="amember">
                              <span className="amember__name">
                                {p.full_name}
                                {p.role === 'lead' && <em>LEAD</em>}
                              </span>
                              <span className="amember__meta">{p.email}</span>
                              <span className="amember__meta">{p.phone} / {foodPreferenceLabel(p.food_preference) || '\u2014'}</span>
                            </div>
                          ))}
                        </div>

                        <div className="ateam__col">
                          <h4 className="ateam__col-title">CHALLENGE</h4>
                          {problem ? (
                            <>
                              <p className="ateam__challenge-title">
                                <span className="ateam__challenge-cat">{String(problem.track ?? '').toUpperCase()}</span>
                                {' '}{problem.title}
                              </p>
                              <p className="ateam__challenge-diff">{problem.difficulty ?? ''}</p>
                            </>
                          ) : (
                            <p className="ateam__muted">NO CHALLENGE ASSIGNED</p>
                          )}
                        </div>

                        <div className="ateam__col">
                          <h4 className="ateam__col-title">PAYMENT</h4>
                          <div className="ateam__proof">
                            {team.payment_image_url ? (
                              <a
                                href={team.payment_image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                VIEW PROOF &rarr;
                              </a>
                            ) : (
                              <span className="ateam__muted">NO PROOF UPLOADED</span>
                            )}
                          </div>
                          <div className="ateam__status-pick">
                            {STATUS_ORDER.map((s) => (
                              <button
                                key={s}
                                className={`ateam__status-btn ${team.payment_status === s ? 'ateam__status-btn--on' : ''}`}
                                onClick={() => changeStatus(team.id, s)}
                                disabled={isUpdating}
                                type="button"
                              >
                                {s.toUpperCase()}
                              </button>
                            ))}
                          </div>
                          {isUpdating && <span className="ateam__updating">SAVING&hellip;</span>}
                        </div>
                      </div>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </section>
      </main>
    </div>
  );
}