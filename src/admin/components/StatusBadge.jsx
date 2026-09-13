/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Status badge / payment status chip
   ═══════════════════════════════════════════════════════════════ */

export default function StatusBadge({ status, size = 'md' }) {
  const label = String(status ?? '').toUpperCase() || '—';
  return (
    <span className={`cpa-badge cpa-badge--${String(status ?? 'none').toLowerCase()} cpa-badge--${size}`}>
      <span className="cpa-badge__dot" aria-hidden="true" />
      {label}
    </span>
  );
}