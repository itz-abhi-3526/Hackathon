/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Registration Rounds
   Full lifecycle of the dynamic registration phases: create, edit,
   activate / close / reopen and (draft-only, unused) delete. The one-
   active-round invariant is enforced in the DATABASE (trigger + RPC);
   this page only mirrors whatever the server accepted. Capacity is
   teams, not participants.
   ═══════════════════════════════════════════════════════════════ */

import { useMemo, useState } from 'react';
import {
  adminFetchRounds,
  adminFetchLegacyTeamCount,
  adminCreateRound,
  adminUpdateRound,
  adminSetRoundStatus,
  adminDeleteRound,
} from '../services/adminData.js';
import { ROUND_STATUS, ROUND_STATUS_ORDER } from '../../lib/schema.js';
import { useAsync } from '../hooks/useAsync.js';
import { useToast } from '../components/Toast.jsx';
import { PageHeader, StatCard } from '../components/Page.jsx';
import { DataTable } from '../components/DataTable.jsx';
import { SearchBar, FilterChips, RefreshButton } from '../components/Toolbar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { feeLabel, shortDate, roundWindow } from '../utils/format.js';

function isoToLocalInput(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

/* Display state is DERIVED from the stored round so a single source of
   truth drives the chips:
     FULL     → capacity reached (a live round that ran out)
     UPCOMING → draft, or active but its start window is in the future
     CLOSED   → stored closed, or an active window that has elapsed
     ACTIVE   → live and accepting        */
const ROUND_STATUS_DISPLAY = { active: 'ACTIVE', upcoming: 'UPCOMING', closed: 'CLOSED', full: 'FULL' };

function derivedRoundStatus(round) {
  const registered = Number(round?.registered ?? 0);
  const capacity = Number(round?.capacity ?? 0);
  if (capacity > 0 && registered >= capacity) return 'full';

  const stored = round?.status ?? '';
  if (stored === 'closed') return 'closed';

  const now = new Date().getTime();
  const starts = round?.startsAt ? new Date(round.startsAt).getTime() : null;
  const ends = round?.endsAt ? new Date(round.endsAt).getTime() : null;

  if (stored !== 'active' || (starts && starts > now)) return 'upcoming';
  if (ends && ends <= now) return 'closed';
  return 'active';
}

function RoundStatus({ round }) {
  const status = derivedRoundStatus(round);
  return (
    <span className={`cpa-roundst cpa-roundst--${status}`}>
      <span className="cpa-roundst__dot" aria-hidden="true" />
      {ROUND_STATUS_DISPLAY[status]}
    </span>
  );
}

function CapacityCell({ round }) {
  const pct = round.capacity ? Math.min(100, (round.registered / round.capacity) * 100) : 0;
  const full = round.registered >= round.capacity;
  return (
    <div className="cpa-cap">
      <span className="cpa-cap__num">
        {round.registered} / {round.capacity}
      </span>
      <span className="cpa-cap__track">
        <span
          className={`cpa-cap__fill${full ? ' cpa-cap__fill--full' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </div>
  );
}

const EMPTY_FORM = { title: '', fee2Members: '', fee3Members: '', fee4Members: '', capacity: '', startsAt: '', endsAt: '', status: 'draft' };

function RoundFormModal({ round, busy, onSave, onCancel }) {
  const editing = Boolean(round);
  const [form, setForm] = useState(() =>
    editing
      ? {
          title: round.title ?? '',
          fee2Members: String(round.fee2Members ?? ''),
          fee3Members: String(round.fee3Members ?? ''),
          fee4Members: String(round.fee4Members ?? ''),
          capacity: String(round.capacity ?? ''),
          startsAt: isoToLocalInput(round.startsAt),
          endsAt: isoToLocalInput(round.endsAt),
          status: round.status === ROUND_STATUS.ACTIVE ? ROUND_STATUS.ACTIVE : ROUND_STATUS.DRAFT,
        }
      : { ...EMPTY_FORM }
  );
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e) => {
    e.preventDefault();
    onSave({
      title: form.title.trim(),
      fee2Members: form.fee2Members === '' ? undefined : Number(form.fee2Members),
      fee3Members: form.fee3Members === '' ? undefined : Number(form.fee3Members),
      fee4Members: form.fee4Members === '' ? undefined : Number(form.fee4Members),
      capacity: form.capacity === '' ? undefined : Number(form.capacity),
      startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
      endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      status: form.status,
    });
  };

  return (
    <div className="cpa-modal" role="dialog" aria-modal="true" aria-label="Registration round" onClick={onCancel}>
      <form className="cpa-modal__card cpa-modal__card--form" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="cpa-modal__head">
          <div className="cpa-modal__titles">
            <span className="cpa-modal__eyebrow">{editing ? 'EDIT ROUND' : 'NEW ROUND'}</span>
            <span className="cpa-modal__title">{editing ? 'REGISTRATION ROUND SETTINGS' : 'DEFINE A REGISTRATION PHASE'}</span>
          </div>
          <button type="button" className="cpa-modal__close" onClick={onCancel} aria-label="Close" disabled={busy}>×</button>
        </div>

        <div className="cpa-modal__body cpa-form">
          <label className="cpa-field">
            <span className="cpa-field__label">ROUND TITLE *</span>
            <input
              className="cpa-field__input"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. REGULAR REGISTRATION"
              required
              maxLength={80}
            />
          </label>

          <div className="cpa-form__row">
            <label className="cpa-field">
              <span className="cpa-field__label">REGISTRATION FEE (₹) * — 2 MEMBERS</span>
              <input
                className="cpa-field__input"
                type="number"
                min="0"
                step="0.01"
                value={form.fee2Members}
                onChange={set('fee2Members')}
                placeholder="150"
                required
              />
            </label>
            <label className="cpa-field">
              <span className="cpa-field__label">REGISTRATION FEE (₹) * — 3 MEMBERS</span>
              <input
                className="cpa-field__input"
                type="number"
                min="0"
                step="0.01"
                value={form.fee3Members}
                onChange={set('fee3Members')}
                placeholder="200"
                required
              />
            </label>
          </div>

          <div className="cpa-form__row">
            <label className="cpa-field">
              <span className="cpa-field__label">REGISTRATION FEE (₹) * — 4 MEMBERS</span>
              <input
                className="cpa-field__input"
                type="number"
                min="0"
                step="0.01"
                value={form.fee4Members}
                onChange={set('fee4Members')}
                placeholder="250"
                required
              />
            </label>
            <label className="cpa-field">
              <span className="cpa-field__label">CAPACITY (TEAMS) *</span>
              <input
                className="cpa-field__input"
                type="number"
                min="1"
                step="1"
                value={form.capacity}
                onChange={set('capacity')}
                placeholder="100"
                required
              />
            </label>
          </div>

          <div className="cpa-form__row">
            <label className="cpa-field">
              <span className="cpa-field__label">STARTS AT</span>
              <input
                className="cpa-field__input"
                type="datetime-local"
                value={form.startsAt}
                onChange={set('startsAt')}
              />
            </label>
            <label className="cpa-field">
              <span className="cpa-field__label">ENDS AT</span>
              <input
                className="cpa-field__input"
                type="datetime-local"
                value={form.endsAt}
                onChange={set('endsAt')}
              />
            </label>
          </div>

          <div className="cpa-form__row">
            <label className="cpa-field">
              <span className="cpa-field__label">STATUS</span>
              <span className="cpa-field__wrap">
                <select className="cpa-field__select" value={form.status} onChange={set('status')}>
                  <option value="draft">INACTIVE — DRAFT</option>
                  <option value="active">ACTIVE — LIVE FOR PUBLIC REGISTRATION</option>
                </select>
                <span className="cpa-field__arrow" aria-hidden="true">▾</span>
              </span>
            </label>
          </div>

          <p className="cpa-form__note">
            THE THREE FEES ARE THE PRICE PER TEAM BY CREW SIZE — 2, 3 AND 4 MEMBERS. EACH TEAM IS CHARGED THE FEE FOR ITS SELECTED SIZE. ONLY ONE ROUND CAN BE ACTIVE AT A TIME — ACTIVATING A DRAFT / REOPENING A CLOSED ROUND PROMPTLY CLOSES THE CURRENT ACTIVE ONE. CAPACITY COUNTS TEAMS, NOT PARTICIPANTS. DEACTIVATING A ROUND WITH REGISTERED TEAMS ONLY STOPS FUTURE SIGN-UPS; THE TEAMS ALREADY IN IT ARE UNCHANGED.
          </p>
        </div>

        <div className="cpa-modal__foot">
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onCancel} disabled={busy}>CANCEL</button>
          <button type="submit" className="cpa-btn cpa-btn--ok" disabled={busy}>
            {busy ? 'SAVING…' : editing ? 'SAVE ROUND' : 'CREATE ROUND'}
          </button>
        </div>
      </form>
    </div>
  );
}

const STATUS_OPTIONS = ROUND_STATUS_ORDER.map((s) => ({ value: s, label: String(s).toUpperCase() }));

export default function Rounds() {
  const { push } = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sortKey, setSortKey] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [editor, setEditor] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const load = useMemo(
    () => async () => {
      const [rounds, legacy] = await Promise.all([adminFetchRounds(), adminFetchLegacyTeamCount()]);
      return { rounds, legacy };
    },
    []
  );

  const query = useMemo(() => () => load(), [load]);
  const { data, loading, error, reload } = useAsync(query, [query]);

  const runAction = async (key, fn, okMessage) => {
    setBusyKey(key);
    try {
      await fn();
      push(okMessage, 'success');
      reload();
    } catch (err) {
      push(err?.message || 'ACTION FAILED', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const saveRound = async (form) => {
    const targetStatus = form.status ?? (editor ? editor.status : ROUND_STATUS.DRAFT);
    try {
      if (editor) {
        await runAction(
          `save:${editor.id}`,
          async () => {
            if (targetStatus !== editor.status) await adminSetRoundStatus(editor.id, targetStatus);
            await adminUpdateRound(editor.id, form);
          },
          'REGISTRATION ROUND UPDATED'
        );
      } else {
        await runAction('create', async () => {
          const created = await adminCreateRound(form);
          if (targetStatus === ROUND_STATUS.ACTIVE) await adminSetRoundStatus(created.id, ROUND_STATUS.ACTIVE);
        }, 'REGISTRATION ROUND CREATED');
      }
      setCreating(false);
      setEditor(null);
    } catch (err) {
      push(err?.message || 'SAVE FAILED', 'error');
    }
  };

  const rounds = data?.rounds ?? [];
  const hasAnyRound = rounds.length > 0;
  const activeRound = rounds.find((r) => r.status === ROUND_STATUS.ACTIVE) ?? null;

  /* State distinction for the header meta (A loading / B error / C no
     rounds configured / D rounds exist but none active / E active):
     the emptyMessage below additionally distinguishes C from a filtered
     search with no matches. */
  const meta = error
    ? 'REGISTRATION ROUNDS UNAVAILABLE'
    : loading
    ? 'LOADING REGISTRATION ROUNDS\u2026'
    : !hasAnyRound
    ? 'NO REGISTRATION ROUNDS CONFIGURED YET'
    : activeRound
    ? `${String(activeRound.title).toUpperCase()} IS LIVE \u00B7 ${Math.max(0, activeRound.capacity - activeRound.registered)}/ ${activeRound.capacity} SLOTS LEFT`
    : 'NO ROUND IS CURRENTLY ACTIVE';

  /* `rounds` is derived from `data` (stable state object), so the memos
     below key on `data` directly and dereference the array themselves. */
  const collapsedCount = useMemo(() => {
    let total = 0;
    for (const r of data?.rounds ?? []) total += r.registered;
    return total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = (data?.rounds ?? []).filter((r) => {
      const matchesQ =
        !q ||
        String(r.title).toLowerCase().includes(q) ||
        String(r.slug).toLowerCase().includes(q);
      const matchesS = !status || r.status === status;
      return matchesQ && matchesS;
    });

    const dir = sortDir === 'asc' ? 1 : -1;
    const val = (r) => {
      switch (sortKey) {
        case 'title':
          return String(r.title ?? '').toLowerCase();
        case 'fee':
          return Number(r.fee2Members ?? 0);
        case 'capacity':
          return Number(r.capacity ?? 0);
        case 'registered':
          return Number(r.registered ?? 0);
        case 'createdAt':
        default:
          return new Date(r.createdAt ?? 0).getTime();
      }
    };
    filtered = filtered.slice().sort((a, b) => {
      const av = val(a);
      const bv = val(b);
      return av === bv ? 0 : (av > bv ? 1 : -1) * dir;
    });
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, search, status, sortKey, sortDir]);

  const onSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'title' ? 'asc' : 'desc');
    }
  };

  const COLUMNS = [
    { key: 'title', label: 'ROUND', sortable: true, render: (r) => (
      <div className="cpa-cell">
        <span className="cpa-cell__name">{String(r.title).toUpperCase()}</span>
        <span className="cpa-cell__code">{r.slug ? `/ ${String(r.slug).toUpperCase()}` : '\u2014'}</span>
      </div>
    ), className: 'cpa-grid--grow' },
    { key: 'status', label: 'STATUS', render: (r) => <RoundStatus round={r} /> },
    { key: 'fee', label: 'FEE 2/3/4', sortable: true, render: (r) => (
      <div className="cpa-cell">
        <span className="cpa-cell__code">{feeLabel(r.fee2Members)}</span>
        <span className="cpa-cell__code">{feeLabel(r.fee3Members)}</span>
        <span className="cpa-cell__code">{feeLabel(r.fee4Members)}</span>
      </div>
    ) },
    { key: 'capacity', label: 'SLOTS', sortable: true, render: (r) => <CapacityCell round={r} /> },
    { key: 'registered', label: 'REGISTERED', sortable: true, align: 'center', render: (r) => <span className="cpa-num">{String(r.registered).padStart(2, '0')}</span> },
    { key: 'remaining', label: 'REMAINING', sortable: true, align: 'center', render: (r) => <span className="cpa-num">{String(Math.max(0, r.capacity - r.registered)).padStart(2, '0')}</span> },
    { key: 'window', label: 'WINDOW', render: (r) => <span className="cpa-mut cpa-nowrap font-11">{roundWindow(r)}</span> },
    { key: 'createdAt', label: 'CREATED', sortable: true, render: (r) => <span className="cpa-mut cpa-nowrap font-11">{shortDate(r.createdAt)}</span> },
    {
      key: 'actions',
      label: 'ACTIONS',
      align: 'right',
      render: (r) => {
        const isActive = r.status === ROUND_STATUS.ACTIVE;
        const isDraft = r.status === ROUND_STATUS.DRAFT;
        const busy = Boolean(busyKey);
        return (
          <div className="cpa-actions">
            {isDraft && (
              <button
                type="button"
                className="cpa-actions__btn cpa-actions__btn--ok"
                disabled={busy}
                onClick={() => runAction(`status:${r.id}`, () => adminSetRoundStatus(r.id, ROUND_STATUS.ACTIVE), 'ROUND ACTIVATED')}
              >
                ACTIVATE
              </button>
            )}
            {!isDraft && (
              <button
                type="button"
                className="cpa-actions__btn cpa-actions__btn--warn"
                disabled={busy}
                onClick={() => runAction(`status:${r.id}`, () => adminSetRoundStatus(r.id, ROUND_STATUS.ACTIVE), 'ROUND REOPENED')}
                title={isActive ? 'This round is already active' : 'Reopen this round (atomically closes any current active round)'}
              >
                {isActive ? 'LIVE' : 'REOPEN'}
              </button>
            )}
            {isActive && (
              <button
                type="button"
                className="cpa-actions__btn cpa-actions__btn--bad"
                disabled={busy}
                onClick={() => runAction(`status:${r.id}`, () => adminSetRoundStatus(r.id, ROUND_STATUS.CLOSED), 'ROUND CLOSED')}
              >
                CLOSE
              </button>
            )}
            <button
              type="button"
              className="cpa-actions__btn"
              disabled={busy}
              onClick={() => setEditor(r)}
            >
              EDIT
            </button>
            {isDraft && r.registered === 0 && (
              <button
                type="button"
                className="cpa-actions__btn cpa-actions__btn--bad"
                disabled={busy}
                onClick={() => setDeleteTarget(r)}
                title="Only unused drafts can be deleted"
              >
                DELETE
              </button>
            )}
          </div>
        );
      },
    },
  ];

  const emptyMessage = !hasAnyRound
    ? 'NO REGISTRATION ROUNDS CONFIGURED YET — CREATE ONE TO OPEN REGISTRATION'
    : 'NO REGISTRATION ROUNDS MATCH';

  return (
    <>
      <PageHeader
        eyebrow="REGISTRATION / PHASES"
        title="REGISTRATION ROUNDS"
        meta={meta}
        actions={
          <>
            <button
              type="button"
              className="cpa-btn cpa-btn--solid"
              onClick={() => {
                setEditor(null);
                setCreating(true);
              }}
            >
              CREATE REGISTRATION
            </button>
            <RefreshButton onClick={reload} busy={loading} />
          </>
        }
      />

      <section className="cpa-cards">
        <StatCard
          label="ACTIVE ROUND"
          value={activeRound ? String(activeRound.title).toUpperCase() : 'NONE'}
          hint={activeRound ? `${feeLabel(activeRound.fee2Members)} · ${feeLabel(activeRound.fee3Members)} · ${feeLabel(activeRound.fee4Members)} /TEAM BY SIZE · ${activeRound.registered} REGISTERED` : !hasAnyRound ? 'NO REGISTRATION ROUNDS CONFIGURED' : 'NO ACTIVE REGISTRATION PHASE'}
          tone={activeRound ? 'ok' : ''}
        />
        <StatCard label="TOTAL ROUNDS" value={rounds.length} hint="ALL PHASES (DRAFT + ACTIVE + CLOSED)" />
        <StatCard label="TEAMS THIS CYCLE" value={collapsedCount} hint="ACROSS ALL ROUNDS" />
        <StatCard label="LEGACY REGISTRATIONS" value={data?.legacy ?? 0} hint="PRE-ROUNDS, NO FEE RECORDED" />
      </section>

      <div className="cpa-toolbar">
        <SearchBar value={search} onChange={setSearch} placeholder="SEARCH ROUND / SLUG" />
        <div className="cpa-toolbar__filters">
          <FilterChips value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>
      </div>

      <DataTable
        columns={COLUMNS}
        rows={list}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={onSort}
        loading={loading}
        error={error}
        onRefresh={reload}
        emptyMessage={emptyMessage}
      />

      {(creating || editor) && (
        <RoundFormModal
          round={editor}
          busy={busyKey === (editor ? `save:${editor.id}` : 'create')}
          onCancel={() => {
            setCreating(false);
            setEditor(null);
          }}
          onSave={saveRound}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="DELETE THIS ROUND?"
          message={`${String(deleteTarget.title).toUpperCase()} has no registered teams and will be removed permanently. Its fee and capacity disappear with it — no team data is touched.`}
          confirmLabel="DELETE ROUND"
          busy={busyKey === `delete:${deleteTarget.id}`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => {
            const id = deleteTarget.id;
            setDeleteTarget(null);
            runAction(`delete:${id}`, () => adminDeleteRound(id), 'REGISTRATION ROUND DELETED');
          }}
        />
      )}
    </>
  );
}