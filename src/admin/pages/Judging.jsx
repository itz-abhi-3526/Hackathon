/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Judging / shared evaluations (admin)
   Exactly three fixed stages: ROUND 1 → top 20 → ROUND 2 → top 8 →
   FINAL PRESENTATION → top 3. Every stage carries the same non-
   configurable rubric: Criteria 1 / 2 / 3, 20 marks each (60 per round,
   180 cumulative). Scoring is SHARED — ONE record per round × team ×
   criterion, no judge selector, no per-judge rows, no averaging. Any
   authorised admin edits the same record, and Supabase Realtime pushes
   every save to every open editing session live. Qualification into a
   later stage is ALWAYS explicit (admin Leaderboard page) — teams are
   never auto-eliminated when ranks change.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  adminFetchStageRounds,
  adminFetchEvaluationCriteria,
  adminFetchStageTeams,
  adminFetchTeamDetail,
  adminFetchSharedEvaluations,
  adminSaveSharedEvaluation,
  stageCriteriaPlaceholders,
} from '../services/adminData.js';
import { useAsync } from '../hooks/useAsync.js';
import { useJudgingRealtime } from '../hooks/useJudgingRealtime.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, StatCard } from '../components/Page.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { SearchBar, RefreshButton, Pagination } from '../components/Toolbar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { codeFor, dateLabel, problemLabel } from '../utils/format.js';
import { judgingStatus, clampScore } from '../services/judgingValidation.js';
import { STAGES, STAGE_CRITERIA_MAX_SCORE, STAGE_ROUND_MAX_SCORE } from '../../lib/schema.js';

const PAGE_SIZE = 50;

