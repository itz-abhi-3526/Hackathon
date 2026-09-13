import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { getActiveRegistrationRound } from '../../services/registrationService.js';
import { HACKATHON } from '../../data/index.js';
import './FinalCTA.css';

export default function FinalCTA({ onRegister, progress }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();
  const [fee, setFee] = useState(null);
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 768px)').matches : false
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const onChange = (e) => setMobile(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  /* The published fee comes from the active registration round, never a
     hardcoded price. The constant is only the pre-rounds legacy value. */
  useEffect(() => {
    let alive = true;
    (async () => {
      let f = HACKATHON.registrationFee;
      try {
        const round = await getActiveRegistrationRound();
        if (round?.id && round.open === true && Number.isFinite(Number(round.fee))) {
          f = Number(round.fee);
        }
      } catch {
        f = HACKATHON.registrationFee;
      }
      if (alive) setFee(f);
    })();
    return () => { alive = false; };
  }, []);

  // Coordinated sequence progress (from FinalSequence). If none is passed,
  // fall back to this section's own scroll range.
  const own = useScroll({ target: ref, offset: ['end end', 'end start'] });
  const exit = progress ?? own.scrollYProgress;

  // Red field releases toward the bottom-left while its seam leans inward.
  const fieldX = useTransform(exit, (v) => (reduced ? 0 : mobile ? v * -110 : v * -170));
  const fieldY = useTransform(exit, (v) => (reduced ? 0 : mobile ? v * -70 : v * 250));
  const fieldRot = useTransform(exit, (v) => (reduced || mobile ? 0 : v * -2.4));
  const seam = useTransform(exit, (v) => {
    if (reduced) return 'polygon(0 0, 66% 0, 54% 100%, 0 100%)';
    if (mobile) return 'polygon(0 0, 100% 0, 100% 100%, 0 100%)';
    const t = 64 - v * 26;
    const b = 52 - v * 20;
    return `polygon(0 0, ${t}% 0, ${b}% 100%, 0 100%)`;
  });

  // The whole frame darkens — the energy reduces and black takes over.
  const shade = useTransform(exit, (v) => v * 0.85);

  // Typography departs at slightly different speeds and fully clears.
  const lift = useTransform(exit, (v) => (reduced ? 0 : v * -80));
  const liftSoft = useTransform(exit, (v) => (reduced ? 0 : v * -52));
  const typeA = useTransform(exit, (v) => 1 - v);
  const typeB = useTransform(exit, (v) => 1 - v * 0.95);
  const drift = useTransform(exit, (v) => (reduced ? 0 : mobile ? v * 60 : v * 130));
  const drawS = useTransform(exit, (v) => (reduced ? 1 : 1 - v * 0.14));
  const drawO = useTransform(exit, (v) => 1 - v);

  return (
    <section className="finalcta" ref={ref} id="register">
      {/* ── RED FIELD ── */}
      <motion.div
        className="finalcta__field"
        style={{ x: fieldX, y: fieldY, rotate: fieldRot, clipPath: seam }}
      >
        <span className="finalcta__mark" aria-hidden="true">+</span>
        <span className="finalcta__tick" aria-hidden="true" />

        <motion.div className="finalcta__field-inner" style={{ y: liftSoft, opacity: typeA }}>
          <span className="finalcta__eyebrow">VOIDHACK 2026 — THE FINAL INVITATION</span>

          <h2 className="finalcta__headline">
            <span className="finalcta__headline-line">YOU HAVE</span>
            <span className="finalcta__headline-line finalcta__headline-line--indent">AN IDEA.</span>
          </h2>

          <button className="finalcta__cta" onClick={onRegister} type="button">
            <span className="finalcta__cta-text">REGISTER FOR VOIDHACK 2026</span>
            <span className="finalcta__cta-arrow" aria-hidden="true">→</span>
          </button>
        </motion.div>

        <motion.div className="finalcta__meta" style={{ opacity: typeA }}>
          <div className="finalcta__meta-rule" aria-hidden="true" />
          <div className="finalcta__meta-row">
            <span className="finalcta__meta-item">{fee === null ? '\u20B9\u2014' : `\u20B9${fee}`} / TEAM</span>
            <span className="finalcta__meta-item">02—04 / CREW</span>
            <span className="finalcta__meta-item">17—19 / OCT 2026</span>
          </div>
        </motion.div>
      </motion.div>

      {/* ── BLACK FIELD ── */}
      <div className="finalcta__dark">
        <motion.span className="finalcta__tagline" style={{ y: lift, opacity: typeB }}>
          BUILD WITHOUT PERMISSION
        </motion.span>

        <motion.span className="finalcta__print" aria-hidden="true">+</motion.span>
        <motion.span className="finalcta__rule" aria-hidden="true" />

        <motion.h2 className="finalcta__kill" style={{ y: lift, opacity: typeB }}>
          NOW BUILD <span className="finalcta__kill-red">IT.</span>
        </motion.h2>

        <motion.span className="finalcta__2026" aria-hidden="true" style={{ x: drift, scale: drawS, opacity: drawO }}>
          2026
        </motion.span>

        <motion.span className="finalcta__coord" style={{ opacity: typeB }}>
          OCT 17—19 2026 — REGISTRATION OPEN
        </motion.span>

        <motion.span className="finalcta__presenter" style={{ opacity: typeB }}>
          PRESENTED BY NEXUS INSTITUTE OF TECHNOLOGY
        </motion.span>
      </div>

      {/* ── DARKENING SHADE ── */}
      <motion.div className="finalcta__shade" style={{ opacity: shade }} aria-hidden="true" />
    </section>
  );
}