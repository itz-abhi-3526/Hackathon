import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import './Footer.css';

const COLUMNS = [
  {
    index: '01',
    label: 'EVENT',
    links: [
      { label: 'ABOUT', href: '#about' },
      { label: 'PROBLEMS', href: '#problems' },
      { label: 'TIMELINE', href: '#timeline' },
      { label: 'PRIZES', href: '#prizes' },
    ],
  },
  {
    index: '02',
    label: 'PEOPLE',
    links: [
      { label: 'JUDGES', href: '#judges' },
      { label: 'MENTORS', href: '#mentors' },
      { label: 'SPONSORS', href: '#sponsors' },
    ],
  },
  {
    index: '03',
    label: 'INFO',
    links: [
      { label: 'FAQ', href: '#faq' },
      { label: 'REGISTER', href: '#register', featured: true },
      { label: 'ADMIN', href: '#admin' },
    ],
  },
];

function FootGroup({ group, progress }) {
  const headY = useTransform(progress, [0.1, 0.45], [30, 0]);
  const headO = useTransform(progress, [0.1, 0.35], [0, 1]);
  const linkY = useTransform(progress, [0.24, 0.58], [24, 0]);
  const linkO = useTransform(progress, [0.24, 0.52], [0, 1]);

  return (
    <div className="foot__col">
      <motion.div className="foot__col-head" style={{ y: headY, opacity: headO }}>
        <span className="foot__col-index">{group.index}</span>
        <span className="foot__col-label">{group.label}</span>
      </motion.div>
      <motion.nav className="foot__col-links" style={{ y: linkY, opacity: linkO }}>
        {group.links.map((link) => (
          <a
            key={link.label}
            href={link.href}
            className={`foot__link${link.featured ? ' foot__link--featured' : ''}`}
          >
            <span className="foot__link-label">{link.label}</span>
            <span className="foot__link-arrow" aria-hidden="true">→</span>
          </a>
        ))}
      </motion.nav>
    </div>
  );
}

export default function Footer({ progress }) {
  const ref = useRef(null);

  // Standalone fallback if the footer is rendered outside FinalSequence.
  const own = useScroll({ target: ref, offset: ['start end', 'end end'] });
  const p = progress ?? own.scrollYProgress;

  // Background typography settles gently — residual inertia, never dominant.
  const ghostY = useTransform(p, [0, 1], [120, 0]);
  const ghostX = useTransform(p, [0, 1], [0, -30]);
  const ghostS = useTransform(p, [0, 1], [1.06, 1]);
  const ghostO = useTransform(p, [0.08, 0.28], [0, 1]);

  // Brand lands first — one hero at a time. Nav staggers, credits arrive last.
  const brandY = useTransform(p, [0, 0.4], [56, 0]);
  const brandO = useTransform(p, [0, 0.28], [0, 1]);
  const creditY = useTransform(p, [0.42, 0.78], [22, 0]);
  const creditO = useTransform(p, [0.42, 0.72], [0, 1]);

  // The thin red rule appears only as the footer becomes the scene.
  const toplineO = useTransform(p, [0, 0.06], [0, 1]);

  return (
    <footer className="foot" ref={ref}>
      <motion.span className="foot__topline" aria-hidden="true" style={{ opacity: toplineO }} />

      <motion.span
        className="foot__ghost"
        aria-hidden="true"
        style={{ y: ghostY, x: ghostX, scale: ghostS, opacity: ghostO }}
      >
        VOIDHACK
      </motion.span>

      <div className="foot__inner">
        <motion.div className="foot__brand" style={{ y: brandY, opacity: brandO }}>
          <p className="foot__brand-name">
            VOIDHACK <span className="foot__brand-year">2026</span>
          </p>
          <p className="foot__brand-tag">BUILD WITHOUT PERMISSION.</p>
        </motion.div>

        <nav className="foot__nav">
          {COLUMNS.map((group) => (
            <FootGroup key={group.index} group={group} progress={p} />
          ))}
        </nav>

        <motion.div className="foot__credits" style={{ y: creditY, opacity: creditO }}>
          <span className="foot__credit">PRESENTED BY NEXUS INSTITUTE OF TECHNOLOGY</span>
          <span className="foot__credit">© 2026 VOIDHACK. ALL RIGHTS RESERVED.</span>
          <span className="foot__credit foot__credit--mark">VOID / HACK — 2026</span>
        </motion.div>
      </div>
    </footer>
  );
}