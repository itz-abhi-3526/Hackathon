import { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import { TIMELINE } from '../../data';
import './Timeline.css';

export default function Timeline() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-200px' });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const progressWidth = useTransform(scrollYProgress, [0.1, 0.7], ['0%', '100%']);

  return (
    <section ref={sectionRef} className="timeline" id="timeline">
      <div className="timeline-inner">
        <motion.div
          className="timeline-label"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="timeline-number">04</span>
          <span className="timeline-label-divider">/</span>
          <span className="timeline-label-text">THE RACE</span>
        </motion.div>

        <motion.h2
          className="timeline-title"
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          FROM REGISTRATION
          <span className="timeline-title-red"> TO VICTORY</span>
        </motion.h2>

        <div className="timeline-track">
          <motion.div
            className="timeline-progress"
            style={{ width: progressWidth }}
          />
          {TIMELINE.map((event, i) => (
            <motion.div
              key={event.id}
              className="timeline-node-wrap"
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.2 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={`timeline-node ${event.status === 'active' ? 'timeline-node--active' : ''}`}>
                <div className="timeline-node-dot">
                  <span />
                </div>
                <div className="timeline-node-content">
                  <span className="timeline-node-phase">{event.phase}</span>
                  <span className="timeline-node-label">{event.label}</span>
                  <span className="timeline-node-date">{event.date}</span>
                  <span className="timeline-node-desc">{event.description}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}