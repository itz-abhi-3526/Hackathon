import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import './Experience.css';

const stages = [
  { number: '01', title: 'ARRIVE', desc: 'Walk in. Plug in. Claim your space.' },
  { number: '02', title: 'MEET', desc: 'Find your people. Form your squad.' },
  { number: '03', title: 'REVEAL', desc: 'Official challenges are revealed. Own your angle.' },
  { number: '04', title: 'BUILD', desc: '24 hours. No breaks. Ship it.' },
  { number: '05', title: 'BREAK', desc: 'Hit walls. Break through them.' },
  { number: '06', title: 'ITERATE', desc: 'Feedback. Refine. Push harder.' },
  { number: '07', title: 'SUBMIT', desc: 'Demo day. Show what you built.' },
  { number: '08', title: 'WIN', desc: 'Judges decide. Champions emerge.' },
];

export default function Experience() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.15 });

  return (
    <section className="experience vh-section" ref={sectionRef} id="experience">
      {/* Full-width red banner behind */}
      <div className="experience__banner">
        <div className="experience__banner-inner">
          <span className="experience__banner-text">BUILD</span>
          <span className="experience__banner-text experience__banner-text--outline">BREAK</span>
          <span className="experience__banner-text">CREATE</span>
          <span className="experience__banner-text experience__banner-text--outline">WIN</span>
        </div>
      </div>

      <div className="experience__inner vh-section-inner">
        {/* Header */}
        <div className="experience__header">
          <motion.div
            className="experience__overline"
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="experience__overline-bar" />
            <span>THE HACKATHON EXPERIENCE</span>
          </motion.div>

          <motion.h2
            className="experience__heading"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            WHAT HAPPENS<br />
            <span className="experience__heading-red">IN 24 HOURS</span>
          </motion.h2>
        </div>

        {/* Stages Grid */}
        <div className="experience__stages">
          {stages.map((stage, idx) => (
            <motion.div
              key={stage.number}
              className="experience__stage"
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{
                duration: 0.6,
                delay: 0.2 + idx * 0.06,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <div className="experience__stage-number">{stage.number}</div>
              <div className="experience__stage-content">
                <h3 className="experience__stage-title">{stage.title}</h3>
                <p className="experience__stage-desc">{stage.desc}</p>
              </div>
              {idx < stages.length - 1 && (
                <div className="experience__stage-connector">
                  <svg viewBox="0 0 40 2" fill="none">
                    <line x1="0" y1="1" x2="40" y2="1" stroke="var(--vh-red)" strokeWidth="1" strokeDasharray="4 4" opacity="0.3" />
                  </svg>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
