import { useState, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ReactLenis } from 'lenis/react';

import BootSequence from './components/NewBoot/BootSequence.jsx';
import Navigation from './components/NewNav/Navigation.jsx';
import Cursor from './components/NewCursor/Cursor.jsx';
import Hero from './components/NewHero/Hero.jsx';
import Manifesto from './components/NewManifesto/Manifesto.jsx';
import Problems from './components/NewProblems/Problems.jsx';
import Experience from './components/NewExperience/Experience.jsx';
import Countdown from './components/NewCountdown/Countdown.jsx';
import TimelineSection from './components/NewTimeline/Timeline.jsx';
import Prizes from './components/NewPrizes/Prizes.jsx';
import People from './components/NewPeople/People.jsx';
import FAQ from './components/NewFAQ/FAQ.jsx';
import FinalSequence from './components/NewFinalCTA/FinalSequence.jsx';
import Registration from './components/NewRegistration/Registration.jsx';
import AdminApp from './admin/AdminApp.jsx';
import useRegistrationStore from './store/registrationStore.js';

export default function App() {
  const [phase, setPhase] = useState('landing');
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.matches) {
      document.documentElement.style.scrollBehavior = 'auto';
    }
  }, []);

  useEffect(() => {
    /* The /admin path is an alias for the hash route the app already
       uses (#admin/<view>). Only admin URLs are rewritten — the public
       site never redirects. */
    const match = window.location.pathname.match(/^\/admin(\/.*)?$/);
    if (match) {
      const sub = (match[1] ?? '').replace(/^\/+/, '');
      const target = sub ? `#admin/${sub}` : '#admin';
      window.location.replace(
        window.location.pathname.replace(/\/admin(\/.*)?$/, '') +
          (window.location.search || '') +
          target
      );
    }
  }, []);

  useEffect(() => {
    const syncHash = () => {
      if (window.location.hash.startsWith('#admin')) setPhase('admin');
    };
    window.addEventListener('hashchange', syncHash);
    syncHash();
    return () => window.removeEventListener('hashchange', syncHash);
  }, []);

  const enterRegistration = useCallback(() => {
    /* Every entry into the registration page begins a NEW registration
       session. The old session id, stored draft, and in-memory state are
       all cleared so a previous team's summary can never be rendered. */
    useRegistrationStore.getState().resetRegistration();
    setPhase('registration');
    window.scrollTo(0, 0);
  }, []);

  const exitRegistration = useCallback(() => {
    setPhase('landing');
    window.scrollTo(0, 0);
  }, []);

  const exitAdmin = useCallback(() => {
    setPhase('landing');
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    window.scrollTo(0, 0);
  }, []);

  return (
    <ReactLenis root>
      <Cursor />

      {/* terminal boot sequence on first load — ends with ACCESS GRANTED */}
      <AnimatePresence>
        {!booted && <BootSequence key="boot" onComplete={() => setBooted(true)} />}
      </AnimatePresence>

      {booted && (
        <AnimatePresence mode="wait">
{phase === 'landing' && (
              <motion.div
                key="landing"
                initial={{ opacity: 0, y: '7vh' }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.85, ease: [0.16, 1, 0.3, 1] }}
              >
              <Navigation onRegister={enterRegistration} />

              <main>
                <Hero onRegister={enterRegistration} />
                <Manifesto />
                <Problems />
                <Experience />
                <Countdown />
                <TimelineSection />
                <Prizes />
                <People />
                <FAQ />
                <FinalSequence onRegister={enterRegistration} />
              </main>
            </motion.div>
          )}

          {phase === 'registration' && (
            <motion.div
              key="registration"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Registration onExit={exitRegistration} />
            </motion.div>
          )}

          {phase === 'admin' && (
            <motion.div
              key="admin"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              <AdminApp onExit={exitAdmin} />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </ReactLenis>
  );
}