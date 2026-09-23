import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import Judges from '../NewJudges/Judges.jsx';
import Mentors from '../NewMentors/Mentors.jsx';
import Sponsors from '../NewSponsors/Sponsors.jsx';
import { JUDGES, MENTORS, SPONSORS } from '../../data/index.js';
import './People.css';

const EASE = [0.16, 1, 0.3, 1];

const PARTNER_TIERS = [
  { key: 'title', index: '01', label: 'TITLE PARTNER', sponsors: SPONSORS.title },
  { key: 'poweredBy', index: '02', label: 'POWERED BY', sponsors: SPONSORS.poweredBy },
  { key: 'tech', index: '03', label: 'TECHNOLOGY PARTNERS', sponsors: SPONSORS.tech },
  { key: 'community', index: '04', label: 'COMMUNITY PARTNERS', sponsors: SPONSORS.community },
];

const TABS = [
  { key: 'judges', label: 'JUDGES', count: String(JUDGES.length).padStart(2, '0') },
  { key: 'mentors', label: 'MENTORS', count: String(MENTORS.length).padStart(2, '0') },
  {
    key: 'sponsors',
    label: 'PARTNERS',
    count: String(PARTNER_TIERS.reduce((n, t) => n + t.sponsors.length, 0)).padStart(2, '0'),
  },
];

/* ═══════════════════════════════════════════════════════════════
   PEOPLE — the connected People stage.
   Desktop (>=1024px): the three editorial sections keep their own
   identities (JUDGES / MENTORS / SPONSORS), in original order.
   Mobile / tablet (<1024px): a single People stage — tappable
   category rail with an animated selection and horizontal snap
   carousels per category.
   ═══════════════════════════════════════════════════════════════ */

export default function People() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [active, setActive] = useState('judges');
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.1 });

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const mqR = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setIsDesktop(mq.matches);
      setReduced(mqR.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    mqR.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      mqR.removeEventListener('change', sync);
    };
  }, []);

  /* Scrollspy: as each rail crosses the center band, the tab
     selection animates to match. Pure observation — no layout cost. */
  useEffect(() => {
    if (isDesktop) return undefined;
    const groups = TABS.map((t) => document.getElementById(t.key)).filter(Boolean);
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-36% 0px -58% 0px', threshold: 0 }
    );
    groups.forEach((g) => io.observe(g));
    return () => io.disconnect();
  }, [isDesktop]);

  const jumpTo = (key) => {
    setActive(key);
    const el = document.getElementById(key);
    if (el) {
      el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    }
  };

  if (isDesktop) {
    return (
      <>
        <Judges />
        <Mentors />
        <Sponsors />
      </>
    );
  }

  return (
    <section
      className="people vh-section"
      ref={sectionRef}
      id="people"
    >
      <span className="people__spine" aria-hidden="true" />

      <div className="people__inner vh-section-inner">
        <header className="people__head">
          <motion.p
            className="people__overline"
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="people__overline-bar" />
            <span>THE PEOPLE</span>
          </motion.p>

          <motion.h2
            className="people__heading"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          >
            THE<br />
            <span className="people__heading-accent">PEOPLE</span>
          </motion.h2>

          <motion.p
            className="people__desc"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.25, ease: EASE }}
          >
            The panel, the mentors and the ecosystem standing behind
            HACK2PITCH. Tap a category — then swipe each roll.
          </motion.p>
        </header>

        <nav className="people__tabs" aria-label="People index">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`people__tab ${active === t.key ? 'people__tab--on' : ''}`}
              onClick={() => jumpTo(t.key)}
              aria-pressed={active === t.key}
            >
              {active === t.key && (
                <motion.span
                  className="people__tab-pill"
                  layoutId="people-tab-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="people__tab-label">{t.label}</span>
              <span className="people__tab-count">{t.count}</span>
            </button>
          ))}
        </nav>

        <div className="people__groups">
          {/* ── JUDGES ── */}
          <section id="judges" className="people__group">
            <div className="people__group-head">
              <span className="people__group-index">01</span>
              <span className="people__group-label">JUDGING PANEL</span>
              <span className="people__group-meta">{String(JUDGES.length).padStart(2, '0')} PANELISTS · SWIPE</span>
            </div>

            <div className="people__rail">
              {JUDGES.map((judge, idx) => (
                <motion.article
                  className="people__card"
                  key={judge.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.6, delay: idx * 0.07, ease: EASE }}
                >
                  <div className="people__portrait">
                    <span className="people__portrait-initial">{judge.initial}</span>
                    <span className="people__portrait-accent" aria-hidden="true" />
                  </div>
                  <div className="people__info">
                    <h3 className="people__name">{judge.name}</h3>
                    <span className="people__role">{judge.role}</span>
                    <span className="people__company">{judge.company}</span>
                    <span className="people__domain">{judge.domain}</span>
                  </div>
                </motion.article>
              ))}
            </div>
          </section>

          {/* ── MENTORS ── */}
          <section id="mentors" className="people__group">
            <div className="people__group-head">
              <span className="people__group-index">02</span>
              <span className="people__group-label">GUIDANCE</span>
              <span className="people__group-meta">{String(MENTORS.length).padStart(2, '0')} MENTORS · SWIPE</span>
            </div>

            <div className="people__rail">
              {MENTORS.map((mentor, idx) => (
                <motion.article
                  className="people__card"
                  key={mentor.id}
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-60px' }}
                  transition={{ duration: 0.6, delay: idx * 0.07, ease: EASE }}
                >
                  <div className="people__portrait people__portrait--mentor">
                    <span className="people__portrait-initial">{mentor.name.charAt(0)}</span>
                    <span className="people__portrait-accent" aria-hidden="true" />
                  </div>
                  <div className="people__info">
                    <h3 className="people__name">{mentor.name}</h3>
                    <span className="people__role">{mentor.role}</span>
                    <span className="people__company">{mentor.company}</span>
                    <span className="people__domain">{mentor.domain}</span>
                  </div>
                </motion.article>
              ))}
            </div>
          </section>

          {/* ── PARTNERS ── */}
          <section id="sponsors" className="people__group">
            <div className="people__group-head">
              <span className="people__group-index">03</span>
              <span className="people__group-label">PARTNERS &amp; ECOSYSTEM</span>
              <span className="people__group-meta">{String(PARTNER_TIERS.length).padStart(2, '0')} TIERS · SWIPE</span>
            </div>

            <div className="people__tiers">
              {PARTNER_TIERS.map((tier) => (
                <div className="people__tier" key={tier.key}>
                  <div className="people__tier-head">
                    <span className="people__tier-index">{tier.index}</span>
                    <span className="people__tier-label">{tier.label}</span>
                    <span className="people__tier-count">{String(tier.sponsors.length).padStart(2, '0')}</span>
                  </div>
                  <div className="people__rail people__rail--chips">
                    {tier.sponsors.map((s, idx) => (
                      <motion.span
                        className="people__chip"
                        key={s.name}
                        initial={{ opacity: 0, y: 16 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-50px' }}
                        transition={{ duration: 0.5, delay: idx * 0.05, ease: EASE }}
                      >
                        {s.name}
                      </motion.span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </section>
  );
}