import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HACKATHON } from '../../data/index.js';
import { PARTICIPANT_ROLE } from '../../lib/schema.js';
import { isParticipantComplete, getRegistrationFee, startingRegistrationFee } from '../../services/registrationService.js';
import useRegistration from '../../hooks/useRegistration.js';
import {
  ACCEPTED_PROOF_TYPES,
  MAX_PROOF_BYTES,
} from '../../services/paymentService.js';
import './Registration.css';

const STEPS = [
  { id: 0, number: '01', label: 'YOUR ENTRY' },
  { id: 1, number: '02', label: 'TEAM SIZE' },
  { id: 2, number: '03', label: 'CREW PASSES' },
  { id: 3, number: '04', label: 'PAYMENT' },
  { id: 4, number: '05', label: 'REVIEW' },
];

const FOOD_OPTIONS = ['VEG', 'NON-VEG'];

const GPAY_QR_SRC = '/assets/payment/gpay-qr.png';

const EVENT = {
  name: HACKATHON.name,
  edition: HACKATHON.edition,
  location: HACKATHON.location,
  presenter: HACKATHON.presenter,
  tagline: HACKATHON.tagline,
};

function ticketDateRange() {
  const start = new Date(HACKATHON.date);
  const end = new Date(HACKATHON.endDate);
  const month = start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
  const startDay = String(start.getDate()).padStart(2, '0');
  const endDay = String(end.getDate()).padStart(2, '0');
  return `${month} ${startDay}\u2013${endDay}, ${start.getFullYear()}`;
}

// The Step 03 gate (validateParticipants) runs this exact per-member
// predicate, so a badge can never say COMPLETE while the store considers
// the member incomplete — one source of truth for both.

const pageVariants = {
  enter: (dir) => ({ x: dir > 0 ? 50 : -50, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -50 : 50, opacity: 0 }),
};

/* ═══════════════════════════════════════════════════════════════
   REGISTRATION ROUND — banner + closed/full gate
   The wizard itself is untouched; the round is displayed above it and
   the form is replaced by a professional closed state whenever there
   is no open round. The DATABASE (register_team) enforces
   capacity — this UI is only ever a reflection of what the server
   reported.
   ═══════════════════════════════════════════════════════════════ */

const inrLabel = (fee) => {
  const n = Number(fee ?? 0);
  if (!Number.isFinite(n)) return '\u20B90';
  const decimals = n % 1 === 0 ? 0 : 2;
  return `\u20B9${n.toLocaleString('en-IN', { maximumFractionDigits: decimals })}`;
};

/* The fee is NEVER hardcoded on the form: it always comes from the
   active registration round, keyed by the SELECTED TEAM SIZE
   (fee_2_members / fee_3_members / fee_4_members from the round).
   Display only — register_team recomputes the authoritative fee
   server-side and ignores whatever the browser sends. */
const activeFee = (store) =>
  getRegistrationFee(store?.round, store?.team?.size);

function RoundBanner({ round, hasSize }) {
  const remaining = Math.max(Number(round?.remaining ?? 0), 0);
  const capacity = Number(round?.capacity ?? 0);
  const pct = capacity ? Math.min(100, (Number(round?.registered ?? 0) / capacity) * 100) : 0;
  return (
    <div className="reg__round">
      <div className="reg__round-stats">
        <span className="reg__round-kicker">CURRENT PHASE</span>
        <span className="reg__round-title">
          {`${String(round?.title ?? 'REGISTRATION').toUpperCase()}${round?.title ? ' REGISTRATION' : ''}`}
        </span>
        {hasSize && (
          <span className="reg__round-fee">
            FROM {inrLabel(startingRegistrationFee(round))} <em>/ TEAM</em>
          </span>
        )}
        <span className="reg__round-cap">
          {capacity ? `${remaining} OF ${capacity} TEAM SLOTS AVAILABLE` : '\u00D7'}
        </span>
      </div>
      <div className="reg__round-bar">
        <span className="reg__round-bar-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function RegistrationGate({ round, onExit }) {
  const hasRound = Boolean(round?.id);
  const remaining = Number(round?.remaining ?? 0);
  const startsFuture = Boolean(round?.starts_at && new Date(round.starts_at).getTime() > Date.now());
  const isFull = hasRound && remaining <= 0;

  let tag;
  let title;
  let sub;
  let note = '';
  if (isFull) {
    tag = 'ERR.ROUND.FULL';
    title = 'REGISTRATION CLOSED';
    sub = 'THIS REGISTRATION ROUND IS FULL.';
    note = 'NEXT REGISTRATION PHASE WILL BE ANNOUNCED SOON.';
  } else if (!hasRound) {
    tag = 'ERR.ROUND.NONE';
    title = 'REGISTRATION CURRENTLY CLOSED';
    sub = 'Registration will reopen when the next registration phase begins.';
  } else if (startsFuture) {
    tag = 'ERR.ROUND.EARLY';
    title = String(round.title ?? 'REGISTRATION').toUpperCase();
    sub = 'REGISTRATION NOT OPEN YET.';
    note = `This phase opens on ${new Date(round.starts_at).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })}.`;
  } else {
    tag = 'ERR.ROUND.WINDOW';
    title = String(round.title ?? 'REGISTRATION').toUpperCase();
    sub = 'REGISTRATION CLOSED.';
    note = 'Registration will reopen when the next registration phase begins.';
  }

  return (
    <div className="reg">
      <div className="reg__header">
        <button type="button" className="reg__header-back" onClick={onExit}>&larr; BACK TO SITE</button>
        <span className="reg__header-brand">HACK2PITCH 2026</span>
      </div>
      <div className="reg__fatal">
        <span className="reg__fatal-num">! !</span>
        <h2 className="reg__fatal-title">{title}</h2>
        <p className="reg__fatal-desc">{sub}</p>
        {note && <p className="reg__fatal-note">{note}</p>}
        {hasRound && !isFull && (
          <p className="reg__fatal-note">
            FROM {inrLabel(startingRegistrationFee(round))} / TEAM &middot; {remaining} OF {round.capacity} TEAM SLOTS AVAILABLE
          </p>
        )}
        <span className="reg__fatal-code">{tag}</span>
      </div>
    </div>
  );
}

const barCodeFrom = (str) => {
  if (!str) return [];
  const bars = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bars.push(code % 3 === 0 ? 3 : code % 2 === 0 ? 2 : 1);
  }
  return bars;
};

