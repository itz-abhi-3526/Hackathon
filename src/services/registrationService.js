/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Registration service (teams → participants)
   A team IS the registration. The data model is three tables:
   problem_statements / teams / participants — there are no
   registrations, team_members, payments, hackathons or
   hackathon_settings tables anywhere.

   ONE write path only: the atomic register_team(payload jsonb) RPC
   (SECURITY DEFINER). The wizard performs NO per-step database writes,
   so partial rows can never exist and there is no second flow to drift
   from the real one. The database resolves the ACTIVE registration
   round, enforces capacity, stamps the round + fee, and validates
   every field inside the single transaction.

   Anonymous clients may only:
     • SELECT problem_statements        (public problem arena)
     • execute register_team(payload)   (the single atomic submit)

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
 * The ONE authoritative frontend fee lookup.
 *
 * Fee exists ONLY when a team size has been selected:
 *
 *   teamSize 2 → round.fee_2_members
 *   teamSize 3 → round.fee_3_members
 *   teamSize 4 → round.fee_4_members
 *   otherwise  → null (no default fee, no fallback, never assume a size)
 *
 * The amount comes ONLY from the three per-size columns
 * (registration_rounds.fee_2/3/4_members — the single source of truth;
 * the legacy generic `fee` column was removed). The DATABASE
 * (register_team) recomputes the real fee from the active round +
 * participant count and ignores whatever the browser sends, so this
 * helper is never authoritative.
 */
const toFeeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

export function getRegistrationFee(round, teamSize) {
  const size = Number(teamSize);

  if (!round || typeof round !== 'object' || !round.id) return null;

  if (size === 2) return toFeeNumber(round.fee_2_members ?? round.fee_2Members);
  if (size === 3) return toFeeNumber(round.fee_3_members ?? round.fee_3Members);
  if (size === 4) return toFeeNumber(round.fee_4_members ?? round.fee_4Members);
  return null;
}

/** Lowest of the per-size prices — the "FROM ₹X" entry price for
 *  marketing surfaces that have no team-size selection. Derived only
 *  from registration_rounds.fee_2/3/4_members; null when no round or
 *  no prices are configured. */
export function startingRegistrationFee(round) {
  let min = null;
  for (const size of [2, 3, 4]) {
    const f = getRegistrationFee(round, size);
    if (f !== null) min = min === null ? f : Math.min(min, f);
  }
  return min;
}

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

/* Structured failure log with every PostgREST field a rejected write
   carries (code / message / details / hint / status). Logged in dev AND
   production so a failing submission is always diagnosable from the
   browser console — the friendly copy shown to the user never hides the
   real database error. */