export default function Judging() {
  const [stageKey, setStageKey] = useState('round_1');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [sortBy, setSortBy] = useState('teamName');
  const [sortDir, setSortDir] = useState('asc');
  const [evalTarget, setEvalTarget] = useState(null);

  const byStage = useAsync(() => adminFetchStageRounds(), []);
  const selectedRound = byStage.data?.[stageKey] ?? null;

  const criteria = useAsync(
    () => (selectedRound ? adminFetchEvaluationCriteria(selectedRound.id) : Promise.resolve([])),
    [selectedRound?.id]
  );

  const teams = useAsync(
    () =>
      adminFetchStageTeams({ stageKey, search, page, pageSize, sortBy, sortDir }),
    [stageKey, search, page, pageSize, sortBy, sortDir]
  );

  const placeholders = useMemo(
    () => stageCriteriaPlaceholders(criteria.data ?? []),
    [criteria.data]
  );
  const criteriaCount = STAGES.find((s) => s.key === stageKey) ? 3 : 0;

  const rows = useMemo(
    () =>
      (teams.data?.rows ?? []).map((row) => ({
        ...row,
        statusKey: judgingStatus({ judgedCount: row.judgedCount, criteriaCount }),
      })),
    [teams.data, criteriaCount]
  );

  const stat = useMemo(() => {
    const complete = rows.filter((r) => r.statusKey === 'complete').length;
    const inProgress = rows.filter((r) => r.statusKey === 'in-progress').length;
    return { complete, inProgress };
  }, [rows]);

  const onSearch = (value) => {
    setSearch(value);
    setPage(0);
  };

  const onSort = (key) => {
    if (sortBy === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const pickStage = (key) => {
    setStageKey(key);
    setPage(0);
    setSearch('');
  };

  const COLUMNS = [
    {
      key: 'teamName',
      label: 'TEAM',
      sortable: true,
      className: 'cpa-grid--grow',
      render: (row) => (
        <div className="cpa-cell">
          <span className="cpa-cell__name">{String(row.teamName).toUpperCase()}</span>
          <span className="cpa-cell__code">{codeFor(row)}</span>
        </div>
      ),
    },
    {
      key: 'college',
      label: 'COLLEGE',
      sortable: true,
      render: (row) => (
        <span className="cpa-mut font-11">{row.college ? String(row.college).toUpperCase() : '—'}</span>
      ),
    },
    {
      key: 'problem',
      label: 'PROBLEM STATEMENT',
      render: (row) => <span className="cpa-mut font-11">{problemLabel(row.problem)}</span>,
    },
    {
      key: 'memberCount',
      label: 'MEMBERS',
      align: 'center',
      render: (row) => <span className="cpa-mut font-11">{row.memberCount}</span>,
    },
    {
      key: 'status',
      label: 'EVAL STATUS',
      render: (row) => <StatusBadge status={row.statusKey} size="sm" />,
    },
    {
      key: 'total',
      label: 'TOTAL',
      align: 'right',
      render: (row) => (
        <span className="cpa-judge-total">{row.judgedCount > 0 ? `${row.totalScore} / ${STAGE_ROUND_MAX_SCORE}` : '—'}</span>
      ),
    },
    {
      key: 'lastEvaluationAt',
      label: 'LAST UPDATE',
      render: (row) => (
        <span className="cpa-mut cpa-nowrap font-11">{dateLabel(row.lastEvaluationAt)}</span>
      ),
    },
  ];

  const meta = !teams.data
    ? teams.error
      ? 'TEAMS UNAVAILABLE'
      : 'LOADING…'
    : !selectedRound
    ? 'STAGE ROUND NOT CONFIGURED'
    : `${rows.length} · 3 CRITERIA · ${STAGE_ROUND_MAX_SCORE} MARKS POSSIBLE`;

  const stageTab = (s) => {
    const active = s.key === stageKey;
    const cutoffNote = s.cutoff ? ` · TOP ${s.cutoff}` : '';
    return (
      <button
        key={s.key}
        type="button"
        className={`cpa-btn ${active ? 'cpa-btn--solid' : 'cpa-btn--ghost'}`}
        onClick={() => pickStage(s.key)}
      >
        {s.label.toUpperCase()}{cutoffNote}
      </button>
    );
  };

  return (
    <>
      <PageHeader
        eyebrow="EVALUATIONS / SHARED SCORING"
        title="JUDGING"
        meta={meta}
        actions={
          <>
            <div className="cpa-judging__stages">{STAGES.map(stageTab)}</div>
            <SearchBar value={search} onChange={onSearch} placeholder="SEARCH TEAMS / COLLEGE / CODE" />
            <RefreshButton onClick={teams.reload} busy={teams.loading} />
          </>
        }
      />

      <section className="cpa-cards">
        <StatCard label="TEAMS" value={teams.data?.count ?? 0} hint={String(selectedRound?.title ?? 'NO ROUND').toUpperCase()} />
        <StatCard
          label="IN PROGRESS"
          value={stat.inProgress}
          hint="CURRENT STAGE · SCORED PARTIALLY"
          tone={stat.inProgress ? 'warn' : ''}
        />
        <StatCard
          label="COMPLETE"
          value={stat.complete}
          hint={`${stageKey === 'round_1' ? 'ALL REGISTERED TEAMS' : stageKey === 'round_2' ? 'TOP 20 QUALIFIED' : 'TOP 8 FINALISTS'}`}
          tone={stat.complete ? 'ok' : ''}
        />
      </section>

      <DataTable
        columns={COLUMNS}
        rows={rows}
        sortKey={sortBy}
        sortDir={sortDir}
        onSort={onSort}
        loading={teams.loading}
        error={teams.error}
        onRefresh={teams.reload}
        emptyMessage={
          stageKey === 'round_1'
            ? 'NO TEAMS MATCH'
            : 'NO QUALIFIED TEAMS IN THIS STAGE YET — RUN THE QUALIFICATION ACTION FROM THE LEADERBOARD PAGE'
        }
        onRowClick={(row) => setEvalTarget(row)}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            count={teams.data?.count ?? 0}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(0);
            }}
          />
        }
      />

      {evalTarget && selectedRound && (
        <EvaluationModal
          key={`${stageKey}:${evalTarget.id}`}
          teamId={evalTarget.id}
          round={selectedRound}
          criteria={placeholders}
          onClose={() => setEvalTarget(null)}
          onSaved={() => {
            teams.reload();
          }}
        />
      )}
    </>
  );
}

/* ── Shared evaluation screen (wide modal) ─────────────────────── */