/* ═══════════════════════════════════════════════════════════════
   BOOKING SUMMARY
   ═══════════════════════════════════════════════════════════════ */

function BookingSummary({ store, onExit }) {
  const hasSize = Boolean(store.teamSizeSelected && store.team.size);
  return (
    <aside className="bk">
      <div className="bk__inner">
        <div className="bk__head">
          <span className="bk__title">YOUR HACK2PITCH ENTRY</span>
          <span className="bk__event">{EVENT.name} {EVENT.edition}</span>
        </div>

        <div className="bk__divider" />

        <div className="bk__rows">
          <div className="bk__row">
            <span className="bk__label">TEAM</span>
            <span className="bk__value" data-empty={!store.team.name}>
              {store.team.name || '\u2014'}
            </span>
          </div>
          <div className="bk__row">
            <span className="bk__label">CREW</span>
            <span className="bk__value">{String(store.team.size).padStart(2, '0')}</span>
          </div>
          <div className="bk__row">
            <span className="bk__label">TRACK</span>
            <span className="bk__value" data-empty={!store.problemStatement}>
              {store.problemStatement ? `${store.problemStatement.number} / ${store.problemStatement.category}` : '\u2014'}
            </span>
          </div>
        </div>

        <div className="bk__divider" />

        <div className="bk__total">
          <span className="bk__label">TOTAL</span>
          <span className="bk__price">
            {hasSize ? `\u20B9${activeFee(store) ?? '\u2014'}` : 'SELECT TEAM SIZE'}
          </span>
        </div>
      </div>

      <button className="bk__back" onClick={onExit}>&larr; BACK TO SITE</button>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MOBILE BOOKING BAR
   ═══════════════════════════════════════════════════════════════ */

function MobileBar({ store }) {
  const hasSize = Boolean(store.teamSizeSelected && store.team.size);
  return (
    <div className="mbar">
      <div className="mbar__row">
        <span className="mbar__label">TEAM</span>
        <span className="mbar__val" data-empty={!store.team.name}>{store.team.name || '\u2014'}</span>
      </div>
      <div className="mbar__row">
        <span className="mbar__label">CREW</span>
        <span className="mbar__val">{String(store.team.size).padStart(2, '0')}</span>
      </div>
      <div className="mbar__row">
        <span className="mbar__label">TRACK</span>
        <span className="mbar__val" data-empty={!store.problemStatement}>
          {store.problemStatement ? `${store.problemStatement.number} / ${store.problemStatement.category}` : '\u2014'}
        </span>
      </div>
      <div className="mbar__total">
        <span className="mbar__label">TOTAL</span>
        <span className="mbar__price">
          {hasSize ? `\u20B9${activeFee(store) ?? '\u2014'}` : 'SELECT TEAM SIZE'}
        </span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 01 — TEAM DETAILS + TRACK
   ═══════════════════════════════════════════════════════════════ */

function StepEntry({ store, onRetry }) {
  const loading = store.loading.boot || store.loading.problems;

  return (
    <div className="step">
      <div className="step__head">
        <h2 className="step__title">YOUR ENTRY</h2>
        <p className="step__sub">Name your crew, add your college and pick the problem your team will attack.</p>
      </div>

      <div className="step__fields">
        <div className="step__field">
          <label className="step__label">TEAM NAME *</label>
          <input
            className="step__input"
            value={store.team.name}
            onChange={(e) => store.updateTeam({ name: e.target.value })}
            placeholder="e.g. CodeCrafters"
          />
        </div>
        <div className="step__field">
          <label className="step__label">COLLEGE *</label>
          <input
            className="step__input"
            value={store.team.college}
            onChange={(e) => store.updateTeam({ college: e.target.value })}
            placeholder="e.g. National Institute of Technology"
          />
        </div>
      </div>

      <div className="step__split-head">
        <span className="step__label">PROBLEM STATEMENT / TRACK *</span>
        {loading && <span className="step__split-hint">LOADING&hellip;</span>}
      </div>

      {loading ? (
        <div className="trk-col">
          <div className="trk trk--loading"><span>SIGNAL SEARCHING THE PROBLEM FIELD&hellip;</span></div>
        </div>
      ) : store.problems.length === 0 ? (
        <div className="trk-col">
          <div className="trk trk--loading">
            <span>CHALLENGES UNAVAILABLE</span>
            <button className="table__retry trk__retry" type="button" onClick={onRetry}>RETRY</button>
          </div>
        </div>
      ) : (
        <div className="trk-col">
          {store.problems.map((prob) => {
            const selected = store.problemStatement?.id === prob.id;
            return (
              <motion.button
                key={prob.id}
                type="button"
                className={`trk ${selected ? 'trk--on' : ''}`}
                onClick={() => store.setProblemStatement(prob)}
                layout
                whileHover={{ x: 4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="trk__num">{prob.number}</span>
                <span className="trk__info">
                  <span className="trk__cat">{prob.category}</span>
                  <span className="trk__title">{prob.title}</span>
                </span>
                <span className="trk__diff">{prob.difficulty || 'REQUEST FOR PROPOSALS'}</span>
                <span className="trk__check">{selected ? '\u2713' : '\u25CB'}</span>
              </motion.button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 02 — TEAM SIZE
   ═══════════════════════════════════════════════════════════════ */

function StepCrewSize({ store }) {
  const min = HACKATHON.minTeamSize;
  const max = HACKATHON.maxTeamSize;

  const sizes = useMemo(() => {
    const labels = {
      2: ['DUO', 'Two builders, one vision'],
      3: ['TRIO', 'Three minds, infinite angles'],
      4: ['SQUAD', 'Full force, no limits'],
    };
    const out = [];
    for (let n = Math.max(2, min); n <= max; n++) {
      const [label, desc] = labels[n] ?? [`TEAM ${n}`, 'Your crew, your rules'];
      out.push({ value: n, label, desc });
    }
    return out;
  }, [min, max]);

  return (
    <div className="step">
      <div className="step__head">
        <h2 className="step__title step__title--lg">HOW MANY<br />ARE COMING?</h2>
        <p className="step__sub">Select your crew size. You can change this later without losing what you&apos;ve already entered.</p>
      </div>
      <div className="step__sizes">
        {sizes.map((s) => (
          <motion.button
            key={s.value}
            className={`sz ${store.team.size === s.value ? 'sz--on' : ''}`}
            onClick={() => store.setTeamSize(s.value)}
            whileHover={{ y: -4 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="sz__num">{String(s.value).padStart(2, '0')}</span>
            <span className="sz__label">{s.label}</span>
            <span className="sz__desc">{s.desc}</span>
            <span className="sz__fee">
              {store?.round?.[`fee_${s.value}_members`] != null
                ? inrLabel(store.round[`fee_${s.value}_members`])
                : '\u2014'}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MEMBER PASS CARD (one per participant)
   ═══════════════════════════════════════════════════════════════ */

function MemberPass({ player, idx, store, isExpanded, onToggle }) {
  const complete = isParticipantComplete(player);
  const isLead = player.role === PARTICIPANT_ROLE.LEAD;

  return (
    <motion.div
      className={`mpass ${complete ? 'mpass--done' : ''} ${isExpanded ? 'mpass--open' : ''} ${isLead ? 'mpass--lead' : ''}`}
      layout
      transition={{ layout: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }}
    >
      <button className="mpass__bar" onClick={onToggle} type="button">
        <div className="mpass__bar-left">
          <span className="mpass__event">HACK2PITCH 2026</span>
          <span className="mpass__num">{String(idx + 1).padStart(2, '0')}</span>
        </div>
        <div className="mpass__bar-right">
          {isLead && <span className="mpass__badge mpass__badge--lead">TEAM LEAD</span>}
          {complete ? (
            <span className="mpass__badge mpass__badge--ok">&#10003; COMPLETE</span>
          ) : (
            <span className="mpass__badge mpass__badge--no">INCOMPLETE</span>
          )}
        </div>
      </button>

      {!isExpanded && isLead && (
        <motion.div className="mpass__summary" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
          <span className="mpass__name">{player.name || `TEAM LEAD`}</span>
          <span className="mpass__team">{store.team.name || 'YOUR TEAM'}</span>
          <div className="mpass__tags">
            {player.foodPreference ? <span className="mpass__tag">{player.foodPreference === 'Veg' ? 'VEG' : 'NON-VEG'}</span> : null}
            <span className="mpass__tag mpass__tag--lead">LEAD / CAPTAIN</span>
          </div>
          {complete && <div className="mpass__stamp">CONFIRMED</div>}
        </motion.div>
      )}

      {!isExpanded && !isLead && (
        <div className="mpass__empty">
          <span className="mpass__empty-label">CREW MEMBER</span>
          {complete ? (
            <span className="mpass__fillok">&#10003; {player.name || 'PROFILE COMPLETE'}</span>
          ) : (
            <button className="mpass__fill" onClick={(e) => { e.stopPropagation(); onToggle(); }} type="button">
              COMPLETE PROFILE &rarr;
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            className="mpass__body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mpass__fields">
              <div className="mpass__field">
                <label className="mpass__label">FULL NAME *</label>
                <input
                  className="mpass__input"
                  value={player.name}
                  onChange={(e) => store.updatePlayer(player.id, { name: e.target.value })}
                  placeholder={`Member ${idx + 1} name`}
                />
              </div>
              <div className="mpass__row2">
                <div className="mpass__field">
                  <label className="mpass__label">EMAIL *</label>
                  <input
                    className="mpass__input"
                    type="email"
                    value={player.email}
                    onChange={(e) => store.updatePlayer(player.id, { email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="mpass__field">
                  <label className="mpass__label">PHONE *</label>
                  <input
                    className="mpass__input"
                    value={player.phone}
                    onChange={(e) => store.updatePlayer(player.id, { phone: e.target.value })}
                    placeholder="+91 XXXXX XXXXX"
                  />
                </div>
              </div>
              <div className="mpass__field">
                <label className="mpass__label">FOOD PREFERENCE *</label>
                <div className="mpass__food">
                  {FOOD_OPTIONS.map((opt) => {
                    const key = opt === 'VEG' ? 'Veg' : 'Non-Veg';
                    return (
                      <button
                        key={opt}
                        className={`mpass__food-btn ${player.foodPreference === key ? 'mpass__food-btn--on' : ''}`}
                        onClick={() => store.updatePlayer(player.id, { foodPreference: key })}
                        type="button"
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="mpass__field">
                <label className="mpass__label">ROLE</label>
                <div className="mpass__role">
                  <button
                    className={`mpass__role-btn ${isLead ? 'mpass__role-btn--on' : ''}`}
                    onClick={() => store.setTeamLead(player.id)}
                    type="button"
                  >
                    TEAM LEAD
                  </button>
                  <button
                    className={`mpass__role-btn ${!isLead ? 'mpass__role-btn--on' : ''}`}
                    onClick={() => store.updatePlayer(player.id, { role: PARTICIPANT_ROLE.MEMBER })}
                    type="button"
                  >
                    MEMBER
                  </button>
                </div>
                <p className="mpass__role-note">
                  {isLead
                    ? 'This participant is the team lead — the primary contact for HACK2PITCH.'
                    : 'Exactly one participant must be the lead.'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 03 — CREW PASSES (participants)
   ═══════════════════════════════════════════════════════════════ */

function StepBuildCrew({ store }) {
  const [expandedIdx, setExpandedIdx] = useState(() => {
    const idx = store.players.findIndex((p) => !isParticipantComplete(p));
    return idx >= 0 ? idx : 0;
  });

  const prevSig = useRef('');

  useEffect(() => {
    const sig = store.players.map((p) => (isParticipantComplete(p) ? '1' : '0')).join('');
    if (sig === prevSig.current) return;
    prevSig.current = sig;
    const cur = store.players[expandedIdx];
    if (cur && isParticipantComplete(cur)) {
      const next = store.players.findIndex((pl, i) => i > expandedIdx && !isParticipantComplete(pl));
      if (next >= 0) setExpandedIdx(next);
    }
  }, [store.players, expandedIdx]);

  const toggle = useCallback((idx) => {
    setExpandedIdx((prev) => (prev === idx ? -1 : idx));
  }, []);

  /* Live, derived gate state — recomputed on every render so the hint
     can never disagree with the CONTINUE button. */
  const leadCount = store.players.filter((p) => p.role === PARTICIPANT_ROLE.LEAD).length;
  const incompleteCount = store.players.filter((p) => !isParticipantComplete(p)).length;
  const gateBlocked =
    leadCount !== 1 || incompleteCount > 0 || store.players.length < store.team.size;

  const gateMessage = !gateBlocked
    ? ''
    : leadCount !== 1
      ? 'EXACTLY ONE PARTICIPANT MUST BE THE TEAM LEAD.'
      : incompleteCount > 0
        ? `${String(incompleteCount).padStart(2, '0')} CREW${incompleteCount > 1 ? ' MEMBERS' : ' MEMBER'} INCOMPLETE \u2014 FILL EVERY FIELD TO CONTINUE.`
        : 'COMPLETE EVERY CREW MEMBER FORM TO CONTINUE.';

  return (
    <div className="step">
      <div className="step__head">
        <h2 className="step__title step__title--lg">BUILD<br />YOUR CREW</h2>
        <p className="step__sub">Every build starts with the people behind it. Exactly one of you is the lead.</p>
      </div>
      <div className="step__passes">
        {store.players.map((player, idx) => (
          <MemberPass
            key={player.id}
            player={player}
            idx={idx}
            store={store}
            isExpanded={expandedIdx === idx}
            onToggle={() => toggle(idx)}
          />
        ))}
      </div>
      {gateBlocked && <div className="step__gate">{gateMessage}</div>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 04 — PAYMENT (MANUAL GPAY PROOF)
   ═══════════════════════════════════════════════════════════════ */

const PROOF_STEPS = [
  { num: '01', label: 'SCAN THE QR' },
  { num: '02', label: 'COMPLETE PAYMENT' },
  { num: '03', label: 'TAKE A SCREENSHOT' },
  { num: '04', label: 'UPLOAD YOUR PAYMENT PROOF' },
];

function StepPayment({ store, onUploadProof }) {
  const [qrFailed, setQrFailed] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const uploadStatus = store.payment.uploadStatus;
  const hasProof =
    store.payment.status === 'proof_selected' ||
    store.payment.status === 'proof_submitted';

  useEffect(() => {
    if (
      store.payment.status === 'proof_selected' &&
      uploadStatus === 'idle' &&
      store.payment.proofFile
    ) {
      onUploadProof();
    }
  }, [
    store.payment.status,
    uploadStatus,
    store.payment.proofFile,
    onUploadProof,
  ]);

  const handleFile = (file) => {
    setError('');
    if (!file) return;
    if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
      setError('PLEASE USE PNG, JPG OR WEBP');
      return;
    }
    if (file.size > MAX_PROOF_BYTES) {
      setError('FILE TOO LARGE \u2014 MAX 10 MB');
      return;
    }
    const preview = URL.createObjectURL(file);
    store.selectPaymentProof(file, preview, file.name, file.size);
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const uploading = uploadStatus === 'uploading';
  const uploaded = uploadStatus === 'success';
  const uploadFailed = uploadStatus === 'error';

  return (
    <div className="step step--pay">
      <div className="step__head">
        <h2 className="step__title step__title--lg">COMPLETE<br />YOUR ENTRY</h2>
        <p className="step__sub">Pay the registration fee using the QR code below. Then upload your payment screenshot to confirm your entry.</p>
      </div>

      <div className="pay">
        {/* ── Left: fee + QR + instructions ── */}
        <div className="pay__side">
          <div className="pay__amount">
            <span className="pay__amount-cur">{'\u20B9'}</span>
            <span className="pay__amount-num">{activeFee(store)}</span>
          </div>

          <div className="pay__label-line">
            <span className="pay__label">SCAN TO PAY</span>
            <span className="pay__app">Google Pay</span>
          </div>

          <div className="payqr">
            {qrFailed ? (
              <div className="payqr__ph">
                <span className="payqr__ph-title">GPAY QR</span>
                <span className="payqr__ph-sub">Replace with payment QR</span>
              </div>
            ) : (
              <img
                className="payqr__img"
                src={GPAY_QR_SRC}
                alt={`Google Pay QR code for the HACK2PITCH ${EVENT.edition} registration fee`}
                onError={() => setQrFailed(true)}
              />
            )}
          </div>

          <div className="pay__instructions">
            {PROOF_STEPS.map((s) => (
              <div key={s.num} className="pay__instr">
                <span className="pay__instr-num">{s.num}</span>
                <span className="pay__instr-label">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: proof upload ── */}
        <div className="pay__proof">
          <div className="step__head">
            <h3 className="pay__proof-title">PAYMENT PROOF</h3>
            <p className="step__sub">Upload a screenshot showing your successful payment.</p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => { handleFile(e.target.files[0]); e.target.value = ''; }}
            className="pay__file-input"
            id="pay-proof-input"
          />

          {!hasProof ? (
            <label
              className="upload"
              htmlFor="pay-proof-input"
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              data-cursor="UPLOAD"
            >
              <span className="upload__plus">+</span>
              <span className="upload__title">UPLOAD PAYMENT SCREENSHOT</span>
              <span className="upload__meta">PNG / JPG / WEBP &middot; MAX 10 MB</span>
            </label>
          ) : (
            <motion.div
              className={`upload upload--has ${uploading ? 'upload--loading' : ''}`}
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <img className="upload__preview" src={store.payment.proofPreview} alt="Payment screenshot preview" />
              <div className="upload__meta-row">
                <span className="upload__fname">{store.payment.proofName}</span>
                {uploading ? (
                  <span className="upload__status upload__status--busy">
                    <span className="reg__nav-spinner upload__spinner" />
                    UPLOADING&hellip;
                  </span>
                ) : uploaded ? (
                  <span className="upload__ready">&#10003; PROOF RECEIVED</span>
                ) : uploadFailed ? (
                  <span className="upload__fail">UPLOAD FAILED</span>
                ) : (
                  <span className="upload__ready">&#10003; READY</span>
                )}
              </div>

              {uploadFailed && (
                <button
                  className="upload__retry"
                  type="button"
                  disabled={uploading}
                  onClick={() => onUploadProof()}
                >
                  RETRY UPLOAD &rarr;
                </button>
              )}

              <button
                className="upload__remove"
                type="button"
                disabled={uploading}
                onClick={() => {
                  store.removePaymentProof();
                  setError('');
                }}
              >
                REMOVE
              </button>
            </motion.div>
          )}

          {error && <div className="pay__error">{error}</div>}

          <div className="pay__proof-note">
            {uploaded
              ? 'Your payment proof has been received. It will be stored with your entry and reviewed by our team. This is not automatic payment verification.'
              : 'Your payment proof will be reviewed by our team after you submit. This is not automatic payment verification.'}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STEP 05 — REVIEW
   ═══════════════════════════════════════════════════════════════ */

function StepReview({ store, goToStep }) {
  const proofOk = store.payment.uploadStatus === 'success' && Boolean(store.payment.proofUrl);

  return (
    <div className="step">
      <div className="step__head">
        <h2 className="step__title step__title--lg">CHECK<br />YOUR ENTRY</h2>
        <p className="step__sub">One last look before you&apos;re in.</p>
      </div>

      <div className="rev">
        <div className="rev__section">
          <div className="rev__sec-head">
            <span>TEAM</span>
            <button className="rev__edit" onClick={() => goToStep(0)} type="button">EDIT</button>
          </div>
          <div className="rev__sec-body">
            <div className="rev__kv"><span className="rev__k">NAME</span><span className="rev__v">{store.team.name || '\u2014'}</span></div>
          </div>
        </div>

        <div className="rev__section">
          <div className="rev__sec-head">
            <span>CREW &mdash; {String(store.team.size).padStart(2, '0')}</span>
            <button className="rev__edit" onClick={() => goToStep(2)} type="button">EDIT</button>
          </div>
          <div className="rev__sec-body">
            {store.players.map((p, i) => (
              <div key={p.id} className="rev__member">
                <span className="rev__member-num">{String(i + 1).padStart(2, '0')}</span>
                <div className="rev__member-info">
                  <span className="rev__member-name">{p.name || 'Unnamed'}</span>
                  <span className="rev__member-detail">{p.email}</span>
                  <span className="rev__member-detail">{p.phone}</span>
                  <span className="rev__member-detail">{p.foodPreference === 'Veg' ? 'VEG' : p.foodPreference === 'Non-Veg' ? 'NON-VEG' : 'Not set'}</span>
                </div>
                {p.role === PARTICIPANT_ROLE.LEAD && <span className="rev__lead-tag">LEAD</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="rev__section">
          <div className="rev__sec-head">
            <span>CHALLENGE</span>
            <button className="rev__edit" onClick={() => goToStep(0)} type="button">EDIT</button>
          </div>
          <div className="rev__sec-body">
            {store.problemStatement ? (
              <div className="rev__kv">
                <span className="rev__k">{store.problemStatement.number} / {store.problemStatement.category}</span>
                <span className="rev__v">{store.problemStatement.title}</span>
              </div>
            ) : (
              <span className="rev__v" style={{ opacity: 0.4 }}>No selection</span>
            )}
          </div>
        </div>

        <div className="rev__section">
          <div className="rev__sec-head">
            <span>PAYMENT</span>
            <button className="rev__edit" onClick={() => goToStep(3)} type="button">EDIT</button>
          </div>
          <div className="rev__sec-body">
            <div className="rev__kv">
              <span className="rev__k">PROOF STATUS</span>
              <span className="rev__v">
                {proofOk ? 'PAYMENT PROOF SUBMITTED' : 'NO PROOF YET'}
              </span>
            </div>
            {store.payment.proofUrl && (
              <div className="rev__kv">
                <span className="rev__k">PROOF LINK</span>
                <a
                  className="rev__v rev__link"
                  href={store.payment.proofUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  VIEW IMAGE &rarr;
                </a>
              </div>
            )}
            <div className="rev__kv">
              <span className="rev__k">VERIFICATION</span>
              <span className="rev__v">REVIEWED BY OUR TEAM AFTER SUBMIT</span>
            </div>
            <div className="rev__kv">
              <span className="rev__k">TOTAL</span>
              <span className="rev__v rev__v--big">{'\u20B9'}{activeFee(store)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   SUCCESS — YOUR HACK2PITCH 2026 ENTRY TICKET
   A printed artifact: main pass + detachable stub.
   ═══════════════════════════════════════════════════════════════ */

const EASE = [0.16, 1, 0.3, 1];

function SuccessPass({ store, onExit }) {
  const bars = barCodeFrom(store.registrationCode);
  const entryNum = String(store.team.size).padStart(2, '0');
  const ticketDates = ticketDateRange();

  return (
    <motion.div
      className="spass"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div className="spass__bg">
        <span className="spass__ghost" aria-hidden="true">HACK2PITCH</span>
        <span className="spass__ghost-year" aria-hidden="true">2026</span>
        <span className="spass__corner spass__corner--tl" aria-hidden="true">+</span>
        <span className="spass__corner spass__corner--tr" aria-hidden="true">+</span>
        <span className="spass__corner spass__corner--bl" aria-hidden="true">+</span>
        <span className="spass__corner spass__corner--br" aria-hidden="true">+</span>
      </div>

      <div className="spass__content">
        <motion.p
          className="spass__eyebrow"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
        >
          ENTRY RECEIVED
        </motion.p>

        <motion.h1
          className="spass__title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
        >
          ENTRY SUBMITTED
        </motion.h1>

        <motion.div
          className="spass__rule"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <span className="spass__rule-line" />
          <span className="spass__rule-text">YOUR HACK2PITCH 2026 PASS</span>
          <span className="spass__rule-line" />
        </motion.div>

        {/* ── THE TICKET ── */}
        <motion.div
          className="ticket"
          initial={{ opacity: 0, y: 80, rotateX: 10, transformPerspective: 1200 }}
          animate={{ opacity: 1, y: 0, rotateX: 0, transformPerspective: 1200 }}
          transition={{ duration: 0.9, delay: 0.6, ease: EASE }}
          whileHover={{ y: -8 }}
        >
          <div className="ticket__frame">
            <div className="ticket__body">
              {/* MAIN PASS */}
              <div className="ticket__main">
                <header className="ticket__header">
                  <div className="ticket__brand">
                    <span className="ticket__brand-name">
                      {EVENT.name} <span className="ticket__brand-year">{EVENT.edition}</span>
                    </span>
                    <span className="ticket__brand-motto">{EVENT.tagline}</span>
                  </div>
                  <div className="ticket__pass">
                    <span className="ticket__pass-code">H2P-{String(EVENT.edition).slice(-2)} / ENTRY</span>
                    <span className="ticket__pass-tag">ENTRY PASS</span>
                  </div>
                </header>

                <div className="ticket__hero">
                  <span className="ticket__hero-label">TEAM</span>
                  <h3 className="ticket__hero-name">{store.team.name || 'H2P CREW'}</h3>
                </div>

                <div className="ticket__facts">
                  <div className="ticket__fact">
                    <span className="ticket__fact-label">CREW</span>
                    <span className="ticket__fact-val">{entryNum}</span>
                  </div>
                  <div className="ticket__fact">
                    <span className="ticket__fact-label">TRACK</span>
                    <span className="ticket__fact-val">{store.problemStatement?.category || '\u2014'}</span>
                  </div>
                  <div className="ticket__fact">
                    <span className="ticket__fact-label">DATE</span>
                    <span className="ticket__fact-val ticket__fact-val--sm">{ticketDates}</span>
                  </div>
                  <div className="ticket__fact">
                    <span className="ticket__fact-label">VENUE</span>
                    <span className="ticket__fact-val ticket__fact-val--sm">{EVENT.location}</span>
                  </div>
                </div>

                <div className="ticket__fee">
                  <span className="ticket__fee-label">REGISTRATION FEE</span>
                  <span className="ticket__fee-val">{store.registrationFee ? inrLabel(store.registrationFee) : '\u2014'}</span>
                </div>

                <div className="ticket__crew">
                  {store.players.map((p, i) => (
                    <div key={p.id} className="ticket__member">
                      <span className="ticket__member-num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="ticket__member-name">{p.name}</span>
                      <span className="ticket__member-meta">
                        {p.foodPreference === 'Veg' ? 'VEG' : p.foodPreference === 'Non-Veg' ? 'NON-VEG' : '\u2014'}
                        {p.role === PARTICIPANT_ROLE.LEAD ? ' \u00b7 LEAD' : ''}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="ticket__status">
                  <span className="ticket__status-dot" aria-hidden="true" />
                  <span>PAYMENT PROOF {'\u2014'} SUBMITTED</span>
                  <span className="ticket__status-sep" aria-hidden="true">/</span>
                  <span>STATUS: PENDING VERIFICATION</span>
                </div>
                {store.payment.proofUrl && (
                  <a
                    className="ticket__proof-link"
                    href={store.payment.proofUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    VIEW PAYMENT PROOF {'\u2192'}
                  </a>
                )}

                <footer className="ticket__micro">
                  <span className="ticket__micro-item">PRESENTED BY {EVENT.presenter}</span>
                  <span className="ticket__micro-item">{EVENT.name} {EVENT.edition} {'\u2014'} YOU&apos;RE IN</span>
                  <span className="ticket__micro-item">ISSUE NO. {store.registrationCode}</span>
                </footer>
              </div>

              {/* PERFORATION */}
              <div className="ticket__perf" />

              {/* DETACHABLE STUB */}
              <div className="ticket__stub">
                <div className="ticket__stub-top">
                  <span className="ticket__stub-label">ENTRY</span>
                  <span className="ticket__stub-num">{entryNum}</span>
                </div>
                <span className="ticket__stub-code">H2P{String(EVENT.edition).slice(-2)}</span>
                <span className="ticket__stub-rule" />
                <div className="ticket__barcode">
                  <div
                    className="ticket__barcode-lines"
                    role="presentation"
                  >
                    {bars.map((w, i) => (
                      <span key={i} className="ticket__barcode-bar" style={{ width: w }} />
                    ))}
                  </div>
                  <span className="ticket__barcode-text">{store.registrationCode}</span>
                </div>
                <span className="ticket__stub-note">KEEP THIS STUB</span>
                <span className="ticket__stub-ticks" aria-hidden="true">{'\u25BE \u25BE'}</span>
              </div>
            </div>

            <span className="ticket__mark ticket__mark--tl" aria-hidden="true">+</span>
            <span className="ticket__mark ticket__mark--tr" aria-hidden="true">+</span>
            <span className="ticket__mark ticket__mark--bl" aria-hidden="true">+</span>
            <span className="ticket__mark ticket__mark--br" aria-hidden="true">+</span>
            <span className="ticket__paper" aria-hidden="true" />
          </div>

          <motion.div
            className="ticket__stamp"
            initial={{ scale: 0, rotate: -26 }}
            animate={{ scale: 1, rotate: -13 }}
            transition={{ type: 'spring', stiffness: 280, damping: 17, delay: 1.3 }}
          >
            <span className="ticket__stamp-l1">PAYMENT PROOF</span>
            <span className="ticket__stamp-l2">RECEIVED</span>
          </motion.div>
        </motion.div>

        <motion.p
          className="spass__status"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.6 }}
        >
          PAYMENT PROOF SUBMITTED {'\u2014'} STATUS: PENDING VERIFICATION
        </motion.p>

        <motion.p
          className="spass__note"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.75 }}
        >
          Your registration has been received. Our team will verify your payment proof before your entry is confirmed.
        </motion.p>

        <motion.div
          className="spass__actions"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.9, ease: EASE }}
        >
          <span className="spass__actions-note">HACK2PITCH 2026 {'\u2014'} YOU&apos;RE IN</span>
          <motion.button
            className="spass__cta"
            onClick={onExit}
            type="button"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            BACK TO HACK2PITCH
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   MAIN REGISTRATION COMPONENT
   ═══════════════════════════════════════════════════════════════ */

export default function Registration({ onExit }) {
  const {
    store,
    boot,
    retryBoot,
    startFresh,
    continueFromStep,
    uploadProof,
    submitEntry,
    retryProblems,
  } = useRegistration();

  const [direction, setDirection] = useState(1);

  useEffect(() => {
    boot();
  }, [boot]);

  const goNext = useCallback(async () => {
    if (store.currentStep === 4) {
      await submitEntry();
      return;
    }
    const ok = await continueFromStep(store.currentStep);
    if (ok) setDirection(1);
  }, [store.currentStep, continueFromStep, submitEntry]);

  const busy = useMemo(
    () => Object.values(store.loading).some(Boolean),
    [store.loading]
  );

  const goPrev = useCallback(() => {
    if (busy) return;
    setDirection(-1);
    store.clearStepError();
    store.prevStep();
    store.persistCurrentStep();
  }, [busy, store]);

  const goToStep = useCallback((step) => {
    if (busy) return;
    setDirection(step < store.currentStep ? -1 : 1);
    store.clearStepError();
    store.setStep(step);
    store.persistCurrentStep();
  }, [busy, store]);

  const progress = useMemo(() => {
    return ((store.currentStep) / (STEPS.length - 1)) * 100;
  }, [store.currentStep]);

  const navBusy = busy && !store.loading.uploading;

  /* Fatal: config error / problems unavailable / network down. */
  if (store.bootError) {
    const fatal = (() => {
      switch (store.bootErrorCode) {
        case 'PROBLEMS_LOAD_FAILED':
          return {
            tag: 'ERR.LINK.CHALLENGES',
            title: 'CHALLENGES UNAVAILABLE',
            note: 'The problem statements could not be loaded from the database. Retry in a moment.',
          };
        case 'NETWORK_ERROR':
          return {
            tag: 'ERR.LINK.DOWN',
            title: 'SERVICE TEMPORARILY UNAVAILABLE',
            note: 'The event data could not be reached. Retry in a moment.',
          };
        case 'ROUNDS_LOAD_FAILED':
        case 'ROUNDS_RPC_MISSING':
          return {
            tag: 'ERR.ROUNDS.SERVICE',
            title: 'REGISTRATION UNAVAILABLE',
            note: 'The registration rounds service could not be reached. Retry in a moment.',
          };
        case 'CONFIG':
          return {
            tag: 'ERR.CONFIG.ENV',
            title: 'CONFIGURATION ERROR',
            note: 'The application is missing required environment settings.',
          };
        default:
          return {
            tag: 'ERR.GENERIC',
            title: 'REGISTRATION PAUSED',
            note: '',
          };
      }
    })();

    return (
      <div className="reg">
        <div className="reg__header">
          <button className="reg__header-back" onClick={onExit}>&larr; BACK TO SITE</button>
          <span className="reg__header-brand">HACK2PITCH 2026</span>
        </div>
        <div className="reg__fatal">
          <span className="reg__fatal-num">! !</span>
          <h2 className="reg__fatal-title">{fatal.title}</h2>
          <p className="reg__fatal-desc">{store.bootError}</p>
          {fatal.note && <p className="reg__fatal-note">{fatal.note}</p>}
          <span className="reg__fatal-code">{fatal.tag}</span>
          <div className="reg__fatal-actions">
            <button className="reg__nav-next" onClick={retryBoot} type="button">RETRY</button>
            <button
              className="reg__fatal-link"
              onClick={startFresh}
              type="button"
            >
              START A NEW REGISTRATION
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (store.loading.boot && store.problems.length === 0) {
    return (
      <div className="reg">
        <div className="reg__header">
          <button className="reg__header-back" onClick={onExit}>&larr; BACK TO SITE</button>
          <span className="reg__header-brand">HACK2PITCH 2026</span>
        </div>
        <div className="reg__fatal">
          <span className="reg__nav-spinner reg__fatal-spinner" />
          <h2 className="reg__fatal-title">LOADING HACK2PITCH</h2>
        </div>
      </div>
    );
  }

  /* No open registration round (closed / full / not yet open) — the
     form is replaced by the professional closed state. The database is
     the real gate; this is only the reflection it reported. A finished
     run (step 5 + code) always shows its success pass first, even if
     the round reported full at the moment the write landed. */
  if (store.currentStep === 5 && store.registrationCode) {
    return <SuccessPass store={store} onExit={onExit} />;
  }

  if (store.round && (store.round.open === false || !store.round.id)) {
    return <RegistrationGate round={store.round} onExit={onExit} />;
  }

  return (
    <div className="reg">
      <div className="reg__progress">
        <motion.div
          className="reg__progress-fill"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>

      <div className="reg__header">
        <button className="reg__header-back" onClick={onExit}>&larr; BACK TO SITE</button>
        <span className="reg__header-brand">HACK2PITCH 2026</span>
      </div>

      <div className="reg__layout">
        <div className="reg__main">
          {store.round && store.round.open === true && <RoundBanner round={store.round} hasSize={Boolean(store.teamSizeSelected && store.team.size)} />}

          <div className="reg__steps-bar">
            {STEPS.map((s) => (
              <div
                key={s.id}
                className={`reg__step-pill ${store.currentStep === s.id ? 'reg__step-pill--on' : ''} ${store.completedSteps.includes(s.id) ? 'reg__step-pill--done' : ''}`}
              >
                <span className="reg__step-pill-num">{s.number}</span>
                <span className="reg__step-pill-label">{s.label}</span>
              </div>
            ))}
          </div>

          <div className="reg__content">
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={store.currentStep}
                custom={direction}
                variants={pageVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="reg__step-wrap"
              >
                {store.currentStep === 0 && <StepEntry store={store} onRetry={retryProblems} />}
                {store.currentStep === 1 && <StepCrewSize store={store} />}
                {store.currentStep === 2 && <StepBuildCrew store={store} />}
                {store.currentStep === 3 && <StepPayment store={store} onUploadProof={uploadProof} />}
                {store.currentStep === 4 && <StepReview store={store} goToStep={goToStep} />}
              </motion.div>
            </AnimatePresence>
          </div>

          {store.stepError && <div className="reg__error">{store.stepError}</div>}

          <div className="reg__nav">
            {store.currentStep > 0 && store.currentStep < 5 && (
              <button className="reg__nav-prev" onClick={goPrev} disabled={navBusy}>
                &larr; PREVIOUS
              </button>
            )}
            <div className="reg__nav-spacer" />
            {store.currentStep < 4 && (
              <button
                className={`reg__nav-next ${store.isStepValid(store.currentStep) && !navBusy ? '' : 'reg__nav-next--off'}`}
                onClick={goNext}
                disabled={!store.isStepValid(store.currentStep) || navBusy}
              >
                {navBusy ? (
                  <span className="reg__nav-spinner">WORKING&hellip;</span>
                ) : (
                  <>CONTINUE &rarr;</>
                )}
              </button>
            )}
            {store.currentStep === 4 && (
              <div className="reg__nav-submit-wrap">
                {store.payment.uploadStatus === 'success' && (
                  <span className="reg__nav-note">Payment proof will be stored with your entry for verification.</span>
                )}
                {store.stepError && store.currentStep === 4 && (
                  <span className="reg__nav-note reg__nav-note--err">{store.stepError}</span>
                )}
                <button
                  className={`reg__nav-next reg__nav-next--pay ${store.isStepValid(4) && !store.isSubmitting ? '' : 'reg__nav-next--off'}`}
                  onClick={goNext}
                  disabled={!store.isStepValid(4) || store.isSubmitting || store.payment.uploadStatus === 'uploading'}
                >
                  {store.isSubmitting ? (
                    <span className="reg__nav-spinner">SUBMITTING ENTRY&hellip;</span>
                  ) : (
                    <>CONFIRM &amp; ENTER HACK2PITCH &rarr;</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        <BookingSummary store={store} onExit={onExit} />
      </div>

      <MobileBar store={store} />
    </div>
  );
}