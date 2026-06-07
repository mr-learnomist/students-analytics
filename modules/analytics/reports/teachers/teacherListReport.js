// ============================================================
// modules/analytics/reports/teachers/teacherListReport.js
// Report: Teachers List
// — Filter bar (campus → discipline → subject → status)
// — Read-only teacher table (no add/edit/delete)
// — Export as CSV or PDF (column chooser modal)
// ============================================================

import { AppState } from '../../../../utils/state.js';

// ── Styles ─────────────────────────────────────────────────────
let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const st = document.createElement('style');
  st.textContent = `
/* ── Page ── */
.tlr-page { display:flex; flex-direction:column; gap:16px; }

/* ── Filter card ── */
.tlr-filter-card {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:12px;
  overflow:hidden;
}
.tlr-filter-toggle {
  display:flex; align-items:center; gap:10px;
  width:100%; padding:11px 16px;
  background:none; border:none; font-family:inherit;
  font-size:13px; font-weight:700; color:var(--t1);
  cursor:pointer; text-align:left;
  transition:background .15s;
}
.tlr-filter-toggle:hover { background:var(--surface2); }
.tlr-filter-toggle-label { flex:1; }
.tlr-filter-badge {
  display:inline-flex; align-items:center;
  background:var(--blue-dim); color:var(--blue);
  border-radius:20px; padding:2px 9px;
  font-size:11px; font-weight:700;
}
.tlr-filter-arrow { transition:transform .2s; color:var(--t3); }
.tlr-filter-arrow.open { transform:rotate(180deg); }

.tlr-filter-body {
  display:none; flex-direction:column; gap:14px;
  border-top:1px solid var(--border);
  padding:16px;
}
.tlr-filter-body.open { display:flex; }

.tlr-filter-row { display:flex; flex-wrap:wrap; gap:14px; }
.tlr-filter-col { display:flex; flex-direction:column; gap:5px; flex:1; min-width:150px; }
.tlr-filter-col-label {
  font-size:10.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.07em; color:var(--t3);
}
.tlr-filter-sel {
  height:34px; padding:0 10px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:8px; color:var(--t1); font-size:12.5px;
  cursor:pointer; outline:none; font-family:inherit;
  transition:border-color .12s;
}
.tlr-filter-sel:focus   { border-color:var(--blue); }
.tlr-filter-sel:disabled { opacity:.45; cursor:not-allowed; }

.tlr-filter-actions { display:flex; gap:8px; align-items:center; padding-top:2px; }
.tlr-filter-apply {
  padding:7px 20px; border-radius:8px; border:none;
  background:var(--blue); color:#fff;
  font-size:12.5px; font-weight:700;
  cursor:pointer; transition:opacity .15s; font-family:inherit;
}
.tlr-filter-apply:hover { opacity:.88; }
.tlr-filter-clear {
  padding:7px 14px; border-radius:8px;
  border:1px solid var(--border); background:transparent;
  color:var(--t2); font-size:12px; font-weight:600;
  cursor:pointer; transition:all .15s; font-family:inherit;
}
.tlr-filter-clear:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }

/* Active chips */
.tlr-chip-row { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:2px; }
.tlr-chip {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 9px; border-radius:20px;
  font-size:11px; font-weight:600;
  border:1px solid transparent;
}

/* ── Empty state ── */
.tlr-empty {
  display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:12px;
  padding:64px 24px;
  border:1px dashed var(--border2); border-radius:12px;
  color:var(--t3); text-align:center;
}
.tlr-empty p    { font-size:14px; font-weight:600; color:var(--t2); margin:0; }
.tlr-empty span { font-size:12.5px; }

/* ── Stats strip ── */
.tlr-stats-strip {
  display:flex; align-items:center; gap:0;
  background:var(--surface);
  border:1px solid var(--border);
  border-bottom:none;
  border-radius:12px 12px 0 0;
  padding:8px 16px;
  flex-wrap:wrap;
}
.tlr-stat-box { display:flex; flex-direction:column; align-items:center; padding:3px 14px; gap:1px; }
.tlr-stat-num { font-size:18px; font-weight:700; color:var(--t1); line-height:1.1; }
.tlr-stat-lbl { font-size:10px; font-weight:600; color:var(--t3); text-transform:uppercase; letter-spacing:.05em; }
.tlr-stat-div { width:1px; height:36px; background:var(--border); margin:0 6px; flex-shrink:0; }
.tlr-stat-active .tlr-stat-num   { color:var(--green);  }
.tlr-stat-inactive .tlr-stat-num { color:var(--red);    }

/* ── Table ── */
.tlr-table-wrap {
  overflow-x:auto;
  border:1px solid var(--border);
  border-top:none;
  border-radius:0 0 12px 12px;
}
.tlr-table {
  width:100%; border-collapse:collapse; font-size:12.5px;
  min-width:600px;
}
.tlr-table thead tr th {
  background:var(--surface2);
  color:var(--t3);
  font-size:10px; font-weight:700;
  text-transform:uppercase; letter-spacing:.06em;
  padding:9px 12px;
  border-bottom:2px solid var(--border);
  text-align:left; white-space:nowrap;
}
.tlr-table tbody tr td {
  padding:10px 12px;
  border-bottom:1px solid var(--border);
  color:var(--t1); vertical-align:middle;
}
.tlr-table tbody tr:last-child td { border-bottom:none; }
.tlr-table tbody tr:hover td { background:var(--surface2); }

/* Avatar */
.tlr-avatar {
  width:34px; height:34px; border-radius:50%;
  display:inline-flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; color:#fff; flex-shrink:0;
}

/* Pills */
.tlr-pill {
  display:inline-flex; align-items:center;
  padding:2px 8px; border-radius:20px;
  font-size:10.5px; font-weight:700; white-space:nowrap;
  background:var(--surface3); color:var(--t2);
  margin:1px 2px;
}
.tlr-badge-active   { background:var(--green-dim); color:var(--green); }
.tlr-badge-inactive { background:var(--red-dim);   color:var(--red);   }

/* Export buttons */
.tlr-export-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:5px;
  height:30px; padding:0 12px; border-radius:8px;
  border:1px solid var(--border); background:var(--surface2);
  color:var(--t3); cursor:pointer; font-size:12px; font-weight:600;
  font-family:inherit; transition:all .15s; white-space:nowrap;
}
.tlr-export-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }

/* ── Multi-select dropdown ── */
.tlr-dd-wrap { position:relative; }
.tlr-dd-trigger {
  display:flex; align-items:center; justify-content:space-between; gap:6px;
  height:34px; padding:0 10px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:8px; color:var(--t1); font-size:12.5px;
  cursor:pointer; transition:border-color .12s; user-select:none;
}
.tlr-dd-trigger:hover  { border-color:var(--blue); }
.tlr-dd-trigger.open   { border-color:var(--blue); }
.tlr-dd-trigger.tlr-dd-disabled { opacity:.45; pointer-events:none; }
.tlr-dd-panel {
  position:absolute; top:calc(100% + 4px); left:0; right:0;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:10px; z-index:999;
  box-shadow:0 8px 24px rgba(0,0,0,.12);
  min-width:200px; overflow:hidden;
}
.tlr-dd-search-wrap { padding:8px 8px 4px; }
.tlr-dd-search {
  width:100%; height:30px; padding:0 10px;
  background:var(--surface2); border:1px solid var(--border);
  border-radius:6px; font-size:12px; color:var(--t1);
  outline:none; font-family:inherit;
}
.tlr-dd-search:focus { border-color:var(--blue); }
.tlr-dd-list { max-height:180px; overflow-y:auto; padding:4px 0; }
.tlr-dd-item {
  display:flex; align-items:center; gap:8px;
  padding:6px 12px; cursor:pointer; font-size:12.5px;
  color:var(--t1); transition:background .1s;
}
.tlr-dd-item:hover { background:var(--surface2); }
.tlr-dd-item input[type=checkbox] {
  width:14px; height:14px;
  accent-color:var(--blue); cursor:pointer; flex-shrink:0;
}
.tlr-dd-footer {
  display:flex; justify-content:space-between; align-items:center;
  padding:6px 12px; border-top:1px solid var(--border);
  background:var(--surface2);
}
.tlr-dd-selall, .tlr-dd-clear {
  font-size:11.5px; font-weight:600;
  background:none; border:none; cursor:pointer; padding:0;
}
.tlr-dd-selall { color:var(--blue); }
.tlr-dd-clear  { color:var(--red,#ef4444); }
.tlr-dd-empty  { padding:12px; text-align:center; font-size:12px; color:var(--t3); }
  `;
  document.head.appendChild(st);
}

