/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Participants
   Every member across all teams, joined through the real
   participants.team_id → teams.id relationship. Search / filter /
   sort / paginate server-side; export to Excel. Clicking a row opens
   the owning team's drawer.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminFetchParticipants,
  adminFetchColleges,
  adminFetchTeamOptions,
  adminFetchAllParticipants,
  adminFetchProblems,
} from '../services/adminData.js';
import { TEAM_PAYMENT_STATUS } from '../../lib/schema.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Page.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { SearchBar, SelectField, FilterChips, Pagination, ExportButton, RefreshButton } from '../components/Toolbar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import TeamDetailsDrawer from '../components/TeamDetailsDrawer.jsx';
import { dateLabel, problemLabel, roleLabel, roundLabel } from '../utils/format.js';
import { downloadExcel } from '../services/adminExcel.js';

const STATUS_OPTIONS = Object.values(TEAM_PAYMENT_STATUS).map((s) => ({
  value: s,
  label: String(s).toUpperCase(),
}));

function ParticipantCell({ row }) {
  return (
    <div className="cpa-cell">
      <span className="cpa-cell__name">
        {row.fullName} {row.role === 'lead' && <em className="cpa-member__flag">LEAD</em>}
      </span>
      <span className="cpa-cell__code">{row.email}</span>
    </div>
  );
}

const COLUMNS = [
  { key: 'fullName', label: 'NAME', sortable: true, render: (r) => <ParticipantCell row={r} />, className: 'cpa-grid--grow' },
  { key: 'registrationCode', label: 'REG CODE', render: (r) => <span className="cpa-code cpa-nowrap">{r.registrationCode || '—'}</span> },
  { key: 'phone', label: 'PHONE', render: (r) => <span className="cpa-nowrap">{r.phone}</span> },
  { key: 'teamName', label: 'TEAM', sortable: true, render: (r) => <span className="cpa-truncate">{r.teamName}</span>, className: 'cpa-grid--grow' },
  { key: 'college', label: 'COLLEGE', sortable: true, render: (r) => <span className="cpa-truncate cpa-mut">{r.college || '—'}</span> },
  { key: 'problem', label: 'PROBLEM', render: (r) => <span className="cpa-truncate cpa-mut">{problemLabel(r.problem)}</span> },
  { key: 'registrationRound', label: 'ROUND', render: (r) => <span className="cpa-truncate cpa-mut">{roundLabel(r)}</span> },
  { key: 'paymentStatus', label: 'PAYMENT', render: (r) => <StatusBadge status={r.paymentStatus} size="sm" /> },
  { key: 'role', label: 'ROLE', render: (r) => <span className="cpa-mut">{roleLabel(r.role)}</span> },
  { key: 'createdAt', label: 'JOINED', sortable: true, render: (r) => <span className="cpa-mut cpa-nowrap">{dateLabel(r.createdAt)}</span> },
];

const EMPTY_FILTER = { search: '', teamId: '', paymentStatus: '', problemStatementId: '', college: '' };

export default function Participants() {
  const { push } = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTER);
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [exporting, setExporting] = useState('');

  const problems = useAsync(() => adminFetchProblems(), []);
  const teams = useAsync(() => adminFetchTeamOptions(), []);
  const colleges = useAsync(() => adminFetchColleges(), []);

  const query = useCallback(
    () => adminFetchParticipants({ ...filters, sortBy: sortKey, sortDir, page, pageSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.search, filters.teamId, filters.paymentStatus, filters.problemStatementId, filters.college, sortKey, sortDir, page, pageSize]
  );
  const { data, loading, error, reload } = useAsync(query, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(filters),
    sortKey,
    sortDir,
    page,
    pageSize,
  ]);

  useEffect(() => {
    setPage(0);
  }, [filters]);

  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));
  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);
  const clearFilters = () => {
    setFilters(EMPTY_FILTER);
    setPage(0);
  };

  const onSort = (key) => {
    setPage(0);
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'fullName' || key === 'teamName' || key === 'college' ? 'asc' : 'desc');
    }
  };

  const exportRows = async (scope) => {
    setExporting(scope);
    try {
      const rows = await adminFetchAllParticipants(scope === 'filtered' ? filters : {});
      const { name } = await downloadExcel({
        kind: 'participants',
        rows,
        suffix: scope === 'filtered' ? 'filtered' : 'all',
      });
      push(`${rows.length} PARTICIPANTS EXPORTED → ${name}`, 'success');
    } catch (err) {
      push(err?.message || 'EXPORT FAILED', 'error');
    } finally {
      setExporting('');
    }
  };

  const teamOptions = (teams.data ?? []).map((t) => ({ value: t.id, label: t.team_name }));
  const problemOptions = (problems.data ?? []).map((p) => ({
    value: p.id,
    label: `${String(p.track).toUpperCase()} / ${p.title}`,
  }));

  return (
    <>
      <PageHeader
        eyebrow="REGISTRY / PEOPLE"
        title="ALL PARTICIPANTS"
        meta={`${data?.count ?? '—'} MEMBERS ACROSS ALL TEAMS`}
        actions={
          <>
            <ExportButton onClick={() => exportRows('all')} busy={exporting === 'all'} label="EXPORT PARTICIPANTS" />
            {hasFilters && (
              <ExportButton
                onClick={() => exportRows('filtered')}
                busy={exporting === 'filtered'}
                label="EXPORT FILTERED"
                variant="outline"
              />
            )}
            <RefreshButton onClick={reload} busy={loading} />
          </>
        }
      />

      <div className="cpa-toolbar">
        <SearchBar
          value={filters.search}
          onChange={(v) => setFilter('search', v)}
          placeholder="SEARCH NAME / EMAIL / PHONE / CODE / TEAM / COLLEGE"
        />
        <div className="cpa-toolbar__filters">
          <SelectField label="TEAM" value={filters.teamId} onChange={(v) => setFilter('teamId', v)} options={teamOptions} />
          <FilterChips value={filters.paymentStatus} onChange={(v) => setFilter('paymentStatus', v)} options={STATUS_OPTIONS} />
          <SelectField label="PROBLEM" value={filters.problemStatementId} onChange={(v) => setFilter('problemStatementId', v)} options={problemOptions} />
          <SelectField label="COLLEGE" value={filters.college} onChange={(v) => setFilter('college', v)} options={(colleges.data ?? []).map((c) => ({ value: c, label: c }))} />
          {hasFilters && (
            <button type="button" className="cpa-btn cpa-btn--ghost cpa-btn--sm" onClick={clearFilters}>
              ✕ CLEAR FILTERS
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={data?.rows ?? []}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        loading={loading}
        error={error}
        onRefresh={reload}
        emptyMessage="NO PARTICIPANTS MATCH YOUR FILTERS"
        onRowClick={(row) => setSelectedTeam(row.teamId)}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            count={data?.count ?? 0}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(0);
            }}
          />
        }
      />

      {selectedTeam && (
        <TeamDetailsDrawer
          teamId={selectedTeam}
          onClose={() => setSelectedTeam(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}