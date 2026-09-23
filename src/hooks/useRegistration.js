﻿/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   HACK2PITCH 2026 â€” Registration orchestration hook
   ONE reliable flow: the wizard is 100% client-side until the final
   submit, which calls the atomic register_team(payload jsonb) RPC. There are
   NO per-step database writes â€” no teams rows, no participant rows,
   no payment updates â€” so a partial registration can never exist and
   a refresh mid-form simply restores the local session.

   Every write happens in the single submit transaction:
     â€¢ validates the team + every participant + payment proof
     â€¢ enforces EXACTLY ONE 'lead' per team
     â€¢ reuses an existing team when registration_code matches (safe
       retry â€” a refresh/resubmit never duplicates an entry)
     â€¢ writes team + participants + payment_image_url together

   Completion badges and the CONTINUE gate stay purely client-side
   (all fields valid + exactly one lead). The only server traffic
   before submit is the public problem_statements read.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

import { useCallback, useRef } from 'react';
import useRegistrationStore from '../store/registrationStore.js';
import { friendlyError } from '../lib/api.js';
import { assertSupabaseConfigured } from '../lib/config.js';
import { getProblemStatements, clearProblemCache } from '../services/problemService.js';
import {
  submitRegistration as submitRegistrationRequest,
  generateRegistrationCode,
  getActiveRegistrationRound,
} from '../services/registrationService.js';
import { uploadPaymentProofToCloudinary } from '../services/cloudinaryService.js';

