/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — LIVE SCOREBOARD leaderboard reads
   The leaderboard table has an anonymous SELECT RLS policy — the
   scoreboard is a broadcast surface. Only team_name + score are
   mapped out. Rank is derived client-side by enumeration; created_at
   is used for deterministic tiebreak ordering and stripped before the
   response reaches the UI layer. No authentication is required.
   ═══════════════════════════════════════════════════════════════ */

import { getSupabase } from '../lib/supabase.js';
import { assertSupabaseConfigured } from '../lib/config.js';
import { AppError } from '../lib/api.js';

export function mapLeaderboardEntry(row) {
  if (!row) return null;
  return {
    teamName: String(row.team_name ?? '').trim() || 'UNNAMED TEAM',
    score: Number.isFinite(Number(row.score)) ? Number(row.score) : 0,
  };
}

export async function getPublicLeaderboard() {
  assertSupabaseConfigured();
  const supabase = getSupabase();

  /* created_at is fetched for the deterministic tiebreak ORDER BY
     (score DESC, created_at ASC) then stripped from the mapped output
     so the public payload carries only name + score. */
  const { data, error } = await supabase
    .from('leaderboard')
    .select('team_name, score, created_at')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[leaderboardService] public leaderboard SELECT failed', error);
    throw new AppError(
      'SCOREBOARD UNAVAILABLE — Could not load the scores. Please try again in a moment.',
      'LEADERBOARD_LOAD_FAILED',
      error
    );
  }

  return (data ?? []).map(mapLeaderboardEntry).filter(Boolean);
}