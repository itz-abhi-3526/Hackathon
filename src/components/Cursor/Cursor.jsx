import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Cursor.css';

export default function VoidCursor() {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  const [mode, setMode] = useState('idle');
  const [label, setLabel] = useState('');
  const [enabled, setEnabled] = useState(false);
  const ringRef = useRef(null);

  useEffect(() => {
    let isFine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!isFine) return;
    setEnabled(true);
    document.documentElement.classList.add('has-cursor');

    const move = (e) => {
      setPos({ x: e.clientX, y: e.clientY });
      const r = ringRef.current;
      if (r) {
        r.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
      }
    };
    window.addEventListener('mousemove', move, { passive: true });
    const clean = () => {
      if (isFine) {
        window.removeEventListener('mousemove', move);
        document.documentElement.classList.remove('has-cursor');
      }
    };
    const recheck = () => {
      const now = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
      if (now && !isFine) clean();
    };
    window.addEventListener('resize', recheck);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('resize', recheck);
      clean();
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const update = () => {
      const els = document.querySelectorAll('[data-cursor]');
      const enter = (e) => {
        const el = e.currentTarget;
        const c = el.dataset.cursor || '';
        setMode(c.length > 9 ? 'label' : 'open');
        setLabel(c);
      };
      const leave = () => {
        setMode('idle');
        setLabel('');
      };
      els.forEach((el) => {
        el.addEventListener('mouseenter', enter);
        el.addEventListener('mouseleave', leave);
      });
      return () => {
        els.forEach((el) => {
          el.removeEventListener('mouseenter', enter);
          el.removeEventListener('mouseleave', leave);
        });
      };
    };
    const obs = new MutationObserver(update);
    obs.observe(document.body, { childList: true, subtree: true });
    update();
    return () => obs.disconnect();
  }, [enabled]);

  if (!enabled) return null;

  const active = mode !== 'idle';

  return (
    <>
      <motion.div
        className="cursor-dot"
        animate={{ x: pos.x, y: pos.y, opacity: active ? 0 : 1 }}
        transition={{ duration: 0.05 }}
      />
      <div
        ref={ringRef}
        className={`cursor-ring ${active ? 'cursor-ring--active' : ''} ${mode === 'label' ? 'cursor-ring--label' : ''}`}
      />
      <AnimatePresence>
        {label && (
          <motion.div
            className="cursor-tag"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            style={{ left: pos.x + 24, top: pos.y - 9 }}
          >
            {label}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export const cursorLabel = ({ label = '', action = 'OPEN' } = {}) => ({
  'data-cursor': label || action,
});