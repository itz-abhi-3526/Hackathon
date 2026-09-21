/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Judging validation + pure derivation
   Standalone module (no imports) so every helper here can be unit
   tested in isolation, exactly like leaderboardValidation.js.
   Everything is null-safe: never throw, never crash a cell.
   ═══════════════════════════════════════════════════════════════ */

export function roundToTwo(n) {
  return Math.round(n * 100) / 100;
}

/* Clamp a raw user score into [0, maxScore], rounded to 2dp. JS number
   coercion means '' / null land on 0 (a blank score contributes zero);
   non-coercible input returns null. Callers decide whether blank means
   'skip this criterion' (checked before save) or just zero. */
export function clampScore(value, maxScore) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return roundToTwo(Math.min(Number(maxScore) || 0, Math.max(0, n)));
}

/* Derive the evaluation lifecycle for a team against a round. A team
   is 'complete' when every criterion has at least one evaluation row
   (entering 0 still counts as scored), 'in-progress' between, else
   'not-started'. */
export function judgingStatus({ judgedCount = 0, criteriaCount = 0 } = {}) {
  if (criteriaCount <= 0) return 'not-started';
  if (judgedCount >= criteriaCount) return 'complete';
  if (judgedCount > 0) return 'in-progress';
  return 'not-started';
}

/* Sum a list of numeric scores (PostgREST returns them as strings). */
export function sumScores(evals = []) {
  return evals.reduce((sum, e) => sum + Number(e?.score ?? 0), 0);
}

/* Latest updated_at across evaluations, or null when none exist. */
export function latestEvaluationAt(evals = []) {
  return evals.reduce((acc, e) => {
    if (!e?.updated_at) return acc;
    return acc && acc > e.updated_at ? acc : e.updated_at;
  }, null);
}

/* Partition saved evaluations into 'live' (their criterion still exists
   in the round's rubric) and 'retired' (the criterion was deleted but
   the score survives through the criterion_name / max_marks snapshots).
   Live rows are editable; retired rows are historical and read-only. */
export function splitEvaluations({ criteria = [], evals = [] } = {}) {
  const liveIds = new Set(criteria.map((c) => c.id));
  const live = [];
  const retired = [];
  for (const e of evals) {
    (liveIds.has(e.evaluationCriteriaId) ? live : retired).push(e);
  }
  return { live, retired };
}

/* Round-wide aggregate stats from the persisted judging_team_round_totals
   rows (accurate across the whole round regardless of pagination):
   how many teams were scored and the average total across them. */
export function scoredTeamsStats(rows = []) {
  const scored = rows.filter((r) => (r.entriesCount ?? 0) > 0);
  if (!scored.length) return { scoredTeams: 0, avgTotal: null };
  const sum = scored.reduce((acc, r) => acc + Number(r.totalScore ?? 0), 0);
  return {
    scoredTeams: scored.length,
    avgTotal: Math.round((sum / scored.length) * 10) / 10,
  };
}