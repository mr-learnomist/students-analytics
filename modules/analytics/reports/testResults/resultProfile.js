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

// ── Sub-column definitions (common across every test group) ────
const RP_SUB_COLS = [
  { key: 'marks',  label: 'Marks'  },
  { key: 'status', label: 'Status' },
  { key: 'date',   label: 'Date'   },
];
const RP_COL_PREF_KEY = 'rp_col_prefs';

function _getRpColPrefs() {
  try {
    const raw = AppState.get(RP_COL_PREF_KEY);
    if (raw && Array.isArray(raw.hidden)) return raw;
  } catch(e) {}
  return { hidden: [] };
}
function _saveRpColPrefs(prefs) { AppState.set(RP_COL_PREF_KEY, prefs); }

// ── Styles ─────────────────────────────────────────────────────
let _stylesInjected = false;
function _injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;
  const st = document.createElement('style');
  st.textContent = `
/* ── Page wrap ── */
.rp-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  /* Must NOT have overflow:hidden — filter card needs sticky context */
}

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
  /* Prevent text overflow causing horizontal scroll */
  overflow:hidden; text-overflow:ellipsis;
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

/* Custom scrollbar for isolated table container */
.table-scroll-container {
  overflow-x: scroll;
  overflow-y: auto;
  max-height: calc(100vh - 280px);
  -webkit-overflow-scrolling: touch;
}
.table-scroll-container::-webkit-scrollbar { height:7px; width:7px; }
.table-scroll-container::-webkit-scrollbar-track { background:var(--surface2); border-radius:4px; }
.table-scroll-container::-webkit-scrollbar-thumb { background:var(--border2); border-radius:4px; }
.table-scroll-container::-webkit-scrollbar-thumb:hover { background:var(--t4); }

/* ── Table ── */
.rp-table-wrap {
  overflow-x:auto;
  overflow-y:auto;
  max-height:calc(100vh - 320px);
  border:1px solid var(--border);
  border-radius:12px;
  -webkit-overflow-scrolling:touch;
}
/* Custom scrollbar */
.rp-table-wrap::-webkit-scrollbar { height:7px; width:7px; }
.rp-table-wrap::-webkit-scrollbar-track { background:var(--surface2); border-radius:4px; }
.rp-table-wrap::-webkit-scrollbar-thumb { background:var(--border2); border-radius:4px; }
.rp-table-wrap::-webkit-scrollbar-thumb:hover { background:var(--t4); }
.rp-table {
  width:max-content; min-width:100%; border-collapse:collapse; font-size:12.5px;
}
/* Sticky thead — each row offset by the height of rows above it */
.rp-table thead tr:nth-child(1) th { position:sticky; top:0;    z-index:3; }
.rp-table thead tr:nth-child(2) th { position:sticky; top:56px; z-index:3; }
.rp-table thead tr:nth-child(3) th { position:sticky; top:96px; z-index:3; }

/* ── Freeze: first 3 columns (#, Student ID, Student Name) ── */
/* thead: z-index:5 so frozen header corners sit above both axes */
.rp-table thead th.rp-th-left:nth-child(1),
.rp-table tbody  td:nth-child(1) { position:sticky; left:0;     z-index:2; }
.rp-table thead th.rp-th-left:nth-child(2),
.rp-table tbody  td:nth-child(2) { position:sticky; left:48px;  z-index:2; }
.rp-table thead th.rp-th-left:nth-child(3),
.rp-table tbody  td:nth-child(3) { position:sticky; left:148px; z-index:2; }

/* Frozen header corners: above both sticky header rows AND scrolling body */
.rp-table thead th.rp-th-left { z-index:5 !important; }

/* Frozen body cells need a solid background so data doesn't bleed through */
.rp-table tbody td:nth-child(1),
.rp-table tbody td:nth-child(2),
.rp-table tbody td:nth-child(3) {
  background: var(--surface);
}
.rp-table tbody tr:hover td:nth-child(1),
.rp-table tbody tr:hover td:nth-child(2),
.rp-table tbody tr:hover td:nth-child(3) {
  background: var(--surface2);
}

/* Right shadow on last frozen column to hint more content */
.rp-table thead th.rp-th-left:nth-child(3),
.rp-table tbody  td:nth-child(3) {
  box-shadow: 3px 0 6px -2px rgba(0,0,0,0.18);
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

/* ── Column Manager ── */
.rp-col-mgr-wrap  { position:relative; }
.rp-col-mgr-panel {
  position:fixed; z-index:9999;
  width:200px; background:var(--surface);
  border:1px solid var(--border); border-radius:10px;
  box-shadow:0 8px 32px rgba(0,0,0,.18);
  display:none; flex-direction:column; overflow:hidden;
  max-height:min(340px, calc(100vh - 24px));
}
.rp-col-mgr-panel.open { display:flex; }
.rp-col-mgr-head {
  padding:9px 13px 7px;
  border-bottom:1px solid var(--border);
  display:flex; align-items:center;
  justify-content:space-between; flex-shrink:0;
}
.rp-col-mgr-title {
  font-size:11.5px; font-weight:700; color:var(--t1);
  display:flex; align-items:center; gap:6px;
}
.rp-col-mgr-link {
  font-size:11px; color:var(--blue); cursor:pointer;
  background:none; border:none; padding:0;
  text-decoration:underline; font-weight:600;
}
.rp-col-mgr-link:hover { opacity:.8; }
.rp-col-mgr-list { padding:4px 0; overflow-y:auto; flex:1; }
.rp-col-mgr-item {
  display:flex; align-items:center; gap:8px;
  padding:7px 12px; cursor:default; user-select:none;
  transition:background .1s;
}
.rp-col-mgr-item:hover { background:var(--surface2); }
.rp-col-mgr-chk { width:14px; height:14px; accent-color:var(--blue); cursor:pointer; flex-shrink:0; }
.rp-col-mgr-lbl { font-size:12.5px; color:var(--t1); flex:1; cursor:pointer; }
.rp-col-mgr-item.col-hidden .rp-col-mgr-lbl { color:var(--t4); }
.rp-col-mgr-foot {
  padding:6px 12px; border-top:1px solid var(--border);
  font-size:10.5px; color:var(--t3); text-align:center;
  flex-shrink:0; background:var(--surface2);
}

/* ── Per-test stats strip ── */
.rp-test-stats-strip {
  display:flex; flex-wrap:nowrap; gap:0;
  background:var(--surface);
  border:1px solid var(--border);
  border-top:none;
  border-bottom:none;
  overflow-x:auto;
  -webkit-overflow-scrolling:touch;
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
 * Returns sorted array of "schedule entry" objects (including retest virtual entries).
 */
function _buildEntries({ subjectId, batchId } = {}) {
  const entries = [];

  // LP-derived
  const assignments = getAllAssignments();
  for (const [bid, lpa] of Object.entries(assignments)) {
    if (batchId && bid !== batchId) continue;
    if (!lpa?.rows?.length) continue;
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

  // ── Retest virtual entries (same as testResultsPanel) ──────
  // Full lookup set (no subject filter) so retests always resolve their parent
  const allForLookup = [];
  for (const [bid, lpa] of Object.entries(getAllAssignments())) {
    if (batchId && bid !== batchId) continue;
    if (!lpa?.rows?.length) continue;
    lpa.rows.forEach(row => {
      const rowType = (row.type || '').toLowerCase();
      if (!LP_TEST_TYPES.has(rowType) || !row.date) return;
      const rawTopic = (row.topic || '').trim();
      if (rawTopic && !LP_VALID_RE.test(rawTopic)) return;
      allForLookup.push({ id: `lp__${bid}__${row.id}`, batchId: bid, subjectId: row.subjectId || '' });
    });
  }
  getSchedules().forEach(s => {
    if (batchId && s.batchId !== batchId) return;
    allForLookup.push({ id: s.id, batchId: s.batchId, subjectId: s.subjectId || '' });
  });

  _rpGetRetestEntries().forEach(stub => {
    let parent = entries.find(e => e.id === stub.retestOf);
    if (!parent) {
      const lookup = allForLookup.find(e => e.id === stub.retestOf);
      if (!lookup) return;
      parent = { id: lookup.id, batchId: lookup.batchId, subjectId: lookup.subjectId };
    }
    if (batchId && parent.batchId !== batchId) return;
    const retEntry = _rpMakeRetestEntry(
      entries.find(e => e.id === stub.retestOf) || parent,
      stub.retestDate,
      stub.retestIndex
    );
    retEntry.id = stub.scheduleEntryId;
    if (!entries.find(e => e.id === retEntry.id)) entries.push(retEntry);
  });

  entries.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return entries;
}

/**
 * Build virtual retest entry from a parent entry (mirrors testResultsPanel._makeRetestEntry).
 */
function _rpMakeRetestEntry(parentEntry, retestDate, retestIndex) {
  return {
    ...parentEntry,
    id:          `retest__${parentEntry.id}__${retestIndex}`,
    testName:    `${parentEntry.testName} (Retest #${retestIndex})`,
    date:        retestDate,
    isRetest:    true,
    retestOf:    parentEntry.id,
    retestIndex,
    source:      'retest',
  };
}

