// ============================================================
// modules/analytics/reports/testResults/finalResultReport.js
// Report: Final Result
// — Collapsible filter bar (campus → discipline → level →
//   session → subject → batch), same pattern as resultProfile.js
// — Data loads ONLY after "Apply Filter" is clicked (lazy load)
// — Table: student final-result rows pulled from
//   AppState['finalResults'] (same key used by resultsTab.js)
// ============================================================

import { AppState } from '../../../../utils/state.js';

// ── AppState key (matches resultsTab.js) ───────────────────────
const RESULTS_KEY = 'finalResults';

// ── Styles ─────────────────────────────────────────────────────
let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const st = document.createElement('style');
  st.textContent = `
/* ── Page wrap ── */
.frr-page { display:flex; flex-direction:column; gap:16px; }

/* ── Filter bar card ── */
.frr-filter-card {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:12px;
  overflow:hidden;
}
.frr-filter-toggle {
  display:flex; align-items:center; gap:10px;
  width:100%; padding:11px 16px;
  background:none; border:none; font-family:inherit;
  font-size:13px; font-weight:700; color:var(--t1);
  cursor:pointer; text-align:left;
  transition:background .15s;
}
.frr-filter-toggle:hover { background:var(--surface2); }
.frr-filter-toggle-label { flex:1; }
.frr-filter-badge {
  display:inline-flex; align-items:center;
  background:var(--green-dim); color:var(--green);
  border-radius:20px; padding:2px 9px;
  font-size:11px; font-weight:700;
}
.frr-filter-arrow { transition:transform .2s; color:var(--t3); }
.frr-filter-arrow.open { transform:rotate(180deg); }

.frr-filter-body {
  display:none; flex-direction:column; gap:14px;
  border-top:1px solid var(--border);
  padding:16px;
}
.frr-filter-body.open { display:flex; }

.frr-filter-row { display:flex; flex-wrap:wrap; gap:14px; }
.frr-filter-col {
  display:flex; flex-direction:column; gap:5px;
  flex:1; min-width:150px;
}
.frr-filter-col-label {
  font-size:10.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.07em;
  color:var(--t3);
}
.frr-filter-sel {
  height:34px; padding:0 10px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:8px; color:var(--t1); font-size:12.5px;
  cursor:pointer; outline:none; font-family:inherit;
  transition:border-color .12s;
}
.frr-filter-sel:focus    { border-color:var(--green); }
.frr-filter-sel:disabled { opacity:.45; cursor:not-allowed; }

/* Filter actions row */
.frr-filter-actions { display:flex; gap:8px; align-items:center; padding-top:2px; flex-wrap:wrap; }
.frr-filter-apply {
  padding:7px 20px; border-radius:8px; border:none;
  background:var(--green); color:#fff;
  font-size:12.5px; font-weight:700;
  cursor:pointer; transition:opacity .15s; font-family:inherit;
}
.frr-filter-apply:hover { opacity:.88; }
.frr-filter-clear {
  padding:7px 14px; border-radius:8px;
  border:1px solid var(--border); background:transparent;
  color:var(--t2); font-size:12px; font-weight:600;
  cursor:pointer; transition:all .15s; font-family:inherit;
}
.frr-filter-clear:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }

/* Active chips */
.frr-chip-row { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:2px; }
.frr-chip {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 9px; border-radius:20px;
  font-size:11px; font-weight:600;
  border:1px solid transparent;
}

/* ── Empty state ── */
.frr-empty {
  display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:12px;
  padding:64px 24px;
  border:1px dashed var(--border2); border-radius:12px;
  color:var(--t3); text-align:center;
}
.frr-empty p    { font-size:14px; font-weight:600; color:var(--t2); margin:0; }
.frr-empty span { font-size:12.5px; }

/* ── Stats strip ── */
.frr-stats-strip {
  display:flex; align-items:center; flex-wrap:wrap;
  background:var(--surface);
  border:1px solid var(--border);
  border-bottom:none;
  border-radius:12px 12px 0 0;
  padding:8px 16px;
  gap:8px;
}
.frr-stat-box { display:flex; flex-direction:column; align-items:center; padding:3px 12px; gap:1px; }
.frr-stat-num { font-size:18px; font-weight:700; color:var(--t1); line-height:1.1; }
.frr-stat-lbl { font-size:10px; font-weight:600; color:var(--t3); text-transform:uppercase; letter-spacing:.05em; }
.frr-stat-div { width:1px; height:36px; background:var(--border); margin:0 6px; flex-shrink:0; }
.frr-stat-pass   .frr-stat-num { color:var(--green);  }
.frr-stat-fail   .frr-stat-num { color:var(--red);    }
.frr-stat-absent .frr-stat-num { color:var(--yellow); }
.frr-stat-pend   .frr-stat-num { color:var(--t3);     }

.frr-rate-block { display:flex; flex-direction:column; align-items:center; gap:4px; padding:2px 18px; min-width:150px; }
.frr-rate-title { font-size:10px; font-weight:700; color:var(--t3); text-transform:uppercase; letter-spacing:.06em; }
.frr-rate-bar-wrap { width:100%; height:5px; background:var(--surface3); border-radius:10px; overflow:hidden; }
.frr-rate-bar { height:100%; border-radius:10px; transition:width .4s ease; }
.frr-rate-footer { display:flex; align-items:baseline; gap:6px; justify-content:center; }
.frr-rate-pct { font-size:15px; font-weight:700; line-height:1; }
.frr-rate-sub { font-size:10px; color:var(--t3); }

/* ── Table ── */
.frr-table-wrap {
  overflow-x:auto;
  border:1px solid var(--border);
  border-radius:0 0 12px 12px;
}
.frr-table {
  width:100%; border-collapse:collapse; font-size:12.5px;
  min-width:760px;
}
.frr-table thead tr {
  background:var(--surface2);
  border-bottom:1px solid var(--border2);
}
.frr-table th {
  padding:9px 12px; text-align:left;
  font-size:10.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.06em;
  color:var(--t3); white-space:nowrap;
}
.frr-table tbody tr td {
  padding:10px 12px;
  border-bottom:1px solid var(--border);
  color:var(--t1); vertical-align:middle;
  white-space:nowrap;
}
.frr-table tbody tr:last-child td { border-bottom:none; }
.frr-table tbody tr:hover td { background:var(--surface2); }

/* Badges */
.frr-badge {
  display:inline-flex; align-items:center;
  padding:2px 9px; border-radius:20px;
  font-size:10.5px; font-weight:700; white-space:nowrap;
}
.frr-badge-pass    { background:var(--green-dim);  color:var(--green);  }
.frr-badge-fail    { background:var(--red-dim);    color:var(--red);    }
.frr-badge-absent  { background:var(--yellow-dim); color:var(--yellow); }
.frr-badge-pending { background:var(--surface3);   color:var(--t3);     }

/* Export buttons */
.frr-export-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:5px;
  height:30px; padding:0 12px; border-radius:8px;
  border:1px solid var(--border); background:var(--surface2);
  color:var(--t3); cursor:pointer; font-size:12px; font-weight:600;
  font-family:inherit; transition:all .15s; white-space:nowrap;
}
  `;
  document.head.appendChild(st);
}

