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

// ── Sub-column definitions for column manager ──────────────
const TRS_SUB_COLS = [
  { key: 'pass',     label: 'Pass'      },
  { key: 'fail',     label: 'Fail'      },
  { key: 'absent',   label: 'Absent'    },
  { key: 'avg',      label: 'Avg Marks' },
  { key: 'rate',     label: 'Pass Rate' },
  { key: 'health',   label: 'Health'    },
];
const TRS_COL_PREF_KEY = 'trs_col_prefs';

function _getTrsColPrefs() {
  try {
    const raw = AppState.get(TRS_COL_PREF_KEY);
    if (raw && Array.isArray(raw.hidden)) return raw;
  } catch(e) {}
  return { hidden: [] };
}
function _saveTrsColPrefs(prefs) { AppState.set(TRS_COL_PREF_KEY, prefs); }

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
// ── Batch status helper ─────────────────────────────────────
// Active = closeDate <= today (or no date)
// Closed = closeDate > today
// ── Batch status ────────────────────────────────────────────
// Field: batch.endDate (YYYY-MM-DD) — saved by batch.js
// When endDateMode = 'lp', endDate = LP's last dated row (saved on Save Changes)
// BUT: if user never re-saved after LP assignment, endDate may be blank.
// So we also check LP directly as a fallback.
//
// Active  = effective endDate > today  OR  no effective endDate
// Closed  = effective endDate <= today
function _batchStatus(batch) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // 1. Try saved endDate first
  let effectiveEnd = batch.endDate || '';

  // 2. If missing or mode is LP, try to read LP's last date directly
  if ((!effectiveEnd || batch.endDateMode !== 'manual') && batch.id) {
    try {
      const assignment = getAllAssignments()[batch.id];
      const rows = assignment?.rows || [];
      const datedRows = rows.filter(r => r.date);
      if (datedRows.length) {
        const lpLastDate = datedRows[datedRows.length - 1].date;
        // LP date takes priority over saved endDate when mode = lp
        if (lpLastDate && (batch.endDateMode !== 'manual')) {
          effectiveEnd = lpLastDate;
        } else if (lpLastDate && !effectiveEnd) {
          effectiveEnd = lpLastDate;
        }
      }
    } catch(e) { /* LP not available — use saved endDate */ }
  }

  // 3. No end date at all → still active
  if (!effectiveEnd) return 'active';

  const end = new Date(effectiveEnd); end.setHours(0, 0, 0, 0);
  return end <= today ? 'closed' : 'active';
}

