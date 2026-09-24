/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Email service (Supabase Edge Function)
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
   built by index.ts from the teams + participants rows.

   PRESENTATION NOTE: the mail content below is a VISUAL redesign of
   the existing templates only. No dynamic variables were renamed or
   removed — the templates still consume registration.name /
   registration.registrationCode / registration.rejectionReason /
   registration.paymentScreenshot.url as before.

   The WhatsApp community CTA and its URL appear ONLY in the
   verification (success) template; the rejection template never
   links the group.
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

/* ── shared email-chrome constants (visual only) ───────────────────
   Near-black / HACK2PITCH red / warm off-white per design direction. */
const VH_RED = '#E81605';
const VH_BLACK = '#050505';
const VH_CHARCOAL = '#0C0C0D';
const VH_WARM = '#F1EFEA';
const VH_PAPER = '#FAF8F4';
const VH_MUTED = '#77756F';
const VH_GREEN = '#178A3F';

/* Decorative barcode strip (pure HTML/CSS — thin vertical bars,
   no external dependency). Used on the pass stub. */
const BARCODE = (barColor = '#151517') => `
  <!--[if mso]>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;"><tr>
  <![endif]-->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:collapse;table-layout:fixed;">
    <tr>
      ${[4,2,6,1,3,7,2,5,1,6,3,2,7,1,4,2,6,3,1,5,4,2,6,1,3,7,2,5,6,1,3,4,2,7,1,5,2,6,3,1,4]
        .map((w) =>
          `<td style="height:36px;width:${w}px;background-color:${barColor};font-size:0;line-height:0;border-collapse:collapse;">&nbsp;</td>`
        )
        .join('')}
    </tr>
  </table>
  <!--[if mso]>
  </tr></table>
  <![endif]-->
`;

