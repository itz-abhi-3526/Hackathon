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

/* Escape admin-supplied text before embedding it in HTML mail. */
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });

/* Generic email sender */
const sendEmail = async ({ to, subject, text, html, attachments }) => {
  if (!transporter) {
    console.error(
      '[EmailService] SMTP_USER or SMTP_PASS is not configured.'
    );
    return false;
  }

  try {
    const mailOptions = { from: EMAIL_FROM, to, subject, text, html };

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

  const subject = `Verification Successful — ${registration.name}`;

  const text = [
    `Hello Team ${registration.name},`,
    '',
    "We're happy to let you know that your registration for VOIDHACK 2026 — the 24-hour hackathon — has been successfully verified! 🎉",
    '',
    "Your team's entry is confirmed and your spot is locked in. Gear up for 24 hours of building, breaking, and shipping.",
    '',
    'What to Expect',
    '',
    '🚀 24-Hour Build Sprint',
    'Start from zero, build something remarkable, and demo it before time runs out.',
    '',
    '👨‍🏫 Mentors & Workshops',
    'Get hands-on support from mentors and level up with rapid-fire workshops.',
    '',
    '🏆 Prizes & Recognition',
    'Top teams take home prizes, swag, and serious bragging rights.',
    '',
    '🎉 Opening & Closing Ceremonies',
    'Kick things off with an opening ceremony and wrap up with demos and the winner showcase.',
    '',
    'Registration Code: ' + (registration.registrationCode || '—'),
    'Registration Status: Verified ✅',
    '',
    "Your registration is complete. All that's left is to bring your A-game, your team, and your late-night snacks.",
    '',
    "We can't wait to see what you build at VOIDHACK 2026!",
    '',
    'See you there! 🚀',
    '',
    'VOIDHACK 2026 Team',
  ].join('\n');

  const html = `
    <p>Hello Team ${esc(registration.name)},</p>

    <p>
      We're happy to let you know that your registration for
      <strong>VOIDHACK 2026 — the 24-hour hackathon</strong>
      has been successfully verified! 🎉
    </p>

    <p>
      Your team's entry is confirmed and your spot is locked in.
      Gear up for 24 hours of building, breaking, and shipping.
    </p>

    <p><strong>What to Expect</strong></p>

    <p>
      🚀 <strong>24-Hour Build Sprint</strong><br />
      Start from zero, build something remarkable, and demo it before time runs out.
    </p>

    <p>
      👨‍🏫 <strong>Mentors &amp; Workshops</strong><br />
      Get hands-on support from mentors and level up with rapid-fire workshops.
    </p>

    <p>
      🏆 <strong>Prizes &amp; Recognition</strong><br />
      Top teams take home prizes, swag, and serious bragging rights.
    </p>

    <p>
      🎉 <strong>Opening &amp; Closing Ceremonies</strong><br />
      Kick things off with an opening ceremony and wrap up with demos and the winner showcase.
    </p>

    <p>
      Registration Code: <strong>${esc(registration.registrationCode) || '—'}</strong><br />
      Registration Status: <strong>Verified ✅</strong>
    </p>

    <p>
      Your registration is complete. All that's left is to bring your
      A-game, your team, and your late-night snacks.
    </p>

    <p>We can't wait to see what you build at VOIDHACK 2026!</p>

    <p>See you there! 🚀</p>

    <p>
      VOIDHACK 2026 Team
    </p>
  `;

  const sent = await sendEmail({
    to: recipients,
    subject,
    text,
    html,
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

  const subject = `Registration Update — ${registration.name}`;

  const screenshotUrl = paymentScreenshotLink(registration);

  const rejectionReason =
    registration.rejectionReason || 'Not provided';

  const screenshotNote = screenshotUrl
    ? [
        '',
        'Your uploaded payment screenshot can be viewed here:',
        screenshotUrl,
        '',
      ]
    : [];

  const text = [
    `Hello Team ${registration.name},`,
    '',
    'Thank you for registering for VOIDHACK 2026 — the 24-hour hackathon.',
    '',
    'During verification, we found an issue with the data/payment details you submitted, and unfortunately your registration could not be confirmed at this time.',
    '',
    'Reason for Rejection',
    rejectionReason,
    '',
    ...screenshotNote,
    "If you'd like to resolve this and complete your registration, please get in touch with us as soon as possible.",
    '',
    'Registration Code: ' + (registration.registrationCode || '—'),
    'Registration Status: Rejected ❌',
    '',
    'We hope to get this sorted out with you soon so you can join us at VOIDHACK 2026!',
    '',
    'VOIDHACK 2026 Team',
  ].join('\n');

  const html = `
    <p>Hello Team ${esc(registration.name)},</p>

    <p>
      Thank you for registering for
      <strong>VOIDHACK 2026 — the 24-hour hackathon</strong>.
    </p>

    <p>
      During verification, we found an issue with the data/payment
      details you submitted, and unfortunately your registration
      could not be confirmed at this time.
    </p>

    <p>
      <strong>Reason for Rejection</strong><br />
      ${esc(rejectionReason)}
    </p>

    ${
      screenshotUrl
        ? `<p>
      Your uploaded payment screenshot can be viewed here:<br />
      <a href="${esc(screenshotUrl)}" rel="noopener noreferrer">${esc(screenshotUrl)}</a>
    </p>`
        : ''
    }

    <p>
      If you'd like to resolve this and complete your registration,
      please get in touch with us as soon as possible.
    </p>

    <p>
      Registration Code: <strong>${esc(registration.registrationCode) || '—'}</strong><br />
      Registration Status: <strong>Rejected ❌</strong>
    </p>

    <p>
      We hope to get this sorted out with you soon so you can join us
      at VOIDHACK 2026!
    </p>

    <p>
      VOIDHACK 2026 Team
    </p>
  `;

  const sent = await sendEmail({
    to: recipients,
    subject,
    text,
    html,
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