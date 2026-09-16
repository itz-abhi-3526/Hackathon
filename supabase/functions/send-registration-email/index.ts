/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — send-registration-email (Supabase Edge Function)
   Invoked by the admin UI after a payment is VERIFIED/REJECTED or to
   (re)send the verification / rejection email:

     POST /functions/v1/send-registration-email
     Authorization: Bearer <admin session JWT>
     { "teamId": "<uuid>", "action": "verify" | "reject" | "send_verification" | "send_rejection", "reason": "..." }

   The function authenticates the caller (must be an admin via
   public.is_admin()), loads the team + its lead participant using
   the CALLER's identity (RLS admin-only reads — no service-role key
   in the browser, none needed here either), then hands a normalized
   `registration` object to emailservice.js for the actual Nodemailer
   send.

   Actions
     verify / reject        — legacy send-only actions (payment status
                              is written by the admin UI first; email is
                              best-effort so a mail outage never blocks
                              verification).
     send_verification / send_rejection — the admin Registrations
                              Send Email flow. The payment check is done
                              HERE against the real teams row (never a
                              frontend flag); the lead email is resolved
                              from participants; the rejection reason is
                              read from teams.rejection_reason. Only
                              after a successful SMTP send do the tracking
                              columns on teams get written; if that DB
                              write fails the response reports
                              `emailSent: true, statusUpdated: false` so
                              the UI never blindly retries (no dupes).

   All handled business outcomes return HTTP 200 with a structured body
   for reliable parsing on the browser side; 401/403 stay as HTTP errors.
   ═══════════════════════════════════════════════════════════════ */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  sendVerificationEmail,
  sendRejectionEmail,
} from './emailservice.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/* Simple mail-address check — matches the DB validation used in
   register_team so we never attempt a send to a malformed address. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const isValidEmail = (value) =>
  Boolean(value) && typeof value === 'string' && EMAIL_RE.test(value.trim());

/**
 * Build a Supabase client that runs under the CALLER's JWT, so the
 * RLS is_admin() gates on teams / participants do the authorizing —
 * the function never touches a service-role key.
 */
const clientFor = (token) =>
  createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

const bearerToken = (req) =>
  (req.headers.get('Authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim();

/* Throws { status, message } for clear 401/403 responses. */
const requireAdmin = async (supabase, token) => {
  const { data, error } = await supabase.auth.getUser(token);
  const user = data?.user ?? null;
  if (error || !user) throw { status: 401, message: 'AUTHENTICATION FAILED' };

  const { data: isAdmin, error: adminError } = await supabase.rpc('is_admin');
  if (adminError || !isAdmin) {
    throw { status: 403, message: 'NOT AN ADMINISTRATOR' };
  }
  return user;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'METHOD NOT ALLOWED' }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const teamId = body?.teamId ?? null;
    const action = body?.action ?? null;

    if (!teamId) return json({ error: 'teamId IS REQUIRED' }, 400);
    if (action !== 'verify' && action !== 'reject' && action !== 'send_verification' && action !== 'send_rejection') {
      return json({ error: 'action MUST BE "verify", "reject", "send_verification" OR "send_rejection"' }, 400);
    }

    const token = bearerToken(req);
    const supabase = clientFor(token);
    await requireAdmin(supabase, token);

    const { data: team, error: teamError } = await supabase
      .from('teams')
      .select('*')
      .eq('id', teamId)
      .maybeSingle();

    if (teamError || !team) {
      throw { status: 404, message: 'TEAM NOT FOUND' };
    }

    /* Team lead is the single verification/rejection recipient. */
    const { data: lead, error: leadError } = await supabase
      .from('participants')
      .select('email')
      .eq('team_id', teamId)
      .eq('role', 'lead')
      .maybeSingle();

    if (leadError) {
      throw { status: 500, message: 'LEAD PARTICIPANT COULD NOT BE LOADED' };
    }

    const registration = {
      name: String(team.team_name ?? '').trim(),
      email: lead?.email ?? '',
      registrationCode: team.registration_code ?? '',
      paymentScreenshot: team.payment_image_url
        ? { url: team.payment_image_url }
        : null,
      rejectionReason:
        body?.reason ?? team.rejection_reason ?? '',
    };

    /* ── send_verification / send_rejection: admin Registrations →
       Send Email. Payment state is re-checked HERE against the real
       row; the lead email is resolved from participants; rejection uses
       the stored teams.rejection_reason. Tracking columns are written
       ONLY after a successful SMTP send. ── */
    if (action === 'send_verification' || action === 'send_rejection') {
      const isVerification = action === 'send_verification';
      return await handleTrackedEmail(supabase, team, registration, {
        kind: isVerification ? 'verification' : 'rejection',
        requiredStatus: isVerification ? 'verified' : 'rejected',
        notInStatusCode: isVerification ? 'PAYMENT_NOT_VERIFIED' : 'PAYMENT_NOT_REJECTED',
        send: isVerification ? sendVerificationEmail : sendRejectionEmail,
        col: isVerification
          ? {
              status: 'verification_email_status',
              sentAt: 'verification_email_sent_at',
              lastError: 'verification_email_last_error',
              sendCount: 'verification_email_send_count',
              lastSentTo: 'verification_email_last_sent_to',
            }
          : {
              status: 'rejection_email_status',
              sentAt: 'rejection_email_sent_at',
              lastError: 'rejection_email_last_error',
              sendCount: 'rejection_email_send_count',
              lastSentTo: 'rejection_email_last_sent_to',
            },
      });
    }

    const sent =
      action === 'reject'
        ? await sendRejectionEmail(registration)
        : await sendVerificationEmail(registration);

    return json({ ok: sent, teamId, action });
  } catch (err) {
    console.error('[send-registration-email]', err);
    const status = Number.isInteger(err?.status) ? err.status : 500;
    return json({ error: err?.message ?? 'INTERNAL ERROR' }, status);
  }
});

