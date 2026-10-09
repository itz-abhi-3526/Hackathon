import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import './GuidelinesPreview.css';

const EASE = [0.16, 1, 0.3, 1];

/* Compact editorial summary. The complete document lives at /guidelines;
   these three entries are only the promise of it. */
const PREVIEW = [
  {
    index: '01',
    title: 'REGISTRATION',
    points: [
      'Registration begins at 12:00 PM on October 10.',
      'Arrive on time. Late entry will not be entertained.',
    ],
  },
  {
    index: '02',
    title: 'COME PREPARED',
    points: [
      'Every participant must bring a laptop.',
      'Bring personal essentials for the 24-hour event.',
    ],
  },
  {
    index: '03',
    title: 'BUILD IT YOURSELF',
    points: [
      'Build your solution during the hackathon.',
      'Original work and the official problem statements are mandatory.',
    ],
  },
];

export default function GuidelinesPreview() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  return (
    <section
      className="guide-teaser vh-section"
      ref={sectionRef}
      id="guidelines"
      aria-labelledby="guide-teaser-heading"
    >
      <div className="guide-teaser__inner vh-section-inner">
        <div className="guide-teaser__layout">
          {/* ── COPY SIDE — the call to attention ── */}
          <header className="guide-teaser__head">
            <motion.p
              className="guide-teaser__overline"
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <span className="guide-teaser__overline-bar" />
              <span>BEFORE YOU ARRIVE</span>
            </motion.p>

            <motion.h2
              className="guide-teaser__heading"
              id="guide-teaser-heading"
              initial={{ opacity: 0, y: 26 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.08, ease: EASE }}
            >
              KNOW THE
              <br />
              <span className="guide-teaser__heading-accent">RULES.</span>
            </motion.h2>

            <motion.p
              className="guide-teaser__lede"
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.18, ease: EASE }}
            >
              Everything you need to know before stepping into HACK2PITCH 2026.
              Review the event schedule, participant guidelines and hackathon
              criteria before arriving on campus.
            </motion.p>

            <motion.a
              className="guide-teaser__cta"
              href="/guidelines"
              data-cursor="READ"
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.26, ease: EASE }}
            >
              <span className="guide-teaser__cta-text">READ ALL GUIDELINES</span>
              <span className="guide-teaser__cta-arrow" aria-hidden="true">
                &#8599;
              </span>
            </motion.a>
          </header>

          {/* ── ITEMS SIDE — three telegraphic entry points ── */}
          <ol className="guide-teaser__items">
            {PREVIEW.map((item, i) => (
              <motion.li
                className="guide-teaser__item"
                key={item.index}
                initial={{ opacity: 0, y: 18 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.65, delay: 0.18 + i * 0.08, ease: EASE }}
              >
                <span className="guide-teaser__item-index" aria-hidden="true">
                  {item.index}
                </span>
                <div className="guide-teaser__item-body">
                  <h3 className="guide-teaser__item-title">{item.title}</h3>
                  <ul className="guide-teaser__item-points">
                    {item.points.map((point) => (
                      <li className="guide-teaser__item-point" key={point}>
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
