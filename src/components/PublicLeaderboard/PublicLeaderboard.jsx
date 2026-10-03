import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPublicLeaderboard } from '../../services/leaderboardService.js';
import { rankEntries } from './leaderboardLive.js';
import './PublicLeaderboard.css';

const EASE = [0.16, 1, 0.3, 1];

/* Poll keeps the board fresh. Scores stay server-side (anon has no read
   on leaderboard.score), so the public board shows rank + team name only. */
const REFRESH_MS = 5000;

function RankBadge({ rank }) {
  return (
    <span className={`vlb-rank vlb-rank--${String(rank).padStart(2, '0')}`} aria-hidden="true">
      {String(rank).padStart(2, '0')}
    </span>
  );
}

function LeaderRow({ entry, index }) {
  const podium = index < 3;

  return (
    <li
      className={`vlb-row${podium ? ` vlb-row--${String(entry.rank).padStart(2, '0')} vlb-row--podium` : ''}`}
    >
      <RankBadge rank={entry.rank} />

      <span className="vlb-name" title={entry.teamName}>
        {entry.teamName}
      </span>
    </li>
  );
}

/* Shimmer placeholders shown on the first load. */
function BoardSkeleton({ count = 6 }) {
  return (
    <ol className="vlb-board vlb-board--skeleton" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li key={i} className="vlb-row vlb-row--skeleton">
          <span className="vlb-skeleton vlb-skeleton--rank" />
          <span className="vlb-skeleton vlb-skeleton--name" />
        </li>
      ))}
    </ol>
  );
}

function StatePanel({ kind, message, onRetry, actionLabel = 'RETRY' }) {
  const isOffline = kind === 'offline';
  return (
    <motion.div
      className={`vlb-state vlb-state--${kind}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      role="status"
    >
      <span className="vlb-state__code" aria-hidden="true">
        {isOffline ? 'SIGNAL LOST' : kind === 'empty' ? '// EMPTY' : kind === 'error' ? 'ERR://BOARD' : '// LOADING'}
      </span>
      <p className="vlb-state__msg">{message}</p>
      {onRetry && (
        <button type="button" className="vlb-retry" onClick={onRetry}>
          {actionLabel}
        </button>
      )}
    </motion.div>
  );
}

export default function PublicLeaderboard({ homeUrl }) {
  const [entries, setEntries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(() =>
    typeof navigator === 'undefined' ? false : !navigator.onLine
  );

  /* Refs */
  const disposedRef = useRef(false);
  const seqRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    const token = ++seqRef.current;
    try {
      const rows = await getPublicLeaderboard();
      if (token !== seqRef.current || disposedRef.current) return;
      setEntries(rows);
      setLoaded(true);
      setError('');
      setLoading(false);
    } catch (err) {
      if (token !== seqRef.current || disposedRef.current) return;
      setError(String(err?.message ?? 'SCOREBOARD UNAVAILABLE — Please try again.'));
      setLoaded(true);
      setLoading(false);
    }
  }, []);

  /* Mount: initial fetch, network awareness, and a silent poll. The
     disposedRef flag suppresses stale async updates after navigation
     away. */
  useEffect(() => {
    disposedRef.current = false;
    load(true);

    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      load(true);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    const id = setInterval(() => {
      if (!disposedRef.current) load(true);
    }, REFRESH_MS);

    return () => {
      disposedRef.current = true;
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      clearInterval(id);
    };
  }, [load]);

  const rows = useMemo(() => rankEntries(entries), [entries]);

  const showBoard  = !loading && !error && !offline && rows.length > 0;
  const showEmpty  = loaded && !loading && !error && !offline && rows.length === 0;
  const showError  = !loading && error && rows.length === 0;
  const showOffline = offline && rows.length === 0;

  return (
    <div className="vlb">
      <header className="vlb__bar">
        <div className="vlb__bar-inner">
          <a href={homeUrl} className="vlb__brand">
            <span className="vlb__brand-v">H</span>
            <span className="vlb__brand-h">2P</span>
            <span className="vlb__brand-dot">.</span>
            <span className="vlb__brand-year">26</span>
          </a>

          <div className="vlb__bar-right">
            <span className="vlb__bar-count">{String(rows.length).padStart(2, '0')} TEAMS</span>
            <a className="vlb__back" href={homeUrl}>
              <span aria-hidden="true">←</span> HOME
            </a>
          </div>
        </div>
      </header>

      <div className="vlb__inner">
        <header className="vlb__head">
          <motion.p
            className="vlb__overline"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            <span className="vlb__overline-bar" aria-hidden="true" />
            HACK2PITCH 2026 — OFFICIAL SCOREBOARD
          </motion.p>
          <motion.h1
            className="vlb__title"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE, delay: 0.05 }}
          >
            LEADERBOARD
          </motion.h1>
          <motion.p
            className="vlb__sub"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.12 }}
          >
            OFFICIAL STANDINGS — RANKED HIGHEST FIRST.
          </motion.p>
        </header>

        <AnimatePresence mode="wait">
          {showBoard && (
            <motion.div
              key="board"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
            >
              <ol className="vlb-board">
                {rows.map((entry, i) => (
                  <LeaderRow key={entry.teamName || `${i}`} entry={entry} index={i} />
                ))}
              </ol>
              <p className="vlb-foot-note">STANDINGS UPDATE AUTOMATICALLY — NO REFRESH REQUIRED.</p>
            </motion.div>
          )}

          {loading && !error && !offline && !rows.length && (
            <BoardSkeleton key="skeleton" />
          )}

          {showEmpty && (
            <StatePanel
              key="empty"
              kind="empty"
              message="NO TEAMS ARE ON THE BOARD YET. RANKINGS APPEAR HERE AS SOON AS THE FIRST SCORES GO LIVE."
            />
          )}

          {showError && (
            <StatePanel
              key="error"
              kind="error"
              message={error}
              onRetry={() => load()}
              actionLabel="RETRY"
            />
          )}

          {showOffline && (
            <StatePanel
              key="offline"
              kind="offline"
              message="CONNECTION LOST — THE SCOREBOARD CANNOT UPDATE. RECONNECT TO SEE LIVE STANDINGS."
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}