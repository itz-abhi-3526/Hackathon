/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — LIVE SCOREBOARD live-sync helpers
   Pure functions used by PublicLeaderboard.jsx to detect score
   changes, compute rank positions, and map Supabase Realtime
   channel statuses to UI states.  No external deps.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Assign 1-based rank positions to an already-sorted list.
 * DB handles the ORDER BY; this is a presentation helper.
 */
export function rankEntries(entries) {
  return entries.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

/**
 * Diff previous vs next snapshot and return every team whose score
 * changed, with the absolute delta for the UI to animate.
 */
export function diffScoreChanges(prev, next) {
  const previousByName = new Map(prev.map((e) => [e.teamName, e]));
  const changes = [];
  for (const row of next) {
    const before = previousByName.get(row.teamName);
    if (before && before.score !== row.score) {
      changes.push({
        teamName: row.teamName,
        from: before.score,
        to: row.score,
      });
    }
  }
  return changes;
}

/**
 * Normalise the Supabase Realtime subscribe status string into one
 * of four UI states consumed by the connection indicator.
 *
 *   connected  — channel active, events streaming
 *   reconnect  — temporary loss, client retrying
 *   degraded   — explicit error or timeout
 *   syncing    — initialising or unknown status
 */
export function realtimeStateFor(status) {
  switch (status) {
    case 'SUBSCRIBED': return 'connected';
    case 'CLOSED':      return 'reconnect';
    case 'CHANNEL_ERROR':
    case 'TIMED_OUT':   return 'degraded';
    default:            return 'syncing';
  }
}

/**
 * Map (rtState, offline) to a short label for the status chip.
 */
export function connectionLabel(rtState, offline) {
  if (offline) return 'OFFLINE';
  switch (rtState) {
    case 'connected': return 'CONNECTED';
    case 'degraded':  return 'LINK LOST';
    case 'reconnect': return 'RECONNECTING';
    default:          return 'SYNCING';
  }
}