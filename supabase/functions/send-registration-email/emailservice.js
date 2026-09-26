/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Email service (Supabase Edge Function)
   Resend-based. Runs ONLY server-side in the Deno Edge Runtime —
   never in the browser (this SPA has no Node backend). The API key
   lives in the project's Edge Function secrets:

     supabase secrets set RESEND_API_KEY=re_...

   Delivery uses the Resend HTTP API (https://api.resend.com/emails)
   against the verified hack2pitch.in domain. The From address must be
   on that verified domain or Resend rejects the send.

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

const EMAIL_FROM =
  Deno.env.get('EMAIL_FROM') || 'HACK2PITCH 2026 <noreply@hack2pitch.in>';

/* Visible sender label — presentation only. The default already carries
   the display-name+address form Resend expects; if EMAIL_FROM is set to a
   bare address it is wrapped here so recipients still see
   "HACK2PITCH 2026". If EMAIL_FROM already carries a
   display-name+address form, it is preserved as-is. */
const EMAIL_SENDER_NAME = 'HACK2PITCH 2026';
const EMAIL_FROM_DISPLAY = /[<>]/.test(String(EMAIL_FROM || ''))
  ? EMAIL_FROM
  : `"${EMAIL_SENDER_NAME}" <${EMAIL_FROM}>`;

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

/* Generic email sender — Resend HTTP API */
const sendEmail = async ({ to, subject, text, html, attachments }) => {
  const apiKey = Deno.env.get('RESEND_API_KEY');

  if (!apiKey) {
    console.error('[EmailService] RESEND_API_KEY is not configured.');
    return false;
  }

  try {
    const payload = {
      from: EMAIL_FROM_DISPLAY,
      to: Array.isArray(to) ? to : [to],
      subject,
      text,
      html,
    };

    /* No caller passes attachments today (the payment screenshot is
       LINKED, not attached — see paymentScreenshotLink), so no Resend
       attachment mapping is introduced here. */
    void attachments;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      let detail = '';
      try {
        detail = await response.text();
      } catch {
        detail = '<unreadable response body>';
      }
      console.error(
        '[EmailService] Resend email send failed:',
        response.status,
        detail
      );
      return false;
    }

    const data = await response.json();

    console.log('[EmailService] Email sent:', data.id);

    return Boolean(data.id);
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
const VH_DATELINE = '10–11 OCT 2026';
const VH_VENUE = 'FISAT, Angamaly';

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
  const subject = `HACK2PITCH 2026 · REGISTRATION RECEIVED — ${registration.name}`;

  /* ── Optional presentation data (real registration rows only).
     The template renders a section ONLY when the registration object
     already carries the field — index.ts supplies exactly what the
     email may show, so absent data stays hidden instead of being
     invented here. ── */
  const has = (value) =>
    value !== undefined && value !== null && String(value).trim() !== '';
  const teamSize = has(registration.teamSize)
    ? String(registration.teamSize)
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

  const memberName = (m) => {
    if (!m) return null;
    return has(m.name)
      ? String(m.name)
      : has(m.fullName)
        ? String(m.fullName)
        : null;
  };

  /* Event lines — use the dynamic row values when the registration row
     carries them, otherwise the shared HACK2PITCH 2026 fixture info
     (date/venue are event-wide constants, not per-team data). */
  const eventDate = dateVal || VH_DATELINE;
  const eventVenue = venue || VH_VENUE;

  const text = [
    'HACK2PITCH 2026',
    VH_KICKER,
    '',
    'REGISTRATION RECEIVED',
    'Your registration for HACK2PITCH 2026 has been received successfully.',
    '',
    'REGISTRATION DETAILS',
    'TEAM NAME            ' + (registration.name || '—'),
    'REGISTRATION ID      ' + code,
    ...(teamSize ? ['TEAM SIZE            ' + teamSize + ' member(s)'] : []),
    'PAYMENT STATUS       PAYMENT PROOF RECEIVED',
    '',
    'PARTICIPANTS',
    ...crew.map((member, index) => {
      const n = memberName(member);
      if (!n) return null;
      const isLead = has(member.role) && String(member.role) === 'lead';
      const em = has(member.email) ? String(member.email) : null;
      const num = String(index + 1).padStart(2, '0');
      const head = isLead ? n + ' [LEAD]' : n;
      return em ? num + '   ' + head + '\n        ' + em : num + '   ' + head;
    }).filter(Boolean),
    '',
    'EVENT DETAILS',
    'HACK2PITCH 2026 — 24-HOUR HACKATHON',
    'DATE              ' + eventDate,
    'VENUE             ' + eventVenue,
    '',
    'ATTENDANCE',
    'Scan this QR at the venue for attendance check-in.',
    ...(scanUrl ? ['SCAN LINK  ' + scanUrl] : []),
    '',
    'Your payment proof will be verified by our team. Your registration will be confirmed after verification.',
    'Please check your Spam/Junk folder if you do not see future confirmation emails in your inbox.',
    '',
    'WHATSAPP COMMUNITY',
    'Join the official HACK2PITCH 2026 community to get important updates, reminders and announcements.',
    'https://chat.whatsapp.com/Ca6uEsJI88Y4Rf1Eq7EGNc',
    'All important event updates will be shared through the official group.',
    '',
    'HACK2PITCH 2026',
    'FISAT HORIZON CLUB',
  ].join('\n');

  /* REGISTRATION DETAILS — label:value ledger rows; renders the fields
     that exist on the real registration only. The verification email is
     sent only after a payment is approved, so PAYMENT STATUS is the
     fixed 'PAYMENT PROOF RECEIVED' outcome rather than per-row data. */
  const detailRows = [
    { label: 'TEAM NAME', value: esc(registration.name) || '&mdash;', mono: false },
    { label: 'REGISTRATION ID', value: esc(code), mono: true },
    teamSize
      ? { label: 'TEAM SIZE', value: `${esc(teamSize)} member(s)`, mono: false }
      : null,
    { label: 'PAYMENT STATUS', value: 'PAYMENT PROOF RECEIVED', mono: false },
  ]
    .filter(Boolean)
    .map(
      (f) => `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="drow" style="border-collapse:collapse;border-top:1px solid #242427;margin-top:14px;">
                    <tr>
                      <td width="42%" class="dlbl" align="left" style="vertical-align:top;padding:10px 12px 10px 0;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:#8A887F;text-transform:uppercase;">${f.label}</td>
                      <td width="58%" class="dval" align="left" style="vertical-align:top;padding:10px 0;word-break:break-word;overflow-wrap:break-word;font-family:${f.mono ? "'Courier New',Courier,monospace" : 'Helvetica,Arial,sans-serif'};font-size:${f.mono ? '14px' : '15px'};font-weight:bold;line-height:1.35;color:#FFFFFF;${f.mono ? 'word-break:break-all;letter-spacing:1px;' : ''}">${f.value}</td>
                    </tr>
                  </table>`
    )
    .join('');

  /* PARTICIPANTS — numbered rows; the lead carries a red LEAD tag.
     Only the fields the registration object carries (name, email, role)
     render — phone and food preference are not supplied by index.ts, so
     they are omitted rather than shown as placeholders. */
  const participantRows = crew
    .map((member, i) => {
      const n = memberName(member);
      if (!n) return '';
      const em = has(member.email) ? String(member.email) : null;
      const isLead = has(member.role) && String(member.role) === 'lead';
      const num = String(i + 1).padStart(2, '0');
      return `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" class="prow" style="border-collapse:collapse;border-top:1px solid #242427;margin-top:14px;">
                    <tr>
                      <td width="42" valign="top" style="vertical-align:top;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1px;font-weight:bold;color:${VH_RED};padding:10px 10px 10px 0;">${num}</td>
                      <td style="vertical-align:top;padding:10px 0;word-break:break-word;overflow-wrap:break-word;">
                        <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;">
                          ${esc(n)}
                          ${isLead ? `<span style="display:inline-block;margin-left:8px;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;font-weight:bold;color:${VH_RED};text-transform:uppercase;border:1px solid ${VH_RED};padding:2px 6px;">LEAD</span>` : ''}
                        </div>
                        ${em ? `<div style="margin-top:4px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:1px;color:#8A887F;word-break:break-all;">${esc(em)}</div>` : ''}
                      </td>
                    </tr>
                  </table>`;
    })
    .join('');

  /* ATTENDANCE — the real per-team QR PNG (server-generated in index.ts
     from the team's existing attendance_token; scanUrl is the check-in
     URL the venue scanner's extractToken() expects). The PNG is used
     when available; otherwise the plain scan link is the fallback. */
  const attendanceContent = qrImageUrl
    ? `<img src="${esc(qrImageUrl)}" alt="HACK2PITCH 2026 attendance QR — present at venue entry for check-in" width="140" height="140" style="display:block;margin-left:auto;margin-right:auto;width:140px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />`
    : scanUrl
      ? `<a href="${esc(scanUrl)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 20px;font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:1.5px;font-weight:bold;color:#FFFFFF;text-decoration:none;background-color:#101012;border:1px solid ${VH_RED};border-radius:2px;">OPEN&nbsp;ATTENDANCE&nbsp;LINK</a>`
      : '';

  const html = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>HACK2PITCH 2026 · Registration Received</title>
  <!--[if mso]>
  <style type="text/css">
    .shell { width: 640px !important; }
  </style>
  <![endif]-->
  <style type="text/css">
    @media only screen and (max-width: 620px) {
      .shell { width: 100% !important; }
      .p30 { padding: 22px 20px !important; }
      .drow, .prow { display: block !important; width: 100% !important; }
      .dlbl { display: block !important; width: 100% !important; padding: 0 !important; }
      .dval { display: block !important; width: 100% !important; padding: 0 !important; margin-top: 6px; }
      .ev2 { display: block !important; width: 100% !important; padding: 0 !important; border-left: none !important; }
      .btn { width: 100% !important; }
      .btn a { display: block !important; width: 100% !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;word-spacing:normal;background-color:${VH_BLACK};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
  <center role="presentation" style="width:100%;">
    <!-- OUTER SHELL — clean dark booking-confirmation -->
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:${VH_BLACK};border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">
      <tr>
        <td align="center" style="padding:26px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="640" class="shell" align="center" style="width:100%;max-width:640px;border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;">

            <!-- ── 1. HEADER ─────────────────────────────────────────── -->
            <tr>
              <td style="background-color:${VH_BLACK};border-top:4px solid ${VH_RED};padding:30px 30px 24px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:14px;letter-spacing:5px;color:${VH_WARM};font-weight:bold;text-transform:uppercase;line-height:1.3;">
                  HACK2PITCH&nbsp;2026
                </div>
                <div style="margin-top:5px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">
                  ${VH_KICKER}
                </div>
                <div style="margin-top:22px;height:3px;width:44px;background-color:${VH_RED};font-size:0;line-height:0;">&nbsp;</div>
                <div style="margin-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:24px;line-height:1.15;letter-spacing:-0.5px;font-weight:bold;color:${VH_WARM};">
                  REGISTRATION&nbsp;RECEIVED
                </div>
                <div style="margin-top:10px;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#9C9A92;word-break:break-word;overflow-wrap:break-word;">
                  Your registration for HACK2PITCH&nbsp;2026 has been received successfully.
                </div>
              </td>
            </tr>

            <!-- ── 2. REGISTRATION DETAILS ───────────────────────────── -->
            <tr>
              <td class="p30" style="background-color:${VH_CHARCOAL};border:1px solid #1F1F21;border-left:3px solid ${VH_RED};padding:24px 28px 12px 28px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">REGISTRATION&nbsp;DETAILS</div>
                ${detailRows}
              </td>
            </tr>

            <!-- gap -->
            <tr>
              <td style="background-color:${VH_BLACK};font-size:0;line-height:0;height:12px;">&nbsp;</td>
            </tr>

            <!-- ── 3. PARTICIPANTS (only when crew data is present) ──── -->
            ${crew.length > 0 ? `
            <tr>
              <td class="p30" style="background-color:${VH_CHARCOAL};border:1px solid #1F1F21;border-left:3px solid ${VH_RED};padding:24px 28px 12px 28px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">PARTICIPANTS</div>
                ${participantRows}
              </td>
            </tr>

            <tr>
              <td style="background-color:${VH_BLACK};font-size:0;line-height:0;height:12px;">&nbsp;</td>
            </tr>` : ''}

            <!-- ── 4. ATTENDANCE (only when QR/scan data is present) ── -->
            ${attendanceContent ? `
            <tr>
              <td align="center" class="p30" style="background-color:${VH_CHARCOAL};border:1px solid #1F1F21;border-left:3px solid ${VH_RED};padding:24px 28px 22px 28px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">ATTENDANCE</div>
                <div style="margin-top:16px;">
                  ${attendanceContent}
                </div>
                <div style="margin-top:14px;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#9C9A92;word-break:break-word;overflow-wrap:break-word;">SCAN&nbsp;THIS&nbsp;QR&nbsp;AT&nbsp;THE&nbsp;VENUE&nbsp;FOR&nbsp;ATTENDANCE</div>
              </td>
            </tr>

            <tr>
              <td style="background-color:${VH_BLACK};font-size:0;line-height:0;height:12px;">&nbsp;</td>
            </tr>` : ''}

            <!-- ── 5. EVENT DETAILS ──────────────────────────────────── -->
            <tr>
              <td class="p30" style="background-color:${VH_CHARCOAL};border:1px solid #1F1F21;border-left:3px solid ${VH_RED};padding:24px 28px 22px 28px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">EVENT&nbsp;DETAILS</div>
                <div style="margin-top:16px;font-family:Helvetica,Arial,sans-serif;font-size:18px;line-height:1.2;font-weight:bold;color:#FFFFFF;">HACK2PITCH&nbsp;2026</div>
                <div style="margin-top:4px;font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:3px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">24-HOUR&nbsp;HACKATHON</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:18px;">
                  <tr>
                    <td width="50%" class="ev2" valign="top" style="vertical-align:top;padding:2px 12px 2px 0;">
                      <div style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:#8A887F;text-transform:uppercase;padding-bottom:5px;">DATE</div>
                      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;word-break:break-word;overflow-wrap:break-word;">${esc(eventDate)}</div>
                    </td>
                    <td width="50%" class="ev2" valign="top" style="vertical-align:top;padding:2px 0 2px 12px;border-left:1px solid #2A2A2C;">
                      <div style="font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:2px;color:#8A887F;text-transform:uppercase;padding-bottom:5px;">VENUE</div>
                      <div style="font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;color:#FFFFFF;word-break:break-word;overflow-wrap:break-word;">${esc(eventVenue)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- gap -->
            <tr>
              <td style="background-color:${VH_BLACK};font-size:0;line-height:0;height:12px;">&nbsp;</td>
            </tr>

            <!-- ── 5. NEXT STEP ───────────────────────────────────────── -->
            <tr>
              <td class="p30" style="background-color:${VH_CHARCOAL};border:1px solid #1F1F21;border-left:3px solid ${VH_RED};padding:24px 28px 22px 28px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:11px;letter-spacing:4px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">NEXT&nbsp;STEP</div>
                <div style="margin-top:14px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7;color:#D8D6CE;word-break:break-word;overflow-wrap:break-word;">
                  Your payment proof will be verified by our team. Your registration will be confirmed after verification.
                </div>
                <div style="margin-top:16px;background-color:#101012;border:1px solid #242427;padding:14px 16px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#9C9A92;word-break:break-word;overflow-wrap:break-word;">
                  Please check your Spam/Junk folder if you do not see future confirmation emails in your inbox.
                </div>
              </td>
            </tr>

            <!-- gap -->
            <tr>
              <td style="background-color:${VH_BLACK};font-size:0;line-height:0;height:12px;">&nbsp;</td>
            </tr>

            <!-- ── 6. WHATSAPP COMMUNITY CTA (success only) ──────────── -->
            <tr>
              <td style="background-color:${VH_BLACK};padding:34px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">COMMUNITY&nbsp;ACCESS</div>
                <div style="margin-top:10px;font-family:Helvetica,Arial,sans-serif;font-size:19px;line-height:1.3;font-weight:bold;color:${VH_WARM};">JOIN&nbsp;THE&nbsp;HACK2PITCH&nbsp;2026&nbsp;COMMUNITY</div>
                <div style="margin-top:12px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#9C9A92;">Get important updates, reminders and announcements.</div>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin-top:20px;">
                  <tr>
                    <td align="left" class="btn-wrap">
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" class="btn" style="border-collapse:collapse;">
                        <tr>
                          <td align="center" bgcolor="${VH_GREEN}" style="background-color:${VH_GREEN};border-radius:2px;">
                            <a href="https://chat.whatsapp.com/Ca6uEsJI88Y4Rf1Eq7EGNc" target="_blank" rel="noopener noreferrer"
                               style="display:inline-block;padding:14px 26px;font-family:'Courier New',Courier,monospace;font-size:12px;letter-spacing:1.5px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:2px;line-height:1.2;">
                              JOIN&nbsp;NOW&nbsp;&rarr;
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:14px;font-family:'Courier New',Courier,monospace;font-size:9px;letter-spacing:1px;color:#6F6D66;text-transform:uppercase;">
                  ALL IMPORTANT EVENT UPDATES ARE SHARED THROUGH THE OFFICIAL GROUP
                </div>
              </td>
            </tr>

            <!-- ── 7. FOOTER ─────────────────────────────────────────── -->
            <tr>
              <td align="center" style="background-color:${VH_BLACK};border-top:1px solid #1C1C1E;padding:26px 30px;">
                <div style="font-family:'Courier New',Courier,monospace;font-size:13px;letter-spacing:5px;color:${VH_WARM};font-weight:bold;">HACK2PITCH&nbsp;2026</div>
                <div style="margin-top:6px;font-family:'Courier New',Courier,monospace;font-size:10px;letter-spacing:3px;color:${VH_RED};text-transform:uppercase;font-weight:bold;">FISAT&nbsp;HORIZON&nbsp;CLUB</div>
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