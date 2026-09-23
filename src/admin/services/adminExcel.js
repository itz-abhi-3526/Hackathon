/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Admin Excel export
   Generates proper .xlsx workbooks with headers, sensible column
   widths and readable formatting. xlsx (SheetJS) is lazy-imported so
   the main admin bundle stays small; exports are real DB rows only.
   ═══════════════════════════════════════════════════════════════ */

const pad = (n) => String(n).padStart(2, '0');
const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/* Professional, stable filenames: voidhack_<report>_report_YYYY-MM-DD.xlsx */
const FILE_BASE = {
  teams: 'voidhack_teams_report',
  participants: 'voidhack_participants_report',
  complete: 'voidhack_complete_registration_report',
  rounds: 'voidhack_registration_rounds_report',
  attendance: 'voidhack_attendance_report',
  attendanceTeams: 'voidhack_attendance_team_summary',
};

const SHEET_NAME = {
  teams: 'Teams',
  participants: 'Participants',
  complete: 'Complete Registration',
  rounds: 'Registration Rounds',
  attendance: 'Attendance',
  attendanceTeams: 'Attendance Team Summary',
};

function problemCell(problem) {
  if (!problem) return '';
  const track = String(problem.track ?? '');
  const title = String(problem.title ?? '');
  return track && title ? `${track} / ${title}` : (title || track || '');
}

function roundCellFor(team) {
  if (team?.registrationRound?.title) return String(team.registrationRound.title);
  if (team?.registrationRoundId) return '';
  return 'LEGACY REGISTRATION';
}

function isoOrBlank(value) {
  if (!value) return '';
  try {
    return new Date(value).toISOString();
  } catch {
    return '';
  }
}

function buildSheet(XLSX, columns, rows) {
  const widths = columns.map((c) => c.width ?? 16);
  const header = columns.map((c) => c.label);
  const body = rows.map((row) => columns.map((c) => c.value(row) ?? ''));
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body]);
  sheet['!cols'] = widths.map((w) => ({ wch: w }));
  sheet['!freeze'] = { x: 0, y: 1 };
  return sheet;
}

export function teamColumns() {
  return [
    { label: 'Registration Code', width: 18, value: (t) => t.registrationCode },
    { label: 'Team Name', width: 28, value: (t) => t.teamName },
    { label: 'College', width: 30, value: (t) => t.college },
    { label: 'Problem Statement', width: 40, value: (t) => problemCell(t.problem) },
    { label: 'Registration Round', width: 22, value: (t) => roundCellFor(t) },
    { label: 'Registration Fee', width: 14, value: (t) => (t.registrationFee ?? '') },
    { label: 'Payment Status', width: 14, value: (t) => t.paymentStatus },
    { label: 'Payment Proof URL', width: 60, value: (t) => t.paymentImageUrl ?? '' },
    { label: 'Team Size', width: 12, value: (t) => t.memberCount },
    { label: 'Registration Date', width: 22, value: (t) => isoOrBlank(t.createdAt) },
  ];
}

export function participantColumns() {
  return [
    { label: 'Participant Name', width: 24, value: (p) => p.fullName },
    { label: 'Email', width: 30, value: (p) => p.email },
    { label: 'Phone', width: 16, value: (p) => p.phone },
    { label: 'Team Name', width: 28, value: (p) => p.teamName },
    { label: 'Registration Code', width: 18, value: (p) => p.registrationCode },
    { label: 'College', width: 30, value: (p) => p.college },
    { label: 'Problem Statement', width: 40, value: (p) => problemCell(p.problem) },
    { label: 'Registration Round', width: 22, value: (p) => roundCellFor(p) },
    { label: 'Registration Fee', width: 14, value: (p) => (p.registrationFee ?? '') },
    { label: 'Role', width: 12, value: (p) => p.role },
    { label: 'Food Preference', width: 16, value: (p) => p.foodPreference },
    { label: 'Registration Date', width: 22, value: (p) => isoOrBlank(p.createdAt) },
  ];
}