/* ── send_verification / send_rejection implementation ──────────
   Every handled outcome returns HTTP 200 with a `code` the admin UI
   maps to a friendly message. No SMTP/DB secrets ever leave the
   function. */
async function handleTrackedEmail(supabase, team, registration, spec) {
  if ((team.payment_status ?? '') !== spec.requiredStatus) {
    return json({ ok: false, code: spec.notInStatusCode, teamId: team.id });
  }

  const email = String(registration.email ?? '').trim();
  if (!email) {
    return json({ ok: false, code: 'LEAD_EMAIL_MISSING', teamId: team.id });
  }
  if (!isValidEmail(email)) {
    return json({ ok: false, code: 'INVALID_LEAD_EMAIL', teamId: team.id });
  }

  const sent = await spec.send(registration);

  const c = spec.col;
  const set = (status, extra) => ({ [c.status]: status, ...extra });

  if (!sent) {
    // SMTP failure — record it so the admin sees FAILED (with a retry),
    // never an automatic re-send on the next page load.
    const { error: updateErr } = await supabase
      .from('teams')
      .update(set('failed', { [c.lastError]: 'SMTP SEND FAILED' }))
      .eq('id', team.id);
    if (updateErr) {
      console.error(`[send-registration-email] ${spec.kind} status write failed`, updateErr);
    }

    return json({ ok: false, code: 'EMAIL_SEND_FAILED', teamId: team.id });
  }

  /* Success — write tracking only now, so the UI can show SENT. */
  const sendCount = Number(team[c.sendCount] ?? 0) + 1;
  const now = new Date().toISOString();

  const { data: updated, error: updateErr } = await supabase
    .from('teams')
    .update(
      set('sent', {
        [c.sentAt]: now,
        [c.lastError]: null,
        [c.sendCount]: sendCount,
        [c.lastSentTo]: email,
      })
    )
    .eq('id', team.id)
    .select(`${c.status}, ${c.sentAt}, ${c.sendCount}, ${c.lastSentTo}`)
    .maybeSingle();

  if (updateErr) {
    // Email was delivered but the status write failed — the UI must NOT
    // report a hard failure (avoids duplicate resends) and the server
    // logs the DB problem for inspection.
    console.error(`[send-registration-email] ${spec.kind} EMAIL SENT BUT STATUS UPDATE FAILED`, updateErr);
    return json({
      ok: true,
      emailSent: true,
      statusUpdated: false,
      sentTo: email,
      sentAt: now,
      teamId: team.id,
    });
  }

  return json({
    ok: true,
    emailSent: true,
    statusUpdated: true,
    sentTo: updated?.[c.lastSentTo] ?? email,
    sentAt: updated?.[c.sentAt] ?? now,
    sendCount: updated?.[c.sendCount] ?? sendCount,
    teamId: team.id,
  });
}