/**
 * Read all saved retest stubs from AppState['testResults']
 * (mirrors testResultsPanel._getRetestEntries).
 */
function _rpGetRetestEntries() {
  const all = AppState.get('testResults') || [];
  const map = {};
  all.forEach(r => {
    if (!r.isRetest || !r.retestOf || !r.retestIndex) return;
    const key = `${r.retestOf}__${r.retestIndex}`;
    if (!map[key]) {
      map[key] = {
        retestOf:        r.retestOf,
        retestIndex:     r.retestIndex,
        retestDate:      r.retestDate || '',
        scheduleEntryId: r.scheduleEntryId,
      };
    }
  });
  return Object.values(map);
}

/**
 * Group a flat sorted entries array into test groups.
 * Each group: { groupLabel, isMock, original (entry), retests (entry[]) }
 * Retests are identified by entry.isRetest === true and entry.retestOf === original.id.
 * Non-retest entries become group originals; retests are nested under their parent.
 */
function _groupEntriesWithRetests(entries) {
  const originals = entries.filter(e => !e.isRetest);
  const retests   = entries.filter(e =>  e.isRetest);

  // Label originals: Test 1 / Test 2 / Mock 1 / Mock 2 …
  let testIdx = 0, mockIdx = 0;
  const groups = originals.map(orig => {
    const isMock = orig.testType === 'mock';
    if (isMock) mockIdx++; else testIdx++;
    const groupLabel = isMock
      ? (originals.filter(o => o.testType === 'mock').length === 1 ? 'Mock' : `Mock ${mockIdx}`)
      : `Test ${testIdx}`;

    // Collect retests for this original, sorted by retestIndex
    const myRetests = retests
      .filter(r => r.retestOf === orig.id)
      .sort((a, b) => (a.retestIndex || 0) - (b.retestIndex || 0));

    return { groupLabel, isMock, original: orig, retests: myRetests };
  });
  return groups;
}

