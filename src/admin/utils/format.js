/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Admin formatting helpers
   Pure, shared formatters used across the control center. Everything
   null-safe so raw DB rows can never crash a cell.
   ═══════════════════════════════════════════════════════════════ */

const DASH = '\u2014';

export function codeFor(team) {
  const code = String(team?.registration_code ?? team?.registrationCode ?? '').trim();
  if (code) return code;
  const suffix = String(team?.id ?? '').replace(/[^a-f0-9]/gi, '').slice(-6).toUpperCase();
  return suffix ? `VH-2026-${suffix}` : DASH;
}

export function dateLabel(iso, { date = true, time = true } = {}) {
  if (!iso) return DASH;
  try {
    return new Date(iso).toLocaleString('en-IN', {
      day: date ? '2-digit' : undefined,
      month: date ? 'short' : undefined,
      year: date ? 'numeric' : undefined,
      hour: time ? '2-digit' : undefined,
      minute: time ? '2-digit' : undefined,
      hour12: true,
    });
  } catch {
    return DASH;
  }
}

export function shortDate(iso) {
  if (!iso) return DASH;
  try {
    return new Date(iso).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return DASH;
  }
}

export function numFmt(n) {
  return Number.isFinite(Number(n)) ? String(Number(n)).padStart(2, '0') : '00';
}

export function initials(name) {
  return String(name ?? '')
    .trim()
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function statusLabel(status) {
  return String(status ?? '').toUpperCase() || DASH;
}

export function roundLabel(team) {
  const round = team?.registrationRound;
  if (round?.title) return String(round.title).toUpperCase();
  if (team?.registrationRoundId) return DASH;
  return 'LEGACY REGISTRATION';
}

export function roundName(round) {
  if (!round) return DASH;
  return String(round.title ?? '').toUpperCase() || DASH;
}

export function roundStatusLabel(status) {
  return String(status ?? '').toUpperCase() || DASH;
}

export function feeLabel(fee) {
  if (fee === null || fee === undefined || fee === '') return DASH;
  const n = Number(fee);
  if (!Number.isFinite(n)) return DASH;
  const decimals = n % 1 === 0 ? 0 : 2;
  return `\u20B9${n.toLocaleString('en-IN', { maximumFractionDigits: decimals })}`;
}

export function roundWindow(round) {
  return `${shortDate(round?.startsAt)} \u2013 ${shortDate(round?.endsAt)}`;
}

export function problemLabel(problem) {
  if (!problem) return DASH;
  const track = String(problem.track ?? '');
  const title = String(problem.title ?? '');
  return track && title ? `${track.toUpperCase()} / ${title}` : title || track || DASH;
}

export function difficultyLabel(diff) {
  return String(diff ?? '').toUpperCase() || DASH;
}

export function roleLabel(role) {
  return String(role ?? '').toUpperCase();
}

export function foodLabel(pref) {
  return String(pref ?? '').toUpperCase() || DASH;
}

/**
 * Word-case helper used for "Search teams / participants / …" placeholders.
 */
export function upper(str) {
  return String(str ?? '').toUpperCase();
}