/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Access denied
   Signed-in but not on the admin allowlist, or the is_admin() gate is
   unavailable. There is nothing further to render.
   ═══════════════════════════════════════════════════════════════ */

export default function AccessDenied({ email, error, onSignOut, onViewSite }) {
  return (
    <div className="cpa-denied">
      <div className="cpa-denied__card">
        <span className="cpa-denied__code" aria-hidden="true">403</span>
        <p className="cpa-denied__eyebrow">ACCESS DENIED</p>
        {email && <p className="cpa-denied__who">{email}</p>}
        <p className="cpa-denied__msg">
          {error ||
            'This account is not on the HACK2PITCH admin allowlist. Administrative privileges are granted per-email only.'}
        </p>
        <div className="cpa-denied__actions">
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onViewSite}>← BACK TO SITE</button>
          <button type="button" className="cpa-btn cpa-btn--danger" onClick={onSignOut}>SIGN OUT</button>
        </div>
      </div>
    </div>
  );
}