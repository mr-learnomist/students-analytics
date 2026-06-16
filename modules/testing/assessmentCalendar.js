// ============================================================
// modules/testing/assessmentCalendar.js — Assessment Calendar Tab
// Tab 2: Visual month/week calendar view of all scheduled tests
//
// ── NEW FEATURE ──────────────────────────────────────────────
// LP-derived entries: Reads ALL batch LP assignments, finds rows
// with type Test / Midterm / Mock, and surfaces them as calendar
// entries alongside manually-scheduled testingService entries.
//
// Auto-sync: Subscribes to AppState changes on 'lpAssignments'
// and 'testSchedules' so that whenever a lecture plan is updated
// (dates shift, row added/removed) the calendar re-renders
// automatically without any user interaction.
// ============================================================

import { AppState }          from '../../utils/state.js';
import { Auth }              from '../../utils/auth.js';
import {
  getSchedules,
  getScheduleStatus, STATUS_META,
  TEST_TYPE_META, TEST_TYPES,
  formatDate,
} from './testingService.js';
import {
  getAllAssignments,
} from '../lecturePlan/lecturePlanService.js';

// ── Constants ─────────────────────────────────────────────────
const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Row types that should appear in the Assessment Calendar
const LP_TEST_TYPES = new Set(['test', 'midterm', 'mock']);

// Source tag so we can visually distinguish LP entries from
// manually-scheduled test entries.
const SOURCE_LP       = 'lp';       // derived from lecture plan
const SOURCE_SCHEDULE = 'schedule'; // from testingService schedules

// ── Column definitions (for the column manager / selector) ────
// 'locked' columns are always visible and cannot be hidden.
// Order here = display order in the table and in exports.
const AC_COLUMNS = [
  { key: 'date',    label: 'Date',       locked: true  },
  { key: 'name',    label: 'Assessment', locked: true  },
  { key: 'batch',   label: 'Batch',      locked: false },
  { key: 'campus',  label: 'Campus',     locked: false },
  { key: 'subject', label: 'Subject',    locked: false },
  { key: 'room',    label: 'Room',       locked: false },
  { key: 'teacher', label: 'Teacher',    locked: false },
  { key: 'status',  label: 'Status',     locked: false },
  { key: 'source',  label: 'Source',     locked: false },
];
const AC_SORTABLE_COLS = new Set(['date', 'name', 'batch', 'campus', 'subject', 'status', 'source']);
const AC_COL_PREF_KEY  = 'ac_col_prefs';

function _getAcColPrefs() {
  try {
    const raw = AppState.get(AC_COL_PREF_KEY);
    if (raw && Array.isArray(raw.hidden)) return raw;
  } catch (e) {}
  return { hidden: [] };
}
function _saveAcColPrefs(prefs) { AppState.set(AC_COL_PREF_KEY, prefs); }

// ── Room overrides ──────────────────────────────────────────
// Room is a manually-entered field (not derived from any data
// source), kept per-entry so it survives re-renders / re-filters.
const AC_ROOM_PREF_KEY = 'ac_room_overrides';

function _getRoomOverrides() {
  try {
    const raw = AppState.get(AC_ROOM_PREF_KEY);
    if (raw && typeof raw === 'object') return raw;
  } catch (e) {}
  return {};
}
function _saveRoomOverrides(map) { AppState.set(AC_ROOM_PREF_KEY, map); }
function _getRoomForEntry(entryId) {
  const map = _getRoomOverrides();
  return map[entryId] || '';
}
function _setRoomForEntry(entryId, value) {
  const map = _getRoomOverrides();
  const v = (value || '').trim();
  if (v) map[entryId] = v; else delete map[entryId];
  _saveRoomOverrides(map);
}

// ── Teacher lookup ──────────────────────────────────────────
// Same resolution rule used by the Test Result Summary report:
// a batch's assigned teacher can live under any of these keys
// depending on how the batch record was created.
function _getTeacherName(batch) {
  if (!batch) return '—';
  const tid = batch.lecturerId || batch.teacherId || batch.instructorId || '';
  if (!tid) return '—';
  const pool = AppState.get('lecturers') || AppState.get('teachers') || AppState.get('instructors') || [];
  const t = pool.find(x => x.id === tid);
  if (!t) return '—';
  return t.name || t.fullName || `${t.firstName || ''} ${t.lastName || ''}`.trim() || '—';
}

// ── LP Topic validator ────────────────────────────────────────
// Checks whether a row's topic string is actually a test label
// (e.g. "Test", "Test 1", "Midterm", "Mock", "Mock 2") rather
// than a chapter/topic name like "Internal Control Test".
//
// Rules:
//   • Empty topic  → always valid (will use default label)
//   • "test"       → valid (exactly the word "test", case-insensitive)
//   • "test <N>"   → valid, where N is one or more digits
//                    e.g. "Test 1", "TEST 2", "test 10"
//   • "midterm"    → valid (exact word, optional trailing number)
//                    e.g. "Midterm", "Mid Term", "Midterm 1"
//   • "mock"       → valid (exact word, optional trailing number)
//                    e.g. "Mock", "Mock 1", "Mock Exam", "Mock Exam 2"
//   • Anything else → INVALID → row is skipped
//
// This intentionally rejects topics like "Internal Control Test",
// "Final Accounts Test", "Chapter 3 Mock" etc. because those are
// content names, not assessment identifiers.
//
const LP_VALID_TOPIC_RE = /^(?:test(?:\s+\d+)?|mid[\s-]?term(?:\s+\d+)?|mock(?:\s+exam)?(?:\s+\d+)?)$/i;

function _isValidTestTopic(topic, rowType) {
  const t = (topic || '').trim();

  // Empty topic is always fine — we'll use the default label
  if (!t) return true;

  // Must match one of the expected assessment-name patterns
  return LP_VALID_TOPIC_RE.test(t);
}

// ── LP Entry builder ──────────────────────────────────────────
// Converts a raw LP assignment row into a "virtual schedule"
// object that has the same shape as a testingService schedule,
// making it trivial to render both kinds with the same chip/
// detail code.
//
// Virtual schedule shape:
//   id, date, testName, testType, batchId, batchName,
//   lpTitle, lpCode, source: SOURCE_LP, status (computed)
//
function buildLPEntries() {
  const assignments = getAllAssignments();  // { batchId: { lpId, lpCode, lpTitle, rows, ... } }
  const entries     = [];

  for (const [batchId, lpa] of Object.entries(assignments)) {
    if (!(lpa && lpa.rows && lpa.rows.length)) continue;

    const batch = AppState.findById('batches', batchId) || {};

    lpa.rows.forEach(row => {
      const rowType = (row.type || '').toLowerCase();
      if (!LP_TEST_TYPES.has(rowType)) return;  // only Test / Midterm / Mock rows
      if (!row.date) return;                     // skip undated rows

      const rawTopic = (row.topic || '').trim();

      // ── KEY FIX ───────────────────────────────────────────────
      // Skip rows whose topic looks like a chapter/content name
      // rather than an assessment identifier.
      // e.g. "Internal Control Test" → SKIPPED
      //      "Test 1"                → INCLUDED
      //      "Mock Exam"             → INCLUDED
      //      ""  (empty)             → INCLUDED (uses default label)
      // ─────────────────────────────────────────────────────────
      if (!_isValidTestTopic(rawTopic, rowType)) return;

      // Build a clean display name
      // e.g. "Test 1", "Mock Exam 2", "Midterm", "Test"
      const testName = rawTopic || _defaultTestLabel(rowType);

      entries.push({
        // Use a stable composite id so re-renders don't cause flicker
        id:         `lp__${batchId}__${row.id}`,
        date:       row.date,
        testName,
        testType:   _normaliseType(rowType),   // map to TEST_TYPES values
        batchId,
        batchName:  batch.batchName || '—',
        lpId:       lpa.lpId,
        lpCode:     lpa.lpCode   || '',
        lpTitle:    lpa.lpTitle  || '',
        rowStatus:  row.status   || 'Pending', // Done / Pending from LP
        source:     SOURCE_LP,
        // Fields used by the detail modal
        time:           row.time        || '',
        totalMarks:     row.totalMarks  || '',
        passingMarks:   row.passingMarks|| '',
        venue:          row.venue       || '',
        notes:          row.remarks     || '',
        durationMinutes: row.hours ? Math.round(row.hours * 60) : null,
      });
    });
  }

  return entries;
}

function _defaultTestLabel(type) {
  if (type === 'midterm') return 'Midterm';
  if (type === 'mock')    return 'Mock Exam';
  return 'Test';
}

// Maps LP row type → value used in TEST_TYPE_META
function _normaliseType(type) {
  if (type === 'midterm') return 'midterm';
  if (type === 'mock')    return 'mock';
  return 'written'; // generic "Test" → written chip style
}

// Compute a display status for an LP-derived entry
function getLPEntryStatus(entry) {
  if (entry.rowStatus === 'Done') return 'completed';
  if (!entry.date) return 'draft';
  const today     = new Date(); today.setHours(0, 0, 0, 0);
  const entryDate = new Date(entry.date + 'T00:00:00');
  if (entryDate < today)                        return 'overdue';
  if (entryDate.getTime() === today.getTime())  return 'today';
  return 'upcoming';
}