/* Small editorial kicker line used under both mastheads. */
const VH_KICKER = 'PITCH. BUILD. LAUNCH.';

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

  const code = String(registration.registrationCode || '—');
  const subject = `HACK2PITCH 2026 · ENTRY CONFIRMED — ${registration.name}`;

  /* ── Optional presentation data (real registration rows only).
     The template renders a section ONLY when the registration object
     already carries the field — index.ts supplies exactly what the
     email may show, so absent data stays hidden instead of being
     invented here. ── */
  const has = (value) =>
    value !== undefined && value !== null && String(value).trim() !== '';
  const email = has(registration.email) ? String(registration.email) : null;
  const college = has(registration.college)
    ? String(registration.college)
    : null;
  const teamSize = has(registration.teamSize)
    ? String(registration.teamSize)
    : null;
  const leadName = has(registration.leadName)
    ? String(registration.leadName)
    : null;
  const dateVal = has(registration.date) ? String(registration.date) : null;
  const venue = has(registration.venue) ? String(registration.venue) : null;
  const qrImageUrl = has(registration.qrImageUrl)
    ? String(registration.qrImageUrl)
    : null;
  const scanUrl = has(registration.scanUrl)
    ? String(registration.scanUrl)
    : null;
  const crew = Array.isArray(registration.crew)
    ? registration.crew.filter((m) => m && has(m.name))
    : [];
  const challenge =
    registration.challenge && has(registration.challenge.title)
      ? {
          title: String(registration.challenge.title),
          track: has(registration.challenge.track)
            ? String(registration.challenge.track)
            : null,
          difficulty: has(registration.challenge.difficulty)
            ? String(registration.challenge.difficulty)
            : null,
          description: has(registration.challenge.description)
            ? String(registration.challenge.description)
            : null,
        }
      : null;

  const memberName = (m) => {
    if (!m) return null;
    return has(m.name)
      ? String(m.name)
      : has(m.fullName)
        ? String(m.fullName)
        : null;
  };

  const text = [
    'HACK2PITCH 2026',
    'YOUR ENTRY IS CONFIRMED',
    'Your team is officially registered for HACK2PITCH 2026. Your event pass is ready.',
    '',
    'YOUR REGISTRATION',
    'TEAM             ' + registration.name,
    'REGISTRATION ID  ' + code,
    ...(college ? ['COLLEGE          ' + college] : []),
    ...(teamSize ? ['TEAM SIZE        ' + teamSize + ' member(s)'] : []),
    ...(leadName ? ['LEAD             ' + leadName] : []),
    ...(crew.length > 0
      ? [
          '',
          'CREW MANIFEST',
          ...crew
            .map((member, index) => {
              const n = memberName(member);
              if (!n) return null;
              const num = String(index + 1).padStart(2, '0');
              const em = has(member.email) ? String(member.email) : null;
              return em
                ? num + '   ' + n + '\n        ' + em
                : num + '   ' + n;
            })
            .filter(Boolean),
        ]
      : []),
    ...(challenge
      ? [
          '',
          'YOUR CHALLENGE',
          challenge.title,
          ...(challenge.track || challenge.difficulty
            ? [[challenge.track, challenge.difficulty].filter(Boolean).join(' · ')]
            : []),
          ...(challenge.description ? [challenge.description] : []),
        ]
      : []),
    '',
    'YOUR EVENT PASS',
    'HACK2PITCH 2026 ENTRY PASS',
    'TEAM             ' + registration.name,
    'REGISTRATION     ' + code,
    ...(scanUrl ? ['OPEN: ' + scanUrl] : []),
    'Show this QR at entry. Each participant will be checked in individually.',
    '',
    'EVENT INFORMATION',
    'HACK2PITCH 2026 — 24-HOUR HACKATHON',
    ...(dateVal ? ['DATE             ' + dateVal] : []),
    ...(venue ? ['VENUE            ' + venue] : []),
    '',
    'WHAT HAPPENS NEXT',
    'Keep this email accessible on event day. Your QR pass will be used at entry, and each participant will be checked in individually. Any important event instructions and announcements will be shared through the official HACK2PITCH channel.',
    '',
    'STAY IN THE LOOP',
    'Join the official HACK2PITCH WhatsApp group for further updates, announcements and important participant information:',
    'https://chat.whatsapp.com/Ca6uEsJI88Y4Rf1Eq7EGNc',
    'All important event updates will be shared through the official group.',
    '',
    'HACK2PITCH 2026',
    'PITCH. BUILD. LAUNCH.',
  ].join('\n');

  /* YOUR REGISTRATION — label:value ledger rows; renders the fields
     that exist on the real registration only. */
  const regRows = [
    { label: 'TEAM', value: esc(registration.name) || '&mdash;' },
    { label: 'REGISTRATION ID', value: esc(code), mono: true },
    college ? { label: 'COLLEGE', value: esc(college) } : null,
    teamSize
      ? { label: 'TEAM SIZE', value: `${esc(teamSize)} member(s)` }
      : null,
    leadName ? { label: 'LEAD', value: esc(leadName) } : null,
  ]
    .filter(Boolean)
    .map(
      (f) => `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="frow" style="border-collapse:collapse;border-top:1px dashed #C9C4BA;margin-top:12px;">
                    <tr>
                      <td width="36%" class="flbl" align="left" style="vertical-align:top;padding:9px 12px 9px 0;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:2px;color:${VH_MUTED};text-transform:uppercase;">${f.label}</td>
                      <td width="64%" class="fval" align="left" style="vertical-align:top;padding:9px 0;word-break:break-word;overflow-wrap:break-word;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;line-height:1.3;color:${VH_BLACK};${f.mono ? 'font-family:\'Courier New\',Courier,monospace;word-break:break-all;font-size:14px;letter-spacing:1px;' : ''}">${f.value}</td>
                    </tr>
                  </table>`
    )
    .join('');

  /* CREW MANIFEST — numbered rows for the participants on the team;
     the lead carries a red LEAD tag; the email line wraps on mobile. */
  const crewRowsHtml = crew
    .map((member, i) => {
      const n = memberName(member);
      if (!n) return '';
      const em = has(member.email) ? String(member.email) : null;
      const isLead = has(member.role) && String(member.role) === 'lead';
      return `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="crew-row" style="border-collapse:collapse;border-top:1px dashed #C9C4BA;margin-top:14px;">
                    <tr>
                      <td width="44" valign="top" style="vertical-align:top;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:bold;color:${VH_RED};padding:8px 0;">${String(i + 1).padStart(2, '0')}</td>
                      <td style="padding:8px 0;word-break:break-word;overflow-wrap:break-word;">
                        <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:${VH_BLACK};">${esc(n)}${isLead ? ` <span style="display:inline-block;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:${VH_RED};border:1px solid ${VH_RED};border-radius:3px;padding:2px 5px;vertical-align:middle;">LEAD</span>` : ''}</div>
                        ${em ? `<div style="margin-top:3px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1px;color:${VH_MUTED};word-break:break-all;">${esc(em)}</div>` : ''}
                      </td>
                    </tr>
                  </table>`;
    })
    .join('');

  /* YOUR CHALLENGE — the real problem statement the team builds on
     (rendered only when index.ts found a statement on the team). */
  const challengeHtml = challenge ? `
            <tr>
              <td class="p30" style="background-color:${VH_PAPER};border:1px solid #E3DED2;padding:26px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_BLACK};text-transform:uppercase;font-weight:bold;">YOUR&nbsp;CHALLENGE</div>
                <div style="margin-top:8px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>
                ${challenge.track || challenge.difficulty ? `
                <div style="margin-top:16px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:2px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">${[challenge.track, challenge.difficulty].filter(Boolean).map(esc).join('&nbsp;&middot;&nbsp;')}</div>` : ''}
                <div style="margin-top:6px;font-family:Helvetica,Arial,sans-serif;font-size:20px;line-height:1.2;font-weight:bold;color:${VH_BLACK};word-break:break-word;overflow-wrap:break-word;">${esc(challenge.title)}</div>
                ${challenge.description ? `<div style="margin-top:10px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#4A4843;word-break:break-word;overflow-wrap:break-word;">${esc(challenge.description)}</div>` : ''}
              </td>
            </tr>` : '';

  /* YOUR EVENT PASS — attendance QR (verification email ONLY). The QR
     is a server-generated PNG (storage/rls-secured); the registration
     code stays visible even if remote images are blocked. When the QR
     PNG is unavailable the plain scan link is offered as a fallback. */
  const passContent = qrImageUrl
    ? `<img src="${esc(qrImageUrl)}" alt="HACK2PITCH 2026 attendance QR code — present it at venue entry to check in" width="180" height="180" style="display:block;margin-left:auto;margin-right:auto;width:180px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;border-radius:4px;" />`
    : scanUrl
      ? `<a href="${esc(scanUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:13px 22px;font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:1.5px;font-weight:bold;color:${VH_BLACK};text-decoration:none;background-color:${VH_PAPER};border-radius:6px;">OPEN&nbsp;SCAN&nbsp;LINK</a>`
      : '';

  const qrSectionHtml = passContent ? `
            <tr>
              <td class="p30" style="background-color:${VH_BLACK};padding:32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  <tr>
                    <td align="center">
                      <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">YOUR&nbsp;EVENT&nbsp;PASS</div>
                      <div style="margin-top:8px;width:44px;height:2px;background-color:${VH_RED};font-size:0;line-height:0;margin-left:auto;margin-right:auto;">&nbsp;</div>
                      <div style="margin-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:20px;font-weight:bold;letter-spacing:-0.5px;color:${VH_WARM};">HACK2PITCH&nbsp;2026&nbsp;ENTRY&nbsp;PASS</div>
                      <div style="margin-top:14px;font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:2px;font-weight:bold;color:#B4B2AA;word-break:break-word;overflow-wrap:break-word;">TEAM&nbsp;&middot;&nbsp;${esc(registration.name) || '&mdash;'}</div>
                      <div style="margin-top:4px;font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:2px;font-weight:bold;color:#B4B2AA;word-break:break-all;">REGISTRATION&nbsp;&middot;&nbsp;${esc(code)}</div>
                      <div style="margin-top:18px;display:inline-block;background-color:${VH_PAPER};border-radius:8px;padding:14px;max-width:100%;">
                        ${passContent}
                      </div>
                      <div style="margin-top:16px;font-family:Arial,sans-serif;font-size:12px;line-height:1.6;color:#8A887F;word-break:break-word;overflow-wrap:break-word;">Show this QR at entry &mdash; each participant will be checked in individually.</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>` : '';

  const html = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>HACK2PITCH 2026 · Entry Confirmed</title>
  <!--[if mso]>
  <style type="text/css">
    .shell { width: 640px !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .shell { width: 100% !important; }
      .p30 { padding: 22px 20px !important; }
      .hero-a, .hero-b { font-size: 30px !important; line-height: 1.1 !important; }
      .ticket-main { display: block !important; width: 100% !important; }
      .perf { display: none !important; }
      .ticket-stub { display: block !important; width: 100% !important; border-left: none !important; border-top: 2px dashed #B8B2A4 !important; }
      .frow { display: block !important; width: 100% !important; }
      .flbl { display: block !important; width: 100% !important; padding: 0 !important; }
      .fval { display: block !important; width: 100% !important; padding: 0 !important; margin-top: 6px; }
      .crew-row { display: block !important; width: 100% !important; }
      .ev-col { display: block !important; width: 100% !important; border-left: none !important; padding: 0 !important; }
      .btn { width: 100% !important; }
      .btn a { display: block !important; width: 100% !important; }
      .hide-m { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:${VH_BLACK};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <center role="presentation" style="width:100%;">
    <!-- OUTER SHELL — black ambient, warm event pass -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${VH_BLACK};border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
      <tr>
        <td align="center" style="padding:26px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="shell" align="center" style="width:100%;max-width:640px;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">

            <!-- ── 1. HERO ─────────────────────────────────────────── -->
            <tr>
              <td style="background-color:${VH_BLACK};border-top:4px solid ${VH_RED};padding:26px 30px 34px 30px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                  <tr>
                    <td align="left" style="font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:5px;color:${VH_WARM};font-weight:bold;text-transform:uppercase;line-height:1.4;">
                      HACK2PITCH&nbsp;2026
                    </td>
                    <td align="right" class="hide-m" style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:#8A887F;text-transform:uppercase;line-height:1.4;">
                      ${VH_KICKER}
                    </td>
                  </tr>
                </table>
                <div style="margin-top:24px;height:2px;width:44px;background-color:${VH_RED};font-size:0;line-height:0;">&nbsp;</div>
                <div class="hero-a" style="margin-top:18px;font-family:Helvetica,Arial,sans-serif;font-size:38px;line-height:1.08;letter-spacing:-1.5px;font-weight:bold;color:${VH_WARM};">
                  YOUR&nbsp;ENTRY&nbsp;IS
                </div>
                <div class="hero-b" style="font-family:Helvetica,Arial,sans-serif;font-size:38px;line-height:1.08;letter-spacing:-1.5px;font-weight:bold;color:${VH_RED};">
                  CONFIRMED
                </div>
                <div style="margin-top:14px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#B4B2AA;word-break:break-word;overflow-wrap:break-word;">
                  Your team is officially registered for HACK2PITCH&nbsp;2026. Your event pass is ready.
                </div>
              </td>
            </tr>

            <!-- ── 2. PHYSICAL TICKET / BOARDING PASS ──────────────── -->
            <tr>
              <td style="background-color:${VH_BLACK};padding:0;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  <tr>
                    <!-- MAIN SECTION -->
                    <td class="ticket-main" valign="top" style="width:62%;background-color:${VH_WARM};border-top:4px solid ${VH_RED};padding:26px 26px 24px 26px;">
                      <div style="font-family:'Courier New',Courier,monospace;font-size:13px;letter-spacing:3px;font-weight:bold;color:${VH_BLACK};">HACK2PITCH&nbsp;2026</div>
                      <div style="margin-top:2px;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:3px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">${VH_KICKER}</div>
                      <div style="margin-top:16px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>

                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;">
                        <tr>
                          <td style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:${VH_MUTED};text-transform:uppercase;padding-bottom:5px;">ENTRY&nbsp;PASS</td>
                        </tr>
                        <tr>
                          <td style="font-family:Helvetica,Arial,sans-serif;font-size:19px;line-height:1.15;font-weight:bold;color:${VH_BLACK};word-break:break-word;overflow-wrap:break-word;">${esc(registration.name) || '&mdash;'}</td>
                        </tr>
                      </table>

                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;">
                        <tr>
                          <td style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:${VH_MUTED};text-transform:uppercase;padding-bottom:5px;">REGISTRATION&nbsp;ID</td>
                        </tr>
                        <tr>
                          <td style="font-family:'Courier New',Courier,monospace;font-size:14px;letter-spacing:1px;font-weight:bold;color:${VH_BLACK};word-break:break-all;">${esc(code)}</td>
                        </tr>
                      </table>

                      ${email ? `
                      <div style="margin-top:18px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>
                      <div style="margin-top:12px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:1px;color:${VH_MUTED};text-transform:uppercase;word-break:break-word;overflow-wrap:break-word;">ISSUED&nbsp;TO&nbsp;${esc(email)}</div>` : ''}
                    </td>

                    <!-- PERFORATION / TEAR LINE + NOTCHES -->
                    <td class="perf" valign="top" style="width:3%;background-color:${VH_WARM};border-top:4px solid ${VH_RED};">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" height="100%" style="border-collapse:collapse;">
                        <tr>
                          <td align="center" style="font-size:0;line-height:0;height:0;">
                            <div style="width:18px;height:18px;margin:-9px auto 0 auto;background-color:${VH_BLACK};border-radius:50%;">&nbsp;</div>
                          </td>
                        </tr>
                        <tr>
                          <td height="240" align="center" style="border-left:2px dashed #B8B2A4;">&nbsp;</td>
                        </tr>
                        <tr>
                          <td align="center" style="font-size:0;line-height:0;height:0;">
                            <div style="width:18px;height:18px;margin:0 auto -9px auto;background-color:${VH_BLACK};border-radius:50%;">&nbsp;</div>
                          </td>
                        </tr>
                      </table>
                    </td>

                    <!-- TICKET STUB -->
                    <td class="ticket-stub" valign="middle" align="center" style="width:35%;background-color:${VH_WARM};border-top:4px solid ${VH_RED};border-left:2px dashed #B8B2A4;padding:22px 16px;">
                      <div style="font-family:'Courier New',Courier,monospace;font-size:14px;letter-spacing:4px;color:${VH_BLACK};font-weight:bold;">HACK2PITCH</div>
                      <div style="font-family:'Courier New',Courier,monospace;font-size:24px;letter-spacing:6px;color:${VH_BLACK};font-weight:bold;">2026</div>
                      <div style="margin:12px auto;width:26px;height:2px;background-color:${VH_RED};font-size:0;line-height:0;">&nbsp;</div>
                      <div style="font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:2px;color:${VH_RED};font-weight:bold;">ENTRY&nbsp;PASS</div>
                      <div style="margin-top:18px;">${BARCODE()}</div>
                      <div style="margin-top:8px;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:${VH_MUTED};text-transform:uppercase;word-break:break-all;">${esc(code)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- small black breathing gap under the ticket -->
            <tr>
              <td style="background-color:${VH_BLACK};font-size:0;line-height:0;height:14px;">&nbsp;</td>
            </tr>

            <!-- ── 3. YOUR REGISTRATION ────────────────────────────── -->
            <tr>
              <td class="p30" style="background-color:${VH_PAPER};border:1px solid #E3DED2;padding:30px 30px 26px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_BLACK};text-transform:uppercase;font-weight:bold;">YOUR&nbsp;REGISTRATION</div>
                <div style="margin-top:4px;">${regRows}</div>
              </td>
            </tr>

            <!-- ── 4. CREW MANIFEST (only when crew data is present) ── -->
            ${crew.length > 0 ? `
            <tr>
              <td class="p30" style="background-color:${VH_PAPER};border:1px solid #E3DED2;padding:20px 30px 26px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_BLACK};text-transform:uppercase;font-weight:bold;">CREW&nbsp;MANIFEST</div>
                ${crewRowsHtml}
              </td>
            </tr>` : ''}

            <!-- ── 5. YOUR CHALLENGE (only when a problem statement exists) ── -->
            ${challengeHtml}

            <!-- ── 6. YOUR EVENT PASS (attendance QR — verification email only) ── -->
            ${qrSectionHtml}

            <!-- ── 7. EVENT INFORMATION ─────────────────────────────── -->
            <tr>
              <td class="p30" style="background-color:${VH_PAPER};border:1px solid #E3DED2;padding:26px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_BLACK};text-transform:uppercase;font-weight:bold;">EVENT&nbsp;INFORMATION</div>
                <div style="margin-top:8px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>
                <div style="margin-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:19px;font-weight:bold;color:${VH_BLACK};line-height:1.2;">HACK2PITCH&nbsp;2026</div>
                <div style="margin-top:4px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:3px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">24-HOUR&nbsp;HACKATHON</div>
                ${dateVal || venue ? `
                <div style="margin-top:16px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:14px;">
                  <tr>
                    ${dateVal
                      ? `<td width="50%" class="ev-col" valign="top" style="vertical-align:top;padding:2px 12px 2px 0;">
                          <div style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:${VH_MUTED};text-transform:uppercase;padding-bottom:5px;">DATE</div>
                          <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:${VH_BLACK};word-break:break-word;overflow-wrap:break-word;">${esc(dateVal)}</div>
                        </td>`
                      : ''}
                    ${venue
                      ? `<td width="50%" class="ev-col" valign="top" style="vertical-align:top;${dateVal ? 'padding:2px 0 2px 12px;border-left:1px dashed #D8D3C8;' : ''}">
                          <div style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:${VH_MUTED};text-transform:uppercase;padding-bottom:5px;">VENUE</div>
                          <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:bold;color:${VH_BLACK};word-break:break-word;overflow-wrap:break-word;">${esc(venue)}</div>
                        </td>`
                      : ''}
                  </tr>
                </table>` : ''}
              </td>
            </tr>

            <!-- ── 8. WHAT HAPPENS NEXT ────────────────────────────── -->
            <tr>
              <td class="p30" style="background-color:${VH_PAPER};border:1px solid #E3DED2;padding:20px 30px 30px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_BLACK};text-transform:uppercase;font-weight:bold;">WHAT&nbsp;HAPPENS&nbsp;NEXT</div>
                <div style="margin-top:8px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>
                <div style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#4A4843;word-break:break-word;overflow-wrap:break-word;">
                  Keep this email accessible on event day. Your QR pass will be used at entry, and each participant will be checked in individually. Any important event instructions and announcements will be shared through the official HACK2PITCH&nbsp;channel.
                </div>
              </td>
            </tr>

            <!-- ── 9. WHATSAPP COMMUNITY CTA (success only) ────────── -->
            <tr>
              <td style="background-color:${VH_BLACK};padding:36px 30px;">
                <div style="font-family:Helvetica,Arial,sans-serif;font-size:18px;font-weight:bold;color:${VH_WARM};line-height:1.3;">
                  STAY&nbsp;IN&nbsp;THE&nbsp;LOOP
                </div>
                <div style="margin-top:8px;width:44px;height:2px;background-color:${VH_RED};font-size:0;line-height:0;">&nbsp;</div>
                <div style="margin-top:14px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#B4B2AA;">
                  Join the official HACK2PITCH WhatsApp group for further updates, announcements and important participant information.
                </div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:24px;">
                  <tr>
                    <td align="left" class="btn-wrap">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="border-collapse:collapse;">
                        <tr>
                          <td align="center" bgcolor="${VH_GREEN}" style="background-color:${VH_GREEN};border-radius:6px;">
                            <a href="https://chat.whatsapp.com/Ca6uEsJI88Y4Rf1Eq7EGNc" target="_blank" rel="noopener noreferrer"
                               style="display:inline-block;padding:14px 26px;font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:1.5px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:6px;line-height:1.2;">
                              JOIN&nbsp;THE&nbsp;HACK2PITCH&nbsp;WHATSAPP&nbsp;GROUP
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:14px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:1px;color:#8A887F;text-transform:uppercase;">
                  ALL IMPORTANT EVENT UPDATES WILL BE SHARED THROUGH THE OFFICIAL GROUP
                </div>
              </td>
            </tr>

            <!-- ── 10. FOOTER ──────────────────────────────────────── -->
            <tr>
              <td align="center" style="background-color:${VH_BLACK};border-top:1px solid #1C1C1E;padding:24px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:13px;letter-spacing:5px;color:${VH_WARM};font-weight:bold;">HACK2PITCH&nbsp;2026</div>
                <div style="margin-top:6px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:${VH_RED};text-transform:uppercase;">PITCH.&nbsp;BUILD.&nbsp;LAUNCH.</div>
              </td>
            </tr>

            <!-- preheader-safe spacer -->
            <tr>
              <td style="font-size:0;line-height:0;height:6px;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
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

  const code = String(registration.registrationCode || '—');
  const subject = `HACK2PITCH 2026 · REGISTRATION REVIEW — ${registration.name}`;

  const screenshotUrl = paymentScreenshotLink(registration);

  const rejectionReason =
    registration.rejectionReason || 'Not provided';

  const text = [
    'HACK2PITCH 2026',
    'REGISTRATION REVIEW',
    '',
    'ACTION REQUIRED',
    'Your registration needs attention before your HACK2PITCH entry can be confirmed.',
    '',
    'REGISTRATION  ' + code,
    'TEAM          ' + registration.name,
    'STATUS        ACTION REQUIRED',
    '',
    'REVIEW NOTE',
    rejectionReason,
    '',
    ...(screenshotUrl
      ? ['Your uploaded payment screenshot can be viewed here:', screenshotUrl, '']
      : []),
    '',
    'We could not confirm your registration from the payment/data submitted with your entry.',
    'Your registration has not been permanently cancelled. Please review the note above and contact the HACK2PITCH team if you need to correct or clarify the submission.',
    '',
    'WHAT TO DO NEXT',
    '1. Review the reason above.',
    '2. Correct the relevant information or payment proof.',
    '3. Contact the HACK2PITCH team if you need assistance.',
    '4. Re-submit / complete the required correction using the existing process.',
    '',
    'HACK2PITCH 2026',
    'PITCH. BUILD. LAUNCH.',
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>HACK2PITCH 2026 · Registration Review</title>
  <!--[if mso]>
  <style type="text/css">
    .shell { width: 640px !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .stack { display: block !important; width: 100% !important; }
      .btn { width: 100% !important; display: block !important; }
      .hide-on-mobile { display: none !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:${VH_WARM};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <center role="presentation" style="width:100%;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${VH_WARM};border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
      <tr>
        <td align="center" style="padding:28px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="shell" align="center" style="width:100%;max-width:640px;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">

            <!-- TOP BRAND STRIP -->
            <tr>
              <td style="background-color:${VH_BLACK};border-top:4px solid ${VH_RED};padding:26px 30px 24px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:5px;color:${VH_WARM};font-weight:bold;text-transform:uppercase;line-height:1.4;">
                  HACK2PITCH&nbsp;2026
                </div>
                <div style="margin-top:22px;height:2px;width:44px;background-color:${VH_RED};font-size:0;line-height:0;">&nbsp;</div>
                <div style="margin-top:18px;font-family:Helvetica,Arial,sans-serif;font-size:34px;line-height:1.05;letter-spacing:-1px;font-weight:bold;color:${VH_WARM};">
                  REGISTRATION&nbsp;REVIEW
                </div>
                <div style="margin-top:12px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:2px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">
                  ACTION&nbsp;REQUIRED
                </div>
                <div style="margin-top:8px;font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#B4B2AA;">
                  Your registration needs attention before your HACK2PITCH entry can be confirmed.
                </div>
              </td>
            </tr>

            <!-- STATUS PANEL (ticket-style) -->
            <tr>
              <td>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
                  <tr>
                    <td valign="top" style="padding:30px 30px 30px 30px;background-color:${VH_CHARCOAL};">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                        <tr>
                          <td style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:#8A887F;text-transform:uppercase;padding-bottom:4px;">REGISTRATION</td>
                        </tr>
                        <tr>
                          <td style="font-family:'Courier New',Courier,monospace;font-size:15px;letter-spacing:1px;font-weight:bold;color:${VH_WARM};">${`${esc(code)}`}</td>
                        </tr>
                      </table>

                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:20px;">
                        <tr>
                          <td style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:#8A887F;text-transform:uppercase;padding-bottom:4px;">TEAM</td>
                          <td style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:#8A887F;text-transform:uppercase;padding-bottom:4px;text-align:right;">STATUS</td>
                        </tr>
                        <tr>
                          <td style="font-family:Helvetica,Arial,sans-serif;font-size:17px;font-weight:bold;color:${VH_WARM};">${esc(registration.name) || '&mdash;'}</td>
                          <td align="right" style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:2px;font-weight:bold;color:${VH_RED};">ACTION&nbsp;REQUIRED</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- REVIEW NOTE -->
            <tr>
              <td style="background-color:${VH_PAPER};padding:30px 30px 8px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_BLACK};text-transform:uppercase;font-weight:bold;">
                  REVIEW&nbsp;NOTE
                </div>
                <div style="margin-top:8px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>
                <div style="margin-top:16px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2A2824;">
                  ${esc(rejectionReason)}
                </div>
                ${
                  screenshotUrl
                    ? `<div style="margin-top:16px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:1px;color:${VH_MUTED};text-transform:uppercase;">
                        UPLOADED&nbsp;PAYMENT&nbsp;PROOF
                      </div>
                      <div style="margin-top:6px;">
                        <a href="${esc(screenshotUrl)}" rel="noopener noreferrer" style="font-family:Arial,sans-serif;font-size:13px;color:${VH_RED};text-decoration:underline;">${esc(screenshotUrl)}</a>
                      </div>`
                    : ''
                }
              </td>
            </tr>

            <!-- WHAT THIS MEANS -->
            <tr>
              <td style="background-color:${VH_PAPER};padding:14px 30px 0px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_BLACK};text-transform:uppercase;font-weight:bold;">
                  WHAT&nbsp;THIS&nbsp;MEANS
                </div>
                <div style="margin-top:8px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>
                <div style="margin-top:16px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#4A4843;">
                  We couldn&rsquo;t confirm your registration from the payment/data submitted with your entry.
                  Your registration has not been permanently cancelled.
                  Please review the note above and contact the HACK2PITCH team if you need to correct or clarify the submission.
                </div>
              </td>
            </tr>

            <!-- WHAT TO DO NEXT -->
            <tr>
              <td style="background-color:${VH_PAPER};padding:26px 30px 6px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_BLACK};text-transform:uppercase;font-weight:bold;">
                  WHAT&nbsp;TO&nbsp;DO&nbsp;NEXT
                </div>
                <div style="margin-top:8px;border-top:1px dashed #C9C4BA;font-size:0;line-height:0;">&nbsp;</div>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:16px;">
                  <tr>
                    <td style="width:26px;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:bold;color:${VH_RED};vertical-align:top;padding:8px 0;">01</td>
                    <td style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2A2824;vertical-align:top;padding:8px 0;">Review the reason above.</td>
                  </tr>
                  <tr>
                    <td style="width:26px;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:bold;color:${VH_RED};vertical-align:top;padding:8px 0;">02</td>
                    <td style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2A2824;vertical-align:top;padding:8px 0;">Correct the relevant information or payment proof.</td>
                  </tr>
                  <tr>
                    <td style="width:26px;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:bold;color:${VH_RED};vertical-align:top;padding:8px 0;">03</td>
                    <td style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2A2824;vertical-align:top;padding:8px 0;">Contact the HACK2PITCH team if you need assistance.</td>
                  </tr>
                  <tr>
                    <td style="width:26px;font-family:'Courier New',Courier,monospace;font-size:12px;font-weight:bold;color:${VH_RED};vertical-align:top;padding:8px 0;">04</td>
                    <td style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#2A2824;vertical-align:top;padding:8px 0;">Re-submit / complete the required correction using the existing process.</td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CONTACT / SUPPORT -->
            <tr>
              <td style="background-color:${VH_PAPER};padding:10px 30px 34px 30px;">
                <div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#4A4843;">
                  If you&rsquo;d like to resolve this and complete your registration, please get in touch with us as soon as possible.
                  We hope to get this sorted out with you soon so you can join us at HACK2PITCH 2026.
                </div>
              </td>
            </tr>

            <!-- FOOTER -->
              </td>
            </tr>

            <!-- FOOTER -->
            <tr>
              <td align="center" style="background-color:${VH_CHARCOAL};padding:26px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:13px;letter-spacing:5px;color:${VH_WARM};font-weight:bold;">HACK2PITCH&nbsp;2026</div>
                <div style="margin-top:6px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:${VH_RED};text-transform:uppercase;">PITCH.&nbsp;BUILD.&nbsp;LAUNCH.</div>
              </td>
            </tr>

            <tr>
              <td style="font-size:0;line-height:0;height:6px;">&nbsp;</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
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