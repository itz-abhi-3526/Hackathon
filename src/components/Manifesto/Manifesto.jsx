import { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import './Manifesto.css';

const manifestoLines = [
  { text: 'THE NEXT BIG IDEA', highlight: false },
  { text: "DOESN'T ARRIVE", highlight: false },
  { text: 'FULLY FORMED.', highlight: true },
];

const supportingText = "It begins as a rough conviction — an irrational belief that something broken can be rebuilt, that something missing can be created. HACK2PITCH exists for the people who don't wait for permission to build the future. This is 48 hours of unfiltered creation, where the only barrier is your own ambition.";

export default function Manifesto() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  const lineWidth = useTransform(scrollYProgress, [0.1, 0.4], ['0%', '100%']);

  return (
    <section ref={sectionRef} className="manifesto" id="about">
      <div className="manifesto-inner">
        <motion.div
          className="manifesto-label"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="manifesto-number">01</span>
          <span className="manifesto-label-divider">/</span>
          <span className="manifesto-label-text">WHY THIS EXISTS</span>
        </motion.div>

        <motion.div
          className="manifesto-line"
          style={{ width: lineWidth }}
        />

        <div className="manifesto-statement">
          {manifestoLines.map((line, i) => (
            <motion.div
              key={i}
              className={`manifesto-line-text ${line.highlight ? 'manifesto-line-text--red' : ''}`}
              initial={{ opacity: 0, y: 40, x: i * 20 }}
              animate={isInView ? { opacity: 1, y: 0, x: 0 } : {}}
              transition={{
                duration: 0.7,
                delay: 0.2 + i * 0.15,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {line.text}
            </motion.div>
          ))}
        </div>

        <motion.div
          className="manifesto-body"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
        >
          <p>{supportingText}</p>
        </motion.div>

        <motion.div
          className="manifesto-stats"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 1 }}
        >
          <div className="manifesto-stat">
            <span className="manifesto-stat-value">48</span>
            <span className="manifesto-stat-unit">HRS</span>
            <span className="manifesto-stat-label">OF HACKING</span>
          </div>
          <div className="manifesto-stat-divider" />
          <div className="manifesto-stat">
            <span className="manifesto-stat-value">6</span>
            <span className="manifesto-stat-unit">PROBLEMS</span>
            <span className="manifesto-stat-label">TO SOLVE</span>
          </div>
          <div className="manifesto-stat-divider" />
          <div className="manifesto-stat">
            <span className="manifesto-stat-value">₹1L</span>
            <span className="manifesto-stat-unit">IN PRIZES</span>
            <span className="manifesto-stat-label">UP FOR GRABS</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
