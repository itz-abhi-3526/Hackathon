/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Admin data service
   Server-side (PostgREST) reads for the control center. Every query
   runs through the authenticated client (getAdminSupabase) so the RLS
   is_admin() gate applies at the database — the UI is never the only
   layer of protection. Reads are paginated with exact counts; joins
   reuse the real foreign keys (teams.problem_statement_id,
   participants.team_id). No schema is created, modified or guessed.
   ═══════════════════════════════════════════════════════════════ */

import { getAdminSupabase } from '../../lib/supabase.js';
import {
  T,
  TEAM_PAYMENT_STATUS,
  ROUND_STATUS,
  STAGES,
  STAGE_CRITERIA_SLOTS,
  STAGE_CRITERIA_MAX_SCORE,
  ADMIN_JUDGING_LEADERBOARD_COLS,
} from '../../lib/schema.js';
import { AppError } from '../../lib/api.js';
import {
  normalizeLeaderboardTeam as normalizeLeaderboardTeamPure,
  normalizeLeaderboardRoundResult as normalizeLeaderboardRoundResultPure,
  leaderboardWriteError,
  assertLeaderboardTeamName,
  assertLeaderboardScore,
  assertLeaderboardAdjustDelta,
} from './leaderboardValidation.js';
import { judgingStatus, sumScores, latestEvaluationAt, roundToTwo, scoredTeamsStats } from './judgingValidation.js';

const ROUND_EMBED = '*, teams(count)';

/* participants(full_name, email, role) is embedded (not the count
   aggregate) so each team row also carries its LEAD's email/name for the
   verification-email UI. memberCount derives from the embedded length —
   with teams capped at 4 members this stays lightweight even for paginated
   queries. */
const TEAM_EMBED =
  '*, problem_statements(id, track, title, difficulty), participants(full_name, email, role), registration_rounds(id, title, fee_2_members, fee_3_members, fee_4_members, capacity, status)';
const PARTICIPANT_EMBED =
  '*, teams(team_name, college, registration_code, payment_status, problem_statement_id, registration_round_id, registration_fee, problem_statements(id, track, title, difficulty), registration_rounds(id, title, fee_2_members, fee_3_members, fee_4_members, capacity, status))';

export const TEAM_SORTS = {
  teamName: { column: 'team_name', asc: true },
  college: { column: 'college', asc: true },
  createdAt: { column: 'created_at', asc: false },
  paymentStatus: { column: 'payment_status', asc: true },
  memberCount: null, // handled client-side (participants(count) embed)
};

export const PARTICIPANT_SORTS = {
  fullName: { column: 'full_name', asc: true },
  teamName: { column: 'team_name', asc: true, referencedTable: 'teams' },
  college: { column: 'college', asc: true, referencedTable: 'teams' },
  createdAt: { column: 'created_at', asc: false },
};

const DEFAULT_PAGE_SIZE = 20;

function pluckStatus(error) {
  if (!error) return '';
  const message = String(error?.message ?? '');
  if (/JWT|session|401|credentials/i.test(message)) return 'SESSION_EXPIRED';
  if (/permission|policy|row level|42501|RLS|violates row-level/i.test(message)) {
    return 'FORBIDDEN';
  }
  return 'ERROR';
}

function wrapError(error, fallback) {
  const code = pluckStatus(error);
  return new AppError(
    code === 'SESSION_EXPIRED'
      ? 'ADMIN SESSION EXPIRED \u2014 Sign in again.'
      : code === 'FORBIDDEN'
      ? 'ACCESS DENIED \u2014 This account is not an administrator.'
      : error?.message || fallback,
    `ADMIN_${code || 'REQUEST_FAILED'}`,
    error
  );
}

/* Escape a user-supplied search string for a PostgREST `or()` filter.
   Keeps wildcards usable but neutralizes the reserved quoting chars. */
