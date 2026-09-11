import { useRef } from 'react';
import { useScroll, useTransform, useReducedMotion } from 'framer-motion';
import FinalCTA from './FinalCTA';
import Footer from '../NewFooter/Footer';
import './FinalSequence.css';

export default function FinalSequence({ onRegister }) {
  const ref = useRef(null);
  const reduced = useReducedMotion();

  // ONE scroll timeline spanning CTA + footer.
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end end'],
  });

  // Sequential, non-overlapping phases:
  //   0.00–0.30  CTA dominant (idle)
  //   0.30–0.60  CTA resolves and leaves the scene
  //   0.60→      footer begins — only after the CTA has visually cleared
  const ctaExit = useTransform(scrollYProgress, reduced ? [0.42, 0.7] : [0.3, 0.6], [0, 1]);
  const footerIn = useTransform(scrollYProgress, reduced ? [0.5, 0.95] : [0.62, 1], [0, 1]);

  return (
    <div className="vseq" ref={ref}>
      <FinalCTA onRegister={onRegister} progress={ctaExit} />
      <Footer progress={footerIn} />
    </div>
  );
}