/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Registration service (teams → participants)
   A team IS the registration. The data model is three tables:
   problem_statements / teams / participants — there are no
   registrations, team_members, payments, hackathons or
   hackathon_settings tables anywhere.

   ONE write path only: the atomic submit_registration RPC (a
   SECURITY DEFINER function). The wizard performs NO per-step
   database writes, so partial rows can never exist and there is no
   second flow to drift from the real one. Every rejected call carries
   its PostgREST code/message/details/hint so the UI (and dev console)
   surfaces exactly which write was refused.

   Anonymous clients may only:
     • SELECT problem_statements  (public problem arena)
     • execute submit_registration (the single atomic submit)

   There are no anonymous INSERT/SELECT-write policies on teams or
   participants — those rows exist on the server only after a
   successful submit, and are readable only by authenticated admin.
   ═══════════════════════════════════════════════════════════════ */

import { getSupabase, getAdminSupabase } from '../lib/supabase.js';
import { T, TEAM_PAYMENT_STATUS, PARTICIPANT_ROLE } from '../lib/schema.js';
import { assertSupabaseConfigured } from '../lib/config.js';
import { AppError } from '../lib/api.js';

export const FOOD_PREFERENCE_KEYS = ['Veg', 'Non-Veg'];

export const foodPreferenceLabel = (key) =>
  key === 'Veg' ? 'VEG' : key === 'Non-Veg' ? 'NON-VEG' : '';

export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value ?? '').trim());
}

export function validPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 12;
}

export function isValidFoodPreference(value) {
  return FOOD_PREFERENCE_KEYS.includes(value);
}

export const isValidRole = (value) =>
  value === PARTICIPANT_ROLE.LEAD || value === PARTICIPANT_ROLE.MEMBER;

/**
 * Collision-safe client-side registration code. Sent inline with the
 * submit so a retry after a lost response reuses the same team (the
 * RPC a re-submit with the same code updates an existing row instead
 * of duplicating it).
 */
export function generateRegistrationCode() {
  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(4)) ?? [];
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  return `VH-2026-${(hex || Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')).slice(0, 6)}`;
}

/* Structured dev-only failure log with the PostgREST fields every
   rejected write carries (code / message / details / hint). */
function logDbFailure(tag, operation, error) {
  if (!import.meta.env.DEV) return;
  console.error(`[${tag}] ${operation} failed`, {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    cause: error,
  });
}

/**
 * Per-participant validation. Empty array = this participant is
 * complete. Shared by the wizard's COMPLETE badges and the step
 * validator so they can never disagree about a member's fields.
 */
export function participantProblems(player, index = 0) {
  const out = [];
  const who = `PARTICIPANT ${String(index + 1).padStart(2, '0')}`;
  if (!String(player?.name ?? '').trim()) out.push(`${who} — NAME IS REQUIRED`);
  if (!player || !validEmail(player.email)) out.push(`${who} — VALID EMAIL REQUIRED`);
  if (!player || !validPhone(player.phone)) out.push(`${who} — VALID PHONE REQUIRED`);
  if (!isValidFoodPreference(player?.foodPreference)) {
    out.push(`${who} — FOOD PREFERENCE MUST BE VEG OR NON-VEG`);
  }
  return out;
}

export function isParticipantComplete(player) {
  return participantProblems(player).length === 0;
}

/**
 * Client-side validation of the team + every participant.
 * This is the Step 03 gate: completion is decided purely from the
 * current in-memory participants (fields + exactly one lead), never
 * from whether a database row exists.
 */