function EvaluationModal({ teamId, round, criteria, onClose, onSaved }) {
  const { push } = useToast();
  const [form, setForm] = useState({});
  const [remark, setRemark] = useState('');
  const pinned = useRef({});
  const remarkPinned = useRef(false);
  const [, setBusy] = useState(false);

  const detail = useAsync(() => adminFetchTeamDetail(teamId), [teamId]);
  const shared = useAsync(
    () => adminFetchSharedEvaluations({ judgingRoundId: round.id, teamId }),
    [teamId, round.id]
  );

  /* Hydrate the form from the shared record. Criteria the local user has
     unsaved edits on (pinned) keep the local value so typing is never
     stomped by a concurrent broadcast; everything else mirrors the DB. */
  useEffect(() => {
    const evals = shared.data?.rows ?? [];
    setForm((prev) => {
      const next = {};
      for (const c of criteria ?? []) {
        if (!c?.id) {
          next[c.name] = { score: '' };
          continue;
        }
        const existing = evals.find((e) => e.evaluationCriteriaId === c.id);
        next[c.id] = pinned.current[c.id]
          ? prev[c.id] ?? { score: '' }
          : { score: existing && existing.score != null ? existing.score : '' };
      }
      return next;
    });
    setRemark((prev) => {
      const serverRemark = shared.data?.remark ?? '';
      return remarkPinned.current ? prev : serverRemark;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.data, criteria]);

  const refreshFromServer = useCallback(
    () => {
      pinned.current = {};
      remarkPinned.current = false;
      shared.reload();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shared.reload]
  );

  /* Live: another admin saves the same team/round → this screen updates
     without refresh. Blanking the pin set lets the DB mirror through. */
  const handleRealtime = useCallback(() => {
    pinned.current = {};
    remarkPinned.current = false;
    shared.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shared.reload]);

  useJudgingRealtime({
    judgingRoundId: round.id,
    teamId,
    enabled: true,
    onData: handleRealtime,
  });

  const setScore = (key, value) =>
    setForm((f) => ({ ...f, [key]: { score: value } }));

  const markDirty = (key) => {
    pinned.current[key] = true;
  };

  const liveTotal = useMemo(() => {
    let total = 0;
    for (const c of criteria ?? []) {
      if (!c?.id) continue;
      const value = clampScore(form[c.id]?.score ?? '', c.maxScore);
      if (value !== null) total += value;
    }
    return total;
  }, [form, criteria]);

  const save = async () => {
    const rows = [];
    for (const c of criteria ?? []) {
      if (!c?.id) continue;
      const raw = String(form[c.id]?.score ?? '').trim();
      if (raw === '') continue;
      const score = clampScore(raw, c.maxScore);
      if (score === null) {
        push(`INVALID SCORE FOR ${String(c.name).toUpperCase()}`, 'error');
        return;
      }
      rows.push({ evaluationCriteriaId: c.id, score });
    }
    if (!rows.length && !(remark && remark.trim())) {
      push('ENTER AT LEAST ONE SCORE OR A REMARK', 'error');
      return;
    }
    setBusy(true);
    try {
      await adminSaveSharedEvaluation({
        judgingRoundId: round.id,
        teamId,
        rows,
        remark,
      });
      pinned.current = {};
      remarkPinned.current = false;
      push(
        `${String(detail.data?.team?.teamName ?? 'team').toUpperCase()} SCORES SAVED — SHARED LIVE`,
        'success'
      );
      onSaved();
      onClose();
    } catch (err) {
      push(err?.message || 'EVALUATION COULD NOT BE SAVED', 'error');
      setBusy(false);
    }
  };

  const team = detail.data?.team ?? null;
  const members = detail.data?.members ?? [];

  return (
    <div className="cpa-modal" role="dialog" aria-modal="true" aria-label={`Evaluate ${String(team?.teamName ?? 'team').toUpperCase()}`} onClick={onClose}>
      <div className="cpa-modal__card cpa-modal__card--wide" onClick={(e) => e.stopPropagation()}>
        <div className="cpa-modal__head">
          <div className="cpa-modal__titles">
            <span className="cpa-modal__eyebrow">EVALUATE TEAM · {String(round.title).toUpperCase()}</span>
            <span className="cpa-modal__title">{detail.loading || !team ? 'LOADING…' : String(team.teamName).toUpperCase()}</span>
          </div>
          <button type="button" className="cpa-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {detail.loading || shared.loading ? (
          <div className="cpa-modal__body">
            <div className="cpa-state"><p>LOADING TEAM &amp; SHARED EVALUATIONS…</p></div>
          </div>
        ) : detail.error || shared.error ? (
          <div className="cpa-modal__body">
            <div className="cpa-state cpa-state--error">
              <p>{detail.error || shared.error}</p>
              <button type="button" className="cpa-btn cpa-btn--ghost" onClick={refreshFromServer}>RETRY</button>
            </div>
          </div>
        ) : (
          <div className="cpa-modal__body">
            <div className="cpa-judge__meta">
              <span className="cpa-judge__meta-item"><em>CODE</em>{codeFor(team)}</span>
              <span className="cpa-judge__meta-item"><em>COLLEGE</em>{team.college ? String(team.college).toUpperCase() : '—'}</span>
              <span className="cpa-judge__meta-item"><em>PROBLEM</em>{problemLabel(team.problem)}</span>
            </div>

            <div className="cpa-judge__members">
              <span className="cpa-judge__members-label">TEAM MEMBERS · {members.length}</span>
              <div className="cpa-judge__members-list">
                {members.map((m) => (
                  <span key={m.id} className="cpa-judge__member">
                    <strong>{String(m.fullName).toUpperCase()}</strong>
                    <span>{m.role === 'lead' ? 'LEAD' : 'MEMBER'}</span>
                  </span>
                ))}
                {!members.length && <span className="cpa-mut">NO MEMBERS LISTED</span>}
              </div>
            </div>

            <p className="cpa-modal__msg">
              ONE SHARED RECORD — EVERY AUTHORISED ADMIN EDITS THE SAME SCORES. CHANGES
              SYNC TO ALL OPEN SCREENS LIVE.
            </p>

            <div className="cpa-judge__criteria">
              {(criteria ?? []).map((c) => (
                <div key={c.id ?? c.name} className="cpa-judge__row">
                  <div className="cpa-judge__head">
                    <span className="cpa-judge__name">{String(c.name).toUpperCase()}</span>
                    <span className="cpa-judge__max">MAX {STAGE_CRITERIA_MAX_SCORE}</span>
                  </div>
                  <label className="cpa-field cpa-judge__score">
                    <span className="cpa-field__label">MARK AWARDED / {STAGE_CRITERIA_MAX_SCORE}</span>
                    <input
                      className="cpa-field__input"
                      type="number"
                      min="0"
                      max={STAGE_CRITERIA_MAX_SCORE}
                      step="any"
                      value={c.id ? (form[c.id]?.score ?? '') : ''}
                      placeholder="0"
                      onChange={(e) => {
                        if (!c.id) return;
                        markDirty(c.id);
                        setScore(c.id, e.target.value);
                      }}
                    />
                  </label>
                </div>
              ))}
            </div>

            <label className="cpa-field cpa-judge__remark">
              <span className="cpa-field__label">ROUND REMARK (SHARED · {String(round.title).toUpperCase()})</span>
              <textarea
                className="cpa-field__textarea"
                rows={4}
                value={remark}
                placeholder="(optional note for this team in this round)"
                onChange={(e) => {
                  remarkPinned.current = true;
                  setRemark(e.target.value);
                }}
              />
            </label>
          </div>
        )}

        <div className="cpa-modal__foot">
          <span className="cpa-judge__total">
            {!detail.loading && !shared.loading && criteria?.length
              ? `CURRENT TOTAL — ${liveTotal} / ${STAGE_ROUND_MAX_SCORE}`
              : ''}
          </span>
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onClose}>CANCEL</button>
          <button type="button" className="cpa-btn cpa-btn--ok" onClick={save} disabled={detail.loading || shared.loading}>
            SAVE SHARED EVALUATION
          </button>
        </div>
      </div>
    </div>
  );
}