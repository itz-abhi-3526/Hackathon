import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { MENTORS } from '../../data/index.js';
import './Mentors.css';

export default function Mentors() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  return (
    <section className="mentors vh-section" ref={sectionRef} id="mentors">
      {/* Diagonal red stripe background */}
      <div className="mentors__bg-stripe" />

      <div className="mentors__inner vh-section-inner">
        <div className="mentors__header">
          <motion.div
            className="mentors__overline"
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6 }}
          >
            <span className="mentors__overline-bar" />
            <span>GUIDANCE</span>
          </motion.div>

          <motion.h2
            className="mentors__heading"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1 }}
          >
            YOUR<br />
            <span className="mentors__heading-accent">MENTORS</span>
          </motion.h2>
        </div>

        {/* Mentors as horizontal list - different from judges grid */}
        <div className="mentors__list">
          {MENTORS.map((mentor, idx) => (
            <motion.div
              key={mentor.id}
              className="mentors__item"
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{
                duration: 0.6,
                delay: 0.2 + idx * 0.08,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <div className="mentors__item-left">
                <div className="mentors__avatar">
                  <span className="mentors__avatar-letter">{mentor.name.charAt(0)}</span>
                </div>
                <div className="mentors__item-info">
                  <h3 className="mentors__name">{mentor.name}</h3>
                  <span className="mentors__role">{mentor.role}</span>
                </div>
              </div>
              <div className="mentors__item-right">
                <span className="mentors__company">{mentor.company}</span>
                <span className="mentors__domain">{mentor.domain}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
