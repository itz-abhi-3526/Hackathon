/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Payment proof (frontend only)
   There is NO payments table and NO payment gateway. The screenshot
   uploads straight from the browser to Cloudinary (existing UNSIGNED
   preset — see cloudinaryService.js). The resulting secure_url lives on
   the teams row (teams.payment_image_url), with teams.payment_status
   flipped to 'submitted' when the user leaves the payment step and
   again at final submission.

   Payment verification is an admin operation performed on teams —
   this module never claims a payment was verified.
   ═══════════════════════════════════════════════════════════════ */

export const ACCEPTED_PROOF_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_PROOF_BYTES = 10 * 1024 * 1024; // 10 MB

export function validateProofFile(file) {
  if (!file) return { ok: false, message: 'NO FILE SELECTED' };
  if (!ACCEPTED_PROOF_TYPES.includes(file.type)) {
    return { ok: false, message: 'PLEASE USE PNG, JPG OR WEBP' };
  }
  if (file.size > MAX_PROOF_BYTES) {
    return { ok: false, message: 'FILE TOO LARGE \u2014 MAX 10 MB' };
  }
  return { ok: true };
}