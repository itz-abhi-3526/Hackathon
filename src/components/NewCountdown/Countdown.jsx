import { useRef } from 'react';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import './Countdown.css';

export default function Countdown() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.3 });

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const bgScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.95, 1, 1.05]);

  const prizes = [
    { rank: '01', amount: '₹25,000', place: '1ST PLACE' },
    { rank: '02', amount: '₹15,000', place: '2ND PLACE' },
    { rank: '03', amount: '₹10,000', place: '3RD PLACE' },
  ];

  return (
    <section className="countdown prizepool vh-section" ref={sectionRef} id="countdown">
      <motion.div className="countdown__bg" style={{ scale: bgScale }}>
        <div className="countdown__bg-red" />
        <span className="countdown__bg-grid" aria-hidden="true" />
        <span className="countdown__bg-scan" aria-hidden="true" />
      </motion.div>

      <div className="countdown__inner vh-section-inner">
        <motion.div
          className="countdown__content"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ duration: 1 }}
        >
          <motion.header
            className="countdown__head"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <span className="countdown__head-label">REWARD PROTOCOL // PRIZE POOL</span>
            <span className="countdown__head-sys">
              <i aria-hidden="true" />
              ₹50K AVAILABLE
            </span>
          </motion.header>

          <motion.div
            className="countdown__panel prizepool__panel"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.65, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="countdown__frame" aria-hidden="true" />
            <span className="countdown__grid" aria-hidden="true" />
            <span className="countdown__scan" aria-hidden="true" />

            <motion.div
              className="prizepool__total"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="prizepool__total-label">PRIZE POOL</span>
              <motion.span
                className="prizepool__total-amount"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ duration: 0.9, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                ₹50,000
              </motion.span>
            </motion.div>

            <div className="prizepool__divider" aria-hidden="true" />

            <motion.div
              className="prizepool__list"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 0.8, delay: 0.5 }}
            >
              {prizes.map((p, i) => (
                <motion.div
                  key={p.rank}
                  className="prizepool__item"
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.7, delay: 0.55 + i * 0.1, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="prizepool__rank">{p.rank}</span>
                  <span className="prizepool__amount">{p.amount}</span>
                  <span className="prizepool__place">{p.place}</span>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}