// ── Helpers ────────────────────────────────────────────────────
function _subjectCode(s) {
  if (!s) return '?';
  if (s.subjectCode?.trim()) return s.subjectCode.trim();
  if (s.code?.trim())        return s.code.trim();
  const words = (s.subjectName || '').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0,4).toUpperCase();
  return words.map(w => w[0]).join('').toUpperCase().slice(0,5);
}

function _shortCampus(name = '') {
  return name.replace(/\s*campus\s*/gi, '').trim() || name;
}

function _avatarHTML(pic, name = '', size = 34) {
  const initials = (name || 'T').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  if (pic) {
    return `<img src="${pic}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:2px solid var(--border2);flex-shrink:0" alt="${name}"/>`;
  }
  const colors = ['#4f85f7','#10b981','#8b5cf6','#06b6d4','#f59e0b'];
  const color  = colors[(name.charCodeAt(0) || 0) % colors.length] || '#4f85f7';
  return `<div class="tlr-avatar" style="background:${color};width:${size}px;height:${size}px;">${initials}</div>`;
}

// subject → level → discipline chain
function _getDiscIdForSubject(s) {
  const levels = AppState.get('levels') || [];
  if (s.levelId) {
    const lv = levels.find(l => l.id === s.levelId);
    if (lv?.disciplineId) return lv.disciplineId;
  }
  return s.disciplineId || null;
}

