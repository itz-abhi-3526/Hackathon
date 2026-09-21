import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { NAV_LINKS, NAV_GROUPS } from '../../data/index.js';
import { LEADERBOARD_URL } from '../../lib/config.js';
import './Navigation.css';

const PANEL = {
  closed: { opacity: 0, y: -16 },
  open: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.04, delayChildren: 0.05 } },
  exit: { opacity: 0, y: -16, transition: { duration: 0.2, ease: [0.33, 0, 0.67, 0] } },
};

const ITEM = {
  closed: { opacity: 0, y: 14 },
  open: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.15 } },
};

const GROUP = {
  closed: { opacity: 0, y: 14 },
  open: { opacity: 1, y: 0, transition: { duration: 0.34, ease: [0.16, 1, 0.3, 1], staggerChildren: 0.05, delayChildren: 0.08 } },
  exit: { opacity: 0, y: 8, transition: { duration: 0.15 } },
};

const groupCount = NAV_GROUPS.reduce((n, g) => n + g.links.length, 1);

export default function Navigation({ onRegister }) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handler = () => setIsScrolled(window.scrollY > 100);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prevOverflow; };
  }, [mobileOpen]);

  const handleNavClick = useCallback((e, href) => {
    e.preventDefault();
    setMobileOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <>
      <nav className={`nav ${isScrolled ? 'nav--scrolled' : ''}`}>
        <div className="nav__inner">
          {/* Brand */}
          <a href="#hero" className="nav__brand" onClick={(e) => handleNavClick(e, '#hero')}>
            <span className="nav__brand-v">V</span>
            <span className="nav__brand-h">H</span>
            <span className="nav__brand-dot">.</span>
            <span className="nav__brand-year">26</span>
          </a>

          {/* Desktop Links */}
          <div className="nav__links">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="nav__link"
                onClick={(e) => handleNavClick(e, link.href)}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* CTAs — leaderboard redirects to its own standalone site, register stays primary */}
          <div className="nav__cta">
            <a className="nav__leaderboard" href={LEADERBOARD_URL}>
              LEADERBOARD
            </a>
            <button className="nav__register" onClick={onRegister}>
              REGISTER
            </button>
          </div>

          {/* Mobile Toggle */}
          <button
            className="nav__toggle"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label={mobileOpen ? 'Close menu' : 'Toggle menu'}
            aria-expanded={mobileOpen}
            aria-controls="nav-mobile-panel"
          >
            <span className={`nav__toggle-line ${mobileOpen ? 'nav__toggle-line--open' : ''}`} />
            <span className={`nav__toggle-line ${mobileOpen ? 'nav__toggle-line--open' : ''}`} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            id="nav-mobile-panel"
            className="nav__mobile"
            variants={PANEL}
            initial="closed"
            animate="open"
            exit="exit"
          >
            <div className="nav__mobile-meta">
              <span className="nav__mobile-meta-label">NAV.LINKS</span>
              <span className="nav__mobile-meta-count">{String(groupCount).padStart(2, '0')}</span>
            </div>

            <div className="nav__mobile-groups">
              {NAV_GROUPS.map((group) => (
                <motion.section
                  key={group.id}
                  className="nav__mobile-group"
                  variants={GROUP}
                >
                  <motion.header className="nav__mobile-group-head" variants={ITEM}>
                    <span className="nav__mobile-group-index">{group.id.toUpperCase().slice(0, 2)}</span>
                    <span className="nav__mobile-group-label">{group.label}</span>
                    <span className="nav__mobile-group-rule" aria-hidden="true" />
                    <span className="nav__mobile-group-count">{String(group.links.length).padStart(2, '0')}</span>
                  </motion.header>

                  <div className="nav__mobile-group-links">
                    {group.links.map((link, li) => (
                      <motion.a
                        key={link.href}
                        href={link.href}
                        className="nav__mobile-link"
                        variants={ITEM}
                        onClick={(e) => handleNavClick(e, link.href)}
                      >
                        <span className="nav__mobile-idx">/{String(li + 1).padStart(2, '0')}</span>
                        <span className="nav__mobile-label">{link.label}</span>
                      </motion.a>
                    ))}
                  </div>
                </motion.section>
              ))}
            </div>

            <motion.button
              className="nav__mobile-register"
              variants={ITEM}
              onClick={() => { onRegister(); setMobileOpen(false); }}
            >
              <span className="nav__mobile-register-line">{'/>'} REGISTER NOW</span>
            </motion.button>

            <motion.a
              className="nav__mobile-leaderboard"
              href={LEADERBOARD_URL}
              variants={ITEM}
              onClick={() => setMobileOpen(false)}
            >
              <span className="nav__mobile-leaderboard-line">{'▤'} LIVE SCORES</span>
            </motion.a>

            <div className="nav__mobile-foot">
              <span>VOIDHACK 2026</span>
              <span>BENGALURU — INDIA</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
