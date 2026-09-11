import { useState, useRef } from 'react';
import {
  motion,
  AnimatePresence,
  useInView,
  useScroll,
  useTransform,
  useReducedMotion,
} from 'framer-motion';
import { FAQ_DATA } from '../../data/index.js';
import './FAQ.css';

const EASE = [0.16, 1, 0.3, 1];

export default function FAQ() {
  const [openId, setOpenId] = useState(null);
  const sectionRef = useRef(null);
  const reduced = useReducedMotion();

  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  // Section scroll progress — drives the watermark drift and the red
  // crescendo near the section's end (the handoff to the registration CTA).
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const wmY = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : ['2%', '-2%']);

  // Tail crescendo: the final line extends, then a red sliver rises into
  // view — a red footprint sized to the CTA's field so the sections hand off.
  const tailScale = useTransform(scrollYProgress, reduced ? [0, 1] : [0.52, 0.86], [0.2, 1]);
  const tailLineO = useTransform(scrollYProgress, reduced ? [0, 1] : [0.52, 0.68], [0, 1]);
  const tailY = useTransform(scrollYProgress, reduced ? [0, 1] : [0.52, 0.84], ['101%', '0%']);
  const tailO = useTransform(scrollYProgress, reduced ? [0, 1] : [0.54, 0.64], [0, 1]);

  const toggle = (id) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <section className="faq vh-section" ref={sectionRef} id="faq" aria-labelledby="faq-heading">
      {/* Faint oversized mark — same language as sponsors/footer, medium scale. */}
      <motion.span className="faq__watermark" style={{ y: wmY }} aria-hidden="true">
        VOIDHACK
      </motion.span>

      {/* Left red axis — continues the sponsors spine down the page. */}
      <span className="faq__spine" aria-hidden="true" />

      <div className="faq__inner vh-section-inner">
        <div className="faq__layout">
          {/* ── Heading column ── */}
          <header className="faq__left">
            <motion.p
              className="faq__overline"
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6 }}
            >
              <span className="faq__overline-bar" />
              <span>INFORMATION</span>
            </motion.p>

            <motion.h2
              className="faq__heading"
              id="faq-heading"
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.08, ease: EASE }}
            >
              FREQUENTLY
              <span className="faq__heading-accent">ASKED</span>
            </motion.h2>

            <motion.div
              className="faq__axis"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 0.7, delay: 0.35 }}
            >
              <span className="faq__axis-rule" aria-hidden="true" />
              <span className="faq__axis-note">EVERYTHING YOU NEED TO KNOW</span>
            </motion.div>
          </header>

          {/* ── Question column ── */}
          <div className="faq__list">
            {FAQ_DATA.map((item, idx) => {
              const isOpen = openId === item.id;
              const isLast = idx === FAQ_DATA.length - 1;
              return (
                <motion.div
                  key={item.id}
                  className={`faq__item${isOpen ? ' faq__item--open' : ''}${
                    isLast ? ' faq__item--last' : ''
                  }`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5, delay: 0.16 + idx * 0.05, ease: EASE }}
                >
                  <button
                    className="faq__question"
                    onClick={() => toggle(item.id)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-answer-${item.id}`}
                  >
                    <span className="faq__question-number">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="faq__question-text">{item.question}</span>
                    <span className="faq__question-icon" aria-hidden="true" />
                  </button>

                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        id={`faq-answer-${item.id}`}
                        className="faq__answer"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{
                          height: { duration: 0.42, ease: EASE },
                          opacity: { duration: 0.3 },
                        }}
                      >
                        <div className="faq__answer-inner">
                          <p>{item.answer}</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <motion.span
                    className={`faq__item-line${isLast ? ' faq__item-line--last' : ''}`}
                    aria-hidden="true"
                    style={isLast && !reduced ? { scaleX: tailScale, opacity: tailLineO } : undefined}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── RED CRESCENDO — handoff toward the registration CTA ── */}
      {!reduced && (
        <div className="faq__tail" aria-hidden="true">
          <motion.span className="faq__tail-field" style={{ y: tailY, opacity: tailO }} />
        </div>
      )}
    </section>
  );
}