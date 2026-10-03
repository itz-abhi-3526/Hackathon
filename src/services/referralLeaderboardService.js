/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — REFERRAL LEADERBOARD reads
   The public boundary is a single read-only backend RPC:
     get_referral_leaderboard()
   It is the ONLY thing the browser may call for referral leaderboard
   data. referral_members / referral_rewards / teams are never queried
   from the client. The RPC response passes through in server order
   with the exact rank + points the database computed — no re-sorting
   and no rank recalculation ever happens on the frontend.
   ═══════════════════════════════════════════════════════════════ */

import { getSupabase } from '../lib/supabase.js';
import { assertSupabaseConfigured } from '../lib/config.js';
import { AppError } from '../lib/api.js';

const UNAVAILABLE =
  'REFERRAL BOARD UNAVAILABLE — Could not load the board. Please try again.';

const isCount = (value, min) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min;

/* The board is rendered from the server's own numbers. Every field is
   validated, never repaired: a rank that is missing, fractional, zero or
   non-numeric, a blank name and a non-numeric/negative points value all
   mean the payload cannot be trusted, so the whole board fails loudly
   instead of inventing a rank, a name or a score. */
export function mapReferralLeaderboardEntry(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    throw new AppError(UNAVAILABLE, 'REFERRAL_LEADERBOARD_MALFORMED', null);
  }

  if (!isCount(row.rank, 1)) {
    throw new AppError(UNAVAILABLE, 'REFERRAL_LEADERBOARD_MALFORMED', null);
  }

  const name = typeof row.name === 'string' ? row.name.trim() : '';
  if (!name) {
    throw new AppError(UNAVAILABLE, 'REFERRAL_LEADERBOARD_MALFORMED', null);
  }

  if (!isCount(row.points, 0)) {
    throw new AppError(UNAVAILABLE, 'REFERRAL_LEADERBOARD_MALFORMED', null);
  }

  return { rank: row.rank, name, points: row.points };
}

export async function getReferralLeaderboard() {
  assertSupabaseConfigured();
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('get_referral_leaderboard');

  if (error) {
    console.error('[referralLeaderboardService] get_referral_leaderboard failed', error);
    throw new AppError(UNAVAILABLE, 'REFERRAL_LEADERBOARD_LOAD_FAILED', error);
  }

  if (!Array.isArray(data)) {
    console.error('[referralLeaderboardService] malformed get_referral_leaderboard response', data);
    throw new AppError(UNAVAILABLE, 'REFERRAL_LEADERBOARD_MALFORMED', null);
  }

  return data.map(mapReferralLeaderboardEntry);
}