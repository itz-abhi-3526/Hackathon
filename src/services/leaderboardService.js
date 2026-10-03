/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — LIVE SCOREBOARD leaderboard reads
   The public scoreboard is name-only: team names in rank order. Scores
   are locked server-side (anon has NO column privilege on
   leaderboard.score, see migration 20261007000000) and are only visible
   in the admin panel. Ordering is computed in the security-definer RPC
   leaderboard_public_board (score DESC, created_at ASC), so rank is
   derived here by enumeration. No authentication is required.
   ═══════════════════════════════════════════════════════════════ */

import { getSupabase } from '../lib/supabase.js';
import { assertSupabaseConfigured } from '../lib/config.js';
import { AppError } from '../lib/api.js';

export function mapLeaderboardEntry(row) {
  if (!row) return null;
  return {
    teamName: String(row.team_name ?? '').trim() || 'UNNAMED TEAM',
  };
}

export async function getPublicLeaderboard() {
  assertSupabaseConfigured();
  const supabase = getSupabase();

  const { data, error } = await supabase.rpc('leaderboard_public_board');

  if (error) {
    console.error('[leaderboardService] public leaderboard RPC failed', error);
    throw new AppError(
      'SCOREBOARD UNAVAILABLE — Could not load the standings. Please try again in a moment.',
      'LEADERBOARD_LOAD_FAILED',
      error
    );
  }

  return (data ?? []).map(mapLeaderboardEntry).filter(Boolean);
}