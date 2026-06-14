// ============================================================
// modules/analytics/reports/testResults/testResultSummary.js
// Report: Test Result Summary
// — Same collapsible filter bar as Result Profile
// — Table rows = one per batch (within filter scope)
//   Fixed cols: Batch Name | Teacher
//   Dynamic cols: Test 1 … Test N  (each = merge cell with
//     Pass | Fail | Absent | Avg Marks | Pass Rate | Health)
// ============================================================

import { AppState }         from '../../../../utils/state.js';
import { getAllAssignments } from '../../../lecturePlan/lecturePlanService.js';
import { getSchedules, formatDate } from '../../../testing/testingService.js';

// ── Data helpers ────────────────────────────────────────────
function _getResults()    { return AppState.get('testResults') || []; }
function _getCampuses()   { return AppState.get('campuses')    || []; }
function _getBatches()    { return AppState.get('batches')     || []; }
function _getSubjects()   { return AppState.get('subjects')    || []; }
function _getEnrolments() { return AppState.get('enrolments')  || []; }

function _getTeacherName(batch) {
  const tid = batch.lecturerId || batch.teacherId || batch.instructorId || '';
  if (!tid) return '—';
  const pool = AppState.get('lecturers') || AppState.get('teachers') || AppState.get('instructors') || [];
  const t = pool.find(x => x.id === tid);
  if (!t) return '—';
  return t.name || t.fullName || `${t.firstName||''} ${t.lastName||''}`.trim() || '—';
}

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
function _getSessions(subjectId = '') {
  const set = new Set();
  _getBatches().forEach(b => {
    if (subjectId && b.subjectId !== subjectId) return;
    if (b.sessionPeriod) set.add(b.sessionPeriod);
  });
  return [...set].sort();
}
function _getSubjectsFor({ disciplineId, levelId } = {}) {
  const allSubjects = _getSubjects();
  const allLevels   = AppState.get('levels') || [];
  return allSubjects.filter(s => {
    if (!disciplineId) return true;
    if (levelId) {
      const lv = allLevels.find(l => l.id === levelId);
      return lv ? (lv.subjectIds?.includes(s.id) || s.levelId === levelId || s.disciplineId === disciplineId) : s.disciplineId === disciplineId;
    }
    return s.disciplineId === disciplineId;
  });
}
function _getBatchesFor({ disciplineId, levelId, subjectId, sessionId, campusId } = {}) {
  return _getBatches().filter(b => {
    if (disciplineId && b.disciplineId !== disciplineId) return false;
    if (levelId      && b.levelId      !== levelId)      return false;
    if (subjectId    && b.subjectId    !== subjectId)     return false;
    if (sessionId    && b.sessionPeriod !== sessionId)    return false;
    if (campusId     && b.campusId     !== campusId)      return false;
    return true;
  });
}

// ── LP test types ───────────────────────────────────────────
const LP_TEST_TYPES = new Set(['test', 'midterm', 'mock']);

function _normType(t) {
  t = (t || '').toLowerCase();
  if (t === 'midterm') return 'midterm';
  if (t === 'mock')    return 'mock';
  return 'written';
}

