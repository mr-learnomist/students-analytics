// ============================================================
// modules/levels.js — Levels Module (CRUD)
// Fields: id, disciplineId (FK), levelName
// v2: Role-based access — admin CRUD, teacher/viewer read-only
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';
import { Auth } from '../utils/auth.js';

const KEY = 'levels';

// Whether the "Show Archived" toggle is currently on (per page session)
let _showArchived = false;

/**
 * Get levels selectable in a dropdown (e.g. Add/Edit Subject, Add/Edit Batch).
 * Excludes archived levels by default, but ALWAYS includes `currentLevelId`
 * (the level already saved on the record being edited) even if archived —
 * so editing an existing record never shows a blank/missing selection.
 *
 * @param {string} [disciplineId] — restrict to a discipline (optional)
 * @param {string} [currentLevelId] — level already assigned to the record being edited
 * @returns {Array} levels
 */
export function getSelectableLevels(disciplineId = '', currentLevelId = '') {
  const levels = AppState.get('levels') || [];
  return levels.filter(l => {
    if (disciplineId && l.disciplineId !== disciplineId) return false;
    if (l.isArchived && l.id !== currentLevelId) return false;
    return true;
  });
}

const RULES = {
  disciplineId:     { required: true, message: 'Select a discipline.' },
  levelName:        { required: true, minLen: 2, message: 'Enter a level name (e.g. Semester 1).' },
  compulsoryPapers: { required: true, message: 'Enter number of compulsory papers.' },
  optionalPapers:   { required: true, message: 'Enter number of optional papers.' },
};

