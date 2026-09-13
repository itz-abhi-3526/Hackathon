/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — PaymentProofViewer
   Modal preview of a team's Cloudinary payment screenshot. The stored
   URL is an HTTPS Cloudinary secure_url (public by construction of the
   unsigned upload preset) — no Supabase storage is exposed. Esc /
   backdrop closes; "OPEN ORIGINAL" opens the full image in a new tab.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect } from 'react';

export default function PaymentProofViewer({ url, teamName, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="cpa-modal" role="dialog" aria-modal="true" aria-label="Payment proof preview" onClick={onClose}>
      <div className="cpa-modal__card" onClick={(e) => e.stopPropagation()}>
        <div className="cpa-modal__head">
          <div className="cpa-modal__titles">
            <span className="cpa-modal__eyebrow">PAYMENT PROOF</span>
            <span className="cpa-modal__title">{teamName || 'TEAM'}</span>
          </div>
          <button type="button" className="cpa-modal__close" onClick={onClose} aria-label="Close preview">×</button>
        </div>
        <div className="cpa-proof">
          <img className="cpa-proof__img" src={url} alt={teamName ? `${teamName} payment proof` : 'Payment proof'} />
        </div>
        <div className="cpa-modal__foot">
          <a className="cpa-btn cpa-btn--ghost" href={url} target="_blank" rel="noreferrer noopener">
            OPEN ORIGINAL ↗
          </a>
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
}