function logDbFailure(tag, operation, error) {
  console.error(`[${tag}] ${operation} failed`, {
    message: error?.message ?? null,
    code: error?.code ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
    status: error?.status ?? error?.statusCode ?? null,
    raw: error,
    rawJson: JSON.stringify(error, Object.getOwnPropertyNames(error)),
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

const SUBMIT_RPC = 'register_team';
const PUBLIC_ACTIVE_ROUND_RPC = 'public_active_round';

/**
 * Registration round reads for the PUBLIC form.
 *
 * The public NEVER reads the registration_rounds table directly — RLS
 * restricts that table to authenticated admins. Everything flows through
 * the public_active_round() SECURITY DEFINER RPC, and the database
 * guarantees at most ONE active round at a time. So "the rounds the
 * public may register in right now" is a one-element list: the active
 * round, or [] when registration is closed.
 */
export async function getRegistrationRounds() {
  assertSupabaseConfigured();
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc(PUBLIC_ACTIVE_ROUND_RPC);
  if (error) {
    logDbFailure('registrationService', 'public_active_round RPC', error);
    if (isRpcMissing(error)) {
      throw new AppError(
        'REGISTRATION UNAVAILABLE — The registration rounds service is not deployed yet. Please try again later.',
        'ROUNDS_RPC_MISSING',
        error
      );
    }
    throw new AppError(
      'REGISTRATION STATUS COULD NOT BE LOADED — Try again in a moment.',
      'ACTIVE_ROUND_LOAD_FAILED',
      error
    );
  }
  /* PostgREST returns single-scalar RPC results wrapped in an array
     unless the object Accept header is requested. Normalize the real
     network contract here so both `[ {...} ]` and `{...}` work. */
  const round = unwrapRpcData(data);
  return round && round.id ? [round] : [];
}

/** Current active registration round, or {} when registration is closed. */
export async function getActiveRegistrationRound() {
  const [round] = await getRegistrationRounds();
  return round ?? {};
}

/**
 * Classify the registration round state for the UI. ONE source of truth
 * so every caller interprets the same database answer the same way:
 *
 *   active    → an open round is live and accepting
 *   full      → the active round has reached its team capacity
 *   not_open  → the active round has not started yet
 *   closed    → the active round's window has elapsed
 *   no_round  → no round is configured / active (registration closed)
 *   error     → the rounds service could not be reached (never a
 *               "registration closed" signal; the caller surfaces a real
 *               load/configuration error instead)
 */
export async function getRegistrationStatus() {
  try {
    const round = await getActiveRegistrationRound();
    if (!round?.id) return { phase: 'no_round', round: {} };
    const remaining = Number(round.remaining ?? 0);
    const startsAt = round.starts_at ?? round.startsAt ?? null;
    const startsFuture = Boolean(startsAt && new Date(startsAt).getTime() > Date.now());

    let phase = 'active';
    if (round.open === false || round.open === 'false' || round.open === 0) {
      phase = remaining <= 0 ? 'full' : startsFuture ? 'not_open' : 'closed';
    }
    return { phase, round };
  } catch (err) {
    /* RPC missing or network failure — hand the raw error back so the
       caller can show a real load error, never a fake "closed". */
    return { phase: 'error', round: {}, error: err };
  }
}

/* RPC responses arrive as a bare object or as a one-element array
   depending on the request/Accept path. Empty → {} (registration
   closed). */
function unwrapRpcData(data) {
  if (!data) return {};
  const value = Array.isArray(data) ? data[0] : data;
  return value && typeof value === 'object' ? value : {};
}

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
 * Build the normalized submit values the register_team RPC consumes.
 * The active registration round is resolved SERVER-SIDE by the RPC —
 * the browser never sends a round id or a fee, so a stale form can
 * never be charged the wrong fee or counted against the wrong round.
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

/* Round / duplicate / data failures → clean, user-facing messages.
   Every message comes from a raised exception inside register_team
   (never from raw PostgreSQL internals); unknown failures fall through
   to the generic branch in submitRegistration. */
function mapRegistrationFailure(error) {
  if (!error) return null;
  const message = String(error?.message ?? '');
  const code = String(error?.code ?? '');

  if (/REGISTRATION FULL/i.test(message)) {
    return new AppError(
      'REGISTRATION IS FULL FOR THIS ROUND — new registrations are closed until the next phase opens.',
      'ROUND_FULL',
      error
    );
  }
  if (/NOT OPEN YET/i.test(message)) {
    return new AppError(
      'REGISTRATION NOT OPEN YET — This round opens at its scheduled time.',
      'ROUND_NOT_OPEN',
      error
    );
  }
  if (/REGISTRATION CLOSED/i.test(message)) {
    return new AppError(
      'REGISTRATION IS CURRENTLY CLOSED — Registration will reopen when the next phase begins.',
      'ROUND_CLOSED',
      error
    );
  }
  if (code === '23505' || /DUPLICATE|already been submitted|unique/i.test(message)) {
    return new AppError(
      'THIS REGISTRATION HAS ALREADY BEEN SUBMITTED — Check the issued pass or refresh and try again.',
      'DUPLICATE_REGISTRATION',
      error
    );
  }
  if (/INVALID PROBLEM STATEMENT|PROBLEM STATEMENT IS REQUIRED/i.test(message)) {
    return new AppError(
      'PLEASE SELECT A VALID PROBLEM STATEMENT — Refresh the list and try again.',
      'INVALID_PROBLEM_STATEMENT',
      error
    );
  }
  if (code === '23514' || code === '23503') {
    return new AppError(
      'PLEASE CHECK YOUR REGISTRATION DETAILS AND TRY AGAIN.',
      'INVALID_REGISTRATION_DATA',
      error
    );
  }
  return null;
}

function parseSubmitData(data) {
  if (!data) throw new AppError('EMPTY SUBMIT RESPONSE', 'SUBMIT_RPC_EMPTY');
  const parsed = typeof data === 'string' ? JSON.parse(data) : unwrapRpcData(data);
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
    registrationRoundId: parsed.registration_round_id ?? parsed.registrationRoundId ?? null,
    registrationFee: parsed.registration_fee ?? parsed.registrationFee ?? null,
    roundTitle: parsed.round_title ?? parsed.roundTitle ?? '',
  };
}

/**
 * Atomic final submission. The single source of truth for every write:
 * register_team(payload jsonb) performs the entire team + participants
 * + payment write in one transaction, resolves the CURRENT active
 * round from registration_rounds server-side, enforces team capacity
 * (auto-closing the round at 0 slots), stamps registration_round_id +
 * registration_fee (the database picks the round and the fee — never
 * the browser), and is idempotent — a retry with the same
 * registration_code updates the existing rows instead of duplicating
 * them. This is the ONLY write path, active round or not.
 *
 * There is NO fallback to per-row inserts from the browser, so a
 * partial registration can never exist.
 *
 * @returns {Promise<{teamId: string, registrationCode: string, paymentStatus: string, submittedAt: string}>}
 */
export async function submitRegistration({
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

  /* The deployed submit path is ONE function with ONE signature:
     register_team(payload jsonb) — and it is called with the single
     `payload` argument (never positional/named p_* params, which caused
     the PGRST202 signature mismatch). The database resolves the round,
     enforces capacity, stamps round + fee, and returns the accepted
     entry. The shop shows registration_rounds as the source of truth. */
  const { data, error } = await supabase.rpc(SUBMIT_RPC, { payload });
  if (error) {
    logDbFailure('registrationService', 'register_team RPC', error);
    if (isRpcMissing(error)) {
      throw new AppError(
        'SUBMIT UNAVAILABLE — The registration service is not deployed yet. Please try again in a moment.',
        'SUBMIT_RPC_MISSING',
        error
      );
    }

    const mapped = mapRegistrationFailure(error);
    if (mapped) throw mapped;

    /* Never surface raw PostgreSQL diagnostics (PGRST202 / 42883 /
       23514 / "function … in the schema cache") to the user — those stay
       in the dev log above. */
    throw new AppError(
      'REGISTRATION COULD NOT BE COMPLETED — Please check your details and try again.',
      'SUBMIT_RPC_FAILED',
      error
    );
  }

  return parseSubmitData(data);
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