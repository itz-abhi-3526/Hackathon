import { create } from 'zustand';
import { PARTICIPANT_ROLE } from '../lib/schema.js';
import { validateEntry, validateParticipants } from '../services/registrationService.js';

const SESSION_KEY = 'vh_registration_form';

/* Every entry into the registration page mints a new session id. A
   persisted draft stamped with a DIFFERENT id belongs to a previous
   registration attempt and is never restored — this is the boundary
   between "the current registration" and stale data. */
function genSessionId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSession(payload) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    return true;
  } catch (err) {
    console.warn('[registrationStore] sessionStorage unavailable — in-memory form state still works.', err);
    return false;
  }
}

function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* noop */
  }
}

const createEmptyPlayer = (id) => ({
  id,
  name: '',
  email: '',
  phone: '',
  foodPreference: '', // 'Veg' | 'Non-Veg'
  role: id === 1 ? PARTICIPANT_ROLE.LEAD : PARTICIPANT_ROLE.MEMBER,
  /* Database row id once the participant is persisted. A slot without
     a dbId has never been written; one with a dbId UPDATEd in place. */
  dbId: null,
  saveError: '',
});

const EMPTY_PROOF = {
  proofUrl: '',
  publicId: '',
  assetId: '',
  uploadedAt: null,
};

const EMPTY_TEAM = { name: '', college: '', size: 2 };

const EMPTY_TEAM_SAVED = { name: '', problemStatementId: null };

