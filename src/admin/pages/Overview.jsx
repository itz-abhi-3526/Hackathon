/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Overview / Dashboard
   Live operational stats: team/participant/problem totals, payment
   status distribution, per-problem team counts and recent activity.
   Everything is derived from real Supabase data.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback } from 'react';
import { adminFetchStats } from '../services/adminData.js';
import { useAsync } from '../hooks/useAsync.js';
import { TEAM_PAYMENT_STATUS } from '../../lib/schema.js';
import StatusBadge from '../components/StatusBadge.jsx';
import { StatCard, PageHeader } from '../components/Page.jsx';
import { RefreshButton } from '../components/Toolbar.jsx';
import { codeFor, dateLabel, feeLabel, problemLabel, roleLabel } from '../utils/format.js';

const PAYMENT_TONES = { pending: '', submitted: '', verified: 'ok', rejected: 'bad' };

function RoundDistribution({ rounds, legacyTeams }) {
  return (
    <div className="cpa-bars">
      {(rounds ?? []).map((r) => {
        const pct = r.capacity ? Math.min(100, (r.registered / r.capacity) * 100) : 0;
        return (
          <div key={r.id} className="cpa-bars__row">
            <span className="cpa-bars__label">
              {String(r.title).toUpperCase()}
              <span className="cpa-mut"> · {String(r.status).toUpperCase()}</span>
            </span>
            <span className="cpa-bars__track">
              <span
                className={`cpa-bars__fill${r.registered >= r.capacity ? ' cpa-bars__fill--bad' : ''} cpa-bars__fill--cap`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="cpa-bars__num">{r.registered}/{r.capacity}</span>
          </div>
        );
      })}
      {(legacyTeams ?? 0) > 0 && (
        <div className="cpa-bars__row">
          <span className="cpa-bars__label">LEGACY REGISTRATION <span className="cpa-mut"> · NO ROUND</span></span>
          <span className="cpa-bars__track">
            <span className="cpa-bars__fill cpa-bars__fill--cap" style={{ width: '100%' }} />
          </span>
          <span className="cpa-bars__num">{legacyTeams}</span>
        </div>
      )}
    </div>
  );
}

function DistributionBars({ counts, total }) {
  const entries = Object.values(TEAM_PAYMENT_STATUS);
  return (
    <div className="cpa-bars" role="img" aria-label="Payment status distribution">
      {entries.map((s) => {
        const n = counts?.[s] ?? 0;
        const pct = total ? Math.round((n / total) * 100) : 0;
        return (
          <div key={s} className="cpa-bars__row">
            <span className="cpa-bars__label">{String(s).toUpperCase()}</span>
            <span className="cpa-bars__track">
              <span className={`cpa-bars__fill cpa-bars__fill--${s}`} style={{ width: `${pct}%` }} />
            </span>
            <span className="cpa-bars__num">{n}</span>
          </div>
        );
      })}
    </div>
  );
}

function ProblemCluster({ problems, counts }) {
  return (
    <div className="cpa-cluster">
      {(problems ?? []).map((p) => (
        <div key={p.id} className="cpa-cluster__item">
          <span className="cpa-cluster__tag">{String(p.track).toUpperCase()}</span>
          <span className="cpa-cluster__title">{p.title}</span>
          <span className="cpa-cluster__count">{counts?.get?.(p.id) ?? 0} TEAMS</span>
        </div>
      ))}
    </div>
  );
}

function RecentTeams({ teams, onOpenTeam }) {
  if (!teams?.length) return <p className="cpa-muted-sm">NO TEAMS YET</p>;
  return (
    <ul className="cpa-recent">
      {teams.map((t) => (
        <li key={t.id}>
          <button type="button" className="cpa-recent__row" onClick={() => onOpenTeam(t.id)}>
            <span className="cpa-recent__main">
              <span className="cpa-recent__name">{t.teamName}</span>
              <span className="cpa-recent__sub">{codeFor(t)} · {t.college}</span>
            </span>
            <span className="cpa-recent__prob">{problemLabel(t.problem)}</span>
            <StatusBadge status={t.paymentStatus} size="sm" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecentParticipants({ participants }) {
  if (!participants?.length) return <p className="cpa-muted-sm">NO PARTICIPANTS YET</p>;
  return (
    <ul className="cpa-recent">
      {participants.map((p) => (
        <li key={p.id}>
          <div className="cpa-recent__row cpa-recent__row--flat">
            <span className="cpa-recent__main">
              <span className="cpa-recent__name">{p.fullName}</span>
              <span className="cpa-recent__sub">{p.email}</span>
            </span>
            <span className="cpa-recent__prob">
              {roleLabel(p.role)} · {p.teamName}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function Overview({ onOpenTeam, refreshToken = 0 }) {
  const load = useCallback(() => adminFetchStats(), []);
  const { data, loading, error, reload } = useAsync(load, [refreshToken]);

  const counts = data?.statusCounts ?? {};
  const total = data?.totalTeams ?? 0;

  return (
    <>
      <PageHeader
        eyebrow="HACK2PITCH 2026 / OPS"
        title="OPERATIONS OVERVIEW"
        meta="Live counts from the registration database — refreshed from Supabase."
        actions={<RefreshButton onClick={reload} busy={loading} />}
      />

      {!data && loading && (
        <div className="cpa-skeleton cpa-skeleton--grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="cpa-skeleton__cell" style={{ animationDelay: `${i * 50}ms` }} />
          ))}
        </div>
      )}

      {!data && error && (
        <div className="cpa-state cpa-state--error cpa-state--full">
          <p>DATABASE ERROR — {error}</p>
          <span className="cpa-muted-sm">LIVE STATS COULD NOT BE LOADED FROM SUPABASE.</span>
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={reload}>RETRY</button>
        </div>
      )}

      {data && (
        <>
          {error && (
            <div className="cpa-state cpa-state--error">
              <p>REFRESH FAILED — {error}</p>
              <button type="button" className="cpa-btn cpa-btn--ghost" onClick={reload}>RETRY</button>
            </div>
          )}

          <section className="cpa-cards">
            <StatCard label="TOTAL TEAMS" value={total} hint="REGISTERED CREWS" />
            <StatCard label="TOTAL PARTICIPANTS" value={data?.totalParticipants ?? 0} hint="ALL MEMBERS" />
            <StatCard label="PROBLEM STATEMENTS" value={data?.totalProblems ?? 0} hint="OPEN CHALLENGES" />
            <StatCard
              label="ACTIVE REGISTRATION"
              value={data?.activeRound ? String(data.activeRound.title).toUpperCase() : 'NONE'}
              hint={
                data?.activeRound
                  ? `${feeLabel(data.activeRound.fee2Members)} · ${feeLabel(data.activeRound.fee3Members)} · ${feeLabel(data.activeRound.fee4Members)} /TEAM BY SIZE · ${Math.max(0, data.activeRound.capacity - data.activeRound.registered)} SLOTS LEFT · ${data.activeRound.registered} REGISTERED`
                  : 'NO ACTIVE REGISTRATION PHASE'
              }
              tone={data?.activeRound ? 'ok' : ''}
            />
            <StatCard
              label="PAYMENTS VERIFIED"
              value={counts.verified ?? 0}
              hint={total ? `%${Math.round(((counts.verified ?? 0) / total) * 100)} VERIFICATION RATE` : 'NO TEAMS YET'}
              tone="ok"
            />
          </section>

          <section className="cpa-panel">
            <div className="cpa-panel__head">
              <h3 className="cpa-panel__title">REGISTRATION ROUNDS</h3>
              <span className="cpa-panel__tag">{data?.rounds?.length ?? 0} PHASES · TEAM CAPACITY IS PER-ROUND</span>
            </div>
            <RoundDistribution rounds={data?.rounds} legacyTeams={data?.legacyTeams} />
          </section>

          <div className="cpa-cols">
            <section className="cpa-panel">
              <div className="cpa-panel__head">
                <h3 className="cpa-panel__title">PAYMENT STATUS</h3>
                <div className="cpa-panel__legend">
                  {Object.values(TEAM_PAYMENT_STATUS).map((s) => (
                    <StatusBadge key={s} status={s} size="sm" />
                  ))}
                </div>
              </div>
              <DistributionBars counts={counts} total={total} />
              {total > 0 && (
                <div className="cpa-split-stats">
                  {Object.values(TEAM_PAYMENT_STATUS).map((s) => (
                    <StatCard key={s} label={String(s).toUpperCase()} value={counts[s] ?? 0} tone={PAYMENT_TONES[s]} />
                  ))}
                </div>
              )}
            </section>

            <section className="cpa-panel">
              <div className="cpa-panel__head">
                <h3 className="cpa-panel__title">PROBLEM DISTRIBUTION</h3>
              </div>
              <ProblemCluster problems={data?.problems} counts={data?.problemCounts} />
            </section>
          </div>

          <div className="cpa-cols">
            <section className="cpa-panel">
              <div className="cpa-panel__head">
                <h3 className="cpa-panel__title">RECENT REGISTRATIONS</h3>
                <span className="cpa-panel__tag">{dateLabel(data?.recentTeams?.[0]?.createdAt, { time: false })}</span>
              </div>
              <RecentTeams teams={data?.recentTeams} onOpenTeam={onOpenTeam} />
            </section>

            <section className="cpa-panel">
              <div className="cpa-panel__head">
                <h3 className="cpa-panel__title">RECENT PARTICIPANTS</h3>
              </div>
              <RecentParticipants participants={data?.recentParticipants} />
            </section>
          </div>
        </>
      )}
    </>
  );
}