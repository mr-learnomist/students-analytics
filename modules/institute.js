// ============================================================
// modules/institute.js — Institute Module (CRUD)
// Fields: id, instituteName, city, estYear
// v2: Role-based access — sirf admin CRUD kar sakta hai
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';
import { Auth } from '../utils/auth.js';

const KEY = 'institutes';

const RULES = {
  instituteName: { required: true, minLen: 4, message: 'Enter a full institute name.' },
};

export const InstituteModule = {

  mount(container) {
    injectUIStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);

    // Sirf admin Add button dekhe
    const addBtn = el.querySelector('#instituteAddBtn');
    if (addBtn) {
      addBtn.style.display = Auth.can('institutes:create') ? '' : 'none';
    }
  },

  // ── Institutes global hoti hain — campus filter nahi lagta ──
  // Lekin non-admin sirf read kar sakta hai
  _render(container, filter = '') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    const all  = AppState.get(KEY) || [];
    const rows = filter
      ? all.filter(i =>
          i.instituteName.toLowerCase().includes(filter) ||
          (i.city || '').toLowerCase().includes(filter))
      : all;

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    const canEdit   = Auth.can('institutes:edit');
    const canDelete = Auth.can('institutes:delete');

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

    Table.render(el.querySelector('#institute-table'), {
      columns: [
        { key: 'instituteName', label: 'Institute Name' },
        { key: 'city',    label: 'City',     width: '140px', render: v => v || '—' },
        { key: 'estYear', label: 'Est. Year', width: '100px', render: v => v || '—' },
        { key: 'id', label: 'Campuses', width: '100px',
          render: (id) => {
            const count = (AppState.get('campuses') || []).filter(c => c.instituteId === id).length;
            return `<span class="badge badge--violet">${count} campus${count !== 1 ? 'es' : ''}</span>`;
          }
        },
      ],
      rows,
      emptyMsg: 'No institutes configured. Add one to get started.',
      actions,
    });
  },

  _openForm(existing = null, container) {
    const isEdit = !!existing;
    if (isEdit  && !Auth.can('institutes:edit'))   return Toast.warning('Permission denied.');
    if (!isEdit && !Auth.can('institutes:create')) return Toast.warning('Permission denied.');

    Modal.open({
      title: isEdit ? 'Edit Institute' : 'Add Institute',
      body: `
        <div class="form-group">
          <label class="form-label">Institute Name <span class="req">*</span></label>
          <input name="instituteName" class="form-input"
                 placeholder="e.g. FAST National University"
                 value="${existing?.instituteName || ''}"/>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">City</label>
            <input name="city" class="form-input" placeholder="e.g. Islamabad"
                   value="${existing?.city || ''}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Est. Year</label>
            <input name="estYear" class="form-input" type="number"
                   placeholder="e.g. 1999" min="1800" max="2099"
                   value="${existing?.estYear || ''}"/>
          </div>
        </div>
      `,
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: isEdit ? 'Save Changes' : 'Add Institute',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            const { valid } = Form.validate(modalEl.querySelector('.modal-body'), RULES);
            if (!valid) return;
            const data = Form.collect(modalEl.querySelector('.modal-body'));
            if (isEdit) {
              AppState.update(KEY, existing.id, data);
              Toast.success(`Institute "${data.instituteName}" updated.`);
            } else {
              AppState.add(KEY, { ...data, id: generateID('inst') });
              Toast.success(`Institute "${data.instituteName}" added.`);
            }
            Modal.closeAll();
            this._render(container);
          }
        }
      ]
    });
  },

  async _delete(row, container) {
    if (!Auth.can('institutes:delete')) return Toast.warning('Permission denied.');

    const campCount = (AppState.get('campuses') || []).filter(c => c.instituteId === row.id).length;
    if (campCount > 0) {
      Toast.warning(`Cannot delete — ${campCount} campus(es) belong to this institute.`);
      return;
    }
    const ok = await Modal.confirm({
      title: 'Delete Institute',
      message: `Delete <strong>${row.instituteName}</strong>? This cannot be undone.`,
      confirmLabel: 'Delete', danger: true
    });
    if (!ok) return;
    AppState.remove(KEY, row.id);
    Toast.success(`Institute "${row.instituteName}" deleted.`);
    this._render(container);
  },

  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    el.querySelector('#instituteAddBtn')?.addEventListener('click', () => {
      if (!Auth.can('institutes:create')) return Toast.warning('Permission denied.');
      this._openForm(null, el);
    });
    el.querySelector('#instituteSearch')?.addEventListener('input', (e) => {
      this._render(el, e.target.value.toLowerCase().trim());
    });
  },

  _pageTemplate() {
    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="instituteSearch" class="search-input" placeholder="Search institutes…"/>
          </div>
          <span class="record-count">— records</span>
          <button id="instituteAddBtn" class="add-btn" style="margin-left:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Institute
          </button>
        </div>
        <div id="institute-table"></div>
      </div>
    `;
  }
};
