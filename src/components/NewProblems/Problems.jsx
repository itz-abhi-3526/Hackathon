import { useCallback, useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useLenis } from 'lenis/react';
import './Problems.css';

const EASE = [0.16, 1, 0.3, 1];

const TRACKS = [
  {
    id: 'track-01',
    index: '01',
    label: 'TRACK 01',
    title: 'THE FUTURE OF HUMAN INTELLIGENCE',
    problem:
      'From endless scrolling and instant gratification to constant notifications, information overload, and increasing reliance on AI, the way we use our minds is changing. While technology makes information and solutions more accessible than ever, it also raises important questions about our ability to sustain attention, retain knowledge, think critically, reason independently, and approach problems creatively. In a world where answers are increasingly effortless to obtain, preserving our ability to think deeply and learn independently becomes more important than ever.',
    challenge:
      'How can we harness technology and rethink everyday digital experiences to strengthen human cognitive abilities and help people become more focused, thoughtful, creative, and independent learners in an increasingly automated world?',
    requirements: [
      'Identify the target users and the cognitive challenges or gaps existing approaches fail to address.',
      'Include a working prototype that demonstrates your core idea.',
      'Demonstrate the potential for meaningful, measurable, and sustainable improvements in human cognitive development.',
    ],
  },
  {
    id: 'track-02',
    index: '02',
    label: 'TRACK 02',
    title: 'CONNECTIVITY UNDER DISRUPTION',
    problem:
      'When networks fail or access is restricted, whether from outages, disasters, congestion or shutdowns, people lose the ability to communicate, coordinate and get reliable information. Existing offline tools work only over short range, depend on people being physically close, and do little for those who cannot be present.',
    challenge:
      'Design and build a solution that keeps people connected, informed and able to act together when internet and mobility are limited. Think offline and mesh communication, coordination across distance, remote participation, trusted information, or emergency resilience.',
    requirements: [
      'Identify the users and the gap existing tools leave.',
      'Include a working prototype of the core idea.',
      'Show how it scales and sustains itself.',
    ],
  },
  {
    id: 'track-03',
    index: '03',
    label: 'TRACK 03',
    title: 'THE HUMAN ATTACK SURFACE',
    problem:
      'Modern security systems are becoming more advanced, yet many cyberattacks continue to exploit human behaviour, trust and lack of awareness. Women face additional digital threats, including online harassment, impersonation, cyberstalking and image-based abuse. Existing safety measures often struggle to prevent these threats, detect them early or provide effective support.',
    challenge:
      "Design and build a solution that helps people recognize, prevent, detect and respond to cyber threats that exploit human behaviour, with a particular focus on improving women's digital safety through prevention, early detection, reporting or recovery.",
    requirements: [
      'Identify the target users and existing gaps.',
      'Demonstrate a working prototype.',
      'Establish real-world impact and feasibility.',
      'Ensure scalability, privacy, ethics, and user safety.',
    ],
  },
];

const CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.14 } },
};

const ITEM = {
  hidden: { opacity: 0, y: 44 },
  show: { opacity: 1, y: 0, transition: { duration: 0.75, ease: EASE } },
};

export default function Problems() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.06 });
  const reduced = useReducedMotion();
  const lenis = useLenis();

  const jumpTo = useCallback(
    (id) => {
      const el = document.getElementById(id);
      if (!el) return;
      if (lenis) {
        lenis.scrollTo(el, { offset: -90, duration: 1.15 });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [lenis]
  );

  return (
    <section className="problems vh-section" ref={sectionRef} id="problems">
      <span className="problems__handoff" aria-hidden="true" />

      <div className="problems__inner vh-section-inner">
        <header className="problems__header">
          <motion.div
            className="problems__overline"
            initial={{ opacity: 0, x: -24 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="problems__overline-bar" />
            <span>THE CHALLENGE</span>
            <span className="problems__overline-index">03 TRACKS</span>
          </motion.div>

          <motion.h2
            className="problems__heading"
            initial={{ opacity: 0, y: 34 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.85, delay: 0.08, ease: EASE }}
          >
            PROBLEM
            <span className="problems__heading-accent">STATEMENTS</span>
          </motion.h2>

          <motion.p
            className="problems__lede"
            initial={{ opacity: 0, y: 22 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.18, ease: EASE }}
          >
            Three frontiers. One build. Choose the problem you are meant to solve
            and ship a working answer against the clock.
          </motion.p>

          <motion.div
            className="problems__meta"
            initial={{ opacity: 0, y: 18 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.26, ease: EASE }}
          >
            <span className="problems__meta-dot" aria-hidden="true" />
            <span className="problems__meta-dates">OCTOBER 10 &amp; 11, 2026</span>
            <span className="problems__meta-sep" aria-hidden="true">/</span>
            <span className="problems__meta-loc">FISAT, ANGAMALY</span>
          </motion.div>
        </header>

        <motion.nav
          className="problems__tabs"
          aria-label="Problem statement tracks"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7, delay: 0.32, ease: EASE }}
        >
          {TRACKS.map((track) => (
            <button
              key={track.id}
              type="button"
              className="problems__tab"
              onClick={() => jumpTo(track.id)}
            >
              <span className="problems__tab-index">{track.index}</span>
              <span className="problems__tab-title">{track.title}</span>
            </button>
          ))}
        </motion.nav>

        <motion.div
          className="problems__list"
          variants={CONTAINER}
          initial="hidden"
          animate={isInView ? 'show' : 'hidden'}
        >
          {TRACKS.map((track) => (
            <motion.article
              key={track.id}
              id={track.id}
              className="problems__track"
              variants={ITEM}
              style={reduced ? { opacity: 1, y: 0 } : undefined}
            >
              <span className="problems__track-rail" aria-hidden="true" />

              <header className="problems__track-head">
                <span className="problems__track-number" aria-hidden="true">
                  {track.index}
                </span>
                <div className="problems__track-heading">
                  <span className="problems__track-label">{track.label}</span>
                  <h3 className="problems__track-title">{track.title}</h3>
                </div>
              </header>

              <div className="problems__track-body">
                <div className="problems__block">
                  <span className="problems__block-label">PROBLEM STATEMENT</span>
                  <p className="problems__block-text">{track.problem}</p>
                </div>

                <div className="problems__block problems__block--challenge">
                  <span className="problems__block-label problems__block-label--red">
                    CHALLENGE
                  </span>
                  <p className="problems__block-text">{track.challenge}</p>
                </div>

                <div className="problems__block">
                  <span className="problems__block-label">SUBMISSION REQUIREMENTS</span>
                  <ul className="problems__requirements">
                    {track.requirements.map((req, i) => (
                      <li key={i} className="problems__requirement">
                        <span className="problems__requirement-mark" aria-hidden="true">
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className="problems__requirement-text">{req}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
