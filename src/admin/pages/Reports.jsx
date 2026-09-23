/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Reports & Downloads
   Excel workbooks built from real Supabase rows. Pick Teams,
   Participants or a Complete Registration report, optionally narrow
   with filters, then export. Rows to be exported are counted first so
   the button always reflects reality.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import {
  adminFetchProblems,
  adminFetchColleges,
  adminFetchAllTeams,
  adminFetchAllParticipants,
  adminFetchTeamMemberCounts,
  adminFetchRounds,
} from '../services/adminData.js';
import { TEAM_PAYMENT_STATUS } from '../../lib/schema.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Page.jsx';
import { SearchBar, SelectField, FilterChips, ExportButton } from '../components/Toolbar.jsx';
import { downloadExcel } from '../services/adminExcel.js';

const STATUS_OPTIONS = Object.values(TEAM_PAYMENT_STATUS).map((s) => ({ value: s, label: String(s).toUpperCase() }));

const EMPTY = { search: '', paymentStatus: '', problemStatementId: '', college: '' };

const KINDS = [
  { value: 'teams', label: 'TEAM REPORT' },
  { value: 'participants', label: 'PARTICIPANT REPORT' },
  { value: 'complete', label: 'COMPLETE REGISTRATION' },
  { value: 'rounds', label: 'ROUNDS' },
];

const DESCRIPTIONS = {
  teams:
    'One row per registered team — code, name, college, challenge, round, payment, team size, registration date.',
  participants:
    'One row per participant with the joined team info — name, contact, team, college, challenge, round, role, registration date.',
  complete:
    'One row per participant with full team information — participant, team, college, challenge, round, payment and registration date together.',
  rounds:
    'One row per registration round — title, status, fee, capacity, registered teams, remaining slots, window.',
};

function ReportCard({ desc, countLabel, children, actions }) {
  return (
    <section className="cpa-panel cpa-report">
      <div className="cpa-panel__head">
        <div>
          <h3 className="cpa-panel__title">REPORT PREVIEW</h3>
          <p className="cpa-panel__desc">{desc}</p>
        </div>
      </div>
      <div className="cpa-report__count">{countLabel}</div>
      <div className="cpa-report__filters">{children}</div>
      {actions}
    </section>
  );
}

export default function Reports() {
  const { push } = useToast();
  const [kind, setKind] = useState('teams');
  const [filters, setFilters] = useState({ ...EMPTY });
  const [rows, setRows] = useState(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState('');
  const [exporting, setExporting] = useState(false);

  const problems = useAsync(() => adminFetchProblems(), []);
  const problemOptions = (problems.data ?? []).map((p) => ({
    value: p.id,
    label: `${String(p.track).toUpperCase()} / ${p.title}`,
  }));

  const { data: collegeList } = useAsync(() => adminFetchColleges(), []);

  const active = Object.fromEntries(
    Object.entries(filters).filter(([, v]) => v && String(v).trim() !== '')
  );
  const filterKey = JSON.stringify(active);

  const loadRows = useCallback(async () => {
    if (kind === 'rounds') return adminFetchRounds();
    if (kind === 'participants') return adminFetchAllParticipants(active);
    if (kind === 'complete') {
      const [participants, counts] = await Promise.all([
        adminFetchAllParticipants(active),
        adminFetchTeamMemberCounts(),
      ]);
      return participants.map((p) => ({ ...p, teamMemberCount: counts.get(p.teamId) ?? '' }));
    }
    return adminFetchAllTeams(active);
  }, [kind, filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const probe = useCallback(async () => {
    setProbing(true);
    setProbeError('');
    try {
      setRows(await loadRows());
    } catch (err) {
      setProbeError(err?.message || 'REPORT PREVIEW FAILED');
      push(err?.message || 'PREVIEW FAILED', 'error');
      setRows(null);
    } finally {
      setProbing(false);
    }
  }, [loadRows, push]);

  useEffect(() => {
    probe();
  }, [probe]);

  const exportNow = async () => {
    setExporting(true);
    try {
      const data = rows ?? (await loadRows());
      const { name } = await downloadExcel({
        kind,
        rows: data,
        suffix: Object.keys(active).length ? 'filtered' : '',
      });
      push(`${data.length} ROWS EXPORTED → ${name}`, 'success');
    } catch (err) {
      push(err?.message || 'EXPORT FAILED', 'error');
    } finally {
      setExporting(false);
    }
  };

  const switchKind = (k) => {
    setKind(k);
    setFilters({ ...EMPTY });
    setRows(null);
    setProbeError('');
  };

  const countLabel = probing ? (
    'COUNTING ROWS…'
  ) : probeError ? (
    'PREVIEW FAILED'
  ) : rows ? (
    <>{String(rows.length).padStart(3, '0')} ROWS READY</>
  ) : (
    '—'
  );

  return (
    <>
      <PageHeader
        eyebrow="EXPORT / REPORTS"
        title="REPORTS & DOWNLOADS"
        meta="Real database rows → properly formatted .xlsx workbooks"
      />

      <div className="cpa-seg">
        {KINDS.map((k) => (
          <button
            key={k.value}
            type="button"
            className={`cpa-seg__btn${kind === k.value ? ' cpa-seg__btn--on' : ''}`}
            onClick={() => switchKind(k.value)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <ReportCard
        desc={DESCRIPTIONS[kind]}
        countLabel={countLabel}
        actions={
          <div className="cpa-report__actions">
            <ExportButton
              onClick={exportNow}
              busy={exporting}
              label="EXPORT .XLSX"
              variant="solid"
            />
          </div>
        }
      >
        {kind !== 'rounds' && (
          <>
            <SearchBar
              value={filters.search}
              onChange={(v) => setFilters((f) => ({ ...f, search: v }))}
              placeholder={kind === 'teams' ? 'SEARCH TEAM / CODE / COLLEGE' : 'SEARCH NAME / EMAIL / TEAM'}
            />
            <FilterChips value={filters.paymentStatus} onChange={(v) => setFilters((f) => ({ ...f, paymentStatus: v }))} options={STATUS_OPTIONS} />
            <SelectField label="PROBLEM" value={filters.problemStatementId} onChange={(v) => setFilters((f) => ({ ...f, problemStatementId: v }))} options={problemOptions} />
            <SelectField label="COLLEGE" value={filters.college} onChange={(v) => setFilters((f) => ({ ...f, college: v }))} options={(collegeList ?? []).map((c) => ({ value: c, label: c }))} />
            {Object.keys(active).length > 0 && (
              <button type="button" className="cpa-btn cpa-btn--ghost cpa-btn--sm" onClick={() => setFilters({ ...EMPTY })}>
                ✕ CLEAR FILTERS
              </button>
            )}
          </>
        )}
      </ReportCard>

      {probeError && (
        <div className="cpa-state cpa-state--error">
          <p>DATABASE ERROR — {probeError}</p>
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={probe}>RETRY</button>
        </div>
      )}

      {!probing && !probeError && rows && rows.length === 0 && (
        <div className="cpa-state cpa-state--empty">NO ROWS MATCH YOUR FILTERS</div>
      )}
    </>
  );
}