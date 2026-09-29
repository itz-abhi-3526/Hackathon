/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — WhatsApp confirmation service
   (Supabase Edge Function — server-side only)

   A SECOND delivery channel for the APPROVED Meta template
   `hack2pitch_registration_confirmed`, sent to the team LEAD's
   phone after the payment is verified.

   THE ONE HARD RULE IN THIS FILE:
   It never generates a QR. It consumes `registration.qrImagePng`
   — the exact Uint8Array that `index.ts` already produced with the
   single `buildQrPng(scanUrl)` call and that `emailservice.js`
   already turns into its `cid:attendance-qr` MIME part. Same bytes,
   same payload, same attendance token, second consumer. qr.js is
   untouched and there is no second QR encoder anywhere.

   Flow (2 Meta calls):
     PNG bytes → POST /{version}/{phone_number_id}/media
              → { id: media_id }
              → POST /{version}/{phone_number_id}/messages
                 (type=template, IMAGE header = that media_id,
                  body = lead name / team name / registration code)

   Contract mirrors emailservice.js: NEVER THROWS. It returns
   `{ ok, code, ... }` so a Meta outage can never fail the email,
   the payment verification or the registration. The admin UI maps
   `code` to a message exactly like it already does for the email.

   Secrets live in the project's Edge Function secrets
   (`supabase secrets set …`) and are read server-side only. No
   token, and no recipient phone number, is ever returned to the
   browser or written to a log.
   ═══════════════════════════════════════════════════════════════ */

const GRAPH_BASE = 'https://graph.facebook.com';

/* Pinned to the Graph API version this project was manually tested
   against. Read from a secret so a version bump is an ops change
   (one `supabase secrets set`) and never a code edit. */
const API_VERSION = (Deno.env.get('WHATSAPP_API_VERSION') || 'v23.0').replace(/^\/+|\/+$/g, '');

const ACCESS_TOKEN = Deno.env.get('WHATSAPP_ACCESS_TOKEN') || '';
const PHONE_NUMBER_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
const TEMPLATE_NAME =
  Deno.env.get('WHATSAPP_TEMPLATE_NAME') || 'hack2pitch_registration_confirmed';
const TEMPLATE_LANGUAGE = Deno.env.get('WHATSAPP_TEMPLATE_LANGUAGE') || 'en';

/* Country code used ONLY when the stored lead phone is a bare 10-digit
   national number (the registration form accepts 10–12 digits, so the
   country code is not guaranteed to be present). A bare 10-digit value
   is never sent as-is and is never guessed from a default the operator
   did not set. */
const DEFAULT_COUNTRY_CODE = (
  Deno.env.get('WHATSAPP_DEFAULT_COUNTRY_CODE') || '91'
).replace(/\D/g, '');

/* Meta fetches the media asynchronously, so a send must never be
   faster than the upload. Both calls are bounded so a Meta hang
   reports FAILED in the admin UI instead of hanging the request. */
const REQUEST_TIMEOUT_MS = 20000;

/* 8-byte PNG file signature (RFC 2083). */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/**
 * Keep the QR bytes as a view over the SAME underlying memory the
 * email layer receives — no copy, no re-encode, no second generator.
 *
 * WHY THIS IS NOT emailservice.js `toPngBuffer`:
 * that helper normalizes into a Node `Buffer` because Nodemailer needs
 * one, and it is deliberately module-private so the production email
 * path is never touched. Meta needs a Blob for the multipart upload,
 * and a `Blob` accepts the `Uint8Array` directly, so exporting or
 * refactoring the email helper would buy nothing. The only property
 * this needs is the same guarantee the email relies on — never upload
 * non-image bytes to Meta — so the PNG signature is verified here with
 * the realm-safe `ArrayBuffer.isView` check (never `instanceof`, which
 * compares prototypes and can differ across the Deno module graph —
 * the exact bug that once hid the inline QR behind Gmail's alt text).
 *
 * @param {unknown} value  `registration.qrImagePng`
 * @returns {Uint8Array|null} the original bytes, or null when the value
 *   is missing, not a byte view, or not a genuine PNG.
 */
const asPngBytes = (value) => {
  try {
    if (!value || !ArrayBuffer.isView(value)) return null;
    /* honour byteOffset/byteLength so a slice never drags the whole
       backing ArrayBuffer in with it */
    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    if (bytes.byteLength <= PNG_SIGNATURE.length) return null;
    for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
      if (bytes[i] !== PNG_SIGNATURE[i]) return null;
    }
    return bytes;
  } catch {
    return null;
  }
};

