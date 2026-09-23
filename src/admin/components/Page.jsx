/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — StatCard + PageHeader
   ═══════════════════════════════════════════════════════════════ */

export function StatCard({ label, value, hint, tone, sub }) {
  return (
    <div className={`cpa-stat${tone ? ` cpa-stat--${tone}` : ''}`}>
      <span className="cpa-stat__label">{label}</span>
      <span className="cpa-stat__value">{value}</span>
      {hint && <span className="cpa-stat__hint">{hint}</span>}
      {sub && <span className="cpa-stat__sub">{sub}</span>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, meta, actions }) {
  return (
    <div className="cpa-page-head">
      <div className="cpa-page-head__titles">
        {eyebrow && <span className="cpa-page-head__eyebrow">{eyebrow}</span>}
        <h1 className="cpa-page-head__title">{title}</h1>
        {meta && <p className="cpa-page-head__meta">{meta}</p>}
      </div>
      {actions && <div className="cpa-page-head__actions">{actions}</div>}
    </div>
  );
}