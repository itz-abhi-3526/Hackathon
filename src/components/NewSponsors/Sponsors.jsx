import { useRef } from 'react';
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useReducedMotion,
} from 'framer-motion';
import { SPONSORS } from '../../data/index.js';
import './Sponsors.css';

const EASE = [0.16, 1, 0.3, 1];

const TIERS = [
  { key: 'title', index: '01', label: 'TITLE PARTNER', sponsors: SPONSORS.title },
  { key: 'poweredBy', index: '02', label: 'POWERED BY', sponsors: SPONSORS.poweredBy },
  { key: 'tech', index: '03', label: 'TECHNOLOGY PARTNERS', sponsors: SPONSORS.tech },
  { key: 'community', index: '04', label: 'COMMUNITY PARTNERS', sponsors: SPONSORS.community },
];

const stagger = (delayChildren = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren } },
});

const revealItem = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: EASE } },
};

export default function Sponsors() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.12 });
  const reduced = useReducedMotion();

  // Subtle parallax for the background watermark.
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const wmY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : ['3%', '-3%']);

  const total = Object.values(SPONSORS).reduce((n, list) => n + list.length, 0);

  return (
    <section className="sponsors vh-section" ref={sectionRef} id="sponsors">
      {/* Background watermark — subtle, moving slowly. */}
      <motion.span className="sponsors__watermark" style={{ y: wmY }} aria-hidden="true">
        HACK2PITCH
      </motion.span>

      {/* Red axis anchor. */}
      <span className="sponsors__spine" aria-hidden="true" />
      <span className="sponsors__spine-end" aria-hidden="true" />

      <div className="sponsors__inner vh-section-inner">
        {/* ── HEADER ── */}
        <motion.p
          className="sponsors__overline"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <span className="sponsors__overline-bar" />
          <span>PARTNERS</span>
        </motion.p>

        <header className="sponsors__head">
          <motion.h2
            className="sponsors__heading"
            variants={stagger(0.15)}
            initial="hidden"
            animate={isInView ? 'show' : 'hidden'}
          >
            <span className="sponsors__heading-line" variants={revealItem}>
              SPONSORS
            </span>
            <span className="sponsors__heading-line" variants={revealItem}>
              <em>&amp;</em> PARTNERS
            </span>
          </motion.h2>

          <motion.div
            className="sponsors__head-meta"
            initial={{ opacity: 0, y: 18 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.3 }}
          >
            <span className="sponsors__head-meta-rule" />
            <span>THE ECOSYSTEM BEHIND THE EVENT</span>
            <span>OCT 10—11 2026</span>
            <span>{`${TIERS.length} TIERS / ${total} PARTNERS`}</span>
            <span>HACK2PITCH 2026</span>
          </motion.div>
        </header>

        {/* ── TIERS ── */}
        <div className="sponsors__tiers">
          {/* TITLE PARTNER — the primary stage */}
          <section className="sponsors__tier sponsors__tier--title">
            <div className="sponsors__tier-head">
              <span className="sponsors__tier-index">{TIERS[0].index}</span>
              <span className="sponsors__tier-label">{TIERS[0].label}</span>
            </div>

            <motion.div
              className="sponsors__title-stage"
              variants={stagger(0.25)}
              initial="hidden"
              animate={isInView ? 'show' : 'hidden'}
            >
              {TIERS[0].sponsors.map((sponsor) => (
                <div key={sponsor.name} className="sponsors__title-host" variants={revealItem}>
                  <div className="sponsors__title-word">
                    {sponsor.name.split(' ').map((word, i) => (
                      <span
                        key={word}
                        className={`sponsors__title-part${i === 1 ? ' sponsors__title-part--red' : ''}`}
                      >
                        {word}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <motion.span className="sponsors__title-mark" variants={revealItem} aria-hidden="true" />
            </motion.div>
          </section>

          {/* POWERED BY — a deliberate pair */}
          <section className="sponsors__tier sponsors__tier--powered">
            <div className="sponsors__tier-head">
              <span className="sponsors__tier-index">{TIERS[1].index}</span>
              <span className="sponsors__tier-label">{TIERS[1].label}</span>
            </div>

            <motion.div
              className="sponsors__powered"
              variants={stagger(0.3)}
              initial="hidden"
              animate={isInView ? 'show' : 'hidden'}
            >
              {TIERS[1].sponsors.map((sponsor) => (
                <div key={sponsor.name} className="sponsors__powered-cell" variants={revealItem}>
                  <span className="sponsors__wordmark sponsors__wordmark--powered">
                    {sponsor.name}
                  </span>
                </div>
              ))}
            </motion.div>
          </section>

          {/* TECHNOLOGY PARTNERS — curated wall */}
          <section className="sponsors__tier sponsors__tier--tech">
            <div className="sponsors__tier-head">
              <span className="sponsors__tier-index">{TIERS[2].index}</span>
              <span className="sponsors__tier-label">{TIERS[2].label}</span>
            </div>

            <motion.div
              className="sponsors__wall"
              variants={stagger(0.35)}
              initial="hidden"
              animate={isInView ? 'show' : 'hidden'}
            >
              {TIERS[2].sponsors.map((sponsor) => (
                <div key={sponsor.name} className="sponsors__wall-cell" variants={revealItem}>
                  <span className="sponsors__wordmark sponsors__wordmark--tech">
                    {sponsor.name}
                  </span>
                </div>
              ))}
            </motion.div>
          </section>

          {/* COMMUNITY PARTNERS — the collective strip */}
          <section className="sponsors__tier sponsors__tier--community">
            <div className="sponsors__tier-head">
              <span className="sponsors__tier-index">{TIERS[3].index}</span>
              <span className="sponsors__tier-label">{TIERS[3].label}</span>
            </div>

            <motion.div
              className="sponsors__collective"
              variants={stagger(0.4)}
              initial="hidden"
              animate={isInView ? 'show' : 'hidden'}
            >
              {TIERS[3].sponsors.map((sponsor) => (
                <div key={sponsor.name} className="sponsors__collective-cell" variants={revealItem}>
                  <span className="sponsors__wordmark sponsors__wordmark--community">
                    {sponsor.name}
                  </span>
                </div>
              ))}
            </motion.div>
          </section>
        </div>
      </div>

      {/* End fade into the next section. */}
      <span className="sponsors__out" aria-hidden="true" />
    </section>
  );
}