function escSearch(value) {
  return String(value ?? '').replace(/"/g, '').replace(/,/g, ' ').trim();
}

/* URL-ish slug for the round. Falls back to the title when not given. */
function slugifyRound(input) {
  const raw = String(input ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
  return raw || null;
}

/* Team queries ─────────────────────────────────────────────────── */

export async function adminFetchTeams({
  search = '',
  paymentStatus = '',
  problemStatementId = '',
  college = '',
  sortBy = 'createdAt',
  sortDir = 'desc',
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const supabase = getAdminSupabase();
  const sort = TEAM_SORTS[sortBy] ?? TEAM_SORTS.createdAt;
  const scope = { column: sort.column, ascending: sortDir === 'asc' };

  const base = (withCount) => {
    let q = supabase
      .from(T.TEAMS)
      .select(withCount ? TEAM_EMBED : 'id, participants(count)', {
        count: withCount ? 'exact' : undefined,
      });
    if (search) q = q.or(`team_name.ilike."%${escSearch(search)}%",college.ilike."%${escSearch(search)}%",registration_code.ilike."%${escSearch(search)}%"`);
    if (paymentStatus) q = q.eq('payment_status', paymentStatus);
    if (problemStatementId) q = q.eq('problem_statement_id', problemStatementId);
    if (college) q = q.ilike('college', `%${college}%`);
    return q;
  };

  /* memberCount is an embedded aggregate PostgREST cannot ORDER BY, so
     resolve the order + pagination on the id/count pairs first. */
  if (sortBy === 'memberCount') {
    const { data: pairs, count, error } = await base(false).order('id', { ascending: true });
    if (error) throw wrapError(error, 'TEAMS COULD NOT BE LOADED');
    const sorted = (pairs ?? []).slice().sort((a, b) => {
      const ca = a.participants?.[0]?.count ?? 0;
      const cb = b.participants?.[0]?.count ?? 0;
      return sortDir === 'desc' ? cb - ca : ca - cb;
    });
    const from = page * pageSize;
    const ids = sorted.slice(from, from + pageSize).map((r) => r.id);
    if (!ids.length) return { rows: [], count: count ?? 0 };
    const { data, error: fullError } = await supabase
      .from(T.TEAMS)
      .select(TEAM_EMBED)
      .in('id', ids);
    if (fullError) throw wrapError(fullError, 'TEAMS COULD NOT BE LOADED');
    const byId = new Map((data ?? []).map((r) => [r.id, r]));
    const rows = ids
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map(normalizeTeam);
    return { rows, count: count ?? 0 };
  }

  const { data, count, error } = await base(true)
    .order(scope.column, { ascending: scope.ascending })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw wrapError(error, 'TEAMS COULD NOT BE LOADED');
  return { rows: (data ?? []).map(normalizeTeam), count: count ?? 0 };
}

export function normalizeTeam(row) {
  const problem = row?.problem_statements ?? null;
  const round = row?.registration_rounds ?? null;
  const participants = Array.isArray(row.participants) ? row.participants : [];
  const count =
    participants.length > 0 && 'count' in participants[0]
      ? participants[0].count
      : participants.length;
  const leadParticipant = participants.find((p) => p.role === 'lead') ?? null;
  return {
    id: row.id,
    registrationCode: row.registration_code,
    teamName: row.team_name,
    college: row.college,
    problemStatementId: row.problem_statement_id,
    paymentStatus: row.payment_status,
    paymentImageUrl: row.payment_image_url,
    rejectionReason: row.rejection_reason,
    createdAt: row.created_at,
    registrationRoundId: row.registration_round_id,
    registrationFee: row.registration_fee,
    registrationRound: round,
    problem,
    memberCount: count,
    leadEmail: leadParticipant?.email ?? '',
    leadName: leadParticipant?.full_name ?? '',
    verificationEmailStatus: row.verification_email_status ?? 'pending',
    verificationEmailSentAt: row.verification_email_sent_at ?? null,
    verificationEmailLastError: row.verification_email_last_error ?? null,
    verificationEmailSendCount: row.verification_email_send_count ?? 0,
    verificationEmailLastSentTo: row.verification_email_last_sent_to ?? null,
    rejectionEmailStatus: row.rejection_email_status ?? 'pending',
    rejectionEmailSentAt: row.rejection_email_sent_at ?? null,
    rejectionEmailLastError: row.rejection_email_last_error ?? null,
    rejectionEmailSendCount: row.rejection_email_send_count ?? 0,
    rejectionEmailLastSentTo: row.rejection_email_last_sent_to ?? null,
  };
}

/* The PostgREST logic tree (or/and) cannot reference embedded columns
   (e.g. `teams.team_name`) in this project's PostgREST version — dotted
   embedded filters only work as top-level equality filters. To let a
   free-text participant search also match its owning team, we first
   resolve matching team ids from the teams table, then fold them into
   the participant or() tree as team_id.in.(...). This keeps search
   fully server-side and pagination correct. */
async function resolveTeamSearchIds(supabase, search) {
  const esc = escSearch(search);
  if (!esc) return [];
  const { data, error } = await supabase
    .from(T.TEAMS)
    .select('id')
    .or(
      `team_name.ilike."%${esc}%",registration_code.ilike."%${esc}%",college.ilike."%${esc}%"`
    );
  if (error) throw wrapError(error, 'PARTICIPANTS COULD NOT BE LOADED');
  return (data ?? []).map((r) => r.id);
}

function participantSearchOrParts(search, teamIds) {
  const esc = escSearch(search);
  if (!esc) return null;
  const parts = [
    `full_name.ilike."%${esc}%"`,
    `email.ilike."%${esc}%"`,
    `phone.ilike."%${esc}%"`,
  ];
  if (teamIds.length) parts.push(`team_id.in.(${teamIds.join(',')})`);
  return parts.join(',');
}

export async function adminFetchParticipants({
  search = '',
  teamId = '',
  paymentStatus = '',
  problemStatementId = '',
  college = '',
  sortBy = 'createdAt',
  sortDir = 'desc',
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const supabase = getAdminSupabase();
  const sort = PARTICIPANT_SORTS[sortBy] ?? PARTICIPANT_SORTS.createdAt;
  const ascending = sortDir === 'asc';

  let q = supabase
    .from(T.PARTICIPANTS)
    .select(PARTICIPANT_EMBED, { count: 'exact' });

  if (search) {
    const tree = participantSearchOrParts(search, await resolveTeamSearchIds(supabase, search));
    if (tree) q = q.or(tree);
  }
  if (teamId) q = q.eq('team_id', teamId);
  if (paymentStatus) q = q.eq('teams.payment_status', paymentStatus);
  if (problemStatementId) q = q.eq('teams.problem_statement_id', problemStatementId);
  if (college) q = q.eq('teams.college', college);

  q = q.order(sort.column, {
    ascending,
    ...(sort.referencedTable ? { referencedTable: sort.referencedTable } : {}),
  });

  const { data, count, error } = await q.range(
    page * pageSize,
    page * pageSize + pageSize - 1
  );
  if (error) throw wrapError(error, 'PARTICIPANTS COULD NOT BE LOADED');
  return { rows: (data ?? []).map(normalizeParticipant), count: count ?? 0 };
}

export function normalizeParticipant(row) {
  const team = row?.teams ?? null;
  const round = team?.registration_rounds ?? null;
  return {
    id: row.id,
    teamId: row.team_id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    foodPreference: row.food_preference,
    role: row.role,
    createdAt: row.created_at,
    teamName: team?.team_name ?? '',
    college: team?.college ?? '',
    registrationCode: team?.registration_code ?? '',
    paymentStatus: team?.payment_status ?? '',
    paymentImageUrl: team?.payment_image_url ?? '',
    registrationRoundId: team?.registration_round_id ?? null,
    registrationFee: team?.registration_fee ?? null,
    registrationRound: round,
    problem: team?.problem_statements ?? null,
  };
}

/* Problem statements + distribution ────────────────────────────── */

export async function adminFetchProblems() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.PROBLEM_STATEMENTS)
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw wrapError(error, 'PROBLEM STATEMENTS COULD NOT BE LOADED');
  return data ?? [];
}

export async function adminProblemCounts(problems) {
  const supabase = getAdminSupabase();
  const counts = await Promise.all(
    (problems ?? []).map(async (p) => {
      const { count, error } = await supabase
        .from(T.TEAMS)
        .select('id', { count: 'exact', head: true })
        .eq('problem_statement_id', p.id);
      if (error) throw wrapError(error, 'PROBLEM COUNTS COULD NOT BE LOADED');
      return { problemId: p.id, teams: count ?? 0 };
    })
  );
  return new Map(counts.map((c) => [c.problemId, c.teams]));
}

/* Registration rounds ───────────────────────────────────────────── */

export async function adminFetchRounds() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.REGISTRATION_ROUNDS)
    .select(ROUND_EMBED)
    .order('created_at', { ascending: true });
  if (error) throw wrapError(error, 'REGISTRATION ROUNDS COULD NOT BE LOADED');
  return (data ?? []).map(normalizeRound);
}

/* Teams created before the rounds system existed carry no
   registration_round_id — reported separately as LEGACY throughout. */
export async function adminFetchLegacyTeamCount() {
  const supabase = getAdminSupabase();
  const { count, error } = await supabase
    .from(T.TEAMS)
    .select('id', { count: 'exact', head: true })
    .is('registration_round_id', null);
  if (error) throw wrapError(error, 'LEGACY TEAM COUNT COULD NOT BE LOADED');
  return count ?? 0;
}

export function normalizeRound(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? '',
    fee2Members: row.fee_2_members,
    fee3Members: row.fee_3_members,
    fee4Members: row.fee_4_members,
    capacity: row.capacity,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    registered: row.teams?.[0]?.count ?? 0,
  };
}

/* Round lifecycle rule (one ACTIVE at a time) lives in the database —
   admin_round_set_status atomically closes the current active round.
   Status is intentionally excluded from the editable patch below. */
export async function adminCreateRound(input) {
  const supabase = getAdminSupabase();
  const fee2 = Number(input?.fee2Members ?? input?.fee_2_members);
  const fee3 = Number(input?.fee3Members ?? input?.fee_3_members);
  const fee4 = Number(input?.fee4Members ?? input?.fee_4_members);
  const row = {
    title: String(input?.title ?? '').trim(),
    slug: slugifyRound(input?.slug || input?.title),
    fee_2_members: fee2,
    fee_3_members: fee3,
    fee_4_members: fee4,
    capacity: Number(input?.capacity),
    starts_at: input?.startsAt || null,
    ends_at: input?.endsAt || null,
    status: ROUND_STATUS.DRAFT,
  };
  if (!row.title) throw new AppError('ROUND TITLE IS REQUIRED', 'ROUND_VALIDATION');
  if (
    !Number.isFinite(fee2) || fee2 < 0 ||
    !Number.isFinite(fee3) || fee3 < 0 ||
    !Number.isFinite(fee4) || fee4 < 0
  ) {
    throw new AppError(
      'EVERY TEAM-SIZE FEE IS REQUIRED — 2, 3 AND 4 MEMBER FEES MUST BE NON-NEGATIVE NUMBERS',
      'ROUND_VALIDATION'
    );
  }
  if (!Number.isInteger(row.capacity) || row.capacity <= 0)
    throw new AppError('ROUND CAPACITY MUST BE A WHOLE NUMBER > 0', 'ROUND_VALIDATION');
  const { data, error } = await supabase.from(T.REGISTRATION_ROUNDS).insert(row).select('*').limit(1);
  if (error) throw wrapError(error, 'REGISTRATION ROUND COULD NOT BE CREATED');
  return normalizeRound(data?.[0] ?? row);
}

