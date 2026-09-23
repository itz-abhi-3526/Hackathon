/* ═══════════════════════════════════════════════════════════════
   HACK2PITCH 2026 — Payments
   Payment-focused operational view: every team's payment status +
   proof, filterable by status, with inline SUBMITTED/VERIFIED/REJECTED
   verification (rejected requires confirmation). The public payment
   submission flow is not touched.
   ═══════════════════════════════════════════════════════════════ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminFetchTeams,
  adminSetPaymentStatus,
  adminSendVerificationEmail,
  adminSendRejectionEmail,
  adminFetchProblems,
  adminFetchAllTeams,
} from '../services/adminData.js';
import { TEAM_PAYMENT_STATUS } from '../../lib/schema.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader } from '../components/Page.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { SearchBar, FilterChips, SelectField, Pagination, RefreshButton, ExportButton } from '../components/Toolbar.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import PaymentProofViewer from '../components/PaymentProofViewer.jsx';
import EmailStatusCell from '../components/EmailStatusCell.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import TeamDetailsDrawer from '../components/TeamDetailsDrawer.jsx';
import { codeFor, dateLabel, problemLabel, roundLabel } from '../utils/format.js';
import { downloadExcel } from '../services/adminExcel.js';

const STATUS_OPTIONS = Object.values(TEAM_PAYMENT_STATUS).map((s) => ({
  value: s,
  label: String(s).toUpperCase(),
}));

const EMAIL_MESSAGES = {
  TEAM_NOT_FOUND: 'Registration not found.',
  PAYMENT_NOT_VERIFIED: 'Payment must be verified before sending the verification email.',
  PAYMENT_NOT_REJECTED: 'Payment must be rejected before sending the rejection email.',
  LEAD_EMAIL_MISSING: 'Team leader email is missing.',
  INVALID_LEAD_EMAIL: 'The registered leader email is invalid.',
  EMAIL_SEND_FAILED: 'Failed to send email. Please try again.',
};

function ProofCell({ url, teamName, onView }) {
  if (!url) return <span className="cpa-mut">NO PROOF</span>;
  return (
    <button type="button" className="cpa-proof-mini" onClick={() => onView(url, teamName)} aria-label="View payment proof">
      <img src={url} alt="Payment proof" />
      <span className="cpa-proof-mini__badge">VIEW</span>
    </button>
  );
}

function ActionsCell({ row, busy, onVerify, onReject }) {
  return (
    <div className="cpa-actions">
      {row.paymentStatus !== 'verified' && (
        <button
          type="button"
          className="cpa-actions__btn cpa-actions__btn--ok"
          disabled={busy || row.paymentStatus === 'submitted' && !row.paymentImageUrl}
          onClick={() => onVerify(row)}
          title={!row.paymentImageUrl ? 'No proof uploaded yet' : 'Verify payment'}
        >
          VERIFY
        </button>
      )}
      {row.paymentStatus !== 'rejected' && (
        <button
          type="button"
          className="cpa-actions__btn cpa-actions__btn--bad"
          disabled={busy}
          onClick={() => onReject(row)}
          title="Reject payment"
        >
          REJECT
        </button>
      )}
    </div>
  );
}

export default function Payments() {
  const { push } = useToast();
  const [filters, setFilters] = useState({ search: '', paymentStatus: '', problemStatementId: '' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [busyId, setBusyId] = useState('');
  const [proof, setProof] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [drawerTeam, setDrawerTeam] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [emailBusy, setEmailBusy] = useState('');
  const [emailDialog, setEmailDialog] = useState(null);

  const problems = useAsync(() => adminFetchProblems(), []);
  const problemOptions = (problems.data ?? []).map((p) => ({
    value: p.id,
    label: `${String(p.track).toUpperCase()} / ${p.title}`,
  }));

  const approvedFilters = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(filters)
          .filter(([, v]) => v && v.trim() !== '')
          .map(([k, v]) => [k, v])
      ),
    [filters]
  );

  const query = useCallback(
    () => adminFetchTeams({ ...approvedFilters, sortBy: 'createdAt', sortDir: 'desc', page, pageSize }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(approvedFilters), page, pageSize]
  );
  const { data, loading, error, reload } = useAsync(query, [
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(approvedFilters),
    page,
    pageSize,
  ]);

  useEffect(() => {
    setPage(0);
  }, [filters]);

  const confirmStatus = useCallback(
    async (teamId, status, reason = '') => {
      setBusyId(teamId);
      try {
        await adminSetPaymentStatus(teamId, status, reason);
        push(`PAYMENT MARKED ${status.toUpperCase()}`, 'success');
        reload();
      } catch (err) {
        push(err?.message || 'STATUS UPDATE FAILED', 'error');
      } finally {
        setBusyId('');
      }
    },
    [push, reload]
  );

  const exportAll = async () => {
    setExporting(true);
    try {
      const rows = await adminFetchAllTeams(approvedFilters);
      const { name } = await downloadExcel({ kind: 'teams', rows, suffix: 'payments' });
      push(`${rows.length} TEAMS EXPORTED → ${name}`, 'success');
    } catch (err) {
      push(err?.message || 'EXPORT FAILED', 'error');
    } finally {
      setExporting(false);
    }
  };

  const sendEmail = useCallback(
    async (row, kind) => {
      const isReject = kind === 'reject';
      setEmailBusy(row.id);
      try {
        const result = isReject
          ? await adminSendRejectionEmail(row.id)
          : await adminSendVerificationEmail(row.id);
        if (result?.ok) {
          if (result.statusUpdated === false) {
            push('EMAIL SENT \u2014 STATUS NOT RECORDED ON SERVER. CHECK LOGS.', 'error');
          } else {
            push(isReject ? 'REJECTION EMAIL SENT' : 'VERIFICATION EMAIL SENT', 'success');
          }
          reload();
        } else {
          push(EMAIL_MESSAGES[result?.code] ?? result?.error ?? 'FAILED TO SEND EMAIL', 'error');
        }
      } catch (err) {
        push(err?.message || 'FAILED TO SEND EMAIL', 'error');
      } finally {
        setEmailBusy('');
        setEmailDialog(null);
      }
    },
    [push, reload]
  );

  const COLUMNS = [
    {
      key: 'teamName',
      label: 'TEAM',
      render: (row) => (
        <div className="cpa-cell">
          <span className="cpa-cell__name">{row.teamName}</span>
          <span className="cpa-cell__code">{codeFor(row)}</span>
        </div>
      ),
      className: 'cpa-grid--grow',
    },
    {
      key: 'problem',
      label: 'PROBLEM',
      render: (row) => <span className="cpa-truncate cpa-mut">{problemLabel(row.problem)}</span>,
    },
    {
      key: 'registrationRound',
      label: 'ROUND',
      render: (row) => <span className="cpa-truncate cpa-mut">{roundLabel(row)}</span>,
    },
    {
      key: 'college',
      label: 'COLLEGE',
      render: (row) => <span className="cpa-truncate">{row.college}</span>,
      className: 'cpa-grid--grow',
    },
    {
      key: 'proof',
      label: 'PAYMENT PROOF',
      render: (row) => (
        <ProofCell
          url={row.paymentImageUrl}
          teamName={row.teamName}
          onView={(url, name) => setProof({ url, name })}
        />
      ),
    },
    {
      key: 'paymentStatus',
      label: 'STATUS',
      render: (row) => <StatusBadge status={row.paymentStatus} />,
    },
    {
      key: 'email',
      label: 'EMAIL',
      render: (row) => (
        <EmailStatusCell
          row={row}
          busy={emailBusy === row.id}
          onSend={sendEmail}
          onResend={(r, kind) => setEmailDialog({ row: r, kind })}
        />
      ),
    },
    {
      key: 'createdAt',
      label: 'REGISTERED',
      render: (row) => <span className="cpa-mut cpa-nowrap">{dateLabel(row.createdAt)}</span>,
    },
    {
      key: 'actions',
      label: 'ACTIONS',
      align: 'right',
      render: (row) => (
        <ActionsCell
          row={row}
          busy={busyId === row.id}
          onVerify={(row) => setVerifyTarget(row)}
          onReject={(row) => setRejectTarget(row)}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="FINANCE / VERIFICATION"
        title="PAYMENTS"
        meta={`${data?.count ?? '—'} TEAMS · PROOF REVIEW + STATUS VERIFICATION`}
        actions={
          <>
            <ExportButton onClick={exportAll} busy={exporting} label="EXPORT PAYMENTS" />
            <RefreshButton onClick={reload} busy={loading} />
          </>
        }
      />

      <div className="cpa-toolbar">
        <SearchBar value={filters.search} onChange={(v) => setFilters((f) => ({ ...f, search: v }))} placeholder="SEARCH TEAM / CODE / COLLEGE" />
        <div className="cpa-toolbar__filters">
          <FilterChips value={filters.paymentStatus} onChange={(v) => setFilters((f) => ({ ...f, paymentStatus: v }))} options={STATUS_OPTIONS} />
          <SelectField
            label="PROBLEM"
            value={filters.problemStatementId}
            onChange={(v) => setFilters((f) => ({ ...f, problemStatementId: v }))}
            options={problemOptions}
          />
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={data?.rows ?? []}
        loading={loading}
        error={error}
        onRefresh={reload}
        emptyMessage="NO PAYMENTS MATCH YOUR FILTERS"
        onRowClick={(row) => setDrawerTeam(row.id)}
        footer={
          <Pagination
            page={page}
            pageSize={pageSize}
            count={data?.count ?? 0}
            onPage={setPage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(0);
            }}
          />
        }
      />

      {proof && <PaymentProofViewer url={proof.url} teamName={proof.name} onClose={() => setProof(null)} />}

      {verifyTarget && (
        <ConfirmDialog
          title="VERIFY THIS PAYMENT?"
          message={`Approve the payment proof for ${verifyTarget.teamName} (${codeFor(verifyTarget)}). This locks their status to VERIFIED and the crew keeps its slot.`}
          confirmLabel="VERIFY PAYMENT"
          busy={busyId === verifyTarget.id}
          onCancel={() => setVerifyTarget(null)}
          onConfirm={() => {
            const id = verifyTarget.id;
            setVerifyTarget(null);
            confirmStatus(id, 'verified');
          }}
        />
      )}

      {rejectTarget && (
        <ConfirmDialog
          title="MARK PAYMENT REJECTED?"
          message={`${rejectTarget.teamName} will be flagged rejected. The crew can correct and resubmit through the public flow.`}
          confirmLabel="MARK REJECTED"
          busy={busyId === rejectTarget.id}
          onCancel={() => setRejectTarget(null)}
          onConfirm={() => {
            const id = rejectTarget.id;
            const reason = rejectReason.trim();
            setRejectTarget(null);
            setRejectReason('');
            confirmStatus(id, 'rejected', reason);
          }}
        >
          <label className="cpa-field">
            <span className="cpa-field__label">REASON FOR REJECTION — SENT TO THE TEAM LEAD VIA THE REJECTION EMAIL</span>
            <textarea
              className="cpa-field__textarea"
              rows={3}
              placeholder="e.g. Payment amount does not match the registration fee for this round."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              autoFocus
            />
          </label>
        </ConfirmDialog>
      )}

      {drawerTeam && <TeamDetailsDrawer teamId={drawerTeam} onClose={() => setDrawerTeam(null)} onChanged={reload} />}

      {emailDialog && (
        <ConfirmDialog
          title={emailDialog.kind === 'reject' ? 'RESEND REJECTION EMAIL?' : 'RESEND VERIFICATION EMAIL?'}
          message={
            emailDialog.kind === 'reject'
              ? `A rejection email has already been sent to ${emailDialog.row.rejectionEmailLastSentTo ?? 'the team lead'}. Do you want to send it again?`
              : `A verification email has already been sent to ${emailDialog.row.verificationEmailLastSentTo ?? 'the team lead'}. Do you want to send it again?`
          }
          confirmLabel="RESEND EMAIL"
          tone="ok"
          busy={emailBusy === emailDialog.row.id}
          onCancel={() => setEmailDialog(null)}
          onConfirm={() => sendEmail(emailDialog.row, emailDialog.kind)}
        />
      )}
    </>
  );
}