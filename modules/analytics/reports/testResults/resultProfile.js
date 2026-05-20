// ============================================================
// modules/analytics/reports/testResults/resultProfile.js
// Report: Result Profile
// — Collapsible filter bar (campus → discipline → level →
//   session → subject → batch)
// — Table: student info columns + dynamic grouped test columns
//   (Test 1, Test 2, Mock …) each with Date / Marks / Total /
//   Status sub-columns, data pulled from AppState['testResults']
// ============================================================

import { AppState }          from '../../../../utils/state.js';
import { getAllAssignments }  from '../../../lecturePlan/lecturePlanService.js';
import { getSchedules, formatDate } from '../../../testing/testingService.js';

// ── LP row types that are assessable tests ─────────────────────
const LP_TEST_TYPES = new Set(['test', 'midterm', 'mock']);
const LP_VALID_RE   = /^(?:test(?:\s+\d+)?|mid[\s-]?term(?:\s+\d+)?|mock(?:\s+exam)?(?:\s+\d+)?)$/i;

// ── Styles ─────────────────────────────────────────────────────
let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const st = document.createElement('style');
  st.textContent = `
/* ── Page wrap ── */
.rp-page { display:flex; flex-direction:column; gap:16px; }

/* ── Filter bar card ── */
.rp-filter-card {
  background:var(--surface);
  border:1px solid var(--border);
  border-radius:12px;
  overflow:hidden;
}
.rp-filter-toggle {
  display:flex; align-items:center; gap:10px;
  width:100%; padding:11px 16px;
  background:none; border:none; font-family:inherit;
  font-size:13px; font-weight:700; color:var(--t1);
  cursor:pointer; text-align:left;
  transition:background .15s;
}
.rp-filter-toggle:hover { background:var(--surface2); }
.rp-filter-toggle-label { flex:1; }
.rp-filter-badge {
  display:inline-flex; align-items:center;
  background:var(--blue-dim); color:var(--blue);
  border-radius:20px; padding:2px 9px;
  font-size:11px; font-weight:700;
}
.rp-filter-arrow {
  transition:transform .2s; color:var(--t3);
}
.rp-filter-arrow.open { transform:rotate(180deg); }

.rp-filter-body {
  display:none; flex-direction:column; gap:14px;
  border-top:1px solid var(--border);
  padding:16px;
}
.rp-filter-body.open { display:flex; }

.rp-filter-row { display:flex; flex-wrap:wrap; gap:14px; }
.rp-filter-col {
  display:flex; flex-direction:column; gap:5px;
  flex:1; min-width:150px;
}
.rp-filter-col-label {
  font-size:10.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.07em;
  color:var(--t3);
}
.rp-filter-sel {
  height:34px; padding:0 10px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:8px; color:var(--t1); font-size:12.5px;
  cursor:pointer; outline:none; font-family:inherit;
  transition:border-color .12s;
}
.rp-filter-sel:focus   { border-color:var(--blue); }
.rp-filter-sel:disabled { opacity:.45; cursor:not-allowed; }

/* Filter actions row */
.rp-filter-actions { display:flex; gap:8px; align-items:center; padding-top:2px; }
.rp-filter-apply {
  padding:7px 20px; border-radius:8px; border:none;
  background:var(--blue); color:#fff;
  font-size:12.5px; font-weight:700;
  cursor:pointer; transition:opacity .15s; font-family:inherit;
}
.rp-filter-apply:hover { opacity:.88; }
.rp-filter-clear {
  padding:7px 14px; border-radius:8px;
  border:1px solid var(--border); background:transparent;
  color:var(--t2); font-size:12px; font-weight:600;
  cursor:pointer; transition:all .15s; font-family:inherit;
}
.rp-filter-clear:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }

/* Active chips */
.rp-chip-row { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:2px; }
.rp-chip {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 9px; border-radius:20px;
  font-size:11px; font-weight:600;
  border:1px solid transparent;
}
.rp-chip-x { font-size:10px; cursor:pointer; opacity:.7; }
.rp-chip-x:hover { opacity:1; }

/* ── Empty state ── */
.rp-empty {
  display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:12px;
  padding:64px 24px;
  border:1px dashed var(--border2); border-radius:12px;
  color:var(--t3); text-align:center;
}
.rp-empty p    { font-size:14px; font-weight:600; color:var(--t2); margin:0; }
.rp-empty span { font-size:12.5px; }

/* ── Table ── */
.rp-table-wrap {
  overflow-x:auto;
  border:1px solid var(--border);
  border-radius:12px;
}
.rp-table {
  width:100%; border-collapse:collapse; font-size:12.5px;
  min-width:700px;
}
/* Group header row */
.rp-table thead tr.rp-thead-group th {
  background:var(--surface2);
  color:var(--t2);
  font-size:11.5px; font-weight:800;
  text-align:center;
  padding:9px 10px;
  border-bottom:1px solid var(--border2);
  white-space:nowrap;
}
.rp-table thead tr.rp-thead-group th.rp-th-left {
  text-align:left;
}
.rp-th-test-group {
  border-left:2px solid var(--border2);
  background:color-mix(in srgb, var(--blue) 7%, var(--surface2));
  color:var(--blue);
}
.rp-th-mock-group {
  border-left:2px solid var(--border2);
  background:color-mix(in srgb, var(--violet,#8b5cf6) 7%, var(--surface2));
  color:var(--violet,#8b5cf6);
}
/* Sub-header row */
.rp-table thead tr.rp-thead-sub th {
  background:var(--surface2);
  color:var(--t3);
  font-size:10px; font-weight:700;
  text-transform:uppercase; letter-spacing:.06em;
  padding:7px 10px;
  border-bottom:1px solid var(--border);
  white-space:nowrap;
  text-align:left;
}
.rp-table thead tr.rp-thead-sub th.rp-sub-sep {
  border-left:2px solid var(--border2);
}
/* Body */
.rp-table tbody tr td {
  padding:10px 10px;
  border-bottom:1px solid var(--border);
  color:var(--t1); vertical-align:middle;
}
.rp-table tbody tr:last-child td { border-bottom:none; }
.rp-table tbody tr:hover td { background:var(--surface2); }
.rp-td-sep { border-left:2px solid var(--border2); }

/* Badges */
.rp-badge {
  display:inline-flex; align-items:center;
  padding:2px 9px; border-radius:20px;
  font-size:10.5px; font-weight:700; white-space:nowrap;
}
.rp-badge-pass    { background:var(--green-dim);  color:var(--green);  }
.rp-badge-fail    { background:var(--red-dim);    color:var(--red);    }
.rp-badge-absent  { background:var(--yellow-dim); color:var(--yellow); }
.rp-badge-pending { background:var(--surface3);   color:var(--t3);     }

/* ── Stats strip ── */
.rp-stats-strip {
  display:flex; align-items:center;
  background:var(--surface);
  border:1px solid var(--border);
  border-bottom:none;
  border-radius:12px 12px 0 0;
  padding:8px 16px;
}
.rp-stat-box { display:flex; flex-direction:column; align-items:center; padding:3px 12px; gap:1px; }
.rp-stat-num { font-size:18px; font-weight:700; color:var(--t1); line-height:1.1; }
.rp-stat-lbl { font-size:10px; font-weight:600; color:var(--t3); text-transform:uppercase; letter-spacing:.05em; }
.rp-stat-div { width:1px; height:36px; background:var(--border); margin:0 6px; flex-shrink:0; }
.rp-stat-pass .rp-stat-num   { color:var(--green);  }
.rp-stat-fail .rp-stat-num   { color:var(--red);    }
.rp-stat-absent .rp-stat-num { color:var(--yellow); }
.rp-stat-pend .rp-stat-num   { color:var(--t3);     }

.rp-passrate-block { display:flex; flex-direction:column; align-items:center; gap:4px; padding:2px 18px; min-width:150px; }
.rp-passrate-title { font-size:10px; font-weight:700; color:var(--t3); text-transform:uppercase; letter-spacing:.06em; }
.rp-passrate-bar-wrap { width:100%; height:5px; background:var(--surface3); border-radius:10px; overflow:hidden; }
.rp-passrate-bar { height:100%; border-radius:10px; transition:width .4s ease; }
.rp-passrate-footer { display:flex; align-items:baseline; gap:6px; justify-content:center; }
.rp-passrate-pct  { font-size:15px; font-weight:700; line-height:1; }
.rp-passrate-sub  { font-size:10px; color:var(--t3); }

/* ── Per-test stats strip ── */
.rp-test-stats-strip {
  display:flex; flex-wrap:wrap; gap:0;
  background:var(--surface);
  border:1px solid var(--border);
  border-top:none;
  border-bottom:none;
  overflow:hidden;
}
.rp-test-stat-card {
  display:flex; flex-direction:column; gap:6px;
  flex:1; min-width:120px;
  padding:10px 14px;
  border-right:1px solid var(--border);
}
.rp-test-stat-card:last-child { border-right:none; }
.rp-test-stat-card.is-mock {
  background:color-mix(in srgb, var(--violet,#8b5cf6) 5%, var(--surface));
}
.rp-test-stat-label {
  font-size:11px; font-weight:800;
  color:var(--t2); white-space:nowrap;
}
.rp-test-stat-label.is-mock { color:var(--violet,#8b5cf6); }
.rp-test-stat-label.is-test { color:var(--blue); }
.rp-test-stat-date {
  font-size:10px; color:var(--t4); margin-top:-4px;
}
.rp-test-stat-counts {
  display:flex; gap:8px; align-items:center; flex-wrap:wrap;
}
.rp-test-count-pill {
  display:inline-flex; align-items:center; gap:3px;
  font-size:10.5px; font-weight:700;
  padding:1px 7px; border-radius:20px;
}
.rp-tpill-pass   { background:var(--green-dim);  color:var(--green);  }
.rp-tpill-fail   { background:var(--red-dim);    color:var(--red);    }
.rp-tpill-absent { background:var(--yellow-dim); color:var(--yellow); }
.rp-tpill-pend   { background:var(--surface3);   color:var(--t3);     }
.rp-test-stat-bar-wrap {
  width:100%; height:4px; background:var(--surface3);
  border-radius:4px; overflow:hidden;
}
.rp-test-stat-bar { height:100%; border-radius:4px; transition:width .3s; }
.rp-test-pct {
  font-size:11px; font-weight:800;
}
  `;
  document.head.appendChild(st);
}

