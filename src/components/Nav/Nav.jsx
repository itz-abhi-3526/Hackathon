import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './Nav.css';

const AREAS = [
  { id: 'gate', num: '01', label: 'THE GATE' },
  { id: 'brief', num: '02', label: 'BRIEFING' },
  { id: 'archive', num: '03', label: 'ARCHIVE' },
  { id: 'build', num: '04', label: 'BUILD FLOOR' },
  { id: 'clock', num: '05', label: 'CLOCK' },
  { id: 'corridors', num: '06', label: 'CHAMBERS' },
  { id: 'vault', num: '07', label: 'REWARD' },
  { id: 'people', num: '08', label: 'THE PEOPLE' },
  { id: 'network', num: '09', label: 'THE NETWORK' },
  { id: 'faq', num: '10', label: 'ARCHIVE' },
  { id: 'exit', num: '11', label: 'THE EXIT' },
];

export default function VoidNav({ onRegister }) {
  const [active, setActive] = useState('gate');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const sections = AREAS.map((a) => document.getElementById(a.id)).filter(Boolean);
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: '-45% 0px -45% 0px' }
    );
    sections.forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const diff = y - last;
      setVisible(diff < 8);
      last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const activeArea = AREAS.find((a) => a.id === active);

  return (
    <>
      <div className="facnav-brand">
        <span className="facnav-brand-mark">VH</span>
        <span className="facnav-brand-sep">·</span>
        <span className="facnav-brand-year">26</span>
      </div>

      <motion.aside
        className={`facnav ${visible ? '' : 'facnav--hidden'}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2.6, duration: 0.8 }}
      >
        <span className="facnav-cap">FLOOR MAP</span>
        <div className="facnav-rail">
          {AREAS.map((a) => (
            <button
              key={a.id}
              className={`facnav-item ${active === a.id ? 'facnav-item--active' : ''}`}
              onClick={() => scrollTo(a.id)}
              data-cursor={a.label}
              aria-label={a.label}
            >
              <span className="facnav-item-num">{a.num}</span>
              <AnimatePresence>
                {active === a.id && (
                  <motion.span
                    className="facnav-item-bar"
                    initial={{ height: 0 }}
                    animate={{ height: '100%' }}
                    exit={{ height: 0 }}
                  />
                )}
              </AnimatePresence>
            </button>
          ))}
        </div>
        <span className="facnav-loc">
          <span className="active-led" />
          {activeArea?.label}
        </span>
      </motion.aside>

      <motion.button
        className="facnav-access"
        onClick={onRegister}
        data-cursor="INITIALIZE"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.9, duration: 0.8 }}
      >
        <span className="facnav-access-dot blink" />
        ENTER THE VOID
      </motion.button>
    </>
  );
}