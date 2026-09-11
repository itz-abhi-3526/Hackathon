import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { HACKATHON, TIMELINE } from '../../data/index.js';
import { isSupabaseConfigured } from '../../lib/config.js';
import { getSupabase } from '../../lib/supabase.js';
import { T } from '../../lib/schema.js';
import './BootSequence.css';

const ENV = import.meta.env.PROD ? 'PRODUCTION' : import.meta.env.DEV ? 'DEVELOPMENT' : 'LOCAL';

const FIRST_LABEL = 200;
const LABEL_GAP = 220;
const STATUS_AFTER = 200;
const READY_AT = 2800;
const GRANT_AT = 3400;
const RELEASE_AT = 4200;
const HARD_MS = 4800;
const REDUCED_SETTLE_MS = 180;

const WAYPOINTS = [0, 14, 28, 42, 56, 68, 78, 87, 94, 98];

const toneFor = (status) => {
  if (status === 'CHECK') return 'pending';
  if (status === 'WARN' || status === 'OFFLINE') return 'warn';
  return 'ok';
};

export default function BootSequence({ onComplete }) {
  const reduced = useReducedMotion();
  const [lines, setLines] = useState(0);
  const [resolved, setResolved] = useState(0);
  const [state, setState] = useState('booting');
  const [dbStatus, setDbStatus] = useState('CHECK');

  const doneRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const fireComplete = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onCompleteRef.current();
  };

  useEffect(() => {
    const timers = [];
    let cancelled = false;

    const at = (t, fn) => {
      const timer = setTimeout(() => {
        if (cancelled) return;
        fn();
      }, t);
      timers.push(timer);
    };

    const race = (promise, ms) =>
      Promise.race([
        promise,
        new Promise((resolve) => {
          const t = setTimeout(() => resolve(undefined), ms);
          timers.push(t);
        }),
      ]);
    const safe = (promise) => promise.catch(() => undefined);

    void safe(import('../../components/NewHero/HeroVisual.jsx'));
    void safe(Promise.resolve('fonts' in document ? document.fonts.ready : undefined));

    void (async () => {
      if (!isSupabaseConfigured()) {
        setDbStatus('OFFLINE');
        return;
      }
      try {
        const supabase = getSupabase();
        const out = await race(
          supabase.from(T.PROBLEM_STATEMENTS).select('id', { count: 'exact', head: true }).limit(1),
          1300
        );
        setDbStatus(out ? (out.error ? 'WARN' : 'OK') : 'WARN');
      } catch {
        setDbStatus('WARN');
      }
    })();

    if (reduced) {
      setLines(9);
      setResolved(9);
      setDbStatus(isSupabaseConfigured() ? 'OK' : 'OFFLINE');
      at(REDUCED_SETTLE_MS, () => setState('ready'));
      at(REDUCED_SETTLE_MS + 200, () => setState('granted'));
      at(REDUCED_SETTLE_MS + 520, fireComplete);
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    for (let i = 0; i < 9; i += 1) {
      at(FIRST_LABEL + i * LABEL_GAP, () => setLines((n) => n + 1));
      at(FIRST_LABEL + i * LABEL_GAP + STATUS_AFTER, () => setResolved((n) => n + 1));
    }

    at(READY_AT, () => setState('ready'));
    at(GRANT_AT, () => setState('granted'));
    at(RELEASE_AT, fireComplete);
    at(HARD_MS, () => {
      if (doneRef.current) return;
      setLines(9);
      setResolved(9);
      setState('granted');
      fireComplete();
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const online = state === 'ready' || state === 'granted';
  const pct = online ? 100 : WAYPOINTS[Math.min(resolved, WAYPOINTS.length - 1)];

  const steps = [
    { label: 'INITIALIZING EVENT CORE', status: 'OK' },
    { label: 'LOADING VISUAL SYSTEM', status: 'OK' },
    { label: 'CHECKING EVENT CONFIG', status: 'OK' },
    { label: 'CONNECTING DATABASE', status: dbStatus },
    { label: 'VERIFYING REGISTRATION', status: isSupabaseConfigured() ? 'OK' : 'OFFLINE' },
    { label: 'LOADING PROBLEM SETS', status: '[06] LOADED' },
    { label: 'INITIALIZING TIMELINE', status: `[${String(TIMELINE.length).padStart(2, '0')}] PHASES` },
    { label: 'LOADING ASSETS', status: 'OK' },
    { label: 'MOUNTING INTERFACE', status: 'OK' },
  ];

  const E = [0.16, 1, 0.3, 1];

  return (
    <motion.div
      className={`boot boot--${state}`}
      role="status"
      aria-label={`${HACKATHON.name} is booting`}
      exit={{ y: '-100%', transition: { duration: reduced ? 0.3 : 1.05, ease: E } }}
    >
      <span className="boot__grid" aria-hidden="true" />
      <span className="boot__scanline" aria-hidden="true" />

      <span className="boot__cross boot__cross--tl" aria-hidden="true">+</span>
      <span className="boot__cross boot__cross--tr" aria-hidden="true">+</span>
      <span className="boot__cross boot__cross--bl" aria-hidden="true">+</span>
      <span className="boot__cross boot__cross--br" aria-hidden="true">+</span>

      <div className="boot__layout">

        <motion.header
          className="boot__head"
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: E, delay: 0.1 }}
        >
          <span className="boot__head-title">
            {HACKATHON.name} <em>//</em> SYSTEM BOOT
          </span>
          <div className="boot__head-meta">
            <span>BUILD 2026.09</span>
            <span>ENV {ENV}</span>
            <span>NODE VH-01</span>
          </div>
        </motion.header>

        <div className="boot__body">

          <motion.aside
            className="boot__left"
            aria-hidden="true"
            initial={reduced ? { opacity: 1 } : { opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: E, delay: 0.3 }}
          >
            <div className="boot__motto">
              <span>IDEAS</span>
              <span>PEOPLE</span>
              <span>PROGRESS</span>
              <span className="boot__motto-sep">//</span>
              <span className="boot__motto-big">A BIGGER TOMORROW</span>
            </div>
            <div className="boot__coords">
              <span>NEXUS CAMPUS</span>
              <span>BENGALURU</span>
              <span>12.977°N / 77.571°E</span>
            </div>
          </motion.aside>

          <div className="boot__center">
            <motion.span
              className="boot__init"
              initial={reduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              {online ? '// ONLINE //' : '// INITIALIZING //'}
            </motion.span>

            <div className="boot__hero">
              <div className="boot__globe" aria-hidden="true">
                <div className="boot__orbit boot__orbit--1">
                  <span className="boot__node boot__node--a" />
                </div>
                <div className="boot__orbit boot__orbit--2">
                  <span className="boot__node boot__node--b" />
                </div>
                <div className="boot__orbit boot__orbit--3">
                  <span className="boot__node boot__node--c" />
                </div>
                <div className="boot__orbit boot__orbit--4" />
              </div>

              <motion.div
                className="boot__hud"
                initial={reduced ? { opacity: 1 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: E, delay: 0.5 }}
              >
                <span className="boot__hud-corner boot__hud-corner--tl" />
                <span className="boot__hud-corner boot__hud-corner--tr" />
                <span className="boot__hud-corner boot__hud-corner--bl" />
                <span className="boot__hud-corner boot__hud-corner--br" />
                <span className="boot__hud-tick boot__hud-tick--t" />
                <span className="boot__hud-tick boot__hud-tick--b" />
                <span className="boot__hud-tick boot__hud-tick--l" />
                <span className="boot__hud-tick boot__hud-tick--r" />

                <h1 className="boot__logo">{HACKATHON.name}</h1>
              </motion.div>
            </div>

            <motion.span
              className="boot__year"
              initial={reduced ? { opacity: 1 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: E, delay: 0.7 }}
            >
              {HACKATHON.edition}
            </motion.span>

            <motion.span
              className="boot__tagline"
              initial={reduced ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.9 }}
            >
              {HACKATHON.tagline}
            </motion.span>
          </div>

          <motion.aside
            className="boot__right"
            aria-hidden="true"
            initial={reduced ? { opacity: 1 } : { opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, ease: E, delay: 0.3 }}
          >
            <div className="boot__diag">
              {steps.slice(0, lines).map((step, i) => (
                <div className="boot__diag-line" key={step.label}>
                  <motion.span
                    className="boot__diag-label"
                    initial={reduced ? { opacity: 1 } : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.35, ease: E }}
                  >
                    {step.label}
                  </motion.span>
                  <span className="boot__diag-dots" />
                  {i < resolved && (
                    <motion.span
                      className={`boot__diag-status boot__diag-status--${toneFor(step.status)}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2 }}
                    >
                      [{step.status}]
                    </motion.span>
                  )}
                </div>
              ))}
              {state === 'booting' && (
                <span className="boot__cursor" aria-hidden="true">&#9646;</span>
              )}
            </div>

            <div className="boot__state">
              {state === 'booting' && (
                <span className="boot__state-text">SYSTEM STATUS: INITIALIZING</span>
              )}
              {state === 'ready' && (
                <motion.span
                  className="boot__state-text boot__state-text--ok"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  SYSTEMS ONLINE
                </motion.span>
              )}
              {state === 'granted' && (
                <motion.span
                  className="boot__state-text boot__state-text--go"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  AWAITING INPUT
                </motion.span>
              )}
            </div>
          </motion.aside>

        </div>

        <motion.div
          className="boot__progress"
          initial={reduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: E, delay: 0.4 }}
        >
          <span className="boot__progress-label">LOADING EXPERIENCE...</span>
          <div className="boot__progress-module">
            <span className="boot__progress-corner boot__progress-corner--tl" />
            <span className="boot__progress-corner boot__progress-corner--tr" />
            <span className="boot__progress-corner boot__progress-corner--bl" />
            <span className="boot__progress-corner boot__progress-corner--br" />
            <div className="boot__progress-track">
              <motion.span
                className="boot__progress-fill"
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.45, ease: E }}
              />
            </div>
            <span className="boot__progress-pct">{String(pct).padStart(3, '0')}%</span>
          </div>
        </motion.div>

        <motion.footer
          className="boot__foot"
          initial={reduced ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          <span>{HACKATHON.name} {HACKATHON.edition}</span>
          <span>{HACKATHON.presenter}</span>
          <span>BENGALURU, INDIA</span>
        </motion.footer>

      </div>
    </motion.div>
  );
}
