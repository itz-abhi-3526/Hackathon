import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { NAV_LINKS } from '../../data';
import './Navbar.css';

export default function Navbar({ onRegister }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [prevScroll, setPrevScroll] = useState(0);

  useEffect(() => {
    const handler = () => {
      const scroll = window.scrollY;
      setHidden(scroll > prevScroll && scroll > 100);
      setScrolled(scroll > 50);
      setPrevScroll(scroll);
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, [prevScroll]);

  const scrollToSection = (href) => {
    setMenuOpen(false);
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      <motion.nav
        className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}
        animate={{ y: hidden && !menuOpen ? -100 : 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="navbar-inner">
          <a href="#" className="navbar-logo" data-cursor="HOME">
            <span className="navbar-logo-mark">V</span>
            <span className="navbar-logo-text">HACK2PITCH</span>
          </a>

          <div className="navbar-links">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                className="navbar-link"
                onClick={() => scrollToSection(link.href)}
                data-cursor={link.label}
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="navbar-actions">
            <button
              className="navbar-register"
              onClick={onRegister}
              data-cursor="ACCESS"
            >
              <span className="navbar-register-bracket">[</span>
              REGISTER
              <span className="navbar-register-bracket">]</span>
            </button>
            <button
              className="navbar-menu-toggle"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            className="mobile-menu"
            initial={{ clipPath: 'inset(0 0 100% 0)' }}
            animate={{ clipPath: 'inset(0 0 0% 0)' }}
            exit={{ clipPath: 'inset(0 0 100% 0)' }}
            transition={{ duration: 0.5, ease: [0.76, 0, 0.24, 1] }}
          >
            <div className="mobile-menu-grid-overlay" />
            <div className="mobile-menu-content">
              {NAV_LINKS.map((link, i) => (
                <motion.button
                  key={link.label}
                  className="mobile-menu-link"
                  onClick={() => scrollToSection(link.href)}
                  initial={{ opacity: 0, y: 40 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}
                >
                  <span className="mobile-menu-link-number">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {link.label}
                </motion.button>
              ))}
              <motion.button
                className="mobile-menu-register"
                onClick={() => { setMenuOpen(false); onRegister(); }}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
              >
                [ INITIALIZE REGISTRATION ]
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