// ── Data helpers ─────────────────────────────────────────────────
function _getFinalResults() { return AppState.get(RESULTS_KEY) || []; }
function _getCampuses()     { return AppState.get('campuses')   || []; }
function _getBatches()      { return AppState.get('batches')    || []; }
function _getSubjects()     { return AppState.get('subjects')   || []; }
function _getEnrolments()   { return AppState.get('enrolments') || []; }

function _getDisciplines(campusId = '') {
  const all = AppState.get('disciplines') || [];
  if (!campusId) return all;
  return all.filter(d => !d.campusIds?.length || d.campusIds.includes(campusId));
}

function _getLevels(disciplineId = '') {
  const all = AppState.get('levels') || [];
  if (!disciplineId) return all;
  return all.filter(l => l.disciplineId === disciplineId);
}

function _getSessions(subjectId) {
  const set = new Set();
  _getBatches().forEach(b => {
    if (subjectId && b.subjectId !== subjectId) return;
    if (b.sessionPeriod) set.add(b.sessionPeriod);
  });
  return [...set].sort();
}

function _getSubjectsFor({ disciplineId, levelId }) {
  const allSubjects = _getSubjects();
  const allLevels   = AppState.get('levels') || [];

  return allSubjects.filter(s => {
    if (levelId) return s.levelId === levelId;
    if (disciplineId) {
      const level = allLevels.find(l => l.id === s.levelId);
      if (!level || level.disciplineId !== disciplineId) return false;
    }
    return true;
  });
}

function _getBatchesFor({ disciplineId, levelId, subjectId, sessionId, campusId }) {
  return _getBatches().filter(b => {
    if (disciplineId && b.disciplineId  !== disciplineId) return false;
    if (levelId      && b.levelId       !== levelId)      return false;
    if (subjectId    && b.subjectId     !== subjectId)     return false;
    if (sessionId    && b.sessionPeriod !== sessionId)    return false;
    if (campusId     && b.campusId      !== campusId)      return false;
    return true;
  });
}

