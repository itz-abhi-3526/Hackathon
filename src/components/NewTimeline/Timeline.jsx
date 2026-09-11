import { useEffect, useRef, useState } from 'react';
import { motion, useInView, useScroll, useTransform } from 'framer-motion';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLenis } from 'lenis/react';
import { TIMELINE } from '../../data/index.js';
import './Timeline.css';

gsap.registerPlugin(ScrollTrigger);

const EASE = [0.16, 1, 0.3, 1];
const COUNT = TIMELINE.length;

export default function TimelineSection() {
  const sectionRef = useRef(null);
  const viewportRef = useRef(null);
  const trackRef = useRef(null);
  const fillRef = useRef(null);
  const dotRef = useRef(null);
  const hintRef = useRef(null);

  const [current, setCurrent] = useState(0);
  const isInView = useInView(sectionRef, { once: true, amount: 0.05 });

  const [isDesktop, setIsDesktop] = useState(false);
  const [reduced, setReduced] = useState(false);

  const lenis = useLenis();

  /* ── Static (mobile / tablet / reduced-motion) vertical journal:
     scroll progress draws the red spine top-to-bottom ── */
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ['start 0.92', 'end 0.3'],
  });
  const staticFill = useTransform(
    scrollYProgress,
    [0, 1],
    reduced ? [1, 1] : [0, 1]
  );

  /* ── Capability gates — the pinned journey is a desktop piece;
     tablets and below get the static grid (2-col → 1-col) ── */
  useEffect(() => {
    const mqW = window.matchMedia('(min-width: 1024px)');
    const mqR = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      setIsDesktop(mqW.matches);
      setReduced(mqR.matches);
    };
    sync();
    mqW.addEventListener('change', sync);
    mqR.addEventListener('change', sync);
    return () => {
      mqW.removeEventListener('change', sync);
      mqR.removeEventListener('change', sync);
    };
  }, []);

  /* ── Keep ScrollTrigger in sync with Lenis smooth-scroll ── */
  useEffect(() => {
    if (!lenis) return;
    const update = () => ScrollTrigger.update();
    lenis.on('scroll', update);
    return () => lenis.off('scroll', update);
  }, [lenis]);

  const enabled = isDesktop && !reduced;

  /* ── The horizontal journey — pinned, scrubbed, continuous ── */
  useEffect(() => {
    if (!enabled) return;

    const section = sectionRef.current;
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!section || !viewport || !track) return;

    const ctx = gsap.context(() => {
      const getAmount = () => track.scrollWidth - window.innerWidth;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${getAmount()}`,
          pin: viewport,
          scrub: 1,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const p = self.progress;
            gsap.set(fillRef.current, { scaleX: p });
            gsap.set(dotRef.current, { x: p * getAmount() });
            const idx = Math.min(COUNT - 1, Math.round(p * (COUNT - 1)));
            setCurrent(idx);
            if (hintRef.current) {
              gsap.set(hintRef.current, { opacity: Math.max(0, 1 - p * 1.6) });
            }
          },
        },
      });

      tl.to(track, { x: () => -getAmount(), ease: 'none' }, 0)
        .to(fillRef.current, { scaleX: 1, ease: 'none' }, 0)
        .to(dotRef.current, { x: () => getAmount(), ease: 'none' }, 0);
    }, section);

    return () => ctx.revert();
  }, [enabled]);

  return (
    <section
      className={`timeline vh-section${enabled ? '' : ' timeline--static'}`}
      ref={sectionRef}
      id="timeline"
    >
      {/* Red handoff — the journey axis extends into the Prize Pool stage */}
      <span className="timeline__handoff" aria-hidden="true" />

      <div className="timeline__viewport" ref={viewportRef}>
        {/* Stage head — remains anchored while the track travels */}
        <header
          className="timeline__stage-head"
        >
          <motion.div
            className="timeline__overline"
            initial={{ opacity: 0, x: -20 }}
            animate={isInView && !enabled ? { opacity: 1, x: 0 } : { opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="timeline__overline-bar" />
            <span>EVENT SCHEDULE</span>
            <span className="timeline__overline-index">THE JOURNEY</span>
          </motion.div>

          <motion.h2
            className="timeline__heading"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          >
            THE<span className="timeline__heading-accent">TIMELINE</span>
          </motion.h2>
        </header>

        {/* The travelling track */}
        <div className="timeline__track" ref={trackRef}>
          {/* One continuous axis connecting every phase */}
          <div className="timeline__axis" aria-hidden="true">
            <span className="timeline__axis-base" />
            <span className="timeline__axis-fill" ref={fillRef} />
            <span className="timeline__axis-dot" ref={dotRef} />
          </div>

          {/* Vertical journal spine — drawn by scroll on mobile / reduced-motion */}
          <div className="timeline__static-spine" aria-hidden="true">
            <motion.span
              className="timeline__static-spine-fill"
              style={{ scaleY: staticFill }}
            />
          </div>

          {TIMELINE.map((event, i) => (
            <motion.article
              key={event.id}
              className={`timeline__phase${
                enabled && i === current ? ' timeline__phase--active' : ''
              }${i === COUNT - 1 ? ' timeline__phase--final' : ''}`}
              initial={false}
              transition={{ duration: 0.6, delay: i * 0.05, ease: EASE }}
            >
              <span className="timeline__phase-index">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="timeline__phase-main">
                <span className="timeline__phase-date">{event.date}</span>
                <h3 className="timeline__phase-title">
                  {event.label}
                  <span className="timeline__phase-mark" />
                </h3>
                <p className="timeline__phase-desc">{event.description}</p>
              </div>
            </motion.article>
          ))}
        </div>

        {enabled && (
          <p className="timeline__hint" ref={hintRef} aria-hidden="true">
            SCROLL TO TRAVEL
          </p>
        )}
      </div>
    </section>
  );
}