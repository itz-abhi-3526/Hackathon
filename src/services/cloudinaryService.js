/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Cloudinary payment-screenshot upload
   The existing Cloudinary preset is UNSIGNED, so the browser can
   upload the screenshot directly and receive a secure_url. Only that
   URL is later stored in Supabase (teams.payment_image_url) — the
   image binary and Cloudinary secrets never enter Supabase.
   ═══════════════════════════════════════════════════════════════ */

import {
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_UPLOAD_PRESET,
  assertCloudinaryConfigured,
} from '../lib/config.js';
import { AppError } from '../lib/api.js';
import { validateProofFile, MAX_PROOF_BYTES } from './paymentService.js';

/**
 * Upload a payment screenshot to Cloudinary using the existing
 * unsigned preset.
 *
 * @param {File} file
 * @returns {Promise<{secureUrl: string, publicId: string, assetId: string, uploadedAt: string|null, bytes: number}>}
 */
export async function uploadPaymentProofToCloudinary(file) {
  assertCloudinaryConfigured();

  const check = validateProofFile(file);
  if (!check.ok) {
    throw new AppError(check.message, 'INVALID_FILE');
  }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  let res;
  try {
    res = await fetch(endpoint, { method: 'POST', body: form });
  } catch (err) {
    throw new AppError(
      'NETWORK ERROR — Could not reach the image service. Please check your connection and try again.',
      'NETWORK_ERROR',
      err
    );
  }

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || !payload.secure_url) {
    const message =
      payload?.error?.message ||
      'UPLOAD FAILED — Could not upload your screenshot. Please try again.';
    throw new AppError(message, 'CLOUDINARY_ERROR', payload);
  }

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id ?? '',
    assetId: payload.asset_id ?? '',
    uploadedAt: payload.created_at ?? null,
    bytes: payload.bytes ?? file.size,
  };
}

export { MAX_PROOF_BYTES };

export const CLOUDINARY_URL = () => CLOUDINARY_CLOUD_NAME
  ? `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`
  : '';