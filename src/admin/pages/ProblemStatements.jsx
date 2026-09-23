/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Problem Statements
   Monitoring view of the public challenge arena: track / title /
   difficulty plus how many teams chose each statement. Clicking a
   statement opens the list of teams assigned to it. Read-only — no
   editing (registers/creates nothing).
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { adminFetchProblems, adminProblemCounts, adminFetchAllTeams } from '../services/adminData.js';
import { useAsync } from '../hooks/useAsync.js';
import { PageHeader } from '../components/Page.jsx';
import { SearchBar, RefreshButton } from '../components/Toolbar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { DIFFICULTIES } from '../../lib/schema.js';
import { codeFor } from '../utils/format.js';

function tierClass(diff) {
  const d = String(diff ?? '').toUpperCase();
  if (d === 'ADVANCED') return 'cpa-tier cpa-tier--adv';
  if (d === 'INTERMEDIATE') return 'cpa-tier cpa-tier--int';
  return 'cpa-tier cpa-tier--beg';
}

function ProblemTeamsModal({ problem, onClose }) {
  const { data, loading, error, reload } = useAsync(
    () => adminFetchAllTeams({ problemStatementId: problem.id }),
    [problem.id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const teams = data ?? [];

  return (
    <div className="cpa-modal" role="dialog" aria-modal="true" aria-label="Teams assigned to problem statement" onClick={onClose}>
      <div className="cpa-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="cpa-modal__head">
          <div className="cpa-modal__titles">
            <span className="cpa-modal__eyebrow">PROBLEM STATEMENT / TEAMS</span>
            <span className="cpa-modal__title">{String(problem.track).toUpperCase()} / {problem.title}</span>
          </div>
          <button type="button" className="cpa-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cpa-modal__body">
          {loading && (
            <div className="cpa-skeleton cpa-skeleton--drawer" aria-hidden="true">
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className="cpa-skeleton__cell" style={{ animationDelay: `${i * 50}ms` }} />
              ))}
            </div>
          )}

          {!loading && error && (
            <div className="cpa-state cpa-state--error">
              <p>DATABASE ERROR — {error}</p>
              <button type="button" className="cpa-btn cpa-btn--ghost" onClick={reload}>RETRY</button>
            </div>
          )}

          {!loading && !error && teams.length === 0 && (
            <div className="cpa-state cpa-state--empty">NO TEAMS HAVE PICKED THIS STATEMENT YET</div>
          )}

          {!loading && !error && teams.length > 0 && (
            <ul className="cpa-recent">
              {teams.map((t) => (
                <li key={t.id}>
                  <div className="cpa-recent__row cpa-recent__row--flat">
                    <span className="cpa-recent__main">
                      <span className="cpa-recent__name">{t.teamName}</span>
                      <span className="cpa-recent__sub">{codeFor(t)} · {t.college || '—'}</span>
                    </span>
                    <span className="cpa-recent__prob">{String(t.memberCount ?? 0).padStart(2, '0')} MEMBERS</span>
                    <StatusBadge status={t.paymentStatus} size="sm" />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="cpa-modal__foot">
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onClose}>CLOSE</button>
        </div>
      </div>
    </div>
  );
}

export default function ProblemStatements() {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [selected, setSelected] = useState(null);

  const problems = useAsync(() => adminFetchProblems(), []);
  const counts = useAsync(
    () => adminProblemCounts(problems.data ?? []),
    [problems.data] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const list = (problems.data ?? []).filter((p) => {
    const q = search.trim().toLowerCase();
    const matchesQ =
      !q ||
      String(p.track).toLowerCase().includes(q) ||
      String(p.title).toLowerCase().includes(q) ||
      String(p.description).toLowerCase().includes(q);
    const matchesD = !difficulty || String(p.difficulty).toLowerCase() === String(difficulty).toLowerCase();
    return matchesQ && matchesD;
  });

  const totalTeams = (problems.data ?? []).reduce(
    (sum, p) => sum + (counts.data?.get?.(p.id) ?? 0),
    0
  );

  return (
    <>
      <PageHeader
        eyebrow="CHALLENGE ARENA"
        title="PROBLEM STATEMENTS"
        meta={`${problems.data?.length ?? '—'} CHALLENGES · ${totalTeams} TEAMS COMMITTED`}
        actions={<RefreshButton onClick={problems.reload} busy={problems.loading} />}
      />

      <div className="cpa-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="SEARCH TRACK / TITLE / DESCRIPTION" />
        <div className="cpa-toolbar__filters">
          <div className="cpa-chips">
            <button
              type="button"
              className={`cpa-chip${difficulty === '' ? ' cpa-chip--on' : ''}`}
              onClick={() => setDifficulty('')}
            >
              ALL
            </button>
            {DIFFICULTIES.map((d) => (
              <button
                key={d}
                type="button"
                className={`cpa-chip${difficulty === d ? ' cpa-chip--on' : ''}`}
                onClick={() => setDifficulty(d)}
              >
                {String(d).toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {problems.loading && (
        <div className="cpa-skeleton cpa-skeleton--cards">
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="cpa-skeleton__cell" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
      )}

      {problems.error && (
        <div className="cpa-state cpa-state--error">
          <p>DATABASE ERROR — {problems.error}</p>
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={problems.reload}>RETRY</button>
        </div>
      )}

      {!problems.loading && !problems.error && list.length === 0 && (
        <div className="cpa-state cpa-state--empty">NO PROBLEM STATEMENTS MATCH</div>
      )}

      {!problems.loading && !problems.error && list.length > 0 && (
        <div className="cpa-problems">
          {list.map((p) => {
            const n = counts.data?.get?.(p.id) ?? 0;
            return (
              <article
                key={p.id}
                className="cpa-problem cpa-problem--clickable"
                role="button"
                tabIndex={0}
                title="View teams assigned to this statement"
                onClick={() => setSelected(p)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(p);
                  }
                }}
              >
                <header className="cpa-problem__head">
                  <span className="cpa-problem__track">{String(p.track).toUpperCase()}</span>
                  <span className={tierClass(p.difficulty)}>{String(p.difficulty).toUpperCase()}</span>
                </header>
                <h3 className="cpa-problem__title">{p.title}</h3>
                <p className="cpa-problem__desc">{p.description}</p>
                <footer className="cpa-problem__foot">
                  <div className="cpa-problem__stats">
                    <span className="cpa-problem__stat">
                      <strong>{String(n).padStart(2, '0')}</strong> TEAMS
                    </span>
                    <span className="cpa-problem__stat cpa-problem__stat--muted">
                      {String(n > 0 ? Math.round((n / Math.max(totalTeams, 1)) * 100) : 0).padStart(2, '0')}%
                    </span>
                  </div>
                  <span className="cpa-problem__view">VIEW TEAMS →</span>
                </footer>
              </article>
            );
          })}
        </div>
      )}

      {selected && <ProblemTeamsModal problem={selected} onClose={() => setSelected(null)} />}
    </>
  );
}