function _getBatchesFor({ disciplineId, levelId, subjectId, sessionId, campusId, status } = {}) {
  // Each param can be a string (single) or an array (multi-select)
  const _match = (val, filter) => {
    if (!filter || (Array.isArray(filter) && !filter.length)) return true;
    return Array.isArray(filter) ? filter.includes(val) : val === filter;
  };
  return _getBatches().filter(b => {
    if (!_match(b.disciplineId,  disciplineId)) return false;
    if (!_match(b.levelId,       levelId))      return false;
    if (!_match(b.subjectId,     subjectId))     return false;
    if (!_match(b.sessionPeriod, sessionId))     return false;
    if (!_match(b.campusId,      campusId))      return false;
    if (status && (Array.isArray(status) ? status.length : true)) {
      const ss = Array.isArray(status) ? status : [status];
      if (ss.length && !ss.includes(_batchStatus(b))) return false;
    }
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

/* ── Multi-select dropdown ── */
.trs-ms-wrap { position:relative; width:100%; box-sizing:border-box; }
.trs-ms-trigger {
  display:flex; align-items:center; justify-content:space-between; gap:6px;
  height:34px; padding:0 10px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:8px; color:var(--t1); font-size:12.5px;
  cursor:pointer; outline:none; font-family:inherit;
  transition:border-color .12s; width:100%; box-sizing:border-box;
  user-select:none; white-space:nowrap; overflow:hidden;
}
.trs-ms-trigger:focus, .trs-ms-trigger.open { border-color:var(--blue); }
.trs-ms-trigger[disabled] { opacity:.45; cursor:not-allowed; pointer-events:none; }
.trs-ms-trigger-text { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--t1); }
.trs-ms-trigger-text.placeholder { color:var(--t3); }
.trs-ms-trigger-arrow { flex-shrink:0; color:var(--t3); transition:transform .18s; }
.trs-ms-trigger.open .trs-ms-trigger-arrow { transform:rotate(180deg); }
.trs-ms-trigger-count {
  flex-shrink:0; background:var(--blue-dim); color:var(--blue);
  border-radius:20px; padding:1px 7px; font-size:10.5px; font-weight:700;
}
.trs-ms-dropdown {
  position:fixed; z-index:9999;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.2);
  display:none; flex-direction:column; overflow:hidden;
  min-width:180px; max-width:300px;
  max-height:240px;
}
.trs-ms-dropdown.open { display:flex; }
.trs-ms-search-wrap {
  padding:8px 8px 4px; border-bottom:1px solid var(--border); flex-shrink:0;
}
.trs-ms-search {
  width:100%; box-sizing:border-box; padding:5px 9px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:7px; color:var(--t1); font-size:12px; outline:none;
  font-family:inherit;
}
.trs-ms-search::placeholder { color:var(--t3); }
.trs-ms-list { overflow-y:auto; flex:1; padding:3px 0; }
.trs-ms-item {
  display:flex; align-items:center; gap:8px;
  padding:7px 12px; cursor:pointer; transition:background .1s;
  font-size:12.5px; color:var(--t1); user-select:none;
}
.trs-ms-item:hover { background:var(--surface2); }
.trs-ms-item.selected { color:var(--blue); }
.trs-ms-chk {
  width:14px; height:14px; border-radius:3px; flex-shrink:0;
  border:1.5px solid var(--border2); background:var(--surface2);
  display:flex; align-items:center; justify-content:center; transition:all .1s;
}
.trs-ms-item.selected .trs-ms-chk {
  background:var(--blue); border-color:var(--blue);
}
.trs-ms-chk-tick { display:none; color:#fff; font-size:10px; font-weight:900; }
.trs-ms-item.selected .trs-ms-chk-tick { display:block; }
.trs-ms-lbl { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.trs-ms-footer {
  display:flex; justify-content:space-between; align-items:center;
  padding:5px 10px; border-top:1px solid var(--border);
  font-size:10.5px; color:var(--t3); flex-shrink:0;
}
.trs-ms-footer-btn {
  background:none; border:none; color:var(--blue); font-size:10.5px;
  font-weight:700; cursor:pointer; font-family:inherit; padding:0;
}
.trs-ms-footer-btn:hover { opacity:.8; }
/* Status option pills */
.trs-ms-status-active { color:var(--green); }
.trs-ms-status-closed { color:var(--yellow); }

/* ── Filter bar card — sticky to page-content scroll container ── */
.rp-filter-card {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
  flex-shrink: 0;
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
.rp-filter-arrow { transition:transform .2s; color:var(--t3); }
.rp-filter-arrow.open { transform:rotate(180deg); }
.rp-filter-body {
  display:none; flex-direction:column; gap:14px;
  border-top:1px solid var(--border);
  padding:16px;
}
.rp-filter-body.open { display:flex; }
.rp-filter-row { display:flex; flex-wrap:wrap; gap:12px; width:100%; box-sizing:border-box; }
.rp-filter-col {
  display:flex; flex-direction:column; gap:5px;
  flex:1 1 140px; min-width:120px; max-width:100%; box-sizing:border-box;
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
  width:100%; box-sizing:border-box;
  overflow:hidden; text-overflow:ellipsis;
}
.rp-filter-sel:focus   { border-color:var(--blue); }
.rp-filter-sel:disabled { opacity:.45; cursor:not-allowed; }
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
.rp-chip-row { display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-top:2px; }
.rp-chip {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 9px; border-radius:20px;
  font-size:11px; font-weight:600;
  border:1px solid transparent;
}
.rp-chip-x { font-size:10px; cursor:pointer; opacity:.7; }
.rp-chip-x:hover { opacity:1; }

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

/* ── Table scroll container (both axes) ── */
.trs-table-scroll-container {
  width:100%;
  overflow-x:scroll;
  overflow-y:auto;
  max-height:calc(100vh - 280px);
  -webkit-overflow-scrolling:touch;
  border:1px solid var(--border);
  border-top:none;
  border-radius:0 0 12px 12px;
  scrollbar-width:thin;
  scrollbar-color:var(--border2) var(--surface2);
}
.trs-table-scroll-container::-webkit-scrollbar { height:7px; width:7px; }
.trs-table-scroll-container::-webkit-scrollbar-track { background:var(--surface2); border-radius:4px; }
.trs-table-scroll-container::-webkit-scrollbar-thumb { background:var(--border2); border-radius:4px; }
.trs-table-scroll-container::-webkit-scrollbar-thumb:hover { background:var(--t4); }
.trs-table-scroll-container .trs-table { width:max-content; min-width:100%; }

/* ── Export / Column-manager buttons ── */
.trs-export-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:5px;
  height:30px; padding:0 12px; border-radius:8px;
  border:1px solid var(--border); background:var(--surface2);
  color:var(--t3); cursor:pointer; font-size:12px; font-weight:600;
  font-family:inherit; transition:all .15s; white-space:nowrap;
}
.trs-export-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }

/* ── Column Manager ── */
.trs-col-mgr-wrap  { position:relative; }
.trs-col-mgr-btn {
  display:inline-flex; align-items:center; justify-content:center;
  width:30px; height:30px; border-radius:8px;
  border:1px solid var(--border); background:var(--surface2);
  color:var(--t3); cursor:pointer; transition:all .15s;
}
.trs-col-mgr-panel {
  position:fixed; z-index:9999;
  width:200px; background:var(--surface);
  border:1px solid var(--border); border-radius:10px;
  box-shadow:0 8px 32px rgba(0,0,0,.18);
  display:none; flex-direction:column; overflow:hidden;
  max-height:min(340px, calc(100vh - 24px));
}
.trs-col-mgr-panel.open { display:flex; }
.trs-col-mgr-head {
  padding:9px 13px 7px;
  border-bottom:1px solid var(--border);
  display:flex; align-items:center;
  justify-content:space-between; flex-shrink:0;
}
.trs-col-mgr-title {
  font-size:11.5px; font-weight:700; color:var(--t1);
  display:flex; align-items:center; gap:6px;
}
.trs-col-mgr-link {
  font-size:11px; color:var(--blue); cursor:pointer;
  background:none; border:none; padding:0;
  text-decoration:underline; font-weight:600;
}
.trs-col-mgr-link:hover { opacity:.8; }
.trs-col-mgr-list { padding:4px 0; overflow-y:auto; flex:1; }
.trs-col-mgr-item {
  display:flex; align-items:center; gap:8px;
  padding:7px 12px; cursor:default; user-select:none;
  transition:background .1s;
}
.trs-col-mgr-item:hover { background:var(--surface2); }
.trs-col-mgr-chk { width:14px; height:14px; accent-color:var(--blue); cursor:pointer; flex-shrink:0; }
.trs-col-mgr-lbl { font-size:12.5px; color:var(--t1); flex:1; cursor:pointer; }
.trs-col-mgr-item.col-hidden .trs-col-mgr-lbl { color:var(--t4); }
.trs-col-mgr-foot {
  padding:6px 12px; border-top:1px solid var(--border);
  font-size:10.5px; color:var(--t3); text-align:center;
  flex-shrink:0; background:var(--surface2);
}
`;
  document.head.appendChild(st);
}

// ── Main Export ─────────────────────────────────────────────
export const TestResultSummary = {

  _container:     null,
  _filterOpen:    false,
  // Multi-select: each is an array of selected values
  _selCampus:     [],
  _selDiscipline: [],
  _selLevel:      [],
  _selSession:    [],
  _selSubject:    [],
  _selBatch:      [],
  _selStatus:     [],
  _appliedFilter: null,
  _openMs:        null,  // id of currently open multi-select dropdown

  mount(container) {
    if (!container) return;
    _injectStyles();
    this._container     = container;
    this._filterOpen    = false;
    this._selCampus     = [];
    this._selDiscipline = [];
    this._selLevel      = [];
    this._selSession    = [];
    this._selSubject    = [];
    this._selBatch      = [];
    this._selStatus     = [];
    this._appliedFilter = null;
    this._openMs        = null;
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
    return ['campus','discipline','level','session','subject','batch','status']
      .filter(k => { const v = this._appliedFilter[k]; return Array.isArray(v) ? v.length > 0 : !!v; }).length;
  },

  // ── Multi-select helper: render a custom dropdown ────────
  // opts: [{value, label}], selected: string[], stateKey: '_selXxx'
  _msHTML(id, label, opts, selected, disabled = false) {
    const sel  = selected || [];
    const count = sel.length;
    const trigText = count === 0
      ? `<span class="trs-ms-trigger-text placeholder">Select ${label}…</span>`
      : count === 1
        ? `<span class="trs-ms-trigger-text">${(opts.find(o=>o.value===sel[0])?.label || sel[0])}</span>`
        : `<span class="trs-ms-trigger-text">${count} selected</span>`;
    const countBadge = count > 0 ? `<span class="trs-ms-trigger-count">${count}</span>` : '';
    const disAttr = disabled ? 'disabled' : '';
    return `
      <div class="rp-filter-col">
        <div class="rp-filter-col-label">${label}</div>
        <div class="trs-ms-wrap" data-ms-id="${id}">
          <button class="trs-ms-trigger${disabled?' trs-ms-trigger-disabled':''}" id="${id}Trigger" ${disAttr}
                  type="button" data-ms-id="${id}">
            ${trigText}${countBadge}
            <svg class="trs-ms-trigger-arrow" width="12" height="12" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
          <div class="trs-ms-dropdown" id="${id}Drop" data-ms-id="${id}">
            ${opts.length > 5 ? `<div class="trs-ms-search-wrap">
              <input class="trs-ms-search" id="${id}Search" placeholder="Search…" type="text"/>
            </div>` : ''}
            <div class="trs-ms-list" id="${id}List">
              ${opts.map(o => {
                const isSel = sel.includes(o.value);
                const extraClass = o.statusClass || '';
                return `<div class="trs-ms-item${isSel?' selected':''} ${extraClass}"
                             data-ms-id="${id}" data-val="${o.value}">
                  <div class="trs-ms-chk"><span class="trs-ms-chk-tick">✓</span></div>
                  <span class="trs-ms-lbl" title="${o.label}">${o.label}</span>
                </div>`;
              }).join('')}
              ${!opts.length ? `<div style="padding:12px;text-align:center;font-size:12px;color:var(--t3)">No options</div>` : ''}
            </div>
            <div class="trs-ms-footer">
              <span id="${id}CountLbl">${count} selected</span>
              <button class="trs-ms-footer-btn" id="${id}ClearBtn" type="button">Clear</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  // ── Filter body ──────────────────────────────────────────
  _filterBodyHTML() {
    const campuses    = _getCampuses();
    const hasCampus   = this._selCampus.length > 0;
    const disciplines = _getDisciplines(hasCampus ? this._selCampus[0] : '');
    const hasDiscipline = this._selDiscipline.length > 0;
    const levels      = _getLevels(hasDiscipline ? this._selDiscipline[0] : '');
    const sessions    = _getSessions(this._selSubject.length ? this._selSubject[0] : '');
    const subjects    = _getSubjectsFor({ disciplineId: hasDiscipline ? this._selDiscipline[0] : '', levelId: this._selLevel.length ? this._selLevel[0] : '' });
    const batches     = _getBatchesFor({
      disciplineId: this._selDiscipline,
      levelId:      this._selLevel,
      subjectId:    this._selSubject,
      sessionId:    this._selSession,
      campusId:     this._selCampus,
      status:       this._selStatus,
    });

    const campusOpts     = campuses.map(c    => ({ value: c.id, label: (c.campusName||'').replace(/\s*campus$/i,'').trim() }));
    const disciplineOpts = disciplines.map(d => ({ value: d.id, label: d.abbreviation ? `${d.abbreviation} — ${d.fullName}` : (d.fullName || d.name || d.id) }));
    const levelOpts      = levels.map(l     => ({ value: l.id, label: l.levelName || l.name || l.id }));
    const sessionOpts    = sessions.map(s   => ({ value: s,    label: s }));
    const subjectOpts    = subjects.map(s   => ({ value: s.id, label: `${s.subjectCode||''} — ${s.subjectName||''}`.replace(/^—\s*/,'').trim() }));
    const batchOpts      = batches.map(b    => ({ value: b.id, label: b.batchName || `Batch ${b.batchNo || b.id}` }));
    const statusOpts     = [
      { value: 'active', label: '● Active',  statusClass: 'trs-ms-status-active' },
      { value: 'closed', label: '◐ Closed',  statusClass: 'trs-ms-status-closed' },
    ];

    const chips = this._appliedChipsHTML();

    return `
      <div class="rp-filter-row">
        ${this._msHTML('trsSelCampus',     'Campus',     campusOpts,     this._selCampus)}
        ${this._msHTML('trsSelDiscipline', 'Discipline', disciplineOpts, this._selDiscipline, !hasCampus)}
        ${this._msHTML('trsSelLevel',      'Level',      levelOpts,      this._selLevel,      !hasDiscipline)}
        ${this._msHTML('trsSelSession',    'Session',    sessionOpts,    this._selSession,    !hasCampus)}
        ${this._msHTML('trsSelSubject',    'Subject',    subjectOpts,    this._selSubject,    !hasCampus)}
        ${this._msHTML('trsSelBatch',      'Batch #',    batchOpts,      this._selBatch,      !this._selSubject.length)}
        ${this._msHTML('trsSelStatus',     'Status',     statusOpts,     this._selStatus)}
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
    const _arr = v => Array.isArray(v) ? v : (v ? [v] : []);

    _arr(f.campus).forEach(id => {
      const c = _getCampuses().find(c=>c.id===id);
      chips.push(make((c?.campusName||id).replace(/\s*campus$/i,'').trim(), 'var(--blue)'));
    });
    _arr(f.discipline).forEach(id => {
      const d = _getDisciplines().find(d=>d.id===id);
      chips.push(make(d ? (d.abbreviation||d.fullName) : id, 'var(--violet,#8b5cf6)'));
    });
    _arr(f.level).forEach(id => {
      const l = _getLevels().find(l=>l.id===id);
      chips.push(make(l ? (l.levelName||l.name||id) : id, 'var(--cyan)'));
    });
    _arr(f.session).forEach(s => chips.push(make(s, 'var(--green)')));
    _arr(f.subject).forEach(id => {
      const s = _getSubjects().find(s=>s.id===id);
      chips.push(make(s ? (s.subjectCode||s.subjectName) : id, 'var(--orange,#f59e0b)'));
    });
    _arr(f.batch).forEach(id => {
      const b = _getBatches().find(b=>b.id===id);
      chips.push(make(b?.batchName||id, 'var(--yellow)'));
    });
    _arr(f.status).forEach(s => chips.push(make(
      s === 'active' ? '● Active' : '◐ Closed',
      s === 'active' ? 'var(--green)' : 'var(--yellow)'
    )));
    return chips.join('');
  },

  // ── Bind multi-select dropdowns ──────────────────────────
  _bindMultiSelects(c) {
    const MS_IDS = [
      { id: 'trsSelCampus',     key: '_selCampus',     cascadeReset: ['_selDiscipline','_selLevel','_selSession','_selSubject','_selBatch'] },
      { id: 'trsSelDiscipline', key: '_selDiscipline',  cascadeReset: ['_selLevel','_selBatch'] },
      { id: 'trsSelLevel',      key: '_selLevel',        cascadeReset: ['_selBatch'] },
      { id: 'trsSelSession',    key: '_selSession',      cascadeReset: ['_selBatch'] },
      { id: 'trsSelSubject',    key: '_selSubject',      cascadeReset: ['_selBatch'] },
      { id: 'trsSelBatch',      key: '_selBatch',        cascadeReset: [] },
      { id: 'trsSelStatus',     key: '_selStatus',       cascadeReset: [] },
    ];

    const _closeAll = (exceptId) => {
      MS_IDS.forEach(m => {
        if (m.id === exceptId) return;
        const drop = c.querySelector(`#${m.id}Drop`);
        const trig = c.querySelector(`#${m.id}Trigger`);
        drop?.classList.remove('open');
        trig?.classList.remove('open');
      });
    };

    MS_IDS.forEach(({ id, key, cascadeReset }) => {
      const trigger = c.querySelector(`#${id}Trigger`);
      const drop    = c.querySelector(`#${id}Drop`);
      const list    = c.querySelector(`#${id}List`);
      const search  = c.querySelector(`#${id}Search`);
      const clrBtn  = c.querySelector(`#${id}ClearBtn`);
      const cntLbl  = c.querySelector(`#${id}CountLbl`);
      if (!trigger || !drop) return;

      // Toggle open
      trigger.addEventListener('click', e => {
        e.stopPropagation();
        if (trigger.disabled) return;
        const isOpen = drop.classList.contains('open');
        _closeAll(isOpen ? null : id);
        if (!isOpen) {
          // position dropdown
          const rect = trigger.getBoundingClientRect();
          drop.style.top    = (rect.bottom + 4) + 'px';
          drop.style.left   = rect.left + 'px';
          drop.style.width  = Math.max(rect.width, 200) + 'px';
          drop.classList.add('open');
          trigger.classList.add('open');
          search?.focus();
        } else {
          drop.classList.remove('open');
          trigger.classList.remove('open');
        }
      });

      // Search filter within dropdown
      search?.addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        list?.querySelectorAll('.trs-ms-item').forEach(item => {
          const lbl = item.querySelector('.trs-ms-lbl')?.textContent?.toLowerCase() || '';
          item.style.display = !q || lbl.includes(q) ? '' : 'none';
        });
      });

      // Item click — toggle selection
      list?.addEventListener('click', e => {
        const item = e.target.closest('.trs-ms-item');
        if (!item) return;
        const val = item.dataset.val;
        const arr = this[key] || [];
        const idx = arr.indexOf(val);
        if (idx === -1) {
          this[key] = [...arr, val];
          item.classList.add('selected');
        } else {
          this[key] = arr.filter(v => v !== val);
          item.classList.remove('selected');
        }
        // Update count label + trigger badge
        const newCount = this[key].length;
        if (cntLbl) cntLbl.textContent = `${newCount} selected`;
        // Update trigger display
        this._updateMsTrigger(trigger, id, this[key], c.querySelectorAll(`#${id}List .trs-ms-item`));
        // Cascade reset
        cascadeReset.forEach(k => { this[k] = []; });
        if (cascadeReset.length) this._rerenderFilterBody(c);
      });

      // Clear button
      clrBtn?.addEventListener('click', e => {
        e.stopPropagation();
        this[key] = [];
        list?.querySelectorAll('.trs-ms-item').forEach(i => i.classList.remove('selected'));
        if (cntLbl) cntLbl.textContent = '0 selected';
        this._updateMsTrigger(trigger, id, [], []);
        cascadeReset.forEach(k => { this[k] = []; });
        if (cascadeReset.length) this._rerenderFilterBody(c);
      });
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.trs-ms-wrap') && !e.target.closest('.trs-ms-dropdown')) {
        _closeAll(null);
      }
    }, { capture: false });
  },

  _updateMsTrigger(trigger, id, selected, items) {
    const count = selected.length;
    const allOpts = [...(items || [])].map(el => ({ value: el.dataset.val, label: el.querySelector('.trs-ms-lbl')?.textContent || '' }));
    const label = trigger.closest('.rp-filter-col')?.querySelector('.rp-filter-col-label')?.textContent || '';
    let textEl = trigger.querySelector('.trs-ms-trigger-text');
    let countEl = trigger.querySelector('.trs-ms-trigger-count');
    if (!textEl) return;
    if (count === 0) {
      textEl.className = 'trs-ms-trigger-text placeholder';
      textEl.textContent = `Select ${label}…`;
      if (countEl) countEl.remove();
    } else {
      textEl.className = 'trs-ms-trigger-text';
      textEl.textContent = count === 1
        ? (allOpts.find(o=>o.value===selected[0])?.label || selected[0])
        : `${count} selected`;
      if (!countEl) {
        countEl = document.createElement('span');
        countEl.className = 'trs-ms-trigger-count';
        const arrow = trigger.querySelector('.trs-ms-trigger-arrow');
        trigger.insertBefore(countEl, arrow);
      }
      countEl.textContent = count;
    }
  },

  // ── Filter events ────────────────────────────────────────
  _attachFilterEvents(c) {
    c.querySelector('#trsFilterToggle')?.addEventListener('click', () => {
      this._filterOpen = !this._filterOpen;
      c.querySelector('#trsFilterBody')?.classList.toggle('open', this._filterOpen);
      c.querySelector('.rp-filter-arrow')?.classList.toggle('open', this._filterOpen);
    });
    this._bindMultiSelects(c);
    this._bindApplyClear(c);
  },

  _bindApplyClear(c) {
    c.querySelector('#trsApplyBtn')?.addEventListener('click', () => {
      this._appliedFilter = {
        campus:     [...this._selCampus],
        discipline: [...this._selDiscipline],
        level:      [...this._selLevel],
        session:    [...this._selSession],
        subject:    [...this._selSubject],
        batch:      [...this._selBatch],
        status:     [...this._selStatus],
      };
      this._filterOpen = false;
      this._renderTable(c);
      c.querySelector('#trsFilterBody')?.classList.remove('open');
      c.querySelector('.rp-filter-arrow')?.classList.remove('open');
      this._rerenderFilterToggle(c);
      this._rerenderFilterBody(c);
    });
    c.querySelector('#trsClearBtn')?.addEventListener('click', () => {
      this._selCampus = this._selDiscipline = this._selLevel =
        this._selSession = this._selSubject = this._selBatch = this._selStatus = [];
      // Re-assign as new arrays
      this._selCampus = []; this._selDiscipline = []; this._selLevel = [];
      this._selSession = []; this._selSubject = []; this._selBatch = []; this._selStatus = [];
      this._appliedFilter = null;
      this._renderTable(c);
      this._rerenderFilterBody(c);
      this._rerenderFilterToggle(c);
    });
  },

  _rerenderFilterBody(c) {
    const body = c.querySelector('#trsFilterBody');
    if (!body) return;
    body.innerHTML = this._filterBodyHTML();
    this._bindMultiSelects(c);
    this._bindApplyClear(c);
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

    const f = this._appliedFilter;
    const _hasAny = (v) => Array.isArray(v) ? v.length > 0 : !!v;

    if (!f || (!_hasAny(f.campus) && !_hasAny(f.subject) && !_hasAny(f.batch) && !_hasAny(f.status))) {
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

    // ── Collect matching batches ─────────────────────────────
    const allBatches = _getBatchesFor({
      disciplineId: f.discipline,
      levelId:      f.level,
      subjectId:    f.subject,
      sessionId:    f.session,
      campusId:     f.campus,
      status:       f.status,
    }).filter(b => !f.batch?.length || f.batch.includes(b.id));

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
    const resolvedSubjectId = (Array.isArray(f.subject) ? f.subject[0] : f.subject) || allBatches[0]?.subjectId || '';
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
    const hasSubjectFilter = Array.isArray(f.subject) ? f.subject.length > 0 : !!f.subject;
    const subjectDisplay = hasSubjectFilter
      ? (subjectObj.subjectCode
          ? `${subjectObj.subjectCode} — ${subjectObj.subjectName||''}`.trim()
          : subjectObj.subjectName || '—')
      : 'All Subjects';
    const resolvedCampusId = (Array.isArray(f.campus) ? f.campus[0] : f.campus) || allBatches[0]?.campusId;
    const campusObj = _getCampuses().find(c => c.id === resolvedCampusId) || {};
    const campusName = (campusObj.campusName || '').replace(/\s*campus$/i,'').trim() || '—';

    // ── Build table HTML ─────────────────────────────────────
    // Header row 1: # | Batch | Teacher | [Test 1 colspan=N] | [Test 2 colspan=N] …
    const _prefs = _getTrsColPrefs();
    const _visibleCols = TRS_SUB_COLS.filter(sc => !_prefs.hidden.includes(sc.key));
    const STAT_COLS = _visibleCols.length || 1;

    const groupHeaderCells = unifiedGroups.map(g => `
      <th colspan="${STAT_COLS}"
          class="${g.isMock ? 'trs-th-mock' : 'trs-th-test'}"
          style="font-size:12px;font-weight:800;padding:10px 16px;text-align:center">
        ${g.groupLabel}
        ${g.retests.length ? `<span style="font-size:9.5px;font-weight:600;opacity:.75;margin-left:4px">(+${g.retests.length} retest${g.retests.length > 1 ? 's' : ''})</span>` : ''}
      </th>`).join('');

    const subHeaderCells = unifiedGroups.map(g => {
      const sepClass = g.isMock ? 'trs-td-mock-sep' : 'trs-td-test-sep';
      if (!_visibleCols.length) {
        return `<th class="${sepClass}" style="border-left:2px solid ${g.isMock ? 'color-mix(in srgb,var(--violet,#8b5cf6) 30%,transparent)' : 'color-mix(in srgb,var(--blue) 30%,transparent)'}">—</th>`;
      }
      return _visibleCols.map((sc, i) => {
        const isFirst = i === 0;
        const sepStyle = isFirst ? ` style="border-left:2px solid ${g.isMock ? 'color-mix(in srgb,var(--violet,#8b5cf6) 30%,transparent)' : 'color-mix(in srgb,var(--blue) 30%,transparent)'}"` : '';
        return `<th class="${isFirst ? sepClass : ''}"${sepStyle}>${sc.label}</th>`;
      }).join('');
    }).join('');

    // Body rows
    const bodyHTML = allBatches.map((batch, bi) => {
      const bd = batchDataMap[batch.id];
      if (!bd) return '';
      const teacherName   = _getTeacherName(batch);
      const batchDisplay  = batch.batchName || (batch.batchNo ? `Batch ${String(batch.batchNo).padStart(2,'0')}` : batch.id);
      const session       = batch.sessionPeriod || '—';
      const bStatus       = _batchStatus(batch);
      const statusPill    = bStatus === 'active'
        ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;color:var(--green);background:var(--green-dim);border-radius:20px;padding:1px 6px">● Active</span>`
        : `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;color:var(--yellow);background:var(--yellow-dim);border-radius:20px;padding:1px 6px">◐ Closed</span>`;

      const dataCells = unifiedGroups.map((ug, gi) => {
        // Find matching group in this batch by label
        const bgd = bd.testGroups.find(g => g.groupLabel === ug.groupLabel);
        const s   = bgd ? bd.groupStats[bd.testGroups.indexOf(bgd)] : null;
        const isMock   = ug.isMock;
        const sepClass = isMock ? 'trs-td-mock-sep' : 'trs-td-test-sep';
        const sepStyle = `border-left:2px solid ${isMock ? 'color-mix(in srgb,var(--violet,#8b5cf6) 20%,transparent)' : 'color-mix(in srgb,var(--blue) 20%,transparent)'}`;

        if (!_visibleCols.length) {
          return `<td class="${sepClass}" style="${sepStyle}">—</td>`;
        }

        if (!s) {
          return _visibleCols.map((sc, i) =>
            i === 0 ? `<td class="${sepClass}" style="${sepStyle}">—</td>` : `<td>—</td>`
          ).join('');
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

        const cellHTML = {
          pass:   s.p > 0 ? `<span class="trs-pill" style="background:var(--green-dim);color:var(--green)">✓ ${s.p}</span>` : `<span style="color:var(--t4)">0</span>`,
          fail:   s.f > 0 ? `<span class="trs-pill" style="background:var(--red-dim);color:var(--red)">✗ ${s.f}</span>` : `<span style="color:var(--t4)">0</span>`,
          absent: s.ab > 0 ? `<span class="trs-pill" style="background:var(--yellow-dim);color:var(--yellow)">⊘ ${s.ab}</span>` : `<span style="color:var(--t4)">0</span>`,
          avg:    `<span style="font-size:12px;font-weight:700;color:var(--t1)">${s.avg != null ? s.avg : '—'}</span>`,
          rate:   passRateBar,
          health: healthPill,
        };

        return _visibleCols.map((sc, i) => {
          const extraStyle = sc.key === 'avg' ? '' : sc.key === 'rate' ? ' style="min-width:90px"' : '';
          const cls   = i === 0 ? sepClass : '';
          const style = i === 0 ? ` style="${sepStyle}"` : extraStyle;
          return `<td class="${cls}"${style}>${cellHTML[sc.key]}</td>`;
        }).join('');
      }).join('');

      const rowBg = bi % 2 === 1 ? 'background:var(--surface2)' : '';

      return `
        <tr style="${rowBg}">
          <td class="trs-td-left" style="font-weight:700;color:var(--t1);white-space:nowrap">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:12.5px;font-weight:700">${batchDisplay}</span>
              ${statusPill}
            </div>
            <div style="font-size:10.5px;color:var(--t3);margin-top:1px">${session} · ${bd.groupStats[0]?.students || 0} students</div>
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
        <span style="font-size:11.5px;color:var(--t3);margin-left:8px">
          ${allBatches.length} batch${allBatches.length !== 1 ? 'es' : ''} · ${unifiedGroups.length} test${unifiedGroups.length !== 1 ? 's' : ''}
          · effective stats (latest attempt per student)
        </span>
        <div style="display:flex;gap:6px;align-items:center;margin-left:auto">
          <button class="trs-export-btn" id="trsExportCSV">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
            </svg>
            CSV
          </button>
          <button class="trs-export-btn" id="trsExportPDF">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/>
            </svg>
            PDF
          </button>
          <div class="trs-col-mgr-wrap">
            <button class="trs-col-mgr-btn" id="trsColMgrBtn" title="Show / hide columns">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="18" rx="1"/>
                <rect x="14" y="3" width="7" height="18" rx="1"/>
              </svg>
            </button>
            <div class="trs-col-mgr-panel" id="trsColMgrPanel">
              <div class="trs-col-mgr-head">
                <span class="trs-col-mgr-title">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
                  </svg>
                  Columns
                </span>
                <button class="trs-col-mgr-link" id="trsColMgrShowAll">Show All</button>
              </div>
              <div class="trs-col-mgr-list" id="trsColMgrList"></div>
              <div class="trs-col-mgr-foot">Applies to all tests</div>
            </div>
          </div>
        </div>
      </div>`;

    area.innerHTML = infoBar + `
      <div class="trs-table-scroll-container" id="trsTableScroll">
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
      </div>`;

    // ── Wire export buttons ───────────────────────────────────
    const _exportData = { allBatches, batchDataMap, unifiedGroups, campusName, subjectDisplay, visibleCols: _visibleCols };
    area.querySelector('#trsExportCSV')?.addEventListener('click', () => this._exportCSV(_exportData));
    area.querySelector('#trsExportPDF')?.addEventListener('click', () => this._exportPDF(_exportData));

    // ── Wire column manager ────────────────────────────────────
    this._wireColManager(area, c);
  },

  // ── Column Manager ─────────────────────────────────────────
  _wireColManager(area, c) {
    const btn   = area.querySelector('#trsColMgrBtn');
    const panel = area.querySelector('#trsColMgrPanel');
    const list  = area.querySelector('#trsColMgrList');
    if (!btn || !panel || !list) return;

    const _positionPanel = () => {
      const r      = btn.getBoundingClientRect();
      const panelW = 200;
      let left = r.right - panelW;
      left = Math.max(8, Math.min(left, window.innerWidth - panelW - 8));
      panel.style.left = left + 'px';
      panel.style.top  = (r.bottom + 6) + 'px';
    };

    const _renderList = () => {
      const prefs = _getTrsColPrefs();
      list.innerHTML = '';
      TRS_SUB_COLS.forEach(sc => {
        const isVisible = !prefs.hidden.includes(sc.key);
        const item = document.createElement('div');
        item.className = 'trs-col-mgr-item' + (isVisible ? '' : ' col-hidden');
        item.innerHTML =
          `<input type="checkbox" class="trs-col-mgr-chk" id="trs_chk_${sc.key}"${isVisible ? ' checked' : ''}/>`+
          `<label class="trs-col-mgr-lbl" for="trs_chk_${sc.key}">${sc.label}</label>`;
        item.querySelector('.trs-col-mgr-chk').addEventListener('change', e => {
          const p = _getTrsColPrefs();
          if (e.target.checked) {
            p.hidden = p.hidden.filter(h => h !== sc.key);
            item.classList.remove('col-hidden');
          } else {
            if (!p.hidden.includes(sc.key)) p.hidden.push(sc.key);
            item.classList.add('col-hidden');
          }
          _saveTrsColPrefs(p);
          panel.classList.remove('open');
          this._renderTable(c);
        });
        list.appendChild(item);
      });
    };

    btn.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = panel.classList.contains('open');
      if (isOpen) {
        panel.classList.remove('open');
      } else {
        _renderList();
        _positionPanel();
        panel.classList.add('open');
        btn.style.borderColor = 'var(--blue)';
        btn.style.color = 'var(--blue)';
        btn.style.background = 'var(--blue-dim)';
      }
    });

    area.querySelector('#trsColMgrShowAll')?.addEventListener('click', () => {
      _saveTrsColPrefs({ hidden: [] });
      panel.classList.remove('open');
      this._renderTable(c);
    });

    const _outsideClick = e => {
      if (!panel.contains(e.target) && e.target !== btn) {
        panel.classList.remove('open');
        btn.style.borderColor = 'var(--border)';
        btn.style.color = 'var(--t3)';
        btn.style.background = 'var(--surface2)';
      }
    };
    document.addEventListener('click', _outsideClick);

    window.addEventListener('scroll', () => {
      if (panel.classList.contains('open')) _positionPanel();
    }, true);
    window.addEventListener('resize', () => {
      if (panel.classList.contains('open')) _positionPanel();
    });
  },

  // ── Build flat rows for CSV/PDF export ──────────────────────
  _buildExportRows({ allBatches, batchDataMap, unifiedGroups }) {
    const rows = [];
    allBatches.forEach(batch => {
      const bd = batchDataMap[batch.id];
      if (!bd) return;
      const teacherName  = _getTeacherName(batch);
      const batchDisplay = batch.batchName || (batch.batchNo ? `Batch ${String(batch.batchNo).padStart(2,'0')}` : batch.id);
      const session      = batch.sessionPeriod || '—';

      unifiedGroups.forEach(ug => {
        const bgd = bd.testGroups.find(g => g.groupLabel === ug.groupLabel);
        const s   = bgd ? bd.groupStats[bd.testGroups.indexOf(bgd)] : null;
        rows.push({
          'Batch':     batchDisplay,
          'Teacher':   teacherName,
          'Session':   session,
          'Test':      ug.groupLabel,
          'Pass':      s ? String(s.p)  : '—',
          'Fail':      s ? String(s.f)  : '—',
          'Absent':    s ? String(s.ab) : '—',
          'Avg Marks': s && s.avg != null ? String(s.avg) : '—',
          'Pass Rate': s && s.appeared > 0 ? `${s.rate}%` : '—',
          'Health':    s ? _health(s.avgPct).label + (s.avgPct != null ? ` (${s.avgPct}%)` : '') : '—',
        });
      });
    });
    return rows;
  },

  // ── Export CSV ───────────────────────────────────────────────
  _exportCSV(d) {
    const data = this._buildExportRows(d);
    if (!data.length) { alert('No results to export.'); return; }
    const headers = Object.keys(data[0]);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const metaLines = [
      `Test Result Summary Report`,
      `Generated: ${dateStr} ${timeStr}`,
      `Campus: ${d.campusName}  |  Subject: ${d.subjectDisplay}`,
      `Batches: ${d.allBatches.length}  |  Tests: ${d.unifiedGroups.length}`,
      '',
    ].join('\n');

    const csvRows = [
      metaLines,
      headers.join(','),
      ...data.map(r => headers.map(h => `"${String(r[h]||'').replace(/"/g,'""')}"`).join(',')),
    ];

    const blob = new Blob([csvRows.join('\n')], { type:'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Test-Result-Summary-${dateStr.replace(/ /g,'-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Export PDF ───────────────────────────────────────────────
  _exportPDF(d) {
    if (!d.allBatches.length) { alert('No results to export.'); return; }
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const visibleCols = d.visibleCols.length ? d.visibleCols : TRS_SUB_COLS;
    const STAT_COLS   = visibleCols.length;

    const groupThs = d.unifiedGroups.map(g => {
      const bg    = g.isMock ? '#ede9fe' : '#dbeafe';
      const color = g.isMock ? '#5b21b6' : '#1e40af';
      return `<th colspan="${STAT_COLS}" style="text-align:center;background:${bg};color:${color};
                font-size:9px;font-weight:700;padding:5px 8px;
                border-left:2px solid ${g.isMock ? '#c4b5fd' : '#93c5fd'};
                white-space:nowrap">${g.groupLabel}</th>`;
    }).join('');

    const subThs = d.unifiedGroups.map(g => {
      const bc = g.isMock ? '#c4b5fd' : '#93c5fd';
      return visibleCols.map((sc, i) =>
        `<th${i===0 ? ` style="border-left:2px solid ${bc}"` : ''}>${sc.label}</th>`
      ).join('');
    }).join('');

    const bodyRows = d.allBatches.map((batch, ri) => {
      const bd = d.batchDataMap[batch.id];
      const teacherName  = _getTeacherName(batch);
      const batchDisplay = batch.batchName || (batch.batchNo ? `Batch ${String(batch.batchNo).padStart(2,'0')}` : batch.id);
      const session      = batch.sessionPeriod || '—';

      const cells = d.unifiedGroups.map(ug => {
        const bgd = bd?.testGroups.find(g => g.groupLabel === ug.groupLabel);
        const s   = bgd ? bd.groupStats[bd.testGroups.indexOf(bgd)] : null;
        const bc  = ug.isMock ? '#c4b5fd' : '#93c5fd';
        if (!s) {
          return visibleCols.map((sc, i) => `<td${i===0 ? ` style="border-left:2px solid ${bc}"` : ''}>—</td>`).join('');
        }
        const hl = _health(s.avgPct);
        const rateColor = s.rate >= 80 ? '#16a34a' : s.rate >= 60 ? '#d97706' : s.appeared > 0 ? '#dc2626' : '#94a3b8';
        const hlHex = { 'var(--green)':'#16a34a','var(--yellow)':'#d97706','var(--red)':'#dc2626','var(--t3)':'#64748b' }[hl.color] || '#64748b';
        const cellVals = {
          pass:   s.p,
          fail:   s.f,
          absent: s.ab,
          avg:    s.avg != null ? s.avg : '—',
          rate:   s.appeared > 0 ? `<span style="color:${rateColor};font-weight:700">${s.rate}%</span>` : '—',
          health: `<span style="color:${hlHex};font-weight:700">${hl.label}${s.avgPct != null ? ` (${s.avgPct}%)` : ''}</span>`,
        };
        return visibleCols.map((sc, i) =>
          `<td${i===0 ? ` style="border-left:2px solid ${bc}"` : ''}>${cellVals[sc.key]}</td>`
        ).join('');
      }).join('');

      return `<tr class="${ri%2===0?'even':'odd'}">
        <td style="font-weight:600;white-space:nowrap">${batchDisplay}<br><span style="font-size:8px;color:#64748b">${session}</span></td>
        <td style="white-space:nowrap">${teacherName}</td>
        ${cells}
      </tr>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"/>
<title>Test Result Summary</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:16px 18px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:10px;margin-bottom:10px}
  .header .title{font-size:17px;font-weight:700;color:#1e40af}
  .header .sub{font-size:10px;color:#64748b;margin-top:2px}
  .header .right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
  .meta-bar{display:flex;align-items:center;gap:12px;padding:6px 12px;background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:9px;font-size:10px;color:#1e40af;font-weight:600}
  table.main{width:100%;border-collapse:collapse;font-size:8.5px}
  table.main thead tr.g-row th{background:#1e40af;color:#fff;font-weight:700;padding:5px 7px;text-align:center;font-size:8.5px;white-space:nowrap}
  table.main thead tr.g-row th.left-col{text-align:left;background:#1e40af}
  table.main thead tr.s-row th{background:#1e3a8a;color:#93c5fd;font-size:7.5px;font-weight:600;padding:4px 7px;text-transform:uppercase;letter-spacing:.4px;text-align:center;white-space:nowrap}
  table.main tbody tr.even{background:#fff}table.main tbody tr.odd{background:#f8faff}
  table.main tbody td{padding:4px 6px;border-bottom:1px solid #e2e8f0;vertical-align:middle;color:#334155;text-align:center}
  .footer{margin-top:10px;padding-top:8px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:8.5px;color:#94a3b8}
  @media print{body{padding:8px 10px}@page{size:A4 landscape;margin:6mm}.no-print{display:none}}
</style></head><body>
  <div class="header">
    <div><div class="title">Test Result Summary Report</div><div class="sub">Batch-wise test performance overview</div></div>
    <div class="right"><strong style="color:#1e293b">${dateStr}</strong><div>${timeStr}</div></div>
  </div>
  <div class="meta-bar">🏠 ${d.campusName} <span style="color:#bfdbfe">|</span> 📘 ${d.subjectDisplay}</div>
  <table class="main">
    <thead>
      <tr class="g-row">
        <th class="left-col" rowspan="2">Batch</th>
        <th class="left-col" rowspan="2">Teacher</th>
        ${groupThs}
      </tr>
      <tr class="s-row">${subThs}</tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
  <div class="footer">
    <span>Test Result Summary &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>${d.allBatches.length} batch${d.allBatches.length!==1?'es':''} · ${d.unifiedGroups.length} test${d.unifiedGroups.length!==1?'s':''}</span>
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
};
