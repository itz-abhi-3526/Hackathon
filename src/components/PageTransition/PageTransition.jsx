import { motion } from 'framer-motion';
import './PageTransition.css';

export default function PageTransition({ children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function RedSignalSweep({ trigger }) {
  return (
    <motion.div
      key={trigger}
      className="red-signal-sweep"
      animate={{ scaleX: [0, 1, 0], opacity: [0, 1, 0] }}
      transition={{ duration: 0.7, ease: [0.76, 0, 0.24, 1] }}
      initial={{ scaleX: 0, opacity: 0 }}
    />
  );
}