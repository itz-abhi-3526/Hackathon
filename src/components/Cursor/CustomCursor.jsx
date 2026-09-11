import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMousePosition } from '../../hooks';
import './CustomCursor.css';

export default function CustomCursor() {
  const { x, y } = useMousePosition();
  const [hovering, setHovering] = useState(false);
  const [hoverLabel, setHoverLabel] = useState('');
  const [visible, setVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    const show = () => setVisible(true);
    window.addEventListener('mousemove', show, { once: true });
  }, [isMobile]);

  useEffect(() => {
    if (isMobile) return;
    const interactives = document.querySelectorAll('a, button, [data-cursor]');
    const enter = (e) => {
      setHovering(true);
      setHoverLabel(e.target.dataset.cursor || '');
    };
    const leave = () => {
      setHovering(false);
      setHoverLabel('');
    };

    interactives.forEach((el) => {
      el.addEventListener('mouseenter', enter);
      el.addEventListener('mouseleave', leave);
    });
    return () => {
      interactives.forEach((el) => {
        el.removeEventListener('mouseenter', enter);
        el.removeEventListener('mouseleave', leave);
      });
    };
  }, [visible, isMobile]);

  if (isMobile) return null;

  return (
    <>
      <motion.div
        className="cursor-dot"
        animate={{
          x: x - 4,
          y: y - 4,
          scale: hovering ? 0.5 : 1,
        }}
        transition={{ type: 'tween', duration: 0.1 }}
        style={{ opacity: visible ? 1 : 0 }}
      />
      <motion.div
        className="cursor-ring"
        animate={{
          x: x - 20,
          y: y - 20,
          scale: hovering ? 1.8 : 1,
          borderColor: hovering ? 'var(--red-primary)' : 'rgba(255,255,255,0.15)',
        }}
        transition={{ type: 'tween', duration: 0.15, ease: 'easeOut' }}
        style={{ opacity: visible ? 1 : 0 }}
      />
      <AnimatePresence>
        {hoverLabel && (
          <motion.div
            className="cursor-label"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            style={{ left: x + 24, top: y - 8 }}
          >
            {hoverLabel}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
