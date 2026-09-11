import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';

export default function Chapter({ id, children, className = '', minHeight = '100vh' }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-10%' });

  return (
    <section
      id={id}
      ref={ref}
      className={`chapter ${className}`}
      style={{ minHeight }}
    >
      <motion.div
        className="chapter-inner"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.8 }}
      >
        {children}
      </motion.div>
    </section>
  );
}