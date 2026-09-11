import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ArrowDown, ArrowRight } from 'lucide-react';
import { HACKATHON } from '../../data';
import { useCountdown } from '../../hooks';
import './Hero.css';

const GRID_LINES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  x: 10 + i * 12,
  delay: i * 0.1,
}));

const VOID_LETTERS = ['V', 'O', 'I', 'D'];

function AnimatedDigit({ value }) {
  return (
    <span className="count-digit">
      <motion.span
        key={value}
        initial={{ y: -18, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {String(value).padStart(2, '0')}
      </motion.span>
    </span>
  );
}

export default function Hero({ onRegister }) {
  const containerRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end start'],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.5], [0, -60]);
  const blockScale = useTransform(scrollYProgress, [0, 0.5], [1, 0.94]);

  const countdown = useCountdown(HACKATHON.date);

  return (
    <section ref={containerRef} className="hero">
      <div className="hero-grid-bg">
        {GRID_LINES.map((line) => (
          <motion.div
            key={line.id}
            className="hero-grid-line"
            style={{ left: `${line.x}%` }}
            initial={{ height: 0 }}
            animate={{ height: '100%' }}
            transition={{ duration: 1.5, delay: line.delay, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
        {[25, 50, 75].map((top) => (
          <div key={top} className="hero-grid-line-h" style={{ top: `${top}%` }} />
        ))}
      </div>

      <div className="hero-scanline" />

      <motion.div className="hero-ambient" style={{ opacity }}>
        <span className="hero-ambient-tag">SYS.VOID.2026</span>
        <span className="hero-ambient-tag">GRID.07.NEXUS</span>
      </motion.div>

      {/* TOP METADATA ROW */}
      <div className="hero-top">
        <motion.div
          className="hero-top-date"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <span className="hero-date-range">17—19</span>
          <span className="hero-date-month">OCT</span>
        </motion.div>
        <motion.div
          className="hero-top-presenter"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          {HACKATHON.presenter}
          <span className="hero-top-presents">PRESENTS</span>
        </motion.div>
      </div>

      {/* MAIN ASYMMETRIC COMPOSITION */}
      <motion.div className="hero-main" style={{ opacity, y }}>
        {/* vertical monolith */}
        <div className="hero-monolith" aria-label="VOID">
          {VOID_LETTERS.map((letter, i) => (
            <motion.span
              key={letter}
              className="hero-monolith-letter"
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            >
              {letter}
            </motion.span>
          ))}
        </div>

        {/* HACK signal block */}
        <motion.div className="hero-block-col" style={{ scale: blockScale }}>
          <motion.div
            className="hero-hack-block"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <i className="hero-corner hero-corner--tl" />
            <i className="hero-corner hero-corner--tr" />
            <i className="hero-corner hero-corner--bl" />
            <i className="hero-corner hero-corner--br" />

            <div className="hero-block-tags">
              <span className="hero-block-tag">// SIGNAL 07</span>
              <span className="hero-block-tag">48H</span>
            </div>

            <span className="hero-block-word">HACK</span>

            <div className="hero-block-foot">
              <span className="hero-block-tag">REF.R-2026.017</span>
              <span className="hero-block-tag">LIVE</span>
            </div>
          </motion.div>

          <motion.div
            className="hero-block-year"
            initial={{ opacity: 0, letterSpacing: '1em' }}
            animate={{ opacity: 1, letterSpacing: '0.45em' }}
            transition={{ duration: 0.8, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <span>2</span><span>0</span><span>2</span><span>6</span>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* DIVIDER */}
      <motion.div className="hero-divider" style={{ opacity }}>
        <span className="hero-divider-line" />
        <span className="hero-divider-mark" />
        <span className="hero-divider-line hero-divider-line--thin" />
        <span className="hero-divider-label">// ENTER THE VOID</span>
      </motion.div>

      {/* STATEMENT */}
      <motion.div
        className="hero-statement"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 1.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <span className="hero-statement-line">BUILD WHAT</span>
        <span className="hero-statement-line hero-statement-line--dim">SHOULDN'T EXIST</span>
      </motion.div>

      {/* ACTIONS */}
      <motion.div
        className="hero-actions"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 1.4 }}
      >
        <button className="hero-cta" onClick={onRegister} data-cursor="ENTER">
          <span className="hero-cta-bracket">[</span>
          ENTER
          <ArrowRight size={14} className="hero-cta-arrow" />
          <span className="hero-cta-bracket">]</span>
        </button>
        <a className="hero-cta-secondary" href="#problems" data-cursor="EXPLORE">
          EXPLORE THE CHALLENGE
        </a>
      </motion.div>

      {/* VERTICAL COUNTDOWN RAIL */}
      <motion.div className="hero-rail" style={{ opacity }}>
        <span className="hero-rail-label">T-MINUS</span>
        <span className="hero-rail-readout">
          <AnimatedDigit value={countdown.days} />
          <i>:</i>
          <AnimatedDigit value={countdown.hours} />
          <i>:</i>
          <AnimatedDigit value={countdown.minutes} />
          <i>:</i>
          <AnimatedDigit value={countdown.seconds} />
        </span>
        <span className="hero-rail-vertical">DESCEND</span>
      </motion.div>

      {/* COORDINATES */}
      <motion.div className="hero-coords" style={{ opacity }}>
        <span className="hero-coord">40.8566° N</span>
        <span className="hero-coord">77.5209° E</span>
      </motion.div>

      {/* SCROLL INDICATOR */}
      <motion.div
        className="hero-scroll-indicator"
        style={{ opacity }}
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="hero-scroll-line" />
        <span className="hero-scroll-text">SCROLL TO ENTER</span>
        <ArrowDown size={14} />
      </motion.div>
    </section>
  );
}