// ── Data helpers ───────────────────────────────────────────────

function _getResults()   { return AppState.get('testResults') || []; }
function _getCampuses()  { return AppState.get('campuses')    || []; }
function _getBatches()   { return AppState.get('batches')     || []; }
function _getSubjects()  { return AppState.get('subjects')    || []; }
function _getStudents()  { return AppState.get('students')    || []; }
function _getEnrolments(){ return AppState.get('enrolments')  || []; }

/**
 * Disciplines from AppState['disciplines']
 * Fields per discipline.js: id, abbreviation, fullName, instituteId, campusIds
 * Optionally filter by campusId.
 */
function _getDisciplines(campusId = '') {
  const all = AppState.get('disciplines') || [];
  if (!campusId) return all;
  return all.filter(d => !d.campusIds?.length || d.campusIds.includes(campusId));
}

/**
 * Levels from AppState['levels'], filtered by disciplineId.
 * Level fields expected: id, levelName (or name), disciplineId
 */
function _getLevels(disciplineId = '') {
  const all = AppState.get('levels') || [];
  if (!disciplineId) return all;
  return all.filter(l => l.disciplineId === disciplineId);
}

function _getSessions(subjectId) {
  const set = new Set();
  _getBatches().forEach(b => {
    // Batch has direct subjectId field (batch.js: subjectId stored on batch)
    if (subjectId && b.subjectId !== subjectId) return;
    if (b.sessionPeriod) set.add(b.sessionPeriod);
  });
  return [...set].sort();
}

function _getSubjectsFor({ disciplineId, levelId }) {
  const allSubjects = _getSubjects();
  const allLevels   = AppState.get('levels') || [];

  return allSubjects.filter(s => {
    // Filter by levelId directly
    if (levelId) {
      return s.levelId === levelId;
    }
    // Filter by disciplineId: subject has no direct disciplineId,
    // so we look it up via subject.levelId → level.disciplineId
    if (disciplineId) {
      const level = allLevels.find(l => l.id === s.levelId);
      if (!level || level.disciplineId !== disciplineId) return false;
    }
    return true;
  });
}

function _getBatchesFor({ disciplineId, levelId, subjectId, sessionId, campusId }) {
  return _getBatches().filter(b => {
    // batch.js stores: disciplineId, levelId, subjectId, sessionPeriod, campusId, batchNo
    if (disciplineId && b.disciplineId !== disciplineId) return false;
    if (levelId      && b.levelId      !== levelId)      return false;
    if (subjectId    && b.subjectId    !== subjectId)     return false;
    if (sessionId    && b.sessionPeriod !== sessionId)    return false;
    if (campusId     && b.campusId     !== campusId)      return false;
    return true;
  });
}

/**
 * Build all calendar test entries for given criteria.
 * Returns sorted array of "schedule entry" objects.
 */
function _buildEntries({ subjectId, batchId } = {}) {
  const entries = [];

  // LP-derived
  const assignments = getAllAssignments();
  for (const [bid, lpa] of Object.entries(assignments)) {
    if (batchId && bid !== batchId) continue;
    if (!lpa?.rows?.length) continue;
    const batch = AppState.findById('batches', bid) || {};
    lpa.rows.forEach(row => {
      const rowType = (row.type || '').toLowerCase();
      if (!LP_TEST_TYPES.has(rowType)) return;
      if (!row.date) return;
      const rawTopic = (row.topic || '').trim();
      if (rawTopic && !LP_VALID_RE.test(rawTopic)) return;
      if (subjectId && row.subjectId && row.subjectId !== subjectId) return;
      entries.push({
        id:           `lp__${bid}__${row.id}`,
        date:         row.date,
        testName:     rawTopic || _defaultLabel(rowType),
        testType:     _normType(rowType),
        batchId:      bid,
        subjectId:    row.subjectId || subjectId || '',
        totalMarks:   row.totalMarks   || '',
        passingMarks: row.passingMarks || '',
      });
    });
  }

  // Manual schedules
  getSchedules().forEach(s => {
    if (batchId   && s.batchId   !== batchId)   return;
    if (subjectId && s.subjectId !== subjectId)  return;
    entries.push({
      id:           s.id,
      date:         s.date,
      testName:     s.testName,
      testType:     s.testType,
      batchId:      s.batchId,
      subjectId:    s.subjectId || subjectId || '',
      totalMarks:   s.totalMarks   || '',
      passingMarks: s.passingMarks || '',
    });
  });

  entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return entries;
}

function _normType(t) {
  t = (t || '').toLowerCase();
  if (t === 'midterm') return 'midterm';
  if (t === 'mock')    return 'mock';
  return 'written';
}

function _defaultLabel(rowType) {
  if (rowType === 'midterm') return 'Midterm';
  if (rowType === 'mock')    return 'Mock Exam';
  return 'Test';
}

