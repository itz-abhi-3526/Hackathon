/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — EmailStatusCell
   Reusable table cell for the Email column in Teams (Registrations)
   and Payments pages. Shows the current verification/rejection email
   tracking status, lead email address, and the appropriate Send /
   Retry / Resend action button.

   Which email is shown follows the team's payment state:
     verified → verification email controls
     rejected → rejection email controls
     pending/submitted → locked (verify or reject payment first)

   All state management (sendingId, dialogs) lives in the parent page —
   this component is pure render.
   ═══════════════════════════════════════════════════════════════ */

import { dateLabel } from '../utils/format.js';

const EMAIL_LABELS = {
  verify: {
    send: 'SEND VERIFICATION EMAIL',
    retry: 'RETRY VERIFICATION EMAIL',
  },
  reject: {
    send: 'SEND REJECTION EMAIL',
    retry: 'RETRY REJECTION EMAIL',
  },
};

export default function EmailStatusCell({ row, busy, onSend, onResend }) {
  const kind =
    row.paymentStatus === 'rejected'
      ? 'reject'
      : row.paymentStatus === 'verified'
      ? 'verify'
      : null;
  const labels = EMAIL_LABELS[kind];

  if (!kind || !labels) {
    return (
      <div className="cpa-email-cell">
        <span className="cpa-email-cell__locked cpa-muted-sm">
          VERIFY OR REJECT PAYMENT FIRST
        </span>
      </div>
    );
  }

  const verify = kind === 'verify';
  const status = verify
    ? (row.verificationEmailStatus ?? 'pending')
    : (row.rejectionEmailStatus ?? 'pending');
  const sentAt = verify ? row.verificationEmailSentAt : row.rejectionEmailSentAt;
  const sentTo = verify
    ? row.verificationEmailLastSentTo
    : row.rejectionEmailLastSentTo;

  if (status === 'sent') {
    return (
      <div className="cpa-email-cell">
        <span className="cpa-badge cpa-badge--verified cpa-badge--sm">
          <span className="cpa-badge__dot" aria-hidden="true" />SENT
        </span>
        {sentTo && (
          <span className="cpa-email-cell__to cpa-muted-sm">{sentTo}</span>
        )}
        {sentAt && (
          <span className="cpa-email-cell__at cpa-muted-sm">{dateLabel(sentAt)}</span>
        )}
        <button
          type="button"
          className="cpa-actions__btn cpa-email-cell__btn"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onResend?.(row, kind); }}
        >
          {busy ? 'SENDING…' : 'RESEND EMAIL'}
        </button>
      </div>
    );
  }

  if (status === 'failed') {
    return (
      <div className="cpa-email-cell">
        <span className="cpa-badge cpa-badge--rejected cpa-badge--sm">
          <span className="cpa-badge__dot" aria-hidden="true" />FAILED
        </span>
        <button
          type="button"
          className="cpa-actions__btn cpa-actions__btn--ok cpa-email-cell__btn"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onSend?.(row, kind); }}
        >
          {busy ? 'SENDING…' : labels.retry}
        </button>
      </div>
    );
  }

  /* pending — never sent */ 
  return (
    <div className="cpa-email-cell">
      <span className="cpa-badge cpa-badge--pending cpa-badge--sm">
        <span className="cpa-badge__dot" aria-hidden="true" />NOT SENT
      </span>
      <button
        type="button"
        className="cpa-actions__btn cpa-actions__btn--ok cpa-email-cell__btn"
        disabled={busy}
        onClick={(e) => { e.stopPropagation(); onSend?.(row, kind); }}
      >
        {busy ? 'SENDING…' : labels.send}
      </button>
    </div>
  );
}