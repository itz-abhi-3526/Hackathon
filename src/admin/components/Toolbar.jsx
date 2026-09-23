/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — SearchBar + FilterBar + Pagination + ExportButton
   Small, dense, keyboard-accessible admin controls.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useRef, useState } from 'react';

export function SearchBar({ value, onChange, placeholder = 'SEARCH', onClear }) {
  const [local, setLocal] = useState(value ?? '');
  const timer = useRef(null);

  useEffect(() => setLocal(value ?? ''), [value]);

  const commit = (v) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(v), 300);
  };

  return (
    <div className="cpa-search">
      <span className="cpa-search__icon" aria-hidden="true">⌕</span>
      <input
        className="cpa-search__input"
        value={local}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          setLocal(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (timer.current) clearTimeout(timer.current);
            onChange(local);
          }
        }}
      />
      {local && (
        <button
          className="cpa-search__clear"
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setLocal('');
            if (timer.current) clearTimeout(timer.current);
            onChange('');
            onClear?.();
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

export function SelectField({ label, value, onChange, options, allLabel }) {
  return (
    <label className="cpa-field">
      {label && <span className="cpa-field__label">{label}</span>}
      <span className="cpa-field__wrap">
        <select
          className="cpa-field__select"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{allLabel ?? 'ALL'}</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="cpa-field__arrow" aria-hidden="true">▾</span>
      </span>
    </label>
  );
}

export function FilterChips({ options, value, onChange, allLabel = 'ALL' }) {
  return (
    <div className="cpa-chips" role="group" aria-label="Status filter">
      <button
        type="button"
        className={`cpa-chip${value === '' ? ' cpa-chip--on' : ''}`}
        onClick={() => onChange('')}
      >
        {allLabel}
      </button>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`cpa-chip${value === o.value ? ' cpa-chip--on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, count, onPage, onPageSize }) {
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / (pageSize || 1)));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <div className="cpa-pager">
      <span className="cpa-pager__meta">
        {from}–{to} OF {total}
      </span>
      {onPageSize && (
        <label className="cpa-pager__size">
          ROWS
          <span className="cpa-field__wrap cpa-field__wrap--sm">
            <select
              className="cpa-field__select"
              value={pageSize}
              onChange={(e) => onPageSize(Number(e.target.value))}
            >
              {[10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span className="cpa-field__arrow" aria-hidden="true">▾</span>
          </span>
        </label>
      )}
      <div className="cpa-pager__btns">
        <button
          type="button"
          className="cpa-pager__btn"
          disabled={page <= 0}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          ‹
        </button>
        <span className="cpa-pager__page">
          {page + 1} / {pages}
        </span>
        <button
          type="button"
          className="cpa-pager__btn"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}

export function ExportButton({ onClick, busy, label = 'EXPORT', title, variant = 'ghost' }) {
  return (
    <button
      type="button"
      className={`cpa-export cpa-export--${variant}`}
      onClick={onClick}
      disabled={busy}
      title={title}
    >
      <span aria-hidden="true" className="cpa-export__ico">⬇</span>
      {busy ? 'WRITING…' : label}
    </button>
  );
}

export function RefreshButton({ onClick, busy }) {
  return (
    <button
      type="button"
      className="cpa-refresh"
      onClick={onClick}
      disabled={busy}
      aria-label="Refresh data"
      title="Refresh"
    >
      {busy ? '…' : '↻'}
    </button>
  );
}