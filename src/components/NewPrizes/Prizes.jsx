import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { PRIZES } from '../../data/index.js';
import './Prizes.css';

const EASE = [0.16, 1, 0.3, 1];

const TIERS = [
  {
    rank: '01',
    place: 'FIRST PRIZE',
    amount: PRIZES.grand.amount,
    mark: '1ST',
    note: 'THE HACK2PITCH TITLE',
  },
  {
    rank: '02',
    place: 'SECOND PRIZE',
    amount: PRIZES.runner.amount,
    mark: '2ND',
    note: 'RESOLUTE FINISH',
  },
  {
    rank: '03',
    place: 'THIRD PRIZE',
    amount: PRIZES.third.amount,
    mark: '3RD',
    note: 'BREAKTHROUGH',
  },
];

export default function Prizes() {
  const sectionRef = useRef(null);
  const isInView = useInView(sectionRef, { once: true, amount: 0.12 });

  return (
    <section className="prizes vh-section" ref={sectionRef} id="prizes">
      {/* Red handoff line — continues the timeline's red axis into the podium */}
      <span className="prizes__handoff" aria-hidden="true" />

      <div className="prizes__inner vh-section-inner">
        {/* Header — establishes the stage before the podium begins */}
        <header className="prizes__header">
          <motion.div
            className="prizes__overline"
            initial={{ opacity: 0, x: -20 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.6, ease: EASE }}
          >
            <span className="prizes__overline-bar" />
            <span>STAKES</span>
            <span className="prizes__overline-index">03 / AWARDS</span>
          </motion.div>

          <motion.h2
            className="prizes__heading"
            initial={{ opacity: 0, y: 30 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
          >
            PRIZE
            <span className="prizes__heading-accent">POOL</span>
          </motion.h2>

          <motion.p
            className="prizes__lede"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
          >
            <span className="prizes__lede-sub">
              ONE STAGE. THREE STEPS. THE REWARD RESETS THE SCALE OF EVERY IDEA.
            </span>
          </motion.p>
        </header>

        {/* Podium — a stepped composition, not a row of cards */}
        <div className="prizes__podium">
          {/* 3rd — shortest, sits lowest on the stage */}
          <motion.div
            className="prizes__tier prizes__tier--3rd"
            initial={{ opacity: 0, y: 70 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.55, ease: EASE }}
          >
            <span className="prizes__tier-mark" aria-hidden="true">{TIERS[2].mark}</span>
            <div className="prizes__tier-body">
              <span className="prizes__tier-rank">{TIERS[2].rank}</span>
              <span className="prizes__tier-rule" aria-hidden="true" />
              <span className="prizes__tier-amount">₹{TIERS[2].amount}</span>
              <span className="prizes__tier-place">{TIERS[2].place}</span>
            </div>
            <span className="prizes__tier-note">{TIERS[2].note}</span>
          </motion.div>

          {/* 2nd — middle step */}
          <motion.div
            className="prizes__tier prizes__tier--2nd"
            initial={{ opacity: 0, y: 80 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.75, delay: 0.4, ease: EASE }}
          >
            <span className="prizes__tier-mark" aria-hidden="true">{TIERS[1].mark}</span>
            <div className="prizes__tier-body">
              <span className="prizes__tier-rank">{TIERS[1].rank}</span>
              <span className="prizes__tier-rule" aria-hidden="true" />
              <span className="prizes__tier-amount">₹{TIERS[1].amount}</span>
              <span className="prizes__tier-place">{TIERS[1].place}</span>
            </div>
            <span className="prizes__tier-note">{TIERS[1].note}</span>
          </motion.div>

          {/* 1st — the championship slab, dominating the podium */}
          <motion.div
            className="prizes__tier prizes__tier--1st"
            initial={{ opacity: 0, y: 60 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
          >
            <span className="prizes__tier-mark prizes__tier-mark--red" aria-hidden="true">{TIERS[0].mark}</span>
            <div className="prizes__tier-body">
              <span className="prizes__tier-rank--1st">01</span>
              <span className="prizes__tier-rule" aria-hidden="true" />
              <span className="prizes__tier-amount--1st">
                <span className="prizes__rupee">₹</span>
                {TIERS[0].amount}
              </span>
              <span className="prizes__tier-place--1st">FIRST PRIZE</span>
            </div>
            <span className="prizes__tier-note--1st">THE CHAMPIONSHIP</span>
            <span className="prizes__tier-corner" aria-hidden="true">+</span>
          </motion.div>
        </div>
      </div>
    </section>
  );
}