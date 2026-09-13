/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — DataTable
   A dense, sortable admin table shell used by every data page.
   Columns config: { key, label, sortable, render, className, align,
   width }. Handles loading / empty / error states itself.
   ═══════════════════════════════════════════════════════════════ */

export function SkeletonRows({ cols, rows = 6 }) {
  return (
    <div className="cpa-skeleton" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className={`cpa-skeleton__row cpa-skeleton--cols-${cols}`}>
          {Array.from({ length: cols }).map((_, c) => (
            <span key={c} className="cpa-skeleton__cell" style={{ animationDelay: `${c * 60}ms` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  sortKey,
  sortDir,
  onSort,
  loading,
  error,
  emptyMessage = 'NO DATA FOUND',
  onRefresh,
  rowKey = (r) => r.id,
  onRowClick,
  footer,
}) {
  const hasRows = Array.isArray(rows) && rows.length > 0;

  return (
    <div className={onRowClick ? 'cpa-table cpa-table--clickable' : 'cpa-table'}>
      <div className="cpa-table__scroll">
        <table className="cpa-grid">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`cpa-grid__th ${col.className ?? ''} ${col.align ? `cpa-grid--${col.align}` : ''}`}
                  style={col.width ? { width: col.width } : undefined}
                  scope="col"
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      className={`cpa-grid__sort${sortKey === col.key ? ' cpa-grid__sort--on' : ''}`}
                      onClick={() => onSort?.(col.key)}
                    >
                      {col.label}
                      <span className="cpa-grid__sort-arrow" aria-hidden="true">
                        {sortKey === col.key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {loading ? (
            <tbody />
          ) : hasRows ? (
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="cpa-grid__tr"
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`cpa-grid__td ${col.className ?? ''} ${col.align ? `cpa-grid--${col.align}` : ''}`}
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ) : null}
        </table>

        {loading && <SkeletonRows cols={columns.length} />}
        {!loading && error && (
          <div className="cpa-state cpa-state--error">
            <p>{error}</p>
            {onRefresh && (
              <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onRefresh}>
                RETRY
              </button>
            )}
          </div>
        )}
        {!loading && !error && !hasRows && (
          <div className="cpa-state cpa-state--empty">{emptyMessage}</div>
        )}
      </div>
      {footer && <div className="cpa-table__foot">{footer}</div>}
    </div>
  );
}