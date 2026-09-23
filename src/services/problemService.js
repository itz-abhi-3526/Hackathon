/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Problem statements reads
   problem_statements is the single source of truth for hackathon
   problems. Public RLS grants anonymous SELECT, so these run straight
   from the browser with the publishable key.
   ═══════════════════════════════════════════════════════════════ */

import { getSupabase } from '../lib/supabase.js';
import { T } from '../lib/schema.js';
import { assertSupabaseConfigured } from '../lib/config.js';
import { AppError } from '../lib/api.js';

export function mapProblemStatement(row, index = 0) {
  if (!row) return null;
  return {
    id: row.id,
    number: String(index + 1).padStart(2, '0'),
    category: String(row.track ?? 'CHALLENGE').toUpperCase(),
    title: row.title ?? 'Untitled challenge',
    description: row.description ?? '',
    difficulty: String(row.difficulty ?? '').toUpperCase(),
    domain: '',
    tags: [],
  };
}

export async function getProblemStatements() {
  assertSupabaseConfigured();
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from(T.PROBLEM_STATEMENTS)
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[problemService] problem_statements SELECT failed', error);
    throw new AppError(
      'CHALLENGES UNAVAILABLE — Could not load the problem statements. Please try again in a moment.',
      'PROBLEMS_LOAD_FAILED',
      error
    );
  }

  return (data ?? []).map(mapProblemStatement).filter(Boolean);
}

let _availabilityPromise = null;

/**
 * Best-effort probe: "are entries being accepted today?" In the new
 * model there is no open/close flag — entry is open whenever the
 * problem arena is readable. Shared by the hero and countdown meta.
 * Never throws, never blocks, cleared by clearProblemCache().
 *
 * @returns {Promise<boolean>} true when ≥1 problem row is readable.
 */
export function fetchProblemAvailability() {
  if (_availabilityPromise) return _availabilityPromise;
  _availabilityPromise = (async () => {
    try {
      const problems = await getProblemStatements();
      return problems.length > 0;
    } catch {
      return false;
    }
  })().then(
    (ok) => ok,
    () => false
  );
  return _availabilityPromise;
}

export function clearProblemCache() {
  _availabilityPromise = null;
}