// ============================================================
// modules/campus.js — Campus Module (CRUD)
// Fields: id, campusName, instituteId, city
// v2: Role-based access — admin sees all, campusAdmin sees own
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';
import { Auth } from '../utils/auth.js';

const KEY = 'campuses';

const RULES = {
  campusName:  { required: true, minLen: 3, message: 'Enter a campus name (min 3 chars).' },
  instituteId: { required: true, message: 'Select an institute.' },
};

export const CampusModule = {

  mount(container) {
    injectUIStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);

    // Role-based button visibility
    // Sirf admin Add Campus kar sakta hai
    const addBtn = el.querySelector('#campusAddBtn');
    if (addBtn) {
      addBtn.style.display = Auth.can('campuses:create') ? '' : 'none';
    }
  },

  // ── Visible campuses for current user ────────────────────────
  _getVisibleCampuses() {
    const user = Auth.getCurrentUser();
    const all  = AppState.get(KEY) || [];

    // Admin = sab campuses, baaki = sirf apna campus
    if (!user || !user.campusId) return all;
    return all.filter(c => c.id === user.campusId);
  },

  _render(container, filter = '') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    const all  = this._getVisibleCampuses();
    const rows = filter
      ? all.filter(c =>
          c.campusName.toLowerCase().includes(filter) ||
          (c.city || '').toLowerCase().includes(filter))
      : all;

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    const canEdit   = Auth.can('campuses:edit');
    const canDelete = Auth.can('campuses:delete');

    const actions = [];
    if (canEdit) {
      actions.push({
        label: 'Edit',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        handler: (row) => this._openForm(row, el)
      });
    }
    if (canDelete) {
      actions.push({
        label: 'Delete', danger: true,
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`,
        handler: (row) => this._delete(row, el)
      });
    }

    Table.render(el.querySelector('#campus-table'), {
      columns: [
        { key: 'campusName', label: 'Campus Name' },
        { key: 'city', label: 'City', width: '140px',
          render: (val) => val || '<span style="color:var(--t4)">—</span>' },
        { key: 'instituteId', label: 'Institute', width: '200px',
          render: (id) => {
            const inst = AppState.findById('institutes', id);
            return inst
              ? `<span style="color:var(--t2)">${inst.instituteName}</span>`
              : '<span style="color:var(--t4)">—</span>';
          }
        },
        { key: 'id', label: 'Batches', width: '90px',
          render: (id) => {
            const count = (AppState.get('batches') || []).filter(b => b.campusId === id).length;
            return `<span class="badge badge--grey">${count} batch${count !== 1 ? 'es' : ''}</span>`;
          }
        },
      ],
      rows,
      emptyMsg: 'No campuses found.',
      actions,
    });
  },

  _openForm(existing = null, container) {
    // Double-check permission
    const isEdit = !!existing;
    if (isEdit  && !Auth.can('campuses:edit'))   return Toast.warning('Permission denied.');
    if (!isEdit && !Auth.can('campuses:create')) return Toast.warning('Permission denied.');

    const institutes = AppState.get('institutes') || [];

    Modal.open({
      title: isEdit ? 'Edit Campus' : 'Add Campus',
      body: `
        <div class="form-group">
          <label class="form-label">Campus Name <span class="req">*</span></label>
          <input name="campusName" class="form-input" placeholder="e.g. Main Campus, City Campus"
                 value="${existing?.campusName || ''}"/>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">City</label>
            <input name="city" class="form-input" placeholder="e.g. Islamabad"
                   value="${existing?.city || ''}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Institute <span class="req">*</span></label>
            <select name="instituteId" class="form-select form-input">
              <option value="">Select institute…</option>
              ${Form.buildOptions(institutes, 'id', 'instituteName', existing?.instituteId || '')}
            </select>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: isEdit ? 'Save Changes' : 'Add Campus',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            const { valid } = Form.validate(modalEl.querySelector('.modal-body'), RULES);
            if (!valid) return;
            const data = Form.collect(modalEl.querySelector('.modal-body'));
            if (isEdit) {
              AppState.update(KEY, existing.id, data);
              Toast.success(`Campus "${data.campusName}" updated.`);
            } else {
              AppState.add(KEY, { ...data, id: generateID('camp') });
              Toast.success(`Campus "${data.campusName}" added.`);
            }
            Modal.closeAll();
            this._render(container);
          }
        }
      ]
    });
  },

  async _delete(row, container) {
    if (!Auth.can('campuses:delete')) return Toast.warning('Permission denied.');

    const deps = AppState.getDependents(KEY, row.id);
    if (deps.length) {
      Toast.warning(`Cannot delete — referenced by ${deps.map(d => `${d.count} ${d.label}(s)`).join(', ')}.`);
      return;
    }
    const ok = await Modal.confirm({
      title: 'Delete Campus',
      message: `Delete <strong>${row.campusName}</strong>? This cannot be undone.`,
      confirmLabel: 'Delete', danger: true
    });
    if (!ok) return;
    AppState.remove(KEY, row.id);
    Toast.success(`Campus "${row.campusName}" deleted.`);
    this._render(container);
  },

  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    el.querySelector('#campusAddBtn')?.addEventListener('click', () => {
      if (!Auth.can('campuses:create')) return Toast.warning('Permission denied.');
      this._openForm(null, el);
    });
    el.querySelector('#campusSearch')?.addEventListener('input', (e) => {
      this._render(el, e.target.value.toLowerCase().trim());
    });
  },

  _pageTemplate() {
    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="campusSearch" class="search-input" placeholder="Search campuses…"/>
          </div>
          <span class="record-count">— records</span>
          <button id="campusAddBtn" class="add-btn" style="margin-left:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Campus
          </button>
        </div>
        <div id="campus-table"></div>
      </div>
    `;
  }
};