/**
 * Normalize the lead's stored phone into the E.164 digits Meta wants
 * (no `+`, no spaces, no dashes).
 *
 * Rules, all explicit — a wrong prefix is a silently undelivered
 * confirmation, so nothing is inferred beyond the operator-supplied
 * default country code:
 *   • non-digits stripped
 *   • 11 digits starting with `0` → trunk zero dropped, then prefixed
 *   • 10 digits → DEFAULT_COUNTRY_CODE + number
 *   • 11–12 digits → used as-is (country code already present)
 *   • anything else → LEAD_PHONE_INVALID, no send attempted
 *
 * @param {unknown} rawPhone
 * @returns {{ ok: true, to: string } | { ok: false, code: string }}
 */
const toRecipient = (rawPhone) => {
  const raw = String(rawPhone ?? '').trim();
  if (!raw) return { ok: false, code: 'LEAD_PHONE_MISSING' };

  const digits = raw.replace(/\D/g, '');
  if (!digits) return { ok: false, code: 'LEAD_PHONE_INVALID' };

  let national = digits;
  if (national.length === 11 && national.startsWith('0')) national = national.slice(1);

  if (national.length === 10) {
    if (!DEFAULT_COUNTRY_CODE) return { ok: false, code: 'LEAD_PHONE_INVALID' };
    return { ok: true, to: `${DEFAULT_COUNTRY_CODE}${national}` };
  }
  if (national.length === 11 || national.length === 12) {
    return { ok: true, to: national };
  }
  return { ok: false, code: 'LEAD_PHONE_INVALID' };
};

/* Strip the token and any long digit run out of a Meta error string
   before it reaches the logs — the admin UI shows the CODE, the log
   shows the detail, and neither ever shows the credential. */
const safeDetail = (value) => {
  let text = String(value ?? '');
  if (ACCESS_TOKEN) text = text.split(ACCESS_TOKEN).join('[redacted]');
  return text.replace(/\d{8,}/g, '[redacted]').slice(0, 400);
};

const graphUrl = (path) => `${GRAPH_BASE}/${API_VERSION}/${PHONE_NUMBER_ID}/${path}`;

/* Meta answers 2xx with either the media object or a messages object;
   every failure carries `{ error: { message, code, … } }`. */
const readMetaError = async (response) => {
  try {
    const body = await response.json();
    const detail = body?.error?.message ?? 'NO ERROR DETAIL';
    const code = body?.error?.code;
    const subcode = body?.error?.error_subcode;
    return safeDetail(code ? `${code}/${subcode ?? '-'}: ${detail}` : detail);
  } catch {
    return `HTTP ${response.status}`;
  }
};

const configProblem = () => {
  if (!ACCESS_TOKEN) return 'WHATSAPP_ACCESS_TOKEN_MISSING';
  if (!PHONE_NUMBER_ID) return 'WHATSAPP_PHONE_NUMBER_ID_MISSING';
  return null;
};

/**
 * Step 1 — upload the team's attendance QR to Meta's media endpoint
 * and return its media id. Meta keeps media ids for ~30 days; they are
 * never reused across sends because we upload the freshly generated
 * bytes for the team being confirmed.
 *
 * @param {Uint8Array} bytes  the existing QR PNG (reference, not a copy)
 * @returns {Promise<{ ok: true, mediaId: string } | { ok: false, code: string }>}
 */
