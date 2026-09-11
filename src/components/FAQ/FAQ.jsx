import { useRef, useState } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { Plus } from 'lucide-react';
import { FAQ_DATA } from '../../data';
import './FAQ.css';

export default function FAQ() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });
  const [openIndex, setOpenIndex] = useState(null);

  return (
    <section ref={sectionRef} className="faq" id="faq">
      <div className="faq-inner">
        <motion.div
          className="faq-label"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="faq-number">08</span>
          <span className="faq-label-divider">/</span>
          <span className="faq-label-text">BEFORE YOU ASK</span>
        </motion.div>

        <motion.h2
          className="faq-title"
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          FREQUENTLY
          <span className="faq-title-red"> ASKED</span>
        </motion.h2>

        <div className="faq-list">
          {FAQ_DATA.map((item, i) => (
            <motion.div
              key={item.id}
              className={`faq-item ${openIndex === i ? 'faq-item--open' : ''}`}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.04 }}
            >
              <button
                className="faq-question"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                aria-expanded={openIndex === i}
                data-cursor="ANSWER"
              >
                <span className="faq-question-number">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className="faq-question-text">{item.question}</span>
                <motion.span
                  className="faq-question-icon"
                  animate={{ rotate: openIndex === i ? 45 : 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <Plus size={18} />
                </motion.span>
              </button>

              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    className="faq-answer"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="faq-answer-inner">
                      <p>{item.answer}</p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}