import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { JUDGES } from '../../data/index.js';
import './Judges.css';

export default function Judges() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  return (
    <section className="judges vh-section" ref={sectionRef} id="judges">
      <div className="judges__inner vh-section-inner">
        <div className="judges__layout">
          {/* Left: heading */}
          <div className="judges__left">
            <motion.div
              className="judges__overline"
              initial={{ opacity: 0, x: -20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6 }}
            >
              <span className="judges__overline-bar" />
              <span>JUDGING PANEL</span>
            </motion.div>

            <motion.h2
              className="judges__heading"
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              THE<br />
              <span className="judges__heading-accent">JUDGES</span>
            </motion.h2>

            <motion.p
              className="judges__desc"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.7, delay: 0.3 }}
            >
              Industry leaders who will evaluate your solutions on innovation,
              technical execution, and real-world impact.
            </motion.p>
          </div>

          {/* Right: Judges grid */}
          <div className="judges__grid">
            {JUDGES.map((judge, idx) => (
              <motion.div
                key={judge.id}
                className="judges__card"
                initial={{ opacity: 0, y: 30 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{
                  duration: 0.6,
                  delay: 0.3 + idx * 0.1,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                {/* Portrait placeholder - large initial */}
                <div className="judges__portrait">
                  <span className="judges__portrait-initial">{judge.initial}</span>
                  <div className="judges__portrait-accent" />
                </div>

                <div className="judges__info">
                  <h3 className="judges__name">{judge.name}</h3>
                  <span className="judges__role">{judge.role}</span>
                  <span className="judges__company">{judge.company}</span>
                  <span className="judges__domain">{judge.domain}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