const uploadQrMedia = async (bytes) => {
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', 'image/png');
  /* filename + content type make the multipart part a real image/png */
  form.append('file', new Blob([bytes], { type: 'image/png' }), 'attendance-qr.png');

  /* Content-Type is intentionally NOT set: fetch must generate the
     multipart boundary itself. */
  const response = await fetch(graphUrl('media'), {
    method: 'POST',
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    body: form,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    return { ok: false, code: 'WHATSAPP_MEDIA_UPLOAD_FAILED', detail: await readMetaError(response) };
  }

  const body = await response.json().catch(() => null);
  const mediaId = String(body?.id ?? '').trim();
  if (!mediaId) {
    return { ok: false, code: 'WHATSAPP_MEDIA_UPLOAD_FAILED', detail: 'NO MEDIA ID RETURNED' };
  }
  return { ok: true, mediaId };
};

/**
 * Step 2 — send the approved template, with the team's own QR as the
 * IMAGE header and the three real body variables:
 *   {{1}} team lead name  {{2}} team name  {{3}} registration ID
 *
 * @returns {Promise<{ ok: true, messageId: string } | { ok: false, code: string, detail?: string }>}
 */
const sendTemplateMessage = async (recipient, mediaId, params) => {
  const response = await fetch(graphUrl('messages'), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: recipient,
      type: 'template',
      template: {
        name: TEMPLATE_NAME,
        language: { code: TEMPLATE_LANGUAGE },
        components: [
          {
            type: 'header',
            parameters: [{ type: 'image', image: { id: mediaId } }],
          },
          {
            type: 'body',
            parameters: [
              { type: 'text', text: params.leadName },
              { type: 'text', text: params.teamName },
              { type: 'text', text: params.registrationCode },
            ],
          },
        ],
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    return { ok: false, code: 'WHATSAPP_SEND_FAILED', detail: await readMetaError(response) };
  }

  const body = await response.json().catch(() => null);
  const messageId = String(body?.messages?.[0]?.id ?? '').trim();
  if (!messageId) {
    return { ok: false, code: 'WHATSAPP_SEND_FAILED', detail: 'NO MESSAGE ID RETURNED' };
  }
  return { ok: true, messageId };
};

/**
 * Send the registration-confirmed WhatsApp message to the team lead.
 *
 * Consumes, never produces, the attendance QR: `registration.qrImagePng`
 * is the exact byte view `index.ts` already created from the single
 * `buildQrPng(scanUrl)` call. Nothing here is allowed to throw — the
 * caller writes tracking from the returned code, and the email channel
 * is on a completely separate code path.
 *
 * @param {object} registration  normalized registration from index.ts,
 *   carrying `qrImagePng`, `leadName`, `leadPhone`, `name` (team name)
 *   and `registrationCode`.
 * @returns {Promise<{ ok: boolean, code: string, to?: string, mediaId?: string,
 *   messageId?: string, detail?: string, missingField?: string }>}
 */
const sendWhatsappConfirmation = async (registration) => {
  const missingConfig = configProblem();
  if (missingConfig) {
    console.error('[WhatsAppService] not configured:', missingConfig);
    return { ok: false, code: missingConfig };
  }

  const recipient = toRecipient(registration?.leadPhone);
  if (!recipient.ok) {
    /* No number, or a number that cannot be resolved to a country code
       without guessing — the admin must fix the registration. */
    return { ok: false, code: recipient.code };
  }

  /* Template body variables are rejected by Meta when empty, so the
     gap is reported as a code instead of being sent as ''. */
  const params = {
    leadName: String(registration?.leadName ?? '').trim(),
    teamName: String(registration?.name ?? '').trim(),
    registrationCode: String(registration?.registrationCode ?? '').trim(),
  };
  const missingField = ['leadName', 'teamName', 'registrationCode'].find(
    (key) => !params[key]
  );
  if (missingField) {
    return { ok: false, code: 'TEMPLATE_PARAMETER_MISSING', missingField };
  }

  const bytes = asPngBytes(registration?.qrImagePng);
  if (!bytes) {
    return { ok: false, code: 'QR_IMAGE_MISSING' };
  }

  try {
    const media = await uploadQrMedia(bytes);
    if (!media.ok) {
      console.error('[WhatsAppService] media upload failed:', media.detail);
      return { ok: false, code: media.code, detail: media.detail };
    }

    const sent = await sendTemplateMessage(recipient.to, media.mediaId, params);
    if (!sent.ok) {
      console.error('[WhatsAppService] template send failed:', sent.detail);
      return { ok: false, code: sent.code, detail: sent.detail };
    }

    /* Safe diagnostics only — byte count, template name and Meta's
       message id. Never the recipient number, the access token or the
       media id. */
    console.log(
      '[WhatsAppService] confirmation sent | template:',
      TEMPLATE_NAME,
      '| api:',
      API_VERSION,
      '| qr bytes:',
      bytes.byteLength,
      '| media id set:',
      Boolean(media.mediaId),
      '| messageId:',
      sent.messageId
    );

    return {
      ok: true,
      code: 'WHATSAPP_SENT',
      to: recipient.to,
      mediaId: media.mediaId,
      messageId: sent.messageId,
    };
  } catch (err) {
    /* Network abort, DNS failure, unexpected runtime error — still a
       WhatsApp-only failure. The email path is untouched. */
    console.error('[WhatsAppService] unexpected failure:', safeDetail(err?.message ?? err));
    return { ok: false, code: 'WHATSAPP_SEND_FAILED' };
  }
};

// ===============================
// EXPORTS
// ===============================
export { sendWhatsappConfirmation };