export async function adminUpdateRound(id, patch) {
  if (!id) throw new AppError('NO ROUND SELECTED', 'NO_ROUND');
  const supabase = getAdminSupabase();
  const row = {};
  if ('title' in patch) row.title = String(patch.title ?? '').trim();
  if ('slug' in patch) row.slug = slugifyRound(patch.slug || patch.title);
  if ('fee2Members' in patch) row.fee_2_members = Number(patch.fee2Members);
  if ('fee3Members' in patch) row.fee_3_members = Number(patch.fee3Members);
  if ('fee4Members' in patch) row.fee_4_members = Number(patch.fee4Members);
  if ('capacity' in patch) row.capacity = Number(patch.capacity);
  if ('startsAt' in patch) row.starts_at = patch.startsAt || null;
  if ('endsAt' in patch) row.ends_at = patch.endsAt || null;
  if (!Object.keys(row).length) return null;
  if (row.title !== undefined && !row.title)
    throw new AppError('ROUND TITLE IS REQUIRED', 'ROUND_VALIDATION');
  if (row.fee_2_members !== undefined && (!Number.isFinite(row.fee_2_members) || row.fee_2_members < 0))
    throw new AppError('2-MEMBER FEE MUST BE A NON-NEGATIVE NUMBER', 'ROUND_VALIDATION');
  if (row.fee_3_members !== undefined && (!Number.isFinite(row.fee_3_members) || row.fee_3_members < 0))
    throw new AppError('3-MEMBER FEE MUST BE A NON-NEGATIVE NUMBER', 'ROUND_VALIDATION');
  if (row.fee_4_members !== undefined && (!Number.isFinite(row.fee_4_members) || row.fee_4_members < 0))
    throw new AppError('4-MEMBER FEE MUST BE A NON-NEGATIVE NUMBER', 'ROUND_VALIDATION');
  if (row.capacity !== undefined && (!Number.isInteger(row.capacity) || row.capacity <= 0))
    throw new AppError('ROUND CAPACITY MUST BE A WHOLE NUMBER > 0', 'ROUND_VALIDATION');
  const { data, error } = await supabase
    .from(T.REGISTRATION_ROUNDS)
    .update(row)
    .eq('id', id)
    .select('*')
    .limit(1);
  if (error) throw wrapError(error, 'REGISTRATION ROUND COULD NOT BE UPDATED');
  return normalizeRound(data?.[0] ?? { id });
}

export async function adminSetRoundStatus(id, status) {
  if (!id) throw new AppError('NO ROUND SELECTED', 'NO_ROUND');
  if (!Object.values(ROUND_STATUS).includes(status)) {
    throw new AppError('INVALID ROUND STATUS', 'INVALID_STATUS');
  }
  const supabase = getAdminSupabase();
  const { error } = await supabase.rpc('admin_round_set_status', { p_id: id, p_status: status });
  if (error) throw wrapError(error, 'ROUND STATUS COULD NOT BE UPDATED');
}

export async function adminDeleteRound(id) {
  if (!id) throw new AppError('NO ROUND SELECTED', 'NO_ROUND');
  const supabase = getAdminSupabase();
  const { error } = await supabase.rpc('admin_round_delete', { p_id: id });
  if (error) throw wrapError(error, 'REGISTRATION ROUND COULD NOT BE DELETED');
}

/* Team detail (drawer): full team row + its participants ────────── */

export async function adminFetchTeamDetail(teamId) {
  if (!teamId) throw new AppError('NO TEAM SELECTED', 'NO_TEAM');
  const supabase = getAdminSupabase();

  const { data: teamRows, error: teamError } = await supabase
    .from(T.TEAMS)
    .select(TEAM_EMBED)
    .eq('id', teamId)
    .limit(1);
  if (teamError) throw wrapError(teamError, 'TEAM COULD NOT BE LOADED');
  if (!teamRows?.length) throw new AppError('TEAM NOT FOUND', 'TEAM_MISSING');
  const team = normalizeTeam(teamRows[0]);

  const { data: members, error: membersError } = await supabase
    .from(T.PARTICIPANTS)
    .select('*')
    .eq('team_id', teamId)
    .order('created_at', { ascending: true });
  if (membersError) throw wrapError(membersError, 'TEAM MEMBERS COULD NOT BE LOADED');

  return { team, members: (members ?? []).map(normalizeParticipant) };
}

/* Status change ── the ONLY admin write (payment verification) ────
   Rejecting stores the admin-supplied reason on teams.rejection_reason
   (reads back to NULL on any other status, so a re-verified team stops
   carrying stale rejection text). */
export async function adminSetPaymentStatus(teamId, status, reason = '') {
  if (!Object.values(TEAM_PAYMENT_STATUS).includes(status)) {
    throw new AppError('INVALID PAYMENT STATUS', 'INVALID_STATUS');
  }
  const supr = getAdminSupabase();
  const patch = { payment_status: status };
  patch.rejection_reason =
    status === TEAM_PAYMENT_STATUS.REJECTED
      ? String(reason ?? '').trim() || null
      : null;
  const { error } = await supr.from(T.TEAMS).update(patch).eq('id', teamId);
  if (error) throw wrapError(error, 'STATUS COULD NOT BE UPDATED');
}

/* Http status of a failed Edge Function invoke. @supabase/functions-js
   (2.116.0) emits a CONSTANT message — "Edge Function returned a
   non-2xx status code" — that never contains the status number, so a
   /401/||/403/ test against error.message can never match. The real
   status lives on error.context (the Response). */
function emailInvokeHttpStatus(error) {
  const status =
    Number.isInteger(error?.context?.status)
      ? error.context.status
      : Number.isInteger(error?.status)
        ? error.status
        : NaN;
  return Number.isInteger(status) ? status : 0;
}

/* Confirmation email trigger — fires the send-registration-email Edge
   Function with the admin's own session JWT (the function re-checks
   is_admin() server-side). Email is best-effort and called AFTER the
   status write, so a mail outage never blocks payment verification.
   The session is verified server-side FIRST (getUser()): the Edge
   Function's auth gate performs the same stateful check, and a token
   that is signed-but-no-longer-active in Supabase Auth is exactly what
   produces the 401. The SDK attaches the live access_token to the
   invoke automatically — no manually-pinned token. */
export async function adminSendStatusEmail(teamId, action, reason = '') {
  const supabase = getAdminSupabase();
  const { error: sessionError } = await supabase.auth.getUser();
  if (sessionError) {
    throw new AppError('ADMIN SESSION EXPIRED \u2014 Sign in again.', 'ADMIN_SESSION_EXPIRED');
  }

  const { data, error } = await supabase.functions.invoke(
    'send-registration-email',
    {
      body: {
        teamId,
        action,
        reason: String(reason ?? '').trim() || undefined,
      },
    }
  );

  if (error) {
    const status = emailInvokeHttpStatus(error);
    const message =
      status === 401
        ? 'ADMIN SESSION EXPIRED \u2014 Sign in again.'
        : status === 403
        ? 'ACCESS DENIED \u2014 This account cannot send registration emails.'
        : /401/.test(String(error.message))
        ? 'ADMIN SESSION EXPIRED \u2014 Sign in again.'
        : /403/.test(String(error.message))
        ? 'ACCESS DENIED \u2014 This account cannot send registration emails.'
        : error.message || 'EMAIL SERVICE FAILED';
    throw new AppError(message, 'ADMIN_EMAIL_SEND_FAILED', error);
  }
  return data;
}

/* ── Send verification/rejection email (admin Registrations page) ──
   Calls the send-registration-email Edge Function with the tracked
   'send_verification' / 'send_rejection' actions, which perform the
   payment-status check server-side, resolve the lead email, and write
   tracking columns only after a successful SMTP send. No arbitrary
   recipient can be supplied by the browser. */
async function invokeSendEmail(teamId, action) {
  const supabase = getAdminSupabase();
  /* Same server-side session verification the Edge Function's gate
     performs — prevents firing an invoke whose token Auth considers
     inactive (the 401 the operator was hitting). */
  const { error: sessionError } = await supabase.auth.getUser();
  if (sessionError) {
    throw new AppError('ADMIN SESSION EXPIRED \u2014 Sign in again.', 'ADMIN_SESSION_EXPIRED');
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      'send-registration-email',
      {
        body: { teamId, action },
      }
    );

    if (error) {
      const status = emailInvokeHttpStatus(error);
      const message =
        status === 401
          ? 'ADMIN SESSION EXPIRED \u2014 Sign in again.'
          : status === 403
          ? 'ACCESS DENIED \u2014 This account cannot send registration emails.'
          : /401/.test(String(error.message))
          ? 'ADMIN SESSION EXPIRED \u2014 Sign in again.'
          : /403/.test(String(error.message))
          ? 'ACCESS DENIED \u2014 This account cannot send registration emails.'
          : error.message || 'EMAIL SERVICE FAILED';
      throw new AppError(message, 'ADMIN_EMAIL_SEND_FAILED', error);
    }
    return data;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(
      'EMAIL SERVICE UNREACHABLE \u2014 Check network or try again later.',
      'ADMIN_EMAIL_UNREACHABLE',
      err
    );
  }
}

