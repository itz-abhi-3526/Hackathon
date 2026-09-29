/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — TeamDetailsDrawer
   Right-side detail drawer for inspecting one registration: team info,
   challenge, payment proof (thumbnail → ProofViewer) and its full crew.
   Payment status is updated inline (the ONLY admin write); marking a
   payment "rejected" asks for confirmation first. Copy buttons are
   provided for every useful key.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useRef, useState } from 'react';
import { adminFetchTeamDetail, adminSetPaymentStatus, adminSendVerificationEmail, adminSendRejectionEmail, adminSendWhatsappConfirmation } from '../services/adminData.js';
import { TEAM_PAYMENT_STATUS } from '../../lib/schema.js';
import { codeFor, dateLabel, feeLabel, foodLabel, problemLabel, roleLabel, roundLabel } from '../utils/format.js';
import StatusBadge from './StatusBadge.jsx';
import PaymentProofViewer from './PaymentProofViewer.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { useToast } from './Toast.jsx';

const EMAIL_MESSAGES = {
  TEAM_NOT_FOUND: 'Registration not found.',
  PAYMENT_NOT_VERIFIED: 'Payment must be verified before sending the verification email.',
  PAYMENT_NOT_REJECTED: 'Payment must be rejected before sending the rejection email.',
  LEAD_EMAIL_MISSING: 'Team leader email is missing.',
  INVALID_LEAD_EMAIL: 'The registered leader email is invalid.',
  EMAIL_SEND_FAILED: 'Failed to send email. Please try again.',
};

/* Backend codes for the WhatsApp confirmation channel → human text.
   The function stores ONLY these codes (never a Meta error body, which
   can echo the recipient number), so the same map renders the live
   LAST ERROR field and a fresh failure toast. The Meta access token
   never leaves the server and no raw API response is ever shown. */
const WHATSAPP_MESSAGES = {
  PAYMENT_NOT_VERIFIED: 'Payment must be verified before sending the WhatsApp confirmation.',
  LEAD_PHONE_MISSING: 'The team leader has no phone number on file.',
  LEAD_PHONE_INVALID: 'The team leader phone number is not a valid WhatsApp number.',
  TEMPLATE_PARAMETER_MISSING: 'Registration data is incomplete — the lead name, team name and registration ID are all required.',
  QR_IMAGE_MISSING: 'The attendance QR could not be built. Check the team record and try again.',
  WHATSAPP_MEDIA_UPLOAD_FAILED: 'WhatsApp could not accept the attendance QR image. Please try again.',
  WHATSAPP_SEND_FAILED: 'WhatsApp rejected the message. Please try again.',
  WHATSAPP_ACCESS_TOKEN_MISSING: 'WhatsApp is not configured on the server. Ask the tech team to set the WhatsApp secret.',
  WHATSAPP_PHONE_NUMBER_ID_MISSING: 'The WhatsApp sender is not configured on the server. Ask the tech team to set the WhatsApp secret.',
};

const STATUS_ORDER = Object.values(TEAM_PAYMENT_STATUS);

function Copy({ value, label }) {
  const { push } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value ?? '');
      push(`${label} COPIED`, 'success');
    } catch {
      push('COPY FAILED', 'error');
    }
  };
  return (
    <button type="button" className="cpa-copy" onClick={copy} aria-label={`Copy ${label}`} title={`Copy ${label}`}>
      ⧉
    </button>
  );
}

function KV({ label, value, copy }) {
  return (
    <div className="cpa-kv">
      <span className="cpa-kv__label">{label}</span>
      <span className="cpa-kv__value">
        {value ?? '—'}
        {copy && <Copy value={copy} label={label} />}
      </span>
    </div>
  );
}

