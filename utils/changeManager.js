// ============================================================
// utils/changeManager.js
// Central Change Impact Management System
//
// RESPONSIBILITIES:
//   1. Detect deep dependents across all transactional stores
//   2. Show a modal summarising what will be affected
//   3. Let the user pick an allowed mode (or cancel)
//   4. Return the decision — NEVER apply changes itself
//
// USAGE (in any master module):
//
//   import { ChangeManager } from '../utils/changeManager.js';
//
//   const result = await ChangeManager.handleUpdate({
//     entity:  'subjects',
//     id:      existing.id,
//     oldData: existing,
//     newData: data,
//   });
//   if (result.cancelled) return;
//
//   AppState.update('subjects', existing.id, data);
//   applySubjectImpact(existing.id, data, result.mode);
// ============================================================

import { AppState }                    from './state.js';
import { Modal }                       from './ui.js';
import { CHANGE_CONFIG, MODE_LABELS }  from './changeConfig.js';

// ── Internal: find all dependent records ─────────────────────
// Returns an array of { label, count, store } objects.
// We scan every store listed in config.impacts and count
// records that reference the changed id.
//
// Store-specific field mappings tell us WHICH field to check.
// ─────────────────────────────────────────────────────────────
const STORE_ID_FIELD = {
  batches:      { institute: null,           campuses:    'campusId',     disciplines: 'disciplineId', levels:   'levelId',   subjects: 'subjectId' },
  lecturePlans: { institute: null,           campuses:    'campusId',     disciplines: 'disciplineId', levels:   'levelId',   subjects: 'subjectId' },
  enrolments:   { institute: null,           campuses:    null,           disciplines: null,           levels:   null,        subjects: 'subjectId' },
};

const STORE_LABELS = {
  batches:      'Batches',
  lecturePlans: 'Lecture Plans',
  enrolments:   'Enrolments',
};

function getDeepDependents(entity, id) {
  const config  = CHANGE_CONFIG[entity];
  if (!config || !config.impacts.length) return [];

  const results = [];

  config.impacts.forEach(store => {
    const fieldMap = STORE_ID_FIELD[store];
    if (!fieldMap) return;

    const idField = fieldMap[entity];
    if (!idField) return; // this store doesn't link to this entity

    const records = AppState.get(store) || [];
    const count   = records.filter(r => r[idField] === id).length;

    if (count > 0) {
      results.push({
        store,
        label: STORE_LABELS[store] || store,
        count,
      });
    }
  });

  return results;
}

// ── Internal: which fields actually changed? ─────────────────
function getChangedFields(oldData, newData, sensitiveFields) {
  return sensitiveFields.filter(f => {
    const oldVal = (oldData[f] || '').toString().trim();
    const newVal = (newData[f] || '').toString().trim();
    return oldVal !== newVal;
  });
}

// ── Internal: inject styles once ─────────────────────────────
let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const st = document.createElement('style');
  st.id = 'cm-styles';
  st.textContent = `
    .cm-section { margin-bottom:14px; }
    .cm-label { font-size:11px; font-weight:600; color:var(--t3); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:6px; }
    .cm-diff { display:flex; align-items:flex-start; gap:10px; flex-wrap:wrap; }
    .cm-val { flex:1; min-width:120px; }
    .cm-val-label { font-size:10.5px; color:var(--t3); margin-bottom:3px; }
    .cm-val-text { font-size:13px; color:var(--t1); font-weight:500; background:var(--surface2); padding:6px 10px; border-radius:7px; border:1px solid var(--border); word-break:break-word; }
    .cm-val-text.old { text-decoration:line-through; color:var(--t3); }
    .cm-val-text.new { border-color:var(--blue); color:var(--blue); }
    .cm-arrow { padding-top:22px; color:var(--t3); font-size:16px; flex-shrink:0; }
    .cm-impact-list { display:flex; flex-direction:column; gap:6px; }
    .cm-impact-row { display:flex; align-items:center; justify-content:space-between; padding:7px 12px; border-radius:8px; background:var(--surface2); border:1px solid var(--border); }
    .cm-impact-name { font-size:12.5px; color:var(--t1); }
    .cm-impact-badge { font-size:11px; font-weight:700; background:var(--yellow-dim,#fef9c3); color:var(--yellow,#ca8a04); padding:2px 9px; border-radius:10px; }
    .cm-no-impact { font-size:12.5px; color:var(--t3); padding:8px 12px; background:var(--surface2); border-radius:8px; border:1px solid var(--border); }
    .cm-mode-list { display:flex; flex-direction:column; gap:8px; }
    .cm-mode-option { display:flex; align-items:flex-start; gap:10px; padding:10px 13px; border-radius:9px; border:1.5px solid var(--border); background:var(--surface1); cursor:pointer; transition:all .15s; }
    .cm-mode-option:hover { border-color:var(--blue); background:var(--blue-dim); }
    .cm-mode-option.selected { border-color:var(--blue); background:var(--blue-dim); }
    .cm-mode-option input[type=radio] { margin-top:2px; accent-color:var(--blue); flex-shrink:0; }
    .cm-mode-title { font-size:13px; font-weight:500; color:var(--t1); }
    .cm-mode-desc { font-size:11.5px; color:var(--t3); margin-top:3px; line-height:1.5; }
    .cm-mode-badge { font-size:10px; font-weight:700; padding:1px 7px; border-radius:8px; margin-left:8px; background:var(--green-dim); color:var(--green); }
    .cm-mode-badge.warn { background:var(--yellow-dim,#fef9c3); color:var(--yellow,#ca8a04); }
    .cm-warning { display:flex; align-items:flex-start; gap:8px; padding:10px 13px; border-radius:8px; background:var(--yellow-dim,#fef9c3); border:1px solid var(--yellow,#ca8a04); font-size:12px; color:var(--t1); line-height:1.5; }
    .cm-warning svg { flex-shrink:0; margin-top:1px; color:var(--yellow,#ca8a04); }
  `;
  document.head.appendChild(st);
}