export async function adminSendVerificationEmail(teamId) {
  return invokeSendEmail(teamId, 'send_verification');
}

export async function adminSendRejectionEmail(teamId) {
  return invokeSendEmail(teamId, 'send_rejection');
}

/* Filter option sources ────────────────────────────────────────── */

export async function adminFetchColleges() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.TEAMS)
    .select('college')
    .order('college', { ascending: true });
  if (error) throw wrapError(error, 'COLLEGES COULD NOT BE LOADED');
  return [...new Set((data ?? []).map((r) => String(r.college ?? '').trim()).filter(Boolean))];
}

export async function adminFetchTeamOptions() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.TEAMS)
    .select('id, team_name')
    .order('team_name', { ascending: true });
  if (error) throw wrapError(error, 'TEAM OPTIONS COULD NOT BE LOADED');
  return data ?? [];
}

/* Lightweight team_id → member-count map (participants(count) aggregate
   only) — used by the complete registration report. */
export async function adminFetchTeamMemberCounts() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.TEAMS)
    .select('id, participants(count)');
  if (error) throw wrapError(error, 'TEAM COUNTS COULD NOT BE LOADED');
  return new Map((data ?? []).map((r) => [r.id, r.participants?.[0]?.count ?? 0]));
}

/* Overview stats ───────────────────────────────────────────────── */

export async function adminFetchStats() {
  const supabase = getAdminSupabase();
  /* head=true + count:'exact' returns only the row count. Filters are
     always chained AFTER select() — never on the from() builder. */
  const count = async (table, apply) => {
    let q = supabase.from(table).select('id', { count: 'exact', head: true });
    if (apply) q = apply(q);
    const { count: c, error } = await q;
    if (error) throw wrapError(error, 'STATS COULD NOT BE LOADED');
    return c ?? 0;
  };

  const [totalTeams, totalParticipants, totalProblems, problems, rounds, legacyTeams, recentTeams, recentParticipants] =
    await Promise.all([
      count(T.TEAMS),
      count(T.PARTICIPANTS),
      count(T.PROBLEM_STATEMENTS),
      adminFetchProblems(),
      adminFetchRounds(),
      adminFetchLegacyTeamCount(),
      (async () => {
        const { data, error } = await supabase
          .from(T.TEAMS)
          .select(TEAM_EMBED)
          .order('created_at', { ascending: false })
          .range(0, 6);
        if (error) throw wrapError(error, 'RECENT TEAMS COULD NOT BE LOADED');
        return (data ?? []).map(normalizeTeam);
      })(),
      (async () => {
        const { data, error } = await supabase
          .from(T.PARTICIPANTS)
          .select(PARTICIPANT_EMBED)
          .order('created_at', { ascending: false })
          .range(0, 6);
        if (error) throw wrapError(error, 'RECENT PARTICIPANTS COULD NOT BE LOADED');
        return (data ?? []).map(normalizeParticipant);
      })(),
    ]);

  const statusCounts = {};
  await Promise.all(
    Object.values(TEAM_PAYMENT_STATUS).map(async (s) => {
      statusCounts[s] = await count(T.TEAMS, (q) => q.eq('payment_status', s));
    })
  );

  const problemCounts = new Map();
  await Promise.all(
    problems.map(async (p) => {
      problemCounts.set(
        p.id,
        await count(T.TEAMS, (q) => q.eq('problem_statement_id', p.id))
      );
    })
  );

  return {
    totalTeams,
    totalParticipants,
    totalProblems,
    statusCounts,
    problemCounts,
    problems,
    rounds,
    legacyTeams,
    activeRound: rounds.find((r) => r.status === ROUND_STATUS.ACTIVE) ?? null,
    recentTeams,
    recentParticipants,
  };
}

/* Full-dataset exports (reports) ───────────────────────────────── */

export async function adminFetchAllTeams({ search = '', paymentStatus = '', problemStatementId = '', college = '' } = {}) {
  const supabase = getAdminSupabase();
  let q = supabase.from(T.TEAMS).select(TEAM_EMBED);
  if (search) q = q.or(`team_name.ilike."%${escSearch(search)}%",college.ilike."%${escSearch(search)}%",registration_code.ilike."%${escSearch(search)}%"`);
  if (paymentStatus) q = q.eq('payment_status', paymentStatus);
  if (problemStatementId) q = q.eq('problem_statement_id', problemStatementId);
  if (college) q = q.eq('college', college);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw wrapError(error, 'TEAM REPORT COULD NOT BE LOADED');
  return (data ?? []).map(normalizeTeam);
}

export async function adminFetchAllParticipants({ search = '', paymentStatus = '', problemStatementId = '', college = '', teamId = '' } = {}) {
  const supabase = getAdminSupabase();
  let q = supabase.from(T.PARTICIPANTS).select(PARTICIPANT_EMBED);
  if (search) {
    const tree = participantSearchOrParts(search, await resolveTeamSearchIds(supabase, search));
    if (tree) q = q.or(tree);
  }
  if (paymentStatus) q = q.eq('teams.payment_status', paymentStatus);
  if (problemStatementId) q = q.eq('teams.problem_statement_id', problemStatementId);
  if (college) q = q.eq('teams.college', college);
  if (teamId) q = q.eq('team_id', teamId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw wrapError(error, 'PARTICIPANT REPORT COULD NOT BE LOADED');
  return (data ?? []).map(normalizeParticipant);
}

/* Live leaderboard ──────────────────────────────────────────────── */

/* Small boards (< a few hundred teams) — fetch the full set, exactly
   like rounds. Ordering IS the rank: score DESC, then registration age
   (older team wins a tie), then id as a final deterministic tiebreak so
   equal-score rows never shuffle between refreshes. Never stored,
   always derived. */
export async function adminFetchLeaderboard() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.LEADERBOARD)
    .select('*')
    .order('score', { ascending: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw wrapError(error, 'LEADERBOARD COULD NOT BE LOADED');
  return (data ?? []).map(normalizeLeaderboardTeam);
}

export function normalizeLeaderboardTeam(row) {
  return normalizeLeaderboardTeamPure(row);
}

/* Increase / decrease by a fixed delta — routed through the atomic
   leaderboard_adjust_score RPC so concurrent clicks never race. */
export async function adminLeaderboardAdjustScore(id, delta) {
  const d = assertLeaderboardAdjustDelta(delta);
  if (!id) throw new AppError('NO LEADERBOARD TEAM SELECTED', 'NO_LEADERBOARD_TEAM');
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc('leaderboard_adjust_score', { p_id: id, p_delta: d });
  if (error) throw wrapError(leaderboardWriteError(error), 'SCORE COULD NOT BE ADJUSTED');
  return Number(data);
}

export async function adminCreateLeaderboardTeam({ teamName, score } = {}) {
  const name = assertLeaderboardTeamName(teamName);
  const value = assertLeaderboardScore(score);
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.LEADERBOARD)
    .insert({ team_name: name, score: value })
    .select('*')
    .limit(1);
  if (error) throw wrapError(leaderboardWriteError(error), 'LEADERBOARD TEAM COULD NOT BE CREATED');
  return normalizeLeaderboardTeam(data?.[0] ?? { team_name: name, score: value });
}

export async function adminUpdateLeaderboardTeam(id, { teamName, score } = {}) {
  if (!id) throw new AppError('NO LEADERBOARD TEAM SELECTED', 'NO_LEADERBOARD_TEAM');
  const patch = {};
  if (teamName !== undefined) patch.team_name = assertLeaderboardTeamName(teamName);
  if (score !== undefined) patch.score = assertLeaderboardScore(score);
  if (!Object.keys(patch).length) throw new AppError('NO CHANGES TO SAVE', 'LEADERBOARD_VALIDATION');

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.LEADERBOARD)
    .update(patch)
    .eq('id', id)
    .select('*')
    .limit(1);
  if (error) throw wrapError(leaderboardWriteError(error), 'LEADERBOARD TEAM COULD NOT BE UPDATED');
  if (!data?.length) throw new AppError('LEADERBOARD TEAM NOT FOUND', 'LEADERBOARD_TEAM_MISSING');
  return normalizeLeaderboardTeam(data[0]);
}

