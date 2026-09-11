import { useRef, useEffect, useState } from 'react';
import { motion, useInView } from 'framer-motion';
import { PRIZES } from '../../data';
import './Prizes.css';

function useCountUp(target, inView) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 1500;
    const start = performance.now();
    const numeric = parseInt(target.replace(/,/g, ''), 10);

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.floor(eased * numeric));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, target]);

  return value.toLocaleString('en-IN');
}

export default function Prizes() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, margin: '-100px' });
  const grand = useCountUp(PRIZES.grand.amount, isInView);
  const runner = useCountUp(PRIZES.runner.amount, isInView);
  const third = useCountUp(PRIZES.third.amount, isInView);

  return (
    <section ref={sectionRef} className="prizes" id="prizes">
      <div className="prizes-inner">
        <motion.div
          className="prizes-label"
          initial={{ opacity: 0, x: -20 }}
          animate={isInView ? { opacity: 1, x: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <span className="prizes-number">05</span>
          <span className="prizes-label-divider">/</span>
          <span className="prizes-label-text">THE STAKES</span>
        </motion.div>

        <motion.h2
          className="prizes-title"
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          WHAT'S ON
          <span className="prizes-title-red"> THE LINE</span>
        </motion.h2>

        <div className="prizes-grid">
          <motion.div
            className="prize-grand"
            initial={{ opacity: 0, y: 40 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="prize-grand-top">
              <span className="prize-grand-tag">// PRIMARY</span>
              <span className="prize-grand-cash">INR</span>
            </div>
            <div className="prize-grand-amount">
              <span className="prize-rupee">₹</span>
              {grand}
            </div>
            <div className="prize-grand-divider" />
            <div className="prize-grand-bottom">
              <span className="prize-grand-label">{PRIZES.grand.label}</span>
              <span className="prize-grand-sublabel">{PRIZES.grand.sublabel}</span>
            </div>
          </motion.div>

          <div className="prizes-secondary">
            <motion.div
              className="prize-secondary"
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <div className="prize-secondary-top">
                <span>// 02</span>
                <span>INR</span>
              </div>
              <div className="prize-secondary-amount">
                <span className="prize-rupee">₹</span>
                {runner}
              </div>
              <div className="prize-secondary-label">{PRIZES.runner.label}</div>
            </motion.div>

            <motion.div
              className="prize-secondary"
              initial={{ opacity: 0, x: 20 }}
              animate={isInView ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <div className="prize-secondary-top">
                <span>// 03</span>
                <span>INR</span>
              </div>
              <div className="prize-secondary-amount">
                <span className="prize-rupee">₹</span>
                {third}
              </div>
              <div className="prize-secondary-label">{PRIZES.third.label}</div>
            </motion.div>
          </div>
        </div>

        <div className="prizes-special">
          {PRIZES.special.map((prize, i) => (
            <motion.div
              key={prize.label}
              className="prize-special"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.6 + i * 0.1 }}
            >
              <span className="prize-special-amount">₹{prize.amount}</span>
              <span className="prize-special-label">{prize.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}