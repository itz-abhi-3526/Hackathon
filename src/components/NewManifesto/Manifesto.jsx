import { useRef } from 'react';
import { motion, useScroll, useTransform, useInView, useReducedMotion } from 'framer-motion';
import './Manifesto.css';

export default function Manifesto() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });
  const reduced = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  /* the hero's drained red thread is caught here and continues as a spine */
  const { scrollYProgress: arrival } = useScroll({
    target: sectionRef,
    offset: ['start end', 'start 0.06'],
  });
  const arrivalX = useTransform(arrival, [0, 1], [0, 1], { clamp: true });
  const spineY = useTransform(arrival, [0, 1], [0, 1], { clamp: true });

  const rotateZ = useTransform(scrollYProgress, [0, 1], [3, -3]);
  const xShift = useTransform(scrollYProgress, [0, 1], ['-5%', '5%']);

  return (
    <section className="manifesto vh-section" ref={sectionRef} id="about">
      {/* Emergence — the hero's field hands off into this scene */}
      <motion.span
        className="manifesto__arrival"
        aria-hidden="true"
        style={{ scaleX: reduced ? 1 : arrivalX }}
      />
      <motion.span
        className="manifesto__spine"
        aria-hidden="true"
        style={{ scaleY: reduced ? 1 : spineY }}
      />
      {/* Large rotating background number */}
      <motion.div className="manifesto__bg-number" style={{ rotate: rotateZ, x: xShift }}>
        02
      </motion.div>

      <div className="manifesto__inner vh-section-inner">
        {/* Editorial Layout */}
        <div className="manifesto__grid">
          {/* Left: Statement */}
          <div className="manifesto__statement">
            <motion.div
              className="manifesto__overline"
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="manifesto__overline-bar" />
              <span>THE EVENT</span>
            </motion.div>

            <motion.h2
              className="manifesto__heading"
              initial={{ opacity: 0, y: 40, clipPath: 'inset(0 0 100% 0)' }}
              animate={isInView ? { opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)' } : {}}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            >
              24 HOURS.<br />
              NO PERMISSION.<br />
              <span className="manifesto__heading-red">PURE BUILD.</span>
            </motion.h2>

            <motion.div
              className="manifesto__body"
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <p>
                HACK2PITCH is not a workshop. It is not a seminar. It is a 24-hour
                build sprint where the only thing that matters is what you ship.
                No prior approval. No permission slip. Just your team, your idea,
                and one day to make it real.
              </p>
              <p>
                We bring together the sharpest minds from across India — engineers,
                designers, strategists — to tackle real problems in fintech, health,
                climate, security, education, and logistics. The constraints are
                brutal. The opportunities are enormous.
              </p>
            </motion.div>
          </div>

          {/* Right: Stats + Visual */}
          <div className="manifesto__visual">
            <motion.div
              className="manifesto__stat-block"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="manifesto__stat">
                <span className="manifesto__stat-number">24</span>
                <span className="manifesto__stat-unit">HRS</span>
                <span className="manifesto__stat-desc">OF NON-STOP BUILDING</span>
              </div>
            </motion.div>

            <motion.div
              className="manifesto__stat-block manifesto__stat-block--red"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="manifesto__stat">
                <span className="manifesto__stat-number">6</span>
                <span className="manifesto__stat-unit">TRACKS</span>
                <span className="manifesto__stat-desc">REAL-WORLD PROBLEM STATEMENTS</span>
              </div>
            </motion.div>

            <motion.div
              className="manifesto__stat-block"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={isInView ? { opacity: 1, scale: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="manifesto__stat">
                <span className="manifesto__stat-number">₹50K</span>
                <span className="manifesto__stat-unit">PRIZE</span>
                <span className="manifesto__stat-desc">TOTAL PRIZE POOL</span>
              </div>
            </motion.div>

            {/* Decorative graphic element */}
            <motion.div
              className="manifesto__graphic"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 1.2, delay: 0.5 }}
            >
              <svg viewBox="0 0 200 200" fill="none">
                <rect x="20" y="20" width="160" height="160" stroke="var(--vh-red)" strokeWidth="2" opacity="0.3" />
                <rect x="40" y="40" width="120" height="120" stroke="var(--vh-red)" strokeWidth="1" opacity="0.2" />
                <circle cx="100" cy="100" r="60" stroke="var(--vh-red)" strokeWidth="1" opacity="0.15" />
                <line x1="0" y1="100" x2="200" y2="100" stroke="var(--vh-red)" strokeWidth="1" opacity="0.1" />
                <line x1="100" y1="0" x2="100" y2="200" stroke="var(--vh-red)" strokeWidth="1" opacity="0.1" />
              </svg>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
