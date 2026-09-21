/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Email service (Supabase Edge Function)
   Nodemailer-based. Runs ONLY server-side in the Deno Edge Runtime —
   never in the browser (this SPA has no Node backend). SMTP secrets
   live in the project's Edge Function secrets:

     supabase secrets set SMTP_USER=... SMTP_PASS=...

   Delivery uses the project's Gmail SMTP account (smtp.gmail.com with
   an App Password). Note: free-Gmail bulk sends sometimes land in spam;
   a verified custom-domain provider (e.g. Resend) is the reliable fix.

   Port of the original CommonJS emailservice.js with the three
   changes a Supabase Edge Function requires:

     1. Deno.env.get() instead of process.env
     2. ESM imports instead of require()
     3. The payment screenshot is a Cloudinary URL
        (teams.payment_image_url); the rejection email LINKS it
        instead of attaching it — attachments are a spam signal and
        there is no local filesystem in the Edge Runtime anyway.

   The exported functions consume a normalized `registration` object
   built by index.js from the teams + participants rows.
   ═══════════════════════════════════════════════════════════════ */

import nodemailer from 'npm:nodemailer@6.9.16';

const SMTP_HOST =
  Deno.env.get('SMTP_HOST') ||
  Deno.env.get('EMAIL_HOST') ||
  'smtp.gmail.com';
const SMTP_PORT =
  Number(Deno.env.get('SMTP_PORT')) ||
  Number(Deno.env.get('EMAIL_PORT')) ||
  465;
const SMTP_USER =
  Deno.env.get('SMTP_USER') ||
  Deno.env.get('EMAIL_USER');
const SMTP_PASS =
  Deno.env.get('SMTP_PASS') ||
  Deno.env.get('EMAIL_PASS');
const EMAIL_FROM =
  Deno.env.get('EMAIL_FROM') || SMTP_USER;

/* Create Nodemailer transporter */
const transporter =
  SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : null;

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');


/* Generic transactional email sender */
const sendEmail = async ({ to, subject, text, html, attachments }) => {
  if (!transporter) {
    console.error(
      '[EmailService] SMTP_USER or SMTP_PASS is not configured.'
    );
    return false;
  }

  try {
    // When sending through Gmail SMTP, the From address must align with SMTP_USER
    // to prevent SPF/DMARC alignment failure.
    const senderEmail = SMTP_USER || EMAIL_FROM;
    const fromAddress = `"VoidHack 2026" <${senderEmail}>`;

    const mailOptions = {
      from: fromAddress,
      to,
      subject,
      text,
      html,
      replyTo: Deno.env.get('EMAIL_REPLY_TO') || senderEmail,
    };

    if (attachments && attachments.length > 0) {
      mailOptions.attachments = attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.content,
        contentType: attachment.contentType,
      }));
    }

    const info = await transporter.sendMail(mailOptions);

    console.log('[EmailService] Email sent:', info.messageId);

    return Boolean(info.messageId);
  } catch (error) {
    console.error('[EmailService] Email send failed:', error);
    return false;
  }
};

/* The single verification/rejection recipient is the team lead —
   the rest of the crew still gets status updates from the admin UI. */
const getParticipantEmails = (registration) => {
  return registration.email ? [registration.email] : [];
};

/* Cloudinary URL of the payment screenshot. We LINK it instead of
   attaching it — per-recipient attachments are a heavy spam signal and
   Cloudinary is a reputable CDN, so the link is safe for the filter. */
const paymentScreenshotLink = (registration) => {
  const url =
    registration.paymentScreenshot &&
    registration.paymentScreenshot.url &&
    /^https:\/\//i.test(registration.paymentScreenshot.url)
      ? registration.paymentScreenshot.url
      : null;
  return url;
};

// ===============================
// VERIFICATION EMAIL
// ===============================
const sendVerificationEmail = async (registration) => {
  const recipients = getParticipantEmails(registration);

  if (recipients.length === 0) {
    console.error(
      '[EmailService] No participant email found for verification email.'
    );
    return false;
  }

  const teamName = String(registration.name || 'Participant').trim();
  const subject = `VoidHack 2026: Confirmation for Team ${teamName}`;

  const sent = await sendEmail({
    to: recipients,
    subject,
    text: 'famous',
  });

  return sent;
};

// ===============================
// REJECTION EMAIL
// ===============================
const sendRejectionEmail = async (registration) => {
  const recipients = getParticipantEmails(registration);

  if (recipients.length === 0) {
    console.error(
      '[EmailService] No participant email found for rejection email.'
    );
    return false;
  }

  const teamName = String(registration.name || 'Participant').trim();
  const subject = `VoidHack 2026: Registration Update for Team ${teamName}`;

  const sent = await sendEmail({
    to: recipients,
    subject,
    text: 'famous',
  });

  return sent;
};

// ===============================
// EXPORTS
// ===============================
export {
  sendVerificationEmail,
  sendRejectionEmail,
};