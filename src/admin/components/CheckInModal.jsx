/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Attendance Check-In modal (SCANNER)
   One team roster: name / registration code / college / team size,
   then per-participant status rows reflecting the SAVED database state
   (never reset on rescan). Bulk MARK ALL PRESENT / MARK ALL ABSENT,
   then a single SAVE ATTENDANCE write (status + marked_at + marked_by).
   ═══════════════════════════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react';

const PRESENT = 'present';
const ABSENT = 'absent';

export default function CheckInModal({ team, saving, onSave, onClose }) {
  const [statuses, setStatuses] = useState(() =>
    Object.fromEntries((team?.participants ?? []).map((p) => [p.id, p.status]))
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !saving) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const participants = useMemo(() => team?.participants ?? [], [team]);
  const presentCount = participants.filter((p) => statuses[p.id] === PRESENT).length;
  const allPresent = participants.length > 0 && presentCount === participants.length;

  const setAll = (status) => {
    setStatuses(Object.fromEntries(participants.map((p) => [p.id, status])));
  };

  const save = () => {
    const roster = participants.map((p) => ({
      id: p.id,
      attendanceId: p.attendanceId ?? null,
      status: statuses[p.id] === PRESENT ? PRESENT : ABSENT,
    }));
    onSave?.(roster);
  };

  return (
    <div className="cpa-modal cpa-modal--sm" role="dialog" aria-modal="true" aria-label="Team check-in">
      <div className="cpa-modal__card cpa-modal__card--checkin" onClick={(e) => e.stopPropagation()}>
        <div className="cpa-modal__head">
          <span className="cpa-modal__eyebrow">HACK2PITCH 2026 / ENTRY</span>
          <button type="button" className="cpa-modal__close" onClick={onClose} aria-label="Close" disabled={saving}>×</button>
        </div>

        <div className="cpa-modal__body">
          <span className="cpa-checkin__kicker">TEAM CHECK-IN</span>
          <h3 className="cpa-modal__title cpa-modal__title--lg">{team?.teamName}</h3>
          <div className="cpa-checkin__meta">
            <span>{team?.registrationCode}</span>
            <span>{team?.college}</span>
            <span>{participants.length} MEMBERS</span>
          </div>

          {allPresent && (
            <div className="cpa-state cpa-state--ok cpa-checkin__done">
              TEAM ALREADY CHECKED IN — ALL MEMBERS PRESENT
            </div>
          )}

          <div className="cpa-checkin__roster" role="group" aria-label="Participants">
            {participants.map((p, i) => {
              const active = statuses[p.id] === PRESENT;
              return (
                <div key={p.id} className="cpa-checkin__row">
                  <span className="cpa-checkin__num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="cpa-checkin__who">
                    <strong>{p.fullName}</strong>
                    <em>{p.email}{p.role === 'lead' ? ' · LEAD' : ''}</em>
                  </span>
                  <div className="cpa-checkin__toggles">
                    <button
                      type="button"
                      className={`cpa-checkin__pill${active ? ' cpa-checkin__pill--on' : ''}`}
                      onClick={() => setStatuses((s) => ({ ...s, [p.id]: PRESENT }))}
                      disabled={saving}
                    >
                      PRESENT
                    </button>
                    <button
                      type="button"
                      className={`cpa-checkin__pill cpa-checkin__pill--absent${!active ? ' cpa-checkin__pill--absent-on' : ''}`}
                      onClick={() => setStatuses((s) => ({ ...s, [p.id]: ABSENT }))}
                      disabled={saving}
                    >
                      ABSENT
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="cpa-checkin__bulk">
            <button type="button" className="cpa-btn cpa-btn--ok cpa-btn--sm" onClick={() => setAll(PRESENT)} disabled={saving}>
              MARK ALL PRESENT
            </button>
            <button type="button" className="cpa-btn cpa-btn--ghost cpa-btn--sm" onClick={() => setAll(ABSENT)} disabled={saving}>
              MARK ALL ABSENT
            </button>
          </div>
        </div>

        <div className="cpa-modal__foot">
          <span className="cpa-checkin__count">
            {presentCount}/{participants.length} PRESENT
          </span>
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onClose} disabled={saving}>
            CANCEL
          </button>
          <button type="button" className="cpa-btn cpa-btn--solid" onClick={save} disabled={saving}>
            {saving ? 'SAVING…' : 'SAVE ATTENDANCE'}
          </button>
        </div>
      </div>
    </div>
  );
}