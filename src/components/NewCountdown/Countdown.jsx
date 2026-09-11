import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { useCountdown } from '../../hooks/index.js';
import { HACKATHON } from '../../data/index.js';
import { fetchProblemAvailability } from '../../services/problemService.js';
import './Countdown.css';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function windowLabel(start, end) {
  const s = new Date(start);
  const e = new Date(end);
  const sameMonth = s.getMonth() === e.getMonth();
  const from = `${s.getDate()} ${MONTHS[s.getMonth()]}`;
  const to = `${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  return sameMonth ? `${from} — ${to}` : `${from} — ${to}`;
}

export default function Countdown() {
  const sectionRef = useRef(null);
  const [avail, setAvail] = useState(null);

  const startDate = HACKATHON.date;
  const endDate = HACKATHON.endDate;
  const countdown = useCountdown(startDate);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  useEffect(() => {
    let alive = true;
    fetchProblemAvailability().then((available) => {
      if (alive) setAvail(available);
    });
    return () => {
      alive = false;
    };
  }, []);

  const regLabel = useMemo(
    () => (avail === null ? 'CHECK NODE' : avail ? 'OPEN' : 'CLOSED'),
    [avail]
  );

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const bgScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.95, 1, 1.05]);

  const units = [
    { value: countdown.days, label: 'DAYS' },
    { value: countdown.hours, label: 'HRS' },
    { value: countdown.minutes, label: 'MIN' },
    { value: countdown.seconds, label: 'SEC' },
  ];

  return (
    <section className="countdown vh-section" ref={sectionRef} id="countdown">
      <motion.div className="countdown__bg" style={{ scale: bgScale }}>
        <div className="countdown__bg-red" />
        <span className="countdown__bg-grid" aria-hidden="true" />
        <span className="countdown__bg-scan" aria-hidden="true" />
      </motion.div>

      <div className="countdown__inner vh-section-inner">
        <motion.div
          className="countdown__content"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1 }}
        >
          <motion.header
            className="countdown__head"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="countdown__head-label">SYSTEM CLOCK // T MINUS EVENT</span>
            <span className="countdown__head-sys">
              <i aria-hidden="true" />
              {regLabel}
            </span>
          </motion.header>

          <motion.div
            className="countdown__panel"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="countdown__frame" aria-hidden="true" />
            <span className="countdown__grid" aria-hidden="true" />
            <span className="countdown__scan" aria-hidden="true" />

            <div className="countdown__window">
              <span className="countdown__window-label">EVENT WINDOW</span>
              <span className="countdown__window-value">{windowLabel(startDate, endDate)}</span>
            </div>

            <div className="countdown__readout" role="timer" aria-label={`Time remaining until VOIDHACK 2026`}>
              <span className="countdown__tminus" aria-hidden="true">T−1</span>
              {units.map((u, i) => (
                <Fragment key={u.label}>
                  {i > 0 && <span className="countdown__colon" aria-hidden="true">:</span>}
                  <span className="countdown__group">
                    <span
                      className="countdown__value"
                      key={`${u.label}-${u.value}`}
                    >
                      {String(u.value).padStart(2, '0')}
                    </span>
                    <span className="countdown__unit-label">{u.label}</span>
                  </span>
                </Fragment>
              ))}
            </div>

            <span className="countdown__line" aria-hidden="true" />

            <div className="countdown__meta">
              <span className="countdown__meta-item">
                <em>NODE</em>
                <b>VH-01 / BLR</b>
              </span>
              <span className="countdown__meta-item">
                <em>SYNC</em>
                <b>UTC {Intl.DateTimeFormat().resolvedOptions().timeZone}</b>
              </span>
              <span className="countdown__meta-item countdown__meta-item--act">
                <em>ACCESS</em>
                <b>{regLabel}</b>
              </span>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}