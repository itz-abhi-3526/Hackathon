import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { getPublicLeaderboard } from '../../services/leaderboardService.js';
import { getSupabase } from '../../lib/supabase.js';
import {
  rankEntries,
  diffScoreChanges,
  realtimeStateFor,
  connectionLabel,
} from './leaderboardLive.js';
import './PublicLeaderboard.css';

const EASE = [0.16, 1, 0.3, 1];

/* Silent poll kept as a safety fallback when Realtime is disabled on
   the leaderboard table or during prolonged channel outages. */
const REFRESH_MS = 5000;

/* How long a score-change flash stays visible before it fades. */
const HIGHLIGHT_MS = 2600;

const REALTIME_CHANNEL = 'voidhack-public-leaderboard';

function RankBadge({ rank }) {
  return (
    <span className={`vlb-rank vlb-rank--${String(rank).padStart(2, '0')}`} aria-hidden="true">
      {String(rank).padStart(2, '0')}
    </span>
  );
}

function LeaderRow({ entry, index }) {
  const podium = index < 3;
  const { change } = entry;
  const trend = change ? (change.to > change.from ? 'up' : 'down') : null;

  return (
    <li
      className={`vlb-row${podium ? ` vlb-row--${String(entry.rank).padStart(2, '0')} vlb-row--podium` : ''}${trend ? ` vlb-row--${trend}` : ''}`}
    >
      <RankBadge rank={entry.rank} />

      <span className="vlb-name" title={entry.teamName}>
        {entry.teamName}
      </span>

      <span className={`vlb-score${trend ? ` vlb-score--${trend}` : ''}`} aria-label={`${entry.teamName}, ${entry.score} points`}>
        <span className="vlb-score__num">
          {String(entry.score).padStart(3, '0')}
        </span>

        {trend && (
          <span className={`vlb-delta vlb-delta--${trend}`} aria-hidden="true">
            {trend === 'up' ? '▲' : '▼'} {Math.abs(change.to - change.from)}
          </span>
        )}
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
          <span className="vlb-skeleton vlb-skeleton--score" />
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
  const [rtState, setRtState] = useState('syncing');
  const [highlights, setHighlights] = useState(() => new Map());

  /* Refs */
  const prevEntriesRef = useRef([]);
  const highlightTimersRef = useRef(new Set());
  const channelRef = useRef(null);
  const disposedRef = useRef(false);
  const seqRef = useRef(0);

  const postHighlights = useCallback((changes) => {
    setHighlights((cur) => {
      let next = null;
      for (const c of changes) {
        if (!next && cur.get(c.teamName)?.to === c.to) continue;
        next = next ?? new Map(cur);
        next.set(c.teamName, c);
      }
      return next ?? cur;
    });
    for (const c of changes) {
      const id = setTimeout(() => {
        highlightTimersRef.current.delete(id);
        setHighlights((cur) => {
          if (cur.get(c.teamName)?.to !== c.to) return cur;
          const next = new Map(cur);
          next.delete(c.teamName);
          return next;
        });
      }, HIGHLIGHT_MS);
      highlightTimersRef.current.add(id);
    }
  }, []);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    const token = ++seqRef.current;
    try {
      const rows = await getPublicLeaderboard();
      if (token !== seqRef.current || disposedRef.current) return;
      const changes = diffScoreChanges(prevEntriesRef.current, rows);
      prevEntriesRef.current = rows;
      if (changes.length) postHighlights(changes);
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
  }, [postHighlights]);

  /* Mount: initial fetch, Supabase Realtime subscription, and network
     awareness.  Channel is cleaned up on unmount; the disposedRef flag
     suppresses stale async updates after navigation away. */
  useEffect(() => {
    disposedRef.current = false;
    const timers = highlightTimersRef.current;
    load(true);

    /* Realtime subscription — single channel, no duplicates. */
    const supabase = getSupabase();
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase
      .channel(REALTIME_CHANNEL)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leaderboard' }, () => {
        if (!disposedRef.current) load(true);
      })
      .subscribe((status) => {
        if (disposedRef.current) return;
        setRtState((prev) => {
          const next = realtimeStateFor(status);
          return next === prev ? prev : next;
        });
      });
    channelRef.current = channel;

    /* Network online/offline awareness. */
    const onOffline = () => setOffline(true);
    const onOnline = () => {
      setOffline(false);
      load(true);
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);

    return () => {
      disposedRef.current = true;
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      timers.forEach(clearTimeout);
      timers.clear();
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [load]);

  /* Silent poll remains as a fallback when Realtime is disabled on the
     leaderboard table or during prolonged channel outages. */
  useEffect(() => {
    const id = setInterval(() => {
      if (!offline) load(true);
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [offline, load]);

  const rows = useMemo(
    () => rankEntries(entries).map((e) => ({ ...e, change: highlights.get(e.teamName) ?? null })),
    [entries, highlights]
  );

  const showBoard  = !loading && !error && !offline && rows.length > 0;
  const showEmpty  = loaded && !loading && !error && !offline && rows.length === 0;
  const showError  = !loading && error && rows.length === 0;
  const showOffline = offline && rows.length === 0;

  const connLabel = connectionLabel(rtState, offline);
  const connKind  = offline ? 'off' : rtState === 'connected' ? 'on' : rtState === 'degraded' ? 'warn' : 'sync';

  return (
    <div className="vlb">
      <header className="vlb__bar">
        <div className="vlb__bar-inner">
          <a href={homeUrl} className="vlb__brand">
            <span className="vlb__brand-v">V</span>
            <span className="vlb__brand-h">H</span>
            <span className="vlb__brand-dot">.</span>
            <span className="vlb__brand-year">26</span>
          </a>

          <div className="vlb__bar-right">
            <span
              className={`vlb__live vlb__live--${connKind}`}
              role="status"
              aria-live="polite"
            >
              {connKind === 'on' && <span className="vlb__live-dot" aria-hidden="true" />}
              {connLabel}
            </span>
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
            LIVE STANDINGS — RANKED BY TOTAL SCORE, HIGHEST FIRST.
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
              <p className="vlb-foot-note">SCORES SYNC AUTOMATICALLY — NO REFRESH REQUIRED.</p>
            </motion.div>
          )}

          {loading && !error && !offline && !rows.length && (
            <BoardSkeleton key="skeleton" />
          )}

          {showEmpty && (
            <StatePanel
              key="empty"
              kind="empty"
              message="NO TEAMS ARE ON THE BOARD YET. SCORES APPEAR HERE AS SOON AS THE FIRST RANKING GOES LIVE."
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