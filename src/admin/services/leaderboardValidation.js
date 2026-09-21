/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Leaderboard validation (pure helpers)
   Extracted from adminData.js so the score/name rules are unit-testable
   without a Supabase connection. No I/O, no Vite-only globals.
   ═══════════════════════════════════════════════════════════════ */

import { LEADERBOARD_MAX_SCORE, LEADERBOARD_ROUND_RESULTS_COLS } from '../../lib/schema.js';
import { AppError } from '../../lib/api.js';

export function normalizeLeaderboardTeam(row) {
  return {
    id: row.id,
    teamName: row.team_name ?? '',
    score: Number(row.score ?? 0),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

/* A scored team within one judging round, rolled up from the
   leaderboard_round_results view. Weighted is recomputed client-side
   (raw × round weight) so the displayed number always matches the DB
   contract even if a column is ever missing. */
export function normalizeLeaderboardRoundResult(row) {
  const raw = Number(row?.[LEADERBOARD_ROUND_RESULTS_COLS.rawScore] ?? 0);
  const weight = Number(row?.[LEADERBOARD_ROUND_RESULTS_COLS.roundWeight] ?? 1);
  return {
    roundId: row?.[LEADERBOARD_ROUND_RESULTS_COLS.judgingRoundId] ?? null,
    roundTitle: row?.[LEADERBOARD_ROUND_RESULTS_COLS.roundTitle] ?? '',
    roundStatus: row?.[LEADERBOARD_ROUND_RESULTS_COLS.roundStatus] ?? '',
    roundWeight: weight,
    teamId: row?.[LEADERBOARD_ROUND_RESULTS_COLS.teamId] ?? null,
    teamName: row?.[LEADERBOARD_ROUND_RESULTS_COLS.teamName] ?? '',
    registrationCode: row?.[LEADERBOARD_ROUND_RESULTS_COLS.registrationCode] ?? '',
    rawScore: raw,
    weightedScore: weightedScore(raw, weight),
    scorePossible: Number(row?.[LEADERBOARD_ROUND_RESULTS_COLS.scorePossible] ?? 0),
    entriesCount: Number(row?.[LEADERBOARD_ROUND_RESULTS_COLS.entriesCount] ?? 0),
    judgesCount: Number(row?.[LEADERBOARD_ROUND_RESULTS_COLS.judgesCount] ?? 0),
    criteriaCount: Number(row?.[LEADERBOARD_ROUND_RESULTS_COLS.criteriaCount] ?? 0),
    lastScoredAt: row?.[LEADERBOARD_ROUND_RESULTS_COLS.lastScoredAt] ?? null,
  };
}

/* A round's contribution to the combined leaderboard: raw total × the
   round's weight multiplier, rounded to 2 dp so the JavaScript number
   can never drift from the view's numeric(10,2). */
export function weightedScore(raw, weight) {
  const r = Number(raw ?? 0);
  const w = Number(weight ?? 1);
  if (!Number.isFinite(r) || !Number.isFinite(w)) return 0;
  return Math.round(r * w * 100) / 100;
}

/* Map the interesting DB failures to operator-friendly messages while
   letting everything else fall through to the generic shape. */
export function leaderboardWriteError(error) {
  const message = String(error?.message ?? '');
  const code = String(error?.code ?? '');
  if (code === '23505' || /unique|duplicate/i.test(message)) {
    return { ...error, message: 'A TEAM WITH THIS NAME IS ALREADY ON THE LEADERBOARD' };
  }
  if (code === '23514' || /check constraint/i.test(message)) {
    return { ...error, message: 'SCORE MUST BE A WHOLE NUMBER ABOVE OR EQUAL TO ZERO' };
  }
  if (code === '22003' || /out of range|too large|exceeds.*integer/i.test(message)) {
    return { ...error, message: `SCORE TOO LARGE — MAXIMUM IS ${LEADERBOARD_MAX_SCORE.toLocaleString('en-IN')}` };
  }
  return error;
}

export function assertLeaderboardTeamName(value) {
  const name = String(value ?? '').trim();
  if (!name) throw new AppError('TEAM NAME IS REQUIRED', 'LEADERBOARD_VALIDATION');
  return name;
}

export function assertLeaderboardScore(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new AppError('SCORE MUST BE A WHOLE NUMBER ABOVE OR EQUAL TO ZERO', 'LEADERBOARD_VALIDATION');
  }
  if (n > LEADERBOARD_MAX_SCORE) {
    throw new AppError(`SCORE TOO LARGE — MAXIMUM IS ${LEADERBOARD_MAX_SCORE.toLocaleString('en-IN')}`, 'LEADERBOARD_VALIDATION');
  }
  return n;
}

/* The + / − step controls must be a non-zero integer that cannot blow
   past the INTEGER column ceiling when summed. */
export function assertLeaderboardAdjustDelta(value) {
  const d = Number(value);
  if (!Number.isInteger(d) || d === 0 || Math.abs(d) > LEADERBOARD_MAX_SCORE) {
    throw new AppError('INVALID SCORE ADJUSTMENT', 'LEADERBOARD_VALIDATION');
  }
  return d;
}