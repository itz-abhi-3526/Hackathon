/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Team attendance view (read-only)
   One team's saved attendance roster + marked-at timestamps. Opened
   from the Attendance dashboard (row click / VIEW TEAM). The live
   check-in/check-in-editing used at entry lives in the SCANNER.
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useState } from 'react';
import { adminFetchAttendanceByTeam } from '../services/adminData.js';
import { useToast } from '../components/Toast.jsx';
import { dateLabel } from '../utils/format.js';

export default function TeamAttendanceModal({ teamId, onClose, onChanged }) {
  const { push } = useToast();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    adminFetchAttendanceByTeam(teamId)
      .then((r) => {
        if (alive) {
          setRows(r);
          setError('');
        }
      })
      .catch((err) => {
        if (alive) {
          setError(err?.message || 'TEAM ATTENDANCE COULD NOT BE LOADED');
          push(err?.message || 'TEAM ATTENDANCE COULD NOT BE LOADED', 'error');
        }
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const first = rows?.[0];
  const present = (rows ?? []).filter((r) => r.status === 'present').length;
  const total = (rows ?? []).length;

  return (
    <div className="cpa-modal cpa-modal--sm" role="dialog" aria-modal="true" aria-label="Team attendance">
      <div className="cpa-modal__card cpa-modal__card--checkin" onClick={(e) => e.stopPropagation()}>
        <div className="cpa-modal__head">
          <span className="cpa-modal__eyebrow">VOIDHACK 2026 / ATTENDANCE</span>
          <button type="button" className="cpa-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="cpa-modal__body">
          <span className="cpa-checkin__kicker">TEAM ATTENDANCE</span>
          <h3 className="cpa-modal__title cpa-modal__title--lg">{first?.teamName ?? '—'}</h3>
          <div className="cpa-checkin__meta">
            {first?.registrationCode && <span>{first.registrationCode}</span>}
            {first?.college && <span>{first.college}</span>}
            <span>{total} MEMBERS · {present} PRESENT</span>
          </div>

          {error && <div className="cpa-scanner__error-band" style={{ marginTop: 12 }}>{error}</div>}

          {!rows && !error && (
            <div className="cpa-checkin__roster">
              <div className="cpa-checkin__row">
                <span className="cpa-checkin__num">··</span>
                <span className="cpa-checkin__who"><em>LOADING…</em></span>
              </div>
            </div>
          )}

          {rows && (
            <div className="cpa-checkin__roster" role="group" aria-label="Participants">
              {rows.map((r, i) => (
                <div key={r.id} className="cpa-checkin__row">
                  <span className="cpa-checkin__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="cpa-checkin__who">
                    <strong>{r.participantName}</strong>
                    <em>{r.participantEmail}{r.markedAt ? ` · ${dateLabel(r.markedAt)}` : ''}</em>
                  </span>
                  <StatusPill status={r.status} />
                </div>
              ))}
              {rows.length === 0 && (
                <div className="cpa-checkin__row">
                  <span className="cpa-checkin__num">00</span>
                  <span className="cpa-checkin__who"><em>NO ATTENDANCE RECORDS FOR THIS TEAM</em></span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="cpa-modal__foot">
          <span className="cpa-checkin__count">RECORDS REFRESH WITH THE SOURCE</span>
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onClose}>
            CLOSE
          </button>
          <button type="button" className="cpa-btn cpa-btn--solid" onClick={() => { onChanged?.(); onClose(); }}>
            DONE
          </button>
        </div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  const isPresent = status === 'present';
  return (
    <div className="cpa-checkin__toggles">
      <span className={`cpa-checkin__pill${isPresent ? ' cpa-checkin__pill--on' : ' cpa-checkin__pill--absent-on'}`}>
        {isPresent ? 'PRESENT' : 'ABSENT'}
      </span>
    </div>
  );
}