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
import { T, TEAM_PAYMENT_STATUS, ROUND_STATUS } from '../../lib/schema.js';
import { AppError } from '../../lib/api.js';

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

/* Confirmation email trigger — fires the send-registration-email Edge
   Function with the admin's own session JWT (the function re-checks
   is_admin() server-side). Email is best-effort and called AFTER the
   status write, so a mail outage never blocks payment verification. */
export async function adminSendStatusEmail(teamId, action, reason = '') {
  const supabase = getAdminSupabase();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new AppError('ADMIN SESSION EXPIRED \u2014 Sign in again.', 'ADMIN_SESSION_EXPIRED');
  }

  const { data, error } = await supabase.functions.invoke(
    'send-registration-email',
    {
      headers: { Authorization: `Bearer ${token}` },
      body: {
        teamId,
        action,
        reason: String(reason ?? '').trim() || undefined,
      },
    }
  );

  if (error) {
    const message = /401/.test(String(error.message))
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
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) {
    throw new AppError('ADMIN SESSION EXPIRED \u2014 Sign in again.', 'ADMIN_SESSION_EXPIRED');
  }

  try {
    const { data, error } = await supabase.functions.invoke(
      'send-registration-email',
      {
        headers: { Authorization: `Bearer ${token}` },
        body: { teamId, action },
      }
    );

    if (error) {
      const message = /401/.test(String(error.message))
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