/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Registration orchestration hook
   ONE reliable flow: the wizard is 100% client-side until the final
   submit, which calls the atomic submit_registration RPC. There are
   NO per-step database writes — no teams rows, no participant rows,
   no payment updates — so a partial registration can never exist and
   a refresh mid-form simply restores the local session.

   Every write happens in the single submit transaction:
     • validates the team + every participant + payment proof
     • enforces EXACTLY ONE 'lead' per team
     • reuses an existing team when registration_code matches (safe
       retry — a refresh/resubmit never duplicates an entry)
     • writes team + participants + payment_image_url together

   Completion badges and the CONTINUE gate stay purely client-side
   (all fields valid + exactly one lead). The only server traffic
   before submit is the public problem_statements read.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useRef } from 'react';
import useRegistrationStore from '../store/registrationStore.js';
import { friendlyError } from '../lib/api.js';
import { assertSupabaseConfigured } from '../lib/config.js';
import { getProblemStatements, clearProblemCache } from '../services/problemService.js';
import {
  submitEntry as submitEntryRequest,
  generateRegistrationCode,
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

    /* 2. The problem arena — problem_statements is the source of truth
          for selecting a challenge. */
    let problems = [];
    try {
      problems = await getProblemStatements();
      store.setProblems(problems);
    } catch (err) {
      /* NON-FATAL: the wizard must still open so the user can enter their
         team/college details. Step 01 renders a RETRY control, the error
         is logged and surfaced in the step UI — nothing is faked. */
      console.error('[registration] problems lookup failed', err);
      store.setStepError(
        'CHALLENGES UNAVAILABLE — The problem field could not be loaded from the database. Retry to continue.'
      );
    }

    store.setLoading('boot', false);
  }, [store]);

  /* ── Step transitions — purely client-side ── */

  const continueFromStep = useCallback(async (step) => {
    if (!store.isStepValid(step)) return false;

    store.clearStepError();
    store.markStepCompleted(step);
    store.nextStep();
    const persisted = store.persistCurrentStep();
    if (!persisted) {
      store.prevStep();
      store.setStepError(
        'STATE SAVE FAILED — Your progress could not be stored. Please make sure browser storage is enabled and try again.'
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

    /* Reserve a stable code now so a retry re-uses it — the RPC keyed
       on that code updates an existing entry instead of duplicating. */
    const registrationCode = store.registrationCode || generateRegistrationCode();
    if (!store.registrationCode) store.reserveRegistrationCode(registrationCode);

    store.setSubmitting(true);

    try {
      const result = await submitEntryRequest({
        team: store.team,
        problemStatement: store.problemStatement,
        players: store.players,
        payment: store.payment,
        registrationCode,
      });

      store.finalizeSubmission(result);
      return true;
    } catch (err) {
      console.error('[registration] final submit failed', err);
      store.setSubmitting(false);
      store.setStepError(friendlyError(err));
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
          'CHALLENGES UNAVAILABLE — No problem statements were found in the database.'
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

  const startFresh = useCallback(() => {
    store.resetRegistration();
    bootStarted.current = false;
    clearProblemCache();
    store.clearStepError();
    store.setLoading('boot', true);
    getProblemStatements()
      .then((problems) => {
        store.setProblems(problems ?? []);
        store.setLoading('boot', false);
      })
      .catch((err) => {
        console.error('[registration] fresh problems load failed', err);
        store.setStepError(friendlyError(err));
        store.setLoading('boot', false);
      });
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