function _buildEntries({ subjectId, batchId } = {}) {
  const entries = [];
  const assignments = getAllAssignments();
  for (const [bid, lpa] of Object.entries(assignments)) {
    if (batchId && bid !== batchId) continue;
    if (!lpa?.rows?.length) continue;
    lpa.rows.forEach(row => {
      const rowType = (row.type || '').toLowerCase();
      if (!LP_TEST_TYPES.has(rowType)) return;
      if (!row.date) return;
      const rawTopic = (row.topic || '').trim();
      if (subjectId && row.subjectId && row.subjectId !== subjectId) return;
      entries.push({
        id:           `lp__${bid}__${row.id}`,
        date:         row.date,
        testName:     rawTopic || (rowType === 'mock' ? 'Mock Exam' : rowType === 'midterm' ? 'Midterm' : 'Test'),
        testType:     _normType(rowType),
        batchId:      bid,
        subjectId:    row.subjectId || subjectId || '',
        totalMarks:   row.totalMarks   || '',
        passingMarks: row.passingMarks || '',
      });
    });
  }
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

// ── Retest stubs from testResults ──────────────────────────
function _getRetestEntries() {
  const all = AppState.get('testResults') || [];
  const map = {};
  all.forEach(r => {
    if (!r.isRetest || !r.retestOf || !r.retestIndex) return;
    const key = `${r.retestOf}__${r.retestIndex}`;
    if (!map[key]) {
      map[key] = {
        id:              `retest__${r.retestOf}__${r.retestIndex}`,
        retestOf:        r.retestOf,
        retestIndex:     r.retestIndex,
        date:            r.retestDate || '',
        scheduleEntryId: r.scheduleEntryId,
        isRetest:        true,
        testType:        r.testType || 'written',
        totalMarks:      r.totalMarks   || '',
        passingMarks:    r.passingMarks || '',
        batchId:         r.batchId || '',
      };
    }
  });
  return Object.values(map);
}

// ── Group entries with their retests ───────────────────────
function _groupEntriesWithRetests(entries, retests) {
  const originals = entries.filter(e => !e.isRetest);
  let testIdx = 0, mockIdx = 0;
  const totalMocks = originals.filter(o => o.testType === 'mock').length;
  return originals.map(orig => {
    const isMock = orig.testType === 'mock';
    if (isMock) mockIdx++; else testIdx++;
    const groupLabel = isMock
      ? (totalMocks === 1 ? 'Mock' : `Mock ${mockIdx}`)
      : `Test ${testIdx}`;
    const myRetests = (retests || [])
      .filter(r => r.retestOf === orig.id)
      .sort((a, b) => (a.retestIndex || 0) - (b.retestIndex || 0));
    return { groupLabel, isMock, original: orig, retests: myRetests };
  });
}

// ── Resolve cell from a result record ──────────────────────
function _resolveCell(r, entry) {
  const effectiveTotalMarks   = r?.totalMarks   || entry.totalMarks   || null;
  const effectivePassingMarks = r?.passingMarks || entry.passingMarks ||
    (effectiveTotalMarks ? Math.ceil(Number(effectiveTotalMarks) * 0.5) : null);
  const marks  = r ? r.marks  : null;
  const absent = r ? !!r.absent : false;
  const status = absent        ? 'absent'
               : marks == null ? 'pending'
               : (effectivePassingMarks && Number(marks) >= Number(effectivePassingMarks)) ? 'pass'
               : 'fail';
  return { marks, absent, status, totalMarks: effectiveTotalMarks, hasRecord: !!r };
}

// ── Effective cell (latest attempt with a record) ──────────
function _effectiveCell(cells) {
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].hasRecord) return cells[i];
  }
  return cells[0];
}

// ── Health label/icon/color from avgPct ────────────────────
function _health(avgPct) {
  if (avgPct == null) return { label: 'No Data', icon: '–', color: 'var(--t3)', bg: 'var(--surface3)', hex: '#94a3b8' };
  if (avgPct >= 80) return { label: 'Healthy', icon: '●', color: 'var(--green)',  bg: 'var(--green-dim)',  hex: '#16a34a' };
  if (avgPct >= 70) return { label: 'At Risk', icon: '▲', color: 'var(--yellow)', bg: 'var(--yellow-dim)', hex: '#d97706' };
  return               { label: 'Danger',  icon: '⚠', color: 'var(--red)',    bg: 'var(--red-dim)',    hex: '#dc2626' };
}
function _rateColor(rate, appeared) {
  return rate >= 80 ? 'var(--green)' : rate >= 60 ? 'var(--yellow)' : appeared > 0 ? 'var(--red)' : 'var(--t4)';
}