function _getSubjectsForDisc(discId) {
  const subjects = AppState.get('subjects') || [];
  if (!discId) return subjects;
  return subjects.filter(s => _getDiscIdForSubject(s) === discId);
}

// ── Main Export ────────────────────────────────────────────────
export const TeacherListReport = {

  _container:   null,
  _filterOpen:  false,

  // Filter state — multi-select arrays
  _selCampuses:     [],
  _selDisciplines:  [],
  _selSubjects:     [],
  _selStatus:       '',

  // Applied filter
  _appliedFilter: null,

  mount(container) {
    if (!container) return;
    _injectStyles();
    this._container      = container;
    this._filterOpen     = false;
    this._selCampuses    = [];
    this._selDisciplines = [];
    this._selSubjects    = [];
    this._selStatus      = '';
    this._appliedFilter  = null;
    this._render();
  },

  // ── Full render ───────────────────────────────────────────────
  _render() {
    const c = this._container;
    c.innerHTML = `
      <div class="tlr-page">
        <div class="tlr-filter-card" id="tlrFilterCard">
          ${this._filterToggleHTML()}
          <div class="tlr-filter-body ${this._filterOpen ? 'open' : ''}" id="tlrFilterBody">
            ${this._filterBodyHTML()}
          </div>
        </div>
        <div id="tlrTableArea"></div>
      </div>
    `;
    this._attachFilterEvents(c);
    this._renderTable(c);
  },

  // ── Filter toggle ─────────────────────────────────────────────
  _filterToggleHTML() {
    const count = this._activeFilterCount();
    return `
      <button class="tlr-filter-toggle" id="tlrFilterToggle">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span class="tlr-filter-toggle-label">Select Filter</span>
        ${count ? `<span class="tlr-filter-badge">${count} active</span>` : ''}
        <svg class="tlr-filter-arrow ${this._filterOpen ? 'open' : ''}" width="14" height="14"
             viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>`;
  },

  _activeFilterCount() {
    if (!this._appliedFilter) return 0;
    let n = 0;
    if (this._appliedFilter.campuses?.length)    n++;
    if (this._appliedFilter.disciplines?.length) n++;
    if (this._appliedFilter.subjects?.length)    n++;
    if (this._appliedFilter.status)              n++;
    return n;
  },

  // ── Filter body ───────────────────────────────────────────────
  _filterBodyHTML() {
    const campuses    = AppState.get('campuses')    || [];
    const disciplines = AppState.get('disciplines') || [];
    const subjects    = this._selDisciplines.length
      ? (AppState.get('subjects') || []).filter(s => this._selDisciplines.includes(_getDiscIdForSubject(s)))
      : (AppState.get('subjects') || []);

    const campusOpts = campuses.map(c => ({
      value: c.id,
      label: _shortCampus(c.campusName || c.name || c.id),
    }));
    const discOpts = disciplines.map(d => ({
      value: d.id,
      label: d.abbreviation ? `${d.abbreviation} — ${d.fullName}` : (d.fullName || d.id),
    }));
    const subjOpts = subjects.map(s => ({
      value: s.id,
      label: `${_subjectCode(s)} — ${s.subjectName || ''}`.trim(),
    }));
    const statusOpts = [
      { value: 'active',   label: 'Active'   },
      { value: 'inactive', label: 'Inactive' },
    ];

    const chips = this._appliedChipsHTML();

    return `
      <div class="tlr-filter-row">
        ${this._multiDropHTML('tlrDdCampus',    'Campus',     campusOpts,  this._selCampuses)}
        ${this._multiDropHTML('tlrDdDiscipline','Discipline', discOpts,    this._selDisciplines)}
        ${this._multiDropHTML('tlrDdSubject',   'Subject',    subjOpts,    this._selSubjects, !disciplines.length)}
        <div class="tlr-filter-col">
          <div class="tlr-filter-col-label">Status</div>
          <select class="tlr-filter-sel" id="tlrSelStatus">
            <option value="">All Statuses</option>
            ${statusOpts.map(o => `<option value="${o.value}" ${this._selStatus === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="tlr-filter-actions">
        <button class="tlr-filter-apply" id="tlrApplyBtn">Apply Filter</button>
        <button class="tlr-filter-clear" id="tlrClearBtn">Clear</button>
        ${chips ? `<div class="tlr-chip-row">${chips}</div>` : ''}
      </div>
    `;
  },

  // ── Multi-select dropdown builder ─────────────────────────────
  _multiDropHTML(id, label, opts, selected = [], disabled = false) {
    const selCount = selected.length;
    const placeholder = selCount ? `${selCount} selected` : `All ${label}s`;
    return `
      <div class="tlr-filter-col tlr-dd-wrap" id="${id}Wrap">
        <div class="tlr-filter-col-label">${label}</div>
        <div class="tlr-dd-trigger ${disabled ? 'tlr-dd-disabled' : ''}" id="${id}Trigger" tabindex="0">
          <span class="tlr-dd-label">${placeholder}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
        </div>
        <div class="tlr-dd-panel" id="${id}Panel" style="display:none">
          ${opts.length === 0
            ? `<div class="tlr-dd-empty">No options</div>`
            : `<div class="tlr-dd-search-wrap"><input class="tlr-dd-search" placeholder="Search..." id="${id}Search"/></div>
               <div class="tlr-dd-list" id="${id}List">
                 ${opts.map(o => `
                   <label class="tlr-dd-item">
                     <input type="checkbox" value="${o.value}" ${selected.includes(o.value) ? 'checked' : ''}>
                     <span>${o.label}</span>
                   </label>`).join('')}
               </div>
               <div class="tlr-dd-footer">
                 <button class="tlr-dd-selall" id="${id}SelAll">Select All</button>
                 <button class="tlr-dd-clear"  id="${id}Clear">Clear</button>
               </div>`
          }
        </div>
      </div>`;
  },

  _appliedChipsHTML() {
    const f = this._appliedFilter;
    if (!f) return '';
    const chips = [];
    const campuses    = AppState.get('campuses')    || [];
    const disciplines = AppState.get('disciplines') || [];
    const subjects    = AppState.get('subjects')    || [];
    const make = (label, color) => `
      <span class="tlr-chip" style="background:color-mix(in srgb,${color} 15%,transparent);
            color:${color};border-color:${color}">${label}</span>`;

    (f.campuses || []).forEach(id => {
      const c = campuses.find(x => x.id === id);
      chips.push(make(_shortCampus(c?.campusName || id), 'var(--blue)'));
    });
    (f.disciplines || []).forEach(id => {
      const d = disciplines.find(x => x.id === id);
      chips.push(make(d?.abbreviation || d?.fullName || id, 'var(--violet,#8b5cf6)'));
    });
    (f.subjects || []).forEach(id => {
      const s = subjects.find(x => x.id === id);
      chips.push(make(s ? _subjectCode(s) : id, 'var(--cyan)'));
    });
    if (f.status) {
      chips.push(make(f.status === 'active' ? 'Active' : 'Inactive',
        f.status === 'active' ? 'var(--green)' : 'var(--red)'));
    }
    return chips.join('');
  },

  // ── Attach filter events ──────────────────────────────────────
  _attachFilterEvents(c) {
    c.querySelector('#tlrFilterToggle')?.addEventListener('click', () => {
      this._filterOpen = !this._filterOpen;
      c.querySelector('#tlrFilterBody')?.classList.toggle('open', this._filterOpen);
      c.querySelector('.tlr-filter-arrow')?.classList.toggle('open', this._filterOpen);
      this._rerenderFilterToggle(c);
    });

    this._bindMultiDrops(c);

    // Close dropdowns when clicking outside
    document.addEventListener('click', e => {
      if (!c.contains(e.target)) {
        c.querySelectorAll('.tlr-dd-panel').forEach(p => p.style.display = 'none');
        c.querySelectorAll('.tlr-dd-trigger').forEach(t => t.classList.remove('open'));
      }
    });

    c.querySelector('#tlrApplyBtn')?.addEventListener('click', () => {
      this._applyFilter(c);
    });
    c.querySelector('#tlrClearBtn')?.addEventListener('click', () => {
      this._clearFilter(c);
    });
  },

  _applyFilter(c) {
    this._appliedFilter = {
      campuses:    [...this._selCampuses],
      disciplines: [...this._selDisciplines],
      subjects:    [...this._selSubjects],
      status:      this._selStatus,
    };
    this._filterOpen = false;
    c.querySelector('#tlrFilterBody')?.classList.remove('open');
    c.querySelector('.tlr-filter-arrow')?.classList.remove('open');
    this._rerenderFilterToggle(c);
    this._rerenderFilterBody(c);
    this._renderTable(c);
  },

  _clearFilter(c) {
    this._selCampuses    = [];
    this._selDisciplines = [];
    this._selSubjects    = [];
    this._selStatus      = '';
    this._appliedFilter  = null;
    this._rerenderFilterBody(c);
    this._rerenderFilterToggle(c);
    this._renderTable(c);
  },

  // ── Multi-select dropdown bindings ────────────────────────────
  _bindMultiDrops(c) {
    this._bindOneDrop(c, 'tlrDdCampus',     () => this._selCampuses,    v => { this._selCampuses = v; });
    this._bindOneDrop(c, 'tlrDdDiscipline', () => this._selDisciplines, v => {
      this._selDisciplines = v;
      this._selSubjects = [];
      this._rerenderFilterBody(c);
    });
    this._bindOneDrop(c, 'tlrDdSubject', () => this._selSubjects,  v => { this._selSubjects = v; });

    c.querySelector('#tlrSelStatus')?.addEventListener('change', e => {
      this._selStatus = e.target.value;
    });
    c.querySelector('#tlrApplyBtn')?.addEventListener('click', () => this._applyFilter(c));
    c.querySelector('#tlrClearBtn')?.addEventListener('click', () => this._clearFilter(c));
  },

  _bindOneDrop(c, id, getter, setter) {
    const trigger = c.querySelector(`#${id}Trigger`);
    const panel   = c.querySelector(`#${id}Panel`);
    if (!trigger || !panel) return;

    // Move panel to body so it's never clipped by overflow:hidden parents
    panel.style.position = 'fixed';
    panel.style.zIndex   = '99999';
    document.body.appendChild(panel);

    const reposition = () => {
      const r = trigger.getBoundingClientRect();
      panel.style.top   = `${r.bottom + 4}px`;
      panel.style.left  = `${r.left}px`;
      panel.style.width = `${r.width}px`;
      panel.style.minWidth = '220px';
    };

    const openPanel = () => {
      reposition();
      panel.style.display = 'block';
      trigger.classList.add('open');
    };

    const closePanel = () => {
      panel.style.display = 'none';
      trigger.classList.remove('open');
    };

    const closeAllPanels = () => {
      document.querySelectorAll('.tlr-dd-panel[data-portal]').forEach(p => {
        p.style.display = 'none';
      });
      c.querySelectorAll('.tlr-dd-trigger').forEach(t => t.classList.remove('open'));
    };

    panel.dataset.portal = id;

    // Open/close toggle
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = panel.style.display !== 'none';
      closeAllPanels();
      if (!isOpen) openPanel();
    });

    // Close on outside click
    document.addEventListener('click', e => {
      if (!trigger.contains(e.target) && !panel.contains(e.target)) {
        closePanel();
      }
    });

    // Reposition on scroll/resize
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);

    // Search
    panel.querySelector(`#${id}Search`)?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      panel.querySelectorAll(`#${id}List .tlr-dd-item`).forEach(item => {
        item.style.display = item.querySelector('span').textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    // Checkbox change → update state + label
    panel.addEventListener('change', e => {
      if (e.target.type !== 'checkbox') return;
      const checked = [...panel.querySelectorAll('input[type=checkbox]:checked')].map(i => i.value);
      setter(checked);
      const lbl = trigger.querySelector('.tlr-dd-label');
      if (lbl) lbl.textContent = checked.length ? `${checked.length} selected` : `All`;
    });

    // Select All
    panel.querySelector(`#${id}SelAll`)?.addEventListener('click', e => {
      e.stopPropagation();
      panel.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = true);
      const all = [...panel.querySelectorAll('input[type=checkbox]')].map(i => i.value);
      setter(all);
      const lbl = trigger.querySelector('.tlr-dd-label');
      if (lbl) lbl.textContent = `${all.length} selected`;
    });

    // Clear
    panel.querySelector(`#${id}Clear`)?.addEventListener('click', e => {
      e.stopPropagation();
      panel.querySelectorAll('input[type=checkbox]').forEach(cb => cb.checked = false);
      setter([]);
      const lbl = trigger.querySelector('.tlr-dd-label');
      if (lbl) lbl.textContent = 'All';
    });
  },

  _rerenderFilterBody(c) {
    // Remove any portaled panels from body before rerender
    document.querySelectorAll('.tlr-dd-panel[data-portal]').forEach(p => p.remove());
    const body = c.querySelector('#tlrFilterBody');
    if (!body) return;
    body.innerHTML = this._filterBodyHTML();
    this._bindMultiDrops(c);
  },

  _rerenderFilterToggle(c) {
    const old = c.querySelector('#tlrFilterToggle');
    if (!old) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = this._filterToggleHTML();
    const newBtn = wrap.firstElementChild;
    old.replaceWith(newBtn);
    newBtn.addEventListener('click', () => {
      this._filterOpen = !this._filterOpen;
      c.querySelector('#tlrFilterBody')?.classList.toggle('open', this._filterOpen);
      newBtn.querySelector('.tlr-filter-arrow')?.classList.toggle('open', this._filterOpen);
    });
  },

  // ── Table render ──────────────────────────────────────────────
  _renderTable(c) {
    const area = c.querySelector('#tlrTableArea');
    if (!area) return;

    // No filter applied yet
    if (!this._appliedFilter) {
      area.innerHTML = `
        <div class="tlr-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <p>Select a filter to view teachers</p>
          <span>Use "Select Filter" above to apply campus, discipline or status filter.</span>
        </div>`;
      return;
    }

    const f = this._appliedFilter;
    const all        = AppState.get('teachers')    || [];
    const campuses   = AppState.get('campuses')    || [];
    const disciplines= AppState.get('disciplines') || [];
    const subjects   = AppState.get('subjects')    || [];

    // Apply filters
    const rows = all.filter(t => {
      if (f.campuses?.length    && !f.campuses.some(id    => (t.campuses         || []).includes(id)))    return false;
      if (f.disciplines?.length && !f.disciplines.some(id => (t.disciplines      || []).includes(id)))    return false;
      if (f.subjects?.length    && !f.subjects.some(id    => (t.teachingSubjects || []).includes(id)))    return false;
      if (f.status === 'active'   && t.isActive === false) return false;
      if (f.status === 'inactive' && t.isActive !== false) return false;
      return true;
    });

    if (!rows.length) {
      area.innerHTML = `
        <div class="tlr-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
          <p>No teachers found</p>
          <span>No teachers match the selected filters.</span>
        </div>`;
      return;
    }

    const activeCount   = rows.filter(r => r.isActive !== false).length;
    const inactiveCount = rows.length - activeCount;

    // ── Stats strip ──────────────────────────────────────────────
    const statsHTML = `
      <div class="tlr-stats-strip">
        <div class="tlr-stat-box">
          <div class="tlr-stat-num">${rows.length}</div>
          <div class="tlr-stat-lbl">Total</div>
        </div>
        <div class="tlr-stat-div"></div>
        <div class="tlr-stat-box tlr-stat-active">
          <div class="tlr-stat-num">${activeCount}</div>
          <div class="tlr-stat-lbl">Active</div>
        </div>
        <div class="tlr-stat-div"></div>
        <div class="tlr-stat-box tlr-stat-inactive">
          <div class="tlr-stat-num">${inactiveCount}</div>
          <div class="tlr-stat-lbl">Inactive</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button id="tlrExportCSV" class="tlr-export-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>
            </svg>
            CSV
          </button>
          <button id="tlrExportPDF" class="tlr-export-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
            PDF
          </button>
        </div>
      </div>`;

    // ── Table HTML ───────────────────────────────────────────────
    const tableHTML = `
      <div class="tlr-table-wrap">
        <table class="tlr-table">
          <thead>
            <tr>
              <th style="width:40px">#</th>
              <th style="width:50px"></th>
              <th>Name</th>
              <th>Qualification</th>
              <th>Disciplines</th>
              <th>Subjects</th>
              <th>Campuses</th>
              <th>Contact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((t, i) => {
              const discPills = (t.disciplines || []).map(id => {
                const d = disciplines.find(x => x.id === id);
                return d ? `<span class="tlr-pill">${d.abbreviation || d.fullName}</span>` : '';
              }).join('');

              const subjPills = (t.teachingSubjects || []).map(id => {
                const s = subjects.find(x => x.id === id);
                return s ? `<span class="tlr-pill">${_subjectCode(s)}</span>` : '';
              }).join('');

              const campPills = (t.campuses || []).map(id => {
                const cp = campuses.find(x => x.id === id);
                return cp ? `<span class="tlr-pill">${_shortCampus(cp.campusName)}</span>` : '';
              }).join('');

              const isActive  = t.isActive !== false;
              const statusBadge = isActive
                ? `<span class="tlr-pill tlr-badge-active">Active</span>`
                : `<span class="tlr-pill tlr-badge-inactive">Inactive</span>`;

              return `
                <tr>
                  <td style="color:var(--t3);font-size:11.5px;text-align:center">${i + 1}</td>
                  <td>${_avatarHTML(t.profilePicture, t.fullName, 34)}</td>
                  <td>
                    <div style="font-weight:600;color:var(--t1)">${t.fullName || '—'}</div>
                    <div style="font-size:11.5px;color:var(--t3);margin-top:2px">${t.email || ''}</div>
                  </td>
                  <td style="color:var(--t2);font-size:12.5px">${t.qualification || '—'}</td>
                  <td>${discPills || '<span style="color:var(--t4)">—</span>'}</td>
                  <td>${subjPills || '<span style="color:var(--t4)">—</span>'}</td>
                  <td>${campPills || '<span style="color:var(--t4)">—</span>'}</td>
                  <td style="font-family:var(--font-mono,monospace);font-size:12px;color:var(--t2)">${t.contactNumber || '—'}</td>
                  <td>${statusBadge}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    area.innerHTML = statsHTML + tableHTML;

    // Wire export buttons
    area.querySelector('#tlrExportCSV')?.addEventListener('click', () => {
      this._openExportModal('csv', rows, f, { campuses, disciplines, subjects });
    });
    area.querySelector('#tlrExportPDF')?.addEventListener('click', () => {
      this._openExportModal('pdf', rows, f, { campuses, disciplines, subjects });
    });
  },

  // ── Column chooser modal before export ───────────────────────
  _openExportModal(fmt, rows, filter, { campuses, disciplines, subjects }) {
    const ALL_COLS = [
      { id: 'name',          label: 'Full Name',      get: r => r.fullName || '' },
      { id: 'email',         label: 'Email',          get: r => r.email || '' },
      { id: 'qualification', label: 'Qualification',  get: r => r.qualification || '' },
      { id: 'disciplines',   label: 'Disciplines',    get: r => (r.disciplines||[]).map(id => disciplines.find(d=>d.id===id)?.abbreviation||id).join(', ') },
      { id: 'subjects',      label: 'Subjects',       get: r => (r.teachingSubjects||[]).map(id => { const s = subjects.find(x=>x.id===id); return s ? _subjectCode(s) : id; }).join(', ') },
      { id: 'campuses',      label: 'Campuses',       get: r => (r.campuses||[]).map(id => { const c = campuses.find(x=>x.id===id); return c ? _shortCampus(c.campusName) : id; }).join(', ') },
      { id: 'contact',       label: 'Contact',        get: r => r.contactNumber || '' },
      { id: 'status',        label: 'Status',         get: r => r.isActive === false ? 'Inactive' : 'Active' },
    ];

    // Build filter HTML for PDF
    const filterParts = [];
    (filter.campuses||[]).forEach(id => { const c = campuses.find(x=>x.id===id); if(c) filterParts.push(`<span class="filter-chip"><span class="fk">Campus:</span> ${_shortCampus(c.campusName)}</span>`); });
    (filter.disciplines||[]).forEach(id => { const d = disciplines.find(x=>x.id===id); if(d) filterParts.push(`<span class="filter-chip"><span class="fk">Discipline:</span> ${d.abbreviation||d.fullName}</span>`); });
    (filter.subjects||[]).forEach(id => { const s = subjects.find(x=>x.id===id); if(s) filterParts.push(`<span class="filter-chip"><span class="fk">Subject:</span> ${_subjectCode(s)}</span>`); });
    if (filter.status) filterParts.push(`<span class="filter-chip"><span class="fk">Status:</span> ${filter.status === 'active' ? 'Active' : 'Inactive'}</span>`);
    const filterHTML = filterParts.length
      ? `<span class="filters-label">&#9660; Filters</span> ${filterParts.join('')}`
      : `<span class="filter-chip filter-none">No filters applied — showing all teachers</span>`;

    // Remove existing modal
    document.getElementById('tlr-export-col-modal')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'tlr-export-col-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box';

    overlay.innerHTML = `
      <div style="background:var(--surface,#fff);border-radius:16px;width:100%;max-width:400px;
                  box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden;border:1px solid var(--border,#e5e7eb)">
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:16px 20px 12px;border-bottom:1px solid var(--border,#e5e7eb)">
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--t1,#111)">Choose Export Columns</div>
            <div style="font-size:11.5px;color:var(--t3,#888);margin-top:2px">Select which columns to include in the ${fmt.toUpperCase()}</div>
          </div>
          <button id="tlrExpClose" style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--t3,#888);padding:0 4px;line-height:1">✕</button>
        </div>
        <div style="padding:14px 20px;display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto">
          ${ALL_COLS.map(col => `
            <label style="display:flex;align-items:center;gap:10px;cursor:pointer;
                          padding:7px 10px;border-radius:8px;
                          background:var(--surface2,#f9f9f9);border:1px solid var(--border,#e5e7eb)">
              <input type="checkbox" data-exp-col="${col.id}" checked
                style="width:15px;height:15px;accent-color:#2563eb;flex-shrink:0;cursor:pointer">
              <span style="font-size:13px;font-weight:500;color:var(--t1,#111)">${col.label}</span>
            </label>
          `).join('')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;
                    padding:12px 20px;border-top:1px solid var(--border,#e5e7eb);background:var(--surface2,#f9f9f9)">
          <button id="tlrExpSelAll" style="font-size:12px;font-weight:600;color:#2563eb;background:none;border:none;cursor:pointer;padding:0">Select All</button>
          <div style="display:flex;gap:8px">
            <button id="tlrExpCancel" style="padding:8px 16px;border-radius:8px;border:1px solid var(--border,#e5e7eb);
                    background:var(--surface,#fff);font-size:13px;font-weight:600;cursor:pointer;
                    color:var(--t2,#444);font-family:inherit">Cancel</button>
            <button id="tlrExpExport" style="padding:8px 20px;border-radius:8px;border:none;
                    background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer;
                    font-family:inherit">Export ${fmt.toUpperCase()}</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('#tlrExpClose').onclick   = close;
    overlay.querySelector('#tlrExpCancel').onclick  = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#tlrExpSelAll').addEventListener('click', () => {
      overlay.querySelectorAll('[data-exp-col]').forEach(cb => cb.checked = true);
    });
    overlay.querySelector('#tlrExpExport').addEventListener('click', () => {
      const chosen = [...overlay.querySelectorAll('[data-exp-col]:checked')].map(i => i.dataset.expCol);
      if (!chosen.length) { alert('Please select at least one column.'); return; }
      const activeCols = ALL_COLS.filter(col => chosen.includes(col.id));
      close();
      if (fmt === 'csv') this._doExportCSV(activeCols, rows);
      else               this._doExportPDF(activeCols, rows, filterHTML);
    });
  },

  // ── CSV export ────────────────────────────────────────────────
  _doExportCSV(activeCols, rows) {
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    const header  = ['#', ...activeCols.map(c => c.label)].join(',');
    const body    = rows.map((r, i) =>
      [i + 1, ...activeCols.map(c => `"${(c.get(r)||'').replace(/"/g,'""')}"`)]
      .join(',')
    ).join('\n');
    const metaLines = [
      `Teachers List Report`,
      `Generated: ${dateStr} ${timeStr}`,
      `Total: ${rows.length} | Active: ${rows.filter(r=>r.isActive!==false).length} | Inactive: ${rows.filter(r=>r.isActive===false).length}`,
      '',
    ].join('\n');
    const blob = new Blob([metaLines + header + '\n' + body], { type:'text/csv;charset=utf-8;' });
    const a    = Object.assign(document.createElement('a'), {
      href:     URL.createObjectURL(blob),
      download: `Teachers-List-${dateStr.replace(/ /g,'-')}.csv`,
    });
    a.click();
  },

  // ── PDF export ────────────────────────────────────────────────
  _doExportPDF(activeCols, rows, filterHTML) {
    const now         = new Date();
    const dateStr     = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr     = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });
    const activeCount = rows.filter(r => r.isActive !== false).length;
    const inactCount  = rows.length - activeCount;

    const thCells = ['#', ...activeCols.map(c => c.label)].map(h => `<th>${h}</th>`).join('');
    const tdRows  = rows.map((r, i) => {
      const cells = [
        `<td>${i + 1}</td>`,
        ...activeCols.map(c => {
          const val = c.get(r) || '—';
          if (c.id === 'status') {
            const cls = val === 'Active' ? 'badge-active' : 'badge-inactive';
            return `<td><span class="${cls}">${val}</span></td>`;
          }
          return `<td>${val}</td>`;
        }),
      ].join('');
      return `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">${cells}</tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/>
<title>Teachers List Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:18px 20px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:10px;margin-bottom:12px}
  .header-left .title{font-size:18px;font-weight:700;color:#1e40af}
  .header-left .sub{font-size:10.5px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:10.5px}
  .meta-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
  .stat-box{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:5px 14px;text-align:center}
  .stat-box .num{font-size:16px;font-weight:700;color:#2563eb;font-family:monospace}
  .stat-box .lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
  .stat-box.active .num{color:#15803d}.stat-box.active{background:#f0fdf4;border-color:#bbf7d0}
  .stat-box.inactive .num{color:#b91c1c}.stat-box.inactive{background:#fef2f2;border-color:#fecaca}
  .filter-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
              background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;
              padding:7px 12px;margin-bottom:10px}
  .filters-label{font-size:9px;font-weight:700;color:#1e40af;text-transform:uppercase;letter-spacing:.6px;white-space:nowrap;margin-right:2px}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:9.5px;font-weight:500;padding:2px 9px;border-radius:10px;white-space:nowrap}
  .filter-chip .fk{font-weight:700}
  .filter-none{background:#f1f5f9;color:#64748b}
  table{width:100%;border-collapse:collapse;font-size:9.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:600;padding:6px 7px;text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
  tbody tr.even{background:#fff} tbody tr.odd{background:#f8faff}
  tbody td{padding:5px 7px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:middle}
  tbody td:first-child{font-weight:600;color:#94a3b8;text-align:center;width:28px}
  .badge-active{color:#15803d;background:#dcfce7;padding:2px 7px;border-radius:10px;font-size:8.5px;font-weight:700}
  .badge-inactive{color:#b91c1c;background:#fee2e2;padding:2px 7px;border-radius:10px;font-size:8.5px;font-weight:700}
  .footer{margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{body{padding:10px 12px}@page{size:A4 landscape;margin:8mm}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div class="header-left">
      <div class="title">Teachers List Report</div>
      <div class="sub">Staff Directory &nbsp;|&nbsp; EduTrack — Learnomist</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>
  <div class="meta-row">
    <div class="stat-box"><div class="num">${rows.length}</div><div class="lbl">Total</div></div>
    <div class="stat-box active"><div class="num">${activeCount}</div><div class="lbl">Active</div></div>
    <div class="stat-box inactive"><div class="num">${inactCount}</div><div class="lbl">Inactive</div></div>
  </div>
  <div class="filter-row">${filterHTML}</div>
  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tdRows}</tbody>
  </table>
  <div class="footer">
    <span>Teachers List Report &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>Total: ${rows.length} teacher${rows.length !== 1 ? 's' : ''}</span>
  </div>
  <div style="margin-top:8px;text-align:center;font-size:9px;color:#94a3b8">Powered by <strong style="color:#2563eb">Learnomist</strong></div>
  <div class="no-print" style="margin-top:14px;text-align:center">
    <button onclick="window.print()" style="padding:8px 26px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  },
};
