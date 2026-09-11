import { useRef, useState } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import './FinalCTA.css';

export default function FinalCTA({ onRegister }) {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'center center'],
  });

  const [hovered, setHovered] = useState(false);

  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1]);
  const letterSpacing = useTransform(scrollYProgress, [0, 1], ['0.3em', '0.05em']);

  return (
    <section ref={sectionRef} className="final-cta">
      <div className="final-cta-grid-overlay" />

      <motion.div
        className="final-cta-content"
        style={{ scale }}
      >
        <motion.span
          className="final-cta-label"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          // 09 / THE INVITATION
        </motion.span>

        <div className="final-cta-lines">
          <motion.div
            className="final-cta-line"
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ letterSpacing }}
          >
            YOUR
          </motion.div>
          <motion.div
            className="final-cta-line"
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            style={{ letterSpacing }}
          >
            IDEA IS STILL
          </motion.div>
          <motion.div
            className="final-cta-line final-cta-line--red"
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
            style={{ letterSpacing }}
          >
            UNBUILT.
          </motion.div>
        </div>

        <motion.div
          className="final-cta-sub"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
        >
          <span className="final-cta-sub-label">STATUS</span>
          <span className="final-cta-sub-value">
            <span className="final-cta-sub-dot" />
            REGISTRATIONS OPEN
          </span>
        </motion.div>

        <motion.button
          className="final-cta-button"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onClick={onRegister}
          data-cursor="INITIALIZE"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.7 }}
        >
          <span className="final-cta-button-label">
            {hovered ? 'ACCESS GRANTED' : 'INITIALIZE REGISTRATION'}
          </span>
          <motion.span
            className="final-cta-button-arrow"
            animate={{ x: hovered ? 4 : 0 }}
          >
            &rarr;
          </motion.span>
        </motion.button>
      </motion.div>
    </section>
  );
}