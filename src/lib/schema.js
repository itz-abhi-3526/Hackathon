/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Database schema map (READ-ONLY)
   The three-table architecture is the ONLY application model:

     problem_statements → teams → participants

   There is no registrations / team_members / payments / hackathons /
   hackathon_settings table. The team row IS the registration; payment
   is a field pair on teams (payment_image_url + payment_status).

   This single file holds every table/column the integration touches so
   column names are adjusted in exactly one place.
   ═══════════════════════════════════════════════════════════════ */

export const T = {
  PROBLEM_STATEMENTS: 'problem_statements',
  TEAMS: 'teams',
  PARTICIPANTS: 'participants',
  REGISTRATION_ROUNDS: 'registration_rounds',
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
  registrationRoundId: 'registration_round_id',
  registrationFee: 'registration_fee',
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

/* Participant role — exactly one lead per team. Stored verbatim on
   participants.role. The database CHECK constraint (see migration) only
   accepts 'lead' and 'member', so the lead value MUST stay 'lead'. */
export const PARTICIPANT_ROLE = {
  LEAD: 'lead',
  MEMBER: 'member',
};

export const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced'];

/* Stored verbatim on participants.food_preference. */
export const FOOD_PREFERENCES = ['Veg', 'Non-Veg'];