export default function TeamDetailsDrawer({ teamId, onClose, onChanged }) {
  const { push } = useToast();
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [confirmResendEmail, setConfirmResendEmail] = useState(false);
  const [whatsappBusy, setWhatsappBusy] = useState(false);
  /* Ref lock, not just the disabled prop: state commits on the next
     render, so two clicks inside the same frame could otherwise both
     pass a whatsappBusy check and fire two WhatsApp messages. */
  const whatsappLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDetail(await adminFetchTeamDetail(teamId));
    } catch (err) {
      setError(err?.message || 'TEAM COULD NOT BE LOADED');
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    if (teamId) load();
  }, [teamId, load]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const changeStatus = async (status, reason = '') => {
    setBusy(true);
    try {
      await adminSetPaymentStatus(teamId, status, reason);
      setDetail((d) =>
        d
          ? {
              ...d,
              team: {
                ...d.team,
                paymentStatus: status,
                rejectionReason:
                  status === 'rejected' ? (String(reason ?? '').trim() || d.team.rejectionReason) : null,
              },
            }
          : d
      );
      push(`PAYMENT MARKED ${String(status).toUpperCase()}`, 'success');
      onChanged?.();
    } catch (err) {
      push(err?.message || 'STATUS UPDATE FAILED', 'error');
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = useCallback(async (kind = 'verify') => {
    if (!teamId) return;
    const isReject = kind === 'reject';
    setEmailBusy(true);
    try {
      const result = isReject
        ? await adminSendRejectionEmail(teamId)
        : await adminSendVerificationEmail(teamId);
      if (result?.ok) {
        if (result.statusUpdated === false) {
          push('EMAIL SENT \u2014 STATUS NOT RECORDED ON SERVER. CHECK LOGS.', 'error');
        } else {
          push(isReject ? 'REJECTION EMAIL SENT' : 'VERIFICATION EMAIL SENT', 'success');
        }
        onChanged?.();
        await load();
      } else {
        push(EMAIL_MESSAGES[result?.code] ?? result?.error ?? 'FAILED TO SEND EMAIL', 'error');
      }
    } catch (err) {
      push(err?.message || 'FAILED TO SEND EMAIL', 'error');
    } finally {
      setEmailBusy(false);
    }
  }, [teamId, load, onChanged, push]);

  /* WhatsApp confirmation — ALWAYS an explicit manual admin click.
     Never chained to a payment change, never chained to an email send,
     and never retried automatically. It posts only { teamId, action:
     'send_whatsapp' } through the same authenticated invoke the email
     buttons use; the backend resolves the lead's phone and the QR. */
  const sendWhatsapp = useCallback(async () => {
    if (!teamId || whatsappLock.current) return;
    whatsappLock.current = true;
    setWhatsappBusy(true);
    try {
      const result = await adminSendWhatsappConfirmation(teamId);
      if (result?.ok) {
        if (result.statusUpdated === false) {
          push('MESSAGE SENT \u2014 STATUS NOT RECORDED ON SERVER. CHECK LOGS.', 'error');
        } else {
          push('VERIFICATION MESSAGE SENT ON WHATSAPP', 'success');
        }
        onChanged?.();
        await load();
      } else {
        push(
          WHATSAPP_MESSAGES[result?.code] ?? result?.error ?? 'FAILED TO SEND THE WHATSAPP MESSAGE',
          'error'
        );
        /* Re-read so the section shows FAILED + the stored code, exactly
           as the server recorded it. */
        await load();
      }
    } catch (err) {
      push(err?.message || 'FAILED TO SEND THE WHATSAPP MESSAGE', 'error');
    } finally {
      whatsappLock.current = false;
      setWhatsappBusy(false);
    }
  }, [teamId, load, onChanged, push]);

  const team = detail?.team;
  const members = detail?.members ?? [];
  const lead = members.find((m) => m.role === 'lead');

  const emailKind = team?.paymentStatus === 'rejected' ? 'reject' : 'verify';
  const emailFields =
    emailKind === 'reject'
      ? {
          status: team?.rejectionEmailStatus ?? 'pending',
          sentAt: team?.rejectionEmailSentAt,
          sentTo: team?.rejectionEmailLastSentTo,
          lastError: team?.rejectionEmailLastError,
          sendCount: team?.rejectionEmailSendCount ?? 0,
        }
      : {
          status: team?.verificationEmailStatus ?? 'pending',
          sentAt: team?.verificationEmailSentAt,
          sentTo: team?.verificationEmailLastSentTo,
          lastError: team?.verificationEmailLastError,
          sendCount: team?.verificationEmailSendCount ?? 0,
        };
  const emailEligible =
    team?.paymentStatus === 'verified' || team?.paymentStatus === 'rejected';
  const sendVerb = emailKind === 'reject' ? 'SEND REJECTION EMAIL' : 'SEND VERIFICATION EMAIL';

  /* WhatsApp channel — separate state, separate action, same styling.
     Eligible only for a VERIFIED team: the confirmation mirrors the
     verification email, so a pending/submitted/rejected team shows the
     same locked note the email section uses. */
  const whatsappEligible = team?.paymentStatus === 'verified';
  const whatsappStatus = team?.whatsappStatus ?? 'pending';
  const whatsappVerb =
    whatsappStatus === 'sent'
      ? 'RESEND VERIFICATION MESSAGE'
      : whatsappStatus === 'failed'
        ? 'RETRY VERIFICATION MESSAGE'
        : 'SEND VERIFICATION MESSAGE';

  return (
    <div className="cpa-drawer" role="dialog" aria-modal="true" aria-label="Team details">
      <div className="cpa-drawer__backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="cpa-drawer__panel">
        <header className="cpa-drawer__head">
          <div>
            <span className="cpa-drawer__eyebrow">TEAM DETAIL</span>
            <span className="cpa-drawer__code">{team ? codeFor(team) : 'LOADING…'}</span>
          </div>
          <button type="button" className="cpa-modal__close" onClick={onClose} aria-label="Close drawer">×</button>
        </header>

        <div className="cpa-drawer__body">
          {loading && (
            <div className="cpa-skeleton cpa-skeleton--drawer" aria-hidden="true">
              {Array.from({ length: 8 }).map((_, i) => (
                <span key={i} className="cpa-skeleton__cell" style={{ animationDelay: `${i * 50}ms` }} />
              ))}
            </div>
          )}

          {error && (
            <div className="cpa-state cpa-state--error">
              <p>{error}</p>
              <button type="button" className="cpa-btn cpa-btn--ghost" onClick={load}>RETRY</button>
            </div>
          )}

          {!loading && !error && team && (
            <>
              <section className="cpa-drawer__section">
                <h4 className="cpa-drawer__section-title">TEAM INFORMATION</h4>
                <div className="cpa-kvs">
                  <KV label="TEAM NAME" value={team.teamName} copy={team.teamName} />
                  <KV label="REGISTRATION CODE" value={codeFor(team)} copy={codeFor(team)} />
                  <KV label="COLLEGE" value={team.college} copy={team.college} />
                  <KV label="REGISTRATION ROUND" value={roundLabel(team)} />
                  <KV label="REGISTRATION FEE" value={feeLabel(team.registrationFee)} />
                  <KV label="MEMBER COUNT" value={String(team.memberCount)} />
                  <KV label="REGISTERED" value={dateLabel(team.createdAt, { date: true, time: false })} />
                </div>
              </section>

              <section className="cpa-drawer__section">
                <h4 className="cpa-drawer__section-title">CHALLENGE</h4>
                <div className="cpa-drawer__problem">
                  <span className="cpa-drawer__problem-track">{String(team.problem?.track ?? '—').toUpperCase()}</span>
                  <span className="cpa-drawer__problem-title">{team.problem?.title ?? 'NO CHALLENGE ASSIGNED'}</span>
                  {team.problem?.difficulty && (
                    <span className="cpa-drawer__problem-diff">
                      {String(team.problem.difficulty).toUpperCase()} · {problemLabel(team.problem)}
                    </span>
                  )}
                </div>
              </section>

              <section className="cpa-drawer__section">
                <h4 className="cpa-drawer__section-title">PAYMENT</h4>
                <div className="cpa-drawer__payment">
                  <StatusBadge status={team.paymentStatus} />
                  {team.paymentImageUrl ? (
                    <button
                      type="button"
                      className="cpa-proof-thumb"
                      onClick={() => setProofOpen(true)}
                      aria-label="View payment proof"
                    >
                      <img src={team.paymentImageUrl} alt="Payment proof" />
                      <span className="cpa-proof-thumb__veil">VIEW PROOF ↗</span>
                    </button>
                  ) : (
                    <span className="cpa-kv__value">NO PROOF UPLOADED</span>
                  )}
                  <div className="cpa-kvs">
                    <KV label="PAYMENT STATUS" value={String(team.paymentStatus ?? '—').toUpperCase()} />
                    {team.rejectionReason && (
                      <KV label="REJECTION REASON" value={team.rejectionReason} copy={team.rejectionReason} />
                    )}
                  </div>
                  <div className="cpa-status-pick">
                    {STATUS_ORDER.map((s) => (
                      <button
                        key={s}
                        type="button"
                        className={`cpa-status-pick__btn${team.paymentStatus === s ? ' cpa-status-pick__btn--on' : ''}`}
                        disabled={busy || team.paymentStatus === s}
                        onClick={() => {
                          if (s === 'rejected') setConfirmReject(true);
                          else changeStatus(s);
                        }}
                      >
                        {String(s).toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {busy && <span className="cpa-muted-sm">SAVING…</span>}
                </div>
              </section>

              <section className="cpa-drawer__section">
                <h4 className="cpa-drawer__section-title">REGISTRATION EMAIL</h4>
                <div className="cpa-drawer__email">
                  {!emailEligible ? (
                    <span className="cpa-muted-sm">
                      VERIFY OR REJECT THE PAYMENT BEFORE SENDING THE REGISTRATION EMAIL
                    </span>
                  ) : emailFields.status === 'sent' ? (
                    <div className="cpa-kvs">
                      <KV label="EMAIL STATUS" value="SENT ✓" />
                      <KV label="TYPE" value={emailKind === 'reject' ? 'REJECTION' : 'VERIFICATION'} />
                      <KV label="SENT TO" value={emailFields.sentTo ?? '—'} copy={emailFields.sentTo ?? ''} />
                      <KV label="SENT AT" value={dateLabel(emailFields.sentAt)} />
                      <KV label="SEND COUNT" value={String(emailFields.sendCount)} />
                      <div className="cpa-drawer__email-actions">
                        <button
                          type="button"
                          className="cpa-btn cpa-btn--ghost cpa-btn--sm"
                          disabled={emailBusy}
                          onClick={() => setConfirmResendEmail(true)}
                        >
                          {emailBusy ? 'SENDING…' : 'RESEND EMAIL'}
                        </button>
                      </div>
                    </div>
                  ) : emailFields.status === 'failed' ? (
                    <div className="cpa-kvs">
                      <KV label="EMAIL STATUS" value="FAILED ✗" />
                      <KV label="TYPE" value={emailKind === 'reject' ? 'REJECTION' : 'VERIFICATION'} />
                      {emailFields.lastError && (
                        <KV label="LAST ERROR" value={emailFields.lastError} />
                      )}
                      <div className="cpa-drawer__email-actions">
                        <button
                          type="button"
                          className="cpa-btn cpa-btn--ok cpa-btn--sm"
                          disabled={emailBusy}
                          onClick={() => sendEmail(emailKind)}
                        >
                          {emailBusy ? 'SENDING…' : 'RETRY EMAIL'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="cpa-kvs">
                      <KV label="EMAIL STATUS" value="NOT SENT" />
                      <KV label="TYPE" value={emailKind === 'reject' ? 'REJECTION' : 'VERIFICATION'} />
                      <div className="cpa-drawer__email-actions">
                        <button
                          type="button"
                          className="cpa-btn cpa-btn--ok cpa-btn--sm"
                          disabled={emailBusy}
                          onClick={() => sendEmail(emailKind)}
                        >
                          {emailBusy ? 'SENDING…' : sendVerb}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="cpa-drawer__section">
                <h4 className="cpa-drawer__section-title">WHATSAPP CONFIRMATION</h4>
                <div className="cpa-drawer__email">
                  {!whatsappEligible ? (
                    <span className="cpa-muted-sm">
                      VERIFY THE PAYMENT BEFORE SENDING THE WHATSAPP CONFIRMATION
                    </span>
                  ) : (
                    <div className="cpa-kvs">
                      {whatsappStatus === 'sent' ? (
                        <>
                          <KV label="MESSAGE STATUS" value="SENT ✓" />
                          <KV
                            label="SENT TO"
                            value={team?.whatsappLastSentTo ?? '—'}
                            copy={team?.whatsappLastSentTo ?? ''}
                          />
                          <KV label="SENT AT" value={dateLabel(team?.whatsappSentAt)} />
                          <KV label="SEND COUNT" value={String(team?.whatsappSendCount ?? 0)} />
                        </>
                      ) : whatsappStatus === 'failed' ? (
                        <>
                          <KV label="MESSAGE STATUS" value="FAILED ✗" />
                          {team?.whatsappLastError && (
                            <KV
                              label="LAST ERROR"
                              value={WHATSAPP_MESSAGES[team.whatsappLastError] ?? team.whatsappLastError}
                            />
                          )}
                          <KV label="SEND COUNT" value={String(team?.whatsappSendCount ?? 0)} />
                        </>
                      ) : (
                        <KV label="MESSAGE STATUS" value="NOT SENT" />
                      )}
                      <div className="cpa-drawer__email-actions">
                        <button
                          type="button"
                          className="cpa-btn cpa-btn--ok cpa-btn--sm"
                          disabled={whatsappBusy || emailBusy}
                          onClick={sendWhatsapp}
                        >
                          {whatsappBusy ? 'SENDING…' : whatsappVerb}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="cpa-drawer__section">
                <h4 className="cpa-drawer__section-title">
                  CREW <span className="cpa-drawer__section-count">{String(members.length).padStart(2, '0')}</span>
                </h4>
                {members.length === 0 && <p className="cpa-muted-sm">NO PARTICIPANTS FOUND</p>}
                <ul className="cpa-members">
                  {members.map((m) => (
                    <li key={m.id} className="cpa-member">
                      <div className="cpa-member__lead">
                        <span className="cpa-member__name">
                          {m.fullName}
                          {m.role === 'lead' && <em className="cpa-member__flag">LEAD</em>}
                        </span>
                      </div>
                      <div className="cpa-member__row">
                        <span className="cpa-member__key">EMAIL</span>
                        <span className="cpa-member__val">{m.email}</span>
                        <Copy value={m.email} label="Email" />
                      </div>
                      <div className="cpa-member__row">
                        <span className="cpa-member__key">PHONE</span>
                        <span className="cpa-member__val">{m.phone}</span>
                        <Copy value={m.phone} label="Phone" />
                      </div>
                      <div className="cpa-member__row">
                        <span className="cpa-member__key">ROLE / FOOD</span>
                        <span className="cpa-member__val">
                          {roleLabel(m.role)} · {foodLabel(m.foodPreference)}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {lead && (
                <section className="cpa-drawer__section cpa-drawer__section--lead">
                  <div className="cpa-lead">
                    <span className="cpa-lead__tag">TEAM LEAD</span>
                    <span className="cpa-lead__name">{lead.fullName}</span>
                    <span className="cpa-lead__mail">{lead.email}</span>
                  </div>
                </section>
              )}
            </>
          )}
        </div>

        <footer className="cpa-drawer__foot">
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onClose}>CLOSE</button>
        </footer>
      </aside>

      {proofOpen && team?.paymentImageUrl && (
        <PaymentProofViewer
          url={team.paymentImageUrl}
          teamName={team.teamName}
          onClose={() => setProofOpen(false)}
        />
      )}

      {confirmReject && (
        <ConfirmDialog
          title="MARK PAYMENT REJECTED?"
          message={`${team?.teamName ?? 'This team'} will be flagged as rejected. The team can correct and resubmit through the public flow.`}
          confirmLabel="MARK REJECTED"
          busy={busy}
          onCancel={() => setConfirmReject(false)}
          onConfirm={async () => {
            const reason = rejectReason.trim();
            setConfirmReject(false);
            setRejectReason('');
            await changeStatus('rejected', reason);
          }}
        >
          <label className="cpa-field">
            <span className="cpa-field__label">REASON FOR REJECTION — SENT TO THE TEAM LEAD VIA THE REJECTION EMAIL</span>
            <textarea
              className="cpa-field__textarea"
              rows={3}
              placeholder="e.g. Payment amount does not match the registration fee for this round."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
          </label>
        </ConfirmDialog>
      )}

      {confirmResendEmail && (
        <ConfirmDialog
          title={emailKind === 'reject' ? 'RESEND REJECTION EMAIL?' : 'RESEND VERIFICATION EMAIL?'}
          message={
            emailKind === 'reject'
              ? `A rejection email has already been sent to ${team?.rejectionEmailLastSentTo ?? 'the team lead'}. Do you want to send it again?`
              : `A verification email has already been sent to ${team?.verificationEmailLastSentTo ?? 'the team lead'}. Do you want to send it again?`
          }
          confirmLabel="RESEND EMAIL"
          tone="ok"
          busy={emailBusy}
          onCancel={() => setConfirmResendEmail(false)}
          onConfirm={async () => {
            setConfirmResendEmail(false);
            await sendEmail(emailKind);
          }}
        />
      )}
    </div>
  );
}