/**
 * If any result attached to this schedule entry carries an `actualDate`
 * (the real date the test was held, recorded on import) that differs from
 * the LP-planned date, return it. Otherwise null — meaning the test was
 * held exactly as planned, or has no marks yet.
 */
function _resolveHeldDate(resultsMap, entryId, plannedDate) {
  const bucket = resultsMap[entryId];
  if (!bucket) return null;
  for (const sid in bucket) {
    const ad = bucket[sid] && bucket[sid].actualDate;
    if (ad && ad !== plannedDate) return ad;
  }
  return null;
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
    const onFilterToggleClick = () => {
      this._filterOpen = !this._filterOpen;
      const body  = c.querySelector('#rpFilterBody');
      const arrow = c.querySelector('.rp-filter-arrow');
      body?.classList.toggle('open', this._filterOpen);
      arrow?.classList.toggle('open', this._filterOpen);
      // Update toggle HTML for badge
      const toggle = c.querySelector('#rpFilterToggle');
      if (toggle) toggle.outerHTML = this._filterToggleHTML();
      // Re-bind toggle click (outerHTML replaces node)
      c.querySelector('#rpFilterToggle')?.addEventListener('click', onFilterToggleClick);
    };
    c.querySelector('#rpFilterToggle')?.addEventListener('click', onFilterToggleClick);

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

    // Get all results map: scheduleEntryId → studentId → result record
    const allResults = _getResults();
    const resultsMap = {};
    allResults.forEach(r => {
      if (!resultsMap[r.scheduleEntryId]) resultsMap[r.scheduleEntryId] = {};
      resultsMap[r.scheduleEntryId][r.studentId] = r;
    });

    // Group entries: originals + their retests nested within each group
    // testGroups: [{ groupLabel, isMock, original, retests: [] }]
    const testGroups = _groupEntriesWithRetests(entries);

    // Attach "held on" date — if the test was rescheduled (actual exam date
    // on an imported sheet differs from the LP-planned date), surface it
    // alongside the planned date instead of hiding it.
    testGroups.forEach(g => {
      g.original.heldDate = _resolveHeldDate(resultsMap, g.original.id, g.original.date);
      g.retests.forEach(r => { r.heldDate = _resolveHeldDate(resultsMap, r.id, r.date); });
    });

    // For backward-compat with stats/export helpers keep a flat labelledCols
    // (one entry per group = the original entry, relabelled)
    const labelledCols = testGroups.map(g => ({ ...g.original, colLabel: g.groupLabel, isMock: g.isMock }));

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

    /**
     * Resolve a result record + entry into a cell object.
     * @param {object|null} r - result record from resultsMap
     * @param {object} entry  - calendar entry (original or retest)
     */
    function _resolveCell(r, entry) {
      const effectiveTotalMarks   = r?.totalMarks   || entry.totalMarks   || null;
      const effectivePassingMarks = r?.passingMarks || entry.passingMarks ||
        (effectiveTotalMarks ? Math.ceil(Number(effectiveTotalMarks) * 0.5) : null);
      const marks  = r ? r.marks  : null;
      const absent = r ? !!r.absent : false;
      const status = absent
        ? 'absent'
        : marks == null
          ? 'pending'
          : (effectivePassingMarks && Number(marks) >= Number(effectivePassingMarks)) ? 'pass'
          : 'fail';
      return { entry, marks, absent, status, totalMarks: effectiveTotalMarks, hasRecord: !!r };
    }

    /**
     * Compute effective cell for a student across all attempts in a group.
     * Effective = latest attempt that has an actual record (not missing).
     * Absent counts as a record (deliberately marked).
     * If no attempts have a record → pending.
     */
    function _effectiveCell(attempts) {
      // attempts sorted original → retest#1 → retest#2 … (already in order)
      // Walk backwards to find latest with a record
      for (let i = attempts.length - 1; i >= 0; i--) {
        if (attempts[i].hasRecord) return attempts[i];
      }
      // No record anywhere → return original as pending
      return attempts[0];
    }

    // Per-student rows: each row has groupCols array, one per testGroup
    // groupCols[i] = { group, attempts: [cell, ...], effective: cell }
    const tableRows = students.map(st => {
      const studentName = (st.studentName || `${st.firstName||''} ${st.lastName||''}`.trim() || '—');
      const studentId   = st.studentId || st.id || '—';

      const groupCols = testGroups.map(g => {
        // Build attempt cells: original first, then retests in order
        const allAttempts = [g.original, ...g.retests].map(entry => {
          const r = (resultsMap[entry.id] || {})[st.id] || null;
          return _resolveCell(r, entry);
        });
        const effective = _effectiveCell(allAttempts);
        return { group: g, attempts: allAttempts, effective };
      });

      // For backward-compat with existing stats code: flat cols = effective cell per group
      const cols = groupCols.map(gc => ({
        col:        { ...gc.group.original, colLabel: gc.group.groupLabel, isMock: gc.group.isMock },
        marks:      gc.effective.marks,
        absent:     gc.effective.absent,
        status:     gc.effective.status,
        totalMarks: gc.effective.totalMarks,
      }));

      return { st, studentName, studentId, groupCols, cols };
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
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
            <!-- Column Manager button -->
            <div class="rp-col-mgr-wrap">
              <button id="rpColMgrBtn" title="Show / hide columns"
                style="display:inline-flex;align-items:center;justify-content:center;
                       width:30px;height:30px;border-radius:8px;
                       border:1px solid var(--border);background:var(--surface2);
                       color:var(--t3);cursor:pointer;transition:all .15s">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="18" rx="1"/>
                  <rect x="14" y="3" width="7" height="18" rx="1"/>
                </svg>
              </button>
              <div class="rp-col-mgr-panel" id="rpColMgrPanel">
                <div class="rp-col-mgr-head">
                  <span class="rp-col-mgr-title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
                    </svg>
                    Columns
                  </span>
                  <button class="rp-col-mgr-link" id="rpColMgrShowAll">Show All</button>
                </div>
                <div class="rp-col-mgr-list" id="rpColMgrList"></div>
                <div class="rp-col-mgr-foot">Applies to all tests</div>
              </div>
            </div>
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

    // ── Column visibility prefs ────────────────────────────────
    const _rpPrefs    = _getRpColPrefs();
    const _showMarks  = !_rpPrefs.hidden.includes('marks');
    const _showStatus = !_rpPrefs.hidden.includes('status');
    const _showDate   = !_rpPrefs.hidden.includes('date');
    // Exact number of <td>s rendered per attempt — drives ALL colspan math
    const _subCount   = (_showMarks ? 1 : 0) + (_showStatus ? 1 : 0) + (_showDate ? 1 : 0) || 1;

    // ── Info bar ───────────────────────────────────────────────
    const batchDisplayName = batchObj.batchName || batchNo;
    const infoBarHTML = `
      <div style="display:flex;align-items:center;gap:0;
                  background:var(--surface2);border:1px solid var(--border);
                  border-bottom:none;border-radius:12px 12px 0 0;padding:9px 16px;overflow:hidden">
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

    // ── ROW 1: Test group headers ──────────────────────────────
    // #/Student ID/Student Name → rowspan="3" (clears rows 2 & 3 automatically)
    // Each test group th → colspan = totalAttempts × _subCount
    const groupHeaderRow = `
      <tr class="rp-thead-group">
        <th class="rp-th-left" rowspan="3" style="vertical-align:middle;width:48px;min-width:48px;max-width:48px">#</th>
        <th class="rp-th-left" rowspan="3" style="vertical-align:middle;width:100px;min-width:100px;max-width:100px">Student ID</th>
        <th class="rp-th-left" rowspan="3" style="vertical-align:middle;width:160px;min-width:160px;max-width:160px">Student Name</th>
        ${testGroups.map((g, gi) => {
          const s            = colStats[gi];
          const totalAttempts = 1 + g.retests.length;
          const groupColspan  = totalAttempts * _subCount;
          return `
          <th colspan="${groupColspan}"
              class="${g.isMock ? 'rp-th-mock-group' : 'rp-th-test-group'}"
              style="vertical-align:bottom;padding-bottom:6px">
            <div style="display:flex;flex-direction:column;align-items:center;gap:3px">
              <span style="font-size:11.5px;font-weight:800">${g.groupLabel}</span>
              ${g.original.date ? `<span style="font-size:9.5px;font-weight:500;opacity:.7">${formatDate(g.original.date)}</span>` : ''}
              ${g.original.heldDate ? `<span style="font-size:9px;font-weight:700;color:var(--yellow)" title="Actual date the test was held">Held: ${formatDate(g.original.heldDate)}</span>` : ''}
              <div style="width:100%;min-width:80px;margin-top:3px">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;gap:4px">
                  <span style="font-size:9px;color:var(--t3);white-space:nowrap">✓${s.p} ✗${s.f}${s.ab ? ` ⊘${s.ab}` : ''}</span>
                  <span style="font-size:10px;font-weight:800;color:${s.color};white-space:nowrap">${s.appeared > 0 ? s.rate + '%' : '—'}</span>
                </div>
                <div style="height:4px;background:rgba(0,0,0,0.1);border-radius:2px;overflow:hidden">
                  <div style="height:100%;width:${s.rate}%;background:${s.color};border-radius:2px;transition:width .3s"></div>
                </div>
              </div>
            </div>
          </th>`;
        }).join('')}
      </tr>`;

    // ── ROW 2: Attempt labels ──────────────────────────────────
    // NO placeholder cells — rowspan="3" on fixed cols already reserves this space
    // Each attempt th → colspan = _subCount
    const attemptHeaderRow = `
      <tr class="rp-thead-group" style="background:var(--surface3)">
        ${testGroups.map(g => {
          const attemptEntries = [g.original, ...g.retests];
          return attemptEntries.map((entry, ai) => {
            const label   = ai === 0 ? '1st Attempt' : `Retest #${entry.retestIndex || ai}`;
            const isFirst = ai === 0;
            return `<th colspan="${_subCount}"
              style="text-align:center;font-size:9.5px;font-weight:700;padding:5px 8px;
                     color:var(--t2);white-space:nowrap;
                     ${isFirst ? 'border-left:2px solid var(--border2)' : ''}">${label}</th>`;
          }).join('');
        }).join('')}
      </tr>`;

    // ── ROW 3: Sub-column labels ───────────────────────────────
    // NO placeholder cells — rowspan="3" covers fixed cols
    // Render only visible sub-columns per attempt per group
    const subHeaderRow = `
      <tr class="rp-thead-sub">
        ${testGroups.map(g => {
          const attemptEntries = [g.original, ...g.retests];
          return attemptEntries.map((entry, ai) => {
            const isFirst = ai === 0;
            const subs = [];
            if (_showMarks)  subs.push(`<th class="${isFirst ? 'rp-sub-sep' : ''}" style="min-width:80px">Marks</th>`);
            if (_showStatus) subs.push(`<th${!_showMarks && isFirst ? ' class="rp-sub-sep"' : ''} style="min-width:70px">Status</th>`);
            if (_showDate)   subs.push(`<th${!_showMarks && !_showStatus && isFirst ? ' class="rp-sub-sep"' : ''} style="min-width:90px">Date</th>`);
            return subs.join('');
          }).join('');
        }).join('')}
      </tr>`;

    // ── TBODY ─────────────────────────────────────────────────
    // student → groups → attempts → sub-columns (mirrors thead exactly)
    const bodyHTML = tableRows.map((row, ri) => `
      <tr>
        <td style="color:var(--t1);font-size:11.5px;text-align:center">${ri + 1}</td>
        <td style="font-size:12px;color:var(--t1);font-family:var(--font-mono,monospace)">${row.studentId}</td>
        <td style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:160px"
            title="${row.studentName}">${row.studentName}</td>
        ${row.groupCols.map(gc =>
          gc.attempts.map((cell, ai) => {
            const isFirst    = ai === 0;
            const isEffective = cell === gc.effective;
            const perfBg    = cell.status === 'pass'   ? 'var(--green-dim)'
                            : cell.status === 'fail'   ? 'var(--red-dim)'
                            : cell.status === 'absent' ? 'var(--yellow-dim)'
                            : 'transparent';
            const perfColor = cell.status === 'pass'   ? 'var(--green)'
                            : cell.status === 'fail'   ? 'var(--red)'
                            : cell.status === 'absent' ? 'var(--yellow)'
                            : 'var(--t4)';
            const pct = (cell.marks != null && !cell.absent && cell.totalMarks)
              ? Math.round((Number(cell.marks) / Number(cell.totalMarks)) * 100) : null;
            const hlIcon  = pct == null ? '' : pct >= 80 ? '●' : pct >= 70 ? '▲' : '⚠';
            const hlLabel = pct == null ? '' : pct >= 80 ? 'Healthy' : pct >= 70 ? 'At Risk' : 'Danger';
            const hlColor = pct == null ? 'var(--t3)' : pct >= 80 ? 'var(--green)' : pct >= 70 ? 'var(--yellow)' : 'var(--red)';
            const hlBadge = pct != null
              ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:700;color:${hlColor};white-space:nowrap">${hlIcon} ${hlLabel}</span>`
              : '';
            const effectiveDot = isEffective && gc.attempts.length > 1
              ? `<span title="Effective result" style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${perfColor || 'var(--t4)'};margin-left:3px;vertical-align:middle;opacity:.8"></span>`
              : '';
            const marksDisplay = cell.absent
              ? `<span style="font-weight:700;color:var(--yellow)">Ab</span>`
              : cell.marks != null
                ? `<div style="display:flex;flex-direction:column;gap:1px;min-width:0">
                     <span style="font-weight:700;font-family:var(--font-mono,monospace);color:${perfColor};white-space:nowrap">${cell.marks}${cell.totalMarks ? `<span style="font-weight:400;color:var(--t3)">/${cell.totalMarks}</span>` : ''}${effectiveDot}</span>
                     ${hlBadge}
                   </div>`
                : `<span style="color:var(--t3)">—</span>`;
            const leftBorder = isFirst ? 'border-left:2px solid var(--border2)' : '';
            const tdBg = isEffective && gc.attempts.length > 1 ? `background:${perfBg}` : '';

            // Retest with no data at all (not absent, no marks) → all 3 cells blank
            const isEmptyRetest = !isFirst && cell.marks == null && !cell.absent;

            return [
              _showMarks  ? `<td style="white-space:nowrap;padding:8px 10px;vertical-align:middle;${leftBorder};${tdBg}">${isEmptyRetest ? '' : marksDisplay}</td>` : '',
              _showStatus ? `<td style="${!_showMarks && isFirst ? 'border-left:2px solid var(--border2);' : ''}padding:8px 10px;vertical-align:middle;${tdBg}">${isEmptyRetest ? '' : this._statusBadge(cell.status)}</td>` : '',
              _showDate   ? `<td style="${!_showMarks && !_showStatus && isFirst ? 'border-left:2px solid var(--border2);' : ''}font-size:11.5px;color:var(--t1);white-space:nowrap;padding:8px 10px;vertical-align:middle;${tdBg}">${isEmptyRetest ? '' : ((cell.entry.heldDate || cell.entry.date) ? formatDate(cell.entry.heldDate || cell.entry.date) : '—')}</td>` : '',
            ].join('');
          }).join('')
        ).join('')}
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
                ${col.heldDate ? `<div class="rp-test-stat-date" style="color:var(--yellow);font-weight:700">Held: ${formatDate(col.heldDate)}</div>` : ''}
              </div>
              <span style="display:inline-flex;align-items:center;gap:3px;flex-shrink:0;
                           background:${s.hlBg};color:${s.hlColor};
                           padding:2px 7px;border-radius:20px;font-size:9.5px;font-weight:700;white-space:nowrap">
                ${s.hlIcon} ${s.hlLabel}${s.avgPct != null ? ` (${s.avgPct}%)` : ''}
              </span>
            </div>
            <div class="rp-test-stat-counts" style="margin-bottom:6px">
              ${s.isDone
                ? `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--green-dim);color:var(--green);padding:1px 8px;border-radius:20px;font-size:10.5px;font-weight:700">✓ Done</span>`
                : `<span style="display:inline-flex;align-items:center;gap:3px;background:var(--surface3);color:var(--t3);padding:1px 8px;border-radius:20px;font-size:10.5px;font-weight:700">· Pending</span>`
              }
              ${s.p    ? `<span class="rp-test-count-pill rp-tpill-pass">✓ ${s.p} Pass</span>`       : ''}
              ${s.f    ? `<span class="rp-test-count-pill rp-tpill-fail">✗ ${s.f} Fail</span>`       : ''}
              ${s.ab   ? `<span class="rp-test-count-pill rp-tpill-absent">⊘ ${s.ab} Absent</span>`  : ''}
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

    // ── Assemble: statsHTML + testStatsStrip stay outside scroll container ──
    // Only the <table> lives inside the isolated scroll container
    area.innerHTML = statsHTML + testStatsStripHTML + infoBarHTML + `
      <div class="table-scroll-container"
           style="width:100%;overflow-x:scroll;overflow-y:auto;
                  max-height:calc(100vh - 280px);
                  -webkit-overflow-scrolling:touch;
                  border:1px solid var(--border);border-top:none;
                  border-radius:0 0 12px 12px;
                  scrollbar-width:thin;scrollbar-color:var(--border2) var(--surface2)">
        <table class="rp-table"
               style="width:max-content;min-width:100%;border-collapse:collapse;font-size:12.5px">
          <thead>
            ${groupHeaderRow}
            ${attemptHeaderRow}
            ${subHeaderRow}
          </thead>
          <tbody>
            ${bodyHTML}
          </tbody>
        </table>
      </div>
    `;

    // Wire export buttons
    const _exportData = { tableRows, labelledCols, testGroups, campusName, batchDisplayName, session, subjectCode,
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

    // ── Column Manager wiring ───────────────────────────────────
    this._wireColManager(area, c);
  },

  // ── Column Manager ────────────────────────────────────────────
  _wireColManager(area, c) {
    const btn   = area.querySelector('#rpColMgrBtn');
    const panel = area.querySelector('#rpColMgrPanel');
    const list  = area.querySelector('#rpColMgrList');
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
      const prefs = _getRpColPrefs();
      list.innerHTML = '';
      RP_SUB_COLS.forEach(sc => {
        const isVisible = !prefs.hidden.includes(sc.key);
        const item = document.createElement('div');
        item.className = 'rp-col-mgr-item' + (isVisible ? '' : ' col-hidden');
        item.innerHTML =
          `<input type="checkbox" class="rp-col-mgr-chk" id="rp_chk_${sc.key}"${isVisible ? ' checked' : ''}/>`+
          `<label class="rp-col-mgr-lbl" for="rp_chk_${sc.key}">${sc.label}</label>`;
        item.querySelector('.rp-col-mgr-chk').addEventListener('change', e => {
          const p = _getRpColPrefs();
          if (e.target.checked) {
            p.hidden = p.hidden.filter(h => h !== sc.key);
            item.classList.remove('col-hidden');
          } else {
            if (!p.hidden.includes(sc.key)) p.hidden.push(sc.key);
            item.classList.add('col-hidden');
          }
          _saveRpColPrefs(p);
          panel.classList.remove('open');
          this._renderTable(c);    // re-render table with new prefs
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

    // Show All
    area.querySelector('#rpColMgrShowAll')?.addEventListener('click', () => {
      _saveRpColPrefs({ hidden: [] });
      panel.classList.remove('open');
      this._renderTable(c);
    });

    // Close on outside click
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
  _buildExportRows({ tableRows, testGroups }) {
    const rows = [];
    tableRows.forEach(row => {
      row.groupCols.forEach((gc, gi) => {
        // Export one row per attempt per student
        const allAttempts = [gc.group.original, ...gc.group.retests];
        gc.attempts.forEach((cell, ai) => {
          const entry       = allAttempts[ai];
          const attemptLabel = ai === 0 ? gc.group.groupLabel : `${gc.group.groupLabel} (Retest #${entry.retestIndex || ai})`;
          const isEffective  = cell === gc.effective;
          rows.push({
            'Student':    row.studentName  || '—',
            'Student ID': row.studentId    || '—',
            'Test':       attemptLabel,
            'Date':       entry.date ? formatDate(entry.date) : '—',
            'Marks':      cell.marks != null
              ? (cell.totalMarks ? `${cell.marks}/${cell.totalMarks}` : String(cell.marks))
              : (cell.absent ? 'Absent' : '—'),
            'Status':     cell.status === 'pass'   ? 'Pass'
                        : cell.status === 'fail'   ? 'Fail'
                        : cell.status === 'absent' ? 'Absent' : 'Pending',
            'Effective':  isEffective ? 'Yes' : 'No',
          });
        });
      });
    });
    return rows;
  },

  // ── Export CSV — table jaisi wide format ─────────────────────
  // Screen table ki exact copy:
  //   Row 1 (group header): #, Student ID, Student Name, Test 1,,, Test 1 (Retest #1),,,, Test 2,,,  ...
  //   Row 2 (attempt label): blank x3, 1st Attempt,,, Retest #1,,,  ...
  //   Row 3 (sub-columns) : blank x3, Marks, Status, Date, Marks, Status, Date ...
  //   Data rows           : one row per student
  _exportCSV(d) {
    if (!d.tableRows.length) { alert('No results to export.'); return; }

    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    // Helper: escape a value for CSV
    const esc = v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

    // ── Meta lines ────────────────────────────────────────────
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

    // ── Build column map: per testGroup → attempts array ──────
    // Mirrors exactly what the table renders
    // groupCols = [{ groupLabel, isMock, original, retests[] }]
    const colMap = d.testGroups.map(g => ({
      groupLabel: g.groupLabel,
      attempts: [
        { label: '1st Attempt', entry: g.original, isRetest: false },
        ...g.retests.map((r, ri) => ({ label: `Retest #${r.retestIndex || ri + 1}`, entry: r, isRetest: true })),
      ],
    }));

    // Fixed left columns: 3
    const LEFT = ['#', 'Student ID', 'Student Name'];

    // ── ROW 1: Group header ───────────────────────────────────
    // Each attempt = 3 sub-cols (Marks, Status, Date)
    const row1 = [
      ...LEFT,
      ...colMap.flatMap(g =>
        g.attempts.flatMap((_, ai) =>
          ai === 0
            ? [g.groupLabel, '', '']   // group label only on 1st attempt's first sub-col
            : ['', '', '']             // merged cells → blank in CSV
        )
      ),
    ];

    // ── ROW 2: Attempt labels ────────────────────────────────
    const row2 = [
      '', '', '',
      ...colMap.flatMap(g =>
        g.attempts.flatMap(a => [a.label, '', ''])
      ),
    ];

    // ── ROW 3: Sub-column headers ────────────────────────────
    const row3 = [
      ...LEFT,
      ...colMap.flatMap(g =>
        g.attempts.flatMap(() => ['Marks', 'Status', 'Date'])
      ),
    ];

    // ── Data rows ────────────────────────────────────────────
    const dataRows = d.tableRows.map((row, ri) => {
      const cells = [];
      cells.push(String(ri + 1));
      cells.push(row.studentId  || '—');
      cells.push(row.studentName || '—');

      colMap.forEach((g, gi) => {
        const gc = row.groupCols[gi]; // { group, attempts[], effective }
        g.attempts.forEach((attemptDef, ai) => {
          const cell = gc ? gc.attempts[ai] : null;

          // Marks: "obtained/total" or "Absent" or "—"
          let marksVal = '—';
          if (cell) {
            if (cell.absent) {
              marksVal = 'Absent';
            } else if (cell.marks != null) {
              marksVal = cell.totalMarks
                ? `${cell.marks}/${cell.totalMarks}`
                : String(cell.marks);
            } else if (attemptDef.isRetest && !cell.hasRecord) {
              marksVal = '';  // empty retest → blank (matches screen behaviour)
            }
          }

          // Status
          let statusVal = '';
          if (cell) {
            if (attemptDef.isRetest && cell.marks == null && !cell.absent) {
              statusVal = '';  // empty retest → blank
            } else {
              statusVal = cell.status === 'pass'   ? 'Pass'
                        : cell.status === 'fail'   ? 'Fail'
                        : cell.status === 'absent' ? 'Absent'
                        : 'Pending';
            }
          }

          // Date
          let dateVal = '';
          if (cell && !(attemptDef.isRetest && cell.marks == null && !cell.absent)) {
            dateVal = cell.entry?.date ? formatDate(cell.entry.date) : '—';
          }

          cells.push(marksVal, statusVal, dateVal);
        });
      });

      return cells;
    });

    // ── Assemble CSV ─────────────────────────────────────────
    const allRows = [
      metaLines,
      row1.map(esc).join(','),
      row2.map(esc).join(','),
      row3.map(esc).join(','),
      ...dataRows.map(r => r.map(esc).join(',')),
    ];

    const blob = new Blob([allRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Result-Profile-${d.batchDisplayName}-${dateStr.replace(/ /g, '-')}.csv`;
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
        ${col.date ? `<div style="font-size:8.5px;color:#64748b;margin-bottom:2px">${formatDate(col.date)}</div>` : ''}
        ${col.heldDate ? `<div style="font-size:8px;color:#b45309;font-weight:700;margin-bottom:4px">Held: ${formatDate(col.heldDate)}</div>` : '<div style="margin-bottom:4px"></div>'}
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
      return `<th colspan="3" style="text-align:center;background:${bg};color:${color};
                font-size:9px;font-weight:700;padding:5px 8px;
                border-left:2px solid ${col.isMock ? '#c4b5fd' : '#93c5fd'};
                white-space:nowrap">
        ${col.colLabel}${col.date ? `<br><span style="font-weight:500;font-size:8px;opacity:.8">${formatDate(col.date)}</span>` : ''}${col.heldDate ? `<br><span style="font-weight:700;font-size:7.5px;color:#fde68a">Held: ${formatDate(col.heldDate)}</span>` : ''}
      </th>`;
    }).join('');

    const subThs = d.labelledCols.map(col => {
      const bc = col.isMock ? '#c4b5fd' : '#93c5fd';
      return `<th style="border-left:2px solid ${bc}">Marks</th><th>Status</th><th>Date</th>`;
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
            ? `<strong style="color:${sc[cell.status]||'#64748b'}">${cell.marks}${cell.totalMarks ? `<span style="font-weight:400;color:#94a3b8">/${cell.totalMarks}</span>` : ''}</strong><br><span style="font-size:8px;font-weight:700;color:${hlHex}">${hlIcon} ${hlLabel}</span>`
            : '—';
        const statusBadge = `<span style="color:${sc[cell.status]||'#64748b'};background:${bg};padding:1px 7px;border-radius:20px;font-size:8px;font-weight:700;white-space:nowrap">${cell.status==='pass'?'Pass':cell.status==='fail'?'Fail':cell.status==='absent'?'Absent':'Pending'}</span>`;
        return `<td style="border-left:2px solid ${bc};background:${bg}">${marksCell}</td><td style="background:${bg}">${statusBadge}</td><td style="color:#64748b;white-space:nowrap">${(col.heldDate || col.date) ? formatDate(col.heldDate || col.date) : '—'}</td>`;
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
