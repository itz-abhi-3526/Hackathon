/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — TeamDetailsDrawer
   Right-side detail drawer for inspecting one registration: team info,
   challenge, payment proof (thumbnail → ProofViewer) and its full crew.
   Payment status is updated inline (the ONLY admin write); marking a
   payment "rejected" asks for confirmation first. Copy buttons are
   provided for every useful key.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useState } from 'react';
import { adminFetchTeamDetail, adminSetPaymentStatus } from '../services/adminData.js';
import { TEAM_PAYMENT_STATUS } from '../../lib/schema.js';
import { codeFor, dateLabel, feeLabel, foodLabel, problemLabel, roleLabel, roundLabel } from '../utils/format.js';
import StatusBadge from './StatusBadge.jsx';
import PaymentProofViewer from './PaymentProofViewer.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { useToast } from './Toast.jsx';

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

  const changeStatus = async (status) => {
    setBusy(true);
    try {
      await adminSetPaymentStatus(teamId, status);
      setDetail((d) => (d ? { ...d, team: { ...d.team, paymentStatus: status } } : d));
      push(`PAYMENT MARKED ${String(status).toUpperCase()}`, 'success');
      onChanged?.();
    } catch (err) {
      push(err?.message || 'STATUS UPDATE FAILED', 'error');
    } finally {
      setBusy(false);
    }
  };

  const team = detail?.team;
  const members = detail?.members ?? [];
  const lead = members.find((m) => m.role === 'lead');

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
            setConfirmReject(false);
            await changeStatus('rejected');
          }}
        />
      )}
    </div>
  );
}