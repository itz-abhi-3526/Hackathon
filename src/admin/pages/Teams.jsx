/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Teams
   Full registry table with server-side search / filter / sort /
   pagination, an inspection drawer per team and Excel export of the
   whole set or just the filtered subset.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminFetchTeams,
  adminFetchColleges,
  adminFetchAllTeams,
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
import { codeFor, dateLabel, problemLabel, roundLabel, feeLabel } from '../utils/format.js';
import { downloadExcel } from '../services/adminExcel.js';

const STATUS_OPTIONS = Object.values(TEAM_PAYMENT_STATUS).map((s) => ({
  value: s,
  label: String(s).toUpperCase(),
}));

function TeamCell({ row }) {
  return (
    <div className="cpa-cell">
      <span className="cpa-cell__name">{row.teamName}</span>
    </div>
  );
}

function buildColumns(onOpen) {
  return [
    {
      key: 'teamName',
      label: 'TEAM',
      sortable: true,
      render: (row) => <TeamCell row={row} />,
      className: 'cpa-grid--grow',
    },
    {
      key: 'registrationCode',
      label: 'REG CODE',
      render: (row) => <span className="cpa-code cpa-nowrap">{codeFor(row)}</span>,
    },
    {
      key: 'college',
      label: 'COLLEGE',
      sortable: true,
      render: (row) => <span className="cpa-truncate">{row.college}</span>,
      className: 'cpa-grid--grow',
    },
    {
      key: 'problem',
      label: 'PROBLEM STATEMENT',
      render: (row) => <span className="cpa-truncate cpa-mut">{problemLabel(row.problem)}</span>,
    },
    {
      key: 'registrationRound',
      label: 'ROUND',
      render: (row) => <span className="cpa-truncate cpa-mut">{roundLabel(row)}</span>,
    },
    {
      key: 'registrationFee',
      label: 'REG FEE',
      align: 'center',
      render: (row) => <span className="cpa-nowrap">{feeLabel(row.registrationFee)}</span>,
    },
    {
      key: 'memberCount',
      label: 'MEMBERS',
      sortable: true,
      align: 'center',
      render: (row) => <span className="cpa-num">{String(row.memberCount).padStart(2, '0')}</span>,
    },
    {
      key: 'paymentStatus',
      label: 'PAYMENT',
      sortable: true,
      render: (row) => <StatusBadge status={row.paymentStatus} size="sm" />,
    },
    {
      key: 'createdAt',
      label: 'REGISTERED',
      sortable: true,
      render: (row) => <span className="cpa-mut cpa-nowrap">{dateLabel(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      label: 'ACTIONS',
      align: 'right',
      render: (row) => (
        <button
          type="button"
          className="cpa-btn cpa-btn--ghost cpa-btn--sm"
          onClick={(e) => {
            e.stopPropagation();
            onOpen(row.id);
          }}
        >
          VIEW →
        </button>
      ),
    },
  ];
}

const EMPTY_FILTER = { search: '', paymentStatus: '', problemStatementId: '', college: '' };

export default function Teams() {
  const { push } = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTER);
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [exporting, setExporting] = useState('');

  const problems = useAsync(() => adminFetchProblems(), []);
  const colleges = useAsync(() => adminFetchColleges(), []);

  const columns = useMemo(() => buildColumns(setSelectedTeam), []);

  const query = useCallback(
    () =>
      adminFetchTeams({
        ...filters,
        sortBy: sortKey,
        sortDir,
        page,
        pageSize,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.search, filters.paymentStatus, filters.problemStatementId, filters.college, sortKey, sortDir, page, pageSize]
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

  const setFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const hasFilters = useMemo(
    () => Object.values(filters).some(Boolean),
    [filters]
  );

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
      setSortDir(key === 'paymentStatus' || key === 'teamName' || key === 'college' ? 'asc' : 'desc');
    }
  };

  const exportTeams = async (scope) => {
    setExporting(scope);
    try {
      const rows = await adminFetchAllTeams(scope === 'filtered' ? filters : {});
      const { name } = await downloadExcel({
        kind: 'teams',
        rows,
        suffix: scope === 'filtered' ? 'filtered' : 'all',
      });
      push(`${rows.length} TEAMS EXPORTED → ${name}`, 'success');
    } catch (err) {
      push(err?.message || 'EXPORT FAILED', 'error');
    } finally {
      setExporting('');
    }
  };

  const problemOptions = (problems.data ?? []).map((p) => ({
    value: p.id,
    label: `${String(p.track).toUpperCase()} / ${p.title}`,
  }));

  return (
    <>
      <PageHeader
        eyebrow="REGISTRY / TEAMS"
        title="ALL TEAMS"
        meta={`${data?.count ?? '—'} REGISTERED CREWS`}
        actions={
          <>
            <ExportButton onClick={() => exportTeams('all')} busy={exporting === 'all'} label="EXPORT TEAMS" />
            {hasFilters && (
              <ExportButton
                onClick={() => exportTeams('filtered')}
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
          placeholder="SEARCH NAME / CODE / COLLEGE"
        />
        <div className="cpa-toolbar__filters">
          <FilterChips
            value={filters.paymentStatus}
            onChange={(v) => setFilter('paymentStatus', v)}
            options={STATUS_OPTIONS}
          />
          <SelectField
            label="PROBLEM"
            value={filters.problemStatementId}
            onChange={(v) => setFilter('problemStatementId', v)}
            options={problemOptions}
          />
          <SelectField
            label="COLLEGE"
            value={filters.college}
            onChange={(v) => setFilter('college', v)}
            options={(colleges.data ?? []).map((c) => ({ value: c, label: c }))}
          />
          {hasFilters && (
            <button type="button" className="cpa-btn cpa-btn--ghost cpa-btn--sm" onClick={clearFilters}>
              ✕ CLEAR FILTERS
            </button>
          )}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={data?.rows ?? []}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        loading={loading}
        error={error}
        onRefresh={reload}
        emptyMessage="NO TEAMS MATCH YOUR FILTERS"
        onRowClick={(row) => setSelectedTeam(row.id)}
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