// ── Module export ─────────────────────────────────────────────
export const AssessmentCalendarTab = {

  // ── State ──────────────────────────────────────────────────
  _year:  new Date().getFullYear(),
  _month: new Date().getMonth(),
  _view:  'table',
  _weekStart: null,       // Date object: start of week nav (used for prev/next)
  _dateFrom: '',          // manual date range start (YYYY-MM-DD)
  _dateTo:   '',          // manual date range end   (YYYY-MM-DD)
  _dateMode: 'week',      // 'week' | 'range'  — which filter is active
  _filterCampus: [],      // multi-select arrays
  _filterBatch:  [],
  _filterStatus: [],
  _filterSource: [],
  _filterDisc:   [],      // discipline filter (from LP Timeline)
  _filterLevel:  [],      // level filter (from LP Timeline)
  _filterSession:[],      // session filter (from LP Timeline)
  _container: null,
  _unsubscribers: [],

  // ── Mount ───────────────────────────────────────────────────
  mount(container) {
    this._container = container;
    this._year  = new Date().getFullYear();
    this._month = new Date().getMonth();
    this._view  = 'table';
    this._weekStart    = this._getThisWeekMonday();
    this._dateFrom     = '';
    this._dateTo       = '';
    this._dateMode     = 'week';
    this._filterCampus = [];
    this._filterBatch  = [];
    this._filterStatus = [];
    this._filterSource = [];
    this._filterDisc   = [];
    this._filterLevel  = [];
    this._filterSession= [];
    this._unsubscribers = [];

    this._injectStyles();
    container.innerHTML = this._shellTemplate();
    this._attachControls(container);
    this._renderCalendar();

    // ── Auto-sync subscriptions ──────────────────────────────
    // AppState.subscribe fires the callback whenever the given
    // key changes — this keeps the calendar live without polling.
    this._subscribe('lpAssignments');
    this._subscribe('testSchedules');
  },

  // ── Subscribe to AppState key changes ──────────────────────
  _subscribe(key) {
    // AppState.subscribe returns an unsubscribe function (if
    // the implementation supports it), otherwise we fall back
    // to a lightweight polling approach so the feature works
    // even on older AppState builds.
    if (typeof AppState.subscribe === 'function') {
      const unsub = AppState.subscribe(key, () => {
        if ((this._container && this._container.isConnected)) {
          this._renderCalendar();
        } else {
          this._cleanup();
        }
      });
      if (typeof unsub === 'function') {
        this._unsubscribers.push(unsub);
      }
    } else {
      // Polling fallback: check every 2 s for changes
      let last = JSON.stringify(AppState.get(key));
      const timer = setInterval(() => {
        if (!(this._container && this._container.isConnected)) { clearInterval(timer); return; }
        const cur = JSON.stringify(AppState.get(key));
        if (cur !== last) { last = cur; this._renderCalendar(); }
      }, 2000);
      this._unsubscribers.push(() => clearInterval(timer));
    }
  },

  // ── Cleanup subscriptions ───────────────────────────────────
  _cleanup() {
    this._unsubscribers.forEach(fn => fn());
    this._unsubscribers = [];
  },

  // ── Shell (toolbar + calendar area) ────────────────────────
  _shellTemplate() {
    const batches     = AppState.get('batches')      || [];
    const campuses    = AppState.get('campuses')     || [];
    const disciplines = AppState.get('disciplines')  || [];
    const levels      = AppState.get('levels')       || [];
    const subjects    = AppState.get('subjects')     || [];

    // Session periods — derive from batches that have LP assignments
    const allAssign = (typeof getAllAssignments === 'function') ? getAllAssignments() : {};
    const assignedBatches = batches.filter(b => allAssign[b.id]);
    const uniqueSessions = [...new Set(assignedBatches.map(b => b.sessionPeriod).filter(Boolean))]
      .sort((a, b) => {
        const parse = v => { const [n, yy] = (v || '').split('-'); return (parseInt(yy)||0)*2 + (n==='June'?1:0); };
        return parse(b) - parse(a);
      });

    return `
      <div class="ac-page">

        <!-- Toolbar row 1: date range controls -->
        <div class="ac-toolbar">

          <!-- LEFT: Today → Week nav → mode toggles → date range inputs -->
          <div style="display:flex;align-items:center;gap:6px;flex:1;flex-wrap:wrap">

            <!-- Today button (standalone — shows only today's tests) -->
            <button class="ac-today-btn" id="acToday" title="Show today's assessments only">Today</button>

            <!-- Week prev/next + label (shown in week/today mode) -->
            <div class="ac-nav" id="acWeekNav">
              <button class="ac-nav-btn" id="acPrev" title="Previous week">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.2">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <span class="ac-month-label" id="acMonthLabel">—</span>
              <button class="ac-nav-btn" id="acNext" title="Next week">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2.2">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            </div>

            <!-- Mode toggle: Week | Date Range -->
            <div class="ac-view-toggle">
              <button class="ac-view-btn active" id="acModeWeek"  data-mode="week">Week</button>
              <button class="ac-view-btn"        id="acModeRange" data-mode="range">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                     stroke="currentColor" stroke-width="2" style="margin-right:3px">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/>
                  <line x1="8"  y1="2" x2="8"  y2="6"/>
                  <line x1="3"  y1="10" x2="21" y2="10"/>
                </svg>
                Date Range
              </button>
            </div>

            <!-- Custom date range inputs (hidden until range mode) -->
            <div id="acDateRangeInputs" style="display:none;align-items:center;gap:6px">
              <label style="font-size:11.5px;color:var(--t3);font-weight:600">From</label>
              <input type="date" id="acDateFrom" class="ac-date-input"/>
              <label style="font-size:11.5px;color:var(--t3);font-weight:600">To</label>
              <input type="date" id="acDateTo"   class="ac-date-input"/>
              <button class="ac-clear-range-btn" id="acClearRange" title="Clear range">✕</button>
            </div>

          </div>

          <!-- RIGHT: Export buttons -->
          <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
            <button id="acExportCSV" title="Export to CSV (Excel)"
              style="display:inline-flex;align-items:center;justify-content:center;gap:5px;
                     height:30px;padding:0 12px;border-radius:8px;
                     border:1px solid var(--border);background:var(--surface2);
                     color:var(--t3);cursor:pointer;font-size:12px;font-weight:600;
                     font-family:var(--font-body);transition:all .15s;white-space:nowrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M8 12l2.5 2.5L16 9"/>
              </svg>
              CSV
            </button>
            <button id="acExportPDF" title="Export to PDF"
              style="display:inline-flex;align-items:center;justify-content:center;gap:5px;
                     height:30px;padding:0 12px;border-radius:8px;
                     border:1px solid var(--border);background:var(--surface2);
                     color:var(--t3);cursor:pointer;font-size:12px;font-weight:600;
                     font-family:var(--font-body);transition:all .15s;white-space:nowrap">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/>
                <line x1="8" y1="17" x2="16" y2="17"/>
              </svg>
              PDF
            </button>
            <div class="ac-col-mgr-wrap" id="acColMgrWrap">
              <button class="ac-col-mgr-btn" id="acColMgrBtn" title="Show / hide columns">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="18" rx="1"/>
                  <rect x="14" y="3" width="7" height="18" rx="1"/>
                </svg>
              </button>
              <div class="ac-col-mgr-panel" id="acColMgrPanel">
                <div class="ac-col-mgr-head">
                  <span class="ac-col-mgr-title">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
                    </svg>
                    Columns
                  </span>
                  <button class="ac-col-mgr-link" id="acColMgrShowAll">Show All</button>
                </div>
                <div class="ac-col-mgr-list" id="acColMgrList"></div>
                <div class="ac-col-mgr-foot">Selected columns are also used for export</div>
              </div>
            </div>
          </div>

        </div>

        <!-- Toolbar row 2: filters -->
        <div class="ac-filter-bar" id="acFilterBar">

          <!-- Campus multi-select -->
          <div class="ac-ms-wrap" id="acMsCampus">
            <button class="ac-ms-trigger" id="acMsCampusTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
              <span class="ac-ms-label" id="acMsCampusLabel">All Campuses</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ac-ms-caret">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="ac-ms-dropdown" id="acMsCampusDropdown">
              ${campuses.map(c => `
                <label class="ac-ms-option">
                  <input type="checkbox" value="${c.id}" class="ac-ms-cb ac-ms-campus-cb"/>
                  ${c.campusName || c.name || c.id}
                </label>
              `).join('')}
              ${campuses.length === 0 ? `<div class="ac-ms-empty">No campuses</div>` : ''}
            </div>
          </div>

          <!-- Batch multi-select -->
          <div class="ac-ms-wrap" id="acMsBatch">
            <button class="ac-ms-trigger" id="acMsBatchTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              <span class="ac-ms-label" id="acMsBatchLabel">All Batches</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ac-ms-caret">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="ac-ms-dropdown" id="acMsBatchDropdown">
              ${batches.map(b => `
                <label class="ac-ms-option">
                  <input type="checkbox" value="${b.id}" class="ac-ms-cb ac-ms-batch-cb"/>
                  ${b.batchName}
                </label>
              `).join('')}
              ${batches.length === 0 ? `<div class="ac-ms-empty">No batches</div>` : ''}
            </div>
          </div>

          <!-- Status multi-select -->
          <div class="ac-ms-wrap" id="acMsStatus">
            <button class="ac-ms-trigger" id="acMsStatusTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              <span class="ac-ms-label" id="acMsStatusLabel">All Status</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ac-ms-caret">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="ac-ms-dropdown" id="acMsStatusDropdown">
              ${[
                { value:'upcoming',  label:'Upcoming'  },
                { value:'today',     label:'Today'     },
                { value:'overdue',   label:'Overdue'   },
                { value:'completed', label:'Completed' },
                { value:'cancelled', label:'Cancelled' },
                { value:'draft',     label:'Draft'     },
              ].map(s => `
                <label class="ac-ms-option">
                  <input type="checkbox" value="${s.value}" class="ac-ms-cb ac-ms-status-cb"/>
                  <span class="ac-ms-dot" style="background:${(STATUS_META[s.value] && STATUS_META[s.value].color)||'var(--t3)'}"></span>
                  ${s.label}
                </label>
              `).join('')}
            </div>
          </div>

          <!-- Source multi-select -->
          <div class="ac-ms-wrap" id="acMsSource">
            <button class="ac-ms-trigger" id="acMsSourceTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <span class="ac-ms-label" id="acMsSourceLabel">All Sources</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ac-ms-caret">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="ac-ms-dropdown" id="acMsSourceDropdown">
              <label class="ac-ms-option">
                <input type="checkbox" value="lp"       class="ac-ms-cb ac-ms-source-cb"/>
                Lecture Plan
              </label>
              <label class="ac-ms-option">
                <input type="checkbox" value="schedule" class="ac-ms-cb ac-ms-source-cb"/>
                Scheduled Tests
              </label>
            </div>
          </div>

          <!-- Discipline multi-select -->
          <div class="ac-ms-wrap" id="acMsDisc">
            <button class="ac-ms-trigger" id="acMsDiscTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
              </svg>
              <span class="ac-ms-label" id="acMsDiscLabel">All Disciplines</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ac-ms-caret">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="ac-ms-dropdown" id="acMsDiscDropdown">
              ${disciplines.map(d => `
                <label class="ac-ms-option">
                  <input type="checkbox" value="${d.id}" class="ac-ms-cb ac-ms-disc-cb"/>
                  ${d.abbreviation || d.fullName || d.id}
                </label>
              `).join('')}
              ${disciplines.length === 0 ? `<div class="ac-ms-empty">No disciplines</div>` : ''}
            </div>
          </div>

          <!-- Level multi-select -->
          <div class="ac-ms-wrap" id="acMsLevel">
            <button class="ac-ms-trigger" id="acMsLevelTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/>
                <line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
              </svg>
              <span class="ac-ms-label" id="acMsLevelLabel">All Levels</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ac-ms-caret">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="ac-ms-dropdown" id="acMsLevelDropdown">
              ${levels.map(l => `
                <label class="ac-ms-option">
                  <input type="checkbox" value="${l.id}" class="ac-ms-cb ac-ms-level-cb"/>
                  ${l.levelName || l.name || l.id}
                </label>
              `).join('')}
              ${levels.length === 0 ? `<div class="ac-ms-empty">No levels</div>` : ''}
            </div>
          </div>

          <!-- Session multi-select -->
          <div class="ac-ms-wrap" id="acMsSession">
            <button class="ac-ms-trigger" id="acMsSessionTrigger">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span class="ac-ms-label" id="acMsSessionLabel">All Sessions</span>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ac-ms-caret">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            <div class="ac-ms-dropdown" id="acMsSessionDropdown">
              ${uniqueSessions.map(s => `
                <label class="ac-ms-option">
                  <input type="checkbox" value="${s}" class="ac-ms-cb ac-ms-session-cb"/>
                  ${s}
                </label>
              `).join('')}
              ${uniqueSessions.length === 0 ? `<div class="ac-ms-empty">No sessions</div>` : ''}
            </div>
          </div>

          <!-- Active filter chips + clear all -->
          <div id="acActiveChips" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-left:4px"></div>
          <div id="acLPActiveChips" style="display:flex;align-items:center;gap:5px;flex-wrap:wrap"></div>
          <button id="acClearAll" class="ac-clear-all-btn" style="display:none">Clear all</button>

        </div>

        <!-- Live-sync indicator -->
        <div id="acSyncBadge" class="ac-sync-badge ac-sync-hidden">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5">
            <polyline points="23 4 23 10 17 10"/>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Synced from Lecture Plan
        </div>

        <!-- Stats strip -->
        <div id="acStatsStrip" class="ac-stats-strip"></div>

        <!-- Table area -->
        <div id="acTableWrap"></div>

        <!-- Legend -->
        <div class="ac-legend" id="acLegend">
          ${Object.entries(STATUS_META).map(([key, meta]) => `
            <span class="ac-legend-item">
              <span class="ac-legend-dot" style="background:${meta.color}"></span>
              ${meta.label}
            </span>
          `).join('')}
          <span class="ac-legend-item" style="margin-left:auto">
            <span class="ac-legend-dot" style="background:var(--violet);border-radius:2px"></span>
            From Lecture Plan
          </span>
          <span class="ac-legend-item">
            <span class="ac-legend-dot" style="background:var(--blue);border-radius:2px"></span>
            Scheduled Test
          </span>
        </div>

      </div>
    `;
  },

  // ── Attach toolbar controls ─────────────────────────────────
  _attachControls(container) {
    // ── Week nav ───────────────────────────────────────────────
    (container.querySelector('#acPrev')) && container.querySelector('#acPrev').addEventListener('click', () => {
      this._weekStart = this._shiftWeek(this._weekStart, -1);
      this._renderCalendar();
    });
    (container.querySelector('#acNext')) && container.querySelector('#acNext').addEventListener('click', () => {
      this._weekStart = this._shiftWeek(this._weekStart, +1);
      this._renderCalendar();
    });
    (container.querySelector('#acToday')) && container.querySelector('#acToday').addEventListener('click', () => {
      this._weekStart = this._getThisWeekMonday();
      this._dateMode  = this._dateMode === 'today' ? 'week' : 'today';
      this._syncModeUI(container);
      this._renderCalendar();
    });

    // ── Mode toggle (Week / Date Range) ────────────────────────
    container.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._dateMode = btn.dataset.mode;
        this._syncModeUI(container);
        this._renderCalendar();
      });
    });

    // ── Manual date range inputs ───────────────────────────────
    (container.querySelector('#acDateFrom')) && container.querySelector('#acDateFrom').addEventListener('change', e => {
      this._dateFrom = e.target.value;
      this._renderCalendar();
    });
    (container.querySelector('#acDateTo')) && container.querySelector('#acDateTo').addEventListener('change', e => {
      this._dateTo = e.target.value;
      this._renderCalendar();
    });
    (container.querySelector('#acClearRange')) && container.querySelector('#acClearRange').addEventListener('click', () => {
      this._dateFrom = '';
      this._dateTo   = '';
      const f = container.querySelector('#acDateFrom');
      const t = container.querySelector('#acDateTo');
      if (f) f.value = '';
      if (t) t.value = '';
      this._renderCalendar();
    });

    // ── Export buttons ─────────────────────────────────────────
    (container.querySelector('#acExportCSV')) && container.querySelector('#acExportCSV').addEventListener('click', () => {
      const entries = this._getCurrentExportEntries();
      this._exportCSV(entries);
    });
    (container.querySelector('#acExportPDF')) && container.querySelector('#acExportPDF').addEventListener('click', () => {
      const entries = this._getCurrentExportEntries();
      this._exportPDF(entries);
    });

    // Hover styles for export buttons
    ['acExportCSV', 'acExportPDF'].forEach(id => {
      const btn = container.querySelector(`#${id}`);
      if (!btn) return;
      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = 'var(--blue)';
        btn.style.color       = 'var(--blue)';
        btn.style.background  = 'var(--blue-dim)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = 'var(--border)';
        btn.style.color       = 'var(--t3)';
        btn.style.background  = 'var(--surface2)';
      });
    });

    // ── Column manager ──────────────────────────────────────────
    this._wireColManager(container);

    // ── Multi-select dropdowns ─────────────────────────────────
    this._initMultiSelect(container, {
      triggerId:  'acMsCampusTrigger',
      dropdownId: 'acMsCampusDropdown',
      labelId:    'acMsCampusLabel',
      cbClass:    'ac-ms-campus-cb',
      allLabel:   'All Campuses',
      stateKey:   '_filterCampus',
    });
    this._initMultiSelect(container, {
      triggerId:  'acMsBatchTrigger',
      dropdownId: 'acMsBatchDropdown',
      labelId:    'acMsBatchLabel',
      cbClass:    'ac-ms-batch-cb',
      allLabel:   'All Batches',
      stateKey:   '_filterBatch',
    });
    this._initMultiSelect(container, {
      triggerId:  'acMsStatusTrigger',
      dropdownId: 'acMsStatusDropdown',
      labelId:    'acMsStatusLabel',
      cbClass:    'ac-ms-status-cb',
      allLabel:   'All Status',
      stateKey:   '_filterStatus',
    });
    this._initMultiSelect(container, {
      triggerId:  'acMsSourceTrigger',
      dropdownId: 'acMsSourceDropdown',
      labelId:    'acMsSourceLabel',
      cbClass:    'ac-ms-source-cb',
      allLabel:   'All Sources',
      stateKey:   '_filterSource',
    });
    this._initMultiSelect(container, {
      triggerId:  'acMsDiscTrigger',
      dropdownId: 'acMsDiscDropdown',
      labelId:    'acMsDiscLabel',
      cbClass:    'ac-ms-disc-cb',
      allLabel:   'All Disciplines',
      stateKey:   '_filterDisc',
    });
    this._initMultiSelect(container, {
      triggerId:  'acMsLevelTrigger',
      dropdownId: 'acMsLevelDropdown',
      labelId:    'acMsLevelLabel',
      cbClass:    'ac-ms-level-cb',
      allLabel:   'All Levels',
      stateKey:   '_filterLevel',
    });
    this._initMultiSelect(container, {
      triggerId:  'acMsSessionTrigger',
      dropdownId: 'acMsSessionDropdown',
      labelId:    'acMsSessionLabel',
      cbClass:    'ac-ms-session-cb',
      allLabel:   'All Sessions',
      stateKey:   '_filterSession',
    });

    // Clear all chips button
    (container.querySelector('#acClearAll')) && container.querySelector('#acClearAll').addEventListener('click', () => {
      this._filterCampus  = [];
      this._filterBatch   = [];
      this._filterStatus  = [];
      this._filterSource  = [];
      this._filterDisc    = [];
      this._filterLevel   = [];
      this._filterSession = [];
      // Uncheck all checkboxes
      container.querySelectorAll('.ac-ms-cb').forEach(cb => cb.checked = false);
      this._syncAllLabels(container);
      this._renderActiveChips(container);
      this._renderCalendar();
    });

    // Close dropdowns on outside click — use capture-phase mousedown
    // so it fires before the target's own click handler.
    const _outsideHandler = (e) => {
      if (!e.target.closest('.ac-ms-wrap')) {
        container.querySelectorAll('.ac-ms-dropdown.open')
          .forEach(d => d.classList.remove('open'));
      }
    };
    window.addEventListener('mousedown', _outsideHandler, true);
    // Store for cleanup if needed
    this._outsideClickHandler = _outsideHandler;
  },

  // ── Init a single multi-select dropdown ─────────────────────
  _initMultiSelect(container, { triggerId, dropdownId, labelId, cbClass, allLabel, stateKey }) {
    const trigger  = container.querySelector(`#${triggerId}`);
    const dropdown = container.querySelector(`#${dropdownId}`);
    if (!trigger || !dropdown) return;

    // Toggle open
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = dropdown.classList.contains('open');
      // Close all others
      container.querySelectorAll('.ac-ms-dropdown.open')
        .forEach(d => d.classList.remove('open'));
      if (!isOpen) dropdown.classList.add('open');
    });

    // Checkbox changes
    dropdown.querySelectorAll(`.${cbClass}`).forEach(cb => {
      cb.addEventListener('change', () => {
        this[stateKey] = [...dropdown.querySelectorAll(`.${cbClass}:checked`)].map(c => c.value);
        this._syncLabel(container, labelId, this[stateKey], allLabel);
        this._renderActiveChips(container);
        this._renderCalendar();
      });
    });
  },

  // ── Sync trigger label text ──────────────────────────────────
  _syncLabel(container, labelId, selected, allLabel) {
    const el = container.querySelector(`#${labelId}`);
    if (!el) return;
    if (!selected.length) { el.textContent = allLabel; return; }
    if (selected.length === 1) {
      // Try to find a readable label from the dropdown option text
      const cb = container.querySelector(`.ac-ms-cb[value="${selected[0]}"]`);
      const text = (cb && cb.closest("label") && cb.closest("label").textContent ? cb.closest("label").textContent.trim() : undefined) || selected[0];
      el.textContent = text;
    } else {
      el.textContent = `${selected.length} selected`;
    }
  },

  _syncAllLabels(container) {
    this._syncLabel(container, 'acMsCampusLabel',  this._filterCampus,  'All Campuses');
    this._syncLabel(container, 'acMsBatchLabel',   this._filterBatch,   'All Batches');
    this._syncLabel(container, 'acMsStatusLabel',  this._filterStatus,  'All Status');
    this._syncLabel(container, 'acMsSourceLabel',  this._filterSource,  'All Sources');
    this._syncLabel(container, 'acMsDiscLabel',    this._filterDisc,    'All Disciplines');
    this._syncLabel(container, 'acMsLevelLabel',   this._filterLevel,   'All Levels');
    this._syncLabel(container, 'acMsSessionLabel', this._filterSession, 'All Sessions');
  },

  // ── Render active filter chips ───────────────────────────────
  _renderActiveChips(container) {
    const wrap    = container.querySelector('#acActiveChips');
    const lpWrap  = container.querySelector('#acLPActiveChips');
    const clearBtn= container.querySelector('#acClearAll');
    if (!wrap) return;

    const makeChips = (arr, stateKey, cbClass, color) =>
      arr.map(val => {
        const cb   = container.querySelector(`.${cbClass}[value="${val}"]`);
        const text = (cb && cb.closest("label") && cb.closest("label").textContent ? cb.closest("label").textContent.trim() : undefined) || val;
        return `<span class="ac-active-chip" style="background:${color}20;color:${color};border-color:${color}40"
                      data-key="${stateKey}" data-val="${val}">
                  ${text}
                  <span class="ac-chip-x">✕</span>
                </span>`;
      }).join('');

    wrap.innerHTML =
      makeChips(this._filterCampus, '_filterCampus', 'ac-ms-campus-cb', 'var(--blue)')   +
      makeChips(this._filterBatch,  '_filterBatch',  'ac-ms-batch-cb',  'var(--green)')  +
      makeChips(this._filterStatus, '_filterStatus', 'ac-ms-status-cb', 'var(--yellow)') +
      makeChips(this._filterSource, '_filterSource', 'ac-ms-source-cb', 'var(--violet)');

    if (lpWrap) {
      lpWrap.innerHTML =
        makeChips(this._filterDisc,    '_filterDisc',    'ac-ms-disc-cb',    'var(--cyan)')  +
        makeChips(this._filterLevel,   '_filterLevel',   'ac-ms-level-cb',   'var(--orange,#f97316)') +
        makeChips(this._filterSession, '_filterSession', 'ac-ms-session-cb', 'var(--red)');
    }

    const hasAny = this._filterCampus.length || this._filterBatch.length ||
                   this._filterStatus.length || this._filterSource.length ||
                   this._filterDisc.length   || this._filterLevel.length  ||
                   this._filterSession.length;
    if (clearBtn) clearBtn.style.display = hasAny ? '' : 'none';

    // Wire chip remove clicks — both rows
    const allChips = [...(wrap.querySelectorAll('.ac-active-chip')), ...(lpWrap ? lpWrap.querySelectorAll('.ac-active-chip') : [])];
    allChips.forEach(chip => {
      (chip.querySelector('.ac-chip-x')) && chip.querySelector('.ac-chip-x').addEventListener('click', () => {
        const { key, val } = chip.dataset;
        this[key] = this[key].filter(v => v !== val);
        // Uncheck the corresponding checkbox
        const cb = container.querySelector(`.ac-ms-cb[value="${val}"]`);
        if (cb) cb.checked = false;
        this._syncAllLabels(container);
        this._renderActiveChips(container);
        this._renderCalendar();
      });
    });
  },

  // ── Sync mode UI (week nav vs date range inputs) ─────────────
  _syncModeUI(container) {
    const weekNav    = container.querySelector('#acWeekNav');
    const rangeInputs= container.querySelector('#acDateRangeInputs');
    const modeBtns   = container.querySelectorAll('[data-mode]');
    const todayBtn   = container.querySelector('#acToday');

    // Mode buttons: only week/range toggle buttons
    modeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === this._dateMode));

    // Today button: active when in today mode
    if (todayBtn) {
      const isToday = this._dateMode === 'today';
      todayBtn.style.background   = isToday ? 'var(--blue)'     : 'var(--surface2)';
      todayBtn.style.color        = isToday ? '#fff'            : 'var(--t2)';
      todayBtn.style.borderColor  = isToday ? 'var(--blue)'     : 'var(--border)';
      todayBtn.style.fontWeight   = isToday ? '700'             : '600';
    }

    if (this._dateMode === 'range') {
      if (weekNav)     weekNav.style.display     = 'none';
      if (rangeInputs) rangeInputs.style.display = 'flex';
      const label = container.querySelector('#acMonthLabel');
      if (label) label.textContent = '';
    } else if (this._dateMode === 'today') {
      if (weekNav)     weekNav.style.display     = 'none';
      if (rangeInputs) rangeInputs.style.display = 'none';
      // Deactivate mode toggle buttons
      modeBtns.forEach(b => b.classList.remove('active'));
    } else {
      // week mode
      if (weekNav)     weekNav.style.display     = '';
      if (rangeInputs) rangeInputs.style.display = 'none';
    }
  },

  // ── Week helpers ────────────────────────────────────────────
  _getThisWeekMonday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const day = d.getDay(); // 0=Sun
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    return d;
  },

  _shiftWeek(monday, dir) {
    const d = new Date(monday);
    d.setDate(d.getDate() + dir * 7);
    return d;
  },

  _weekRangeLabel(monday) {
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    const fmt = d => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0,3)}`;
    if (monday.getFullYear() !== sunday.getFullYear()) {
      return `${fmt(monday)} ${monday.getFullYear()} – ${fmt(sunday)} ${sunday.getFullYear()}`;
    }
    if (monday.getMonth() !== sunday.getMonth()) {
      return `${fmt(monday)} – ${fmt(sunday)} ${sunday.getFullYear()}`;
    }
    return `${monday.getDate()} – ${sunday.getDate()} ${MONTH_NAMES[monday.getMonth()]} ${monday.getFullYear()}`;
  },

  _weekDateStrings(monday) {
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(d.getDate() + i);
      const y  = d.getFullYear();
      const m  = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${dd}`);
    }
    return dates;
  },

  // ── Merge + filter all entries ──────────────────────────────
  // Returns a unified array of both LP-derived and manual-schedule
  // entries, already filtered by the toolbar dropdowns.
  _getAllFilteredEntries() {
    let scheduleEntries = getSchedules().map(s => ({ ...s, source: SOURCE_SCHEDULE }));
    let lpEntries = buildLPEntries();
    let all = [...scheduleEntries, ...lpEntries];

    // Campus filter (multi)
    if (this._filterCampus.length) {
      all = all.filter(e => {
        const batch = AppState.findById('batches', e.batchId);
        return this._filterCampus.includes((batch && batch.campusId));
      });
    }

    // Batch filter (multi)
    if (this._filterBatch.length) {
      all = all.filter(e => this._filterBatch.includes(e.batchId));
    }

    // Source filter (multi)
    if (this._filterSource.length) {
      all = all.filter(e => this._filterSource.includes(e.source));
    }

    // Status filter (multi)
    if (this._filterStatus.length) {
      all = all.filter(e => {
        const st = e.source === SOURCE_LP ? getLPEntryStatus(e) : getScheduleStatus(e);
        return this._filterStatus.includes(st);
      });
    }

    // Discipline filter (multi) — match via batch.disciplineId
    if (this._filterDisc.length) {
      all = all.filter(e => {
        const batch = AppState.findById('batches', e.batchId);
        return this._filterDisc.includes(batch && batch.disciplineId);
      });
    }

    // Level filter (multi) — match via batch.levelId or batch's subject.levelId
    if (this._filterLevel.length) {
      all = all.filter(e => {
        const batch = AppState.findById('batches', e.batchId);
        if (!batch) return false;
        // Try direct levelId first, then via subject
        let levelId = batch.levelId || '';
        if (!levelId && batch.subjectId) {
          const subj = AppState.findById('subjects', batch.subjectId);
          levelId = (subj && subj.levelId) || '';
        }
        return this._filterLevel.includes(levelId);
      });
    }

    // Session filter (multi) — match via batch.sessionPeriod
    if (this._filterSession.length) {
      all = all.filter(e => {
        const batch = AppState.findById('batches', e.batchId);
        return this._filterSession.includes(batch && batch.sessionPeriod);
      });
    }

    return all;
  },

  // ── Build a map: dateStr → [entries] ────────────────────────
  _buildDateMap(entries) {
    const map = {};
    entries.forEach(e => {
      if (!e.date) return;
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  },

  // ── Stats strip builder ─────────────────────────────────────
  _renderStats(allEntries, rangeEntries) {
    const strip = this._container && this._container.querySelector('#acStatsStrip');
    if (!strip) return;

    const shown   = rangeEntries.length;
    const total   = allEntries.length;
    const fromLP  = rangeEntries.filter(e => e.source === SOURCE_LP).length;
    const fromSch = rangeEntries.filter(e => e.source === SOURCE_SCHEDULE).length;
    const rangeLabel = this._dateMode === 'week'  ? 'this week'
                     : this._dateMode === 'today' ? 'today'
                     : 'in range';

    strip.innerHTML = `
      <span class="ac-stat-item">
        <span class="ac-stat-num">${shown}</span> ${rangeLabel}
      </span>
      <span class="ac-stat-sep">·</span>
      <span class="ac-stat-num">${total}</span> total (filtered)
      <span class="ac-stat-sep">·</span>
      <span class="ac-stat-item ac-stat-lp">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
        </svg>
        ${fromLP} LP
      </span>
      <span class="ac-stat-sep">·</span>
      <span class="ac-stat-item ac-stat-sched">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/>
          <line x1="8" y1="2" x2="8" y2="6"/>
        </svg>
        ${fromSch} scheduled
      </span>
    `;
  },

  // ── Main render dispatcher ──────────────────────────────────
  _renderCalendar() {
    const label = this._container && this._container.querySelector('#acMonthLabel');

    const allEntries = this._getAllFilteredEntries();
    let rangeEntries;

    if (this._dateMode === 'today') {
      // Today only — single day filter
      const todayStr = this._toDateStr(new Date());
      rangeEntries = allEntries.filter(e => e.date === todayStr);
      if (label) label.textContent = formatDate(todayStr);
    } else if (this._dateMode === 'range') {
      // Custom date range
      const from = this._dateFrom;
      const to   = this._dateTo;
      if (from || to) {
        rangeEntries = allEntries.filter(e => {
          if (!e.date) return false;
          if (from && e.date < from) return false;
          if (to   && e.date > to)   return false;
          return true;
        });
        if (label) {
          const fmt = d => d ? formatDate(d) : '—';
          label.textContent = `${fmt(from)} → ${fmt(to)}`;
        }
      } else {
        rangeEntries = allEntries;
        if (label) label.textContent = 'All dates';
      }
    } else {
      // Week mode
      const weekDates = this._weekDateStrings(this._weekStart);
      rangeEntries = allEntries.filter(e => e.date && weekDates.includes(e.date));
      if (label) label.textContent = this._weekRangeLabel(this._weekStart);
    }

    const tableWrap = this._container && this._container.querySelector('#acTableWrap');
    if (!tableWrap) return;

    this._renderStats(allEntries, rangeEntries);
    this._renderTable(rangeEntries, tableWrap);
    this._flashSyncBadge();
  },

  // ── Table sort state ─────────────────────────────────────────
  _sortCol: 'date',
  _sortDir: 1,   // 1 = asc, -1 = desc

  // ── Table view renderer ──────────────────────────────────────
  _renderTable(entries, wrap) {
    const visibleCols = this._visibleAcCols();

    // Sort entries
    const sorted = [...entries].sort((a, b) => {
      let va, vb;
      if (this._sortCol === 'date') {
        va = a.date || '';
        vb = b.date || '';
      } else if (this._sortCol === 'name') {
        va = (a.testName || '').toLowerCase();
        vb = (b.testName || '').toLowerCase();
      } else if (this._sortCol === 'batch') {
        va = (a.batchName || (function(){ var _b = AppState.findById("batches", a.batchId); return _b ? _b.batchName : undefined; }()) || '').toLowerCase();
        vb = (b.batchName || (function(){ var _b = AppState.findById("batches", b.batchId); return _b ? _b.batchName : undefined; }()) || '').toLowerCase();
      } else if (this._sortCol === 'type') {
        va = a.testType || '';
        vb = b.testType || '';
      } else if (this._sortCol === 'status') {
        va = a.source === SOURCE_LP ? getLPEntryStatus(a) : getScheduleStatus(a);
        vb = b.source === SOURCE_LP ? getLPEntryStatus(b) : getScheduleStatus(b);
      } else if (this._sortCol === 'campus') {
        const getCampus = e => {
          const b = AppState.findById('batches', e.batchId);
          const c = (b && b.campusId) ? AppState.findById('campuses', b.campusId) : null;
          return c ? c.campusName : '';
        };
        va = getCampus(a).toLowerCase();
        vb = getCampus(b).toLowerCase();
      } else if (this._sortCol === 'subject') {
        const getBatchName = e => e.batchName || (function(){ var _b = AppState.findById("batches", e.batchId); return _b ? _b.batchName : undefined; }()) || '';
        va = this._subjectFromBatch(getBatchName(a)).toLowerCase();
        vb = this._subjectFromBatch(getBatchName(b)).toLowerCase();
      } else if (this._sortCol === 'source') {
        va = a.source || '';
        vb = b.source || '';
      }
      if (va < vb) return -this._sortDir;
      if (va > vb) return  this._sortDir;
      return 0;
    });

    const arrow = (col) => {
      if (this._sortCol !== col) return `<span style="color:var(--t4);margin-left:3px">⇅</span>`;
      return this._sortDir === 1
        ? `<span style="color:var(--blue);margin-left:3px">↑</span>`
        : `<span style="color:var(--blue);margin-left:3px">↓</span>`;
    };

    const thStyle = `padding:9px 12px;font-size:11.5px;font-weight:700;color:var(--t3);
                     text-align:left;text-transform:uppercase;letter-spacing:.04em;
                     cursor:pointer;user-select:none;white-space:nowrap;`;
    const thStyleStatic = `padding:9px 12px;font-size:11.5px;font-weight:700;color:var(--t3);
                     text-align:left;text-transform:uppercase;letter-spacing:.04em;
                     cursor:default;user-select:none;white-space:nowrap;`;

    // Header cells — built from the columns the column manager has visible
    const headerCells = visibleCols.map(col => {
      if (AC_SORTABLE_COLS.has(col.key)) {
        return `<th data-sort="${col.key}" style="${thStyle}">${col.label} ${arrow(col.key)}</th>`;
      }
      return `<th style="${thStyleStatic}">${col.label}</th>`;
    }).join('');

    // Body cells — one branch per column key, given the row's context
    const buildCell = (col, ctx) => {
      switch (col.key) {
        case 'date':
          return `<td style="padding:9px 12px;font-size:12.5px;color:var(--t1);white-space:nowrap;font-weight:600">
                     ${ctx.entry.date ? formatDate(ctx.entry.date) : '—'}
                   </td>`;
        case 'name':
          return `<td style="padding:9px 12px;font-size:12.5px;color:var(--t1);max-width:200px">
                     ${ctx.entry.testName || '—'}
                   </td>`;
        case 'batch':
          return `<td style="padding:9px 12px;font-size:12.5px;color:var(--t2)">
                     ${this._batchNumberFromName(ctx.batchName)}
                   </td>`;
        case 'campus':
          return `<td style="padding:9px 12px;font-size:12px;color:var(--t3)">${ctx.campusLabel}</td>`;
        case 'subject':
          return `<td style="padding:9px 12px;font-size:12px;color:var(--t3);max-width:180px;
                              overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${ctx.subjectLabel}</td>`;
        case 'room':
          return `<td class="ac-room-cell" data-entry-id="${ctx.entry.id}" style="padding:9px 12px;font-size:12.5px;color:var(--t2)">
                     <span class="ac-room-display">
                       <span class="ac-room-text">${ctx.roomVal || '—'}</span>
                       <button class="ac-room-edit-btn" data-entry-id="${ctx.entry.id}" type="button" title="Edit room">
                         <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                           <path d="M12 20h9"/>
                           <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                         </svg>
                       </button>
                     </span>
                   </td>`;
        case 'teacher':
          return `<td style="padding:9px 12px;font-size:12px;color:var(--t3)">${ctx.teacherName}</td>`;
        case 'status':
          return `<td style="padding:9px 12px">
                     <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;
                                  font-weight:700;color:${ctx.sMeta.color};background:${ctx.sMeta.bg}">
                       ${ctx.sMeta.label}
                     </span>
                   </td>`;
        case 'source':
          return `<td style="padding:9px 12px">
                     <span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;
                                  font-weight:700;
                                  color:${ctx.isLP ? 'var(--violet)' : 'var(--blue)'};
                                  background:${ctx.isLP ? 'var(--violet-dim)' : 'var(--blue-dim)'}">
                       ${ctx.isLP ? 'Lecture Plan' : 'Scheduled'}
                     </span>
                   </td>`;
        default:
          return `<td></td>`;
      }
    };

    const rows = sorted.length === 0
      ? `<tr><td colspan="${visibleCols.length}" style="padding:40px;text-align:center;color:var(--t4);font-size:13px">
           No assessments found for this week.
         </td></tr>`
      : sorted.map((entry, i) => {
          const isLP    = entry.source === SOURCE_LP;
          const status  = isLP ? getLPEntryStatus(entry) : getScheduleStatus(entry);
          const sMeta     = STATUS_META[status] || STATUS_META.draft;
          const batchObj  = AppState.findById('batches', entry.batchId);
          const batchName = isLP
            ? (entry.batchName || '—')
            : ((batchObj && batchObj.batchName) || '—');
          // Subject: first segment of batch name (e.g. "SBR-JUNE-26-01" → "SBR")
          const subjectLabel = this._subjectFromBatch(batchName);
          // Campus
          const campusObj = (batchObj && batchObj.campusId) ? AppState.findById('campuses', batchObj.campusId) : null;
          const campusLabel = campusObj ? campusObj.campusName : '—';
          // Teacher assigned to the batch
          const teacherName = _getTeacherName(batchObj);
          // Room — manually entered, blank until set via the edit icon
          const roomVal = _getRoomForEntry(entry.id);

          const ctx = { entry, isLP, sMeta, batchName, subjectLabel, campusLabel, teacherName, roomVal };

          const zebra = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)';

          return `
            <tr class="ac-table-row" data-id="${entry.id}" data-src="${entry.source}"
                style="background:${zebra};cursor:pointer;transition:background .1s;
                       border-bottom:1px solid var(--border)">
              ${visibleCols.map(col => buildCell(col, ctx)).join('')}
            </tr>
          `;
        }).join('');

    wrap.innerHTML = `
      <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
        <div style="overflow-x:auto">
          <table id="acTable" style="width:100%;border-collapse:collapse">
            <thead>
              <tr style="background:var(--surface2);border-bottom:2px solid var(--border)">
                ${headerCells}
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${sorted.length > 0 ? `
          <div style="padding:8px 14px;border-top:1px solid var(--border);
                      background:var(--surface2);font-size:11.5px;color:var(--t3)">
            ${sorted.length} entr${sorted.length === 1 ? 'y' : 'ies'} shown
            &nbsp;·&nbsp; Click any row to view details
            &nbsp;·&nbsp; Click column headers to sort
          </div>` : ''}
      </div>
    `;

    // Sort click on headers
    wrap.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.sort;
        if (this._sortCol === col) {
          this._sortDir *= -1;
        } else {
          this._sortCol = col;
          this._sortDir = 1;
        }
        // Re-render with the same week entries passed in
        this._renderTable(entries, wrap);
      });
      th.addEventListener('mouseenter', () => { th.style.color = 'var(--t1)'; });
      th.addEventListener('mouseleave', () => { th.style.color = 'var(--t3)'; });
    });

    // Row click → detail modal
    wrap.querySelectorAll('.ac-table-row').forEach(row => {
      row.addEventListener('mouseenter', () => { row.style.background = 'var(--blue-dim)'; });
      row.addEventListener('mouseleave', () => {
        const i = [...wrap.querySelectorAll('.ac-table-row')].indexOf(row);
        row.style.background = i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)';
      });
      row.addEventListener('click', () => {
        const { id, src } = row.dataset;
        if (src === SOURCE_LP) {
          const entry = buildLPEntries().find(e => e.id === id);
          if (entry) this._showLPDetail(entry);
        } else {
          const sch = getSchedules().find(s => s.id === id);
          if (sch) this._showDetail(sch);
        }
      });
    });

    // Room column → click edit icon to type a room inline
    wrap.querySelectorAll('.ac-room-edit-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id   = btn.dataset.entryId;
        const cell = btn.closest('.ac-room-cell');
        if (!cell) return;
        const current = _getRoomForEntry(id);
        cell.innerHTML = `
          <div style="display:flex;align-items:center;gap:4px">
            <input type="text" class="ac-room-input" value="${current.replace(/"/g, '&quot;')}" placeholder="Room"/>
            <button class="ac-room-save-btn" type="button" title="Save">✓</button>
          </div>`;
        const input = cell.querySelector('.ac-room-input');
        const saveBtn = cell.querySelector('.ac-room-save-btn');
        input.addEventListener('click', ev => ev.stopPropagation());
        input.focus();
        input.select();
        const save = () => {
          _setRoomForEntry(id, input.value);
          this._renderTable(entries, wrap);
        };
        saveBtn.addEventListener('click', ev => { ev.stopPropagation(); save(); });
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter')  { ev.stopPropagation(); save(); }
          if (ev.key === 'Escape') { ev.stopPropagation(); this._renderTable(entries, wrap); }
        });
      });
    });
  },

  // ── Sync badge flash ────────────────────────────────────────
  _flashSyncBadge() {
    const badge = this._container && this._container.querySelector('#acSyncBadge');
    if (!badge) return;
    badge.classList.remove('ac-sync-hidden');
    clearTimeout(this._syncBadgeTimer);
    this._syncBadgeTimer = setTimeout(() => {
      badge.classList.add('ac-sync-hidden');
    }, 1800);
  },

  // ── Month grid HTML ─────────────────────────────────────────
  _monthGridHTML(dateMap) {
    const firstDay    = new Date(this._year, this._month, 1).getDay();
    const daysInMonth = new Date(this._year, this._month + 1, 0).getDate();
    const today       = new Date();
    const todayStr    = this._toDateStr(today);

    let cells = '';
    for (let i = 0; i < firstDay; i++) {
      cells += `<div class="ac-cell ac-cell--empty"></div>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = this._toDateStr(new Date(this._year, this._month, d));
      const isToday = dateStr === todayStr;
      const events  = dateMap[dateStr] || [];

      const chips = events.slice(0, 3).map(e => this._chipHTML(e)).join('');
      const more  = events.length > 3
        ? `<span class="ac-more-badge">+${events.length - 3} more</span>` : '';

      cells += `
        <div class="ac-cell${isToday ? ' ac-cell--today' : ''}">
          <span class="ac-day-num${isToday ? ' ac-day-num--today' : ''}">${d}</span>
          <div class="ac-events">${chips}${more}</div>
        </div>
      `;
    }

    const dayHeaders = DAY_NAMES.map(d =>
      `<div class="ac-day-hdr">${d}</div>`
    ).join('');

    return `
      <div class="ac-month-grid">
        <div class="ac-day-headers">${dayHeaders}</div>
        <div class="ac-cells">${cells}</div>
      </div>
    `;
  },

  // ── Week grid HTML ──────────────────────────────────────────
  _weekGridHTML(dateMap) {
    const ws      = this._getWeekRange();
    const todayStr= this._toDateStr(new Date());

    const cols = ws.days.map(d => {
      const dateStr = this._toDateStr(d);
      const isToday = dateStr === todayStr;
      const events  = dateMap[dateStr] || [];
      const chips   = events.map(e => this._chipHTML(e)).join('');

      return `
        <div class="ac-week-col${isToday ? ' ac-week-col--today' : ''}">
          <div class="ac-week-day-hdr">
            <span class="ac-week-day-name">${DAY_NAMES[d.getDay()]}</span>
            <span class="ac-week-day-num${isToday ? ' ac-day-num--today' : ''}">${d.getDate()}</span>
          </div>
          <div class="ac-week-events">${chips || '<div class="ac-no-event">—</div>'}</div>
        </div>
      `;
    }).join('');

    return `<div class="ac-week-grid">${cols}</div>`;
  },

  // ── Event chip HTML ─────────────────────────────────────────
  // Handles both SOURCE_LP and SOURCE_SCHEDULE entries.
  _chipHTML(entry) {
    const isLP = entry.source === SOURCE_LP;

    // Status & color
    const status  = isLP ? getLPEntryStatus(entry) : getScheduleStatus(entry);
    const meta    = STATUS_META[status] || STATUS_META.draft;

    // Batch label
    const batchName = isLP
      ? entry.batchName
      : ((function(){ var _b = AppState.findById("batches", entry.batchId); return _b ? _b.batchName : undefined; }()) || '');

    const label = entry.testName || 'Unnamed Test';

    // LP entries get a subtle left-bar indicator to distinguish them
    const lpIndicator = isLP
      ? `<span class="ac-chip-lp-tag">LP</span>`
      : '';

    return `
      <div class="ac-event-chip${isLP ? ' ac-chip--lp' : ''}"
           data-id="${entry.id}"
           data-src="${entry.source}"
           style="border-left-color:${isLP ? 'var(--violet)' : meta.color};
                  background:${isLP ? 'var(--violet-dim)' : meta.bg}">
        <span class="ac-chip-name" style="color:${isLP ? 'var(--violet)' : meta.color}">
          ${lpIndicator}${label}
        </span>
        ${batchName ? `<span class="ac-chip-batch">${batchName}</span>` : ''}
        ${entry.time ? `<span class="ac-chip-time">${entry.time}</span>` : ''}
      </div>
    `;
  },

  // ── Detail modal for testingService schedules ───────────────
  _showDetail(schedule) {
    const status   = getScheduleStatus(schedule);
    const meta     = STATUS_META[status]                 || {};
    const typeMeta = TEST_TYPE_META[schedule.testType]   || {};
    const batch    = AppState.findById('batches',   schedule.batchId)   || {};
    const subject  = schedule.subjectId  ? AppState.findById('subjects',  schedule.subjectId)  : null;
    const teacher  = schedule.invigilatorId ? AppState.findById('teachers', schedule.invigilatorId) : null;

    const rows = [
      ['Source',      '<span class="ac-badge" style="color:var(--blue);background:var(--blue-dim)">Scheduled Test</span>'],
      ['Date',        formatDate(schedule.date)],
      ['Time',        schedule.time         || '—'],
      ['Duration',    schedule.durationMinutes ? `${schedule.durationMinutes} min` : '—'],
      ['Batch',       batch.batchName        || '—'],
      ['Subject',     this._subjectFromBatch(batch.batchName)],
      ['Total Marks', schedule.totalMarks    || '—'],
      ['Pass Marks',  schedule.passingMarks  || '—'],
      ['Venue',       schedule.venue         || '—'],
      ['Invigilator', teacher ? `${teacher.firstName} ${teacher.lastName}` : '—'],
      ['Notes',       schedule.notes         || '—'],
    ].map(([k, v]) => `
      <div class="ac-detail-row">
        <span class="ac-detail-key">${k}</span>
        <span class="ac-detail-val">${v}</span>
      </div>
    `).join('');

    this._openModal({
      title:    schedule.testName || 'Test Detail',
      statusMeta: meta,
      typeMeta,
      typeLabel: schedule.testType || '—',
      body:     rows,
    });
  },

  // ── Detail modal for LP-derived entries ─────────────────────
  _showLPDetail(entry) {
    const status   = getLPEntryStatus(entry);
    const meta     = STATUS_META[status]               || {};
    const typeMeta = TEST_TYPE_META[entry.testType]    || {};

    const rows = [
      ['Source',        `<span class="ac-badge" style="color:var(--violet);background:var(--violet-dim)">
                           Lecture Plan
                         </span>`],
      ['Date',          formatDate(entry.date)],
      ['Batch',         entry.batchName || '—'],
      ['Plan',          entry.lpCode ? `${entry.lpCode} — ${entry.lpTitle}` : entry.lpTitle || '—'],
      ['Duration',      entry.durationMinutes ? `${entry.durationMinutes} min` : '—'],
      ['LP Row Status', entry.rowStatus || '—'],
      ['Notes / Remarks', entry.notes   || '—'],
    ].map(([k, v]) => `
      <div class="ac-detail-row">
        <span class="ac-detail-key">${k}</span>
        <span class="ac-detail-val">${v}</span>
      </div>
    `).join('');

    // Info note about auto-sync
    const syncNote = `
      <div class="ac-detail-sync-note">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.5">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        This entry is auto-synced from the Lecture Plan.
        To change the date, update the lecture plan assignment.
      </div>
    `;

    this._openModal({
      title:    entry.testName || 'LP Test Entry',
      statusMeta: meta,
      typeMeta,
      typeLabel: entry.testType || '—',
      body:     rows + syncNote,
    });
  },

  // ── Shared modal renderer ────────────────────────────────────
  _openModal({ title, statusMeta, typeMeta, typeLabel, body }) {
    const overlay = document.createElement('div');
    overlay.className = 'ac-overlay';
    overlay.innerHTML = `
      <div class="ac-detail-modal">
        <div class="ac-detail-header"
             style="border-bottom:2px solid ${statusMeta.color || 'var(--border)'}">
          <div>
            <div class="ac-detail-title">${title}</div>
            <div style="display:flex;gap:6px;margin-top:4px">
              <span class="ac-badge"
                    style="color:${statusMeta.color};background:${statusMeta.bg}">
                ${statusMeta.label || '—'}
              </span>
              <span class="ac-badge"
                    style="color:${typeMeta.color||'var(--t2)'};background:${typeMeta.bg||'var(--surface3)'}">
                ${typeLabel}
              </span>
            </div>
          </div>
          <button class="ac-detail-close" id="acDetailClose" title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" stroke-width="2.2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6"  y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="ac-detail-body">${body}</div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    (overlay.querySelector('#acDetailClose')) && overlay.querySelector('#acDetailClose').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  },

  // ── Helpers ─────────────────────────────────────────────────
  _toDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  _getWeekRange() {
    const ref = new Date(this._year, this._month, this._weekStart || new Date().getDate());
    const sunday = new Date(ref);
    sunday.setDate(ref.getDate() - ref.getDay());

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return d;
    });

    this._year      = sunday.getFullYear();
    this._month     = sunday.getMonth();
    this._weekStart = sunday.getDate();

    const fmt = d => `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
    const label = `${fmt(days[0])} – ${fmt(days[6])}, ${days[6].getFullYear()}`;

    return { days, label };
  },

  // ── Export: get currently-visible entries ───────────────────
  // Returns the same entries that are shown in the table right now.
  _getCurrentExportEntries() {
    const allEntries = this._getAllFilteredEntries();
    let result;
    if (this._dateMode === 'today') {
      const todayStr = this._toDateStr(new Date());
      result = allEntries.filter(e => e.date === todayStr);
    } else if (this._dateMode === 'range') {
      const from = this._dateFrom;
      const to   = this._dateTo;
      if (from || to) {
        result = allEntries.filter(e => {
          if (!e.date) return false;
          if (from && e.date < from) return false;
          if (to   && e.date > to)   return false;
          return true;
        });
      } else {
        result = allEntries;
      }
    } else {
      // Week mode
      const weekDates = this._weekDateStrings(this._weekStart);
      result = allEntries.filter(e => e.date && weekDates.includes(e.date));
    }
    return result.slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  },

  // ── Extract subject label from batch name ────────────────────
  // Rule: take everything before the FIRST dash in the batch name.
  // "SBR-JUNE-26-01" → "SBR" | "F6-JUNE-26-01" → "F6" | "MA1-JUNE-26-01" → "MA1"
  _subjectFromBatch(batchName) {
    if (!batchName || batchName === '—') return '—';
    return batchName.split('-')[0] || '—';
  },

  // ── Extract just the trailing batch number from a batch code ──
  // Rule: take everything after the LAST dash in the batch name.
  // "MA1-JUNE-26-06" → "06" | "SBR-JUNE-26-01" → "01"
  _batchNumberFromName(batchName) {
    if (!batchName || batchName === '—') return '—';
    const parts = batchName.split('-');
    return parts[parts.length - 1] || batchName;
  },

  // ── Which columns are currently visible (column manager state) ─
  _visibleAcCols() {
    const prefs = _getAcColPrefs();
    return AC_COLUMNS.filter(c => c.locked || !prefs.hidden.includes(c.key));
  },

  // ── Column manager (show/hide columns; drives the table AND export) ─
  _wireColManager(container) {
    const btn   = container.querySelector('#acColMgrBtn');
    const panel = container.querySelector('#acColMgrPanel');
    const list  = container.querySelector('#acColMgrList');
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
      const prefs = _getAcColPrefs();
      list.innerHTML = '';

      AC_COLUMNS.forEach(col => {
        const isVisible = col.locked ? true : !prefs.hidden.includes(col.key);
        const item = document.createElement('div');
        item.className = 'ac-col-mgr-item' + (isVisible ? '' : ' col-hidden') + (col.locked ? ' col-locked' : '');
        item.innerHTML =
          `<input type="checkbox" class="ac-col-mgr-chk" id="ac_chk_${col.key}"${isVisible ? ' checked' : ''}${col.locked ? ' disabled title="Always visible"' : ''}/>` +
          `<label class="ac-col-mgr-lbl" for="ac_chk_${col.key}">${col.label}${col.locked ? ' <span class="ac-col-mgr-lock">🔒</span>' : ''}</label>`;
        if (!col.locked) {
          item.querySelector('.ac-col-mgr-chk').addEventListener('change', e => {
            const p = _getAcColPrefs();
            if (e.target.checked) {
              p.hidden = p.hidden.filter(h => h !== col.key);
              item.classList.remove('col-hidden');
            } else {
              if (!p.hidden.includes(col.key)) p.hidden.push(col.key);
              item.classList.add('col-hidden');
            }
            _saveAcColPrefs(p);
            panel.classList.remove('open');
            this._renderCalendar();
          });
        }
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

    container.querySelector('#acColMgrShowAll')?.addEventListener('click', () => {
      _saveAcColPrefs({ hidden: [] });
      panel.classList.remove('open');
      this._renderCalendar();
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
    this._unsubscribers.push(() => document.removeEventListener('click', _outsideClick));

    window.addEventListener('scroll', () => {
      if (panel.classList.contains('open')) _positionPanel();
    }, true);
  },

  // ── Build readable filter labels for export header ───────────
  _getFilterLabels() {
    const labels = [];

    // Campus filter
    if (this._filterCampus.length) {
      const names = this._filterCampus.map(id => {
        const c = AppState.findById('campuses', id);
        return c ? (c.campusName || id) : id;
      });
      labels.push({ key: 'Campus', val: names.join(', ') });
    }

    // Batch filter
    if (this._filterBatch.length) {
      const names = this._filterBatch.map(id => {
        const b = AppState.findById('batches', id);
        return b ? (b.batchName || id) : id;
      });
      labels.push({ key: 'Batch', val: names.join(', ') });
    }

    // Status filter
    if (this._filterStatus.length) {
      const names = this._filterStatus.map(s => (STATUS_META[s] && STATUS_META[s].label) || s);
      labels.push({ key: 'Status', val: names.join(', ') });
    }

    // Source filter
    if (this._filterSource.length) {
      const names = this._filterSource.map(s =>
        s === 'lp' ? 'Lecture Plan' : s === 'schedule' ? 'Scheduled Tests' : s
      );
      labels.push({ key: 'Source', val: names.join(', ') });
    }

    // Discipline filter
    if (this._filterDisc.length) {
      const names = this._filterDisc.map(id => {
        const d = AppState.findById('disciplines', id);
        return d ? (d.abbreviation || d.fullName || id) : id;
      });
      labels.push({ key: 'Discipline', val: names.join(', ') });
    }

    // Level filter
    if (this._filterLevel.length) {
      const names = this._filterLevel.map(id => {
        const l = AppState.findById('levels', id);
        return l ? (l.levelName || l.name || id) : id;
      });
      labels.push({ key: 'Level', val: names.join(', ') });
    }

    // Session filter
    if (this._filterSession.length) {
      labels.push({ key: 'Session', val: this._filterSession.join(', ') });
    }

    if (!labels.length) {
      return [
        { key: 'Campus',     val: 'All Campuses'    },
        { key: 'Batch',      val: 'All Batches'     },
        { key: 'Status',     val: 'All Status'      },
        { key: 'Source',     val: 'All Sources'     },
        { key: 'Discipline', val: 'All Disciplines' },
        { key: 'Level',      val: 'All Levels'      },
        { key: 'Session',    val: 'All Sessions'    },
      ];
    }
    return labels;
  },

  // ── Build flat rows for export ───────────────────────────────
  _buildExportRows(entries) {
    const visibleCols = this._visibleAcCols();

    return entries.map(entry => {
      const isLP   = entry.source === SOURCE_LP;
      const status = isLP ? getLPEntryStatus(entry) : getScheduleStatus(entry);
      const sMeta  = STATUS_META[status] || STATUS_META.draft;

      // Batch: full batch code (e.g. "F6-JUNE-26-01") — used to derive Subject
      const batchObj  = AppState.findById('batches', entry.batchId);
      const batchCode = isLP
        ? (entry.batchName || '—')
        : ((batchObj && batchObj.batchName) || '—');

      // Subject: first segment of batch name — same rule as screen view
      // "SBR-JUNE-26-01" → "SBR" | "F6-JUNE-26-01" → "F6"
      const subjectName = this._subjectFromBatch(batchCode);

      const campus = (batchObj && batchObj.campusId) ? AppState.findById('campuses', batchObj.campusId) : null;

      // Teacher assigned to the batch
      const teacherName = _getTeacherName(batchObj);

      // Room — manually entered on screen, blank until set
      const roomVal = _getRoomForEntry(entry.id);

      // Build every possible value once, keyed by column key, then pick
      // only the ones the column manager currently has visible — this
      // keeps export columns in sync with what's shown on screen.
      const valuesByKey = {
        date:    entry.date     || '—',
        name:    entry.testName || '—',
        batch:   this._batchNumberFromName(batchCode),
        campus:  campus ? campus.campusName : '—',
        subject: subjectName,
        room:    roomVal || '—',
        teacher: teacherName,
        status:  sMeta.label || status,
        source:  isLP ? 'Lecture Plan' : 'Scheduled',
      };

      const row = {};
      visibleCols.forEach(col => { row[col.label] = valuesByKey[col.key]; });
      return row;
    });
  },

  // ── Export CSV (opens in Excel) ──────────────────────────────
  _exportCSV(entries) {
    if (!entries.length) {
      console.warn('Assessment Calendar: No data to export.');
      alert('No assessments found to export.');
      return;
    }
    const data    = this._buildExportRows(entries);
    const headers = Object.keys(data[0]);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    // Sheet starts directly at the column headings — no report title,
    // generated-on line, or filter summary above the data.
    const csvRows = [
      headers.join(','),
      ...data.map(r => headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(',')),
    ];

    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `Assessment-Calendar-${dateStr.replace(/ /g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Export PDF (opens print-ready window) ───────────────────
  _exportPDF(entries) {
    if (!entries.length) {
      alert('No assessments found to export.');
      return;
    }
    const data    = this._buildExportRows(entries);
    const headers = Object.keys(data[0]);
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const rangeLabel = this._dateMode === 'today'
      ? `Today — ${formatDate(this._toDateStr(new Date()))}`
      : this._dateMode === 'week'
      ? this._weekRangeLabel(this._weekStart)
      : (this._dateFrom || this._dateTo
          ? `${formatDate(this._dateFrom) || 'Start'} → ${formatDate(this._dateTo) || 'End'}`
          : 'All dates');

    const fromLP  = entries.filter(e => e.source === SOURCE_LP).length;
    const fromSch = entries.filter(e => e.source === SOURCE_SCHEDULE).length;

    const colWidths = {
      'Date':       72,
      'Assessment': 110,
      'Batch':      55,
      'Campus':     75,
      'Subject':    60,
      'Room':       55,
      'Teacher':    90,
      'Status':     60,
      'Source':     70,
    };

    const thCells = headers.map(h =>
      `<th style="width:${colWidths[h] || 70}px">${h}</th>`
    ).join('');

    const tdRows = data.map((r, i) =>
      `<tr class="${i % 2 === 0 ? 'even' : 'odd'}">` +
        headers.map(h => `<td>${r[h] || '—'}</td>`).join('') +
      `</tr>`
    ).join('');

    const filterLabels = this._getFilterLabels();
    const filterHTML = filterLabels.length
      ? filterLabels.map(f =>
          `<span class="filter-chip"><span class="fk">${f.key}:</span> ${f.val}</span>`
        ).join('')
      : `<span class="filter-chip filter-none">No filters applied — showing all data</span>`;

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Assessment Calendar Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1e293b;background:#fff;padding:18px 20px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2.5px solid #2563eb;padding-bottom:10px;margin-bottom:12px}
  .header-left .title{font-size:18px;font-weight:700;color:#1e40af;letter-spacing:-0.3px}
  .header-left .subtitle{font-size:10.5px;color:#64748b;margin-top:2px}
  .header-right{text-align:right;font-size:10px;color:#64748b;line-height:1.6}
  .header-right .date{font-weight:600;color:#1e293b;font-size:10.5px}
  .meta-row{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
  .stat-box{background:#f8faff;border:1px solid #dbeafe;border-radius:8px;padding:5px 12px;text-align:center}
  .stat-box .num{font-size:16px;font-weight:700;color:#2563eb;font-family:monospace}
  .stat-box .lbl{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px}
  .range-row{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;
             font-size:10px;color:#475569;margin-bottom:8px}
  .range-row strong{color:#1e293b}
  .filters-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
               background:#f0f7ff;border:1px solid #bfdbfe;border-radius:8px;
               padding:7px 12px;margin-bottom:10px}
  .filters-label{font-size:9px;font-weight:700;color:#1e40af;text-transform:uppercase;
                 letter-spacing:0.6px;white-space:nowrap;margin-right:2px}
  .filter-chip{background:#dbeafe;color:#1d4ed8;font-size:9.5px;font-weight:500;
               padding:2px 9px;border-radius:10px;white-space:nowrap}
  .filter-chip .fk{font-weight:700}
  .filter-none{background:#f1f5f9;color:#64748b}
  table{width:100%;border-collapse:collapse;font-size:9.5px}
  thead tr{background:#1e40af}
  thead th{color:#fff;font-weight:600;padding:6px 6px;text-align:left;font-size:8.5px;
           text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap}
  tbody tr.even{background:#fff}
  tbody tr.odd{background:#f8faff}
  tbody td{padding:5px 6px;border-bottom:1px solid #e2e8f0;color:#334155;vertical-align:top}
  tbody td:first-child{font-weight:600;color:#1e293b}
  .footer{margin-top:12px;padding-top:8px;border-top:1px solid #e2e8f0;
          display:flex;justify-content:space-between;font-size:9px;color:#94a3b8}
  @media print{
    body{padding:10px 12px}
    @page{size:A4 landscape;margin:8mm}
    .no-print{display:none}
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <div class="title">Assessment Calendar Report</div>
      <div class="subtitle">Scheduled Tests &amp; Lecture Plan Assessments</div>
    </div>
    <div class="header-right">
      <div class="date">${dateStr}</div>
      <div>${timeStr}</div>
    </div>
  </div>

  <div class="meta-row">
    <div class="stat-box">
      <div class="num">${entries.length}</div>
      <div class="lbl">Total</div>
    </div>
    <div class="stat-box">
      <div class="num">${fromLP}</div>
      <div class="lbl">Lecture Plan</div>
    </div>
    <div class="stat-box">
      <div class="num">${fromSch}</div>
      <div class="lbl">Scheduled</div>
    </div>
  </div>

  <div class="range-row">
    &#128197; <strong>Date Range:</strong> ${rangeLabel}
  </div>

  <div class="filters-row">
    <span class="filters-label">&#9660; Filters</span>
    ${filterHTML}
  </div>

  <table>
    <thead><tr>${thCells}</tr></thead>
    <tbody>${tdRows}</tbody>
  </table>

  <div class="footer">
    <span>Assessment Calendar &nbsp;|&nbsp; Exported ${dateStr} at ${timeStr}</span>
    <span>Total: ${entries.length} entr${entries.length !== 1 ? 'ies' : 'y'}</span>
  </div>
  <div style="margin-top:8px;text-align:center;font-size:9px;color:#94a3b8">
    Powered by <strong style="color:#2563eb">Learnomist</strong>
  </div>

  <div class="no-print" style="margin-top:16px;text-align:center">
    <button onclick="window.print()"
      style="padding:8px 26px;background:#2563eb;color:#fff;border:none;border-radius:8px;
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

  // ── Styles ──────────────────────────────────────────────────
  _injectStyles() {
    if (document.getElementById('ac-styles')) return;
    const st = document.createElement('style');
    st.id = 'ac-styles';
    st.textContent = `
      /* Page */
      .ac-page { display:flex; flex-direction:column; gap:14px; }

      /* Toolbar */
      .ac-toolbar {
        display:flex; align-items:center; gap:8px; flex-wrap:wrap;
        padding:12px 16px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
      }
      .ac-nav { display:flex; align-items:center; gap:4px; }
      .ac-nav-btn {
        width:30px; height:30px; border-radius:8px;
        display:inline-flex; align-items:center; justify-content:center;
        border:1px solid var(--border2); color:var(--t2);
        background:var(--surface2); cursor:pointer; transition:all .12s;
      }
      .ac-nav-btn:hover { border-color:var(--blue); color:var(--blue); }
      .ac-month-label {
        font-size:14px; font-weight:700; color:var(--t1);
        min-width:160px; text-align:center; padding:0 6px;
      }
      .ac-today-btn {
        height:30px; padding:0 12px;
        border:1px solid var(--border2); border-radius:8px;
        background:var(--surface2); color:var(--t2);
        font-size:12.5px; font-family:var(--font-body);
        cursor:pointer; transition:all .12s; margin-left:4px;
      }
      .ac-today-btn:hover { border-color:var(--blue); color:var(--blue); }
      .ac-filter-sel {
        height:32px; padding:0 10px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t2); font-size:12.5px;
        cursor:pointer; outline:none; font-family:var(--font-body);
      }
      .ac-filter-sel:focus { border-color:var(--blue); color:var(--t1); }
      .ac-view-toggle {
        display:flex; border:1px solid var(--border2);
        border-radius:8px; overflow:hidden;
        flex-shrink:0;
      }
      .ac-view-btn {
        height:30px; padding:0 14px;
        display:inline-flex; align-items:center; gap:4px;
        font-size:12.5px; font-family:var(--font-body);
        font-weight:600; color:var(--t3); cursor:pointer;
        background:var(--surface2); transition:all .12s;
        border:none; white-space:nowrap;
      }
      .ac-view-btn + .ac-view-btn { border-left:1px solid var(--border2); }
      .ac-view-btn.active { background:var(--blue); color:#fff; }
      .ac-table-row:hover td { background:var(--blue-dim) !important; }

      /* Sync badge */
      .ac-sync-badge {
        display:inline-flex; align-items:center; gap:5px;
        padding:4px 10px; border-radius:8px;
        background:var(--violet-dim); color:var(--violet);
        font-size:11.5px; font-weight:600;
        align-self:flex-start;
        transition:opacity .3s;
      }
      .ac-sync-hidden { opacity:0; pointer-events:none; }

      /* Stats strip */
      .ac-stats-strip {
        display:flex; align-items:center; flex-wrap:wrap; gap:8px;
        padding:7px 12px;
        background:var(--surface2);
        border:1px solid var(--border);
        border-radius:10px;
        font-size:12px; color:var(--t2);
      }
      .ac-stat-num  { font-weight:700; color:var(--t1); }
      .ac-stat-sep  { color:var(--t4); }
      .ac-stat-lp   { display:flex; align-items:center; gap:4px; color:var(--violet); }
      .ac-stat-sched{ display:flex; align-items:center; gap:4px; color:var(--blue); }
      .ac-stat-tag  {
        display:inline-block; padding:1px 7px;
        border-radius:6px; font-size:11px; font-weight:700;
      }

      /* Calendar wrapper */
      .ac-calendar-wrap {
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
        overflow:hidden;
      }

      /* Month grid */
      .ac-day-headers {
        display:grid; grid-template-columns:repeat(7, 1fr);
        border-bottom:1px solid var(--border);
        background:var(--surface2);
      }
      .ac-day-hdr {
        padding:8px 0; text-align:center;
        font-size:11px; font-weight:700; letter-spacing:.05em;
        color:var(--t3); text-transform:uppercase;
      }
      .ac-cells {
        display:grid; grid-template-columns:repeat(7, 1fr);
      }
      .ac-cell {
        min-height:96px; padding:6px 8px;
        border-right:1px solid var(--border);
        border-bottom:1px solid var(--border);
        vertical-align:top; position:relative;
      }
      .ac-cell:nth-child(7n) { border-right:none; }
      .ac-cell--empty { background:var(--surface2); opacity:.5; }
      .ac-cell--today { background:var(--blue-dim); }
      .ac-day-num {
        font-size:12px; font-weight:600; color:var(--t3);
        display:block; margin-bottom:4px;
      }
      .ac-day-num--today {
        background:var(--blue); color:#fff;
        border-radius:50%; width:22px; height:22px;
        display:inline-flex; align-items:center; justify-content:center;
        font-size:11.5px;
      }
      .ac-events { display:flex; flex-direction:column; gap:2px; }

      /* Week grid */
      .ac-week-grid {
        display:grid; grid-template-columns:repeat(7, 1fr);
      }
      .ac-week-col {
        border-right:1px solid var(--border);
        min-height:320px;
      }
      .ac-week-col:last-child { border-right:none; }
      .ac-week-col--today { background:var(--blue-dim); }
      .ac-week-day-hdr {
        padding:8px; text-align:center;
        border-bottom:1px solid var(--border);
        background:var(--surface2);
        display:flex; flex-direction:column; gap:2px;
      }
      .ac-week-day-name {
        font-size:11px; font-weight:700; letter-spacing:.05em;
        color:var(--t3); text-transform:uppercase;
      }
      .ac-week-day-num {
        font-size:18px; font-weight:700; color:var(--t2); line-height:1;
      }
      .ac-week-events { padding:6px; display:flex; flex-direction:column; gap:4px; }
      .ac-no-event { text-align:center; color:var(--t4); font-size:11px; padding:8px 0; }

      /* Event chip — base */
      .ac-event-chip {
        padding:3px 6px;
        border-left:3px solid transparent;
        border-radius:4px;
        cursor:pointer;
        transition:filter .12s;
        position:relative;
      }
      .ac-event-chip:hover { filter:brightness(.92); }

      /* LP chip — subtle dashed left border */
      .ac-chip--lp { border-left-style:dashed; }

      .ac-chip-lp-tag {
        display:inline-block;
        font-size:9px; font-weight:800; letter-spacing:.04em;
        background:var(--violet); color:#fff;
        border-radius:3px; padding:0 3px;
        margin-right:3px; vertical-align:middle;
      }
      .ac-chip-name {
        display:block; font-size:11px; font-weight:600;
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .ac-chip-batch {
        display:block; font-size:10px; color:var(--t3);
        white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
      }
      .ac-chip-time {
        display:block; font-size:10px; color:var(--t4);
      }
      .ac-more-badge {
        font-size:10px; color:var(--t3); padding:1px 4px;
        background:var(--surface3); border-radius:4px;
        display:inline-block; margin-top:1px;
      }

      /* Legend */
      .ac-legend {
        display:flex; align-items:center; flex-wrap:wrap; gap:10px;
        padding:8px 4px;
      }
      .ac-legend-item {
        display:flex; align-items:center; gap:5px;
        font-size:11.5px; color:var(--t3);
      }
      .ac-legend-dot {
        width:8px; height:8px; border-radius:50%; flex-shrink:0;
      }

      /* Detail modal */
      .ac-overlay {
        position:fixed; inset:0; z-index:9999;
        background:rgba(0,0,0,.45);
        display:flex; align-items:center; justify-content:center;
        padding:24px;
      }
      .ac-detail-modal {
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:14px;
        width:100%; max-width:440px;
        box-shadow:0 16px 48px rgba(0,0,0,.22);
        overflow:hidden;
      }
      .ac-detail-header {
        display:flex; justify-content:space-between; align-items:flex-start;
        padding:16px 18px;
        border-bottom:1px solid var(--border);
      }
      .ac-detail-title { font-size:15px; font-weight:700; color:var(--t1); }
      .ac-detail-close {
        width:28px; height:28px; border-radius:6px;
        display:inline-flex; align-items:center; justify-content:center;
        color:var(--t3); cursor:pointer;
        border:1px solid var(--border2);
        transition:all .12s; flex-shrink:0; margin-left:8px;
      }
      .ac-detail-close:hover { border-color:var(--red); color:var(--red); }
      .ac-detail-body { padding:14px 18px; display:flex; flex-direction:column; gap:8px; }
      .ac-detail-row { display:flex; align-items:flex-start; gap:10px; font-size:12.5px; }
      .ac-detail-key { min-width:110px; color:var(--t3); font-weight:600; flex-shrink:0; }
      .ac-detail-val { color:var(--t1); flex:1; }
      .ac-badge {
        display:inline-block; padding:2px 8px;
        border-radius:6px; font-size:11px; font-weight:700;
      }

      /* Sync note inside detail modal */
      .ac-detail-sync-note {
        display:flex; align-items:flex-start; gap:6px;
        margin-top:4px; padding:8px 10px;
        background:var(--violet-dim);
        border:1px solid var(--violet);
        border-radius:8px;
        font-size:11.5px; color:var(--violet);
        line-height:1.45;
      }

      /* Filter bar */
      .ac-filter-bar {
        display:flex; align-items:center; gap:6px; flex-wrap:wrap;
        padding:8px 12px;
        background:var(--surface);
        border:1px solid var(--border);
        border-radius:12px;
      }

      /* Date inputs */
      .ac-date-input {
        height:30px; padding:0 8px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t1); font-size:12.5px;
        font-family:var(--font-body); outline:none; cursor:pointer;
      }
      .ac-date-input:focus { border-color:var(--blue); }
      .ac-clear-range-btn {
        height:26px; width:26px; border-radius:6px;
        border:1px solid var(--border2); background:var(--surface2);
        color:var(--t3); cursor:pointer; font-size:11px;
        display:inline-flex; align-items:center; justify-content:center;
        transition:all .12s;
      }
      .ac-clear-range-btn:hover { border-color:var(--red); color:var(--red); }

      /* Multi-select wrapper */
      .ac-ms-wrap {
        position:relative;
      }
      .ac-ms-trigger {
        height:30px; padding:0 10px;
        display:inline-flex; align-items:center; gap:5px;
        background:var(--surface2); border:1px solid var(--border2);
        border-radius:8px; color:var(--t2); font-size:12px;
        font-family:var(--font-body); font-weight:600;
        cursor:pointer; white-space:nowrap; transition:all .12s;
        max-width:180px;
      }
      .ac-ms-trigger:hover { border-color:var(--blue); color:var(--t1); }
      .ac-ms-label {
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
        max-width:110px;
      }
      .ac-ms-caret { flex-shrink:0; color:var(--t4); }

      /* Dropdown panel */
      .ac-ms-dropdown {
        display:none; position:absolute; top:calc(100% + 4px); left:0;
        min-width:180px; max-height:240px; overflow-y:auto;
        background:var(--surface); border:1px solid var(--border2);
        border-radius:10px; box-shadow:0 8px 24px rgba(0,0,0,.14);
        z-index:999; padding:4px;
      }
      .ac-ms-dropdown.open { display:block; }
      .ac-ms-option {
        display:flex; align-items:center; gap:8px;
        padding:7px 10px; border-radius:7px;
        font-size:12.5px; color:var(--t2); cursor:pointer;
        transition:background .1s; user-select:none;
      }
      .ac-ms-option:hover { background:var(--surface2); color:var(--t1); }
      .ac-ms-option input[type="checkbox"] {
        width:14px; height:14px; cursor:pointer; flex-shrink:0;
        accent-color:var(--blue);
      }
      .ac-ms-dot {
        width:8px; height:8px; border-radius:50%; flex-shrink:0;
      }
      .ac-ms-empty {
        padding:10px; text-align:center;
        font-size:12px; color:var(--t4);
      }

      /* Active filter chips */
      .ac-active-chip {
        display:inline-flex; align-items:center; gap:4px;
        padding:2px 8px; border-radius:20px;
        font-size:11px; font-weight:600;
        border:1px solid transparent; cursor:default;
      }
      .ac-chip-x {
        font-size:10px; cursor:pointer; opacity:.7; line-height:1;
      }
      .ac-chip-x:hover { opacity:1; }

      /* Clear all button */
      .ac-clear-all-btn {
        height:26px; padding:0 10px;
        border:1px solid var(--border2); border-radius:20px;
        background:transparent; color:var(--t3);
        font-size:11px; font-weight:600; cursor:pointer;
        transition:all .12s; white-space:nowrap;
      }
      .ac-clear-all-btn:hover { border-color:var(--red); color:var(--red); }

      /* Column manager */
      .ac-col-mgr-wrap  { position:relative; }
      .ac-col-mgr-btn {
        display:inline-flex; align-items:center; justify-content:center;
        width:30px; height:30px; border-radius:8px;
        border:1px solid var(--border); background:var(--surface2);
        color:var(--t3); cursor:pointer; transition:all .15s;
      }
      .ac-col-mgr-btn:hover { border-color:var(--blue); color:var(--blue); }
      .ac-col-mgr-panel {
        position:fixed; z-index:9999;
        width:200px; background:var(--surface);
        border:1px solid var(--border); border-radius:10px;
        box-shadow:0 8px 32px rgba(0,0,0,.18);
        display:none; flex-direction:column; overflow:hidden;
        max-height:min(340px, calc(100vh - 24px));
      }
      .ac-col-mgr-panel.open { display:flex; }
      .ac-col-mgr-head {
        padding:9px 13px 7px;
        border-bottom:1px solid var(--border);
        display:flex; align-items:center;
        justify-content:space-between; flex-shrink:0;
      }
      .ac-col-mgr-title {
        font-size:11.5px; font-weight:700; color:var(--t1);
        display:flex; align-items:center; gap:6px;
      }
      .ac-col-mgr-link {
        font-size:11px; color:var(--blue); cursor:pointer;
        background:none; border:none; padding:0;
        text-decoration:underline; font-weight:600;
      }
      .ac-col-mgr-link:hover { opacity:.8; }
      .ac-col-mgr-list { padding:4px 0; overflow-y:auto; flex:1; }
      .ac-col-mgr-item {
        display:flex; align-items:center; gap:8px;
        padding:7px 12px; cursor:default; user-select:none;
        transition:background .1s;
      }
      .ac-col-mgr-item:hover { background:var(--surface2); }
      .ac-col-mgr-chk { width:14px; height:14px; accent-color:var(--blue); cursor:pointer; flex-shrink:0; }
      .ac-col-mgr-lbl { font-size:12.5px; color:var(--t1); flex:1; cursor:pointer; }
      .ac-col-mgr-item.col-hidden .ac-col-mgr-lbl { color:var(--t4); }
      .ac-col-mgr-item.col-locked { cursor:default; }
      .ac-col-mgr-item.col-locked .ac-col-mgr-chk { cursor:default; opacity:.6; }
      .ac-col-mgr-item.col-locked .ac-col-mgr-lbl { cursor:default; }
      .ac-col-mgr-lock { font-size:10px; opacity:.6; margin-left:2px; }
      .ac-col-mgr-foot {
        padding:6px 12px; border-top:1px solid var(--border);
        font-size:10.5px; color:var(--t3); text-align:center;
        flex-shrink:0; background:var(--surface2);
      }

      /* Room cell — inline edit */
      .ac-room-display {
        display:flex; align-items:center; gap:6px;
      }
      .ac-room-text {
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:90px;
      }
      .ac-room-edit-btn {
        display:inline-flex; align-items:center; justify-content:center;
        width:20px; height:20px; border-radius:5px;
        border:none; background:transparent;
        color:var(--t4); cursor:pointer; opacity:.7; transition:all .12s; flex-shrink:0;
      }
      .ac-room-edit-btn:hover { opacity:1; background:var(--surface2); color:var(--blue); }
      .ac-room-input {
        height:26px; padding:0 6px; width:90px;
        border:1px solid var(--blue); border-radius:6px;
        background:var(--surface2); color:var(--t1);
        font-size:12px; font-family:var(--font-body); outline:none;
      }
      .ac-room-save-btn {
        display:inline-flex; align-items:center; justify-content:center;
        width:22px; height:22px; border-radius:5px; flex-shrink:0;
        border:1px solid var(--green); background:var(--green-dim);
        color:var(--green); cursor:pointer; font-size:12px; font-weight:700;
      }
    `;
    document.head.appendChild(st);
  },
};