// ── Main Export ───────────────────────────────────────────────
export const FinalResultReport = {

  _container: null,
  _filterOpen: false,

  // Filter selections (cascade)
  _selCampus:     '',
  _selDiscipline: '',
  _selLevel:      '',
  _selSession:    '',
  _selSubject:    '',
  _selBatch:      '',

  // Applied filter — drives table. null = nothing applied yet (lazy load)
  _appliedFilter: null,

  mount(container) {
    if (!container) return;
    _injectStyles();
    this._container     = container;
    this._filterOpen    = false;
    this._selCampus     = '';
    this._selDiscipline = '';
    this._selLevel      = '';
    this._selSession    = '';
    this._selSubject    = '';
    this._selBatch      = '';
    this._appliedFilter = null;
    this._render();
  },

  // ── Full render ────────────────────────────────────────────────
  _render() {
    const c = this._container;
    c.innerHTML = `
      <div class="frr-page">
        <div class="frr-filter-card" id="frrFilterCard">
          ${this._filterToggleHTML()}
          <div class="frr-filter-body ${this._filterOpen ? 'open' : ''}" id="frrFilterBody">
            ${this._filterBodyHTML()}
          </div>
        </div>
        <div id="frrTableArea"></div>
      </div>
    `;

    this._attachFilterEvents(c);
    this._renderTable(c);
  },

  // ── Filter toggle button ─────────────────────────────────────
  _filterToggleHTML() {
    const count = this._activeFilterCount();
    return `
      <button class="frr-filter-toggle" id="frrFilterToggle">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span class="frr-filter-toggle-label">Select Filter</span>
        ${count ? `<span class="frr-filter-badge">${count} active</span>` : ''}
        <svg class="frr-filter-arrow ${this._filterOpen ? 'open' : ''}" width="14" height="14"
             viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>`;
  },

  _activeFilterCount() {
    if (!this._appliedFilter) return 0;
    return ['campus','discipline','level','session','subject','batch']
      .filter(k => this._appliedFilter[k]).length;
  },

  // ── Filter body HTML ──────────────────────────────────────────
  _filterBodyHTML() {
    const campuses    = _getCampuses();
    const disciplines = _getDisciplines(this._selCampus);
    const levels      = _getLevels(this._selDiscipline);
    const sessions    = _getSessions(this._selSubject);
    const subjects    = _getSubjectsFor({ disciplineId: this._selDiscipline, levelId: this._selLevel });
    const batches     = _getBatchesFor({ disciplineId: this._selDiscipline, levelId: this._selLevel, subjectId: this._selSubject, sessionId: this._selSession, campusId: this._selCampus });

    const sel = (id, label, opts, val, disabled = false) => `
      <div class="frr-filter-col">
        <div class="frr-filter-col-label">${label}</div>
        <select class="frr-filter-sel" id="${id}" ${disabled ? 'disabled' : ''}>
          <option value="">Select ${label}…</option>
          ${opts.map(o => `<option value="${o.value}" ${val === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>`;

    const campusOpts     = campuses.map(c    => ({ value: c.id, label: (c.campusName||'').replace(/\s*campus$/i,'').trim() }));
    const disciplineOpts = disciplines.map(d => ({ value: d.id, label: d.abbreviation ? `${d.abbreviation} — ${d.fullName}` : (d.fullName || d.name || d.id) }));
    const levelOpts      = levels.map(l => ({ value: l.id, label: l.levelName || l.name || l.id }));
    const sessionOpts    = sessions.map(s    => ({ value: s,    label: s }));
    const subjectOpts    = subjects.map(s    => ({
      value: s.id,
      label: `${s.subjectCode||''} — ${s.subjectName||''}`.replace(/^—\s*/,'').trim()
    }));
    const batchOpts      = batches.map(b => ({ value: b.id, label: b.batchName || (`Batch ${b.batchNo || b.id}`) }));

    const chips = this._appliedChipsHTML();

    return `
      <div class="frr-filter-row">
        ${sel('frrSelCampus',     'Campus',     campusOpts,     this._selCampus)}
        ${sel('frrSelDiscipline', 'Discipline', disciplineOpts, this._selDiscipline, !this._selCampus)}
        ${sel('frrSelLevel',      'Level',      levelOpts,      this._selLevel,      !this._selDiscipline)}
        ${sel('frrSelSession',    'Session',    sessionOpts,    this._selSession,    !this._selLevel)}
        ${sel('frrSelSubject',    'Subject',    subjectOpts,    this._selSubject,    !this._selSession)}
        ${sel('frrSelBatch',      'Batch #',    batchOpts,      this._selBatch,      !this._selSubject)}
      </div>

      <div class="frr-filter-actions">
        <button class="frr-filter-apply" id="frrApplyBtn">Apply Filter</button>
        <button class="frr-filter-clear" id="frrClearBtn">Clear</button>
        ${chips ? `<div class="frr-chip-row" id="frrChipRow">${chips}</div>` : ''}
      </div>
    `;
  },

  _appliedChipsHTML() {
    const f = this._appliedFilter;
    if (!f) return '';
    const chips = [];
    const make = (label, color) => `
      <span class="frr-chip" style="background:color-mix(in srgb,${color} 15%,transparent);
            color:${color};border-color:${color}">
        ${label}
      </span>`;

    if (f.campus)     chips.push(make((_getCampuses().find(c=>c.id===f.campus)?.campusName||f.campus).replace(/\s*campus$/i,'').trim(), 'var(--blue)'));
    if (f.discipline) { const d = _getDisciplines().find(x=>x.id===f.discipline); chips.push(make(d ? (d.abbreviation || d.fullName) : f.discipline, 'var(--violet,#8b5cf6)')); }
    if (f.level)      { const l = _getLevels().find(x=>x.id===f.level); chips.push(make(l ? (l.levelName||l.name||f.level) : f.level, 'var(--cyan)')); }
    if (f.session)    chips.push(make(f.session, 'var(--green)'));
    if (f.subject) {
      const s = _getSubjects().find(x=>x.id===f.subject);
      chips.push(make(s ? `${s.subjectCode||s.subjectName}` : f.subject, 'var(--orange,#f59e0b)'));
    }
    if (f.batch) {
      const b = _getBatches().find(x=>x.id===f.batch);
      chips.push(make(b?.batchName || f.batch, 'var(--yellow)'));
    }
    return chips.join('');
  },

  // ── Filter events ──────────────────────────────────────────────
  _attachFilterEvents(c) {
    const onFilterToggleClick = () => {
      this._filterOpen = !this._filterOpen;
      const body  = c.querySelector('#frrFilterBody');
      const arrow = c.querySelector('.frr-filter-arrow');
      body?.classList.toggle('open', this._filterOpen);
      arrow?.classList.toggle('open', this._filterOpen);
      const toggle = c.querySelector('#frrFilterToggle');
      if (toggle) toggle.outerHTML = this._filterToggleHTML();
      c.querySelector('#frrFilterToggle')?.addEventListener('click', onFilterToggleClick);
    };
    c.querySelector('#frrFilterToggle')?.addEventListener('click', onFilterToggleClick);

    this._bindCascadeSelects(c);
    this._bindApplyClear(c);
  },

  _bindApplyClear(c) {
    c.querySelector('#frrApplyBtn')?.addEventListener('click', () => {
      this._appliedFilter = {
        campus:     this._selCampus,
        discipline: this._selDiscipline,
        level:      this._selLevel,
        session:    this._selSession,
        subject:    this._selSubject,
        batch:      this._selBatch,
      };
      this._renderTable(c);
      this._filterOpen = false;
      const body  = c.querySelector('#frrFilterBody');
      const arrow = c.querySelector('.frr-filter-arrow');
      body?.classList.remove('open');
      arrow?.classList.remove('open');
      this._rerenderFilterToggle(c);
      this._rerenderFilterBody(c);
    });

    c.querySelector('#frrClearBtn')?.addEventListener('click', () => {
      this._selCampus = this._selDiscipline = this._selLevel =
        this._selSession = this._selSubject = this._selBatch = '';
      this._appliedFilter = null;
      this._rerenderFilterBody(c);
      this._renderTable(c);
      this._rerenderFilterToggle(c);
    });
  },

  _bindCascadeSelects(c) {
    const onCampus = () => {
      this._selCampus     = c.querySelector('#frrSelCampus')?.value     || '';
      this._selDiscipline = '';
      this._selLevel      = '';
      this._selSession    = '';
      this._selSubject    = '';
      this._selBatch      = '';
      this._rerenderFilterBody(c);
    };
    const onDiscipline = () => {
      this._selDiscipline = c.querySelector('#frrSelDiscipline')?.value || '';
      this._selLevel      = '';
      this._selSession    = '';
      this._selSubject    = '';
      this._selBatch      = '';
      this._rerenderFilterBody(c);
    };
    const onLevel = () => {
      this._selLevel   = c.querySelector('#frrSelLevel')?.value   || '';
      this._selSession = '';
      this._selSubject = '';
      this._selBatch   = '';
      this._rerenderFilterBody(c);
    };
    const onSession = () => {
      this._selSession = c.querySelector('#frrSelSession')?.value || '';
      this._selSubject = '';
      this._selBatch   = '';
      this._rerenderFilterBody(c);
    };
    const onSubject = () => {
      this._selSubject = c.querySelector('#frrSelSubject')?.value || '';
      this._selBatch   = '';
      this._rerenderFilterBody(c);
    };
    const onBatch = () => {
      this._selBatch = c.querySelector('#frrSelBatch')?.value || '';
    };

    c.querySelector('#frrSelCampus')    ?.addEventListener('change', onCampus);
    c.querySelector('#frrSelDiscipline')?.addEventListener('change', onDiscipline);
    c.querySelector('#frrSelLevel')     ?.addEventListener('change', onLevel);
    c.querySelector('#frrSelSession')   ?.addEventListener('change', onSession);
    c.querySelector('#frrSelSubject')   ?.addEventListener('change', onSubject);
    c.querySelector('#frrSelBatch')     ?.addEventListener('change', onBatch);
  },

  _rerenderFilterBody(c) {
    const body = c.querySelector('#frrFilterBody');
    if (!body) return;
    body.innerHTML = this._filterBodyHTML();
    this._bindCascadeSelects(c);
    this._bindApplyClear(c);
  },

  _rerenderFilterToggle(c) {
    const toggle = c.querySelector('#frrFilterToggle');
    if (!toggle) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = this._filterToggleHTML();
    const newBtn = wrap.firstElementChild;
    toggle.replaceWith(newBtn);
    newBtn.addEventListener('click', () => {
      this._filterOpen = !this._filterOpen;
      c.querySelector('#frrFilterBody')?.classList.toggle('open', this._filterOpen);
      newBtn.querySelector('.frr-filter-arrow')?.classList.toggle('open', this._filterOpen);
      const badge = newBtn.querySelector('.frr-filter-badge');
      const count = this._activeFilterCount();
      if (badge) badge.textContent = `${count} active`;
    });
  },

  // ── Table render (lazy — only after Apply Filter) ──────────────
  _renderTable(c) {
    const area = c.querySelector('#frrTableArea');
    if (!area) return;

    const f = this._appliedFilter;

    // Nothing applied yet, or applied filter too broad — show prompt
    if (!f || (!f.campus && !f.subject && !f.batch)) {
      area.innerHTML = `
        <div class="frr-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <p>Select a filter to view final results</p>
          <span>Use "Select Filter" above to choose campus, subject and batch, then click Apply Filter.</span>
        </div>`;
      return;
    }

    // ── Resolve subject / batch context ───────────────────────────
    const batches  = _getBatches();
    const campuses = _getCampuses();
    const subjects = _getSubjects();

    const batchObj   = f.batch ? (batches.find(b => b.id === f.batch) || {}) : {};
    const resolvedSubjectId = f.subject || batchObj.subjectId || '';

    const allResults = _getFinalResults();

    // ── Collect students ────────────────────────────────────────
    let students = [];
    if (f.batch) {
      const enrols = _getEnrolments().filter(e => e.batchId === f.batch);
      const seen = new Set();
      enrols.forEach(e => {
        if (seen.has(e.studentId)) return;
        seen.add(e.studentId);
        const st = AppState.findById('students', e.studentId) || {};
        students.push({ id: e.studentId, ...st });
      });
    } else {
      // No batch chosen — derive students from finalResults matching subject/campus
      const seen = new Set();
      allResults.forEach(r => {
        if (resolvedSubjectId && r.subjectId !== resolvedSubjectId) return;
        if (f.campus) {
          const b = batches.find(x => x.id === r.batchId);
          if (!b || b.campusId !== f.campus) return;
        }
        if (seen.has(r.studentId)) return;
        seen.add(r.studentId);
        const st = AppState.findById('students', r.studentId) || {};
        students.push({ id: r.studentId, ...st });
      });
    }

    if (!students.length) {
      area.innerHTML = `
        <div class="frr-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
          <p>No students found</p>
          <span>No students found for the selected filter.</span>
        </div>`;
      return;
    }

    // ── Build rows ──────────────────────────────────────────────
    const campusObj  = campuses.find(c => c.id === (f.campus || batchObj.campusId)) || {};
    const campusName = (campusObj.campusName || '').replace(/\s*campus$/i,'').trim() || '—';

    const rows = students.map(st => {
      const result = allResults.find(r =>
        r.studentId === st.id &&
        (!f.batch || r.batchId === f.batch) &&
        (!resolvedSubjectId || r.subjectId === resolvedSubjectId)
      );

      const batch   = batches.find(b => b.id === (result?.batchId || f.batch)) || {};
      const subject = subjects.find(s => s.id === (result?.subjectId || resolvedSubjectId)) || {};
      const campus  = campuses.find(c => c.id === batch.campusId) || campusObj;

      const totalMarks   = result?.totalMarks   || 100;
      const passingMarks = result?.passingMarks || Math.ceil(totalMarks * 0.5);
      const marks    = result?.marks != null ? result.marks : null;
      const examDate = result?.examDate || '';

      const status = marks != null && marks >= passingMarks ? 'pass'
                   : marks != null && marks <  passingMarks ? 'fail'
                   : examDate ? 'absent' : 'pending';

      const studentName = st.studentName
        || [st.firstName, st.lastName].filter(Boolean).join(' ')
        || '—';

      const batchParts = (batch?.batchName || '').split('-');
      const batchNo = batchParts.length > 1 ? `Batch ${batchParts[batchParts.length - 1]}` : (batch?.batchName || '—');

      return {
        studentName,
        rollNo:      st.rollNo || '—',
        campusName:  (campus?.campusName || '').replace(/\s*campus$/i,'').trim() || campusName,
        session:     batch?.sessionPeriod || f.session || '—',
        subjectCode: subject?.subjectCode || subject?.subjectName || '—',
        batchNo,
        examDate,
        marks,
        totalMarks,
        status,
      };
    });

    rows.sort((a, b) => a.studentName.localeCompare(b.studentName));

    // ── Stats ───────────────────────────────────────────────────
    const totalCount   = rows.length;
    const passCount    = rows.filter(r => r.status === 'pass').length;
    const failCount    = rows.filter(r => r.status === 'fail').length;
    const absentCount  = rows.filter(r => r.status === 'absent').length;
    const pendingCount = rows.filter(r => r.status === 'pending').length;

    const appearedCount = passCount + failCount;
    const passRate    = appearedCount > 0 ? Math.round((passCount / appearedCount) * 100) : 0;
    const appearedPct = totalCount   > 0 ? Math.round((appearedCount / totalCount) * 100) : 0;

    const passColor     = passRate    >= 80 ? 'var(--green)' : passRate    >= 60 ? 'var(--yellow)' : 'var(--red)';
    const appearedColor = appearedPct >= 80 ? 'var(--green)' : appearedPct >= 60 ? 'var(--yellow)' : 'var(--red)';

    const statsHTML = `
      <div class="frr-stats-strip">
        <div style="display:flex;align-items:center;gap:0;flex-wrap:wrap">
          <div class="frr-stat-box">
            <div class="frr-stat-num">${totalCount}</div>
            <div class="frr-stat-lbl">Total</div>
          </div>
          <div class="frr-stat-div"></div>
          <div class="frr-stat-box frr-stat-pass">
            <div class="frr-stat-num">${passCount}</div>
            <div class="frr-stat-lbl">Pass</div>
          </div>
          <div class="frr-stat-box frr-stat-fail">
            <div class="frr-stat-num">${failCount}</div>
            <div class="frr-stat-lbl">Fail</div>
          </div>
          <div class="frr-stat-box frr-stat-absent">
            <div class="frr-stat-num">${absentCount}</div>
            <div class="frr-stat-lbl">Absent</div>
          </div>
          <div class="frr-stat-box frr-stat-pend">
            <div class="frr-stat-num">${pendingCount}</div>
            <div class="frr-stat-lbl">Pending</div>
          </div>
        </div>

        <div style="display:flex;align-items:center;gap:0;margin-left:auto;flex-wrap:wrap">
          <div class="frr-rate-block">
            <div class="frr-rate-title">Pass Rate</div>
            <div class="frr-rate-bar-wrap">
              <div class="frr-rate-bar" style="width:${passRate}%;background:${passColor}"></div>
            </div>
            <div class="frr-rate-footer">
              <span class="frr-rate-pct" style="color:${passColor}">${passRate}%</span>
              <span class="frr-rate-sub">${passCount}/${appearedCount} appeared</span>
            </div>
          </div>
          <div class="frr-rate-block">
            <div class="frr-rate-title">Appeared</div>
            <div class="frr-rate-bar-wrap">
              <div class="frr-rate-bar" style="width:${appearedPct}%;background:${appearedColor}"></div>
            </div>
            <div class="frr-rate-footer">
              <span class="frr-rate-pct" style="color:${appearedColor}">${appearedPct}%</span>
              <span class="frr-rate-sub">${appearedCount}/${totalCount} total</span>
            </div>
          </div>
          <div class="frr-stat-div"></div>
          <div style="display:flex;gap:6px;align-items:center;padding:0 8px">
            <button id="frrExportCSV" class="frr-export-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>
              </svg>
              CSV
            </button>
            <button id="frrExportPDF" class="frr-export-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
              </svg>
              PDF
            </button>
          </div>
        </div>
      </div>`;

    // ── Table ────────────────────────────────────────────────────
    const bodyHTML = rows.map((r, i) => {
      const marksDisplay = r.marks != null
        ? `<strong>${r.marks}</strong><span style="color:var(--t3);font-size:11px"> / ${r.totalMarks}</span>`
        : `<span style="color:var(--t4)">—</span>`;
      return `
        <tr>
          <td style="color:var(--t3);font-size:11.5px">${i + 1}</td>
          <td style="font-weight:600">${r.studentName}</td>
          <td style="color:var(--t3);font-size:12px">${r.rollNo}</td>
          <td style="color:var(--t3);font-size:12px">${r.campusName}</td>
          <td style="color:var(--t3);font-size:12px">${r.session}</td>
          <td><span style="font-family:var(--font-mono,monospace);font-size:12px;font-weight:700;color:var(--blue)">${r.subjectCode}</span></td>
          <td style="font-size:12.5px;font-weight:600;color:var(--t2)">${r.batchNo}</td>
          <td style="font-size:12px;color:var(--t2)">${r.examDate || '—'}</td>
          <td>${marksDisplay}</td>
          <td>${this._statusBadge(r.status)}</td>
        </tr>`;
    }).join('');

    area.innerHTML = statsHTML + `
      <div class="frr-table-wrap">
        <table class="frr-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Student</th>
              <th>Roll No</th>
              <th>Campus</th>
              <th>Session</th>
              <th>Subject</th>
              <th>Batch</th>
              <th>Exam Date</th>
              <th>Marks</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>${bodyHTML}</tbody>
        </table>
      </div>
    `;

    // Wire export buttons
    const exportCtx = { rows, campusName, batchDisplayName: batchObj.batchName || '—',
                         passCount, failCount, absentCount, pendingCount, appearedCount, passRate, appearedPct, totalCount };
    area.querySelector('#frrExportCSV')?.addEventListener('click', () => this._exportCSV(exportCtx));
    area.querySelector('#frrExportPDF')?.addEventListener('click', () => this._exportPDF(exportCtx));

    ['frrExportCSV','frrExportPDF'].forEach(id => {
      const btn = area.querySelector('#' + id);
      if (!btn) return;
      btn.addEventListener('mouseenter', () => { btn.style.borderColor='var(--green)'; btn.style.color='var(--green)'; btn.style.background='var(--green-dim)'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor='var(--border)';  btn.style.color='var(--t3)';   btn.style.background='var(--surface2)'; });
    });
  },

  // ── Status badge ────────────────────────────────────────────────
  _statusBadge(status) {
    const map = {
      pass:    ['Pass',    'frr-badge-pass'],
      fail:    ['Fail',    'frr-badge-fail'],
      absent:  ['Absent',  'frr-badge-absent'],
      pending: ['Pending', 'frr-badge-pending'],
    };
    const [label, cls] = map[status] || ['—', 'frr-badge-pending'];
    return `<span class="frr-badge ${cls}">${label}</span>`;
  },

  // ── CSV export ───────────────────────────────────────────────────
  _exportCSV(d) {
    if (!d.rows.length) { alert('No results to export.'); return; }

    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const headers = ['Student','Roll No','Campus','Session','Subject','Batch','Exam Date','Marks','Total Marks','Status'];
    const statusLabel = { pass:'Pass', fail:'Fail', absent:'Absent', pending:'Pending' };

    const metaLines = [
      `Final Result Report`,
      `Generated: ${dateStr} ${timeStr}`,
      `Campus: ${d.campusName}${d.batchDisplayName !== '—' ? `  |  Batch: ${d.batchDisplayName}` : ''}`,
      `Total: ${d.totalCount}  Pass: ${d.passCount}  Fail: ${d.failCount}  Absent: ${d.absentCount}  Pending: ${d.pendingCount}`,
      `Pass Rate: ${d.passRate}%  |  Appeared: ${d.appearedPct}%`,
      '',
    ].join('\n');

    const dataRows = d.rows.map(r => [
      r.studentName, r.rollNo, r.campusName, r.session, r.subjectCode, r.batchNo,
      r.examDate || '—', r.marks != null ? r.marks : '—', r.totalMarks, statusLabel[r.status] || '—',
    ]);

    const csvRows = [
      metaLines,
      headers.join(','),
      ...dataRows.map(row => row.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')),
    ];

    const blob = new Blob([csvRows.join('\n')], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Final-Result-${dateStr.replace(/ /g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── PDF export (print-based) ──────────────────────────────────────
  _exportPDF(d) {
    if (!d.rows.length) { alert('No results to export.'); return; }

    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const passColor     = d.passRate    >= 80 ? '#16a34a' : d.passRate    >= 60 ? '#d97706' : '#dc2626';
    const appearedColor = d.appearedPct >= 80 ? '#16a34a' : d.appearedPct >= 60 ? '#d97706' : '#dc2626';

    const sc = { pass:'#16a34a', fail:'#dc2626', absent:'#d97706', pending:'#64748b' };
    const sb = { pass:'#f0fdf4', fail:'#fef2f2', absent:'#fffbeb', pending:'#f8fafc' };
    const sl = { pass:'Pass', fail:'Fail', absent:'Absent', pending:'Pending' };

    const tdRows = d.rows.map((r, i) => {
      const marks = r.marks != null ? `${r.marks} / ${r.totalMarks}` : '—';
      return `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">
        <td>${i + 1}</td>
        <td style="font-weight:600">${r.studentName}</td>
        <td>${r.rollNo}</td>
        <td>${r.campusName}</td>
        <td>${r.session}</td>
        <td>${r.subjectCode}</td>
        <td>${r.batchNo}</td>
        <td>${r.examDate || '—'}</td>
        <td>${marks}</td>
        <td><span style="color:${sc[r.status]};background:${sb[r.status]};padding:2px 8px;border-radius:6px;font-size:9px;font-weight:700">${sl[r.status]}</span></td>
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Final Result Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:18px 20px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #16a34a;padding-bottom:10px;margin-bottom:12px}
  .header-left .title{font-size:18px;font-weight:700;color:#15803d;letter-spacing:-0.3px}
  .header-left .subtitle{font-size:10.5px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:10.5px}
  .meta-bar{display:flex;align-items:center;gap:12px;padding:6px 12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:9px;font-size:10px;color:#15803d;font-weight:600}
  .stats-row{display:flex;align-items:stretch;gap:0;margin-bottom:10px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
  .stat-box{flex:1;padding:7px 10px;text-align:center;border-right:1px solid #e2e8f0;background:#f8fafc}
  .stat-box:last-child{border-right:none}
  .stat-box .num{font-size:16px;font-weight:700;color:#1e293b}
  .stat-box .lbl{font-size:8.5px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-top:1px}
  .stat-box.pass .num{color:#16a34a} .stat-box.pass{background:#f0fdf4}
  .stat-box.fail .num{color:#dc2626} .stat-box.fail{background:#fef2f2}
  .stat-box.absent .num{color:#d97706} .stat-box.absent{background:#fffbeb}
  .rate-box{flex:1.6;padding:7px 14px;text-align:center;border-right:1px solid #e2e8f0;background:#fff}
  .rate-box:last-child{border-right:none}
  .rate-title{font-size:8.5px;font-weight:700;color:#1e293b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
  .rate-bar-wrap{width:100%;height:5px;background:#e2e8f0;border-radius:6px;overflow:hidden;margin-bottom:4px}
  .rate-bar{height:100%;border-radius:6px}
  .rate-footer{display:flex;align-items:baseline;justify-content:center;gap:5px}
  .rate-pct{font-size:14px;font-weight:700}
  .rate-sub{font-size:8.5px;color:#64748b}
  table{width:100%;border-collapse:collapse;font-size:9.5px}
  thead tr{background:#15803d}
  thead th{color:#fff;font-weight:600;padding:6px;text-align:left;font-size:8.5px;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap}
  tbody tr.even{background:#fff}
  tbody tr.odd{background:#f7fdf9}
  tbody td{padding:5px 6px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:middle;white-space:nowrap}
  .footer{margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{body{padding:10px 12px}@page{size:A4 landscape;margin:8mm}.no-print{display:none}}
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Final Result Report</div>
      <div class="subtitle">Student Final Exam Results</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>

  <div class="meta-bar">🏠 ${d.campusName}${d.batchDisplayName !== '—' ? ` <span style="color:#bbf7d0">|</span> 📅 ${d.batchDisplayName}` : ''}</div>

  <div class="stats-row">
    <div class="stat-box"><div class="num">${d.totalCount}</div><div class="lbl">Total</div></div>
    <div class="stat-box pass"><div class="num">${d.passCount}</div><div class="lbl">Pass</div></div>
    <div class="stat-box fail"><div class="num">${d.failCount}</div><div class="lbl">Fail</div></div>
    <div class="stat-box absent"><div class="num">${d.absentCount}</div><div class="lbl">Absent</div></div>
    <div class="stat-box"><div class="num">${d.pendingCount}</div><div class="lbl">Pending</div></div>
    <div class="rate-box">
      <div class="rate-title">Pass Rate</div>
      <div class="rate-bar-wrap"><div class="rate-bar" style="width:${d.passRate}%;background:${passColor}"></div></div>
      <div class="rate-footer"><span class="rate-pct" style="color:${passColor}">${d.passRate}%</span><span class="rate-sub">${d.passCount}/${d.appearedCount}</span></div>
    </div>
    <div class="rate-box">
      <div class="rate-title">Appeared</div>
      <div class="rate-bar-wrap"><div class="rate-bar" style="width:${d.appearedPct}%;background:${appearedColor}"></div></div>
      <div class="rate-footer"><span class="rate-pct" style="color:${appearedColor}">${d.appearedPct}%</span><span class="rate-sub">${d.appearedCount}/${d.totalCount}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th><th>Student</th><th>Roll No</th><th>Campus</th><th>Session</th>
        <th>Subject</th><th>Batch</th><th>Exam Date</th><th>Marks</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${tdRows}</tbody>
  </table>

  <div class="footer">
    <span>Final Results &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>Total: ${d.totalCount} record${d.totalCount !== 1 ? 's' : ''}</span>
  </div>
  <div style="margin-top:8px;text-align:center;font-size:9px;color:#94a3b8">
    Powered by <strong style="color:#15803d">Learnomist</strong>
  </div>

  <div class="no-print" style="margin-top:16px;text-align:center">
    <button onclick="window.print()"
      style="padding:8px 26px;background:#16a34a;color:#fff;border:none;border-radius:8px;
             font-size:13px;font-weight:600;cursor:pointer">
      Print / Save as PDF
    </button>
  </div>
</body>
</html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  },
};