export function completeColumns() {
  return [
    { label: 'Participant Name', width: 24, value: (p) => p.fullName },
    { label: 'Email', width: 30, value: (p) => p.email },
    { label: 'Phone', width: 16, value: (p) => p.phone },
    { label: 'Role', width: 10, value: (p) => p.role },
    { label: 'Food Preference', width: 16, value: (p) => p.foodPreference },
    { label: 'Team Name', width: 28, value: (p) => p.teamName },
    { label: 'Registration Code', width: 18, value: (p) => p.registrationCode },
    { label: 'College', width: 30, value: (p) => p.college },
    { label: 'Problem Statement', width: 40, value: (p) => problemCell(p.problem) },
    { label: 'Registration Round', width: 22, value: (p) => roundCellFor(p) },
    { label: 'Registration Fee', width: 14, value: (p) => (p.registrationFee ?? '') },
    { label: 'Payment Status', width: 14, value: (p) => p.paymentStatus },
    { label: 'Payment Proof URL', width: 60, value: (p) => p.paymentImageUrl ?? '' },
    { label: 'Team Size', width: 10, value: (p) => p.teamMemberCount ?? '' },
    { label: 'Registration Date', width: 22, value: (p) => isoOrBlank(p.createdAt) },
  ];
}

function isoTime(value) {
  if (!value) return '';
  try {
    return new Date(value).toISOString();
  } catch {
    return '';
  }
}

export function roundsColumns() {
  return [
    { label: 'Round Title', width: 28, value: (r) => r.title },
    { label: 'Status', width: 12, value: (r) => String(r.status ?? '').toUpperCase() },
    { label: 'Fee 2 Members', width: 14, value: (r) => (r.fee2Members ?? '') },
    { label: 'Fee 3 Members', width: 14, value: (r) => (r.fee3Members ?? '') },
    { label: 'Fee 4 Members', width: 14, value: (r) => (r.fee4Members ?? '') },
    { label: 'Capacity', width: 10, value: (r) => r.capacity },
    { label: 'Registered Teams', width: 16, value: (r) => r.registered },
    { label: 'Remaining Slots', width: 16, value: (r) => Math.max(0, r.capacity - r.registered) },
    { label: 'Starts At', width: 24, value: (r) => isoTime(r.startsAt) },
    { label: 'Ends At', width: 24, value: (r) => isoTime(r.endsAt) },
    { label: 'Created At', width: 24, value: (r) => isoTime(r.createdAt) },
  ];
}

/* Attendance — one row per participant of a verified team. */
export function attendanceColumns() {
  return [
    { label: 'Registration Code', width: 18, value: (a) => a.registrationCode },
    { label: 'Team Name', width: 28, value: (a) => a.teamName },
    { label: 'College', width: 30, value: (a) => a.college },
    { label: 'Participant Name', width: 24, value: (a) => a.participantName },
    { label: 'Email', width: 30, value: (a) => a.participantEmail },
    { label: 'Status', width: 12, value: (a) => String(a.status ?? '').toUpperCase() },
    { label: 'Marked At', width: 24, value: (a) => isoTime(a.markedAt) },
    { label: 'Marked By', width: 38, value: (a) => a.markedBy ?? '' },
  ];
}

/* Attendance team summary — one row per verified team. */
export function attendanceTeamColumns() {
  return [
    { label: 'Registration Code', width: 18, value: (t) => t.registrationCode },
    { label: 'Team Name', width: 28, value: (t) => t.teamName },
    { label: 'College', width: 30, value: (t) => t.college },
    { label: 'Team Size', width: 12, value: (t) => t.teamSize },
    { label: 'Present', width: 10, value: (t) => t.present },
    { label: 'Absent', width: 10, value: (t) => t.absent },
    { label: 'Attendance %', width: 14, value: (t) =>
        t.teamSize ? Math.round((t.present / t.teamSize) * 100) : 0 },
  ];
}

const COLUMN_SETS = {
  teams: teamColumns,
  participants: participantColumns,
  complete: completeColumns,
  rounds: roundsColumns,
  attendance: attendanceColumns,
  attendanceTeams: attendanceTeamColumns,
};

/**
 * Build + download a workbook. `kind` selects the sheet + column set
 * ('teams' | 'participants' | 'complete').
 */
export async function downloadExcel({ kind, rows, suffix = '' }) {
  const XLSX = await import('xlsx');
  const buildColumns = COLUMN_SETS[kind] ?? teamColumns;
  const columns = buildColumns();
  const sheetName = SHEET_NAME[kind] ?? 'Report';
  const sheet = buildSheet(XLSX, columns, rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName);

  const base = FILE_BASE[kind] ?? 'voidhack_report';
  const name = `${base}_${stamp()}${suffix ? `_${suffix}` : ''}.xlsx`;
  XLSX.writeFile(workbook, name);
  return { name, rows: rows.length };
}