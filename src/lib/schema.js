/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Database schema map (READ-ONLY)
   The three-table architecture is the ONLY application model:

     problem_statements → teams → participants

   Each team row IS a registration; payment is a field pair on teams
   (payment_image_url + payment_status). registration_rounds manages
   open phases; leaderboard is the separate live scoreboard controlled
   from the admin panel.

   The judging system adds evaluation phases that produce scores:

     judging_rounds → evaluation_criteria → judge_evaluations
     judges ──────────────────────────────────┘
     judge_round_assignments (judges ↔ teams ↔ rounds)

   Scores from judge_evaluations feed leaderboard.score via
   leaderboard_sync_from_judgings() (weighted across non-draft judging
   rounds, see migration 20260929000000). leaderboard_round_results is
   the round-separated roll-up view. The leaderboard.team_id FK links
   the board back to a registered team when the judging pipeline is
   wired.

   There is no registrations / team_members / payments / hackathons /
   hackathon_settings table.

   This single file holds every table/column the integration touches so
   column names are adjusted in exactly one place.
   ═══════════════════════════════════════════════════════════════ */

export const T = {
  PROBLEM_STATEMENTS: 'problem_statements',
  TEAMS: 'teams',
  PARTICIPANTS: 'participants',
  REGISTRATION_ROUNDS: 'registration_rounds',
  LEADERBOARD: 'leaderboard',
  JUDGES: 'judges',
  JUDGING_ROUNDS: 'judging_rounds',
  EVALUATION_CRITERIA: 'evaluation_criteria',
  JUDGE_ROUND_ASSIGNMENTS: 'judge_round_assignments',
  JUDGE_EVALUATIONS: 'judge_evaluations',
  JUDGING_ROUND_TOTALS: 'judging_team_round_totals',
  LEADERBOARD_ROUND_RESULTS: 'leaderboard_round_results',
  TEAM_ROUND_REMARKS: 'team_round_remarks',
  STAGE_STATUS: 'judging_team_stage_status',
  QUALIFICATION_EVENTS: 'judging_qualification_events',
  ADMIN_JUDGING_LEADERBOARD: 'admin_judging_leaderboard',
  ATTENDANCE: 'attendance',
};

/* Fixed judging pipeline — the only stages the admin judging UI offers.
   qualifyingCutoff = how many teams advance out of this stage. */
export const STAGES = [
  { key: 'round_1', label: 'Round 1', cutoff: 0 },
  { key: 'round_2', label: 'Round 2', cutoff: 20 },
  { key: 'final', label: 'Final Presentation', cutoff: 8 },
];

export const FINALIZE_TOP3 = 3;

export const STAGE_STATUS_FLAGS = {
  pending: 'pending',
  qualified: 'qualified',
  eliminated: 'eliminated',
  winner: 'winner',
};

/* Fixed stage rubric: exactly three criteria, max 20 each (60 per round). */
export const STAGE_CRITERIA_SLOTS = ['Criteria 1', 'Criteria 2', 'Criteria 3'];
export const STAGE_CRITERIA_MAX_SCORE = 20;
export const STAGE_ROUND_MAX_SCORE = STAGE_CRITERIA_MAX_SCORE * STAGE_CRITERIA_SLOTS.length;

/* Admin cumulative leaderboard (view admin_judging_leaderboard). */
export const ADMIN_JUDGING_LEADERBOARD_COLS = {
  teamId: 'team_id',
  teamName: 'team_name',
  registrationCode: 'registration_code',
  college: 'college',
  problemStatementId: 'problem_statement_id',
  round1: 'round_1',
  round2: 'round_2',
  finalPresentation: 'final_presentation',
  cumulative: 'cumulative',
  round2Status: 'round_2_status',
  finalStatus: 'final_status',
  rankNo: 'rank_no',
};

export const TEAM_ROUND_REMARKS_COLS = {
  judgingRoundId: 'judging_round_id',
  teamId: 'team_id',
  remark: 'remark',
  updatedAt: 'updated_at',
};

export const PROBLEM_COLS = {
  id: 'id',
  track: 'track',
  title: 'title',
  description: 'description',
  difficulty: 'difficulty',
  createdAt: 'created_at',
};

export const TEAM_COLS = {
  id: 'id',
  hackathonId: 'hackathon_id',
  registrationCode: 'registration_code',
  teamName: 'team_name',
  college: 'college',
  problemStatementId: 'problem_statement_id',
  paymentImageUrl: 'payment_image_url',
  paymentStatus: 'payment_status',
  rejectionReason: 'rejection_reason',
  registrationRoundId: 'registration_round_id',
  registrationFee: 'registration_fee',
  verificationEmailStatus: 'verification_email_status',
  verificationEmailSentAt: 'verification_email_sent_at',
  verificationEmailLastError: 'verification_email_last_error',
  verificationEmailSendCount: 'verification_email_send_count',
  verificationEmailLastSentTo: 'verification_email_last_sent_to',
  rejectionEmailStatus: 'rejection_email_status',
  rejectionEmailSentAt: 'rejection_email_sent_at',
  rejectionEmailLastError: 'rejection_email_last_error',
  rejectionEmailSendCount: 'rejection_email_send_count',
  rejectionEmailLastSentTo: 'rejection_email_last_sent_to',
  createdAt: 'created_at',
};