// ── Styles ──────────────────────────────────────────────────
let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const st = document.createElement('style');
  st.textContent = `
/* ── TRS page ── */
.trs-page { display:flex; flex-direction:column; gap:16px; }

/* ── Reuse rp-filter styles (already injected by resultProfile) ── */
/* ── TRS table wrapper ── */
.trs-table-wrap {
  border:1px solid var(--border);
  border-radius:12px;
  overflow:hidden;
}
.trs-table-scroll { overflow-x:auto; width:100%; }

.trs-table {
  width:100%; border-collapse:collapse;
  font-size:12.5px; color:var(--t1);
  min-width:600px;
}
.trs-table th {
  background:var(--surface2);
  font-size:11px; font-weight:700;
  color:var(--t2);
  padding:10px 12px;
  text-align:center;
  border-bottom:1px solid var(--border);
  white-space:nowrap;
}
.trs-table th.trs-th-left { text-align:left; }
.trs-table td {
  padding:10px 12px;
  border-bottom:1px solid var(--border);
  vertical-align:middle;
  text-align:center;
}
.trs-table td.trs-td-left { text-align:left; }
.trs-table tbody tr:last-child td { border-bottom:none; }
.trs-table tbody tr:hover { background:var(--surface2); }

/* ── Test group header ── */
.trs-th-test {
  background: color-mix(in srgb, var(--blue) 8%, var(--surface2));
  color: var(--blue) !important;
  border-left: 2px solid color-mix(in srgb, var(--blue) 30%, transparent);
}
.trs-th-mock {
  background: color-mix(in srgb, var(--violet,#8b5cf6) 8%, var(--surface2));
  color: var(--violet,#8b5cf6) !important;
  border-left: 2px solid color-mix(in srgb, var(--violet,#8b5cf6) 30%, transparent);
}
.trs-td-test-sep { border-left: 2px solid color-mix(in srgb, var(--blue) 25%, transparent); }
.trs-td-mock-sep { border-left: 2px solid color-mix(in srgb, var(--violet,#8b5cf6) 25%, transparent); }

/* ── Sub-header row ── */
.trs-thead-sub th {
  font-size:10px; font-weight:700;
  color:var(--t3);
  background:var(--surface3);
  padding:5px 10px;
  border-bottom:1px solid var(--border);
}

/* ── Stat pill ── */
.trs-pill {
  display:inline-flex; align-items:center; gap:3px;
  padding:2px 7px; border-radius:20px;
  font-size:10px; font-weight:700;
  white-space:nowrap;
}

/* ── Empty state ── */
.trs-empty {
  display:flex; flex-direction:column; align-items:center;
  gap:10px; padding:60px 20px; color:var(--t3);
  font-size:13px; text-align:center;
}
.trs-empty p { font-weight:700; color:var(--t2); margin:0; }
.trs-empty span { font-size:12px; color:var(--t3); }

/* ── Info bar ── */
.trs-info-bar {
  display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  padding:9px 16px;
  background:var(--surface2);
  border:1px solid var(--border);
  border-bottom:none;
  border-radius:12px 12px 0 0;
}
`;
  document.head.appendChild(st);
}

