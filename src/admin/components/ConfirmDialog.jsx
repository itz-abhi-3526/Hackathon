/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — ConfirmDialog
   Dense confirmation modal used for destructive admin actions
   (e.g. marking a payment rejected).
   ═══════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';

export default function ConfirmDialog({
  title = 'CONFIRM',
  message,
  confirmLabel = 'CONFIRM',
  tone = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel, busy]);

  return (
    <div className="cpa-modal cpa-modal--sm" role="dialog" aria-modal="true" aria-label={title}>
      <div className="cpa-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="cpa-modal__head">
          <span className="cpa-modal__eyebrow">ACTION REQUIRED</span>
          <button type="button" className="cpa-modal__close" onClick={onCancel} aria-label="Cancel" disabled={busy}>×</button>
        </div>
        <div className="cpa-modal__body">
          <h3 className="cpa-modal__title cpa-modal__title--lg">{title}</h3>
          {message && <p className="cpa-modal__msg">{message}</p>}
        </div>
        <div className="cpa-modal__foot">
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onCancel} disabled={busy}>
            CANCEL
          </button>
          <button
            type="button"
            className={`cpa-btn cpa-btn--${tone}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'SAVING…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}