export const LevelsModule = {

  mount(container) {
    injectUIStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);

    // Sirf admin Add button dekhe
    const addBtn = el.querySelector('#levelsAddBtn');
    if (addBtn) {
      addBtn.style.display = Auth.can('levels:create') ? '' : 'none';
    }
  },

  _render(container, filter = '', discFilter = '') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    // Levels global hain — campus se filter nahi hoti
    // Teacher bhi sab levels dekh sakta hai (read-only)
    let rows = AppState.get(KEY) || [];

    if (discFilter) rows = rows.filter(l => l.disciplineId === discFilter);
    if (filter)     rows = rows.filter(l => l.levelName.toLowerCase().includes(filter));
    if (!_showArchived) rows = rows.filter(l => !l.isArchived);

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    const canEdit   = Auth.can('levels:edit');
    const canDelete = Auth.can('levels:delete');

    const actions = [];
    if (canEdit) {
      actions.push({
        label: 'Edit',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        handler: (row) => this._openForm(row, el)
      });
      actions.push({
        label: 'Archive/Restore',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>`,
        handler: (row) => this._toggleArchive(row, el)
      });
    }
    if (canDelete) {
      actions.push({
        label: 'Delete', danger: true,
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`,
        handler: (row) => this._delete(row, el)
      });
    }

    Table.render(el.querySelector('#levels-table'), {
      columns: [
        { key: 'disciplineId', label: 'Discipline', width: '130px',
          render: (id) => {
            const d = AppState.findById('disciplines', id);
            return d
              ? `<span class="badge badge--blue" style="font-family:var(--font-mono)">${d.abbreviation}</span>`
              : '<span style="color:var(--t4)">Unknown</span>';
          }
        },
        { key: 'levelName', label: 'Level Name' },
        { key: 'isArchived', label: 'Status', width: '100px',
          render: (val) => val
            ? `<span class="badge badge--grey">Archived</span>`
            : `<span class="badge badge--green">Active</span>`
        },
        { key: 'compulsoryPapers', label: 'Compulsory', width: '100px',
          render: (val) => `<span style="font-family:var(--font-mono);font-size:13px;color:var(--t1)">${val ?? 0}</span>`
        },
        { key: 'optionalPapers', label: 'Optional', width: '100px',
          render: (val) => `<span style="font-family:var(--font-mono);font-size:13px;color:var(--t1)">${val ?? 0}</span>`
        },
        { key: 'id', label: 'Subjects', width: '100px',
          render: (id) => {
            const count = (AppState.get('subjects') || []).filter(s => s.levelId === id).length;
            return `<span style="font-family:var(--font-mono);font-size:13px;color:var(--t1)">${count}</span>`;
          }
        },
      ],
      rows,
      emptyMsg: 'No levels configured. Add levels to link subjects and batches.',
      actions,
    });
  },

  _openForm(existing = null, container) {
    const isEdit = !!existing;
    if (isEdit  && !Auth.can('levels:edit'))   return Toast.warning('Permission denied.');
    if (!isEdit && !Auth.can('levels:create')) return Toast.warning('Permission denied.');

    const disciplines = AppState.get('disciplines') || [];

    Modal.open({
      title: isEdit ? 'Edit Level' : 'Add Level',
      body: `
        <div class="form-group">
          <label class="form-label">Discipline <span class="req">*</span></label>
          <select name="disciplineId" class="form-select form-input">
            <option value="">Select discipline…</option>
            ${Form.buildOptions(disciplines, 'id', 'fullName', existing?.disciplineId || '')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Level Name <span class="req">*</span></label>
          <input name="levelName" class="form-input"
                 placeholder="e.g. Semester 1, Year 1, Term A"
                 value="${existing?.levelName || ''}"/>
          <span class="form-hint">How this level is referred to in your institution.</span>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Compulsory Papers <span class="req">*</span></label>
            <input name="compulsoryPapers" type="number" min="0" class="form-input"
                   placeholder="e.g. 5"
                   value="${existing?.compulsoryPapers ?? ''}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Optional Papers <span class="req">*</span></label>
            <input name="optionalPapers" type="number" min="0" class="form-input"
                   placeholder="e.g. 2"
                   value="${existing?.optionalPapers ?? ''}"/>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: isEdit ? 'Save Changes' : 'Add Level',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            const { valid } = Form.validate(modalEl.querySelector('.modal-body'), RULES);
            if (!valid) return;
            const data = Form.collect(modalEl.querySelector('.modal-body'));
            if (isEdit) {
              AppState.update(KEY, existing.id, data);
              Toast.success(`Level "${data.levelName}" updated.`);
            } else {
              AppState.add(KEY, { ...data, id: generateID('lvl') });
              Toast.success(`Level "${data.levelName}" added.`);
            }
            Modal.closeAll();
            this._render(container);
          }
        }
      ]
    });
  },

  async _delete(row, container) {
    if (!Auth.can('levels:delete')) return Toast.warning('Permission denied.');

    const deps = AppState.getDependents(KEY, row.id);
    if (deps.length) {
      Toast.warning(`Cannot delete — referenced by ${deps.map(d => `${d.count} ${d.label}(s)`).join(', ')}.`);
      return;
    }
    const ok = await Modal.confirm({
      title: 'Delete Level',
      message: `Delete <strong>${row.levelName}</strong>? This cannot be undone.`,
      confirmLabel: 'Delete', danger: true
    });
    if (!ok) return;
    AppState.remove(KEY, row.id);
    Toast.success(`Level "${row.levelName}" deleted.`);
    this._render(container);
  },

  async _toggleArchive(row, container) {
    if (!Auth.can('levels:edit')) return Toast.warning('Permission denied.');

    if (!row.isArchived) {
      // Archiving — safe regardless of dependents; historic records keep referencing this level.
      const ok = await Modal.confirm({
        title: 'Archive Level',
        message: `Archive <strong>${row.levelName}</strong>? It will be hidden from selection in new records (Subjects, Batches), but existing records and history stay unaffected. You can restore it anytime.`,
        confirmLabel: 'Archive'
      });
      if (!ok) return;
      AppState.update(KEY, row.id, { isArchived: true });
      Toast.success(`Level "${row.levelName}" archived.`);
    } else {
      AppState.update(KEY, row.id, { isArchived: false });
      Toast.success(`Level "${row.levelName}" restored.`);
    }
    this._render(container);
  },

  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    el.querySelector('#levelsAddBtn')?.addEventListener('click', () => {
      if (!Auth.can('levels:create')) return Toast.warning('Permission denied.');
      this._openForm(null, el);
    });

    let searchVal = '', discVal = '';

    el.querySelector('#levelsSearch')?.addEventListener('input', (e) => {
      searchVal = e.target.value.toLowerCase().trim();
      this._render(el, searchVal, discVal);
    });

    el.querySelector('#levelsDiscFilter')?.addEventListener('change', (e) => {
      discVal = e.target.value;
      this._render(el, searchVal, discVal);
    });

    const showArchivedChk = el.querySelector('#levelsShowArchived');
    if (showArchivedChk) {
      showArchivedChk.checked = _showArchived;
      showArchivedChk.addEventListener('change', (e) => {
        _showArchived = e.target.checked;
        this._render(el, searchVal, discVal);
      });
    }
  },

  _pageTemplate() {
    const disciplines = AppState.get('disciplines') || [];
    const discOptions = disciplines.map(d =>
      `<option value="${d.id}">${d.abbreviation} — ${d.fullName}</option>`
    ).join('');

    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="levelsSearch" class="search-input" placeholder="Search levels…"/>
          </div>
          <select id="levelsDiscFilter" class="form-select form-input" style="max-width:200px;flex-shrink:0">
            <option value="">All Disciplines</option>
            ${discOptions}
          </select>
          <span class="record-count">— records</span>
          <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--t2);cursor:pointer;white-space:nowrap">
            <input type="checkbox" id="levelsShowArchived" style="width:14px;height:14px;accent-color:#4f85f7"/>
            Show Archived
          </label>
          <button id="levelsAddBtn" class="add-btn" style="margin-left:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Level
          </button>
        </div>
        <div id="levels-table"></div>
      </div>
    `;
  }
};
