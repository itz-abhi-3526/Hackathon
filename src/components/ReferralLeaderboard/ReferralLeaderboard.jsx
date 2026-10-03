import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { getReferralLeaderboard } from '../../services/referralLeaderboardService.js';
import './ReferralLeaderboard.css';

const EASE = [0.16, 1, 0.3, 1];

/* Full-width brand mark used in the top bar (same family as the
   referral signup page). */
function Brand({ homeUrl }) {
  return (
    <a className="rlb__brand" href={homeUrl}>
      HACK<span>.</span>PITCH<span>26</span>
    </a>
  );
}

/* One ranking line. The rank, name and points are printed exactly as the
   RPC returned them — nothing is re-sorted or recomputed on the client. */
function LeaderRow({ entry }) {
  return (
    <li className={`rlb-row${entry.rank === 1 ? ' rlb-row--lead' : ''}`}>
      <span className="rlb-rank" aria-hidden="true">
        {String(entry.rank).padStart(2, '0')}
      </span>
      <span className="rlb-name" title={entry.name}>
        {entry.name}
      </span>
      <span className="rlb-pts" aria-label={`${entry.name}, ${entry.points} points`}>
        {entry.points}
        <span className="rlb-pts-label">PTS</span>
      </span>
    </li>
  );
}

/* Shimmer skeleton shown while the RPC is loading. */
function BoardSkeleton({ count = 6 }) {
  return (
    <ol className="rlb-board rlb-board--skeleton" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="rlb-row rlb-row--skeleton">
          <span className="rlb-skeleton rlb-skeleton--rank" />
          <span className="rlb-skeleton rlb-skeleton--name" />
          <span className="rlb-skeleton rlb-skeleton--pts" />
        </li>
      ))}
    </ol>
  );
}

/* Zero referrers is a designed state, not a broken one: the figure carries
   the composition so the page still reads as finished. */
function EmptyBoard() {
  return (
    <motion.div
      className="rlb-empty"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      role="status"
    >
      <span className="rlb-empty-figure" aria-hidden="true">
        00
      </span>
      <p className="rlb-empty-title">No names yet.</p>
      <p className="rlb-empty-msg">
        The first verified referral starts the race.
      </p>
    </motion.div>
  );
}

function ErrorBoard({ onRetry }) {
  return (
    <motion.div
      className="rlb-empty rlb-empty--error"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      role="status"
    >
      <span className="rlb-empty-figure" aria-hidden="true">
        &mdash;&mdash;
      </span>
      <p className="rlb-empty-title">The board could not be loaded.</p>
      <p className="rlb-empty-msg">Please try again.</p>
      <button type="button" className="rlb-retry" onClick={onRetry}>
        RETRY
      </button>
    </motion.div>
  );
}

/* `embedded` renders only the board itself, for use inside the referral
   hub page on /referrals, which already supplies the top bar, hero and
   tab control. The default full-page render is unchanged. `onJoinReferrals`
   is the hub's switch back to the MY REFERRAL view; without it the CTA
   links to /referrals exactly as before. */
export default function ReferralLeaderboard({
  homeUrl = '/',
  embedded = false,
  onJoinReferrals,
}) {
  const [entries, setEntries] = useState([]);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const disposedRef = useRef(false);

  const load = useCallback(async () => {
    setStatus((s) => (s === 'error' ? 'loading' : s));
    try {
      const rows = await getReferralLeaderboard();
      if (disposedRef.current) return;
      setEntries(rows);
      setStatus('ready');
    } catch (err) {
      if (disposedRef.current) return;
      console.error('[ReferralLeaderboard] failed to load referral leaderboard', err);
      setEntries([]);
      setStatus('error');
    }
  }, []);

  /* Fetch the board once on mount. Points are re-read whenever the page
     is loaded or refreshed — no polling, no realtime channel. */
  useEffect(() => {
    disposedRef.current = false;
    load();
    return () => {
      disposedRef.current = true;
    };
  }, [load]);

  const showBoard = status === 'ready' && entries.length > 0;
  const showEmpty = status === 'ready' && entries.length === 0;
  const showError = status === 'error';
  const showLoading = status === 'loading';

  /* Shared by the standalone page and the embedded hub view so the
     leaderboard markup lives in exactly one place. */
  const board = (
    <>
      {showBoard && (
        <motion.section
          className="rlb__content"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5, ease: EASE }}
        >
          <section className="rlb__board-section">
            <div className="rlb__board-head">
              <span className="rlb__board-label">RANKING</span>
              <span className="rlb__board-count">
                {String(entries.length).padStart(2, '0')} REFERRERS
              </span>
            </div>
            <ol className="rlb-board">
              {entries.map((entry) => (
                <LeaderRow key={`${entry.rank}-${entry.name}`} entry={entry} />
              ))}
            </ol>
          </section>

          <div className="rlb__cta-row">
            {onJoinReferrals ? (
              /* Inside the hub the board's call to action returns to the
                 MY REFERRAL view in place — no navigation, no reload. */
              <button type="button" className="rlb__cta" onClick={onJoinReferrals}>
                CLAIM YOUR REFERRAL CODE
              </button>
            ) : (
              <a className="rlb__cta" href="/referrals">
                CLAIM YOUR REFERRAL CODE
              </a>
            )}
          </div>
          <p className="rlb__foot-note">
            RANKS ARE CALCULATED BY THE EVENT SERVER — REFRESH FOR THE LATEST BOARD.
          </p>
        </motion.section>
      )}

      {showLoading && <BoardSkeleton count={6} />}

      {showEmpty && <EmptyBoard />}

      {showError && <ErrorBoard onRetry={load} />}
    </>
  );

  if (embedded) {
    return <div className="rlb rlb--embed">{board}</div>;
  }

  return (
    <div className="rlb">
      <header className="rlb__bar">
        <div className="rlb__bar-inner">
          <Brand homeUrl={homeUrl} />
          <div className="rlb__bar-links">
            <a className="rlb__nav-link" href="/referrals">
              JOIN REFERRALS
            </a>
            <a className="rlb__back" href={homeUrl}>
              ← BACK TO EVENT
            </a>
          </div>
        </div>
      </header>

      <main className="rlb__inner">
        <header className="rlb__head">
          <motion.p
            className="rlb__overline"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.6, ease: EASE }}
          >
            HACK2PITCH 2026 — REFERRAL PROGRAM
          </motion.p>
          <motion.h1
            className="rlb__title"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12, duration: 0.7, ease: EASE }}
          >
            REFERRAL LEADERBOARD
          </motion.h1>
          <motion.p
            className="rlb__sub"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.7, ease: EASE }}
          >
            REFER A TEAM. HELP THEM BUILD. EARN YOUR PLACE ON THE BOARD.
          </motion.p>
        </header>

        <section className="rlb__rule">
          <p className="rlb__rule-main">
            <strong>1 VERIFIED TEAM</strong>
            <span className="rlb__rule-eq">=</span>
            <strong>1 REFERRAL POINT</strong>
          </p>
          <p className="rlb__rule-note">
            Points are added only after a team you referred is{' '}
            <em>verified</em> by the organisers — never at registration.
          </p>
        </section>

        {board}
      </main>
    </div>
  );
}