/* Change an exact score (also used for reset-to-zero). */
export async function adminLeaderboardSetScore(id, score) {
  if (!id) throw new AppError('NO LEADERBOARD TEAM SELECTED', 'NO_LEADERBOARD_TEAM');
  return adminUpdateLeaderboardTeam(id, { score });
}

export async function adminDeleteLeaderboardTeam(id) {
  if (!id) throw new AppError('NO LEADERBOARD TEAM SELECTED', 'NO_LEADERBOARD_TEAM');
  const supabase = getAdminSupabase();
  const { error } = await supabase.from(T.LEADERBOARD).delete().eq('id', id);
  if (error) throw wrapError(error, 'LEADERBOARD TEAM COULD NOT BE DELETED');
}

/* Round-separated judging roll-up (view leaderboard_round_results).
   Every scored (team × round): raw total, weight, weighted score,
   possible ceiling and judge/criterion counts. Detail rows stay in
   judging_evaluation_rows — nothing is flattened here. */
export function normalizeLeaderboardRoundResult(row) {
  return normalizeLeaderboardRoundResultPure(row);
}

export async function adminFetchLeaderboardRoundResults() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.LEADERBOARD_ROUND_RESULTS)
    .select('*');
  if (error) throw wrapError(error, 'ROUND RESULTS COULD NOT BE LOADED');
  return (data ?? []).map(normalizeLeaderboardRoundResult);
}

/* Publish the judged aggregates onto the LIVE board.
   roundId = null → combined standings (weighted across all non-draft
   rounds); roundId set → that round alone, raw (unweighted) totals.
   Returns the number of leaderboard rows written. */
export async function adminSyncLeaderboardFromJudgings(roundId = null) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc('leaderboard_sync_from_judgings', {
    p_round: roundId,
  });
  if (error) throw wrapError(error, 'JUDGED SCORES COULD NOT BE PUBLISHED');
  return Number(data ?? 0);
}

/* Judging / evaluations ────────────────────────────────────────── */

/* Team rows for the Judging page: the standard team shape plus the
   round's embedded judge_evaluations so total / status / last-update
   can be derived exactly, without a second query per row. */
const JUDGING_TEAM_EMBED =
  `${TEAM_EMBED}, judge_evaluations(judging_round_id, evaluation_criteria_id, judge_id, score, updated_at)`;

export const JUDGING_SORTS = {
  teamName: { column: 'team_name', asc: true },
  college: { column: 'college', asc: true },
  createdAt: { column: 'created_at', asc: false },
};

export async function adminFetchJudgingRounds() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.JUDGING_ROUNDS)
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw wrapError(error, 'JUDGING ROUNDS COULD NOT BE LOADED');
  return (data ?? []).map(normalizeJudgingRound);
}

export function normalizeJudgingRound(row) {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug ?? '',
    description: row.description ?? '',
    status: row.status,
    weight: Number(row.weight ?? 1),
    stage: row.stage ?? null,
    startsAt: row.starts_at ?? null,
    endsAt: row.ends_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* Create a judging round from the admin UI (no migration needed to add
   a new evaluation phase). Each round carries its own criteria set. */
export async function adminCreateJudgingRound({ title, description = '', status = 'draft' } = {}) {
  const cleanTitle = String(title ?? '').trim();
  if (!cleanTitle) throw new AppError('ROUND TITLE IS REQUIRED', 'ROUND_VALIDATION');
  if (!['draft', 'active', 'closed'].includes(status)) {
    throw new AppError('INVALID ROUND STATUS', 'ROUND_VALIDATION');
  }
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.JUDGING_ROUNDS)
    .insert({
      title: cleanTitle,
      description: String(description ?? '').trim() || null,
      status,
    })
    .select('*')
    .limit(1);
  if (error) throw wrapError(error, 'ROUND COULD NOT BE CREATED');
  return normalizeJudgingRound(data?.[0]);
}

export async function adminFetchJudges() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.JUDGES)
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw wrapError(error, 'JUDGES COULD NOT BE LOADED');
  return (data ?? []).map(normalizeJudge);
}

