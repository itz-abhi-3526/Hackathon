/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Leaderboard (admin)
   The cumulative judging board: Rank / Team / Round 1 / Round 2 / Final
   Presentation / Cumulative Total, ordered by Cumulative descending
   (Round 2 ranking context = R1 + R2, Final context = R1 + R2 + Final).
   Qualification is ALWAYS an explicit admin action — top 20 into Round 2,
   top 8 into the Final, top 3 finalised — and is applied atomically in
   the database. The public scoreboard NEVER changes on its own: it only
   updates when you press UPDATE MAIN LEADERBOARD.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react';
import {
  adminFetchJudgingLeaderboard,
  adminQualifyRound2,
  adminQualifyFinal,
  adminFinalizeTop3,
  adminSyncCumulativeLeaderboard,
} from '../services/adminData.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, StatCard } from '../components/Page.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { RefreshButton } from '../components/Toolbar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { codeFor } from '../utils/format.js';
import { STAGE_ROUND_MAX_SCORE, FINALIZE_TOP3, T } from '../../lib/schema.js';
import { getAdminSupabase } from '../../lib/supabase.js';

const CUMULATIVE_MAX = STAGE_ROUND_MAX_SCORE * 3;

const fmtScore = (n) =>
  n === null || n === undefined ? '—' : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function RankCell({ rank }) {
  return (
    <span className={`cpa-lb-rank${rank <= 3 ? ` cpa-lb-rank--${rank}` : ''}`} aria-label={`Rank ${rank}`}>
      {String(rank ?? '—').padStart(2, '0')}
    </span>
  );
}

function ScoreCell({ value, leading = false, tone = '' }) {
  if (value === null || value === undefined) {
    return <span className="cpa-mut font-11">NOT SCORED</span>;
  }
  return <span className={`cpa-lb-score${leading ? ' cpa-lb-score--leading' : ''}${tone ? ` ${tone}` : ''}`}>{fmtScore(value)}</span>;
}

function QualTag({ status }) {
  if (!status || status === 'pending') return <span className="cpa-mut font-11">PENDING</span>;
  const tone =
    status === 'winner' ? 'cpa-tag--winner' : status === 'qualified' ? 'cpa-tag--qualified' : 'cpa-tag--eliminated';
  return <span className={`cpa-tag ${tone}`}>{String(status).toUpperCase()}</span>;
}

