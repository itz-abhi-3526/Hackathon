/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Attendance Dashboard
   Live entry tracking for VERIFIED teams (additive attendance system):
   stat cards, realtime postgres changes feed, searchable / filterable /
   sortable records table, per-team view modal, and the two EXCEL
   exports (per-participant report + team summary).
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminFetchAttendanceStats,
  adminFetchAttendanceRecords,
  adminFetchAttendanceAll,
  adminFetchColleges,
  collapseAttendanceTeams,
} from '../services/adminData.js';
import { ATTENDANCE_STATUS } from '../../lib/schema.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../components/Toast.jsx';
import { getAdminSupabase } from '../../lib/supabase.js';
import { PageHeader, StatCard } from '../components/Page.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { SearchBar, SelectField, FilterChips, Pagination, ExportButton, RefreshButton } from '../components/Toolbar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import TeamAttendanceModal from '../components/TeamAttendanceModal.jsx';
import { downloadExcel } from '../services/adminExcel.js';

const STATUS_OPTIONS = Object.values(ATTENDANCE_STATUS).map((s) => ({
  value: s,
  label: String(s).toUpperCase(),
}));

const EMPTY_FILTER = { search: '', status: '', college: '' };

export default function Attendance() {
  const { push } = useToast();
  const [filters, setFilters] = useState(EMPTY_FILTER);
  const [sortKey, setSortKey] = useState('markedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [exporting, setExporting] = useState('');
  const [viewTeamId, setViewTeamId] = useState(null);
  const [live, setLive] = useState(false);

  const colleges = useAsync(() => adminFetchColleges(), []);
  const stats = useAsync(() => adminFetchAttendanceStats(), []);

  const query = useCallback(
    () => adminFetchAttendanceRecords({ ...filters, sortBy: sortKey, sortDir, page, pageSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filters.search, filters.status, filters.college, sortKey, sortDir, page, pageSize]
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

  const hasFilters = useMemo(() => Object.values(filters).some(Boolean), [filters]);
  const clearFilters = () => {
    setFilters(EMPTY_FILTER);
    setPage(0);
  };
  const setFilter = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const onSort = (key) => {
    setPage(0);
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortDir(key === 'participantName' || key === 'teamName' || key === 'college' ? 'asc' : 'desc');
      setSortKey(key);
    }
  };

  /* Realtime — attendance table only; any admin write (scanner or
     dashboard) refreshes stats + records instantly. */
  useEffect(() => {
    const supabase = getAdminSupabase();
    const channel = supabase
      .channel('attendance-live')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance' },
        () => {
          stats.reload();
          reload();
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') setLive(true);
      });
    return () => {
      supabase.removeChannel(channel);
      setLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scopeFilters = () => (hasFilters ? filters : {});

  const exportRows = async (scope) => {
    setExporting(scope);
    try {
      const rows = await adminFetchAttendanceAll(scope === 'filtered' ? filters : {});
      const { name } = await downloadExcel({
        kind: 'attendance',
        rows,
        suffix: scope === 'filtered' ? 'filtered' : 'all',
      });
      push(`${rows.length} ATTENDANCE ROWS EXPORTED → ${name}`, 'success');
    } catch (err) {
      push(err?.message || 'EXPORT FAILED', 'error');
    } finally {
      setExporting('');
    }
  };

  const exportTeams = async () => {
    setExporting('teams');
    try {
      const rows = await adminFetchAttendanceAll(scopeFilters());
      const summary = collapseAttendanceTeams(rows);
      const { name } = await downloadExcel({
        kind: 'attendanceTeams',
        rows: summary,
        suffix: 'summary',
      });
      push(`${summary.length} TEAMS EXPORTED → ${name}`, 'success');
    } catch (err) {
      push(err?.message || 'EXPORT FAILED', 'error');
    } finally {
      setExporting('');
    }
  };

  const stat = stats.data ?? {};
  const statCards = [
    { label: 'VERIFIED PARTICIPANTS', value: String(stat.total ?? '—') },
    { label: 'PRESENT', value: String(stat.present ?? '—'), tone: 'ok' },
    { label: 'ABSENT', value: String(stat.absent ?? '—') },
    { label: 'CHECKED-IN TEAMS', value: `${stat.teamsCheckedIn ?? '—'} / ${stat.teamsTotal ?? '—'}` },
    { label: 'ATTENDANCE RATE', value: `${stat.pct ?? '—'}%`, tone: stat.pct && stat.pct >= 50 ? 'ok' : '' },
    { label: 'TEAMS NOT CHECKED IN', value: String(stat.teamsNotCheckedIn ?? '—') },
  ];

  const COLUMNS = [
    {
      key: 'participantName',
      label: 'PARTICIPANT',
      sortable: true,
      render: (r) => (
        <div className="cpa-cell">
          <span className="cpa-cell__name">
            {r.participantName}
            {r.registrationCode && <em className="cpa-team-chip">{r.registrationCode}</em>}
          </span>
          <span className="cpa-cell__code">{r.participantEmail}</span>
        </div>
      ),
      className: 'cpa-grid--grow',
    },
    { key: 'teamName', label: 'TEAM', sortable: true, render: (r) => <span className="cpa-truncate">{r.teamName}</span>, className: 'cpa-grid--grow' },
    { key: 'college', label: 'COLLEGE', sortable: true, render: (r) => <span className="cpa-truncate cpa-mut">{r.college || '—'}</span> },
    { key: 'status', label: 'STATUS', sortable: true, render: (r) => <StatusBadge status={r.status} size="sm" /> },
    {
      key: 'view',
      label: '',
      render: (r) => (
        <button
          type="button"
          className="cpa-row-action"
          onClick={(e) => {
            e.stopPropagation();
            setViewTeamId(r.teamId);
          }}
        >
          VIEW TEAM
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="EVENT / ENTRY"
        title="ATTENDANCE"
        meta={`${data?.count ?? '—'} RECORDS · ${stat.teamsNotCheckedIn ?? '—'} TEAMS NOT YET CHECKED IN`}
        actions={
          <>
            <span className="cpa-live" style={live ? {} : { color: 'var(--cpa-faint)' }}>
              <span className="cpa-live__dot" style={live ? {} : { background: 'var(--cpa-faint)', animation: 'none' }} aria-hidden="true" />
              {live ? 'LIVE' : 'OFFLINE'}
            </span>
            <ExportButton onClick={() => exportRows('all')} busy={exporting === 'all'} label="EXPORT REPORT" />
            <ExportButton onClick={exportTeams} busy={exporting === 'teams'} label="EXPORT TEAM SUMMARY" variant="outline" />
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

      <section className="cpa-cards">
        {statCards.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} tone={s.tone} />
        ))}
      </section>

      <div className="cpa-toolbar">
        <SearchBar
          value={filters.search}
          onChange={(v) => setFilter('search', v)}
          placeholder="SEARCH PARTICIPANT / TEAM / CODE / COLLEGE"
        />
        <div className="cpa-toolbar__filters">
          <FilterChips value={filters.status} onChange={(v) => setFilter('status', v)} options={STATUS_OPTIONS} />
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
        columns={COLUMNS}
        rows={data?.rows ?? []}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        loading={loading}
        error={error}
        onRefresh={reload}
        emptyMessage="NO ATTENDANCE RECORDS MATCH YOUR FILTERS"
        onRowClick={(row) => setViewTeamId(row.teamId)}
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

      {viewTeamId && (
        <TeamAttendanceModal
          teamId={viewTeamId}
          onClose={() => setViewTeamId(null)}
          onChanged={() => {
            stats.reload();
            reload();
          }}
        />
      )}
    </>
  );
}