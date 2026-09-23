import { Fragment, useRef, useState, useEffect, lazy, Suspense } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useCountdown } from '../../hooks/index.js';
import { HACKATHON } from '../../data/index.js';
import { fetchProblemAvailability } from '../../services/problemService.js';
import { getActiveRegistrationRound, startingRegistrationFee } from '../../services/registrationService.js';
import './Hero.css';

gsap.registerPlugin(ScrollTrigger);

const HeroVisual = lazy(() => import('./HeroVisual'));

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

const EASE = [0.16, 1, 0.3, 1];

export default function Hero({ onRegister }) {
  const sectionRef = useRef(null);
  const progressRef = useRef(0);
  const reduced = useReducedMotion();
  const countdown = useCountdown(HACKATHON.date);
  const [isWide, setIsWide] = useState(false);
  const [regState, setRegState] = useState('CHECK');
  const [heroFee, setHeroFee] = useState(null);
  const coordsRef = useRef(null);

  const sd = new Date(HACKATHON.date);
  const ed = new Date(HACKATHON.endDate);
  const WHEN = `${sd.getDate()}–${ed.getDate()} ${MONTHS[sd.getMonth()]} ${sd.getFullYear()}`;

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 769px)');
    const sync = () => setIsWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* Registration availability is read from the real database (problem
     statements exist = entry is open); never hardcoded. Propagates
     into the hero readout. */
  useEffect(() => {
    let alive = true;
    fetchProblemAvailability().then((available) => {
      if (!alive) return;
      setRegState(available ? 'OPEN' : 'CLOSED');
    });
    return () => { alive = false; };
  }, []);

  /* The registration fee is the ADMIN-CONFIGURED active round's fee,
     keyed by team size — the entry ("FROM") price is the lowest of the
     per-size fees. It comes ONLY from the database round payload; there
     is no hardcoded fallback. The readout shows "FROM ₹—" until a real
     active round resolves. */
  useEffect(() => {
    let alive = true;
    (async () => {
      let fee = null;
      try {
        const round = await getActiveRegistrationRound();
        if (round?.id && round.open === true) {
          fee = startingRegistrationFee(round);
        }
      } catch {
        /* keep null — never invent a price */
      }
      if (alive) setHeroFee(fee);
    })();
    return () => { alive = false; };
  }, []);

  /* Cursor coordinates feed the technical readout + 1–2px parallax
     (desktop only, text written directly — no re-render, no GSAP clash). */
  useEffect(() => {
    const el = coordsRef.current;
    const section = sectionRef.current;
    const mq = window.matchMedia('(pointer: fine)');
    if (!el || !mq.matches || reduced || !section) return;
    let raf = 0;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        el.textContent = `${String(e.clientX).padStart(4, '0')} / ${String(e.clientY).padStart(4, '0')}`;
        const r = section.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        section.style.setProperty('--px', nx.toFixed(3));
        section.style.setProperty('--py', ny.toFixed(3));
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, [reduced]);

  /* ── SCROLL-LINKED TRANSFORMATION — the hero gives way to THE EVENT ── */
  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    if (!section) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${Math.max(0, section.clientHeight - window.innerHeight)}`,
          scrub: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            progressRef.current = self.progress;
          },
        },
      });

      if (isWide) {
        /* layer by layer — every layer at its own speed */
        tl.to('.hero__top', { y: -34, opacity: 0.35, duration: 1, ease: 'none' }, 0.05)
          .to('.hero__masthead-order', { y: -56, duration: 1, ease: 'none' }, 0.38)
          .to('.hero__masthead-mark', { x: -96, y: -22, duration: 1, ease: 'none' }, 0.42)
          .to('.hero__2026', { y: 52, scale: 1.1, x: -84, duration: 1, ease: 'none' }, 0.3)
          .to('.hero__2026', { opacity: 0.55, duration: 1, ease: 'none' }, 0.82)
          .to('.hero__manifesto', { letterSpacing: '0.5em', duration: 1, ease: 'none' }, 0.18)
          .to('.hero__manifesto', { opacity: 0, y: 26, duration: 1, ease: 'none' }, 0.55)
          .to('.hero__clock', { opacity: 0, y: -26, x: -36, duration: 1, ease: 'none' }, 0.58)
          .to('.hero__bar', { opacity: 0, y: 46, duration: 1, ease: 'none' }, 0.62)
          .to('.hero__mark', { opacity: 0.25, duration: 1, ease: 'none' }, 0.6)
          .to('.hero__scroll', { opacity: 0, duration: 1, ease: 'none' }, 0.02)
          .fromTo('.hero__thread', { scaleX: 0 }, { scaleX: 1, duration: 1, ease: 'none' }, 0.12)
          .to('.hero__thread', { y: 110, opacity: 0.35, duration: 1, ease: 'none' }, 0.72)
          .to('.hero__atmos', { opacity: 0, duration: 1, ease: 'none' }, 0.78)
          .to('.hero__stage', { scale: 0.985, duration: 1, ease: 'none' }, 0.86)
          .to('.hero__out', { opacity: 0.9, duration: 1, ease: 'none' }, 0.74);
      } else {
        /* compact — the composition leaves/narrows without drama */
        tl.to('.hero__2026', { y: 36, scale: 1.05, duration: 1, ease: 'none' }, 0.2)
          .to('.hero__clock', { opacity: 0, y: -18, duration: 1, ease: 'none' }, 0.5)
          .to('.hero__bar', { opacity: 0, y: 30, duration: 1, ease: 'none' }, 0.55)
          .to('.hero__scroll', { opacity: 0, duration: 1, ease: 'none' }, 0.02)
          .fromTo('.hero__thread', { scaleX: 0 }, { scaleX: 1, duration: 1, ease: 'none' }, 0.15)
          .to('.hero__atmos', { opacity: 0, duration: 1, ease: 'none' }, 0.74)
          .to('.hero__stage', { scale: 0.985, duration: 1, ease: 'none' }, 0.86)
          .to('.hero__out', { opacity: 0.85, duration: 1, ease: 'none' }, 0.72);
      }
    }, section);

    return () => ctx.revert();
  }, [reduced, isWide]);

  const units = [
    { v: countdown.days, l: 'DAYS' },
    { v: countdown.hours, l: 'HRS' },
    { v: countdown.minutes, l: 'MIN' },
    { v: countdown.seconds, l: 'SEC' },
  ];

  return (
    <section className={`hero${isWide ? ' hero--wide' : ''}`} id="hero" ref={sectionRef}>
      {/* ── LIVE ATMOSPHERE — a fixed field behind everything ── */}
      <div className="hero__atmos">
        <Suspense fallback={<div className="hero__visual hero__visual--css" aria-hidden="true" />}>
          <HeroVisual progressRef={progressRef} reduced={Boolean(reduced)} />
        </Suspense>

        {/* spatial grid + grain + moving scan band */}
        <span className="hero__grid" aria-hidden="true" />
        <span className="hero__diag" aria-hidden="true" />
        <span className="hero__noise" aria-hidden="true" />
        <span className="hero__scanband" aria-hidden="true" />

        {/* live system field — a few nodes and a red signal blip */}
        <span className="hero__nodes" aria-hidden="true">
          <i className="hero__node hero__node--a" />
          <i className="hero__node hero__node--b" />
          <i className="hero__node hero__node--c" />
        </span>
        <span className="hero__signal" aria-hidden="true" />

        {/* soft red light — red as force, never as a block */}
        <div className="hero__veil" aria-hidden="true" />
        {/* occasional geometric sweeps */}
        <span className="hero__trace hero__trace--a" aria-hidden="true" />
        <span className="hero__trace hero__trace--b" aria-hidden="true" />
      </div>

      <div className="hero__stage">
        {/* ── top marquee strip ── */}
        <header className="hero__top">
          <span className="hero__top-left">{HACKATHON.presenter} PRESENTS</span>
          <span className="hero__top-right">THE 24-HOUR BUILD — {WHEN}</span>
        </header>

        {/* ── masthead — HACK2PITCH in one composition ── */}
        <div className="hero__words">
          <h1 className="hero__masthead" aria-label="HACK2PITCH 2026">
            <motion.span
              className="hero__masthead-line hero__masthead-order"
              initial={reduced ? false : { clipPath: 'inset(-8% 0 100% 0)', y: '0.6em' }}
              animate={reduced ? undefined : { clipPath: 'inset(-8% 0 -2% 0)', y: 0 }}
              transition={{ duration: 0.95, delay: 0.15, ease: EASE }}
            >
              HACK2
            </motion.span>
            <motion.span
              className="hero__masthead-line hero__masthead-mark"
              initial={reduced ? false : { clipPath: 'inset(-8% 0 100% 0)', y: '0.6em' }}
              animate={reduced ? undefined : { clipPath: 'inset(-8% 0 -2% 0)', y: 0 }}
              transition={{ duration: 0.95, delay: 0.34, ease: EASE }}
            >
              PITCH
            </motion.span>
          </h1>

          <motion.p
            className="hero__manifesto"
            initial={reduced ? false : { clipPath: 'inset(-8% 0 100% 0)', y: '0.5em' }}
            animate={reduced ? undefined : { clipPath: 'inset(-8% 0 -2% 0)', y: 0 }}
            transition={{ duration: 0.9, delay: 0.78, ease: EASE }}
          >
            <span className="hero__manifesto-rule" aria-hidden="true" />
            {HACKATHON.tagline}
          </motion.p>
        </div>

        {/* oversized outlined numeral — partially outside the composition */}
        <motion.span
          className="hero__2026"
          aria-hidden="true"
          initial={{ opacity: 0, x: 60 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 1.2, delay: 0.25, ease: EASE }}
        >
          2026
        </motion.span>
        <span className="hero__mark" aria-hidden="true">✕</span>

        {/* live cursor coordinates — technical data marks */}
        <span className="hero__coords" ref={coordsRef} aria-hidden="true">0000 / 0000</span>

        {/* ── MISSION CLOCK — a live system status readout, not a countdown widget ── */}
        <div className="hero__clock" role="timer" aria-label="Time remaining until HACK2PITCH 2026">
          <span className="hero__clock-frame" aria-hidden="true" />
          <span className="hero__clock-grid" aria-hidden="true" />
          <span className="hero__clock-scan" aria-hidden="true" />
          {/* a single red tick fires on each second change — live clock tell */}
          <span className="hero__clock-pulse" key={countdown.seconds} aria-hidden="true" />

          <div className="hero__clock-head">
            <span className="hero__clock-id">SYS.CLK</span>
            <span className="hero__clock-status"><i aria-hidden="true" />SYSTEM ACTIVE</span>
            <span className="hero__clock-node">NODE H2P-01</span>
          </div>

          <div className="hero__clock-window">
            <span className="hero__clock-window-label">EVENT WINDOW</span>
            <span className="hero__clock-window-value">{`${String(sd.getDate()).padStart(2, '0')} ${MONTHS[sd.getMonth()]} — ${String(ed.getDate()).padStart(2, '0')} ${MONTHS[ed.getMonth()]} / ${sd.getFullYear()}`}</span>
          </div>

          <div className="hero__clock-readout">
            <span className="hero__clock-tminus" aria-hidden="true">T−</span>
            {units.map((u, i) => (
              <Fragment key={u.l}>
                {i > 0 && <span className="hero__clock-colon" aria-hidden="true">:</span>}
                <span className="hero__clock-group">
                  <span className="hero__clock-num">
                    {String(u.v).padStart(2, '0').split('').map((d, di) => (
                      <span className="hero__clock-digit" key={`${u.l}-${di}-${d}`}>{d}</span>
                    ))}
                  </span>
                  <span className="hero__clock-unit-label">{u.l}</span>
                </span>
              </Fragment>
            ))}
          </div>

          <span className="hero__clock-line" aria-hidden="true" />

          <div className="hero__clock-labels" aria-hidden="true">
            <span />
            {units.map((u, i) => (
              <Fragment key={u.l}>
                {i > 0 && <span className="hero__clock-lsep" />}
                <span className="hero__clock-label">{u.l}</span>
              </Fragment>
            ))}
          </div>

          <div className="hero__clock-meta">
            <span className="hero__clock-coord">12.977°N / 77.571°E</span>
            <span className="hero__clock-nodestate">NODE STATUS <b>ACTIVE</b></span>
            <span className="hero__clock-registration">REGISTRATION <b>{regState}</b></span>
          </div>
        </div>

        {/* ── bottom bar — facts left, action right ── */}
        <div className="hero__bar">
          <div className="hero__bar-meta">
            <span className="hero__bar-meta-item"><em>WHEN</em><b>{WHEN}</b></span>
            <span className="hero__bar-meta-item"><em>WHERE</em><b>{HACKATHON.location}</b></span>
            <span className="hero__bar-meta-item">
              <em>TEAMS</em><b>{HACKATHON.minTeamSize}–{HACKATHON.maxTeamSize}</b>
            </span>
          </div>

          <div className="hero__bar-act">
            <span className="hero__fee">FROM ₹{heroFee === null ? '\u2014' : heroFee} / TEAM</span>
            <motion.button
              className="hero__cta"
              onClick={onRegister}
              whileTap={{ scale: 0.97 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <span className="hero__cta-scan" aria-hidden="true" />
              <span className="hero__cta-tag" aria-hidden="true">INITIATE</span>
              <span className="hero__cta-text">REGISTER NOW</span>
              <span className="hero__cta-arrow" aria-hidden="true">→</span>
            </motion.button>
          </div>
        </div>

        {/* ── scroll cue — a feed running into the next screen ── */}
        <div className="hero__scroll" aria-hidden="true">
          <span className="hero__scroll-rail">
            <span className="hero__scroll-dot" />
          </span>
          <span className="hero__scroll-text">SCROLL</span>
        </div>

        {/* ── the red thread — drains from the hero into THE EVENT ── */}
        <span className="hero__thread" aria-hidden="true" />
        <span className="hero__out" aria-hidden="true" />
      </div>
    </section>
  );
}