export default function useRegistration() {
  const store = useRegistrationStore();
  const bootStarted = useRef(false);

  const boot = useCallback(async () => {
    if (bootStarted.current) return;
    bootStarted.current = true;

    try {
      assertSupabaseConfigured();
    } catch (err) {
      store.setBootError(friendlyError(err), 'CONFIG');
      return;
    }

    store.setLoading('boot', true);

    /* 1. Restore the in-progress form. Returns 'finished' for a
          completed run or false when there is no saved session. */
    const hydrated = store.hydrateFromSession();
    if (hydrated === 'finished') {
      store.setLoading('boot', false);
      return;
    }

    /* 2. The active registration round: gates the form and is resolved
          server-side by register_team at submit. If the rounds
          service itself cannot be reached this is fatal (a real error,
          never a fake "registration closed" state). */
    try {
      const round = await getActiveRegistrationRound();
      store.setRound(round);
      /* closed: either public_active_round returned {} (no active round)
         or the round reported open:false (full / window outside). */
      if (round && (round.open === false || !round.id)) {
        /* closed / not yet open / full â†’ the form is replaced by the
           professional closed state; nothing further is fetched. */
        store.setLoading('boot', false);
        return;
      }
    } catch (err) {
      if (err?.code === 'ROUNDS_RPC_MISSING') {
        /* public_active_round() is absent â€” the rounds migrations were
           not deployed. This must NOT silently become the flat-fee legacy
           flow while a round system is expected: surface a clean
           service-unavailable state instead. */
        console.error(
          '[registration] ROUNDS RPC NOT DEPLOYED â€” public_active_round() is missing from the Supabase schema cache. Run the registration rounds migration in the SQL Editor.',
          err
        );
        store.setLoading('boot', false);
        store.setBootError(
          'REGISTRATION UNAVAILABLE â€” The registration rounds service is not deployed yet.',
          'ROUNDS_RPC_MISSING'
        );
        return;
      } else {
        console.error('[registration] active round lookup failed', err);
        store.setBootError(friendlyError(err), 'ROUNDS_LOAD_FAILED');
        return;
      }
    }

    /* 3. The problem arena â€” problem_statements is the source of truth
          for selecting a challenge. */
    let problems = [];
    try {
      problems = await getProblemStatements();
      store.setProblems(problems);
    } catch (err) {
      /* NON-FATAL: the wizard must still open so the user can enter their
         team/college details. Step 01 renders a RETRY control, the error
         is logged and surfaced in the step UI â€” nothing is faked. */
      console.error('[registration] problems lookup failed', err);
      store.setStepError(
        'CHALLENGES UNAVAILABLE â€” The problem field could not be loaded from the database. Retry to continue.'
      );
    }

    store.setLoading('boot', false);
  }, [store]);

  /* â”€â”€ Step transitions â€” purely client-side â”€â”€ */

  const continueFromStep = useCallback(async (step) => {
    if (!store.isStepValid(step)) return false;

    store.clearStepError();
    store.markStepCompleted(step);
    store.nextStep();
    const persisted = store.persistCurrentStep();
    if (!persisted) {
      store.prevStep();
      store.setStepError(
        'STATE SAVE FAILED â€” Your progress could not be stored. Please make sure browser storage is enabled and try again.'
      );
      return false;
    }
    return true;
  }, [store]);

  const uploadProof = useCallback(async () => {
    const { proofFile: file, proofPreview, uploadStatus } = store.payment;
    if (!file || proofPreview === '') return;
    if (uploadStatus === 'uploading') return;

    store.clearStepError();
    store.setProofUploading();

    try {
      const cloud = await uploadPaymentProofToCloudinary(file);
      store.setCloudinaryDone({
        secureUrl: cloud.secureUrl,
        publicId: cloud.publicId,
        assetId: cloud.assetId,
      });
      store.setProofUploaded({
        secureUrl: cloud.secureUrl,
        publicId: cloud.publicId,
        assetId: cloud.assetId,
        uploadedAt: cloud.uploadedAt ?? new Date().toISOString(),
      });
      /* The URL lives in the local session until the atomic submit
         writes it to teams.payment_image_url. */
      store.persistCurrentStep();
    } catch (err) {
      store.setProofUploadError();
      store.setStepError(friendlyError(err));
    }
  }, [store]);

  const submitEntry = useCallback(async () => {
    if (store.isSubmitting || store.payment.uploadStatus === 'uploading') return false;

    store.clearStepError();

    /* Reserve a stable code now so a retry re-uses it â€” the RPC keyed
       on that code updates an existing entry instead of duplicating. */
    const registrationCode = store.registrationCode || generateRegistrationCode();
    if (!store.registrationCode) store.reserveRegistrationCode(registrationCode);

    store.setSubmitting(true);

    try {
      const result = await submitRegistrationRequest({
        team: store.team,
        problemStatement: store.problemStatement,
        players: store.players,
        payment: store.payment,
        registrationCode,
      });

      store.finalizeSubmission(result);

      /* The write consumed round capacity â€” refresh registered/remaining
         so the UI reflects the authoritative database state. Non-fatal. */
      try {
        const freshRound = await getActiveRegistrationRound();
        if (freshRound?.id) store.setRound(freshRound);
      } catch {
        /* keep the pre-submit round; the gate still enforces closure */
      }
      return true;
    } catch (err) {
      console.error('[registration] final submit failed', err);
      store.setSubmitting(false);

      /* A round that filled/changed while the form was open flips the
         page into the professional closed state immediately. */
      if (err?.code === 'ROUND_FULL') {
        store.setRound({
          id: store.round?.id ?? '',
          open: false,
          remaining: 0,
          title: store.round?.title ?? '',
          status: 'closed',
        });
        store.setStepError(
          'REGISTRATION ROUND IS FULL â€” No more slots remain for this phase.'
        );
      } else if (err?.code === 'ROUND_CLOSED' || err?.code === 'ROUND_CHANGED') {
        store.setRound({ open: false });
        store.setStepError(
          'REGISTRATION CLOSED â€” The registration round for this entry has ended.'
        );
      } else if (err?.code === 'ROUND_NOT_OPEN') {
        store.setRound({ open: false });
        store.setStepError(
          'REGISTRATION NOT OPEN â€” The registration round for this entry has not started yet.'
        );
      } else {
        store.setStepError(friendlyError(err));
      }

      /* Confirm what the DATABASE says now, so the gate reflects truth
         (e.g. the admin may have activated the next round) instead of
         only the synthetic state above. When backend reports no active
         round the specific OPEN/FULL synthetic state is kept. */
      try {
        const freshRound = await getActiveRegistrationRound();
        if (freshRound?.id) store.setRound(freshRound);
      } catch {
        /* RPC missing or network error â€” keep the synthetic state. */
      }
      return false;
    }
  }, [store]);

  const retryProblems = useCallback(async () => {
    store.clearBootError();
    store.clearStepError();
    store.setLoading('problems', true);
    try {
      const problems = await getProblemStatements();
      store.setProblems(problems);
      if (problems.length === 0) {
        store.setStepError(
          'CHALLENGES UNAVAILABLE â€” No problem statements were found in the database.'
        );
      }
    } catch (err) {
      console.error('[registration] problems retry failed', err);
      store.setStepError(friendlyError(err));
    }
    store.setLoading('problems', false);
  }, [store]);

  const retryBoot = useCallback(() => {
    bootStarted.current = false;
    store.clearBootError();
    if (store.registrationCode) {
      store.setLoading('boot', false);
      return;
    }
    boot();
  }, [store, boot]);

  const startFresh = useCallback(async () => {
    store.resetRegistration();
    bootStarted.current = false;
    clearProblemCache();
    store.clearStepError();
    store.setLoading('boot', true);

    try {
      const round = await getActiveRegistrationRound();
      store.setRound(round);
      if (round && (round.open === false || !round.id)) {
        store.setLoading('boot', false);
        return;
      }
    } catch (err) {
      if (err?.code === 'ROUNDS_RPC_MISSING') {
        console.error(
          '[registration] ROUNDS RPC NOT DEPLOYED â€” public_active_round() is missing from the Supabase schema cache. Run the registration rounds migration in the SQL Editor.',
          err
        );
        store.setLoading('boot', false);
        store.setBootError(
          'REGISTRATION UNAVAILABLE â€” The registration rounds service is not deployed yet.',
          'ROUNDS_RPC_MISSING'
        );
        return;
      } else {
        console.error('[registration] active round lookup failed', err);
        store.setBootError(friendlyError(err), 'ROUNDS_LOAD_FAILED');
        store.setLoading('boot', false);
        return;
      }
    }

    try {
      const problems = await getProblemStatements();
      store.setProblems(problems ?? []);
      store.setLoading('boot', false);
    } catch (err) {
      console.error('[registration] fresh problems load failed', err);
      store.setStepError(friendlyError(err));
      store.setLoading('boot', false);
    }
  }, [store]);

  return {
    store,
    boot,
    retryBoot,
    startFresh,
    continueFromStep,
    uploadProof,
    submitEntry,
    retryProblems,
  };
}