import { useRef } from 'react';
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useReducedMotion,
} from 'framer-motion';
import './Tecverso.css';

const EASE = [0.16, 1, 0.3, 1];

/* External destination — the Tecverso event site. */
const TECVERSO_URL = 'https://www.tecverso.in/';

const PILLARS = ['Workshops', 'Skills', 'Industry perspectives'];

const CTA_LABEL = 'EXPLORE WORKSHOPS';

/* Hover tracking, per glyph, in em. The label opens up by sliding each
   glyph along its own transform rather than by re-tracking the run, so the
   spread never invalidates layout; the label reserves the hovered width
   (--tecverso-cta-track) so the CTA, the rule and the wash keep their box
   and hover costs nothing but compositing. */
const CTA_STEP = 0.04;
const CTA_GLYPHS = Array.from(CTA_LABEL);
const CTA_TRACK = (CTA_GLYPHS.length - 1) * CTA_STEP;

export default function Tecverso() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.2 });
  const reduced = useReducedMotion();

  /* Same quiet watermark drift the FAQ and footer marks use. */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const ghostY = useTransform(scrollYProgress, [0, 1], reduced ? ['0%', '0%'] : ['4%', '-4%']);

  return (
    <section
      className="tecverso vh-section"
      ref={sectionRef}
      id="tecverso"
      aria-labelledby="tecverso-heading"
    >
      {/* Red thread — continues the timeline's left-gutter axis downward
          into this section and terminates on a single marker. */}
      <motion.span
        className="tecverso__thread"
        aria-hidden="true"
        initial={reduced ? false : { scaleY: 0 }}
        animate={isInView && !reduced ? { scaleY: 1 } : {}}
        transition={{ duration: 0.9, ease: EASE }}
      >
        <span className="tecverso__thread-dot" />
      </motion.span>

      {/* Oversized outline mark — the year, whispered, not stated */}
      <motion.span className="tecverso__ghost" style={{ y: ghostY }} aria-hidden="true">
        &apos;26
      </motion.span>

      <div className="tecverso__inner vh-section-inner">
        <div className="tecverso__layout">
          {/* ── WORDMARK SIDE — the anchor, read before it is explained ── */}
          <header className="tecverso__head">
            <motion.p
              className="tecverso__overline"
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, ease: EASE }}
            >
              <span className="tecverso__overline-bar" />
              <span>ALSO HAPPENING</span>
              <span className="tecverso__overline-index">WORKSHOPS</span>
            </motion.p>

            <h2 className="tecverso__heading" id="tecverso-heading">
              <span className="tecverso__heading-mask">
                <motion.span
                  className="tecverso__heading-line"
                  initial={reduced ? false : { y: '110%' }}
                  animate={isInView && !reduced ? { y: '0%' } : {}}
                  transition={{ duration: 0.95, delay: 0.1, ease: EASE }}
                >
                  TECVERSO
                </motion.span>
              </span>
              <span className="tecverso__heading-mask tecverso__heading-mask--year">
                <motion.span
                  className="tecverso__heading-year"
                  initial={reduced ? false : { y: '110%' }}
                  animate={isInView && !reduced ? { y: '0%' } : {}}
                  transition={{ duration: 0.95, delay: 0.2, ease: EASE }}
                >
                  &apos;26
                </motion.span>
              </span>
            </h2>

            <motion.p
              className="tecverso__tagline"
              initial={{ opacity: 0, y: 16 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
            >
              {PILLARS.map((pillar, i) => (
                <span key={pillar} className="tecverso__tagline-part">
                  {i > 0 && <span className="tecverso__tagline-dot" aria-hidden="true" />}
                  {pillar}
                </span>
              ))}
            </motion.p>
          </header>

          {/* ── COPY SIDE — the doorway: brief text, then the threshold ── */}
          <div className="tecverso__aside">
            <motion.p
              className="tecverso__desc"
              initial={{ opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.38, ease: EASE }}
            >
              Take the learning beyond the hackathon. Workshops conducted as part of
              TECVERSO&apos;26 — hands-on sessions, practical knowledge and fresh
              perspectives, on campus.
            </motion.p>

            <motion.div
              className="tecverso__action"
              initial={{ opacity: 0, y: 18 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.46, ease: EASE }}
            >
              <a
                className="tecverso__cta"
                href={TECVERSO_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-cursor="OPEN"
                aria-label={CTA_LABEL}
              >
                <span className="tecverso__cta-wash" aria-hidden="true" />
                <span className="tecverso__cta-rule" aria-hidden="true" />
                <span
                  className="tecverso__cta-text"
                  style={{
                    '--tecverso-cta-step': `${CTA_STEP}em`,
                    '--tecverso-cta-track': CTA_TRACK,
                  }}
                >
                  {CTA_GLYPHS.map((glyph, i) => (
                    <span
                      key={`${glyph}-${i}`}
                      className="tecverso__cta-char"
                      style={{ '--tecverso-cta-char': i }}
                    >
                      {glyph}
                    </span>
                  ))}
                </span>
                <span className="tecverso__cta-arrow" aria-hidden="true">
                  &#8599;
                </span>
              </a>
              <span className="tecverso__cta-host">OPENS TECVERSO.IN IN A NEW TAB</span>
            </motion.div>
          </div>
        </div>

        {/* ── FOOT RULE — a red thread drawn across as the section lands ── */}
        <motion.span
          className="tecverso__foot"
          aria-hidden="true"
          initial={reduced ? false : { scaleX: 0 }}
          animate={isInView && !reduced ? { scaleX: 1 } : {}}
          transition={{ duration: 1.1, delay: 0.4, ease: EASE }}
        />
      </div>
    </section>
  );
}