const useRegistrationStore = create((set, get) => ({
  /* Identifies the CURRENT registration attempt. Changed on every new
     session so a previous team's summary can never surface again. */
  sessionId: genSessionId(),

  currentStep: 0,
  completedSteps: [],

  team: { ...EMPTY_TEAM },
  /* True from the first explicit Step 02 (TEAM SIZE) selection. The
     sidebar/mobile TOTAL only becomes a real amount after a size is
     chosen — until then Step 01 stays price-neutral and shows
     "SELECT TEAM SIZE" even though the store's default size is 2. */
  teamSizeSelected: false,
  players: [createEmptyPlayer(1), createEmptyPlayer(2)],
  problemStatement: null,

  /* The persistent teams row this registration maps to. teamId is kept
     once the user leaves Step 01 so no duplicate team is ever created. */
  teamId: null,
  registrationCode: '',
  /* Snapshot of the last successfully-saved team row (name + problem). */
  teamSaved: { ...EMPTY_TEAM_SAVED },

  /* Frontend payment proof state.
     status: 'awaiting_payment' -> 'proof_selected' -> 'proof_submitted'
     uploadStatus tracks the REAL Cloudinary upload:
     'idle' -> 'uploading' -> 'success' | 'error'.
     'success' is only reached when Cloudinary returned a secure_url. */
  payment: {
    status: 'awaiting_payment',
    uploadStatus: 'idle',
    proofFile: null,
    proofPreview: '',
    proofName: '',
    proofSize: 0,
    proofUrl: '',
    publicId: '',
    assetId: '',
    uploadedAt: null,
    /* True once the Cloudinary URL has been written to the teams row. */
    persisted: false,
  },

  /* Public problem arena, loaded at boot from problem_statements. */
  problems: [],

  /* Current active registration round (from public_active_round).
     null until fetched; {} means "no round / registration closed". */
  round: null,

  /* Orchestration flags. */
  loading: {
    boot: false,
    problems: false,
    uploading: false,
    submitting: false,
  },
  bootError: '',
  bootErrorCode: '',
  stepError: '',

  /* Final submission truth (server confirmed). */
  paymentStatus: '',
  submittedAt: null,
  isSubmitting: false,
  /* Authoritative fee returned by register_team for THIS team (active
     round + team size). Displayed on the success pass; never edited
     client-side. */
  registrationFee: null,

  setStep: (step) => set({ currentStep: step }),

  nextStep: () => set((state) => ({
    currentStep: Math.min(state.currentStep + 1, 5),
    completedSteps: [...new Set([...state.completedSteps, state.currentStep])],
  })),

  prevStep: () => set((state) => ({
    currentStep: Math.max(state.currentStep - 1, 0),
  })),

  updateTeam: (updates) => set((state) => {
    const team = { ...state.team, ...updates };
    writeSession(serialize(state.currentStep, state, team, state.players, state.problemStatement, state.payment));
    return { team };
  }),

  /* Changing size keeps every already-entered participant. */
  setTeamSize: (size) => set((state) => {
    const newPlayers = [];
    for (let i = 0; i < size; i++) {
      newPlayers.push(state.players[i] || createEmptyPlayer(i + 1));
    }
    if (!newPlayers.some((p) => p.role === PARTICIPANT_ROLE.LEAD) && newPlayers.length > 0) {
      newPlayers[0].role = PARTICIPANT_ROLE.LEAD;
    }
    const team = { ...state.team, size };
    writeSession(serialize(state.currentStep, state, team, newPlayers, state.problemStatement, state.payment));
    return { team, players: newPlayers, teamSizeSelected: true };
  }),

  /* Exactly one lead — setting one clears every other. */
  setTeamLead: (playerId) => {
    set((state) => ({
      players: state.players.map((p) => ({
        ...p,
        role: p.id === playerId ? PARTICIPANT_ROLE.LEAD : PARTICIPANT_ROLE.MEMBER,
        saveError: '',
      })),
    }));
    const s = get();
    writeSession(serialize(s.currentStep, s, s.team, s.players, s.problemStatement, s.payment));
  },

  /* Per-participant state: each input only touches its own slot. */
  updatePlayer: (playerId, updates) => set((state) => {
    const players = state.players.map((p) =>
      p.id === playerId ? { ...p, ...updates, saveError: '' } : p
    );
    writeSession(serialize(state.currentStep, state, state.team, players, state.problemStatement, state.payment));
    return { players };
  }),

  setProblemStatement: (problem) => set((state) => {
    writeSession(serialize(state.currentStep, state, state.team, state.players, problem, state.payment));
    return { problemStatement: problem };
  }),

  setProblems: (problems) => set({ problems }),

  setRound: (round) => set({ round: round ?? null }),

  setLoading: (key, value) => set((state) => ({
    loading: { ...state.loading, [key]: value },
  })),

  setBootError: (message, code = '') => set({
    bootError: message || '',
    bootErrorCode: code || '',
  }),
  clearBootError: () => set({ bootError: '', bootErrorCode: '' }),

  setStepError: (message) => set({ stepError: message || '' }),
  clearStepError: () => set({ stepError: '' }),

  markStepCompleted: (step) => set((state) => ({
    completedSteps: [...new Set([...state.completedSteps, step])],
  })),

  /* ── Team persistence bookkeeping ── */

  initTeam: ({ teamId, registrationCode }) => {
    const prev = get();
    set({
      teamId: teamId || null,
      registrationCode: registrationCode || '',
      teamSaved: {
        name: String(prev.team.name ?? '').trim(),
        problemStatementId: prev.problemStatement?.id ?? null,
      },
    });
    const s = get();
    writeSession(serialize(s.currentStep, s, s.team, s.players, s.problemStatement, s.payment));
  },

  applyTeamSaved: () => set((state) => ({
    teamSaved: {
      name: String(state.team.name ?? '').trim(),
      problemStatementId: state.problemStatement?.id ?? null,
    },
  })),

  dropTeamId: () => {
    set({ teamId: null, registrationCode: '' });
    const s = get();
    writeSession(serialize(s.currentStep, s, s.team, s.players, s.problemStatement, s.payment));
  },

  /* Reserve a stable registration code BEFORE the first submit and
     keep it in the session. The atomic RPC keyed on this code reuses
     an existing team, so a retry after a lost response can never
     duplicate an entry. */
  reserveRegistrationCode: (code) => {
    if (!code) return;
    set({ registrationCode: code });
    const s = get();
    writeSession(serialize(s.currentStep, s, s.team, s.players, s.problemStatement, s.payment));
  },

  /* Restore the wizard from the persisted teams/participants rows so a
     refresh finds every already-saved member filled in and linked. */
  applyServerState: ({ team, participants, problems }) => {
    const state = get();
    const rows = Array.isArray(participants) ? participants : [];
    const size = Math.max(Number(state.team.size) || 2, rows.length);
    const players = rows.map((r, i) => ({
      id: i + 1,
      name: r.full_name ?? '',
      email: r.email ?? '',
      phone: r.phone ?? '',
      foodPreference: r.food_preference ?? '',
      role:
        r.role === PARTICIPANT_ROLE.LEAD || r.role === 'team_lead'
          ? PARTICIPANT_ROLE.LEAD
          : PARTICIPANT_ROLE.MEMBER,
      dbId: r.id,
      saveError: '',
    }));
    while (players.length < size) players.push(createEmptyPlayer(players.length + 1));

    const problemStatement =
      (Array.isArray(problems) ? problems.find((p) => p.id === team.problem_statement_id) : null) ||
      state.problemStatement;
    const name = String(team.team_name ?? '') || state.team.name;
    const college = String(team.college ?? '') || state.team.college;

    set({
      team: { ...state.team, name, college, size },
      players,
      problemStatement,
      teamId: team.id,
      registrationCode: team.registration_code || state.registrationCode,
      teamSaved: {
        name: String(team.team_name ?? '') || state.team.name,
        problemStatementId: team.problem_statement_id ?? null,
      },
    });
    const s = get();
    writeSession(serialize(s.currentStep, s, s.team, s.players, s.problemStatement, s.payment));
  },

  /* ── Participant persistence bookkeeping ── */

  applyPlayerSave: (slotId, { dbId }) => set((state) => ({
    players: state.players.map((p) =>
      p.id === slotId ? { ...p, dbId: dbId ?? null, saveError: '' } : p
    ),
  })),

  applyPlayerSaveError: (slotId, message) => set((state) => ({
    players: state.players.map((p) =>
      p.id === slotId ? { ...p, saveError: message || '' } : p
    ),
  })),

  clearPlayerSaveErrors: () => set((state) => ({
    players: state.players.map((p) => ({ ...p, saveError: '' })),
  })),

  applyPaymentPersisted: () => set((state) => ({
    payment: { ...state.payment, persisted: true },
  })),

  /* ── Payment proof upload lifecycle (Cloudinary only) ── */

  selectPaymentProof: (file, preview, name, size) => {
    const state = get();
    if (state.payment.proofPreview && state.payment.proofPreview !== preview) {
      try { URL.revokeObjectURL(state.payment.proofPreview); } catch { /* noop */ }
    }
    set({
      payment: {
        ...state.payment,
        status: 'proof_selected',
        uploadStatus: 'idle',
        proofFile: file,
        proofPreview: preview,
        proofName: name,
        proofSize: size,
        persisted: false,
        ...EMPTY_PROOF,
      },
    });
    const s = get();
    writeSession(serialize(s.currentStep, s, s.team, s.players, s.problemStatement, s.payment));
  },

  removePaymentProof: () => {
    const state = get();
    if (state.payment.proofPreview) {
      try { URL.revokeObjectURL(state.payment.proofPreview); } catch { /* noop */ }
    }
    set({
      payment: {
        status: 'awaiting_payment',
        uploadStatus: 'idle',
        proofFile: null,
        proofPreview: '',
        proofName: '',
        proofSize: 0,
        persisted: false,
        ...EMPTY_PROOF,
      },
    });
    const s = get();
    writeSession(serialize(s.currentStep, s, s.team, s.players, s.problemStatement, s.payment));
  },

  setProofUploading: () => set((state) => ({
    payment: { ...state.payment, uploadStatus: 'uploading' },
    loading: { ...state.loading, uploading: true },
  })),

  setCloudinaryDone: ({ secureUrl, publicId, assetId }) => set((state) => ({
    payment: { ...state.payment, proofUrl: secureUrl, publicId, assetId },
    loading: { ...state.loading, uploading: true },
  })),

  /* Cloudinary returned a real URL — proof is "uploaded to the cloud".
     The URL is written to teams.payment_image_url when the user
     leaves the payment step and again at final submit. */
  setProofUploaded: ({ secureUrl, publicId, assetId, uploadedAt }) => set((state) => ({
    payment: {
      ...state.payment,
      status: 'proof_submitted',
      uploadStatus: 'success',
      proofUrl: secureUrl,
      publicId,
      assetId,
      uploadedAt: uploadedAt ?? null,
    },
    loading: { ...state.loading, uploading: false },
  })),

  setProofUploadError: () => set((state) => ({
    payment: { ...state.payment, uploadStatus: 'error' },
    loading: { ...state.loading, uploading: false },
  })),

  /* ── Final submission — server confirmation only ── */

  setSubmitting: (value) => set((state) => ({
    isSubmitting: value,
    loading: { ...state.loading, submitting: value },
  })),

  finalizeSubmission: ({ registrationCode, paymentStatus, submittedAt, teamId, registrationFee }) => {
    const code = registrationCode || get().registrationCode || '';
    if (code) {
      /* mark the run as done so a refresh lands on the success state
         (form data is kept for the pass screen) */
      writeSession({ ...readSession(), finished: true, step: 5 });
    }
    set({
      registrationCode: code,
      paymentStatus: paymentStatus || 'submitted',
      submittedAt: submittedAt || new Date().toISOString(),
      registrationFee:
        registrationFee !== undefined && registrationFee !== null
          ? Number(registrationFee)
          : get().registrationFee,
      currentStep: 5,
      completedSteps: [0, 1, 2, 3, 4],
      teamId: teamId || get().teamId,
      isSubmitting: false,
      loading: { ...get().loading, submitting: false },
    });
  },

  /* Rehydrate from the session form. Client-side state plus the
     persisted teamId. For a finished run the registrationCode is
     restored so the success pass survives a refresh. */
  hydrateFromSession: () => {
    const session = readSession();
    if (!session) return false;

    /* A stored draft belongs to the CURRENT registration attempt only
       when it carries THIS store's session id. Anything else — a legacy
       draft with no id, or a previous registration's id — belongs to a
       past session and is wiped so it can never render again. */
    if (session.sessionId !== get().sessionId) {
      clearSession();
      return false;
    }

    const team = { ...EMPTY_TEAM, ...(session.team ?? {}) };
    let players = Array.isArray(session.players)
      ? session.players
      : [createEmptyPlayer(1), createEmptyPlayer(2)];
    if (!players.some((p) => p.role === PARTICIPANT_ROLE.LEAD) && players.length) {
      players = players.map((p, i) => ({ ...p, role: i === 0 ? PARTICIPANT_ROLE.LEAD : p.role }));
    }
    players = players.map((p) => ({
      ...createEmptyPlayer(p.id),
      ...p,
      role:
        p.role === PARTICIPANT_ROLE.LEAD || p.role === 'lead' || p.role === 'team_lead'
          ? PARTICIPANT_ROLE.LEAD
          : PARTICIPANT_ROLE.MEMBER,
      saveError: '',
    }));
    players = players.slice(0, team.size);
    while (players.length < team.size) players.push(createEmptyPlayer(players.length + 1));

    const problemStatement = session.problemStatement ?? null;
    const payment = {
      status: session.payment?.proofUrl ? 'proof_submitted' : 'awaiting_payment',
      uploadStatus: session.payment?.proofUrl ? 'success' : 'idle',
      proofFile: null,
      proofPreview: '',
      proofName: '',
      proofSize: 0,
      proofUrl: session.payment?.proofUrl ?? '',
      publicId: session.payment?.publicId ?? '',
      assetId: session.payment?.assetId ?? '',
      uploadedAt: session.payment?.uploadedAt ?? null,
      persisted: Boolean(session.payment?.proofUrl),
    };

    set({
      team,
      players,
      problemStatement,
      payment,
      teamId: session.teamId ?? null,
      registrationCode: session.registrationCode ?? '',
      /* A stored session that reached Step 02+ has already had its team
         size fixed — treat that as "selected" so a refresh keeps showing
         the chosen amount instead of reverting to "SELECT TEAM SIZE". */
      teamSizeSelected:
        session.teamSizeSelected ??
        (Number(session.step) >= 1 && Boolean(session.team?.size)),
      registrationFee:
        session.registrationFee !== undefined && session.registrationFee !== null
          ? Number(session.registrationFee)
          : null,
      currentStep: session.finished
        ? 5
        : Math.min(Math.max(Number(session.step) || 0, 0), 4),
      isSubmitting: false,
    });
    return session.finished ? 'finished' : (session.teamId ?? null);
  },

  persistCurrentStep: () => {
    const state = get();
    return writeSession(serialize(state.currentStep, state, state.team, state.players, state.problemStatement, state.payment));
  },

  /* Fresh start — every entry into the registration page becomes a NEW
     registration session (new id, cleared draft, cleared flags) so a
     previous team's summary can never surface. */
  resetRegistration: () => {
    clearSession();
    set({
      sessionId: genSessionId(),
      currentStep: 0,
      completedSteps: [],
      team: { ...EMPTY_TEAM },
      teamSizeSelected: false,
      players: [createEmptyPlayer(1), createEmptyPlayer(2)],
      problemStatement: null,
      teamId: null,
      registrationCode: '',
      teamSaved: { ...EMPTY_TEAM_SAVED },
      round: null,
      payment: {
        status: 'awaiting_payment',
        uploadStatus: 'idle',
        proofFile: null,
        proofPreview: '',
        proofName: '',
        proofSize: 0,
        persisted: false,
        ...EMPTY_PROOF,
      },
      paymentStatus: '',
      submittedAt: null,
      isSubmitting: false,
      registrationFee: null,
      stepError: '',
      bootError: '',
      bootErrorCode: '',
      loading: { boot: false, problems: false, uploading: false, submitting: false },
    });
  },

  getLeadPlayer: () => get().players.find((p) => p.role === PARTICIPANT_ROLE.LEAD),

  /* Completion is computed live from the current form values — never
     from a cached flag or from whether a database row exists. */
  isStepValid: (step) => {
    const state = get();
    switch (step) {
      case 0:
        return (
          String(state.team.name ?? '').trim() !== '' &&
          String(state.team.college ?? '').trim() !== '' &&
          state.problemStatement !== null
        );
      case 1:
        return state.team.size >= 2 && state.team.size <= 4;
      case 2:
        /* Step 03 (crew passes) is gated ONLY on team + track + size +
           every participant being complete + exactly one lead.
           Payment is never consulted here — it only matters on the
           final review/submit. */
        return validateParticipants({
          team: state.team,
          problemStatement: state.problemStatement,
          players: state.players,
        }).length === 0;
      case 3:
        return state.payment.uploadStatus === 'success' && Boolean(state.payment.proofUrl);
      case 4:
        return validateEntry({
          team: state.team,
          problemStatement: state.problemStatement,
          players: state.players,
          payment: state.payment,
        }).length === 0;
      default:
        return true;
    }
  },
}));

function serialize(step, state, team, players, problemStatement, payment) {
  return {
    sessionId: state?.sessionId ?? '',
    step,
    teamId: state?.teamId ?? null,
    registrationCode: state?.registrationCode ?? '',
    teamSizeSelected: Boolean(state?.teamSizeSelected),
    registrationFee:
      state?.registrationFee !== undefined && state?.registrationFee !== null
        ? Number(state.registrationFee)
        : null,
    team,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      phone: p.phone,
      foodPreference: p.foodPreference,
      role: p.role,
      dbId: p.dbId ?? null,
    })),
    problemStatement: problemStatement || null,
    payment: {
      proofUrl: payment?.proofUrl ?? '',
      publicId: payment?.publicId ?? '',
      assetId: payment?.assetId ?? '',
      uploadedAt: payment?.uploadedAt ?? null,
    },
    finished: false,
  };
}

export default useRegistrationStore;