export default function Leaderboard() {
  const { push } = useToast();
  const [busyKey, setBusyKey] = useState('');
  const [confirm, setConfirm] = useState(null);

  const { data, loading, error, reload } = useAsync(() => adminFetchJudgingLeaderboard(), []);

  /* The cumulative board refreshes itself live whenever any stage total
     or qualification status changes (no polling). Score edits on the
     Judging page flow through the judging_team_round_totals trigger, so
     subscribing here to the totals + stage-status tables covers every
     saving path. */
  useEffect(() => {
    const supabase = getAdminSupabase();
    const channel = supabase
      .channel('admin-leaderboard-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: T.JUDGING_ROUND_TOTALS }, () => reload())
      .on('postgres_changes', { event: '*', schema: 'public', table: T.STAGE_STATUS }, () => reload())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const rows = useMemo(() => {
    const list = [...(data ?? [])].sort(
      (a, b) =>
        (b.cumulative ?? 0) - (a.cumulative ?? 0) ||
        String(a.teamName).localeCompare(String(b.teamName))
    );
    return list.map((row, i) => ({ ...row, rank: row.rank || i + 1 }));
  }, [data]);

  const runAction = async (key, fn, okMessage) => {
    setBusyKey(key);
    try {
      const n = await fn();
      push(okMessage(n), 'success');
      reload();
      return n;
    } catch (err) {
      push(err?.message || 'ACTION FAILED', 'error');
      return null;
    } finally {
      setBusyKey('');
    }
  };

  const confirmThen = (cfg) => setConfirm(cfg);

  const qualifyRound2 = () =>
    confirmThen({
      title: 'QUALIFY TOP 20 FOR ROUND 2?',
      message:
        'Ranks every scored team by their ROUND 1 total and writes an explicit QUALIFIED / ELIMINATED state for Round 2. Nothing is deleted — eliminated teams keep all scores.',
      confirmLabel: 'QUALIFY TOP 20 FOR ROUND 2',
      key: 'qualify:round_2',
      action: () =>
        runAction('qualify:round_2', adminQualifyRound2, (n) => `${n} TEAMS QUALIFIED INTO ROUND 2`),
    });

  const qualifyFinal = () =>
    confirmThen({
      title: 'QUALIFY TOP 8 FOR FINAL PRESENTATION?',
      message:
        'Ranks Round-2 qualified teams by their cumulative total (ROUND 1 + ROUND 2) and writes the explicit QUALIFIED / ELIMINATED state for the Final. Nothing is deleted.',
      confirmLabel: 'QUALIFY TOP 8 FOR FINAL',
      key: 'qualify:final',
      action: () =>
        runAction('qualify:final', adminQualifyFinal, (n) => `${n} TEAMS QUALIFIED INTO THE FINAL`),
    });

  const finalizeTop3 = () =>
    confirmThen({
      title: 'FINALIZE TOP 3?',
      message:
        'Ranks the finalists by cumulative total (ROUND 1 + ROUND 2 + FINAL) and marks the TOP 3 as the VOIDHACK 2026 winners. The action is fully reversible — re-running it re-picks the top 3.',
      confirmLabel: `FINALIZE TOP ${FINALIZE_TOP3}`,
      key: 'finalize:top3',
      action: () =>
        runAction('finalize:top3', adminFinalizeTop3, () => `TOP ${FINALIZE_TOP3} FINALISED AS WINNERS`),
    });

  const syncMainBoard = () =>
    confirmThen({
      title: 'UPDATE MAIN LEADERBOARD?',
      message:
        'Publishes every judged team\'s CUMULATIVE total (Round 1 + Round 2 + Final) onto the public scoreboard. This is the ONLY way the public board changes.',
      confirmLabel: 'UPDATE MAIN LEADERBOARD',
      key: 'sync:main',
      action: () =>
        runAction('sync:main', adminSyncCumulativeLeaderboard, (n) =>
          n > 0
            ? `${n} TEAMS PUBLISHED ONTO THE MAIN LEADERBOARD`
            : 'NO SCORED TEAMS TO PUBLISH — SAVE SCORES IN JUDGING FIRST'
        ),
    });

  const totals = useMemo(() => {
    const scored = rows.filter((r) => (r.round1 ?? null) !== null || (r.round2 ?? null) !== null || (r.finalPresentation ?? null) !== null);
    const winners = rows.filter((r) => r.finalStatus === 'winner').length;
    const finalists = rows.filter((r) => r.finalStatus === 'qualified').length;
    return { scored: scored.length, winners, finalists };
  }, [rows]);

  const COLUMNS = [
    {
      key: 'rank',
      label: 'RANK',
      align: 'center',
      render: (row) => <RankCell rank={row.rank} />,
    },
    {
      key: 'teamName',
      label: 'TEAM',
      className: 'cpa-grid--grow',
      render: (row) => (
        <div className="cpa-cell">
          <span className="cpa-cell__name">{String(row.teamName).toUpperCase()}</span>
          <span className="cpa-cell__code">
            {codeFor(row)} · <QualTag status={row.finalStatus === 'qualified' || row.finalStatus === 'winner' ? row.finalStatus : row.round2Status} />
          </span>
        </div>
      ),
    },
    {
      key: 'round1',
      label: 'ROUND 1',
      align: 'right',
      render: (row) => <ScoreCell value={row.round1} />,
    },
    {
      key: 'round2',
      label: 'ROUND 2',
      align: 'right',
      render: (row) => <ScoreCell value={row.round2} tone={row.round2Status === 'qualified' ? 'cpa-lb-score--low' : ''} />,
    },
    {
      key: 'finalPresentation',
      label: 'FINAL PRESENTATION',
      align: 'right',
      render: (row) => <ScoreCell value={row.finalPresentation} />,
    },
    {
      key: 'cumulative',
      label: 'CUMULATIVE',
      align: 'right',
      render: (row) => (
        <span className={`cpa-lb-score cpa-lb-score--strong${row.rank === 1 ? ' cpa-lb-score--leading' : ''}`}>
          {fmtScore(row.cumulative)}
        </span>
      ),
    },
  ];

  const meta = error
    ? 'LEADERBOARD UNAVAILABLE'
    : loading
    ? 'LOADING THE BOARD…'
    : !rows.length
    ? 'NO TEAMS ON THE BOARD — SCORE TEAMS IN JUDGING FIRST'
    : `${rows.length} TEAMS · RANKED BY CUMULATIVE DESC · MAX ${CUMULATIVE_MAX}`;

  return (
    <>
      <PageHeader
        eyebrow="CUMULATIVE SCOREBOARD / CONTROL"
        title="LEADERBOARD"
        meta={meta}
        actions={
          <>
            <button
              type="button"
              className="cpa-btn cpa-btn--solid"
              disabled={Boolean(busyKey)}
              onClick={qualifyRound2}
              title="Explicitly qualify the top 20 by Round 1 total"
            >
              QUALIFY TOP 20 FOR ROUND 2
            </button>
            <button
              type="button"
              className="cpa-btn cpa-btn--solid"
              disabled={Boolean(busyKey)}
              onClick={qualifyFinal}
              title="Explicitly qualify the top 8 by cumulative (R1 + R2)"
            >
              QUALIFY TOP 8 FOR FINAL
            </button>
            <button
              type="button"
              className="cpa-btn cpa-btn--solid"
              disabled={Boolean(busyKey)}
              onClick={finalizeTop3}
              title="Mark the top 3 winners by cumulative total"
            >
              FINALIZE TOP 3
            </button>
            <button
              type="button"
              className="cpa-btn cpa-btn--ok"
              disabled={Boolean(busyKey)}
              onClick={syncMainBoard}
              title="Publish cumulative scores onto the public scoreboard"
            >
              {busyKey === 'sync:main' ? 'PUBLISHING…' : 'UPDATE MAIN LEADERBOARD'}
            </button>
            <RefreshButton onClick={reload} busy={loading} />
          </>
        }
      />

      <section className="cpa-cards">
        <StatCard label="SCORED TEAMS" value={totals.scored} hint="WITH AT LEAST ONE ROUND TOTAL" />
        <StatCard label="FINALISTS" value={totals.finalists} hint="TOP 8 · QUALIFIED INTO FINAL" />
        <StatCard label="WINNERS" value={totals.winners} hint={`TOP ${FINALIZE_TOP3} · FINALISED`} tone={totals.winners ? 'ok' : ''} />
      </section>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        loading={loading}
        error={error}
        onRefresh={reload}
        emptyMessage="NO JUDGED TEAMS YET — SCORE TEAMS IN THE JUDGING PAGE FIRST"
      />

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          busy={busyKey === confirm.key}
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const done = await confirm.action();
            if (done !== null) setConfirm(null);
          }}
        />
      )}
    </>
  );
}