// ── Internal: build modal body HTML ──────────────────────────
function _buildModalBody({ entity, oldData, newData, changedFields, dependents, allowedModes }) {
  // Diff section
  const fieldRows = changedFields.map(f => {
    const oldVal = oldData[f] || '—';
    const newVal = newData[f] || '—';
    return `
      <div style="margin-bottom:10px">
        <div class="cm-val-label" style="font-size:11px;font-weight:600;color:var(--t3);text-transform:uppercase;margin-bottom:5px">${f}</div>
        <div class="cm-diff">
          <div class="cm-val">
            <div class="cm-val-label">Before</div>
            <div class="cm-val-text old">${oldVal}</div>
          </div>
          <div class="cm-arrow">→</div>
          <div class="cm-val">
            <div class="cm-val-label">After</div>
            <div class="cm-val-text new">${newVal}</div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Impact section
  const impactHTML = dependents.length
    ? `<div class="cm-impact-list">${
        dependents.map(d => `
          <div class="cm-impact-row">
            <span class="cm-impact-name">${d.label}</span>
            <span class="cm-impact-badge">${d.count} record${d.count !== 1 ? 's' : ''} affected</span>
          </div>`).join('')
      }</div>`
    : `<div class="cm-no-impact">No linked records found — change is fully safe.</div>`;

  // Warning if any dependents exist
  const warningHTML = dependents.length ? `
    <div class="cm-warning" style="margin-bottom:14px">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Existing records reference this ${entity.slice(0,-1)}. Choose carefully — historical data should stay protected.
    </div>` : '';

  // Mode options
  const modeHTML = allowedModes.map((mode, i) => {
    const info     = MODE_LABELS[mode];
    const isSafe   = mode === 'SAFE';
    const badgeCls = isSafe ? '' : 'warn';
    return `
      <label class="cm-mode-option ${i === 0 ? 'selected' : ''}" for="cm-mode-${mode}">
        <input type="radio" id="cm-mode-${mode}" name="cm-mode" value="${mode}" ${i === 0 ? 'checked' : ''}/>
        <div style="flex:1">
          <div class="cm-mode-title">
            ${info.label}
            <span class="cm-mode-badge ${badgeCls}">${info.badge}</span>
          </div>
          <div class="cm-mode-desc">${info.description}</div>
        </div>
      </label>`;
  }).join('');

  return `
    <div class="cm-section">
      <div class="cm-label">What is changing</div>
      ${fieldRows}
    </div>
    <div class="cm-section">
      <div class="cm-label">Affected records</div>
      ${impactHTML}
    </div>
    ${warningHTML}
    <div class="cm-section" style="margin-bottom:0">
      <div class="cm-label">How to apply this change</div>
      <div class="cm-mode-list">${modeHTML}</div>
    </div>`;
}

// ── Public API ────────────────────────────────────────────────
export const ChangeManager = {

  // Main entry point.
  // Returns Promise<{ cancelled: boolean, mode: string }>
  handleUpdate({ entity, id, oldData, newData }) {
    return new Promise(resolve => {
      _injectStyles();

      const config = CHANGE_CONFIG[entity];

      // Entity not in config — allow silently (future-proofing)
      if (!config) {
        resolve({ cancelled: false, mode: 'SAFE' });
        return;
      }

      // Detect which sensitive fields actually changed
      const changedFields = getChangedFields(
        oldData, newData, config.sensitiveFields || []
      );

      // If no sensitive fields changed — skip the dialog entirely
      if (!changedFields.length) {
        resolve({ cancelled: false, mode: 'SAFE' });
        return;
      }

      // Scan dependents across all linked stores
      const dependents = getDeepDependents(entity, id);

      // If no dependents AND only one mode — skip dialog
      if (!dependents.length && config.allow.length === 1) {
        resolve({ cancelled: false, mode: config.allow[0] });
        return;
      }

      // Build modal body
      const bodyHTML = _buildModalBody({
        entity,
        oldData,
        newData,
        changedFields,
        dependents,
        allowedModes: config.allow,
      });

      // Open confirmation modal
      Modal.open({
        title:  'Review Change Impact',
        size:   'md',
        scrollable: true,
        body:   bodyHTML,
        footer: `
          <button id="cm-cancel-btn" class="btn btn-ghost" style="margin-right:auto">
            Cancel
          </button>
          <button id="cm-confirm-btn" class="btn btn-primary">
            Apply Change
          </button>`,
        onOpen: (modalEl) => {
          // Highlight selected option on radio change
          modalEl.querySelectorAll('.cm-mode-option').forEach(opt => {
            opt.addEventListener('click', () => {
              modalEl.querySelectorAll('.cm-mode-option').forEach(o => o.classList.remove('selected'));
              opt.classList.add('selected');
            });
          });

          // Cancel
          modalEl.querySelector('#cm-cancel-btn')?.addEventListener('click', () => {
            Modal.closeAll();
            resolve({ cancelled: true, mode: null });
          });

          // Confirm
          modalEl.querySelector('#cm-confirm-btn')?.addEventListener('click', () => {
            const selected = modalEl.querySelector('input[name="cm-mode"]:checked');
            const mode     = selected?.value || config.allow[0];
            Modal.closeAll();
            resolve({ cancelled: false, mode });
          });
        },
      });
    });
  },

  // Expose for external use (e.g. pre-checks, unit tests)
  getDeepDependents,
};