// ── Main Export ─────────────────────────────────────────────
export const TestResultSummary = {

  _container:     null,
  _filterOpen:    false,
  _selCampus:     '',
  _selDiscipline: '',
  _selLevel:      '',
  _selSession:    '',
  _selSubject:    '',
  _selBatch:      '',
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

  // ── Full render ──────────────────────────────────────────
  _render() {
    const c = this._container;
    c.innerHTML = `
      <div class="trs-page">
        <div class="rp-filter-card" id="trsFilterCard">
          ${this._filterToggleHTML()}
          <div class="rp-filter-body ${this._filterOpen ? 'open' : ''}" id="trsFilterBody">
            ${this._filterBodyHTML()}
          </div>
        </div>
        <div id="trsTableArea"></div>
      </div>
    `;
    this._attachFilterEvents(c);
    this._renderTable(c);
  },

  // ── Filter toggle ────────────────────────────────────────
  _filterToggleHTML() {
    const count = this._activeFilterCount();
    return `
      <button class="rp-filter-toggle" id="trsFilterToggle">
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

  // ── Filter body ──────────────────────────────────────────
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

    const campusOpts     = campuses.map(c    => ({ value: c.id, label: (c.campusName||'').replace(/\s*campus$/i,'').trim() }));
    const disciplineOpts = disciplines.map(d => ({ value: d.id, label: d.abbreviation ? `${d.abbreviation} — ${d.fullName}` : (d.fullName || d.name || d.id) }));
    const levelOpts      = levels.map(l     => ({ value: l.id, label: l.levelName || l.name || l.id }));
    const sessionOpts    = sessions.map(s   => ({ value: s,    label: s }));
    const subjectOpts    = subjects.map(s   => ({ value: s.id, label: `${s.subjectCode||''} — ${s.subjectName||''}`.replace(/^—\s*/,'').trim() }));
    const batchOpts      = batches.map(b    => ({ value: b.id, label: b.batchName || `Batch ${b.batchNo || b.id}` }));

    const chips = this._appliedChipsHTML();

    return `
      <div class="rp-filter-row">
        ${sel('trsSelCampus',     'Campus',     campusOpts,     this._selCampus)}
        ${sel('trsSelDiscipline', 'Discipline', disciplineOpts, this._selDiscipline, !this._selCampus)}
        ${sel('trsSelLevel',      'Level',      levelOpts,      this._selLevel,      !this._selDiscipline)}
        ${sel('trsSelSession',    'Session',    sessionOpts,    this._selSession,    !this._selLevel)}
        ${sel('trsSelSubject',    'Subject',    subjectOpts,    this._selSubject,    !this._selSession)}
        ${sel('trsSelBatch',      'Batch #',    batchOpts,      this._selBatch,      !this._selSubject)}
      </div>
      <div class="rp-filter-actions">
        <button class="rp-filter-apply" id="trsApplyBtn">Apply Filter</button>
        <button class="rp-filter-clear"  id="trsClearBtn">Clear</button>
        ${chips ? `<div class="rp-chip-row">${chips}</div>` : ''}
      </div>
    `;
  },

  _appliedChipsHTML() {
    const f = this._appliedFilter;
    if (!f) return '';
    const make = (label, color) => `
      <span class="rp-chip" style="background:color-mix(in srgb,${color} 15%,transparent);color:${color};border-color:${color}">${label}</span>`;
    const chips = [];
    if (f.campus)     chips.push(make((_getCampuses().find(c=>c.id===f.campus)?.campusName||f.campus).replace(/\s*campus$/i,'').trim(), 'var(--blue)'));
    if (f.discipline) { const d = _getDisciplines().find(d=>d.id===f.discipline); chips.push(make(d ? (d.abbreviation||d.fullName) : f.discipline, 'var(--violet,#8b5cf6)')); }
    if (f.level)      { const l = _getLevels().find(l=>l.id===f.level); chips.push(make(l ? (l.levelName||l.name||f.level) : f.level, 'var(--cyan)')); }
    if (f.session)    chips.push(make(f.session, 'var(--green)'));
    if (f.subject)    { const s = _getSubjects().find(s=>s.id===f.subject); chips.push(make(s ? (s.subjectCode||s.subjectName) : f.subject, 'var(--orange,#f59e0b)')); }
    if (f.batch)      { const b = _getBatches().find(b=>b.id===f.batch); chips.push(make(b?.batchName||f.batch, 'var(--yellow)')); }
    return chips.join('');
  },

  // ── Filter events ────────────────────────────────────────
  _attachFilterEvents(c) {
    const onToggle = () => {
      this._filterOpen = !this._filterOpen;
      c.querySelector('#trsFilterBody')?.classList.toggle('open', this._filterOpen);
      c.querySelector('.rp-filter-arrow')?.classList.toggle('open', this._filterOpen);
    };
    c.querySelector('#trsFilterToggle')?.addEventListener('click', onToggle);
    this._bindCascade(c);

    const doApply = () => {
      this._appliedFilter = {
        campus:     this._selCampus,
        discipline: this._selDiscipline,
        level:      this._selLevel,
        session:    this._selSession,
        subject:    this._selSubject,
        batch:      this._selBatch,
      };
      this._filterOpen = false;
      c.querySelector('#trsFilterBody')?.classList.remove('open');
      c.querySelector('.rp-filter-arrow')?.classList.remove('open');
      this._rerenderFilterToggle(c);
      this._renderTable(c);
      this._rerenderFilterBody(c);
    };
    const doClear = () => {
      this._selCampus = this._selDiscipline = this._selLevel =
        this._selSession = this._selSubject = this._selBatch = '';
      this._appliedFilter = null;
      this._rerenderFilterBody(c);
      this._renderTable(c);
      this._rerenderFilterToggle(c);
    };
    c.querySelector('#trsApplyBtn')?.addEventListener('click', doApply);
    c.querySelector('#trsClearBtn')?.addEventListener('click', doClear);
  },

  _bindCascade(c) {
    const reset = (...keys) => keys.forEach(k => (this[k] = ''));
    c.querySelector('#trsSelCampus')    ?.addEventListener('change', e => { this._selCampus = e.target.value; reset('_selDiscipline','_selLevel','_selSession','_selSubject','_selBatch'); this._rerenderFilterBody(c); });
    c.querySelector('#trsSelDiscipline')?.addEventListener('change', e => { this._selDiscipline = e.target.value; reset('_selLevel','_selSession','_selSubject','_selBatch'); this._rerenderFilterBody(c); });
    c.querySelector('#trsSelLevel')     ?.addEventListener('change', e => { this._selLevel = e.target.value; reset('_selSession','_selSubject','_selBatch'); this._rerenderFilterBody(c); });
    c.querySelector('#trsSelSession')   ?.addEventListener('change', e => { this._selSession = e.target.value; reset('_selSubject','_selBatch'); this._rerenderFilterBody(c); });
    c.querySelector('#trsSelSubject')   ?.addEventListener('change', e => { this._selSubject = e.target.value; reset('_selBatch'); this._rerenderFilterBody(c); });
    c.querySelector('#trsSelBatch')     ?.addEventListener('change', e => { this._selBatch = e.target.value; });
  },

  _rerenderFilterBody(c) {
    const body = c.querySelector('#trsFilterBody');
    if (!body) return;
    body.innerHTML = this._filterBodyHTML();
    this._bindCascade(c);

    body.querySelector('#trsApplyBtn')?.addEventListener('click', () => {
      this._appliedFilter = {
        campus:     this._selCampus,
        discipline: this._selDiscipline,
        level:      this._selLevel,
        session:    this._selSession,
        subject:    this._selSubject,
        batch:      this._selBatch,
      };
      this._filterOpen = false;
      body.classList.remove('open');
      c.querySelector('.rp-filter-arrow')?.classList.remove('open');
      this._rerenderFilterToggle(c);
      this._renderTable(c);
    });

    body.querySelector('#trsClearBtn')?.addEventListener('click', () => {
      this._selCampus = this._selDiscipline = this._selLevel =
        this._selSession = this._selSubject = this._selBatch = '';
      this._appliedFilter = null;
      this._rerenderFilterToggle(c);
      this._rerenderFilterBody(c);
      this._renderTable(c);
    });
  },

  _rerenderFilterToggle(c) {
    const old = c.querySelector('#trsFilterToggle');
    if (!old) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = this._filterToggleHTML();
    const newBtn = wrap.firstElementChild;
    old.replaceWith(newBtn);
    newBtn.addEventListener('click', () => {
      this._filterOpen = !this._filterOpen;
      c.querySelector('#trsFilterBody')?.classList.toggle('open', this._filterOpen);
      newBtn.querySelector('.rp-filter-arrow')?.classList.toggle('open', this._filterOpen);
    });
  },

  // ── Table render ─────────────────────────────────────────
  _renderTable(c) {
    const area = c.querySelector('#trsTableArea');
    if (!area) return;

    if (!this._appliedFilter ||
        !Object.values(this._appliedFilter).some(v => v)) {
      area.innerHTML = `
        <div class="trs-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <p>Select a filter to view summary</p>
          <span>Use "Select Filter" above to choose campus, subject and batch.</span>
        </div>`;
      return;
    }

    const f = this._appliedFilter;

    // ── Collect matching batches ─────────────────────────────
    const allBatches = _getBatchesFor({
      disciplineId: f.discipline,
      levelId:      f.level,
      subjectId:    f.subject,
      sessionId:    f.session,
      campusId:     f.campus,
    }).filter(b => !f.batch || b.id === f.batch);

    if (!allBatches.length) {
      area.innerHTML = `
        <div class="trs-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
          </svg>
          <p>No batches found</p>
          <span>No batches match the selected filter.</span>
        </div>`;
      return;
    }

    // ── Get shared subject for resolved subjectId ────────────
    const resolvedSubjectId = f.subject || allBatches[0]?.subjectId || '';
    const allResults = _getResults();

    // resultsMap: scheduleEntryId → studentId → record
    const resultsMap = {};
    allResults.forEach(r => {
      if (!resultsMap[r.scheduleEntryId]) resultsMap[r.scheduleEntryId] = {};
      resultsMap[r.scheduleEntryId][r.studentId] = r;
    });

    // ── Build test groups per batch ──────────────────────────
    // We need a UNIFIED set of test groups across all batches so
    // columns line up. Strategy: collect all group labels from all
    // batches and union them.
    const batchDataMap = {}; // batchId → { batch, entries, testGroups, testGroupStats }

    allBatches.forEach(batch => {
      const batchSubjectId = f.subject || batch.subjectId || '';
      const entries = _buildEntries({ subjectId: batchSubjectId, batchId: batch.id });
      const retests = _getRetestEntries().filter(r => r.batchId === batch.id || entries.some(e => e.id === r.retestOf));
      const allEntries = [...entries, ...retests].sort((a, b) => (a.date||'').localeCompare(b.date||''));
      const testGroups = _groupEntriesWithRetests(allEntries, retests);

      // Enrolled students for this batch
      const enrols   = _getEnrolments().filter(e => e.batchId === batch.id);
      const studentIds = [...new Set(enrols.map(e => e.studentId))];

      // Per-group effective stats
      const groupStats = testGroups.map(group => {
        let p = 0, f2 = 0, ab = 0, pend = 0;
        let marksSum = 0, marksCount = 0, totalSum = 0;

        studentIds.forEach(sid => {
          const allAttempts = [group.original, ...group.retests].map(entry => {
            const r = (resultsMap[entry.id] || {})[sid] || null;
            return _resolveCell(r, entry);
          });
          const eff = _effectiveCell(allAttempts);
          if      (eff.status === 'pass')   p++;
          else if (eff.status === 'fail')   f2++;
          else if (eff.status === 'absent') ab++;
          else                              pend++;
          if (eff.marks != null && !eff.absent && eff.totalMarks) {
            marksSum  += Number(eff.marks);
            totalSum  += Number(eff.totalMarks);
            marksCount++;
          }
        });

        const appeared = p + f2;
        const rate     = appeared > 0 ? Math.round((p / appeared) * 100) : 0;
        const avg      = marksCount > 0 ? Math.round((marksSum / marksCount) * 10) / 10 : null;
        const avgPct   = marksCount > 0 ? Math.round((marksSum / totalSum) * 100) : null;
        const isDone   = (p + f2 + ab) > 0;
        const hl       = _health(avgPct);
        const rc       = _rateColor(rate, appeared);

        return { p, f: f2, ab, pend, appeared, rate, avg, avgPct, isDone,
                 rateColor: rc, ...hl, students: studentIds.length };
      });

      batchDataMap[batch.id] = { batch, testGroups, groupStats };
    });

    // ── Build unified column set ─────────────────────────────
    // Use first batch's group labels (all batches share same subject → same tests)
    // If subject differs per batch, take the union by groupLabel
    const firstBatchData = Object.values(batchDataMap)[0];
    const unifiedGroups  = firstBatchData?.testGroups || [];

    if (!unifiedGroups.length) {
      area.innerHTML = `
        <div class="trs-empty">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" style="color:var(--t4)">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          <p>No test schedule found</p>
          <span>No tests are scheduled for the selected batch/subject yet.</span>
        </div>`;
      return;
    }

    // ── Subject / campus display info ────────────────────────
    const subjectObj = _getSubjects().find(s => s.id === resolvedSubjectId) || {};
    const subjectDisplay = subjectObj.subjectCode
      ? `${subjectObj.subjectCode} — ${subjectObj.subjectName||''}`.trim()
      : subjectObj.subjectName || '—';
    const campusObj = _getCampuses().find(c => c.id === (f.campus || allBatches[0]?.campusId)) || {};
    const campusName = (campusObj.campusName || '').replace(/\s*campus$/i,'').trim() || '—';

    // ── Build table HTML ─────────────────────────────────────
    // Header row 1: # | Batch | Teacher | [Test 1 colspan=5] | [Test 2 colspan=5] …
    // Colspan per test = 5 stats: Pass | Fail | Absent | Avg | Pass Rate | Health  (6)
    const STAT_COLS = 6;

    const groupHeaderCells = unifiedGroups.map(g => `
      <th colspan="${STAT_COLS}"
          class="${g.isMock ? 'trs-th-mock' : 'trs-th-test'}"
          style="font-size:12px;font-weight:800;padding:10px 16px;text-align:center">
        ${g.groupLabel}
        ${g.retests.length ? `<span style="font-size:9.5px;font-weight:600;opacity:.75;margin-left:4px">(+${g.retests.length} retest${g.retests.length > 1 ? 's' : ''})</span>` : ''}
      </th>`).join('');

    const subHeaderCells = unifiedGroups.map(g => {
      const sepClass = g.isMock ? 'trs-td-mock-sep' : 'trs-td-test-sep';
      return `
        <th class="${sepClass}" style="border-left:2px solid ${g.isMock ? 'color-mix(in srgb,var(--violet,#8b5cf6) 30%,transparent)' : 'color-mix(in srgb,var(--blue) 30%,transparent)'}">Pass</th>
        <th>Fail</th>
        <th>Absent</th>
        <th>Avg Marks</th>
        <th>Pass Rate</th>
        <th>Health</th>`;
    }).join('');

    // Body rows
    const bodyHTML = allBatches.map((batch, bi) => {
      const bd = batchDataMap[batch.id];
      if (!bd) return '';
      const teacherName   = _getTeacherName(batch);
      const batchDisplay  = batch.batchName || (batch.batchNo ? `Batch ${String(batch.batchNo).padStart(2,'0')}` : batch.id);
      const session       = batch.sessionPeriod || '—';

      const dataCells = unifiedGroups.map((ug, gi) => {
        // Find matching group in this batch by label
        const bgd = bd.testGroups.find(g => g.groupLabel === ug.groupLabel);
        const s   = bgd ? bd.groupStats[bd.testGroups.indexOf(bgd)] : null;
        const isMock   = ug.isMock;
        const sepClass = isMock ? 'trs-td-mock-sep' : 'trs-td-test-sep';
        const sepStyle = `border-left:2px solid ${isMock ? 'color-mix(in srgb,var(--violet,#8b5cf6) 20%,transparent)' : 'color-mix(in srgb,var(--blue) 20%,transparent)'}`;

        if (!s) {
          return `
            <td class="${sepClass}" style="${sepStyle}">—</td>
            <td>—</td><td>—</td><td>—</td><td>—</td><td>—</td>`;
        }

        const hl = _health(s.avgPct);
        const passRateBar = s.appeared > 0
          ? `<div style="display:flex;align-items:center;gap:5px">
               <div style="flex:1;height:4px;background:var(--surface3);border-radius:2px;overflow:hidden;min-width:30px">
                 <div style="height:100%;width:${s.rate}%;background:${s.rateColor};border-radius:2px;transition:width .3s"></div>
               </div>
               <span style="font-size:10.5px;font-weight:800;color:${s.rateColor};white-space:nowrap">${s.rate}%</span>
             </div>`
          : `<span style="color:var(--t4)">—</span>`;

        const healthPill = `
          <span class="trs-pill" style="background:${hl.bg};color:${hl.color}">
            ${hl.icon} ${hl.label}${s.avgPct != null ? ` (${s.avgPct}%)` : ''}
          </span>`;

        return `
          <td class="${sepClass}" style="${sepStyle}">
            ${s.p > 0 ? `<span class="trs-pill" style="background:var(--green-dim);color:var(--green)">✓ ${s.p}</span>` : `<span style="color:var(--t4)">0</span>`}
          </td>
          <td>${s.f > 0 ? `<span class="trs-pill" style="background:var(--red-dim);color:var(--red)">✗ ${s.f}</span>` : `<span style="color:var(--t4)">0</span>`}</td>
          <td>${s.ab > 0 ? `<span class="trs-pill" style="background:var(--yellow-dim);color:var(--yellow)">⊘ ${s.ab}</span>` : `<span style="color:var(--t4)">0</span>`}</td>
          <td style="font-size:12px;font-weight:700;color:var(--t1)">${s.avg != null ? s.avg : '—'}</td>
          <td style="min-width:90px">${passRateBar}</td>
          <td>${healthPill}</td>`;
      }).join('');

      const rowBg = bi % 2 === 1 ? 'background:var(--surface2)' : '';

      return `
        <tr style="${rowBg}">
          <td class="trs-td-left" style="font-weight:700;color:var(--t1);white-space:nowrap">
            <div style="font-size:12.5px;font-weight:700">${batchDisplay}</div>
            <div style="font-size:10.5px;color:var(--t3);margin-top:1px">${session} · ${s?.students || bd.groupStats[0]?.students || 0} students</div>
          </td>
          <td class="trs-td-left" style="font-size:12px;color:var(--t2);white-space:nowrap">${teacherName}</td>
          ${dataCells}
        </tr>`;
    }).join('');

    // ── Info bar ─────────────────────────────────────────────
    const infoBar = `
      <div class="trs-info-bar">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span style="font-size:12.5px;font-weight:700;color:var(--t1)">${campusName}</span>
        <span style="color:var(--border2);font-size:16px;font-weight:300;margin:0 4px">|</span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
          <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
          <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
        </svg>
        <span style="font-size:12.5px;font-weight:700;color:var(--blue)">${subjectDisplay}</span>
        <span style="margin-left:auto;font-size:11.5px;color:var(--t3)">
          ${allBatches.length} batch${allBatches.length !== 1 ? 'es' : ''} · ${unifiedGroups.length} test${unifiedGroups.length !== 1 ? 's' : ''}
          · effective stats (latest attempt per student)
        </span>
      </div>`;

    area.innerHTML = infoBar + `
      <div class="trs-table-wrap" style="border-top:none;border-radius:0 0 12px 12px">
        <div class="trs-table-scroll">
          <table class="trs-table">
            <thead>
              <tr>
                <th class="trs-th-left" rowspan="2" style="vertical-align:middle;min-width:130px">Batch</th>
                <th class="trs-th-left" rowspan="2" style="vertical-align:middle;min-width:110px">Teacher</th>
                ${groupHeaderCells}
              </tr>
              <tr class="trs-thead-sub">
                ${subHeaderCells}
              </tr>
            </thead>
            <tbody>
              ${bodyHTML || `<tr><td colspan="${2 + unifiedGroups.length * STAT_COLS}" style="text-align:center;padding:40px;color:var(--t3)">No data available</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>`;
  },
};