// ── Main Export ────────────────────────────────────────────────
export const ResultProfile = {

  _container: null,
  _filterOpen: false,

  // Filter state
  _selCampus:     '',
  _selDiscipline: '',
  _selLevel:      '',
  _selSession:    '',
  _selSubject:    '',
  _selBatch:      '',

  // Applied filter (drives table)
  _appliedFilter: null,   // null = nothing applied yet

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

  // ── Full render ───────────────────────────────────────────────
  _render() {
    const c = this._container;
    c.innerHTML = `
      <div class="rp-page">
        <div class="rp-filter-card" id="rpFilterCard">
          ${this._filterToggleHTML()}
          <div class="rp-filter-body ${this._filterOpen ? 'open' : ''}" id="rpFilterBody">
            ${this._filterBodyHTML()}
          </div>
        </div>
        <div id="rpTableArea"></div>
      </div>
    `;

    this._attachFilterEvents(c);
    this._renderTable(c);
  },

  // ── Filter toggle button ──────────────────────────────────────
  _filterToggleHTML() {
    const count = this._activeFilterCount();
    return `
      <button class="rp-filter-toggle" id="rpFilterToggle">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
        </svg>
        <span class="rp-filter-toggle-label">Select Filter</span>
        ${count ? `<span class="rp-filter-badge">${count} active</span>` : ''}
        <svg class="rp-filter-arrow ${this._filterOpen ? 'open' : ''}" width="14" height="14"
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
      <div class="rp-filter-col">
        <div class="rp-filter-col-label">${label}</div>
        <select class="rp-filter-sel" id="${id}" ${disabled ? 'disabled' : ''}>
          <option value="">Select ${label}…</option>
          ${opts.map(o => `<option value="${o.value}" ${val === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
        </select>
      </div>`;

    const campusOpts    = campuses.map(c    => ({ value: c.id, label: (c.campusName||'').replace(/\s*campus$/i,'').trim() }));
    const disciplineOpts= disciplines.map(d => ({ value: d.id, label: d.abbreviation ? `${d.abbreviation} — ${d.fullName}` : (d.fullName || d.name || d.id) }));
    const levelOpts     = levels.map(l => ({ value: l.id, label: l.levelName || l.name || l.id }));
    const sessionOpts   = sessions.map(s    => ({ value: s,    label: s }));
    const subjectOpts   = subjects.map(s    => ({
      value: s.id,
      label: `${s.subjectCode||''} — ${s.subjectName||''}`.replace(/^—\s*/,'').trim()
    }));
    const batchOpts     = batches.map(b => ({ value: b.id, label: b.batchName || (`Batch ${b.batchNo || b.id}`) }));

    // active chips from _appliedFilter
    const chips = this._appliedChipsHTML();

    return `
      <div class="rp-filter-row">
        ${sel('rpSelCampus',     'Campus',     campusOpts,     this._selCampus)}
        ${sel('rpSelDiscipline', 'Discipline', disciplineOpts, this._selDiscipline, !this._selCampus)}
        ${sel('rpSelLevel',      'Level',      levelOpts,      this._selLevel,      !this._selDiscipline)}
        ${sel('rpSelSession',    'Session',    sessionOpts,    this._selSession,    !this._selLevel)}
        ${sel('rpSelSubject',    'Subject',    subjectOpts,    this._selSubject,    !this._selSession)}
        ${sel('rpSelBatch',      'Batch #',    batchOpts,      this._selBatch,      !this._selSubject)}
      </div>

      <div class="rp-filter-actions">
        <button class="rp-filter-apply" id="rpApplyBtn">Apply Filter</button>
        <button class="rp-filter-clear" id="rpClearBtn">Clear</button>
        ${chips ? `<div class="rp-chip-row" id="rpChipRow">${chips}</div>` : ''}
      </div>
    `;
  },

  _appliedChipsHTML() {
    const f = this._appliedFilter;
    if (!f) return '';
    const chips = [];
    const make = (label, color) => `
      <span class="rp-chip" style="background:color-mix(in srgb,${color} 15%,transparent);
            color:${color};border-color:${color}">
        ${label}
      </span>`;

    if (f.campus)     chips.push(make((_getCampuses().find(c=>c.id===f.campus)?.campusName||f.campus).replace(/\s*campus$/i,'').trim(), 'var(--blue)'));
    if (f.discipline) { const _d = _getDisciplines().find(d=>d.id===f.discipline); chips.push(make(_d ? (_d.abbreviation || _d.fullName) : f.discipline, 'var(--violet,#8b5cf6)')); }
    if (f.level)      { const _l = _getLevels().find(l=>l.id===f.level); chips.push(make(_l ? (_l.levelName||_l.name||f.level) : f.level, 'var(--cyan)')); }
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

  // ── Attach all filter events ──────────────────────────────────
  _attachFilterEvents(c) {
    // Toggle open/close
    c.querySelector('#rpFilterToggle')?.addEventListener('click', () => {
      this._filterOpen = !this._filterOpen;
      const body  = c.querySelector('#rpFilterBody');
      const arrow = c.querySelector('.rp-filter-arrow');
      body?.classList.toggle('open', this._filterOpen);
      arrow?.classList.toggle('open', this._filterOpen);
      // Update toggle HTML for badge
      const toggle = c.querySelector('#rpFilterToggle');
      if (toggle) toggle.outerHTML = this._filterToggleHTML();
      // Re-bind toggle click (outerHTML replaces node)
      c.querySelector('#rpFilterToggle')?.addEventListener('click', arguments.callee);
    });

    this._bindCascadeSelects(c);

    // Apply
    c.querySelector('#rpApplyBtn')?.addEventListener('click', () => {
      this._appliedFilter = {
        campus:     this._selCampus,
        discipline: this._selDiscipline,
        level:      this._selLevel,
        session:    this._selSession,
        subject:    this._selSubject,
        batch:      this._selBatch,
      };
      this._renderTable(c);
      // Refresh filter body for chips + close panel
      this._filterOpen = false;
      const body  = c.querySelector('#rpFilterBody');
      const arrow = c.querySelector('.rp-filter-arrow');
      body?.classList.remove('open');
      arrow?.classList.remove('open');
      this._rerenderFilterToggle(c);
      this._rerenderFilterBody(c);
    });

    // Clear
    c.querySelector('#rpClearBtn')?.addEventListener('click', () => {
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
      this._selCampus     = c.querySelector('#rpSelCampus')?.value     || '';
      this._selDiscipline = '';
      this._selLevel      = '';
      this._selSession    = '';
      this._selSubject    = '';
      this._selBatch      = '';
      this._rerenderFilterBody(c);
    };
    const onDiscipline = () => {
      this._selDiscipline = c.querySelector('#rpSelDiscipline')?.value || '';
      this._selLevel      = '';
      this._selSession    = '';
      this._selSubject    = '';
      this._selBatch      = '';
      this._rerenderFilterBody(c);
    };
    const onLevel = () => {
      this._selLevel   = c.querySelector('#rpSelLevel')?.value   || '';
      this._selSession = '';
      this._selSubject = '';
      this._selBatch   = '';
      this._rerenderFilterBody(c);
    };
    const onSession = () => {
      this._selSession = c.querySelector('#rpSelSession')?.value || '';
      this._selSubject = '';
      this._selBatch   = '';
      this._rerenderFilterBody(c);
    };
    const onSubject = () => {
      this._selSubject = c.querySelector('#rpSelSubject')?.value || '';
      this._selBatch   = '';
      this._rerenderFilterBody(c);
    };
    const onBatch = () => {
      this._selBatch = c.querySelector('#rpSelBatch')?.value || '';
    };

    c.querySelector('#rpSelCampus')    ?.addEventListener('change', onCampus);
    c.querySelector('#rpSelDiscipline')?.addEventListener('change', onDiscipline);
    c.querySelector('#rpSelLevel')     ?.addEventListener('change', onLevel);
    c.querySelector('#rpSelSession')   ?.addEventListener('change', onSession);
    c.querySelector('#rpSelSubject')   ?.addEventListener('change', onSubject);
    c.querySelector('#rpSelBatch')     ?.addEventListener('change', onBatch);
  },

  _rerenderFilterBody(c) {
    const body = c.querySelector('#rpFilterBody');
    if (!body) return;
    body.innerHTML = this._filterBodyHTML();
    this._bindCascadeSelects(c);
    c.querySelector('#rpApplyBtn')?.addEventListener('click', () => {
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
      const bod2  = c.querySelector('#rpFilterBody');
      const arrow = c.querySelector('.rp-filter-arrow');
      bod2?.classList.remove('open');
      arrow?.classList.remove('open');
      this._rerenderFilterToggle(c);
      this._rerenderFilterBody(c);
    });
    c.querySelector('#rpClearBtn')?.addEventListener('click', () => {
      this._selCampus = this._selDiscipline = this._selLevel =
        this._selSession = this._selSubject = this._selBatch = '';
      this._appliedFilter = null;
      this._rerenderFilterBody(c);
      this._renderTable(c);
      this._rerenderFilterToggle(c);
    });
  },

  _rerenderFilterToggle(c) {
    const toggle = c.querySelector('#rpFilterToggle');
    if (!toggle) return;
    const newHTML = document.createElement('div');
    newHTML.innerHTML = this._filterToggleHTML();
    const newBtn = newHTML.firstElementChild;
    toggle.replaceWith(newBtn);
    newBtn.addEventListener('click', () => {
      this._filterOpen = !this._filterOpen;
      c.querySelector('#rpFilterBody')?.classList.toggle('open', this._filterOpen);
      newBtn.querySelector('.rp-filter-arrow')?.classList.toggle('open', this._filterOpen);
      // Update badge count in button
      const badge = newBtn.querySelector('.rp-filter-badge');
      const count = this._activeFilterCount();
      if (badge) badge.textContent = `${count} active`;
    });
  },

  // ── Table render ──────────────────────────────────────────────
  _renderTable(c) {
    const area = c.querySelector('#rpTableArea');
    if (!area) return;

    // If no filter applied yet, show prompt
    if (!this._appliedFilter ||
        (!this._appliedFilter.campus && !this._appliedFilter.subject && !this._appliedFilter.batch)) {
      area.innerHTML = `
        <div class="rp-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <p>Select a filter to view results</p>
          <span>Use "Select Filter" above to choose campus, subject and batch.</span>
        </div>`;
      return;
    }

    // ── Build data ──────────────────────────────────────────────
    const f = this._appliedFilter;

    // Get calendar entries matching batch/subject
    // If subject not explicitly selected, derive from batch.subjectId
    const batchForEntries = f.batch ? (_getBatches().find(b => b.id === f.batch) || {}) : {};
    const resolvedSubjectId = f.subject || batchForEntries.subjectId || '';
    const entries = _buildEntries({ subjectId: resolvedSubjectId, batchId: f.batch || '' });

    if (!entries.length) {
      area.innerHTML = `
        <div class="rp-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <p>No test schedule found</p>
          <span>No tests are scheduled for the selected batch/subject yet.</span>
        </div>`;
      return;
    }

    // Separate tests vs mock
    const testEntries = entries.filter(e => e.testType !== 'mock');
    const mockEntries = entries.filter(e => e.testType === 'mock');

    // Label them: Test 1, Test 2, … and Mock 1, Mock 2, …
    const labelledCols = [
      ...testEntries.map((e, i) => ({ ...e, colLabel: `Test ${i + 1}`, isMock: false })),
      ...mockEntries.map((e, i) => ({ ...e, colLabel: mockEntries.length === 1 ? 'Mock' : `Mock ${i + 1}`, isMock: true })),
    ];

    // Get all results map: scheduleEntryId → studentId → result record
    const allResults = _getResults();
    const resultsMap = {};
    allResults.forEach(r => {
      if (!resultsMap[r.scheduleEntryId]) resultsMap[r.scheduleEntryId] = {};
      resultsMap[r.scheduleEntryId][r.studentId] = r;
    });

    // Collect students in this batch
    let students = [];
    if (f.batch) {
      // Get students enrolled in this batch (enrolment has batchId + studentId)
      const enrols = _getEnrolments().filter(e => e.batchId === f.batch);
      const seen   = new Set();
      enrols.forEach(e => {
        if (!seen.has(e.studentId)) {
          seen.add(e.studentId);
          const st = AppState.findById('students', e.studentId) || {};
          students.push({ id: e.studentId, ...st });
        }
      });
    } else {
      // No batch selected — collect from test result records matching entries
      const entryIds = new Set(entries.map(e => e.id));
      const seen = new Set();
      allResults.forEach(r => {
        if (entryIds.has(r.scheduleEntryId) && !seen.has(r.studentId)) {
          seen.add(r.studentId);
          const st = AppState.findById('students', r.studentId) || {};
          students.push({ id: r.studentId, ...st });
        }
      });
    }

    if (!students.length) {
      area.innerHTML = `
        <div class="rp-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
          <p>No students found</p>
          <span>No students are enrolled in the selected batch.</span>
        </div>`;
      return;
    }

    // ── Build enriched rows ─────────────────────────────────────
    const campuses = _getCampuses();
    const subjects = _getSubjects();
    const batches  = _getBatches();

    // For display, get batch + subject info once
    const batchObj   = batches.find(b => b.id === f.batch) || {};
    const subjectObj = subjects.find(s => s.id === resolvedSubjectId) || {};
    const campusObj  = campuses.find(c => c.id === (f.campus || batchObj.campusId)) || {};
    const session    = batchObj.sessionPeriod || batchObj.sessionId || f.session || '—';
    const campusName = (campusObj.campusName || '').replace(/\s*campus$/i,'').trim() || '—';
    const subjectCode= subjectObj.subjectCode || subjectObj.subjectName || '—';

    const batchNo = batchObj.batchNo ? String(batchObj.batchNo).padStart(2,'0') : (batchObj.batchName || '—');

    // Per-student, per-column result rows
    const tableRows = students.map(st => {
      const studentName = (st.studentName || `${st.firstName||''} ${st.lastName||''}`.trim() || '—');
      const studentId   = st.studentId || st.id || '—';

      const cols = labelledCols.map(col => {
        const r = (resultsMap[col.id] || {})[st.id] || null;
        const effectiveTotalMarks   = (r?.totalMarks   || col.totalMarks   || null);
        const effectivePassingMarks = (r?.passingMarks || col.passingMarks ||
          (effectiveTotalMarks ? Math.ceil(Number(effectiveTotalMarks) * 0.5) : null));
        const marks  = r ? r.marks : null;
        const absent = r ? !!r.absent : false;
        const status = absent               ? 'absent'
                     : marks == null       ? 'pending'
                     : (effectivePassingMarks && marks >= Number(effectivePassingMarks)) ? 'pass'
                     : 'fail';
        return { col, marks, absent, status, totalMarks: effectiveTotalMarks };
      });

      return { st, studentName, studentId, cols };
    });

    // Sort by student name
    tableRows.sort((a, b) => a.studentName.localeCompare(b.studentName));

    // ── Stats strip ─────────────────────────────────────────────
    // Count total cells for summary
    let totalCells = 0, passC = 0, failC = 0, absentC = 0, pendingC = 0;
    let allMarksSum = 0, allMarksCount = 0, allTotalSum = 0;
    tableRows.forEach(row => {
      row.cols.forEach(cell => {
        totalCells++;
        if (cell.status === 'pass')         passC++;
        else if (cell.status === 'fail')    failC++;
        else if (cell.status === 'absent')  absentC++;
        else                                pendingC++;
        if (cell.marks != null && !cell.absent && cell.totalMarks) {
          allMarksSum  += Number(cell.marks);
          allTotalSum  += Number(cell.totalMarks);
          allMarksCount++;
        }
      });
    });
    const appearedC = passC + failC;
    const passRate  = appearedC > 0 ? Math.round((passC / appearedC) * 100) : 0;

    // Tests done = tests where at least one student has a result (not all pending)
    const testsDone    = labelledCols.filter((col, ci) => {
      return tableRows.some(row => {
        const cell = row.cols[ci];
        return cell && cell.status !== 'pending';
      });
    }).length;
    const testsPending = labelledCols.length - testsDone;

    // Batch performance: har test ka avgPct nikalo, phir equal-weight average
    const _testAvgPcts = labelledCols.map((col, ci) => {
      let tMarksSum = 0, tTotalSum = 0, tCount = 0;
      tableRows.forEach(row => {
        const cell = row.cols[ci];
        if (cell && cell.marks != null && !cell.absent && cell.totalMarks) {
          tMarksSum += Number(cell.marks);
          tTotalSum += Number(cell.totalMarks);
          tCount++;
        }
      });
      return tCount > 0 ? (tMarksSum / tTotalSum) : null;
    }).filter(v => v !== null);
    const batchAvgPct = _testAvgPcts.length > 0
      ? Math.round((_testAvgPcts.reduce((a, b) => a + b, 0) / _testAvgPcts.length) * 100)
      : null;
    const bpColor    = batchAvgPct == null ? 'var(--t3)'
                     : batchAvgPct >= 80   ? 'var(--green)'
                     : batchAvgPct >= 70   ? 'var(--yellow)'
                     : 'var(--red)';
    const bpBg       = batchAvgPct == null ? 'var(--surface3)'
                     : batchAvgPct >= 80   ? 'var(--green-dim)'
                     : batchAvgPct >= 70   ? 'var(--yellow-dim)'
                     : 'var(--red-dim)';
    const bpLabel    = batchAvgPct == null ? 'No Data'
                     : batchAvgPct >= 80   ? 'Healthy'
                     : batchAvgPct >= 70   ? 'At Risk'
                     : 'Danger';
    const bpIcon     = batchAvgPct == null ? '–'
                     : batchAvgPct >= 80   ? '●'
                     : batchAvgPct >= 70   ? '▲'
                     : '⚠';

    const statsHTML = `
      <div class="rp-stats-strip">
        <div style="display:flex;align-items:center;gap:0">
          <div class="rp-stat-box">
            <div class="rp-stat-num">${tableRows.length}</div>
            <div class="rp-stat-lbl">Students</div>
          </div>
          <div class="rp-stat-div"></div>
          <div class="rp-stat-box">
            <div class="rp-stat-num">${labelledCols.length}</div>
            <div class="rp-stat-lbl">Tests</div>
          </div>
          <div class="rp-stat-div"></div>
          <div class="rp-stat-box" style="align-items:flex-start;padding-left:14px">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
              ${testsDone > 0 ? `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--green-dim);color:var(--green);padding:2px 10px;border-radius:20px;font-size:11.5px;font-weight:700">✓ ${testsDone} Done</span>` : ''}
              ${testsPending > 0 ? `<span style="display:inline-flex;align-items:center;gap:4px;background:var(--surface3);color:var(--t3);padding:2px 10px;border-radius:20px;font-size:11.5px;font-weight:700">· ${testsPending} Pending</span>` : ''}
            </div>
            <div class="rp-stat-lbl" style="margin-top:3px">Tests Done</div>
          </div>
          <div class="rp-stat-div"></div>
          <div class="rp-stat-box" style="align-items:flex-start;padding-left:14px">
            <div style="display:inline-flex;align-items:center;gap:6px;
                        background:${bpBg};color:${bpColor};
                        padding:3px 11px;border-radius:20px;font-size:12px;font-weight:800">
              <span>${bpIcon}</span>
              <span>${bpLabel}</span>
              ${batchAvgPct != null ? `<span style="font-size:10px;opacity:.8">(${batchAvgPct}%)</span>` : ''}
            </div>
            <div class="rp-stat-lbl" style="margin-top:3px">Batch Performance</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0;margin-left:auto">
          <div class="rp-stat-div"></div>
          <div style="display:flex;gap:6px;align-items:center;padding:0 8px">
            <button id="rpExportCSV"
              style="display:inline-flex;align-items:center;justify-content:center;gap:5px;
                     height:30px;padding:0 12px;border-radius:8px;
                     border:1px solid var(--border);background:var(--surface2);
                     color:var(--t3);cursor:pointer;font-size:12px;font-weight:600;
                     font-family:inherit;transition:all .15s;white-space:nowrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 12l2.5 2.5L16 9"/>
              </svg>
              CSV
            </button>
            <button id="rpExportPDF"
              style="display:inline-flex;align-items:center;justify-content:center;gap:5px;
                     height:30px;padding:0 12px;border-radius:8px;
                     border:1px solid var(--border);background:var(--surface2);
                     color:var(--t3);cursor:pointer;font-size:12px;font-weight:600;
                     font-family:inherit;transition:all .15s;white-space:nowrap">
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

    // ── Per-test pass rate stats ────────────────────────────────
    const colStats = labelledCols.map((col, ci) => {
      let p = 0, f = 0, ab = 0, pend = 0, marksSum = 0, marksCount = 0, totalSum = 0;
      tableRows.forEach(row => {
        const cell = row.cols.find(c => c.col.id === col.id);
        if (!cell) return;
        if      (cell.status === 'pass')    p++;
        else if (cell.status === 'fail')    f++;
        else if (cell.status === 'absent')  ab++;
        else                                pend++;
        if (cell.marks != null && !cell.absent && cell.totalMarks) {
          marksSum += Number(cell.marks);
          totalSum += Number(cell.totalMarks);
          marksCount++;
        }
      });
      const appeared  = p + f;
      const rate      = appeared > 0 ? Math.round((p / appeared) * 100) : 0;
      const avg       = marksCount > 0 ? Math.round((marksSum / marksCount) * 10) / 10 : null;
      const avgPct    = marksCount > 0 ? Math.round((marksSum / totalSum) * 100) : null;
      const isDone    = (p + f + ab) > 0;

      // Pass rate color
      const color    = rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--yellow)' : appeared > 0 ? 'var(--red)' : 'var(--t4)';
      const colorHex = rate >= 80 ? '#16a34a'      : rate >= 60 ? '#d97706'       : appeared > 0 ? '#dc2626'    : '#94a3b8';

      // Health indicator based on avg score %
      const hlColor = avgPct == null ? 'var(--t3)'
                    : avgPct >= 80   ? 'var(--green)'
                    : avgPct >= 70   ? 'var(--yellow)'
                    : 'var(--red)';
      const hlBg    = avgPct == null ? 'var(--surface3)'
                    : avgPct >= 80   ? 'var(--green-dim)'
                    : avgPct >= 70   ? 'var(--yellow-dim)'
                    : 'var(--red-dim)';
      const hlLabel = avgPct == null ? 'No Data'
                    : avgPct >= 80   ? 'Healthy'
                    : avgPct >= 70   ? 'At Risk'
                    : 'Danger';
      const hlIcon  = avgPct == null ? '–'
                    : avgPct >= 80   ? '●'
                    : avgPct >= 70   ? '▲'
                    : '⚠';

      return { p, f, ab, pend, appeared, rate, avg, avgPct, isDone, color, colorHex, hlColor, hlBg, hlLabel, hlIcon };
    });

    // ── Build dynamic headers ──────────────────────────────────
    const FIXED = 3;

    let groupHeaderRow = `
      <tr class="rp-thead-group">
        <th class="rp-th-left" colspan="1">#</th>
        <th class="rp-th-left" colspan="1">Student ID</th>
        <th class="rp-th-left" colspan="1">Student Name</th>
        ${labelledCols.map((col, ci) => {
          const s = colStats[ci];
          return `
          <th colspan="4" class="${col.isMock ? 'rp-th-mock-group' : 'rp-th-test-group'}"
              style="vertical-align:bottom;padding-bottom:6px">
            <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
              <span style="font-size:11.5px;font-weight:800">${col.colLabel}</span>
              ${col.date ? `<span style="font-size:9.5px;font-weight:500;opacity:.7">${formatDate(col.date)}</span>` : ''}
              <!-- mini pass-rate bar -->
              <div style="width:100%;min-width:80px;margin-top:3px">
                <div style="display:flex;justify-content:space-between;align-items:center;
                             margin-bottom:2px;gap:4px">
                  <span style="font-size:9px;color:var(--t3);white-space:nowrap">
                    ✓${s.p} ✗${s.f}${s.ab ? ` ⊘${s.ab}` : ''}
                  </span>
                  <span style="font-size:10px;font-weight:800;color:${s.color};white-space:nowrap">
                    ${s.appeared > 0 ? s.rate + '%' : '—'}
                  </span>
                </div>
                <div style="height:4px;background:rgba(0,0,0,0.1);border-radius:2px;overflow:hidden">
                  <div style="height:100%;width:${s.rate}%;background:${s.color};border-radius:2px;transition:width .3s"></div>
                </div>
              </div>
            </div>
          </th>`;
        }).join('')}
      </tr>`;

    // ── Info bar above table ────────────────────────────────────
    const batchDisplayName = batchObj.batchName || batchNo;
    const infoBarHTML = `
      <div style="display:flex;align-items:center;gap:0;
                  background:var(--surface2);
                  border:1px solid var(--border);
                  border-bottom:none;
                  border-radius:12px 12px 0 0;
                  padding:9px 16px;overflow:hidden">
        <div style="display:flex;align-items:center;gap:7px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span style="font-size:13px;font-weight:700;color:var(--t1)">${campusName}</span>
        </div>
        <span style="margin:0 12px;color:var(--border2);font-size:16px;font-weight:300">|</span>
        <div style="display:flex;align-items:center;gap:7px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8"  y1="2" x2="8"  y2="6"/>
            <line x1="3"  y1="10" x2="21" y2="10"/>
          </svg>
          <span style="font-size:13px;font-weight:700;color:var(--blue)">${batchDisplayName}</span>
        </div>
      </div>`;

    let subHeaderRow = `
      <tr class="rp-thead-sub">
        <th></th>
        <th></th>
        <th></th>
        ${labelledCols.map(() => `
          <th class="rp-sub-sep">Marks</th>
          <th>Total</th>
          <th>Status</th>
          <th>Date</th>
        `).join('')}
      </tr>`;

    const bodyHTML = tableRows.map((row, ri) => `
      <tr>
        <td style="color:var(--t1);font-size:11.5px">${ri + 1}</td>
        <td style="font-size:12px;color:var(--t1)">${row.studentId}</td>
        <td style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px"
            title="${row.studentName}">${row.studentName}</td>
        ${row.cols.map(cell => {
          const perfBg = cell.status === 'pass'    ? 'var(--green-dim)'
                       : cell.status === 'fail'    ? 'var(--red-dim)'
                       : cell.status === 'absent'  ? 'var(--yellow-dim)'
                       : 'transparent';
          const perfColor = cell.status === 'pass'   ? 'var(--green)'
                          : cell.status === 'fail'   ? 'var(--red)'
                          : cell.status === 'absent' ? 'var(--yellow)'
                          : 'var(--t4)';
          const pct = (cell.marks != null && !cell.absent && cell.totalMarks)
            ? Math.round((Number(cell.marks) / Number(cell.totalMarks)) * 100)
            : null;
          const hlIcon  = pct == null ? '' : pct >= 80 ? '●' : pct >= 70 ? '▲' : '⚠';
          const hlLabel = pct == null ? '' : pct >= 80 ? 'Healthy' : pct >= 70 ? 'At Risk' : 'Danger';
          const hlColor = pct == null ? 'var(--t3)' : pct >= 80 ? 'var(--green)' : pct >= 70 ? 'var(--yellow)' : 'var(--red)';
          const hlBadge = pct != null
            ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:${hlColor}">${hlIcon} ${hlLabel}</span>`
            : '';
          const marksDisplay = cell.absent
            ? `<span style="font-weight:700;color:var(--yellow)">Ab</span>`
            : cell.marks != null
              ? `<div style="display:flex;flex-direction:column;gap:1px">
                   <span style="font-weight:700;font-family:var(--font-mono,monospace);color:${perfColor}">${cell.marks}</span>
                   ${hlBadge}
                 </div>`
              : `<span style="color:var(--t1)">—</span>`;
          return `
          <td class="rp-td-sep"
              style="white-space:nowrap;padding:8px 10px;vertical-align:middle">
            ${marksDisplay}
          </td>
          <td style="color:var(--t1);font-size:12px">${cell.totalMarks || '—'}</td>
          <td>${this._statusBadge(cell.status)}</td>
          <td style="font-size:11.5px;color:var(--t1);white-space:nowrap">${cell.col.date ? formatDate(cell.col.date) : '—'}</td>
        `}).join('')}
      </tr>
    `).join('');

    // ── Per-test stats strip HTML ───────────────────────────────
    const testStatsStripHTML = `
      <div class="rp-test-stats-strip">
        ${labelledCols.map((col, ci) => {
          const s = colStats[ci];
          return `
          <div class="rp-test-stat-card${col.isMock ? ' is-mock' : ''}">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:6px;margin-bottom:2px">
              <div>
                <div class="rp-test-stat-label${col.isMock ? ' is-mock' : ' is-test'}">${col.colLabel}</div>
                ${col.date ? `<div class="rp-test-stat-date">${formatDate(col.date)}</div>` : ''}
              </div>
              <span style="display:inline-flex;align-items:center;gap:3px;flex-shrink:0;
                           background:${s.hlBg};color:${s.hlColor};
                           padding:2px 7px;border-radius:20px;font-size:9.5px;font-weight:700;
                           white-space:nowrap">
                ${s.hlIcon} ${s.hlLabel}${s.avgPct != null ? ` (${s.avgPct}%)` : ''}
              </span>
            </div>
            <div class="rp-test-stat-counts" style="margin-bottom:6px">
              ${s.isDone
                ? `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--green-dim);color:var(--green);padding:1px 8px;border-radius:20px;font-size:10.5px;font-weight:700">✓ Done</span>`
                : `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--surface3);color:var(--t3);padding:1px 8px;border-radius:20px;font-size:10.5px;font-weight:700">· Pending</span>`
              }
              ${s.p    ? `<span class="rp-test-count-pill rp-tpill-pass">✓ ${s.p} Pass</span>`      : ''}
              ${s.f    ? `<span class="rp-test-count-pill rp-tpill-fail">✗ ${s.f} Fail</span>`      : ''}
              ${s.ab   ? `<span class="rp-test-count-pill rp-tpill-absent">⊘ ${s.ab} Absent</span>` : ''}
              ${s.pend ? `<span class="rp-test-count-pill rp-tpill-pend">· ${s.pend} Pending</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <span style="font-size:9.5px;color:var(--t3)">Avg Marks</span>
              <span style="font-size:11px;font-weight:800;color:var(--t2)">${s.avg != null ? s.avg : '—'}</span>
            </div>
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
                <span style="font-size:9.5px;color:var(--t3)">Pass Rate</span>
                <span class="rp-test-pct" style="color:${s.color}">${s.appeared > 0 ? s.rate + '%' : '—'}</span>
              </div>
              <div class="rp-test-stat-bar-wrap">
                <div class="rp-test-stat-bar" style="width:${s.rate}%;background:${s.color}"></div>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    area.innerHTML = statsHTML + testStatsStripHTML + infoBarHTML + `
      <div class="rp-table-wrap" style="border-top:none;border-radius:0 0 12px 12px;overflow-x:auto;width:100%;max-width:100%">
        <table class="rp-table" style="width:100%;table-layout:auto;min-width:unset">
          <thead>
            ${groupHeaderRow}
            ${subHeaderRow}
          </thead>
          <tbody>
            ${bodyHTML}
          </tbody>
        </table>
      </div>
    `;

    // Wire export buttons
    const _exportData = { tableRows, labelledCols, campusName, batchDisplayName, session, subjectCode,
                          passC, failC, absentC, pendingC, appearedC, passRate, colStats,
                          testsDone, testsPending, batchAvgPct, bpLabel, bpColor };
    area.querySelector('#rpExportCSV')?.addEventListener('click', () => this._exportCSV(_exportData));
    area.querySelector('#rpExportPDF')?.addEventListener('click', () => this._exportPDF(_exportData));

    // Hover styles on export buttons
    ['rpExportCSV','rpExportPDF'].forEach(id => {
      const btn = area.querySelector('#' + id);
      if (!btn) return;
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--blue)'; btn.style.color = 'var(--blue)'; btn.style.background = 'var(--blue-dim)'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--border)'; btn.style.color = 'var(--t3)'; btn.style.background = 'var(--surface2)'; });
    });
  },

  // ── Build flat rows for CSV/PDF export ──────────────────────
  _buildExportRows({ tableRows, labelledCols }) {
    const rows = [];
    tableRows.forEach(row => {
      labelledCols.forEach((col, ci) => {
        const cell = row.cols[ci];
        rows.push({
          'Student':    row.studentName  || '—',
          'Student ID': row.studentId    || '—',
          'Test':       col.colLabel     || '—',
          'Date':       col.date ? formatDate(col.date) : '—',
          'Marks':      cell.marks != null ? String(cell.marks) : (cell.absent ? 'Absent' : '—'),
          'Total':      cell.totalMarks  != null ? String(cell.totalMarks) : '—',
          'Status':     cell.status === 'pass'   ? 'Pass'
                      : cell.status === 'fail'   ? 'Fail'
                      : cell.status === 'absent' ? 'Absent' : 'Pending',
        });
      });
    });
    return rows;
  },

  // ── Export CSV ───────────────────────────────────────────────
  _exportCSV(d) {
    const data    = this._buildExportRows(d);
    if (!data.length) { alert('No results to export.'); return; }
    const headers = Object.keys(data[0]);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const metaLines = [
      `Result Profile Report`,
      `Generated: ${dateStr} ${timeStr}`,
      `Campus: ${d.campusName}  |  Batch: ${d.batchDisplayName}`,
      `Total Students: ${d.tableRows.length}  |  Tests: ${d.labelledCols.length}`,
      `Tests Done: ${d.testsDone}  |  Tests Pending: ${d.testsPending}`,
      `Pass: ${d.passC}  Fail: ${d.failC}  Absent: ${d.absentC}  Pending: ${d.pendingC}  Pass Rate: ${d.passRate}%`,
      `Batch Performance: ${d.bpLabel}${d.batchAvgPct != null ? ` (${d.batchAvgPct}%)` : ''}`,
      '',
    ].join('\n');

    const csvRows = [
      metaLines,
      headers.join(','),
      ...data.map(r => headers.map(h => `"${(r[h]||'').replace(/"/g,'""')}"`).join(',')),
    ];

    const blob = new Blob([csvRows.join('\n')], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Result-Profile-${d.batchDisplayName}-${dateStr.replace(/ /g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Export PDF ───────────────────────────────────────────────
  _exportPDF(d) {
    if (!d.tableRows.length) { alert('No results to export.'); return; }
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const prColor = d.passRate >= 80 ? '#16a34a' : d.passRate >= 60 ? '#d97706' : '#dc2626';

    // Rebuild colStats with PDF-safe hex values (no CSS vars)
    const pdfColStats = d.colStats.map(s => ({
      ...s,
      hlBg:    s.avgPct == null ? '#f1f5f9' : s.avgPct >= 80 ? '#dcfce7' : s.avgPct >= 70 ? '#fef9c3' : '#fee2e2',
      hlColor: s.avgPct == null ? '#64748b' : s.avgPct >= 80 ? '#15803d' : s.avgPct >= 70 ? '#b45309' : '#b91c1c',
    }));

    // ── Per-test stats cards ────────────────────────────────────
    const testStatCards = d.labelledCols.map((col, ci) => {
      const s         = pdfColStats[ci];
      const bgColor   = col.isMock ? '#f5f3ff' : '#eff6ff';
      const nameColor = col.isMock ? '#6d28d9' : '#1d4ed8';
      const doneBadge = s.isDone
        ? `<span style="background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700">✓ Done</span>`
        : `<span style="background:#f1f5f9;color:#64748b;padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700">· Pending</span>`;
      const healthBadge = `<span style="background:${s.hlBg};color:${s.hlColor};padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700">${s.hlIcon} ${s.hlLabel}${s.avgPct != null ? ` (${s.avgPct}%)` : ''}</span>`;
      const pills = [
        s.p    ? `<span style="background:#dcfce7;color:#15803d;padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700">✓ ${s.p} Pass</span>`    : '',
        s.f    ? `<span style="background:#fee2e2;color:#b91c1c;padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700">✗ ${s.f} Fail</span>`    : '',
        s.ab   ? `<span style="background:#fef9c3;color:#b45309;padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700">⊘ ${s.ab} Absent</span>` : '',
        s.pend ? `<span style="background:#f1f5f9;color:#64748b;padding:1px 6px;border-radius:20px;font-size:8px;font-weight:700">· ${s.pend} Pending</span>` : '',
      ].filter(Boolean).join(' ');
      return `<td style="text-align:left;padding:7px 10px;border-right:1px solid #e2e8f0;background:${bgColor};vertical-align:top;min-width:130px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px">
          <div style="font-weight:700;font-size:11px;color:${nameColor}">${col.colLabel}</div>
          ${healthBadge}
        </div>
        ${col.date ? `<div style="font-size:8.5px;color:#64748b;margin-bottom:4px">${formatDate(col.date)}</div>` : '<div style="margin-bottom:4px"></div>'}
        <div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:5px">
          ${doneBadge}
          ${pills}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
          <span style="font-size:8px;color:#64748b">Avg Marks</span>
          <span style="font-size:10px;font-weight:700;color:#1e293b">${s.avg != null ? s.avg : '—'}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
          <span style="font-size:8px;color:#64748b">Pass Rate</span>
          <span style="font-size:10px;font-weight:700;color:${s.colorHex}">${s.appeared > 0 ? s.rate + '%' : '—'}</span>
        </div>
        <div style="width:100%;height:4px;background:#e2e8f0;border-radius:2px;overflow:hidden">
          <div style="height:100%;width:${s.rate}%;background:${s.colorHex};border-radius:2px"></div>
        </div>
      </td>`;
    }).join('');

    // ── Grouped table headers ───────────────────────────────────
    const groupThs = d.labelledCols.map(col => {
      const bg    = col.isMock ? '#ede9fe' : '#dbeafe';
      const color = col.isMock ? '#5b21b6' : '#1e40af';
      return `<th colspan="4" style="text-align:center;background:${bg};color:${color};
                font-size:9px;font-weight:700;padding:5px 8px;
                border-left:2px solid ${col.isMock ? '#c4b5fd' : '#93c5fd'};
                white-space:nowrap">
        ${col.colLabel}${col.date ? `<br><span style="font-weight:500;font-size:8px;opacity:.8">${formatDate(col.date)}</span>` : ''}
      </th>`;
    }).join('');

    const subThs = d.labelledCols.map(col => {
      const bc = col.isMock ? '#c4b5fd' : '#93c5fd';
      return `<th style="border-left:2px solid ${bc}">Marks</th><th>Total</th><th>Status</th><th>Date</th>`;
    }).join('');

    const bodyRows = d.tableRows.map((row, ri) => {
      const cells = d.labelledCols.map((col, ci) => {
        const cell = row.cols[ci];
        if (!cell) return `<td style="border-left:2px solid #e2e8f0">—</td><td>—</td><td>—</td><td>—</td>`;
        const sc = { pass:'#16a34a', fail:'#dc2626', absent:'#d97706', pending:'#64748b' };
        const sb = { pass:'#f0fdf4', fail:'#fef2f2', absent:'#fffbeb', pending:'#f8fafc' };
        const bg  = sb[cell.status] || '#f8fafc';
        const bc  = col.isMock ? '#c4b5fd' : '#93c5fd';
        const pct = (cell.marks != null && !cell.absent && cell.totalMarks)
          ? Math.round((Number(cell.marks) / Number(cell.totalMarks)) * 100) : null;
        const hlIcon  = pct == null ? '' : pct >= 80 ? '●' : pct >= 70 ? '▲' : '⚠';
        const hlLabel = pct == null ? '' : pct >= 80 ? 'Healthy' : pct >= 70 ? 'At Risk' : 'Danger';
        const hlHex   = pct == null ? '#64748b' : pct >= 80 ? '#16a34a' : pct >= 70 ? '#d97706' : '#dc2626';
        const marksCell = cell.absent
          ? `<span style="color:#d97706;font-weight:700">Ab</span>`
          : cell.marks != null
            ? `<strong style="color:${sc[cell.status]||'#64748b'}">${cell.marks}</strong><br><span style="font-size:8px;font-weight:700;color:${hlHex}">${hlIcon} ${hlLabel}</span>`
            : '—';
        const statusBadge = `<span style="color:${sc[cell.status]||'#64748b'};background:${bg};padding:1px 7px;border-radius:20px;font-size:8px;font-weight:700;white-space:nowrap">${cell.status==='pass'?'Pass':cell.status==='fail'?'Fail':cell.status==='absent'?'Absent':'Pending'}</span>`;
        return `<td style="border-left:2px solid ${bc};background:${bg}">${marksCell}</td><td style="color:#64748b;background:${bg}">${cell.totalMarks||'—'}</td><td style="background:${bg}">${statusBadge}</td><td style="color:#64748b;white-space:nowrap">${col.date ? formatDate(col.date) : '—'}</td>`;
      }).join('');
      return `<tr class="${ri%2===0?'even':'odd'}">
        <td style="color:#94a3b8">${ri+1}</td>
        <td style="font-family:monospace;color:#64748b;font-size:8.5px">${row.studentId}</td>
        <td style="font-weight:600;white-space:nowrap">${row.studentName}</td>
        ${cells}
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Result Profile — ${d.batchDisplayName}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:16px 18px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:10px;margin-bottom:10px}
  .header .title{font-size:17px;font-weight:700;color:#1e40af}
  .header .sub{font-size:10px;color:#64748b;margin-top:2px}
  .header .right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
  .meta-bar{display:flex;align-items:center;gap:12px;padding:6px 12px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:9px;font-size:10px;color:#1e40af;font-weight:600}
  .stats-row{display:flex;align-items:stretch;gap:0;margin-bottom:9px;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
  .s-box{flex:1;padding:6px 10px;text-align:center;border-right:1px solid #e2e8f0;background:#f8fafc}
  .s-box:last-child{border-right:none}
  .s-box .num{font-size:15px;font-weight:700;color:#1e293b}
  .s-box .lbl{font-size:8px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:1px}
  .s-box.pass .num{color:#16a34a}.s-box.pass{background:#f0fdf4}
  .s-box.fail .num{color:#dc2626}.s-box.fail{background:#fef2f2}
  .s-box.absent .num{color:#d97706}.s-box.absent{background:#fffbeb}
  .r-box{flex:1.5;padding:6px 12px;text-align:center;border-right:1px solid #e2e8f0}
  .test-stats-row{width:100%;border-collapse:collapse;margin-bottom:9px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden}
  .test-stats-row td:last-child{border-right:none}
  table.main{width:100%;border-collapse:collapse;font-size:8.5px}
  table.main thead tr.g-row th{background:#1e40af;color:#fff;font-weight:700;padding:5px 7px;text-align:center;font-size:8.5px;white-space:nowrap}
  table.main thead tr.g-row th.left-col{text-align:left;background:#1e40af}
  table.main thead tr.s-row th{background:#1e3a8a;color:#93c5fd;font-size:7.5px;font-weight:600;padding:4px 7px;text-transform:uppercase;letter-spacing:.4px;text-align:left;white-space:nowrap}
  table.main tbody tr.even{background:#fff}table.main tbody tr.odd{background:#f8faff}
  table.main tbody td{padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:middle;color:#334155}
  .footer{margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:8.5px;color:#94a3b8}
  @media print{body{padding:8px 10px}@page{size:A4 landscape;margin:6mm}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div><div class="title">Result Profile Report</div><div class="sub">Test-wise student performance breakdown</div></div>
    <div class="right"><strong style="color:#1e293b">${dateStr}</strong><div>${timeStr}</div></div>
  </div>
  <div class="meta-bar">🏠 ${d.campusName} <span style="color:#bfdbfe">|</span> 📅 ${d.batchDisplayName}</div>
  <div class="stats-row">
    <!-- Students -->
    <div class="s-box">
      <div class="num">${d.tableRows.length}</div>
      <div class="lbl">Students</div>
    </div>
    <!-- Tests -->
    <div class="s-box">
      <div class="num">${d.labelledCols.length}</div>
      <div class="lbl">Tests</div>
    </div>
    <!-- Tests Done: Done + Pending as pills, same as screen -->
    <div class="s-box" style="align-items:flex-start;padding-left:12px;gap:5px">
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
        ${d.testsDone > 0 ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700">✓ ${d.testsDone} Done</span>` : ''}
        ${d.testsPending > 0 ? `<span style="display:inline-flex;align-items:center;gap:3px;background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:700">· ${d.testsPending} Pending</span>` : ''}
      </div>
      <div style="font-size:7.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Tests Done</div>
    </div>
    <!-- Batch Performance badge, same as screen -->
    <div class="s-box" style="align-items:flex-start;padding-left:12px;gap:5px;border-right:none">
      <div style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;
                  background:${d.batchAvgPct==null?'#f1f5f9':d.batchAvgPct>=80?'#dcfce7':d.batchAvgPct>=70?'#fef9c3':'#fee2e2'};
                  color:${d.batchAvgPct==null?'#64748b':d.batchAvgPct>=80?'#15803d':d.batchAvgPct>=70?'#b45309':'#b91c1c'};
                  font-size:10px;font-weight:800">
        ${d.batchAvgPct==null?'–':d.batchAvgPct>=80?'●':d.batchAvgPct>=70?'▲':'⚠'}
        ${d.bpLabel}${d.batchAvgPct != null ? ` (${d.batchAvgPct}%)` : ''}
      </div>
      <div style="font-size:7.5px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;margin-top:2px">Batch Performance</div>
    </div>
  </div>
  <table class="test-stats-row"><tr>${testStatCards}</tr></table>
  <table class="main">
    <thead>
      <tr class="g-row">
        <th class="left-col">#</th>
        <th class="left-col">Student ID</th>
        <th class="left-col">Student Name</th>
        ${groupThs}
      </tr>
      <tr class="s-row">
        <th></th><th></th><th></th>
        ${subThs}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">
    <span>Result Profile &nbsp;|&nbsp; ${d.batchDisplayName} &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>${d.tableRows.length} student${d.tableRows.length!==1?'s':''} · ${d.labelledCols.length} test${d.labelledCols.length!==1?'s':''}</span>
  </div>
  <div style="margin-top:8px;text-align:center;font-size:8.5px;color:#94a3b8">Powered by <strong style="color:#2563eb">Learnomist</strong></div>
  <div class="no-print" style="margin-top:14px;text-align:center">
    <button onclick="window.print()" style="padding:7px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">Print / Save as PDF</button>
  </div>
</body></html>`;

    const w = window.open('', '_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(() => w.print(), 600);
  },

  _statusBadge(status) {
    const map = {
      pass:    ['Pass',    'rp-badge-pass'],
      fail:    ['Fail',    'rp-badge-fail'],
      absent:  ['Absent',  'rp-badge-absent'],
      pending: ['Pending', 'rp-badge-pending'],
    };
    const [label, cls] = map[status] || ['—', 'rp-badge-pending'];
    return `<span class="rp-badge ${cls}">${label}</span>`;
  },
};