export function validateParticipants({ team, problemStatement, players }) {
  const problems = [];

  if (!team || !String(team.name ?? '').trim()) problems.push('TEAM NAME IS REQUIRED');
  if (!problemStatement) problems.push('A PROBLEM STATEMENT MUST BE SELECTED');

  const size = Number(team?.size);
  if (!Number.isInteger(size) || size < 2 || size > 4) {
    problems.push('TEAM SIZE MUST BE BETWEEN 2 AND 4');
  }

  const list = Array.isArray(players) ? players : [];
  if (list.length !== size) problems.push('EVERY PARTICIPANT FORM MUST BE COMPLETED');

  const leads = list.filter((p) => p.role === PARTICIPANT_ROLE.LEAD);
  if (leads.length !== 1) problems.push('EXACTLY ONE PARTICIPANT MUST BE THE LEAD');

  list.forEach((p, i) => {
    problems.push(...participantProblems(p, i));
  });

  return problems;
}

/**
 * Full-entry validation (team + participants + payment proof).
 * Used only at the final review/submit, never to gate earlier steps.
 */
export function validateEntry({ team, problemStatement, players, payment }) {
  const problems = validateParticipants({ team, problemStatement, players });

  const proof = payment?.uploadStatus === 'success' && Boolean(payment?.proofUrl);
  if (!proof) problems.push('PAYMENT SCREENSHOT MUST BE UPLOADED BEFORE SUBMITTING');

  return problems;
}

/* ── Final submission — the ONE atomic write ── */

const SUBMIT_RPC = 'submit_registration';

/* PostgREST 404 / function-missing detection. The migration installs
   the function; until it runs this surfaces a clear dev error instead
   of silently degrading to a non-atomic write. */
function isRpcMissing(error) {
  const message = String(error?.message ?? '');
  const hint = String(error?.hint ?? '');
  const code = String(error?.code ?? '');
  return (
    code === 'PGRST202' ||
    code === 'PGRST116' ||
    code === '404' ||
    /could not find the function/i.test(message) ||
    /searched for the function/i.test(message) ||
    /no matches were found/i.test(message + hint) ||
    /does not exist|not found/i.test(message + hint)
  );
}

/**
 * Build the single JSONB payload the submit_registration RPC consumes.
 * All values are normalized here (trimmed / null-coerced / role and
 * food preference constrained) before any server-side validation.
 */
function buildSubmitPayload({ team, problemStatement, players, payment, registrationCode }) {
  const list = Array.isArray(players) ? players : [];
  return {
    registration_code: String(registrationCode ?? '').trim() || null,
    team_name: String(team?.name ?? '').trim(),
    college: String(team?.college ?? '').trim(),
    problem_statement_id: problemStatement?.id ?? null,
    payment_image_url: payment?.proofUrl ?? null,
    payment_status: TEAM_PAYMENT_STATUS.SUBMITTED,
    participants: list.map((p) => ({
      full_name: String(p?.name ?? '').trim(),
      email: String(p?.email ?? '').trim(),
      phone: String(p?.phone ?? '').trim(),
      food_preference: p?.foodPreference ?? '',
      role:
        p?.role === PARTICIPANT_ROLE.LEAD || p?.role === 'team_lead'
          ? PARTICIPANT_ROLE.LEAD
          : PARTICIPANT_ROLE.MEMBER,
    })),
  };
}

/**
 * Atomic final submission. The single source of truth for every write:
 * submit_registration performs the entire team + participants + payment
 * write in one transaction, validates every field, enforces exactly one
 * lead and is idempotent — a retry with the same registration_code (or
 * team_id) updates the existing rows instead of duplicating them.
 *
 * There is NO fallback to per-row inserts from the browser, so a
 * partial registration can never exist.
 *
 * @returns {Promise<{teamId: string, registrationCode: string, paymentStatus: string, submittedAt: string}>}
 */
