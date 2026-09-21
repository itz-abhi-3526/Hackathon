/* ═══════════════════════════════════════════════════════════════
   VOIDHACK 2026 — Criteria manager
   Configures a judging round's marking scheme PER ROUND: add / edit /
   delete / reorder evaluation_criteria rows (name, maximum marks,
   description). Nothing is hard-coded — the evaluation screen always
   renders whatever rows exist for the selected round, so every round
   can carry a completely different scheme. Deleting a criterion keeps
   already-saved scores (they are preserved via the criterion_name /
   max_marks snapshots) even though the criterion is removed from the
   scoring form.
   ═══════════════════════════════════════════════════════════════ */

import { useState } from 'react';
import {
  adminCreateEvaluationCriterion,
  adminUpdateEvaluationCriterion,
  adminDeleteEvaluationCriterion,
  adminSwapCriterionOrder,
} from '../services/adminData.js';
import { useToast } from './Toast.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { dateLabel } from '../utils/format.js';

const EMPTY = { name: '', maxScore: '', description: '' };

export default function CriteriaManager({ round, criteria, onClose, onChanged }) {
  const { push } = useToast();
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [busyKey, setBusyKey] = useState('');

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const totalMax = (criteria ?? []).reduce((sum, c) => sum + Number(c.maxScore ?? 0), 0);
  const count = criteria?.length ?? 0;

  const startAdd = () => {
    setForm(EMPTY);
    setEditingId(null);
    setAdding(true);
  };

  const startEdit = (c) => {
    setForm({ name: c.name, description: c.description, maxScore: String(c.maxScore) });
    setAdding(false);
    setEditingId(c.id);
  };

  const cancelForm = () => {
    setForm(EMPTY);
    setEditingId(null);
    setAdding(false);
  };

  const save = async () => {
    setBusyKey('form');
    try {
      if (editingId) {
        await adminUpdateEvaluationCriterion(editingId, form);
        push('CRITERION UPDATED', 'success');
      } else {
        const created = await adminCreateEvaluationCriterion({ judgingRoundId: round.id, ...form });
        push(`${String(created.name).toUpperCase()} ADDED — MAX ${created.maxScore}`, 'success');
      }
      cancelForm();
      onChanged();
    } catch (err) {
      push(err?.message || 'CRITERION COULD NOT BE SAVED', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const confirmDelete = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    setBusyKey(`delete:${target.id}`);
    try {
      await adminDeleteEvaluationCriterion(target.id);
      push(`${String(target.name).toUpperCase()} DELETED — SAVED SCORES KEPT`, 'success');
      onChanged();
    } catch (err) {
      push(err?.message || 'CRITERION COULD NOT BE DELETED', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const swapOrder = async (a, b) => {
    setBusyKey(`reorder:${a.id}`);
    try {
      await adminSwapCriterionOrder({ roundId: round.id, firstId: a.id, secondId: b.id });
      onChanged();
    } catch (err) {
      push(err?.message || 'CRITERIA COULD NOT BE REORDERED', 'error');
    } finally {
      setBusyKey('');
    }
  };

  const formBusy = busyKey === 'form';

  return (
    <div className="cpa-modal" role="dialog" aria-modal="true" aria-label="Manage evaluation criteria" onClick={formBusy ? undefined : onClose}>
      <div className="cpa-modal__card cpa-modal__card--form" onClick={(e) => e.stopPropagation()}>
        <div className="cpa-modal__head">
          <div className="cpa-modal__titles">
            <span className="cpa-modal__eyebrow">CRITERIA CONFIG</span>
            <span className="cpa-modal__title">{String(round.title).toUpperCase()}</span>
          </div>
          <button type="button" className="cpa-modal__close" onClick={onClose} aria-label="Close" disabled={formBusy}>×</button>
        </div>

        <div className="cpa-modal__body">
          <p className="cpa-modal__msg">
            CRITERIA ARE CONFIGURED PER ROUND — each round carries its own marking scheme. Change the
            criterion name, maximum marks and description as needed; the evaluation screen always renders
            what is configured here. Deleting a criterion keeps every saved score (preserved as history).
          </p>

          <div className="cpa-crit__toolbar">
            <span className="cpa-crit__total">TOTAL POSSIBLE — {totalMax}</span>
            <span className="cpa-crit__count">· {count} CRITERIA</span>
            <button type="button" className="cpa-btn cpa-btn--solid" onClick={startAdd} disabled={formBusy || adding}>
              + ADD CRITERION
            </button>
          </div>

          {adding && (
            <div className="cpa-crit__form">
              <CriterionFormRow
                form={form}
                setField={setField}
                busy={formBusy}
                submitLabel="ADD"
                onSubmit={save}
                onCancel={cancelForm}
              />
            </div>
          )}

          {!criteria?.length && !adding ? (
            <div className="cpa-state cpa-state--empty">NO CRITERIA — ADD THE FIRST ONE</div>
          ) : (
            <div className="cpa-crit__list">
              {(criteria ?? []).map((c, idx) => (
                <div key={c.id} className={`cpa-crit__item${editingId === c.id ? ' cpa-crit__item--editing' : ''}`}>
                  {editingId === c.id ? (
                    <CriterionFormRow
                      form={form}
                      setField={setField}
                      busy={formBusy}
                      submitLabel="SAVE"
                      onSubmit={save}
                      onCancel={cancelForm}
                    />
                  ) : (
                    <>
                      <div className="cpa-crit__head">
                        <span className="cpa-crit__name">{String(c.name).toUpperCase()}</span>
                        <span className="cpa-crit__max">MAX {c.maxScore}{c.updatedAt ? ` · UPDATED ${dateLabel(c.updatedAt)}` : ''}</span>
                      </div>
                      {c.description && <p className="cpa-crit__desc">{c.description}</p>}
                      <div className="cpa-crit__actions">
                        <button
                          type="button"
                          className="cpa-actions__btn"
                          title="Move up"
                          aria-label={`Move ${c.name} up`}
                          disabled={Boolean(busyKey) || idx === 0}
                          onClick={() => swapOrder(c, criteria[idx - 1])}
                        >
                          ▲
                        </button>
                        <button
                          type="button"
                          className="cpa-actions__btn"
                          title="Move down"
                          aria-label={`Move ${c.name} down`}
                          disabled={Boolean(busyKey) || idx === count - 1}
                          onClick={() => swapOrder(c, criteria[idx + 1])}
                        >
                          ▼
                        </button>
                        <button
                          type="button"
                          className="cpa-actions__btn"
                          disabled={Boolean(busyKey)}
                          onClick={() => startEdit(c)}
                        >
                          EDIT
                        </button>
                        <button
                          type="button"
                          className="cpa-actions__btn cpa-actions__btn--bad"
                          disabled={Boolean(busyKey)}
                          onClick={() => setDeleteTarget(c)}
                        >
                          DELETE
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="cpa-modal__foot">
          <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onClose} disabled={Boolean(busyKey)}>
            DONE
          </button>
        </div>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="DELETE THIS CRITERION?"
          message={`${String(deleteTarget.name).toUpperCase()} (MAX ${deleteTarget.maxScore}) will be removed from this round's scoring form. Scores already saved for it are KEPT as history — they keep this name and maximum marks.`}
          confirmLabel="DELETE CRITERION"
          busy={busyKey === `delete:${deleteTarget.id}`}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function CriterionFormRow({ form, setField, busy, submitLabel, onSubmit, onCancel }) {
  return (
    <div className="cpa-crit__inputs">
      <label className="cpa-field cpa-crit__cell--name">
        <span className="cpa-field__label">CRITERION NAME *</span>
        <input
          className="cpa-field__input"
          value={form.name}
          maxLength={120}
          placeholder="e.g. Technical Depth"
          disabled={busy}
          onChange={(e) => setField('name', e.target.value)}
        />
      </label>
      <label className="cpa-field cpa-crit__cell--max">
        <span className="cpa-field__label">MAX MARKS *</span>
        <input
          className="cpa-field__input"
          type="number"
          min="0.01"
          step="any"
          value={form.maxScore}
          placeholder="25"
          disabled={busy}
          onChange={(e) => setField('maxScore', e.target.value)}
        />
      </label>
      <label className="cpa-field cpa-crit__cell--desc">
        <span className="cpa-field__label">DESCRIPTION</span>
        <input
          className="cpa-field__input"
          value={form.description}
          maxLength={240}
          placeholder="(optional)"
          disabled={busy}
          onChange={(e) => setField('description', e.target.value)}
        />
      </label>
      <div className="cpa-crit__cell--actions">
        <button type="button" className="cpa-btn cpa-btn--ok" onClick={onSubmit} disabled={busy}>
          {busy ? 'SAVING…' : submitLabel}
        </button>
        <button type="button" className="cpa-btn cpa-btn--ghost" onClick={onCancel} disabled={busy}>
          CANCEL
        </button>
      </div>
    </div>
  );
}