export const PARTICIPANT_COLS = {
  id: 'id',
  teamId: 'team_id',
  fullName: 'full_name',
  email: 'email',
  phone: 'phone',
  foodPreference: 'food_preference',
  role: 'role',
  createdAt: 'created_at',
};

/* Live scoreboard. Rank is never stored — it is the ordering of the
   fetch (score DESC, created_at ASC). teamId is a nullable FK back to
   a registered team (see migration 20260922000000). */
export const LEADERBOARD_COLS = {
  id: 'id',
  teamId: 'team_id',
  teamName: 'team_name',
  score: 'score',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

/* leaderboard.score is a Postgres INTEGER — the scale caps here. Used
   by admin validation and the adjust RPC to reject impossible values
   with a friendly message instead of a server range error. */
export const LEADERBOARD_MAX_SCORE = 2147483647;

/* Round-separated judging roll-up (view leaderboard_round_results).
   raw_score × round_weight = weighted_score — what the round would
   contribute to the combined board. Judge/criterion detail stays in
   judging_evaluation_rows; this is the per-round aggregate only. */
export const LEADERBOARD_ROUND_RESULTS_COLS = {
  judgingRoundId: 'judging_round_id',
  roundTitle: 'round_title',
  roundStatus: 'round_status',
  roundWeight: 'round_weight',
  teamId: 'team_id',
  teamName: 'team_name',
  registrationCode: 'registration_code',
  rawScore: 'raw_score',
  weightedScore: 'weighted_score',
  scorePossible: 'score_possible',
  entriesCount: 'entries_count',
  judgesCount: 'judges_count',
  criteriaCount: 'criteria_count',
  lastScoredAt: 'last_scored_at',
};

/* Judge profiles (each row is a Supabase Auth user). */
export const JUDGE_COLS = {
  id: 'id',
  fullName: 'full_name',
  email: 'email',
  affiliation: 'affiliation',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

/* Evaluation phases — distinct from registration_rounds. Multiple
   judging rounds may exist; status follows the draft/active/closed
   lifecycle. */
export const JUDGING_ROUND_COLS = {
  id: 'id',
  title: 'title',
  slug: 'slug',
  description: 'description',
  status: 'status',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  weight: 'weight',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

/* Scoring dimensions within a judging round. */
export const EVALUATION_CRITERIA_COLS = {
  id: 'id',
  judgingRoundId: 'judging_round_id',
  name: 'name',
  description: 'description',
  maxScore: 'max_score',
  sortOrder: 'sort_order',
  createdAt: 'created_at',
};

/* Which judges evaluate which teams within a round. */
export const JUDGE_ROUND_ASSIGNMENT_COLS = {
  id: 'id',
  judgingRoundId: 'judging_round_id',
  judgeId: 'judge_id',
  teamId: 'team_id',
  createdAt: 'created_at',
};

/* The atomic scoring unit: judge × team × criterion within a round.
   Also the score history — corrections update in place, new rounds
   append new rows. */
export const JUDGE_EVALUATION_COLS = {
  id: 'id',
  judgingRoundId: 'judging_round_id',
  judgeId: 'judge_id',
  teamId: 'team_id',
  evaluationCriteriaId: 'evaluation_criteria_id',
  score: 'score',
  remark: 'remark',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
};

/* Payment statuses on the team row (admin-verified, never automatic). */
export const TEAM_PAYMENT_STATUS = {
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
};

/* Registration resolution rounds. Exactly one row has status='active'
   at a time (enforced by a database trigger). */
export const ROUND_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
};

export const ROUND_STATUS_ORDER = ['draft', 'active', 'closed'];

/* Judging rounds lifecycle — same status vocabulary as registration
   rounds, but independent (multiple judging rounds may be active). */
export const JUDGING_ROUND_STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  CLOSED: 'closed',
};

export const JUDGING_ROUND_STATUS_ORDER = ['draft', 'active', 'closed'];

/* Participant role — exactly one lead per team. Stored verbatim on
   participants.role. The database CHECK constraint (see migration) only
   accepts 'lead' and 'member', so the lead value MUST stay 'lead'. */
export const PARTICIPANT_ROLE = {
  LEAD: 'lead',
  MEMBER: 'member',
};

/* Attendance — one row per participant of a verified team. Rows are
   created the moment a team is verified and only ever mutated by admins
   (RLS on public.attendance is admin-only). */
export const ATTENDANCE_STATUS = {
  PRESENT: 'present',
  ABSENT: 'absent',
};

/* Verification email tracking on the team row. 'pending' is the
   default (never sent); the Edge Function flips it to 'sent' only after
   a successful SMTP send, or 'failed' when the send errored. */
export const VERIFICATION_EMAIL_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
};

/* Rejection email tracking on the team row — mirrors the verification
   email tracking. */
export const REJECTION_EMAIL_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  FAILED: 'failed',
};

export const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

/* Stored verbatim on participants.food_preference. */
export const FOOD_PREFERENCES = ['Veg', 'Non-Veg'];