export async function submitEntry({
  team,
  problemStatement,
  players,
  payment,
  registrationCode,
}) {
  assertSupabaseConfigured();

  const problems = validateEntry({ team, problemStatement, players, payment });
  if (problems.length) {
    throw new AppError(problems.join(' · '), 'INVALID_ENTRY');
  }

  const supabase = getSupabase();
  const payload = buildSubmitPayload({ team, problemStatement, players, payment, registrationCode });

  const { data, error } = await supabase.rpc(SUBMIT_RPC, {
  p_registration_code: payload.registration_code,
  p_team_name: payload.team_name,
  p_college: payload.college,
  p_problem_statement_id: payload.problem_statement_id,
  p_payment_status: payload.payment_status,
  p_payment_image_url: payload.payment_image_url,
  p_participants: payload.participants,
});
  if (error) {
    logDbFailure('registrationService', 'submit_registration RPC', error);
    if (isRpcMissing(error)) {
      throw new AppError(
        'SUBMIT UNAVAILABLE — The submit_registration database function has not been deployed. Run the atomic submit migration, then retry.',
        'SUBMIT_RPC_MISSING',
        error
      );
    }
    const detail = String(error?.message ?? '').trim();
    /* The RPC raises clear, human-readable messages (see the
       migration) — surface them instead of masking the failure. */
    const readable = /^(EXACTLY|SUBMIT|REGISTRATION|TEAM|COLLEGE|CREW|PAYMENT|INVALID|FOOD|LEAD|PROBLEM)/i.test(
      detail
    );
    throw new AppError(
      readable
        ? `SUBMIT FAILED — ${detail}`
        : 'SUBMIT FAILED — The server could not complete your entry. Please try again.',
      'SUBMIT_RPC_FAILED',
      error
    );
  }

  if (!data) throw new AppError('EMPTY SUBMIT RESPONSE', 'SUBMIT_RPC_EMPTY');
  const parsed = typeof data === 'string' ? JSON.parse(data) : data;
  if (parsed && parsed.success === false) {
    throw new AppError(
      'SUBMIT FAILED — The server could not complete your entry. Please try again.',
      'SUBMIT_RPC_FAILED'
    );
  }
  return {
    teamId: parsed.team_id ?? parsed.teamId ?? null,
    registrationCode: parsed.registration_code ?? parsed.registrationCode ?? '',
    paymentStatus: parsed.payment_status ?? parsed.paymentStatus ?? TEAM_PAYMENT_STATUS.SUBMITTED,
    submittedAt: parsed.submitted_at ?? parsed.submittedAt ?? new Date().toISOString(),
  };
}

/* ── Admin reads / writes (authenticated RLS) ── */

export async function adminFetchTeams() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.TEAMS)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new AppError(adminMessage(error), 'ADMIN_FETCH_FAILED', error);
  return data ?? [];
}

export async function adminFetchParticipants(teamIds) {
  if (!teamIds.length) return [];
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.PARTICIPANTS)
    .select('*')
    .in('team_id', teamIds);
  if (error) throw new AppError(adminMessage(error), 'ADMIN_FETCH_FAILED', error);
  return data ?? [];
}

export async function adminFetchProblems() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.from(T.PROBLEM_STATEMENTS).select('*');
  if (error) throw new AppError(adminMessage(error), 'ADMIN_FETCH_FAILED', error);
  return data ?? [];
}

export async function adminUpdatePaymentStatus(teamId, status) {
  if (!Object.values(TEAM_PAYMENT_STATUS).includes(status)) {
    throw new AppError('INVALID PAYMENT STATUS', 'INVALID_STATUS');
  }
  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from(T.TEAMS)
    .update({ payment_status: status })
    .eq('id', teamId);
  if (error) throw new AppError(adminMessage(error), 'ADMIN_UPDATE_FAILED', error);
}

function adminMessage(error) {
  if (error?.message) {
    if (/JWT|session|401|credentials/i.test(error.message)) {
      return 'ADMIN SESSION EXPIRED — Sign in again.';
    }
    if (/permission|policy|row level|42501|RLS/i.test(error.message)) {
      return 'ADMIN ACCESS REQUIRED — This account cannot read entries.';
    }
    return error.message;
  }
  return 'ADMIN REQUEST FAILED — Please try again.';
}