export function normalizeJudge(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    affiliation: row.affiliation ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/* Scoring dimensions for a round — the configurable structure the
   evaluation screen renders. Never hard-coded on the client; the rows
   here ARE the (current, replaceable) marking scheme. */
export async function adminFetchEvaluationCriteria(roundId) {
  if (!roundId) throw new AppError('NO JUDGING ROUND SELECTED', 'NO_ROUND');
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.EVALUATION_CRITERIA)
    .select('*')
    .eq('judging_round_id', roundId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw wrapError(error, 'EVALUATION CRITERIA COULD NOT BE LOADED');
  return (data ?? []).map(normalizeEvaluationCriterion);
}

export function normalizeEvaluationCriterion(row) {
  return {
    id: row.id,
    judgingRoundId: row.judging_round_id,
    name: row.name,
    description: row.description ?? '',
    maxScore: Number(row.max_score),
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

/* Criteria CRUD — the placeholder marking scheme is a live config here,
   overwritten by the real scheme later. RLS keeps it admin-only. */
function validateEvaluationCriterion({ name, description, maxScore } = {}) {
  const cleanName = String(name ?? '').trim();
  const cleanMax = Number(maxScore);
  if (!cleanName) throw new AppError('CRITERION NAME IS REQUIRED', 'CRITERION_VALIDATION');
  if (!Number.isFinite(cleanMax) || cleanMax <= 0) {
    throw new AppError('MAXIMUM MARKS MUST BE GREATER THAN ZERO', 'CRITERION_VALIDATION');
  }
  return {
    name: cleanName,
    description: String(description ?? '').trim(),
    maxScore: roundToTwo(cleanMax),
  };
}

export async function adminCreateEvaluationCriterion({ judgingRoundId, name, description, maxScore } = {}) {
  if (!judgingRoundId) throw new AppError('NO JUDGING ROUND SELECTED', 'NO_ROUND');
  const clean = validateEvaluationCriterion({ name, description, maxScore });

  const supabase = getAdminSupabase();
  const { data: last, error: readError } = await supabase
    .from(T.EVALUATION_CRITERIA)
    .select('sort_order')
    .eq('judging_round_id', judgingRoundId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (readError) throw wrapError(readError, 'CRITERION COULD NOT BE CREATED');

  const row = {
    judging_round_id: judgingRoundId,
    name: clean.name,
    description: clean.description || null,
    max_score: clean.maxScore,
    sort_order: (last?.[0]?.sort_order ?? -1) + 1,
  };
  const { data, error } = await supabase
    .from(T.EVALUATION_CRITERIA)
    .insert(row)
    .select('*')
    .limit(1);
  if (error) throw wrapError(error, 'CRITERION COULD NOT BE CREATED');
  return normalizeEvaluationCriterion(data?.[0] ?? row);
}

export async function adminUpdateEvaluationCriterion(id, { name, description, maxScore } = {}) {
  if (!id) throw new AppError('NO CRITERION SELECTED', 'CRITERION_VALIDATION');
  const clean = validateEvaluationCriterion({ name, description, maxScore });

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.EVALUATION_CRITERIA)
    .update({
      name: clean.name,
      description: clean.description || null,
      max_score: clean.maxScore,
    })
    .eq('id', id)
    .select('*')
    .limit(1);
  if (error) throw wrapError(error, 'CRITERION COULD NOT BE UPDATED');
  return normalizeEvaluationCriterion(data?.[0] ?? { id });
}

export async function adminDeleteEvaluationCriterion(id) {
  if (!id) throw new AppError('NO CRITERION SELECTED', 'CRITERION_VALIDATION');
  const supabase = getAdminSupabase();
  const { error } = await supabase.from(T.EVALUATION_CRITERIA).delete().eq('id', id);
  if (error) throw wrapError(error, 'CRITERION COULD NOT BE DELETED');
}

/* Reorder the marking scheme by swapping the display order of two
   adjacent criteria. A plain pair of id-keyed updates; sort_order values
   carry no FK so existing evaluations are unaffected. */
export async function adminSwapCriterionOrder({ roundId, firstId, secondId } = {}) {
  if (!roundId) throw new AppError('NO JUDGING ROUND SELECTED', 'NO_ROUND');
  if (!firstId || !secondId || firstId === secondId) return;

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.EVALUATION_CRITERIA)
    .select('id, sort_order')
    .eq('judging_round_id', roundId)
    .in('id', [firstId, secondId]);
  if (error) throw wrapError(error, 'CRITERIA COULD NOT BE REORDERED');

  const byId = new Map((data ?? []).map((c) => [c.id, c.sort_order]));
  if (!byId.has(firstId) || !byId.has(secondId)) {
    throw new AppError('CRITERION NOT FOUND IN THIS ROUND', 'CRITERION_VALIDATION');
  }
  const firstOrder = byId.get(firstId);
  const secondOrder = byId.get(secondId);
  if (firstOrder === secondOrder) return;

  const { error: errA } = await supabase
    .from(T.EVALUATION_CRITERIA)
    .update({ sort_order: secondOrder })
    .eq('id', firstId);
  if (errA) throw wrapError(errA, 'CRITERIA COULD NOT BE REORDERED');
  const { error: errB } = await supabase
    .from(T.EVALUATION_CRITERIA)
    .update({ sort_order: firstOrder })
    .eq('id', secondId);
  if (errB) throw wrapError(errB, 'CRITERIA COULD NOT BE REORDERED');
}

/* Paginated team listing for the Judging page. Evaluations are scoped
   to the selected round via the embedded-column equality filter; each
   row is decorated with judgedCount / totalScore / lastEvaluationAt. */
export async function adminFetchJudgingTeams({
  roundId = '',
  search = '',
  sortBy = 'teamName',
  sortDir = 'asc',
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const supabase = getAdminSupabase();
  const sort = JUDGING_SORTS[sortBy] ?? JUDGING_SORTS.teamName;

  let q = supabase
    .from(T.TEAMS)
    .select(JUDGING_TEAM_EMBED, { count: 'exact' });
  if (search) {
    q = q.or(
      `team_name.ilike."%${escSearch(search)}%",college.ilike."%${escSearch(search)}%",registration_code.ilike."%${escSearch(search)}%"`
    );
  }
  if (roundId) q = q.eq('judge_evaluations.judging_round_id', roundId);

  const { data, count, error } = await q
    .order(sort.column, { ascending: sortDir === 'asc' })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw wrapError(error, 'TEAMS COULD NOT BE LOADED');
  return {
    rows: (data ?? []).map((row) => normalizeJudgingTeam(row, { roundId })),
    count: count ?? 0,
  };
}

export function normalizeJudgingTeam(row, { roundId = '' } = {}) {
  const team = normalizeTeam(row);
  const evals = (Array.isArray(row.judge_evaluations) ? row.judge_evaluations : []).filter(
    (e) => !roundId || (e.judging_round_id ?? null) === roundId
  );
  return {
    ...team,
    judgedCount: evals.length,
    totalScore: sumScores(evals),
    lastEvaluationAt: latestEvaluationAt(evals),
  };
}

export { judgingStatus };

/* Persisted round-wide totals from judging_team_round_totals (maintained
   by database triggers). Accurate for the WHOLE round — the teams list is
   paginated, the aggregate is not. */
export async function adminFetchRoundTotals(roundId) {
  if (!roundId) throw new AppError('NO JUDGING ROUND SELECTED', 'NO_ROUND');
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.JUDGING_ROUND_TOTALS)
    .select('team_id, total_score, score_possible, entries_count')
    .eq('judging_round_id', roundId);
  if (error) throw wrapError(error, 'ROUND TOTALS COULD NOT BE LOADED');
  return scoredTeamsStats(data ?? []);
}

/* Shared judging / fixed stages ────────────────────────────────── */

/* Fixed pipeline stages → round map. Returns { round_1: Round, round_2:
   Round, final: Round } for whatever stage rounds exist (the migration
   20260930000000 seeds all three idempotently). */
export async function adminFetchStageRounds() {
  const rounds = await adminFetchJudgingRounds();
  const byStage = {};
  for (const r of rounds) {
    if (r.stage) byStage[r.stage] = r;
  }
  return byStage;
}

export function stageByKey(key) {
  return STAGES.find((s) => s.key === key) ?? null;
}

/* The fixed stage rubric: exactly three placeholders "Criteria 1/2/3"
   with a non-configurable 20-mark ceiling. Rows that already exist are
   returned with their id; missing ones are returned as placeholders so
   the scoring form renders three slots even before the DB is seeded. */
export function stageCriteriaPlaceholders(criteria = []) {
  return STAGE_CRITERIA_SLOTS.map((name, i) => {
    const found = criteria.find((c) => c.name === name) ?? null;
    return (
      found ?? {
        id: null,
        name,
        description: '',
        maxScore: STAGE_CRITERIA_MAX_SCORE,
        sortOrder: i,
      }
    );
  });
}

async function fetchStageQualifiedTeamIds(stageKey, supabase) {
  const { data, error } = await supabase
    .from(T.STAGE_STATUS)
    .select('team_id')
    .eq('stage', stageKey)
    .eq('status', 'qualified');
  if (error) throw wrapError(error, 'QUALIFICATION STATUS COULD NOT BE LOADED');
  return (data ?? []).map((r) => r.team_id);
}

/* Team rows for ONE fixed stage: round_1 lists every team, round_2 and
   final list only teams explicitly qualified into that stage. Each row
   carries the stage's scored criteria count, total, last update and the
   shared per-round remark. */
const STAGE_TEAM_EMBED =
  `${TEAM_EMBED}, judge_evaluations(judging_round_id, evaluation_criteria_id, score, updated_at), team_round_remarks(judging_round_id, team_id, remark, updated_at)`;

export async function adminFetchStageTeams({
  stageKey = 'round_1',
  search = '',
  sortBy = 'teamName',
  sortDir = 'asc',
  page = 0,
  pageSize = DEFAULT_PAGE_SIZE,
} = {}) {
  const byStage = await adminFetchStageRounds();
  const round = byStage[stageKey];
  if (!round) throw new AppError('STAGE ROUND NOT CONFIGURED', 'NO_ROUND');
  const supabase = getAdminSupabase();

  const qualifiedIds =
    stageKey === 'round_1' ? null : await fetchStageQualifiedTeamIds(stageKey, supabase);

  const sort = JUDGING_SORTS[sortBy] ?? JUDGING_SORTS.teamName;
  let q = supabase.from(T.TEAMS).select(STAGE_TEAM_EMBED, { count: 'exact' });
  if (search) {
    q = q.or(
      `team_name.ilike."%${escSearch(search)}%",college.ilike."%${escSearch(search)}%",registration_code.ilike."%${escSearch(search)}%"`
    );
  }
  if (qualifiedIds) q = q.in('id', qualifiedIds);

  const { data, count, error } = await q
    .order(sort.column, { ascending: sortDir === 'asc' })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (error) throw wrapError(error, 'TEAMS COULD NOT BE LOADED');
  return {
    round,
    rows: (data ?? []).map((row) => normalizeStageTeam(row, { roundId: round.id })),
    count: count ?? 0,
  };
}

export function normalizeStageTeam(row, { roundId = '' } = {}) {
  const team = normalizeTeam(row);
  const evals = (Array.isArray(row.judge_evaluations) ? row.judge_evaluations : []).filter(
    (e) => !roundId || (e.judging_round_id ?? null) === roundId
  );
  const remarks = (Array.isArray(row.team_round_remarks) ? row.team_round_remarks : []).filter(
    (r) => !roundId || (r.judging_round_id ?? null) === roundId
  );
  return {
    ...team,
    judgedCount: evals.length,
    totalScore: sumScores(evals),
    lastEvaluationAt: latestEvaluationAt(evals),
    remark: remarks[0]?.remark ?? '',
    remarkUpdatedAt: remarks[0]?.updated_at ?? null,
  };
}

/* Existing shared marks + per-round remark for one team in one stage
   round. judge_id is ignored — the record is shared by all staff. */
export async function adminFetchSharedEvaluations({ judgingRoundId, teamId } = {}) {
  if (!judgingRoundId || !teamId) throw new AppError('NO EVALUATION CONTEXT', 'NO_TEAM');
  const supabase = getAdminSupabase();
  const [evals, remark] = await Promise.all([
    supabase
      .from(T.JUDGE_EVALUATIONS)
      .select('id, evaluation_criteria_id, score, updated_at')
      .eq('judging_round_id', judgingRoundId)
      .eq('team_id', teamId),
    supabase
      .from(T.TEAM_ROUND_REMARKS)
      .select('remark, updated_at')
      .eq('judging_round_id', judgingRoundId)
      .eq('team_id', teamId)
      .maybeSingle(),
  ]);
  if (evals.error) throw wrapError(evals.error, 'EVALUATIONS COULD NOT BE LOADED');
  if (remark.error) throw wrapError(remark.error, 'REMARK COULD NOT BE LOADED');
  return {
    rows: (evals.data ?? []).map((e) => ({
      id: e.id,
      evaluationCriteriaId: e.evaluation_criteria_id,
      score: e.score != null ? String(e.score) : '',
      updatedAt: e.updated_at,
    })),
    remark: remark.data?.remark ?? '',
    remarkUpdatedAt: remark.data?.updated_at ?? null,
  };
}

/* Persist one team's shared marks + per-round remark for a stage round
   through the atomic save_shared_evaluation RPC. Omitted criteria stay
   untouched — a blank score is never auto-zeroed. */
export async function adminSaveSharedEvaluation({
  judgingRoundId,
  teamId,
  rows = [],
  remark,
} = {}) {
  if (!judgingRoundId || !teamId) {
    throw new AppError('MISSING EVALUATION CONTEXT', 'EVALUATION_VALIDATION');
  }
  const payload = [];
  for (const r of rows) {
    if (!r?.evaluationCriteriaId) continue;
    const score = Number(r.score);
    if (!Number.isFinite(score) || score < 0) continue;
    payload.push({ evaluationCriteriaId: r.evaluationCriteriaId, score });
  }
  if (!payload.length && (remark === null || remark === undefined || String(remark).trim() === '')) {
    throw new AppError('NO SCORES TO SAVE', 'EVALUATION_VALIDATION');
  }

  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc('save_shared_evaluation', {
    p_round: judgingRoundId,
    p_team: teamId,
    p_rows: payload,
    p_remark: remark,
  });
  if (error) throw wrapError(error, 'EVALUATION COULD NOT BE SAVED');
  return Number(data ?? 0);
}

/* Cumulative admin leaderboard (view admin_judging_leaderboard): one row
   per team with Round 1 / Round 2 / Final / Cumulative + qualification. */
export function normalizeJudgingLeaderboardRow(row) {
  const num = (v) => (v === null || v === undefined ? null : Number(v));
  return {
    id: row?.[ADMIN_JUDGING_LEADERBOARD_COLS.teamId] ?? null,
    teamId: row?.[ADMIN_JUDGING_LEADERBOARD_COLS.teamId] ?? null,
    teamName: row?.[ADMIN_JUDGING_LEADERBOARD_COLS.teamName] ?? '',
    registrationCode: row?.[ADMIN_JUDGING_LEADERBOARD_COLS.registrationCode] ?? '',
    college: row?.[ADMIN_JUDGING_LEADERBOARD_COLS.college] ?? '',
    round1: num(row?.[ADMIN_JUDGING_LEADERBOARD_COLS.round1]),
    round2: num(row?.[ADMIN_JUDGING_LEADERBOARD_COLS.round2]),
    finalPresentation: num(row?.[ADMIN_JUDGING_LEADERBOARD_COLS.finalPresentation]),
    cumulative: Number(row?.[ADMIN_JUDGING_LEADERBOARD_COLS.cumulative] ?? 0),
    round2Status: row?.[ADMIN_JUDGING_LEADERBOARD_COLS.round2Status] ?? 'pending',
    finalStatus: row?.[ADMIN_JUDGING_LEADERBOARD_COLS.finalStatus] ?? 'pending',
    rank: Number(row?.[ADMIN_JUDGING_LEADERBOARD_COLS.rankNo] ?? 0),
  };
}

export async function adminFetchJudgingLeaderboard() {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.from(T.ADMIN_JUDGING_LEADERBOARD).select('*');
  if (error) throw wrapError(error, 'JUDGING LEADERBOARD COULD NOT BE LOADED');
  return (data ?? []).map(normalizeJudgingLeaderboardRow);
}

async function runJudgingRpc(name, args = {}) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw wrapError(error, 'ACTION FAILED');
  return Number(data ?? 0);
}

/* Explicit qualification / finalisation (DB is the source of truth). The
   only legal transitions: qualify top-20 into Round 2, qualify top-8 into
   the Final, finalize the top 3. Nothing is ever auto-eliminated or
   deleted when ranks change. */
export function adminQualifyRound2() {
  return runJudgingRpc('judging_qualify', {
    p_from_stage: 'round_1',
    p_to_stage: 'round_2',
    p_count: stageByKey('round_2').cutoff,
  });
}

export function adminQualifyFinal() {
  return runJudgingRpc('judging_qualify', {
    p_from_stage: 'round_2',
    p_to_stage: 'final',
    p_count: stageByKey('final').cutoff,
  });
}

export function adminFinalizeTop3() {
  return runJudgingRpc('judging_finalize_top3');
}

/* Explicit "UPDATE MAIN LEADERBOARD" publish of the cumulative scores
   onto the public leaderboard table. */
export function adminSyncCumulativeLeaderboard() {
  return runJudgingRpc('leaderboard_sync_cumulative');
}

/* ═══════════════════════════════════════════════════════════════
   Attendance (attendance system) — see public.attendance.
   Per-participant records for VERIFIED teams only; RLS admin-only.
   ═══════════════════════════════════════════════════════════════ */

const ATTENDANCE_EMBED =
  '*, teams(team_name, college, registration_code, payment_status), participants(full_name, email, phone)';

export const ATTENDANCE_SORTS = {
  markedAt: { column: 'marked_at', asc: false },
  participantName: { column: 'full_name', asc: true, referencedTable: 'participants' },
  teamName: { column: 'team_name', asc: true, referencedTable: 'teams' },
  status: { column: 'status', asc: true },
};

/* Resolve participant ids matching a name/email search (used to fold
   into the attendance or() tree — mirrors resolveTeamSearchIds). */
async function resolveParticipantSearchIds(supabase, search) {
  const esc = escSearch(search);
  if (!esc) return [];
  const { data, error } = await supabase
    .from(T.PARTICIPANTS)
    .select('id')
    .or(`full_name.ilike."%${esc}%",email.ilike."%${esc}%"`);
  if (error) throw wrapError(error, 'ATTENDANCE COULD NOT BE LOADED');
  return (data ?? []).map((r) => r.id);
}

/* Search tree for attendance rows — matches team AND participant ids.
   When the search matches nobody, a well-formed-but-nonexistent UUID
   keeps the or() valid and returns zero rows (never a malformed filter).
   (Embedded-column ilike inside or() is avoided — same reason as the
   existing participant search.) */
async function attendanceSearchOrParts(supabase, search) {
  const esc = escSearch(search);
  const [teamIds, participantIds] = await Promise.all([
    resolveTeamSearchIds(supabase, search),
    resolveParticipantSearchIds(supabase, search),
  ]);
  const NOBODY = '00000000-0000-0000-0000-000000000000';
  const orParts = [];
  if (teamIds.length) orParts.push(`team_id.in.(${teamIds.join(',')})`);
  else if (esc) orParts.push(`team_id.in.(${NOBODY})`);
  if (participantIds.length) orParts.push(`participant_id.in.(${participantIds.join(',')})`);
  else if (esc) orParts.push(`participant_id.in.(${NOBODY})`);
  return orParts.join(',');
}

export function normalizeAttendance(row) {
  const team = row?.teams ?? null;
  const participant = row?.participants ?? null;
  return {
    id: row.id,
    teamId: row.team_id,
    participantId: row.participant_id,
    status: row.status,
    markedAt: row.marked_at,
    markedBy: row.marked_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    teamName: team?.team_name ?? '',
    college: team?.college ?? '',
    registrationCode: team?.registration_code ?? '',
    paymentStatus: team?.payment_status ?? '',
    participantName: participant?.full_name ?? '',
    participantEmail: participant?.email ?? '',
    participantPhone: participant?.phone ?? '',
  };
}

/* Live scanner resolution: a verified team + participant roster + its
   saved attendance. The attendance_token is OPAQUE — the QR (or manual
   paste) is the only entry point. */
export async function adminResolveAttendanceToken(token) {
  const supabase = getAdminSupabase();
  const value = String(token ?? '').trim();
  if (!value) throw new AppError('MISSING ATTENDANCE TOKEN', 'TOKEN_MISSING');
  const { data, error } = await supabase
    .from(T.TEAMS)
    .select(`*, participants(id, full_name, email, phone, role), ${T.ATTENDANCE}(id, participant_id, status, marked_at, marked_by)`)
    .eq('attendance_token', value)
    .limit(1);
  if (error) throw wrapError(error, 'TEAM COULD NOT BE RESOLVED');
  const team = data?.[0] ?? null;
  if (!team) throw new AppError('INVALID ATTENDANCE QR', 'INVALID_QR');
  const attendanceByParticipant = new Map(
    (team.attendance ?? []).map((a) => [a.participant_id, a])
  );
  const participants = (team.participants ?? []).map((p) => ({
    id: p.id,
    fullName: p.full_name,
    email: p.email,
    phone: p.phone,
    role: p.role,
    status: attendanceByParticipant.get(p.id)?.status ?? 'absent',
    attendanceId: attendanceByParticipant.get(p.id)?.id ?? null,
    markedAt: attendanceByParticipant.get(p.id)?.marked_at ?? null,
    markedBy: attendanceByParticipant.get(p.id)?.marked_by ?? null,
  }));
  return {
    id: team.id,
    teamName: team.team_name,
    registrationCode: team.registration_code,
    college: team.college,
    paymentStatus: team.payment_status,
    attendanceToken: team.attendance_token,
    participants,
  };
}

/* Save status for a roster — update existing rows by id, insert any
   missing ones on the (team_id, participant_id) constraint. Every write
   stamps marked_at + marked_by (current admin) + updated_at. */
export async function adminSaveAttendance(teamId, participantStatuses) {
  if (!teamId) throw new AppError('NO TEAM SELECTED', 'NO_TEAM');
  const supabase = getAdminSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const adminId = sessionData?.session?.user?.id ?? null;

  const now = new Date().toISOString();
  const rows = (participantStatuses ?? [])
    .filter((p) => p && p.id)
    .map((p) => ({
      id: p.attendanceId ?? undefined,
      team_id: teamId,
      participant_id: p.id,
      status: p.status === 'present' ? 'present' : 'absent',
      marked_at: now,
      marked_by: adminId,
      updated_at: now,
    }));

  if (!rows.length) return { updated: 0 };
  const { data, error } = await supabase
    .from(T.ATTENDANCE)
    .upsert(rows, { onConflict: 'team_id,participant_id' })
    .select('id, status');
  if (error) throw wrapError(error, 'ATTENDANCE COULD NOT BE SAVED');
  return { updated: data?.length ?? rows.length };
}

/* Dashboard stats — every number derived from Supabase. attendance rows
   exist for verified teams only, so `total` == verified participants. */
export async function adminFetchAttendanceStats() {
  const supabase = getAdminSupabase();
  const count = async (apply) => {
    let q = supabase.from(T.ATTENDANCE).select('id', { count: 'exact', head: true });
    if (apply) q = apply(q);
    const { count: c, error } = await q;
    if (error) throw wrapError(error, 'ATTENDANCE STATS COULD NOT BE LOADED');
    return c ?? 0;
  };

  const total = await count();
  const present = await count((q) => q.eq('status', 'present'));
  const absent = await count((q) => q.eq('status', 'absent'));

  /* distinct teams with at least one present participant — the count
     head query counts ROWS (a team with 2 present members counts twice),
     so resolve distinct team ids from a light fetch instead. */
  const { data: presentTeams, error: teamsErr } = await supabase
    .from(T.ATTENDANCE)
    .select('team_id')
    .eq('status', 'present');
  if (teamsErr) throw wrapError(teamsErr, 'ATTENDANCE STATS COULD NOT BE LOADED');
  const presentTeamIds = new Set((presentTeams ?? []).map((r) => r.team_id));

  /* distinct verified teams with attendance rows */
  const { data: allTeams, error: allTeamsErr } = await supabase
    .from(T.ATTENDANCE)
    .select('team_id');
  if (allTeamsErr) throw wrapError(allTeamsErr, 'ATTENDANCE STATS COULD NOT BE LOADED');
  const allTeamIds = new Set((allTeams ?? []).map((r) => r.team_id));

  const teamsNotCheckedIn = Math.max(0, allTeamIds.size - presentTeamIds.size);

  return {
    total,
    present,
    absent,
    pct: total ? Math.round((present / total) * 100) : 0,
    teamsCheckedIn: presentTeamIds.size,
    teamsTotal: allTeamIds.size,
    teamsNotCheckedIn,
  };
}

/* Paginated attendance records with search / status / college filters
   and accurate counts. Search resolves team ids + participant ids first
   (embedded columns can't be or'd in this PostgREST version). */
export async function adminFetchAttendanceRecords({
  search = '',
  status = '',
  college = '',
  sortBy = 'markedAt',
  sortDir = 'desc',
  page = 0,
  pageSize = 20,
} = {}) {
  const supabase = getAdminSupabase();
  const sort = ATTENDANCE_SORTS[sortBy] ?? ATTENDANCE_SORTS.markedAt;

  let q = supabase
    .from(T.ATTENDANCE)
    .select(ATTENDANCE_EMBED, { count: 'exact' });

  if (search) {
    const orParts = await attendanceSearchOrParts(supabase, search);
    if (orParts) q = q.or(orParts);
  }
  if (status) q = q.eq('status', status);
  if (college) q = q.eq('teams.college', college);

  q = q.order(sort.column, {
    ascending: sortDir === 'asc',
    ...(sort.referencedTable ? { referencedTable: sort.referencedTable } : {}),
    ...(sort.nullsFirst ? { nullsFirst: sort.nullsFirst } : {}),
  });

  const { data, count, error } = await q.range(
    page * pageSize,
    page * pageSize + pageSize - 1
  );
  if (error) throw wrapError(error, 'ATTENDANCE RECORDS COULD NOT BE LOADED');
  return { rows: (data ?? []).map(normalizeAttendance), count: count ?? 0 };
}

/* Full dataset for exports (respects the same filters, unpaginated). */
export async function adminFetchAttendanceAll({ search = '', status = '', college = '' } = {}) {
  const supabase = getAdminSupabase();
  let q = supabase.from(T.ATTENDANCE).select(ATTENDANCE_EMBED);
  if (search) {
    const orParts = await attendanceSearchOrParts(supabase, search);
    if (orParts) q = q.or(orParts);
  }
  if (status) q = q.eq('status', status);
  if (college) q = q.eq('teams.college', college);
  const { data, error } = await q;
  if (error) throw wrapError(error, 'ATTENDANCE REPORT COULD NOT BE LOADED');
  const rows = (data ?? []).map(normalizeAttendance);
  rows.sort((a, b) =>
    (a.teamName + a.registrationCode).localeCompare(b.teamName + b.registrationCode)
  );
  return rows;
}

/* Group attendance rows per team for the TEAM SUMMARY export. */
export function collapseAttendanceTeams(rows) {
  const byTeam = new Map();
  for (const row of rows) {
    const key = row.teamId;
    if (!byTeam.has(key)) {
      byTeam.set(key, {
        teamId: key,
        registrationCode: row.registrationCode,
        teamName: row.teamName,
        college: row.college,
        teamSize: 0,
        present: 0,
        absent: 0,
      });
    }
    const t = byTeam.get(key);
    t.teamSize += 1;
    if (row.status === 'present') t.present += 1;
    else t.absent += 1;
  }
  return [...byTeam.values()].sort((a, b) =>
    a.teamName.localeCompare(b.teamName)
  );
}

/* Roster + saved statuses for one team (dashboard "view team" modal). */
export async function adminFetchAttendanceByTeam(teamId) {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from(T.ATTENDANCE)
    .select(ATTENDANCE_EMBED)
    .eq('team_id', teamId);
  if (error) throw wrapError(error, 'TEAM ATTENDANCE COULD NOT BE LOADED');
  const rows = (data ?? []).map(normalizeAttendance);
  rows.sort((a, b) => a.participantName.localeCompare(b.participantName));
  return rows;
}