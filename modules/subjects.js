// ============================================================
// modules/subjects.js — Subjects Module (CRUD)
// Fields: id, levelId (FK → levels → disciplines), subjectCode, subjectName, paperType, routes[]
// ============================================================

import { AppState, generateID } from '../utils/state.js';
import { Modal, Table, Form, injectUIStyles } from '../utils/ui.js';
import { Toast } from '../utils/helpers.js';
import { getSelectableLevels } from './levels.js';

const KEY = 'subjects';

const RULES = {
  levelId:     { required: true, message: 'Select a level.' },
  subjectCode: { required: true, minLen: 2, message: 'Enter a subject code (e.g. CS101).' },
  subjectName: { required: true, minLen: 3, message: 'Enter the full subject name.' },
  paperType:   { required: true, message: 'Select paper type.' },
};

export const SubjectsModule = {

  mount(container) {
    injectUIStyles();
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    el.innerHTML = this._pageTemplate();
    this._render(el);
    this._attachToolbar(el);
  },

  _render(container, filter = '', levelFilter = '') {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    let rows = AppState.get(KEY) || [];
    if (levelFilter) rows = rows.filter(s => s.levelId === levelFilter);
    if (filter) rows = rows.filter(s =>
      s.subjectCode.toLowerCase().includes(filter) ||
      s.subjectName.toLowerCase().includes(filter)
    );

    const countEl = el.querySelector('.record-count');
    if (countEl) countEl.textContent = `${rows.length} record${rows.length !== 1 ? 's' : ''}`;

    Table.render(el.querySelector('#subjects-table'), {
      columns: [
        { key: 'subjectCode', label: 'Code', width: '110px',
          render: (val) => `<code style="font-family:var(--font-mono);font-size:12px;color:var(--cyan)">${val}</code>`
        },
        { key: 'subjectName', label: 'Subject Name' },
        { key: 'levelId', label: 'Level', width: '160px',
          render: (id) => {
            const level = AppState.findById('levels', id);
            if (!level) return '<span style="color:var(--t4)">—</span>';
            const disc = AppState.findById('disciplines', level.disciplineId);
            return `
              <span class="badge badge--blue" style="font-family:var(--font-mono);font-size:10.5px">
                ${disc?.abbreviation || '?'}
              </span>
              <span style="color:var(--t2);font-size:12px;margin-left:6px">${level.levelName}</span>
            `;
          }
        },
        { key: 'paperType', label: 'Type', width: '100px',
          render: (val) => val === 'compulsory'
            ? `<span style="font-size:12px;color:var(--t1)">Compulsory</span>`
            : val === 'optional'
              ? `<span style="font-size:12px;color:var(--t1)">Optional</span>`
              : `<span style="color:var(--t4)">—</span>`
        },
        { key: 'routes', label: 'Routes', width: '180px',
          render: (val) => {
            if (!val?.length) return `<span style="color:var(--t4)">—</span>`;
            return val.map(r =>
              `<span style="font-size:11.5px;color:var(--t2);margin-right:8px">${r}</span>`
            ).join('');
          }
        },
      ],
      rows,
      emptyMsg: 'No subjects yet. Add subjects to link them to levels and batches.',
      actions: [
        {
          label: 'Edit',
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
          handler: (row) => this._openForm(row, el)
        },
        {
          label: 'Delete', danger: true,
          icon: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>`,
          handler: (row) => this._delete(row, el)
        }
      ]
    });
  },

  _openForm(existing = null, container) {
    const levels      = AppState.get('levels')      || [];
    const disciplines = AppState.get('disciplines') || [];
    const isEdit      = !!existing;

    // Get discipline for existing subject (to check hasRoutes)
    const getDiscForLevel = (levelId) => {
      const level = levels.find(l => l.id === levelId);
      if (!level) return null;
      return disciplines.find(d => d.id === level.disciplineId) || null;
    };

    const initDisc    = existing ? getDiscForLevel(existing.levelId) : null;
    const initRoutes  = existing?.routes || [];
    const hasRoutes   = initDisc?.hasRoutes || false;
    const discRoutes  = initDisc?.routes    || [];

    // Build grouped level options — active levels only, but always include the
    // level already saved on this subject (even if it has since been archived).
    const grouped = disciplines.map(disc => {
      const discLevels = getSelectableLevels(disc.id, existing?.levelId);
      if (!discLevels.length) return '';
      const opts = discLevels.map(l =>
        `<option value="${l.id}" data-disc="${disc.id}" ${l.id === existing?.levelId ? 'selected' : ''}>
          ${l.levelName}${l.isArchived ? ' (archived)' : ''}
        </option>`
      ).join('');
      return `<optgroup label="${disc.abbreviation} — ${disc.fullName}">${opts}</optgroup>`;
    }).join('');

    // Build route checkboxes html
    const buildRouteCheckboxes = (routes, selectedRoutes, disabled) => {
      if (!routes.length) {
        return `<span style="font-size:12px;color:var(--t3)">No routes defined for this discipline.</span>`;
      }
      return routes.map(r => {
        const checked = selectedRoutes.includes(r) ? 'checked' : '';
        const disabledAttr = disabled ? 'disabled' : '';
        return `
          <label style="display:inline-flex;align-items:center;gap:6px;
                         padding:5px 12px;border-radius:20px;cursor:${disabled ? 'not-allowed' : 'pointer'};
                         border:1px solid var(--border);background:var(--surface2);
                         font-size:12.5px;color:${disabled ? 'var(--t4)' : 'var(--t1)'};margin:3px;
                         opacity:${disabled ? '0.45' : '1'}">
            <input type="checkbox" name="subj_route" value="${r}" ${checked} ${disabledAttr}
                   style="width:13px;height:13px;accent-color:#4f85f7"/>
            ${r}
          </label>`;
      }).join('');
    };

    Modal.open({
      title: isEdit ? 'Edit Subject' : 'Add Subject',
      body: `
        <div class="form-group">
          <label class="form-label">Level <span class="req">*</span></label>
          <select id="subj_levelSel" name="levelId" class="form-select form-input">
            <option value="">Select level…</option>
            ${grouped}
          </select>
          <span class="form-hint">Subjects inherit the discipline from their level.</span>
        </div>
        <div class="form-row cols-2">
          <div class="form-group">
            <label class="form-label">Subject Code <span class="req">*</span></label>
            <input name="subjectCode" class="form-input" placeholder="e.g. CS101"
                   value="${existing?.subjectCode || ''}"
                   style="text-transform:uppercase" maxlength="12"/>
          </div>
          <div class="form-group">
            <label class="form-label">Subject Name <span class="req">*</span></label>
            <input name="subjectName" class="form-input"
                   placeholder="e.g. Introduction to Programming"
                   value="${existing?.subjectName || ''}"/>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Paper Type <span class="req">*</span></label>
          <select name="paperType" class="form-select form-input">
            <option value="">Select type…</option>
            <option value="compulsory" ${existing?.paperType === 'compulsory' ? 'selected' : ''}>Compulsory</option>
            <option value="optional"   ${existing?.paperType === 'optional'   ? 'selected' : ''}>Optional</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" style="opacity:${hasRoutes ? '1' : '0.45'}">Routes</label>
          <div id="subj_routesWrap" style="display:flex;flex-wrap:wrap;gap:2px;min-height:38px;
                                            padding:8px;border:1px solid var(--border);
                                            border-radius:var(--r-sm);background:var(--surface2);
                                            opacity:${hasRoutes ? '1' : '0.45'}">
            ${hasRoutes
              ? buildRouteCheckboxes(discRoutes, initRoutes, false)
              : `<span style="font-size:12px;color:var(--t4)">Routes not enabled for this discipline.</span>`
            }
          </div>
          <span class="form-hint" id="subj_routesHint">
            ${hasRoutes ? 'Select one or more routes for this subject.' : 'Select a discipline that has routes enabled.'}
          </span>
        </div>
      `,
      onOpen: (modalEl) => {
        const levelSel    = modalEl.querySelector('#subj_levelSel');
        const routesWrap  = modalEl.querySelector('#subj_routesWrap');
        const routesLabel = modalEl.querySelector('.form-label[style*="opacity"]');
        const routesHint  = modalEl.querySelector('#subj_routesHint');

        levelSel.addEventListener('change', () => {
          const selOpt = levelSel.options[levelSel.selectedIndex];
          const discId = selOpt?.dataset?.disc || '';
          const disc   = disciplines.find(d => d.id === discId);
          const dr     = disc?.routes || [];
          const hr     = disc?.hasRoutes || false;

          if (routesLabel) routesLabel.style.opacity = hr ? '1' : '0.45';
          routesWrap.style.opacity = hr ? '1' : '0.45';

          if (hr && dr.length) {
            routesWrap.innerHTML = buildRouteCheckboxes(dr, [], false);
            routesHint.textContent = 'Select one or more routes for this subject.';
          } else if (hr && !dr.length) {
            routesWrap.innerHTML = `<span style="font-size:12px;color:var(--t3)">No routes defined for this discipline.</span>`;
            routesHint.textContent = 'No routes defined for this discipline.';
          } else {
            routesWrap.innerHTML = `<span style="font-size:12px;color:var(--t4)">Routes not enabled for this discipline.</span>`;
            routesHint.textContent = 'Select a discipline that has routes enabled.';
          }
        });
      },
      actions: [
        { label: 'Cancel', variant: 'ghost' },
        {
          label: isEdit ? 'Save Changes' : 'Add Subject',
          variant: 'primary', close: false,
          handler: (modalEl) => {
            const { valid } = Form.validate(modalEl.querySelector('.modal-body'), RULES);
            if (!valid) return;
            const data = Form.collect(modalEl.querySelector('.modal-body'));
            data.subjectCode = data.subjectCode.toUpperCase();

            // Collect selected routes
            data.routes = [...modalEl.querySelectorAll('input[name="subj_route"]:checked')]
              .map(cb => cb.value);

            if (isEdit) {
              AppState.update(KEY, existing.id, data);
              Toast.success(`Subject "${data.subjectCode}" updated.`);
            } else {
              AppState.add(KEY, { ...data, id: generateID('sub') });
              Toast.success(`Subject "${data.subjectCode}" added.`);
            }
            Modal.closeAll();
            this._render(container);
          }
        }
      ]
    });
  },

  async _delete(row, container) {
    const deps = AppState.getDependents(KEY, row.id);
    if (deps.length) {
      Toast.warning(`Cannot delete — referenced by ${deps.map(d => `${d.count} ${d.label}(s)`).join(', ')}.`);
      return;
    }
    const ok = await Modal.confirm({
      title: 'Delete Subject',
      message: `Delete <strong>${row.subjectCode} — ${row.subjectName}</strong>? This cannot be undone.`,
      confirmLabel: 'Delete', danger: true
    });
    if (!ok) return;
    AppState.remove(KEY, row.id);
    Toast.success(`Subject "${row.subjectCode}" deleted.`);
    this._render(container);
  },

  _attachToolbar(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;

    el.querySelector('#subjectsAddBtn')?.addEventListener('click', () => this._openForm(null, el));

    let searchVal = '', levelVal = '';

    el.querySelector('#subjectsSearch')?.addEventListener('input', (e) => {
      searchVal = e.target.value.toLowerCase().trim();
      this._render(el, searchVal, levelVal);
    });

    el.querySelector('#subjectsLevelFilter')?.addEventListener('change', (e) => {
      levelVal = e.target.value;
      this._render(el, searchVal, levelVal);
    });
  },

  _pageTemplate() {
    const levels = AppState.get('levels') || [];
    const disciplines = AppState.get('disciplines') || [];

    const levelOptions = disciplines.map(disc => {
      const dLevels = levels.filter(l => l.disciplineId === disc.id);
      if (!dLevels.length) return '';
      return `<optgroup label="${disc.abbreviation}">
        ${dLevels.map(l => `<option value="${l.id}">${l.levelName}</option>`).join('')}
      </optgroup>`;
    }).join('');

    return `
      <div class="module-page">
        <div class="module-toolbar">
          <div class="search-wrap">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input id="subjectsSearch" class="search-input" placeholder="Search by code or name…"/>
          </div>
          <select id="subjectsLevelFilter" class="form-select form-input" style="max-width:220px;flex-shrink:0">
            <option value="">All Levels</option>
            ${levelOptions}
          </select>
          <span class="record-count">— records</span>
          <button id="subjectsAddBtn" class="add-btn" style="margin-left:auto">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Subject
          </button>
        </div>
        <div id="subjects-table"></div>
      </div>
    `;
  }
};
