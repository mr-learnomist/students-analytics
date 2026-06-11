// ============================================================
// modules/discipline.js — Discipline Module (CRUD)
// Fields: id, abbreviation, fullName
// v2: Role-based access — admin full CRUD, teacher/viewer read-only
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, attachSearch, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';
import { Auth } from '../utils/auth.js';

const KEY = 'disciplines';

const RULES = {
  abbreviation: { required: true, minLen: 2, message: 'Min 2 characters (e.g. CS, BBA).' },
  fullName:     { required: true, minLen: 3, message: 'Enter the full discipline name.' },
};

export const DisciplineModule = {

  mount(container) {
    injectUIStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;

    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);

    // Sirf admin Add button dekhe
    const addBtn = el.querySelector('#disciplineAddBtn');
    if (addBtn) {
      addBtn.style.display = Auth.can('disciplines:create') ? '' : 'none';
    }
  },

  _render(container, filter = '') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    // Disciplines campus-specific nahi hoti — sab roles ko sab dikhti hain
    // Sirf actions role ke hisaab se alag hoti hain
    const all  = AppState.get(KEY) || [];
    const rows = filter
      ? all.filter(d =>
          d.abbreviation.toLowerCase().includes(filter) ||
          d.fullName.toLowerCase().includes(filter))
      : all;

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    const canEdit   = Auth.can('disciplines:edit');
    const canDelete = Auth.can('disciplines:delete');

    const actions = [];
    if (canEdit) {
      actions.push({
        label: 'Edit',
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
        handler: (row) => this._openForm(row, container)
      });
    }
    if (canDelete) {
      actions.push({
        label: 'Delete', danger: true,
        icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
        handler: (row) => this._delete(row, container)
      });
    }

    Table.render(el.querySelector('#discipline-table'), {
      columns: [
        { key: 'abbreviation', label: 'Abbreviation', width: '130px',
          render: (val) => `<span class="badge badge--blue" style="font-family:var(--font-mono)">${val}</span>` },
        { key: 'fullName', label: 'Full Name' },
        { key: 'instituteId', label: 'Institute', width: '160px',
          render: (id) => {
            const inst = (AppState.get('institutes') || []).find(i => i.id === id);
            return inst
              ? `<span style="font-size:12.5px;color:var(--t1)">${inst.instituteName}</span>`
              : `<span style="color:var(--t4)">—</span>`;
          }
        },
        { key: 'campusIds', label: 'Campuses', width: '200px',
          render: (ids) => {
            if (!ids?.length) return `<span style="color:var(--t4)">—</span>`;
            const campuses = AppState.get('campuses') || [];
            return ids.map(cid => {
              const c = campuses.find(x => x.id === cid);
              return c
                ? `<span class="badge badge--grey" style="margin-right:3px;margin-bottom:2px">${c.campusName.replace(/\s*campus$/i,'').trim()}</span>`
                : '';
            }).join('');
          }
        },
        { key: 'id', label: 'Levels', width: '80px',
          render: (id) => {
            const count = (AppState.get('levels') || []).filter(l => l.disciplineId === id).length;
            return `<span class="badge badge--grey">${count} level${count !== 1 ? 's' : ''}</span>`;
          }
        },
        { key: 'hasRoutes', label: 'Routes', width: '120px',
          render: (val, row) => {
            if (!val) return `<span style="color:var(--t4)">—</span>`;
            const routes = row.routes || [];
            if (!routes.length) return `<span style="color:var(--t3);font-size:12px">No routes</span>`;
            return routes.map(r =>
              `<span class="badge badge--grey" style="margin-right:3px;margin-bottom:2px;font-size:11px">${r}</span>`
            ).join('');
          }
        },
      ],
      rows,
      emptyMsg: 'No disciplines yet. Click "Add Discipline" to create one.',
      actions,
    });
  },

  _openForm(existing = null, container) {
    const isEdit = !!existing;
    if (isEdit  && !Auth.can('disciplines:edit'))   return Toast.warning('Permission denied.');
    if (!isEdit && !Auth.can('disciplines:create')) return Toast.warning('Permission denied.');

    const institutes = AppState.get('institutes') || [];
    const campuses   = AppState.get('campuses')   || [];

    const initInst    = existing?.instituteId || '';
    const initCampIds = existing?.campusIds   || [];

    const instOptions = institutes.map(i =>
      `<option value="${i.id}" ${i.id === initInst ? 'selected' : ''}>${i.instituteName}</option>`
    ).join('');

    const campCheckboxes = (instId) => {
      const list = instId ? campuses.filter(c => c.instituteId === instId) : [];
      if (!list.length) return `<span style="font-size:12px;color:var(--t3)">Select an institute first.</span>`;
      return list.map(c => `
        <label style="display:inline-flex;align-items:center;gap:6px;
                       padding:5px 12px;border-radius:20px;cursor:pointer;
                       border:1px solid var(--border);background:var(--surface2);
                       font-size:12.5px;color:var(--t1);margin:3px">
          <input type="checkbox" name="campusIds" value="${c.id}"
                 ${initCampIds.includes(c.id) ? 'checked' : ''}
                 style="width:13px;height:13px;accent-color:#4f85f7"/>
          ${c.campusName.replace(/\s*campus$/i,'').trim()}
        </label>`).join('');
    };

    Modal.open({
      title: isEdit ? 'Edit Discipline' : 'Add Discipline',
      body: `
        <div class="form-group">
          <label class="form-label">Abbreviation <span class="req">*</span></label>
          <input name="abbreviation" class="form-input" placeholder="e.g. CS, BBA, EE"
                 value="${existing?.abbreviation || ''}" maxlength="10"
                 style="text-transform:uppercase"/>
          <span class="form-hint">Short code used across the system.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Full Name <span class="req">*</span></label>
          <input name="fullName" class="form-input" placeholder="e.g. Computer Science"
                 value="${existing?.fullName || ''}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Institute <span class="req">*</span></label>
          <select id="disc_inst" class="form-select form-input">
            <option value="">Select institute…</option>
            ${instOptions}
          </select>
          <span class="form-hint">Which institute offers this discipline.</span>
        </div>
        <div class="form-group">
          <label class="form-label">Offered at Campuses</label>
          <div id="disc_camps" style="display:flex;flex-wrap:wrap;gap:2px;min-height:36px;
                                       padding:6px;border:1px solid var(--border);
                                       border-radius:var(--r-sm);background:var(--surface2)">
            ${campCheckboxes(initInst)}
          </div>
          <span class="form-hint">Select campuses where this discipline is offered.</span>
        </div>
        <div class="form-group">
          <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
            <input type="checkbox" id="disc_hasRoutes" name="hasRoutes" value="true"
                   ${existing?.hasRoutes ? 'checked' : ''}
                   style="width:14px;height:14px;accent-color:#4f85f7"/>
            <span class="form-label" style="margin:0">This discipline has routes</span>
          </label>
        </div>
        <div id="disc_routesSection" style="display:${existing?.hasRoutes ? 'block' : 'none'}">
          <div class="form-group">
            <label class="form-label">Routes</label>
            <div id="disc_routesList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px">
              ${(existing?.routes || []).map((r, i) => `
                <div class="disc-route-row" style="display:flex;align-items:center;gap:6px">
                  <input type="text" name="route_item" class="form-input" value="${r}"
                         placeholder="e.g. Route A" style="flex:1"/>
                  <button type="button" class="disc-route-remove"
                          style="padding:4px 10px;border-radius:var(--r-sm);border:1px solid var(--border);
                                 background:var(--surface2);color:var(--danger);cursor:pointer;font-size:12px">
                    ✕
                  </button>
                </div>`).join('')}
            </div>
            <button type="button" id="disc_addRoute"
                    style="display:inline-flex;align-items:center;gap:5px;padding:5px 12px;
                           border-radius:var(--r-sm);border:1px dashed var(--border);
                           background:transparent;color:var(--t2);cursor:pointer;font-size:12.5px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Route
            </button>
          </div>
        </div>
      `,
      onOpen: (modalEl) => {
        const instSel  = modalEl.querySelector('#disc_inst');
        const campsDiv = modalEl.querySelector('#disc_camps');

        instSel.addEventListener('change', () => {
          campsDiv.innerHTML = campCheckboxes(instSel.value);
        });

        // Routes toggle
        const hasRoutesChk   = modalEl.querySelector('#disc_hasRoutes');
        const routesSection  = modalEl.querySelector('#disc_routesSection');
        const routesList     = modalEl.querySelector('#disc_routesList');
        const addRouteBtn    = modalEl.querySelector('#disc_addRoute');

        const addRouteRow = (val = '') => {
          const row = document.createElement('div');
          row.className = 'disc-route-row';
          row.style.cssText = 'display:flex;align-items:center;gap:6px';
          row.innerHTML = `
            <input type="text" name="route_item" class="form-input" value="${val}"
                   placeholder="e.g. Route A" style="flex:1"/>
            <button type="button" class="disc-route-remove"
                    style="padding:4px 10px;border-radius:var(--r-sm);border:1px solid var(--border);
                           background:var(--surface2);color:var(--danger);cursor:pointer;font-size:12px">
              ✕
            </button>`;
          routesList.appendChild(row);
          row.querySelector('.disc-route-remove').addEventListener('click', () => row.remove());
        };

        // Remove listeners for pre-filled rows
        routesList.querySelectorAll('.disc-route-remove').forEach(btn => {
          btn.addEventListener('click', () => btn.closest('.disc-route-row').remove());
        });

        hasRoutesChk.addEventListener('change', () => {
          routesSection.style.display = hasRoutesChk.checked ? 'block' : 'none';
          if (!hasRoutesChk.checked) routesList.innerHTML = '';
        });

        addRouteBtn.addEventListener('click', () => addRouteRow());
      },
      actions: [
        { label: 'Cancel', variant: 'ghost', close: true },
        {
          label: isEdit ? 'Save Changes' : 'Add Discipline',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            const { valid } = Form.validate(modalEl.querySelector('.modal-body'), RULES);
            if (!valid) return;
            const data = Form.collect(modalEl.querySelector('.modal-body'));
            data.abbreviation = data.abbreviation.toUpperCase();

            // Institute validation
            const instId = modalEl.querySelector('#disc_inst').value;
            if (!instId) return Toast.warning('Please select an institute.');
            data.instituteId = instId;

            // Collect checked campus IDs
            const campIds = [...modalEl.querySelectorAll('input[name="campusIds"]:checked')]
                              .map(cb => cb.value);
            data.campusIds = campIds;

            // Collect routes
            const hasRoutes = modalEl.querySelector('#disc_hasRoutes')?.checked || false;
            data.hasRoutes = hasRoutes;
            if (hasRoutes) {
              data.routes = [...modalEl.querySelectorAll('input[name="route_item"]')]
                .map(i => i.value.trim())
                .filter(Boolean);
            } else {
              data.routes = [];
            }

            if (isEdit) {
              AppState.update(KEY, existing.id, data);
              Toast.success(`Discipline "${data.abbreviation}" updated.`);
            } else {
              AppState.add(KEY, { ...data, id: generateID('disc') });
              Toast.success(`Discipline "${data.abbreviation}" added.`);
            }
            Modal.closeAll();
            this._render(container);
          }
        }
      ]
    });
  },

  async _delete(row, container) {
    if (!Auth.can('disciplines:delete')) return Toast.warning('Permission denied.');

    const deps = AppState.getDependents(KEY, row.id);
    if (deps.length) {
      const list = deps.map(d => `${d.count} ${d.label}(s)`).join(', ');
      Toast.warning(`Cannot delete — referenced by: ${list}. Remove dependents first.`);
      return;
    }
    const confirmed = await Modal.confirm({
      title: 'Delete Discipline',
      message: `Delete <strong>${row.fullName} (${row.abbreviation})</strong>? This cannot be undone.`,
      confirmLabel: 'Delete', danger: true
    });
    if (!confirmed) return;
    AppState.remove(KEY, row.id);
    Toast.success(`Discipline "${row.abbreviation}" deleted.`);
    this._render(container);
  },

  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    el.querySelector('#disciplineAddBtn')?.addEventListener('click', () => {
      if (!Auth.can('disciplines:create')) return Toast.warning('Permission denied.');
      this._openForm(null, container);
    });

    const searchInput = el.querySelector('#disciplineSearch');
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        this._render(el, searchInput.value.toLowerCase().trim());
      });
    }
  },

  _pageTemplate() {
    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input id="disciplineSearch" class="search-input" placeholder="Search disciplines…"/>
          </div>
          <span class="record-count">— records</span>
          <button id="disciplineAddBtn" class="add-btn" style="margin-left:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Add Discipline
          </button>
        </div>
        <div id="discipline-table"></div>
      </div>
    `;
  }
};
