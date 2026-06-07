// ============================================================
// modules/attendance/attendanceUI.js  — Rebuilt Attendance UI
//
// ARCHITECTURE:
//   Tab 1: Batch-wise Attendance  (NEW — LP-driven horizontal sheet)
//   Tab 2: Date-wise Attendance   (legacy date-grid approach preserved)
//
// Batch-wise flow:
//   Filters: Campus → Discipline → Session (sidebar)
//   Sidebar: Active batches (LP endDate > today)
//   Search bar above batch list
//   Click batch → Horizontal attendance sheet loads on right
//
// Sheet layout:
//   Frozen: # | Student Name | ID
//   Scrollable columns: one per class date (LP workDays from LP startDate→endDate)
//   Grouped by Month headers
//   Cells: P / A / L toggle — click cycles P→A→L→(clear)
//   First student mark → sets default for all unmarked students that date
//   Live: re-derives dates from LP on each render
// ============================================================

import { AppState }            from '../../utils/state.js';
import { Auth }                from '../../utils/auth.js';
import { Modal }               from '../../utils/ui.js';
import { Toast }               from '../../utils/helpers.js';
import { injectUIStyles }      from '../../utils/ui.js';
import {
  ensureAttendanceKeys,
  ScheduleService,
  AttendanceDateGenerator,
  AttendanceService,
  fetchAndSyncBatchAttendance,
  DAY_NAMES,
  DAY_SHORT,
  toISODate,
  parseLocalDate,
  formatDisplayDate,
} from './attendanceService.js';
import { EnrolmentService }    from '../enrolment/enrolmentService.js';

// ── Module state ──────────────────────────────────────────────
let _root          = null;
let _activeTab     = 'batchwise';  // 'batchwise' | 'datewise'
let _filterCampus  = '';
let _filterDisc    = '';
let _filterSession = '';
let _batchSearch   = '';
let _selBatch      = null;         // selected batch object
let _pendingChanges = {};          // { `${batchId}|${studentId}|${date}` → status }
let _dwSelectedBatch = null;       // date-wise tab state
let _dwSelectedDate  = null;

// ── Inject styles ─────────────────────────────────────────────
function _injectStyles() {
  if (document.getElementById('att2-styles')) return;
  const s = document.createElement('style');
  s.id = 'att2-styles';
  s.textContent = `
/* ══ SHELL ══════════════════════════════════════════════════ */
.att2-shell { display:flex; flex-direction:column; height:100%; min-height:calc(100vh - 140px); }

@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }

/* ── Tabs ──────────────────────────────────────────────────── */
.att2-tabs {
  display:flex; gap:0; border-bottom:2px solid var(--border);
  padding:0 20px; background:var(--surface); flex-shrink:0;
}
.att2-tab {
  padding:11px 18px; font-size:13px; font-weight:600;
  color:var(--t3); cursor:pointer; border:none; background:none;
  border-bottom:2px solid transparent; margin-bottom:-2px;
  transition:all .15s; display:inline-flex; align-items:center; gap:7px;
}
.att2-tab:hover { color:var(--t1); }
.att2-tab.active { color:var(--blue); border-bottom-color:var(--blue); }

/* ── Batch-wise layout ─────────────────────────────────────── */
.att2-bw { display:grid; grid-template-columns:280px 1fr; flex:1; min-height:0; overflow:hidden; }

/* ── Sidebar ──────────────────────────────────────────────── */
.att2-sidebar {
  border-right:1px solid var(--border);
  display:flex; flex-direction:column; overflow:hidden;
}
.att2-filters {
  flex-shrink:0; padding:10px; display:flex; flex-direction:column;
  gap:6px; border-bottom:1px solid var(--border);
}
.att2-filter-sel {
  width:100%; background:var(--surface2); border:1px solid var(--border2);
  border-radius:var(--r-sm); color:var(--t1); font-size:12px;
  padding:6px 8px; outline:none; cursor:pointer;
}
.att2-filter-sel:focus { border-color:var(--blue); }
.att2-sb-search {
  flex-shrink:0; display:flex; align-items:center; gap:7px;
  padding:8px 10px; border-bottom:1px solid var(--border);
}
.att2-sb-search svg { color:var(--t4); flex-shrink:0; }
.att2-sb-search input {
  flex:1; background:none; border:none; outline:none;
  font-size:12.5px; color:var(--t1); font-family:inherit;
}
.att2-sb-search input::placeholder { color:var(--t4); }
.att2-batch-list { flex:1; overflow-y:auto; }

/* ── Batch item ───────────────────────────────────────────── */
.att2-batch-item {
  padding:10px 12px; cursor:pointer; border-bottom:1px solid var(--border);
  transition:background .12s; position:relative;
}
.att2-batch-item:hover { background:var(--surface2); }
.att2-batch-item.sel {
  background:var(--blue-dim); border-left:3px solid var(--blue);
}
.att2-batch-name { font-size:12.5px; font-weight:700; font-family:var(--font-mono); color:var(--t1); }
.att2-batch-sub  { font-size:11px; color:var(--t3); margin-top:2px; }
.att2-lp-badge   {
  font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:8px;
  background:var(--blue-dim); color:var(--blue); display:inline-flex; align-items:center; gap:3px;
}
.att2-no-lp-badge {
  font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:8px;
  background:var(--yellow-dim); color:var(--yellow);
}

/* ── Main area ────────────────────────────────────────────── */
.att2-main {
  display:flex; flex-direction:column; overflow:hidden;
}

/* ── Batch header bar ─────────────────────────────────────── */
.att2-batch-hdr {
  flex-shrink:0; padding:14px 20px;
  background:var(--surface2); border-bottom:1px solid var(--border);
  display:flex; align-items:center; gap:14px; flex-wrap:wrap;
}
.att2-batch-hdr-name { font-size:16px; font-weight:800; font-family:var(--font-mono); color:var(--t1); }
.att2-badge { padding:2px 8px; border-radius:10px; font-size:10.5px; font-weight:700; }
.att2-badge-green { background:var(--green-dim); color:var(--green); }
.att2-badge-red   { background:var(--red-dim);   color:var(--red);   }
.att2-badge-yellow{ background:var(--yellow-dim);color:var(--yellow);}
.att2-badge-blue  { background:var(--blue-dim);  color:var(--blue);  }
.att2-hdr-meta    { font-size:12px; color:var(--t3); }
.att2-hdr-actions { margin-left:auto; display:flex; gap:6px; flex-wrap:wrap; }
.att2-btn {
  display:inline-flex; align-items:center; gap:5px; padding:6px 12px;
  border-radius:var(--r-sm); font-size:12px; font-weight:600;
  cursor:pointer; border:1px solid var(--border2); transition:all .15s;
  background:var(--surface2); color:var(--t2);
}
.att2-btn:hover { border-color:var(--blue); color:var(--blue); }
.att2-btn-primary { background:var(--blue); color:#fff; border-color:var(--blue); }
.att2-btn-primary:hover { filter:brightness(1.08); }
.att2-btn-success { background:var(--green); color:#fff; border-color:var(--green); }
.att2-btn-success:hover { filter:brightness(1.08); }

/* ── Horizontal attendance sheet ─────────────────────────── */
.att2-sheet-wrap { flex:1; overflow:auto; position:relative; }

/* Outer table wrapper for frozen columns */
.att2-sheet-table-wrap {
  position:relative; overflow:visible;
}

.att2-sheet-table {
  border-collapse:separate; border-spacing:0;
  font-size:12.5px; min-width:100%;
  table-layout:auto;
}

/* Frozen columns */
.att2-sheet-table .col-frozen {
  position:sticky; z-index:3;
  background:var(--surface2);
}
.att2-sheet-table .col-frozen-0 { left:0;    min-width:36px;  max-width:36px;  border-right:1px solid var(--border2); }
.att2-sheet-table .col-frozen-1 { left:36px; min-width:160px; max-width:200px; border-right:1px solid var(--border2); }
.att2-sheet-table .col-frozen-2 { left:196px;min-width:120px; max-width:140px; border-right:2px solid var(--border); }

/* Header row */
.att2-sheet-table thead th {
  background:var(--surface2); z-index:4;
  padding:8px 6px; font-size:10px; font-weight:700;
  text-transform:uppercase; letter-spacing:.05em; color:var(--t3);
  border-bottom:2px solid var(--border); white-space:nowrap;
  text-align:center; position:sticky; top:0;
}
.att2-sheet-table thead th.col-frozen { z-index:5; }
.att2-sheet-table thead .th-month-hdr {
  text-align:center; background:var(--surface3); color:var(--t2);
  font-size:11px; font-weight:700; padding:5px 0;
  border-bottom:1px solid var(--border); position:sticky; top:0; z-index:4;
}
/* Month header frozen overlap fix */
.att2-sheet-table thead .th-month-hdr.col-frozen { z-index:5; }

/* Body rows */
.att2-sheet-table tbody tr:hover td { background:rgba(var(--blue-rgb,37,99,235),.04); }
.att2-sheet-table tbody td {
  padding:7px 4px; border-bottom:1px solid var(--border);
  text-align:center; vertical-align:middle;
}
.att2-sheet-table tbody td.col-frozen { text-align:left; padding:7px 8px; }

/* Date column header */
.att2-date-col-hdr {
  display:flex; flex-direction:column; align-items:center; gap:1px;
  min-width:44px;
}
.att2-date-col-day  { font-size:9px; color:var(--t4); }
.att2-date-col-date { font-size:11px; font-weight:700; font-family:var(--font-mono); }
.att2-date-col-hdr.is-today .att2-date-col-date { color:var(--blue); }
.att2-date-col-hdr.is-future { opacity:.45; }

/* Attendance cell */
.att2-cell {
  width:36px; height:30px; border-radius:6px;
  font-size:12px; font-weight:800; cursor:pointer;
  border:1.5px solid var(--border2); background:var(--surface2);
  color:var(--t4); display:inline-flex; align-items:center; justify-content:center;
  transition:all .1s; user-select:none; font-family:var(--font-mono);
}
.att2-cell:hover { border-color:var(--blue); color:var(--blue); }
.att2-cell[data-v="P"] { background:var(--green-dim); border-color:var(--green); color:var(--green); }
.att2-cell[data-v="A"] { background:var(--red-dim);   border-color:var(--red);   color:var(--red);   }
.att2-cell[data-v="L"] { background:#fef3c7;           border-color:#d97706;      color:#92400e;      }
.att2-cell.future      { opacity:.35; cursor:not-allowed; pointer-events:none; }
.att2-cell.saving      { opacity:.5; pointer-events:none; }

/* Summary column */
.att2-pct {
  font-size:11px; font-weight:700; font-family:var(--font-mono);
  white-space:nowrap;
}
.att2-pct-bar { height:4px; border-radius:2px; background:var(--surface3); margin-top:3px; min-width:40px; }
.att2-pct-bar-fill { height:100%; border-radius:2px; transition:width .3s; }

/* ── Placeholder / empty ──────────────────────────────────── */
.att2-placeholder {
  flex:1; display:flex; flex-direction:column;
  align-items:center; justify-content:center;
  gap:12px; padding:40px; text-align:center;
}
.att2-placeholder h3 { font-size:15px; font-weight:700; color:var(--t2); }
.att2-placeholder p  { font-size:13px; color:var(--t3); max-width:340px; line-height:1.6; }

/* ── Warn bar ─────────────────────────────────────────────── */
.att2-warn {
  display:flex; align-items:center; gap:10px;
  padding:10px 16px; background:var(--yellow-dim);
  border-bottom:1px solid var(--yellow); font-size:12.5px; color:var(--t2);
}

/* ── Date-wise tab (legacy, preserved) ───────────────────── */
.att2-dw { display:flex; flex:1; min-height:0; overflow:hidden; }
.att2-dw-sidebar {
  width:280px; flex-shrink:0; border-right:1px solid var(--border);
  overflow-y:auto; display:flex; flex-direction:column;
}
.att2-dw-main { flex:1; overflow-y:auto; padding:20px; display:flex; flex-direction:column; gap:16px; }
.att2-dw-batch-item {
  padding:10px 12px; cursor:pointer; border-bottom:1px solid var(--border);
  transition:background .12s; font-size:13px;
}
.att2-dw-batch-item:hover { background:var(--surface2); }
.att2-dw-batch-item.sel { background:var(--blue-dim); border-left:3px solid var(--blue); }
.att2-date-grid { display:flex; flex-wrap:wrap; gap:6px; }
.att2-date-chip {
  padding:5px 9px; border-radius:var(--r-sm); font-size:11px;
  font-weight:600; cursor:pointer; border:1px solid var(--border2);
  background:var(--surface2); color:var(--t2); transition:all .12s;
  font-family:var(--font-mono); display:flex; flex-direction:column; align-items:center;
}
.att2-date-chip:hover   { border-color:var(--blue); color:var(--blue); }
.att2-date-chip.marked  { background:var(--green-dim); border-color:var(--green); color:var(--green); }
.att2-date-chip.today   { border-color:var(--blue); color:var(--blue); font-weight:800; }
.att2-date-chip.active  { background:var(--blue); border-color:var(--blue); color:#fff; }

/* ── Day chip (schedule modal) ────────────────────────────── */
.day-chip-grid { display:flex; gap:8px; flex-wrap:wrap; margin:8px 0; }
.day-chip {
  padding:7px 14px; border-radius:var(--r-sm); font-size:12.5px;
  font-weight:600; cursor:pointer; border:2px solid var(--border2);
  background:var(--surface2); color:var(--t2); transition:all .12s; user-select:none;
}
.day-chip:hover    { border-color:var(--blue); color:var(--blue); }
.day-chip.selected { background:var(--blue); color:#fff; border-color:var(--blue); }
.day-chip.disabled { opacity:.35; cursor:not-allowed; }

/* ── Percentage bar (summary modal) ──────────────────────── */
.att-pct-bar-wrap { background:var(--surface3); border-radius:4px; height:5px; width:80px; overflow:hidden; }
.att-pct-bar { height:100%; border-radius:4px; transition:width .4s; }

@media(max-width:768px){
  .att2-bw { grid-template-columns:1fr; }
  .att2-sidebar { max-height:260px; border-right:none; border-bottom:1px solid var(--border); }
}
`;
  document.head.appendChild(s);
}

// ── Public API ────────────────────────────────────────────────
export const AttendanceModule = {
  mount(container) {
    injectUIStyles();
    _injectStyles();
    ensureAttendanceKeys();

    _root = typeof container === 'string' ? document.querySelector(container) : container;
    if (!_root) return;

    _root.innerHTML = _buildShell();
    _attachTabSwitcher();
    _renderBatchWise();
  }
};

// ── Shell HTML ────────────────────────────────────────────────
function _buildShell() {
  return `
    <div class="att2-shell">
      <div class="att2-tabs">
        <button class="att2-tab active" data-tab="batchwise">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          Batch-wise Attendance
        </button>
        <button class="att2-tab" data-tab="datewise">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          Date-wise
        </button>
        <button class="att2-tab" data-tab="daily">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          Daily Attendance
        </button>
        <button class="att2-tab" data-tab="weekly">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          Weekly Report
        </button>
      </div>
      <div id="att2Body" style="flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0"></div>
    </div>`;
}

function _attachTabSwitcher() {
  _root.querySelectorAll('.att2-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      _root.querySelectorAll('.att2-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeTab = btn.dataset.tab;
      if      (_activeTab === 'batchwise') _renderBatchWise();
      else if (_activeTab === 'datewise')  _renderDateWise();
      else if (_activeTab === 'daily')     _renderDailyAttendance();
      else if (_activeTab === 'weekly')    _renderWeeklyAttendance();
    });
  });
}

// ══════════════════════════════════════════════════════════════
// BATCH-WISE TAB
// ══════════════════════════════════════════════════════════════
function _renderBatchWise() {
  const body = _root.querySelector('#att2Body');
  if (!body) return;

  const batches     = AppState.get('batches')     || [];
  const campuses    = AppState.get('campuses')    || [];
  const disciplines = AppState.get('disciplines') || [];

  // Build unique session list
  const sessions = [...new Set(batches.map(b => b.sessionPeriod).filter(Boolean))].sort().reverse();

  // Filter options
  const campOpts = campuses.map(c =>
    `<option value="${c.id}" ${_filterCampus === c.id ? 'selected' : ''}>${c.campusName}</option>`).join('');
  const discOpts = disciplines.map(d =>
    `<option value="${d.id}" ${_filterDisc === d.id ? 'selected' : ''}>${d.abbreviation} — ${d.fullName}</option>`).join('');
  const sessOpts = sessions.map(s =>
    `<option value="${s}" ${_filterSession === s ? 'selected' : ''}>${s}</option>`).join('');

  body.innerHTML = `
    <div class="att2-bw" style="flex:1;min-height:0;overflow:hidden">
      <!-- Sidebar -->
      <aside class="att2-sidebar">
        <div class="att2-filters">
          <select class="att2-filter-sel" id="att2FiltCamp">
            <option value="">All Campuses</option>${campOpts}
          </select>
          <select class="att2-filter-sel" id="att2FiltDisc">
            <option value="">All Disciplines</option>${discOpts}
          </select>
          <select class="att2-filter-sel" id="att2FiltSess">
            <option value="">All Sessions</option>${sessOpts}
          </select>
        </div>
        <div class="att2-sb-search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="att2BatchSearch" placeholder="Search batches…" value="${_batchSearch}"/>
        </div>
        <div class="att2-batch-list" id="att2BatchList"></div>
      </aside>

      <!-- Main -->
      <div class="att2-main" id="att2Main">
        <div class="att2-placeholder">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" style="color:var(--t4)">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          <h3>Select a Batch</h3>
          <p>Use the filters and batch list on the left to load an attendance sheet.</p>
        </div>
      </div>
    </div>`;

  _renderBatchList();
  _attachBWEvents();

  // Restore selected batch
  if (_selBatch) {
    const b = AppState.findById('batches', _selBatch.id);
    if (b) _loadBatchSheet(b);
  }
}

function _activeBatches() {
  const today   = toISODate(new Date());
  const lpaList = AppState.get('lpAssignments') || [];
  const all     = AppState.get('batches') || [];

  // Only batches that have an LP assigned whose endDate > today
  return all.filter(b => {
    const matchCamp = !_filterCampus  || b.campusId    === _filterCampus;
    const matchDisc = !_filterDisc    || b.disciplineId === _filterDisc;
    const matchSess = !_filterSession || b.sessionPeriod === _filterSession;
    if (!matchCamp || !matchDisc || !matchSess) return false;

    if (_batchSearch) {
      const q = _batchSearch.toLowerCase();
      const teacher = AppState.findById('teachers', b.teacherId);
      const match = (b.batchName || '').toLowerCase().includes(q) ||
                    (teacher?.fullName || '').toLowerCase().includes(q) ||
                    (b.sessionPeriod  || '').toLowerCase().includes(q);
      if (!match) return false;
    }

    // Check LP end date
    const lpa = lpaList.find(a => a.batchId === b.id);
    if (!lpa) return true; // show even without LP (warn inside)

    const lpEndDate = lpa.endDate || (lpa.rows?.length ? lpa.rows[lpa.rows.length - 1]?.date : null);
    return !lpEndDate || lpEndDate >= today;
  });
}

function _renderBatchList() {
  const listEl = _root.querySelector('#att2BatchList');
  if (!listEl) return;

  const batches  = _activeBatches();
  const lpaList  = AppState.get('lpAssignments') || [];
  const today    = toISODate(new Date());

  if (!batches.length) {
    listEl.innerHTML = `
      <div style="padding:30px 16px;text-align:center;color:var(--t3);font-size:12.5px">
        No active batches found for these filters.
      </div>`;
    return;
  }

  listEl.innerHTML = batches.map(b => {
    const disc    = AppState.findById('disciplines', b.disciplineId);
    const campus  = AppState.findById('campuses',   b.campusId);
    const teacher = AppState.findById('teachers',   b.teacherId);
    const lpa     = lpaList.find(a => a.batchId === b.id);
    const isSel   = _selBatch?.id === b.id;

    const lpBadge = lpa
      ? `<span class="att2-lp-badge">LP ${lpa.lpCode || ''}</span>`
      : `<span class="att2-no-lp-badge">No LP</span>`;

    // Enrolled count from enrolments
    const enrolCount = (AppState.get('enrolments') || []).filter(e => e.batchId === b.id && e.status === 'active').length;

    return `
      <div class="att2-batch-item ${isSel ? 'sel' : ''}" data-bid="${b.id}">
        <div class="att2-batch-name">${b.batchName}</div>
        <div class="att2-batch-sub">
          ${disc   ? `<span style="font-weight:600;color:var(--blue)">${disc.abbreviation}</span>` : ''}
          ${campus ? `<span style="margin-left:4px">${campus.campusName.replace(/\s*campus\s*/i,'').trim()}</span>` : ''}
          ${b.sessionPeriod ? `<span style="margin-left:4px;color:var(--t4)">${b.sessionPeriod}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;margin-top:4px;flex-wrap:wrap">
          ${lpBadge}
          <span style="font-size:10px;color:var(--t4)">${enrolCount} enrolled</span>
          ${teacher ? `<span style="font-size:10px;color:var(--t3)">👤 ${teacher.fullName}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  // Click delegation
  listEl.querySelectorAll('.att2-batch-item').forEach(item => {
    item.addEventListener('click', async () => {
      const b = AppState.findById('batches', item.dataset.bid);
      if (!b) return;
      _selBatch = b;
      listEl.querySelectorAll('.att2-batch-item').forEach(i => i.classList.toggle('sel', i.dataset.bid === b.id));
      // ✅ Fresh attendance data MongoDB se load karo pehle
      await fetchAndSyncBatchAttendance(b.id);
      _loadBatchSheet(b);
    });
  });
}

function _attachBWEvents() {
  _root.querySelector('#att2FiltCamp')?.addEventListener('change',  e => { _filterCampus  = e.target.value; _renderBatchList(); });
  _root.querySelector('#att2FiltDisc')?.addEventListener('change',  e => { _filterDisc    = e.target.value; _renderBatchList(); });
  _root.querySelector('#att2FiltSess')?.addEventListener('change',  e => { _filterSession = e.target.value; _renderBatchList(); });
  _root.querySelector('#att2BatchSearch')?.addEventListener('input', e => { _batchSearch   = e.target.value.trim(); _renderBatchList(); });
}

// ── Load batch sheet ──────────────────────────────────────────
function _loadBatchSheet(batch) {
  const mainEl = _root.querySelector('#att2Main');
  if (!mainEl) return;

  const lpaList = AppState.get('lpAssignments') || [];
  const lpa     = lpaList.find(a => a.batchId === batch.id);
  const disc    = AppState.findById('disciplines', batch.disciplineId);
  const campus  = AppState.findById('campuses',   batch.campusId);
  const teacher = AppState.findById('teachers',   batch.teacherId);
  const isAdmin = Auth.can('admin');
  const today   = toISODate(new Date());

  // Get enrolled active students from enrolments
  const enrolments = (AppState.get('enrolments') || []).filter(e => e.batchId === batch.id && e.status === 'active');
  const students   = enrolments
    .map(e => AppState.findById('students', e.studentId))
    .filter(Boolean)
    .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));

  // Generate class dates from LP if assigned, else from schedule
  let classDates = [];
  let datesSource = 'schedule';

  if (lpa && lpa.rows?.length) {
    // Derive dates from LP rows — LP has workDays embedded in rows as .date field
    classDates = lpa.rows
      .filter(r => r.date)
      .map(r => r.date)
      .filter(d => d <= today)
      .sort();
    datesSource = 'lp';
  } else {
    classDates = AttendanceDateGenerator.generate(batch.id);
  }

  // Batch status badge
  let statusBadge = '';
  if (batch.startDate && batch.endDate) {
    if (today < batch.startDate)    statusBadge = `<span class="att2-badge att2-badge-yellow">Not Started</span>`;
    else if (today > batch.endDate) statusBadge = `<span class="att2-badge att2-badge-red">Ended</span>`;
    else                            statusBadge = `<span class="att2-badge att2-badge-green">Active</span>`;
  }

  mainEl.innerHTML = `
    <!-- Batch header -->
    <div class="att2-batch-hdr">
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="att2-batch-hdr-name">${batch.batchName}</span>
          ${statusBadge}
          ${lpa ? `<span class="att2-badge att2-badge-blue">LP: ${lpa.lpCode || lpa.lpTitle || 'Assigned'}</span>` : `<span class="att2-badge att2-badge-yellow">No LP Assigned</span>`}
        </div>
        <div class="att2-hdr-meta" style="margin-top:4px;display:flex;gap:10px;flex-wrap:wrap">
          ${disc   ? `<span>${disc.abbreviation}</span>` : ''}
          ${campus ? `<span>${campus.campusName}</span>` : ''}
          ${teacher ? `<span>👤 ${teacher.fullName}</span>` : ''}
          <span>${students.length} students</span>
          <span>${classDates.length} class days (${datesSource === 'lp' ? 'from LP' : 'from schedule'})</span>
        </div>
      </div>
      <div class="att2-hdr-actions">
        ${isAdmin ? `<button class="att2-btn" id="att2SchedBtn">⚙ Schedule</button>` : ''}
        <button class="att2-btn" id="att2SummaryBtn">📊 Summary</button>
        <button class="att2-btn" id="att2ExportBtn">⬇ Export CSV</button>
      </div>
    </div>

    ${!lpa ? `<div class="att2-warn">⚠ No Lecture Plan assigned to this batch. Dates are derived from class schedule. Assign an LP for accurate date tracking.</div>` : ''}
    ${!classDates.length ? `<div class="att2-warn">⚠ No class dates found. ${lpa ? 'LP has no rows with dates.' : 'Configure class schedule first.'}</div>` : ''}

    <!-- Sheet -->
    <div class="att2-sheet-wrap" id="att2SheetWrap">
      ${_buildHorizontalSheet(batch, students, classDates)}
    </div>
  `;

  // Wire header buttons
  mainEl.querySelector('#att2SchedBtn')?.addEventListener('click', () => _openScheduleModal(batch));
  mainEl.querySelector('#att2SummaryBtn')?.addEventListener('click', () => _openSummaryModal(batch));
  mainEl.querySelector('#att2ExportBtn')?.addEventListener('click', () => {
    AttendanceService.exportCSV(batch.id);
    Toast.success('CSV export started.');
  });

  // Wire all attendance cells
  _wireSheetCells(batch, students, classDates);
}

// ── Build horizontal attendance sheet ─────────────────────────
function _buildHorizontalSheet(batch, students, classDates) {
  if (!students.length) {
    return `<div style="padding:40px;text-align:center;color:var(--t3);font-size:13px">
      No active enrolled students in this batch.
    </div>`;
  }

  const today   = toISODate(new Date());
  const records = AttendanceService.getRecordsForBatch(batch.id);
  // Build record map: { studentId_date → status }
  const recMap = {};
  records.forEach(r => { recMap[`${r.studentId}_${r.date}`] = r.status; });

  // Group dates by YYYY-MM
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const byMonth    = {};
  classDates.forEach(d => {
    const mk = d.slice(0, 7);
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(d);
  });
  const months = Object.keys(byMonth).sort();

  // ── Build <thead> ──────────────────────────────────────────
  // Row 1: Month header cells (spanning date columns)
  let monthHeaderRow = `
    <th class="col-frozen col-frozen-0 att2-sheet-table th-month-hdr" rowspan="2">#</th>
    <th class="col-frozen col-frozen-1 att2-sheet-table th-month-hdr" rowspan="2">Student Name</th>
    <th class="col-frozen col-frozen-2 att2-sheet-table th-month-hdr" rowspan="2">Student ID</th>`;

  months.forEach(mk => {
    const [y, m] = mk.split('-');
    const label  = `${monthNames[parseInt(m) - 1]} ${y}`;
    const count  = byMonth[mk].length;
    monthHeaderRow += `<th class="th-month-hdr" colspan="${count}" style="text-align:center">${label}</th>`;
  });
  monthHeaderRow += `<th class="th-month-hdr" rowspan="2" style="text-align:center;min-width:60px">%</th>`;

  // Row 2: Date columns
  let dateHeaderRow = '';
  classDates.forEach(d => {
    const dt      = parseLocalDate(d);
    const dayShrt = DAY_SHORT[dt.getDay()];
    const dayNum  = d.slice(8);
    const isToday = d === today;
    const isFut   = d > today;
    dateHeaderRow += `
      <th style="min-width:44px;max-width:54px;padding:4px 2px">
        <div class="att2-date-col-hdr ${isToday ? 'is-today' : ''} ${isFut ? 'is-future' : ''}">
          <span class="att2-date-col-day">${dayShrt}</span>
          <span class="att2-date-col-date">${dayNum}</span>
        </div>
      </th>`;
  });

  // ── Build <tbody> ──────────────────────────────────────────
  const bodyRows = students.map((stu, idx) => {
    let pCount = 0, totalMarked = 0;

    const cells = classDates.map(d => {
      const key    = `${stu.id}_${d}`;
      const pkey   = `${batch.id}|${stu.id}|${d}`;
      const status = _pendingChanges[pkey] !== undefined ? _pendingChanges[pkey] : (recMap[key] || '');
      const isFut  = d > today;
      if (status === 'P') { pCount++; totalMarked++; }
      else if (status === 'A' || status === 'L') totalMarked++;

      return `<td>
        <span class="att2-cell ${isFut ? 'future' : ''}" 
              data-bid="${batch.id}" data-sid="${stu.id}" data-date="${d}"
              data-v="${status}">${status || ''}</span>
      </td>`;
    }).join('');

    const pct    = totalMarked > 0 ? Math.round((pCount / totalMarked) * 100) : null;
    const pctColor = pct === null ? 'var(--t4)' : pct >= 75 ? 'var(--green)' : 'var(--red)';

    const shortId = stu.registrationNo || stu.admissionNo || stu.studentCnic || stu.cnic || (stu.id?.slice(-6) || '—');

    return `<tr>
      <td class="col-frozen col-frozen-0" style="text-align:center;color:var(--t4);font-family:var(--font-mono);font-size:11px">${idx + 1}</td>
      <td class="col-frozen col-frozen-1" style="font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${stu.studentName || '—'}</td>
      <td class="col-frozen col-frozen-2" style="font-family:var(--font-mono);font-size:11px;color:var(--t3)">${shortId}</td>
      ${cells}
      <td>
        <div class="att2-pct" style="color:${pctColor}">${pct !== null ? pct + '%' : '—'}</div>
        <div class="att2-pct-bar">
          <div class="att2-pct-bar-fill" style="width:${pct || 0}%;background:${pctColor}"></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="att2-sheet-table-wrap">
      <table class="att2-sheet-table">
        <thead>
          <tr>${monthHeaderRow}</tr>
          <tr>${dateHeaderRow}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>`;
}

// ── Wire sheet cell click events ──────────────────────────────
function _wireSheetCells(batch, students, classDates) {
  const sheetWrap = _root.querySelector('#att2SheetWrap');
  if (!sheetWrap) return;

  const today    = toISODate(new Date());
  const isAdmin  = Auth.can('admin');
  const isTeacher= Auth.can('attendance');
  const canMark  = isAdmin || isTeacher;
  if (!canMark) return;

  sheetWrap.addEventListener('click', e => {
    const cell = e.target.closest('.att2-cell');
    if (!cell || cell.classList.contains('future') || cell.classList.contains('saving')) return;

    const bid  = cell.dataset.bid;
    const sid  = cell.dataset.sid;
    const date = cell.dataset.date;
    const cur  = cell.dataset.v;

    // Cycle: '' → 'P' → 'A' → 'L' → ''
    const cycle = { '': 'P', 'P': 'A', 'A': 'L', 'L': '' };
    const next  = cycle[cur] ?? 'P';

    // Save immediately
    cell.classList.add('saving');
    _saveCell(bid, sid, date, next, cell, batch, students, classDates);
  });
}

function _saveCell(batchId, studentId, date, status, cell, batch, students, classDates) {
  const pkey   = `${batchId}|${studentId}|${date}`;
  const markedBy = AppState.get('currentUser')?.id;

  const isFirstStudent = students.length > 0 && students[0].id === studentId;
  const wasEmpty       = !cell.dataset.v; // was unmarked before

  const save = (sid, st) => {
    if (!st) {
      // "clear" — remove record by marking with '' which we treat as delete
      // Since service doesn't have delete, we'll use a workaround: just track locally
      const pkey2 = `${batchId}|${sid}|${date}`;
      _pendingChanges[pkey2] = '';
      const r = (AppState.get('attendanceRecords') || []).find(r => r.batchId === batchId && r.studentId === sid && r.date === date);
      if (r) AppState.update('attendanceRecords', r.id, { status: null, markedAt: new Date().toISOString(), markedBy });
    } else {
      AttendanceService.markAttendance(batchId, sid, date, st, markedBy);
      _pendingChanges[`${batchId}|${sid}|${date}`] = st;
    }
  };

  // Save this student
  save(studentId, status);
  _updateCell(cell, status);

  // "Default for all" — if this is first student marking on a fresh date for that column,
  // apply same status to all students who are NOT yet marked on that date
  if (isFirstStudent && status) {
    const records = AppState.get('attendanceRecords') || [];
    students.forEach(s => {
      if (s.id === studentId) return;
      const alreadyMarked = records.some(r => r.batchId === batchId && r.studentId === s.id && r.date === date);
      const pendingKey    = `${batchId}|${s.id}|${date}`;
      const hasPending    = _pendingChanges[pendingKey] !== undefined;
      if (!alreadyMarked && !hasPending) {
        save(s.id, status);
        // Update cell visually
        const otherCell = _root.querySelector(`.att2-cell[data-sid="${s.id}"][data-date="${date}"]`);
        if (otherCell) _updateCell(otherCell, status);
      }
    });
  }

  // Refresh % column for this student
  _refreshStudentPct(batch, students, classDates, studentId);
}

function _updateCell(cell, status) {
  cell.dataset.v  = status || '';
  cell.textContent = status || '';
  cell.classList.remove('saving');
}

function _refreshStudentPct(batch, students, classDates, studentId) {
  const records = AttendanceService.getRecordsForBatch(batch.id);
  const recMap  = {};
  records.forEach(r => {
    if (r.studentId === studentId) recMap[r.date] = r.status;
  });

  let pCount = 0, totalMarked = 0;
  classDates.forEach(d => {
    const pkey = `${batch.id}|${studentId}|${d}`;
    const st   = _pendingChanges[pkey] !== undefined ? _pendingChanges[pkey] : recMap[d];
    if (st === 'P') { pCount++; totalMarked++; }
    else if (st === 'A' || st === 'L') totalMarked++;
  });

  const pct = totalMarked > 0 ? Math.round((pCount / totalMarked) * 100) : null;
  const color = pct === null ? 'var(--t4)' : pct >= 75 ? 'var(--green)' : 'var(--red)';

  const row = _root.querySelector(`.att2-cell[data-sid="${studentId}"]`)?.closest('tr');
  if (!row) return;
  const lastTd = row.querySelector('td:last-child');
  if (lastTd) {
    lastTd.innerHTML = `
      <div class="att2-pct" style="color:${color}">${pct !== null ? pct + '%' : '—'}</div>
      <div class="att2-pct-bar"><div class="att2-pct-bar-fill" style="width:${pct || 0}%;background:${color}"></div></div>`;
  }
}

// ══════════════════════════════════════════════════════════════
// DATE-WISE TAB (legacy, preserved from original)
// ══════════════════════════════════════════════════════════════
function _renderDateWise() {
  const body = _root.querySelector('#att2Body');
  if (!body) return;

  body.innerHTML = `
    <div class="att2-dw" style="flex:1;min-height:0;overflow:hidden">
      <aside class="att2-dw-sidebar">
        <div style="padding:12px;border-bottom:1px solid var(--border);font-size:10.5px;
          font-weight:700;text-transform:uppercase;color:var(--t3)">Batches</div>
        <div class="att2-sb-search" style="padding:8px 10px;border-bottom:1px solid var(--border)">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input id="att2DWSearch" placeholder="Search batches…"/>
        </div>
        <div id="att2DWBatchList" style="flex:1;overflow-y:auto"></div>
      </aside>
      <div class="att2-dw-main" id="att2DWMain">
        <div style="padding:40px;text-align:center;color:var(--t3);font-size:13px">
          Select a batch to view dates and mark attendance.
        </div>
      </div>
    </div>`;

  _renderDWBatchList();
  _root.querySelector('#att2DWSearch')?.addEventListener('input', e => _renderDWBatchList(e.target.value.trim()));
}

function _renderDWBatchList(q = '') {
  const listEl = _root.querySelector('#att2DWBatchList');
  if (!listEl) return;
  let batches = AppState.get('batches') || [];
  if (q) {
    const ql = q.toLowerCase();
    batches = batches.filter(b =>
      (b.batchName || '').toLowerCase().includes(ql) ||
      (b.sessionPeriod || '').toLowerCase().includes(ql)
    );
  }
  listEl.innerHTML = batches.map(b => `
    <div class="att2-dw-batch-item ${_dwSelectedBatch?.id === b.id ? 'sel' : ''}" data-bid="${b.id}">
      <div style="font-weight:600;font-family:var(--font-mono);font-size:12.5px">${b.batchName}</div>
      <div style="font-size:11px;color:var(--t3)">${b.sessionPeriod || ''}</div>
    </div>`).join('');

  listEl.querySelectorAll('.att2-dw-batch-item').forEach(item => {
    item.addEventListener('click', async () => {
      const b = AppState.findById('batches', item.dataset.bid);
      if (!b) return;
      _dwSelectedBatch = b;
      _dwSelectedDate  = null;
      listEl.querySelectorAll('.att2-dw-batch-item').forEach(i => i.classList.toggle('sel', i.dataset.bid === b.id));
      // ✅ Fresh attendance data MongoDB se load karo pehle
      await fetchAndSyncBatchAttendance(b.id);
      _renderDWMainPanel(b);
    });
  });
}

function _renderDWMainPanel(batch) {
  const mainEl = _root.querySelector('#att2DWMain');
  if (!mainEl) return;

  const today      = toISODate(new Date());
  const classDates = AttendanceDateGenerator.generate(batch.id);
  const schedule   = ScheduleService.getActiveSchedule(batch.id, today);
  const isAdmin    = Auth.can('admin');

  // Enrolment-based students
  const enrolments = (AppState.get('enrolments') || []).filter(e => e.batchId === batch.id && e.status === 'active');
  const students   = enrolments.map(e => AppState.findById('students', e.studentId)).filter(Boolean);

  const summary    = AttendanceService.getSummary(batch.id);
  const markedCount = classDates.filter(d => AttendanceService.isDateMarked(batch.id, d)).length;

  // Group by month
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const byMonth    = {};
  classDates.forEach(d => {
    const mk = d.slice(0, 7);
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(d);
  });

  const dateGrid = Object.entries(byMonth).map(([mk, dates]) => {
    const [y, m] = mk.split('-');
    const chips  = dates.map(d => {
      const dt      = parseLocalDate(d);
      const marked  = AttendanceService.isDateMarked(batch.id, d);
      const isToday = d === today;
      let cls = 'att2-date-chip';
      if (marked)                    cls += ' marked';
      else if (isToday)              cls += ' today';
      if (_dwSelectedDate === d)     cls += ' active';
      return `<div class="${cls}" data-date="${d}" title="${formatDisplayDate(d)}">
        <span style="font-size:9px">${DAY_SHORT[dt.getDay()]}</span>
        <span>${d.slice(8)}</span>
      </div>`;
    }).join('');
    const markedIn = dates.filter(d => AttendanceService.isDateMarked(batch.id, d)).length;
    return `
      <div>
        <div style="font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);
          padding-bottom:6px;border-bottom:1px solid var(--border);margin-bottom:6px;
          display:flex;justify-content:space-between">
          <span>${monthNames[parseInt(m)-1]} ${y}</span>
          <span style="color:var(--t4)">${markedIn}/${dates.length} marked</span>
        </div>
        <div class="att2-date-grid">${chips}</div>
      </div>`;
  }).join('');

  mainEl.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:17px;font-weight:800;font-family:var(--font-mono)">${batch.batchName}</div>
        <div style="font-size:12px;color:var(--t3);margin-top:3px">${students.length} students · ${classDates.length} class days · ${markedCount} marked</div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${isAdmin ? `<button class="att2-btn" id="att2DWSchedBtn">⚙ Schedule</button>` : ''}
        <button class="att2-btn" id="att2DWSummaryBtn">📊 Summary</button>
        <button class="att2-btn" id="att2DWExportBtn">⬇ Export CSV</button>
      </div>
    </div>

    ${!schedule && isAdmin ? `<div class="att2-warn">⚠ No class schedule configured. Click Schedule to set up class days.</div>` : ''}

    <div id="att2DWDateGrid" style="display:flex;flex-direction:column;gap:14px">${dateGrid || '<div style="color:var(--t3);text-align:center;padding:20px">No class dates found.</div>'}</div>
    <div id="att2DWSheet"></div>
  `;

  mainEl.querySelector('#att2DWSchedBtn')?.addEventListener('click',   () => _openScheduleModal(batch));
  mainEl.querySelector('#att2DWSummaryBtn')?.addEventListener('click', () => _openSummaryModal(batch));
  mainEl.querySelector('#att2DWExportBtn')?.addEventListener('click',  () => { AttendanceService.exportCSV(batch.id); Toast.success('CSV export started.'); });

  mainEl.querySelector('#att2DWDateGrid')?.addEventListener('click', e => {
    const chip = e.target.closest('.att2-date-chip');
    if (!chip?.dataset.date) return;
    _dwSelectedDate = chip.dataset.date;
    mainEl.querySelectorAll('.att2-date-chip').forEach(c => c.classList.toggle('active', c.dataset.date === _dwSelectedDate));
    _renderDWSheet(batch, students, _dwSelectedDate);
  });

  if (_dwSelectedDate) _renderDWSheet(batch, students, _dwSelectedDate);
}

function _renderDWSheet(batch, students, date) {
  const sheetEl = _root.querySelector('#att2DWSheet');
  if (!sheetEl) return;

  const today    = toISODate(new Date());
  const isFuture = date > today;
  const existing = AttendanceService.getRecordsForDate(batch.id, date);
  const isAdmin  = Auth.can('admin');
  const isTeacher= Auth.can('attendance');
  const canMark  = (isAdmin || isTeacher) && !isFuture;

  const pdwKey   = d => `dw|${batch.id}|${d}`;

  if (!students.length) {
    sheetEl.innerHTML = `<div style="padding:20px;text-align:center;color:var(--t3)">No enrolled students.</div>`;
    return;
  }

  const alreadyMarked = Object.keys(existing).length > 0;

  sheetEl.innerHTML = `
    <div style="margin-top:8px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);padding:12px 16px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
      <div>
        <div style="font-size:14px;font-weight:700">${formatDisplayDate(date)}</div>
        <div style="font-size:12px;color:var(--t3)">
          ${alreadyMarked ? '<span style="color:var(--green);font-weight:600">✓ Already marked</span>' : 'Not yet marked'}
          ${isFuture ? '<span style="color:var(--yellow);margin-left:8px">⚠ Future date</span>' : ''}
        </div>
      </div>
      ${canMark ? `<div style="display:flex;gap:6px">
        <button class="att2-btn" id="dw-allP">✓ All Present</button>
        <button class="att2-btn" id="dw-allA">✗ All Absent</button>
      </div>` : ''}
    </div>
    <div style="overflow-x:auto;margin-top:8px">
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:var(--surface2)">
            <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border);width:36px">#</th>
            <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border)">Student Name</th>
            <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border);width:140px">ID / CNIC</th>
            <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border);width:150px">Status</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((stu, idx) => {
            const rec    = existing[stu.id];
            const status = rec?.status || '';
            const sid    = stu.registrationNo || stu.admissionNo || stu.cnic || '—';
            return `<tr data-sid="${stu.id}">
              <td style="padding:8px 12px;border-bottom:1px solid var(--border);color:var(--t4);font-family:var(--font-mono);font-size:11px">${idx+1}</td>
              <td style="padding:8px 12px;border-bottom:1px solid var(--border);font-weight:500;color:var(--t1)">${stu.studentName}</td>
              <td style="padding:8px 12px;border-bottom:1px solid var(--border);font-family:var(--font-mono);font-size:11.5px;color:var(--t3)">${sid}</td>
              <td style="padding:8px 12px;border-bottom:1px solid var(--border)">
                ${canMark
                  ? `<div class="att-status-group" data-sid="${stu.id}" style="display:flex;gap:4px">
                      ${['P','A','L'].map(s => `<button class="att2-dw-status-btn ${status === s ? 'sel-'+s : ''}" data-s="${s}"
                        style="width:32px;height:32px;border-radius:6px;font-size:12.5px;font-weight:800;cursor:pointer;
                          border:2px solid ${s==='P'?'var(--green)':s==='A'?'var(--red)':'#d97706'};
                          background:${status===s ? (s==='P'?'var(--green)':s==='A'?'var(--red)':'#f59e0b') : 'var(--surface2)'};
                          color:${status===s?'#fff':(s==='P'?'var(--green)':s==='A'?'var(--red)':'#92400e')};
                          transition:all .1s">${s}</button>`).join('')}
                    </div>`
                  : `<span style="font-family:var(--font-mono);font-weight:800;font-size:13px;
                       color:${status==='P'?'var(--green)':status==='A'?'var(--red)':status==='L'?'#d97706':'var(--t4)'}">${status || '—'}</span>`
                }
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;

  if (!canMark) return;

  const markedBy = AppState.get('currentUser')?.id;

  // Wire status buttons
  sheetEl.querySelectorAll('.att-status-group').forEach(grp => {
    grp.addEventListener('click', e => {
      const btn = e.target.closest('button[data-s]');
      if (!btn) return;
      const sid    = grp.dataset.sid;
      const status = btn.dataset.s;
      AttendanceService.markAttendance(batch.id, sid, date, status, markedBy);

      // If first student, apply to all unmarked
      if (students.length && students[0].id === sid) {
        students.forEach(s => {
          if (s.id === sid) return;
          const rec = (AppState.get('attendanceRecords') || []).find(r => r.batchId === batch.id && r.studentId === s.id && r.date === date);
          if (!rec) {
            AttendanceService.markAttendance(batch.id, s.id, date, status, markedBy);
          }
        });
      }

      _renderDWSheet(batch, students, date);
      // Update chip
      const chip = _root.querySelector(`.att2-date-chip[data-date="${date}"]`);
      if (chip && !chip.classList.contains('marked')) {
        chip.classList.remove('today'); chip.classList.add('marked');
      }
    });
  });

  sheetEl.querySelector('#dw-allP')?.addEventListener('click', () => {
    students.forEach(s => AttendanceService.markAttendance(batch.id, s.id, date, 'P', markedBy));
    _renderDWSheet(batch, students, date);
    _updateChipMarked(date);
  });
  sheetEl.querySelector('#dw-allA')?.addEventListener('click', () => {
    students.forEach(s => AttendanceService.markAttendance(batch.id, s.id, date, 'A', markedBy));
    _renderDWSheet(batch, students, date);
    _updateChipMarked(date);
  });
}

function _updateChipMarked(date) {
  const chip = _root.querySelector(`.att2-date-chip[data-date="${date}"]`);
  if (chip) { chip.classList.remove('today'); chip.classList.add('marked', 'active'); }
}

// ══════════════════════════════════════════════════════════════
// SCHEDULE MODAL (from original — preserved)
// ══════════════════════════════════════════════════════════════
function _openScheduleModal(batch) {
  const today    = toISODate(new Date());
  const existing = ScheduleService.getSchedulesForBatch(batch.id);
  const latest   = existing[existing.length - 1];
  const selectedDays  = new Set(latest?.classDays || []);
  const defaultEffective = today;

  const historyHTML = existing.length
    ? existing.slice().reverse().map(s => `
        <div style="display:flex;align-items:center;justify-content:space-between;
             padding:8px 10px;border-radius:8px;background:var(--surface2);border:1px solid var(--border);margin-bottom:6px">
          <div style="font-size:12.5px;font-weight:600;color:var(--t1)">
            ${s.classDays.map(d => DAY_SHORT[d]).join(', ')}
            <span style="font-size:11.5px;color:var(--t3);margin-left:8px">from ${s.effectiveFrom}</span>
            ${s.id === latest?.id && existing.length > 1 ? `<span style="font-size:10px;background:var(--green-dim);color:var(--green);padding:1px 6px;border-radius:8px;margin-left:6px;font-weight:700">Current</span>` : ''}
          </div>
          ${existing.length > 1 ? `<button class="att2-btn" data-del-sch="${s.id}" style="padding:3px 8px;font-size:11px;color:var(--red);border-color:var(--red)">✕</button>` : ''}
        </div>`).join('')
    : `<div style="color:var(--t3);font-size:12.5px;padding:8px 0">No schedules configured yet.</div>`;

  Modal.open({
    title: `Class Schedule — ${batch.batchName}`,
    size: 'md',
    body: `
      <div class="form-group">
        <label class="form-label">Select Class Days <span class="req">*</span></label>
        <div class="day-chip-grid" id="dayChipGrid">
          ${[1,2,3,4,5,6].map(d => `<div class="day-chip ${selectedDays.has(d) ? 'selected' : ''}" data-day="${d}">${DAY_SHORT[d]}</div>`).join('')}
          <div class="day-chip disabled">Sun</div>
        </div>
        <span class="form-hint">Sunday excluded. Select 1–6 days.</span>
      </div>
      <div class="form-group">
        <label class="form-label">Effective From <span class="req">*</span></label>
        <input type="date" id="schedEffFrom" class="form-input" value="${defaultEffective}"
               min="${batch.startDate || today}" max="${batch.endDate || ''}"/>
        <span class="form-hint">Past attendance records are never modified.</span>
      </div>
      <div class="form-group" style="margin-top:16px">
        <label class="form-label" style="margin-bottom:8px">Schedule History</label>
        <div id="schedHistory">${historyHTML}</div>
      </div>`,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      { label: 'Save Schedule', variant: 'primary', close: false, handler: (modalEl) => {
        const days = [...modalEl.querySelectorAll('.day-chip.selected:not(.disabled)')].map(c => parseInt(c.dataset.day));
        const eff  = modalEl.querySelector('#schedEffFrom').value;
        const r    = ScheduleService.setSchedule(batch.id, days, eff, AppState.get('currentUser')?.id);
        if (!r.success) { Toast.error(r.message); return; }
        Toast.success('Schedule saved.');
        Modal.closeAll();
        if (_activeTab === 'batchwise') _loadBatchSheet(batch);
        else _renderDWMainPanel(batch);
      }}
    ],
    onOpen: (modalEl) => {
      modalEl.querySelector('#dayChipGrid')?.addEventListener('click', e => {
        const chip = e.target.closest('.day-chip:not(.disabled)');
        if (chip) chip.classList.toggle('selected');
      });
      modalEl.querySelector('#schedHistory')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-del-sch]');
        if (!btn) return;
        const r = ScheduleService.deleteSchedule(btn.dataset.delSch);
        if (!r.success) { Toast.error(r.message); return; }
        Modal.closeAll();
        _openScheduleModal(batch);
      });
    }
  });
}

// ══════════════════════════════════════════════════════════════
// SUMMARY MODAL
// ══════════════════════════════════════════════════════════════
function _openSummaryModal(batch) {
  const enrolments = (AppState.get('enrolments') || []).filter(e => e.batchId === batch.id && e.status === 'active');
  const students   = enrolments.map(e => AppState.findById('students', e.studentId)).filter(Boolean);
  const records    = AttendanceService.getRecordsForBatch(batch.id);

  const stats = students.map(s => {
    const sRecs = records.filter(r => r.studentId === s.id);
    const P = sRecs.filter(r => r.status === 'P').length;
    const A = sRecs.filter(r => r.status === 'A').length;
    const L = sRecs.filter(r => r.status === 'L').length;
    const total = P + A + L;
    const pct   = total > 0 ? Math.round((P / total) * 100) : null;
    return { name: s.studentName, P, A, L, total, pct };
  });

  const totalRecords = records.length;
  const allP = records.filter(r => r.status === 'P').length;
  const batchPct = totalRecords > 0 ? Math.round((allP / totalRecords) * 100) : null;

  const rows = stats.map((s, i) => {
    const c = s.pct === null ? 'var(--t4)' : s.pct >= 75 ? 'var(--green)' : 'var(--red)';
    return `<tr>
      <td style="padding:8px 12px;color:var(--t3);font-family:var(--font-mono);font-size:11.5px">${i+1}</td>
      <td style="padding:8px 12px;font-weight:500;color:var(--t1)">${s.name}</td>
      <td style="padding:8px 12px;text-align:center;font-family:var(--font-mono);font-weight:700;color:var(--green)">${s.P}</td>
      <td style="padding:8px 12px;text-align:center;font-family:var(--font-mono);font-weight:700;color:var(--red)">${s.A}</td>
      <td style="padding:8px 12px;text-align:center;font-family:var(--font-mono);font-weight:700;color:#d97706">${s.L}</td>
      <td style="padding:8px 12px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-weight:700;color:${c};font-family:var(--font-mono);min-width:36px">${s.pct !== null ? s.pct+'%' : '—'}</span>
          <div class="att-pct-bar-wrap"><div class="att-pct-bar" style="width:${s.pct||0}%;background:${c}"></div></div>
        </div>
      </td>
    </tr>`;
  }).join('');

  Modal.open({
    title: `Attendance Summary — ${batch.batchName}`,
    size: 'lg',
    body: `
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 14px;min-width:80px">
          <div style="font-size:20px;font-weight:800;font-family:var(--font-mono)">${totalRecords}</div>
          <div style="font-size:10.5px;color:var(--t3);font-weight:700;text-transform:uppercase">Records</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 14px;min-width:80px">
          <div style="font-size:20px;font-weight:800;font-family:var(--font-mono);color:${batchPct!==null?(batchPct>=75?'var(--green)':'var(--red)'):'var(--t4)'}">
            ${batchPct !== null ? batchPct+'%' : '—'}</div>
          <div style="font-size:10.5px;color:var(--t3);font-weight:700;text-transform:uppercase">Avg</div>
        </div>
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm);padding:8px 14px;min-width:80px">
          <div style="font-size:20px;font-weight:800;font-family:var(--font-mono);color:var(--red)">${stats.filter(s=>s.pct!==null&&s.pct<75).length}</div>
          <div style="font-size:10.5px;color:var(--t3);font-weight:700;text-transform:uppercase">Below 75%</div>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--surface2)">
            <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border)">#</th>
            <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border)">Student</th>
            <th style="padding:8px 12px;text-align:center;font-size:10.5px;font-weight:700;color:var(--green);border-bottom:2px solid var(--border)">P</th>
            <th style="padding:8px 12px;text-align:center;font-size:10.5px;font-weight:700;color:var(--red);border-bottom:2px solid var(--border)">A</th>
            <th style="padding:8px 12px;text-align:center;font-size:10.5px;font-weight:700;color:#d97706;border-bottom:2px solid var(--border)">L</th>
            <th style="padding:8px 12px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border)">Attendance %</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`,
    actions: [
      { label: 'Close', variant: 'ghost' },
      { label: 'Export CSV', variant: 'primary', handler: () => { AttendanceService.exportCSV(batch.id); Toast.success('CSV started.'); } }
    ]
  });
}

// ══════════════════════════════════════════════════════════════
// DAILY ATTENDANCE TAB
// Layout: Sidebar (filters + batch list) | Main (today's sheet)
// ══════════════════════════════════════════════════════════════

let _dailySelBatch  = null;
let _dailyDate      = toISODate(new Date()); // default today

// ── Weekly tab state ──────────────────────────────────────────
let _weeklySelBatch = null;
// Default: current week Mon→Sun
function _getWeekRange() {
  const today = new Date();
  const day   = today.getDay(); // 0=Sun
  const mon   = new Date(today); mon.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  const sun   = new Date(mon);   sun.setDate(mon.getDate() + 6);
  return { from: toISODate(mon), to: toISODate(sun) };
}
const _wr          = _getWeekRange();
let _weeklyFrom    = _wr.from;
let _weeklyTo      = _wr.to;

function _renderDailyAttendance() {
  const body = _root.querySelector('#att2Body');
  if (!body) return;

  const today      = toISODate(new Date());
  const batches    = AppState.get('batches')     || [];
  const campuses   = AppState.get('campuses')    || [];
  const disciplines= AppState.get('disciplines') || [];
  const sessions   = [...new Set(batches.map(b => b.sessionPeriod).filter(Boolean))].sort().reverse();

  const campOpts = campuses.map(c =>
    `<option value="${c.id}" ${_filterCampus === c.id ? 'selected':''}>
      ${c.campusName.replace(/\s*campus\s*/i,'').trim()}
    </option>`).join('');
  const discOpts = disciplines.map(d =>
    `<option value="${d.id}" ${_filterDisc === d.id ? 'selected':''}>${d.abbreviation}</option>`).join('');
  const sessOpts = sessions.map(s =>
    `<option value="${s}" ${_filterSession === s ? 'selected':''}>${s}</option>`).join('');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:260px 1fr;flex:1;min-height:0;overflow:hidden">

      <!-- ── Sidebar ── -->
      <aside style="border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden">

        <!-- Filters -->
        <div style="padding:10px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--border);flex-shrink:0">
          <select class="att2-filter-sel" id="dailyFiltCamp">
            <option value="">All Campuses</option>${campOpts}
          </select>
          <select class="att2-filter-sel" id="dailyFiltDisc">
            <option value="">All Disciplines</option>${discOpts}
          </select>
          <select class="att2-filter-sel" id="dailyFiltSess">
            <option value="">All Sessions</option>${sessOpts}
          </select>
        </div>

        <!-- Date picker -->
        <div style="padding:8px 10px;border-bottom:1px solid var(--border);flex-shrink:0;display:flex;align-items:center;gap:8px">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <input type="date" id="dailyDatePick" value="${_dailyDate}"
            style="flex:1;background:var(--surface2);border:1px solid var(--border2);
                   border-radius:var(--r-sm);color:var(--t1);font-size:12px;
                   padding:5px 8px;outline:none;cursor:pointer;font-family:inherit"/>
          <button id="dailyTodayBtn"
            style="font-size:10.5px;font-weight:700;padding:4px 9px;border-radius:var(--r-sm);
                   border:1px solid var(--blue);background:var(--blue-dim);color:var(--blue);
                   cursor:pointer;white-space:nowrap;font-family:inherit">
            Today
          </button>
        </div>

        <!-- Batch list label -->
        <div style="padding:7px 10px 4px;font-size:10px;font-weight:700;text-transform:uppercase;
                    letter-spacing:.06em;color:var(--t3);flex-shrink:0">
          Active Batches &nbsp;<span id="dailyBatchCount" style="font-weight:400"></span>
        </div>

        <!-- Batch list -->
        <div id="dailyBatchList" style="flex:1;overflow-y:auto"></div>
      </aside>

      <!-- ── Main ── -->
      <div id="dailyMain" style="display:flex;flex-direction:column;overflow:hidden">
        <div class="att2-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.2" style="color:var(--t4)">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <h3>Select a Batch</h3>
          <p>Pick a batch from the left to mark today's attendance.</p>
        </div>
      </div>
    </div>`;

  _renderDailyBatchList();
  _attachDailyEvents();

  // Restore selected batch
  if (_dailySelBatch) {
    const b = AppState.findById('batches', _dailySelBatch.id);
    if (b) _loadDailySheet(b);
  }
}

function _dailyActiveBatches() {
  const today   = toISODate(new Date());
  // lpAssignments is an object {batchId: lpa}, not an array
  const lpaMap  = AppState.get('lpAssignments') || {};
  const all     = AppState.get('batches') || [];

  return all.filter(b => {
    if (_filterCampus  && b.campusId     !== _filterCampus)   return false;
    if (_filterDisc    && b.disciplineId !== _filterDisc)     return false;
    if (_filterSession && b.sessionPeriod !== _filterSession) return false;

    // Show all batches — LP not required (warn inside sheet)
    const lpa = lpaMap[b.id];
    if (!lpa) return true;
    const lpEnd = lpa.endDate || (lpa.rows?.length ? lpa.rows[lpa.rows.length-1]?.date : null);
    return !lpEnd || lpEnd >= today;
  });
}

function _renderDailyBatchList() {
  const listEl   = _root.querySelector('#dailyBatchList');
  const countEl  = _root.querySelector('#dailyBatchCount');
  if (!listEl) return;

  const batches  = _dailyActiveBatches();
  // lpAssignments is object {batchId: lpa}
  const lpaMap   = AppState.get('lpAssignments') || {};
  const today    = toISODate(new Date());

  if (countEl) countEl.textContent = `(${batches.length})`;

  if (!batches.length) {
    listEl.innerHTML = `<div style="padding:24px 12px;text-align:center;color:var(--t3);font-size:12px">
      No batches found. Try changing filters.
    </div>`;
    return;
  }

  listEl.innerHTML = batches.map(b => {
    const disc    = AppState.findById('disciplines', b.disciplineId);
    const campus  = AppState.findById('campuses',   b.campusId);
    const teacher = AppState.findById('teachers',   b.teacherId);
    const lpa     = lpaMap[b.id];   // object lookup, not .find()
    const isSel   = _dailySelBatch?.id === b.id;

    // Check if selected date's attendance is already marked
    const records    = AttendanceService.getRecordsForDate(b.id, _dailyDate);
    const isMarked   = Object.keys(records).length > 0;

    // Is _dailyDate a class day for this batch?
    let isClassDay = false;
    if (lpa?.rows?.length) {
      isClassDay = lpa.rows.some(r => r.date === _dailyDate);
    } else {
      const classDates = AttendanceDateGenerator.generate(b.id);
      isClassDay = classDates.includes(_dailyDate);
    }

    return `
      <div class="att2-batch-item ${isSel ? 'sel' : ''}" data-dbid="${b.id}"
           style="padding:9px 12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <div class="att2-batch-name" style="font-size:12.5px">
            ${disc ? `<span style="color:var(--blue)">${disc.abbreviation}</span> — ` : ''}${b.batchName}
          </div>
          ${isMarked
            ? `<span style="font-size:9.5px;font-weight:700;color:var(--green);background:var(--green-dim);
                           padding:1px 7px;border-radius:8px;white-space:nowrap">✓ Marked</span>`
            : isClassDay
            ? `<span style="font-size:9.5px;font-weight:700;color:var(--yellow);background:var(--yellow-dim);
                           padding:1px 7px;border-radius:8px;white-space:nowrap">Pending</span>`
            : `<span style="font-size:9.5px;color:var(--t4);padding:1px 6px">—</span>`
          }
        </div>
        <div class="att2-batch-sub" style="margin-top:3px;font-size:11px">
          ${campus ? `<span>${campus.campusName.replace(/\s*campus\s*/i,'').trim()}</span>` : ''}
          ${b.sessionPeriod ? `<span style="margin-left:5px;color:var(--t4)">${b.sessionPeriod}</span>` : ''}
          ${teacher ? `<span style="margin-left:5px">· ${teacher.fullName}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.att2-batch-item').forEach(item => {
    item.addEventListener('click', () => {
      const b = AppState.findById('batches', item.dataset.dbid);
      if (!b) return;
      _dailySelBatch = b;
      listEl.querySelectorAll('.att2-batch-item').forEach(i =>
        i.classList.toggle('sel', i.dataset.dbid === b.id));
      _loadDailySheet(b);
    });
  });
}

function _attachDailyEvents() {
  _root.querySelector('#dailyFiltCamp')?.addEventListener('change', e => {
    _filterCampus = e.target.value; _renderDailyBatchList();
  });
  _root.querySelector('#dailyFiltDisc')?.addEventListener('change', e => {
    _filterDisc = e.target.value; _renderDailyBatchList();
  });
  _root.querySelector('#dailyFiltSess')?.addEventListener('change', e => {
    _filterSession = e.target.value; _renderDailyBatchList();
  });
  _root.querySelector('#dailyDatePick')?.addEventListener('change', e => {
    _dailyDate = e.target.value;
    _renderDailyBatchList();
    if (_dailySelBatch) _loadDailySheet(_dailySelBatch);
  });
  _root.querySelector('#dailyTodayBtn')?.addEventListener('click', () => {
    _dailyDate = toISODate(new Date());
    const pick = _root.querySelector('#dailyDatePick');
    if (pick) pick.value = _dailyDate;
    _renderDailyBatchList();
    if (_dailySelBatch) _loadDailySheet(_dailySelBatch);
  });
}

function _loadDailySheet(batch) {
  const mainEl = _root.querySelector('#dailyMain');
  if (!mainEl) return;

  const today     = toISODate(new Date());
  const isFuture  = _dailyDate > today;
  const lpaMap    = AppState.get('lpAssignments') || {};
  const lpa       = lpaMap[batch.id];
  const disc      = AppState.findById('disciplines', batch.disciplineId);
  const campus    = AppState.findById('campuses',   batch.campusId);
  const teacher   = AppState.findById('teachers',   batch.teacherId);

  // ── Check if selected date is a class day ──────────────────
  let isClassDay = false;
  if (lpa?.rows?.length) {
    isClassDay = lpa.rows.some(r => r.date === _dailyDate);
  } else {
    const classDates = AttendanceDateGenerator.generate(batch.id);
    isClassDay = classDates.includes(_dailyDate);
  }

  // Formatted date
  const dateObj  = new Date(_dailyDate + 'T00:00:00');
  const days     = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dayName  = days[dateObj.getDay()];
  const dateDisp = `${dayName}, ${dateObj.getDate()} ${months[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const isToday  = _dailyDate === today;

  // Batch info bar (always shown)
  const existing  = AttendanceService.getRecordsForDate(batch.id, _dailyDate);
  const isMarked  = Object.keys(existing).length > 0;

  const batchInfoBar = `
    <div style="padding:12px 16px;background:var(--surface2);border-bottom:1px solid var(--border);
                flex-shrink:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:var(--t1)">
            ${disc ? `<span style="color:var(--blue)">${disc.abbreviation}</span> — ` : ''}${batch.batchName}
          </span>
          ${isMarked
            ? `<span class="att2-badge att2-badge-green">✓ Marked</span>`
            : isClassDay
            ? `<span class="att2-badge att2-badge-yellow">Pending</span>`
            : `<span class="att2-badge" style="background:var(--surface3);color:var(--t3)">No Class</span>`
          }
          ${isFuture ? `<span class="att2-badge att2-badge-yellow">Future Date</span>` : ''}
        </div>
        <div style="font-size:11.5px;color:var(--t3);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap">
          ${campus  ? `<span>${campus.campusName.replace(/\s*campus\s*/i,'').trim()}</span>` : ''}
          ${teacher ? `<span>· ${teacher.fullName}</span>` : ''}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:13px;font-weight:700;color:${isToday ? 'var(--blue)' : 'var(--t1)'}">
          ${isToday ? '📅 Today · ' : ''}${dateDisp}
        </div>
      </div>
    </div>`;

  // ── Not a class day → show empty state ─────────────────────
  if (!isClassDay && !isMarked) {
    mainEl.innerHTML = batchInfoBar + `
      <div class="att2-placeholder">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.3" style="color:var(--t4)">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <path d="M16 2v4M8 2v4M3 10h18"/>
          <line x1="8" y1="15" x2="16" y2="15" stroke-dasharray="2 2"/>
        </svg>
        <h3>No Class on This Day</h3>
        <p>${dateDisp} is not a scheduled class day for <strong>${batch.batchName}</strong>.</p>
      </div>`;
    return;
  }

  // ── Get students ────────────────────────────────────────────
  const enrolments = (AppState.get('enrolments') || [])
    .filter(e => e.batchId === batch.id && e.status === 'active');
  const students = enrolments
    .map(e => AppState.findById('students', e.studentId))
    .filter(Boolean)
    .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));

  const isAdmin   = Auth.can('admin');
  const isTeacher = Auth.can('attendance');
  const canMark   = (isAdmin || isTeacher) && !isFuture;
  const markedBy  = AppState.get('currentUser')?.id;

  // Stats
  let pCount = 0, aCount = 0, lCount = 0;
  students.forEach(s => {
    const rec = existing[s.id];
    if      (rec?.status === 'P') pCount++;
    else if (rec?.status === 'A') aCount++;
    else if (rec?.status === 'L') lCount++;
  });
  const markedTotal = pCount + aCount + lCount;
  const pct = markedTotal > 0 ? Math.round((pCount / markedTotal) * 100) : null;
  const pctColor = pct === null ? 'var(--t3)' : pct >= 75 ? 'var(--green)' : 'var(--red)';

  mainEl.innerHTML = batchInfoBar + `

    <!-- Stats + action bar -->
    <div id="dailyStatsBar" style="padding:10px 16px;border-bottom:1px solid var(--border);flex-shrink:0;
                display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--surface)">
      ${markedTotal > 0 ? `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--green);background:color-mix(in srgb,var(--green) 12%,transparent);
                       padding:3px 10px;border-radius:20px">${pCount} P</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent);
                       padding:3px 10px;border-radius:20px">${aCount} A</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--t2);background:var(--surface2);
                       padding:3px 10px;border-radius:20px">${lCount} Leave</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:80px;max-width:200px">
          <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${pctColor};border-radius:3px;transition:width .3s"></div>
          </div>
          <span style="font-size:12px;font-weight:800;color:${pctColor};min-width:36px">${pct}%</span>
        </div>
        <span style="font-size:11px;color:var(--t3)">${markedTotal}/${students.length} marked</span>
      ` : `<span style="font-size:12px;color:var(--t3)">${students.length} students · Not marked yet</span>`}

      ${canMark ? `
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button id="dailyAllP" style="display:inline-flex;align-items:center;gap:5px;
                  height:32px;padding:0 14px;border-radius:7px;font-size:12px;font-weight:700;
                  background:color-mix(in srgb,var(--green) 12%,transparent);
                  color:var(--green);border:1.5px solid color-mix(in srgb,var(--green) 30%,transparent);
                  cursor:pointer;font-family:inherit;transition:opacity .15s">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
            All Present
          </button>
          <button id="dailyAllA" style="display:inline-flex;align-items:center;gap:5px;
                  height:32px;padding:0 14px;border-radius:7px;font-size:12px;font-weight:700;
                  background:color-mix(in srgb,var(--red) 12%,transparent);
                  color:var(--red);border:1.5px solid color-mix(in srgb,var(--red) 30%,transparent);
                  cursor:pointer;font-family:inherit;transition:opacity .15s">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            All Absent
          </button>
          <button id="dailySaveBtn" style="display:inline-flex;align-items:center;gap:5px;
                  height:32px;padding:0 16px;border-radius:7px;font-size:12px;font-weight:700;
                  background:var(--blue);color:#fff;border:none;
                  cursor:pointer;font-family:inherit;transition:opacity .15s;opacity:0.5;pointer-events:none"
                  disabled>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
            Save
          </button>
        </div>` : ''}
    </div>

    <!-- Attendance table -->
    <div style="flex:1;overflow-y:auto">
      ${!students.length
        ? `<div style="padding:40px;text-align:center;color:var(--t3);font-size:13px">No active enrolled students.</div>`
        : `<table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead>
              <tr style="background:var(--surface2);position:sticky;top:0;z-index:2">
                <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;
                           text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border);width:40px">#</th>
                <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;
                           text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border)">Student Name</th>
                <th style="padding:9px 12px;text-align:left;font-size:10px;font-weight:700;
                           text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border);width:130px">ID</th>
                <th style="padding:9px 12px;text-align:center;font-size:10px;font-weight:700;
                           text-transform:uppercase;color:var(--t3);border-bottom:2px solid var(--border);width:170px">Status</th>
              </tr>
            </thead>
            <tbody id="dailyTbody">
              ${students.map((stu, idx) => _buildDailyRow(stu, idx, existing, canMark)).join('')}
            </tbody>
          </table>`
      }
    </div>
  `;

  if (!canMark || !students.length) return;

  // Track unsaved changes
  let _hasUnsaved = false;

  const _enableSave = () => {
    const btn = mainEl.querySelector('#dailySaveBtn');
    if (!btn) return;
    btn.disabled = false;
    btn.style.opacity = '1';
    btn.style.pointerEvents = 'auto';
    _hasUnsaved = true;
  };

  const _markSaved = () => {
    const btn = mainEl.querySelector('#dailySaveBtn');
    if (!btn) return;
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Saved`;
    btn.style.background = 'var(--green)';
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.style.pointerEvents = 'none';
    _hasUnsaved = false;
    setTimeout(() => {
      btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Save`;
      btn.style.background = 'var(--blue)';
    }, 2000);
  };

  // ── Live stats update helper ─────────────────────────────────
  const _updateStats = () => {
    const cur = AttendanceService.getRecordsForDate(batch.id, _dailyDate);
    let p=0, a=0, l=0;
    students.forEach(s => {
      const r = cur[s.id];
      if      (r?.status==='P') p++;
      else if (r?.status==='A') a++;
      else if (r?.status==='L') l++;
    });
    const mt  = p+a+l;
    const pct = mt > 0 ? Math.round((p/mt)*100) : null;
    const pc  = pct===null?'var(--t3)':pct>=75?'var(--green)':'var(--red)';
    const bar = mainEl.querySelector('#dailyStatsBar');
    if (!bar) return;
    const statsInner = bar.querySelector('#dailyStatsInner');
    if (statsInner) {
      statsInner.innerHTML = `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--green);background:color-mix(in srgb,var(--green) 12%,transparent);
                       padding:3px 10px;border-radius:20px">${p} P</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent);
                       padding:3px 10px;border-radius:20px">${a} A</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--t2);background:var(--surface2);
                       padding:3px 10px;border-radius:20px">${l} Leave</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:80px;max-width:200px">
          <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${pct||0}%;background:${pc};border-radius:3px;transition:width .3s"></div>
          </div>
          <span style="font-size:12px;font-weight:800;color:${pc};min-width:36px">${pct ?? '—'}%</span>
        </div>
        <span style="font-size:11px;color:var(--t3)">${mt}/${students.length} marked</span>`;
    }
  };

  // Wrap stats content in an inner div for live update
  const statsBar = mainEl.querySelector('#dailyStatsBar');
  if (statsBar) {
    const firstChild = statsBar.querySelector('div,span');
    if (firstChild) {
      const wrap = document.createElement('div');
      wrap.id = 'dailyStatsInner';
      wrap.style.cssText = 'display:flex;align-items:center;gap:12px;flex:1;flex-wrap:wrap';
      // Move all non-button children into wrap
      [...statsBar.children].forEach(ch => {
        if (!ch.style?.marginLeft) wrap.appendChild(ch);
      });
      statsBar.insertBefore(wrap, statsBar.firstChild);
    }
  }

  // ── Wire All Present / All Absent ───────────────────────────
  const _saveAll = (status) => {
    students.forEach(s => AttendanceService.markAttendance(batch.id, s.id, _dailyDate, status, markedBy));
    _updateStats();
    _enableSave();
    _renderDailyBatchList();
  };
  mainEl.querySelector('#dailyAllP')?.addEventListener('click', () => _saveAll('P'));
  mainEl.querySelector('#dailyAllA')?.addEventListener('click', () => _saveAll('A'));

  // ── Save button ─────────────────────────────────────────────
  mainEl.querySelector('#dailySaveBtn')?.addEventListener('click', async () => {
    const btn = mainEl.querySelector('#dailySaveBtn');
    btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Saving...`;
    btn.disabled = true;
    // AppState already has the data — just trigger save
    AppState.saveState();
    await new Promise(r => setTimeout(r, 400));
    _markSaved();
    _renderDailyBatchList();
    Toast.success('Attendance saved.');
  });

  // ── Wire P/A/L buttons ──────────────────────────────────────
  mainEl.querySelector('#dailyTbody')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-s]');
    if (!btn) return;
    const grp    = btn.closest('.daily-status-grp');
    if (!grp) return;
    const sid    = grp.dataset.sid;
    const status = btn.dataset.s;
    const stu    = students.find(s => s.id === sid);
    if (!stu) return;

    AttendanceService.markAttendance(batch.id, sid, _dailyDate, status, markedBy);
    _enableSave();

    // First student → apply to all unmarked
    if (students.length && students[0].id === sid) {
      const records = AppState.get('attendanceRecords') || [];
      students.forEach(s => {
        if (s.id === sid) return;
        const already = records.find(r =>
          r.batchId === batch.id && r.studentId === s.id && r.date === _dailyDate);
        if (!already) AttendanceService.markAttendance(batch.id, s.id, _dailyDate, status, markedBy);
      });
      _loadDailySheet(batch);
      _renderDailyBatchList();
      return;
    }

    // Update this row in-place
    const newExisting = AttendanceService.getRecordsForDate(batch.id, _dailyDate);
    const tr = mainEl.querySelector(`tr[data-sid="${sid}"]`);
    if (tr) tr.outerHTML = _buildDailyRow(stu, students.indexOf(stu), newExisting, canMark);

    // Live stats update
    _updateStats();
    _renderDailyBatchList();
  });
} // end _loadDailySheet

// ── Build a single table row for daily attendance ─────────────
function _buildDailyRow(stu, idx, existing, canMark) {
  const rec    = existing[stu.id];
  const status = rec?.status || '';
  const sid    = stu.registrationNo || stu.admissionNo || stu.cnic || '—';
  const rowBg  = status === 'P' ? 'background:color-mix(in srgb,var(--green) 5%,transparent)'
               : status === 'A' ? 'background:color-mix(in srgb,var(--red) 5%,transparent)'
               : status === 'L' ? 'background:color-mix(in srgb,var(--t2) 4%,transparent)'
               : '';
  return `<tr data-sid="${stu.id}" style="${rowBg};transition:background .15s">
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);
               color:var(--t4);font-family:var(--font-mono);font-size:11px">${idx+1}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);
               font-weight:600;color:var(--t1)">${stu.studentName || '—'}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);
               font-family:var(--font-mono);font-size:11.5px;color:var(--t3)">${sid}</td>
    <td style="padding:9px 12px;border-bottom:1px solid var(--border);text-align:center">
      ${canMark
        ? `<div class="daily-status-grp" data-sid="${stu.id}"
                style="display:inline-flex;gap:5px;align-items:center">
             ${['P','A','L'].map(s => {
               const active = status === s;
               const cfg = {
                 P: { color:'var(--green)', label:'P', title:'Present' },
                 A: { color:'var(--red)',   label:'A', title:'Absent'  },
                 L: { color:'var(--t2)',    label:'L', title:'Leave'   },
               }[s];
               return `<button data-s="${s}" title="${cfg.title}" style="
                 width:32px;height:32px;border-radius:6px;
                 font-size:12px;font-weight:800;cursor:pointer;font-family:inherit;
                 transition:all .12s;
                 border: ${active ? `2px solid ${cfg.color}` : '1.5px solid var(--border2)'};
                 background: ${active ? `color-mix(in srgb,${cfg.color} 15%,transparent)` : 'var(--surface2)'};
                 color: ${active ? cfg.color : 'var(--t3)'};
               ">${cfg.label}</button>`;
             }).join('')}
           </div>`
        : `<span style="font-family:var(--font-mono);font-weight:800;font-size:13px;
                       color:${status==='P'?'var(--green)':status==='A'?'var(--red)':status==='L'?'var(--t2)':'var(--t4)'}">${status || '—'}</span>`
      }
    </td>
  </tr>`;
}

// ══════════════════════════════════════════════════════════════
// WEEKLY REPORT TAB
// Layout: Same as Daily — Sidebar (filters + batch list) | Main (range sheet)
// Date picker: From → To range, shows horizontal attendance sheet
// ══════════════════════════════════════════════════════════════

function _weeklyActiveBatches() {
  const today  = toISODate(new Date());
  const lpaMap = AppState.get('lpAssignments') || {};
  const all    = AppState.get('batches') || [];
  return all.filter(b => {
    const matchCamp = !_filterCampus  || b.campusId     === _filterCampus;
    const matchDisc = !_filterDisc    || b.disciplineId === _filterDisc;
    const matchSess = !_filterSession || b.sessionPeriod === _filterSession;
    if (!matchCamp || !matchDisc || !matchSess) return false;
    const lpa    = lpaMap[b.id];
    const lpEnd  = lpa?.endDate || (lpa?.rows?.length ? lpa.rows[lpa.rows.length - 1]?.date : null);
    return !lpEnd || lpEnd >= _weeklyFrom;
  });
}

function _renderWeeklyBatchList() {
  const listEl  = _root.querySelector('#weeklyBatchList');
  const countEl = _root.querySelector('#weeklyBatchCount');
  if (!listEl) return;

  const batches = _weeklyActiveBatches();
  const lpaMap  = AppState.get('lpAssignments') || {};

  if (countEl) countEl.textContent = `(${batches.length})`;

  if (!batches.length) {
    listEl.innerHTML = `<div style="padding:24px 12px;text-align:center;color:var(--t3);font-size:12px">
      No batches found. Try changing filters.</div>`;
    return;
  }

  listEl.innerHTML = batches.map(b => {
    const disc    = AppState.findById('disciplines', b.disciplineId);
    const campus  = AppState.findById('campuses',   b.campusId);
    const teacher = AppState.findById('teachers',   b.teacherId);
    const lpa     = lpaMap[b.id];
    const isSel   = _weeklySelBatch?.id === b.id;

    // Count marked days in range
    let classDatesInRange = [];
    if (lpa?.rows?.length) {
      classDatesInRange = lpa.rows.filter(r => r.date && r.date >= _weeklyFrom && r.date <= _weeklyTo).map(r => r.date);
    } else {
      const all = AttendanceDateGenerator.generate(b.id);
      classDatesInRange = all.filter(d => d >= _weeklyFrom && d <= _weeklyTo);
    }

    const enrolments = (AppState.get('enrolments') || []).filter(e => e.batchId === b.id && e.status === 'active');
    let anyMarked = false;
    if (classDatesInRange.length && enrolments.length) {
      anyMarked = classDatesInRange.some(d => {
        const recs = AttendanceService.getRecordsForDate(b.id, d);
        return Object.keys(recs).length > 0;
      });
    }

    const badge = classDatesInRange.length === 0
      ? `<span style="font-size:9.5px;color:var(--t4);padding:1px 6px">No Class</span>`
      : anyMarked
        ? `<span style="font-size:9.5px;font-weight:700;color:var(--green);background:var(--green-dim);padding:1px 7px;border-radius:8px;white-space:nowrap">✓ ${classDatesInRange.length}d</span>`
        : `<span style="font-size:9.5px;font-weight:700;color:var(--yellow);background:var(--yellow-dim);padding:1px 7px;border-radius:8px;white-space:nowrap">${classDatesInRange.length} class days</span>`;

    return `
      <div class="att2-batch-item ${isSel ? 'sel' : ''}" data-wbid="${b.id}" style="padding:9px 12px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:6px">
          <div class="att2-batch-name" style="font-size:12.5px">
            ${disc ? `<span style="color:var(--blue)">${disc.abbreviation}</span> — ` : ''}${b.batchName}
          </div>
          ${badge}
        </div>
        <div class="att2-batch-sub" style="margin-top:3px;font-size:11px">
          ${campus ? `<span>${campus.campusName.replace(/\s*campus\s*/i,'').trim()}</span>` : ''}
          ${b.sessionPeriod ? `<span style="margin-left:5px;color:var(--t4)">${b.sessionPeriod}</span>` : ''}
          ${teacher ? `<span style="margin-left:5px">· ${teacher.fullName}</span>` : ''}
        </div>
      </div>`;
  }).join('');

  listEl.querySelectorAll('.att2-batch-item').forEach(item => {
    item.addEventListener('click', () => {
      const b = AppState.findById('batches', item.dataset.wbid);
      if (!b) return;
      _weeklySelBatch = b;
      listEl.querySelectorAll('.att2-batch-item').forEach(i =>
        i.classList.toggle('sel', i.dataset.wbid === b.id));
      _loadWeeklySheet(b);
    });
  });
}

function _attachWeeklyEvents() {
  _root.querySelector('#weeklyFiltCamp')?.addEventListener('change', e => {
    _filterCampus = e.target.value; _renderWeeklyBatchList();
  });
  _root.querySelector('#weeklyFiltDisc')?.addEventListener('change', e => {
    _filterDisc = e.target.value; _renderWeeklyBatchList();
  });
  _root.querySelector('#weeklyFiltSess')?.addEventListener('change', e => {
    _filterSession = e.target.value; _renderWeeklyBatchList();
  });
  _root.querySelector('#weeklyFromPick')?.addEventListener('change', e => {
    _weeklyFrom = e.target.value;
    // Auto-correct: if from > to, move to forward
    if (_weeklyFrom > _weeklyTo) {
      _weeklyTo = _weeklyFrom;
      const toPick = _root.querySelector('#weeklyToPick');
      if (toPick) toPick.value = _weeklyTo;
    }
    _renderWeeklyBatchList();
    if (_weeklySelBatch) _loadWeeklySheet(_weeklySelBatch);
  });
  _root.querySelector('#weeklyToPick')?.addEventListener('change', e => {
    _weeklyTo = e.target.value;
    if (_weeklyTo < _weeklyFrom) {
      _weeklyFrom = _weeklyTo;
      const fromPick = _root.querySelector('#weeklyFromPick');
      if (fromPick) fromPick.value = _weeklyFrom;
    }
    _renderWeeklyBatchList();
    if (_weeklySelBatch) _loadWeeklySheet(_weeklySelBatch);
  });
  _root.querySelector('#weeklyThisWeekBtn')?.addEventListener('click', () => {
    const wr = _getWeekRange();
    _weeklyFrom = wr.from; _weeklyTo = wr.to;
    const fp = _root.querySelector('#weeklyFromPick');
    const tp = _root.querySelector('#weeklyToPick');
    if (fp) fp.value = _weeklyFrom;
    if (tp) tp.value = _weeklyTo;
    _renderWeeklyBatchList();
    if (_weeklySelBatch) _loadWeeklySheet(_weeklySelBatch);
  });
  _root.querySelector('#weeklyThisMonthBtn')?.addEventListener('click', () => {
    const today = new Date();
    _weeklyFrom = toISODate(new Date(today.getFullYear(), today.getMonth(), 1));
    _weeklyTo   = toISODate(new Date(today.getFullYear(), today.getMonth() + 1, 0));
    const fp = _root.querySelector('#weeklyFromPick');
    const tp = _root.querySelector('#weeklyToPick');
    if (fp) fp.value = _weeklyFrom;
    if (tp) tp.value = _weeklyTo;
    _renderWeeklyBatchList();
    if (_weeklySelBatch) _loadWeeklySheet(_weeklySelBatch);
  });
}

function _renderWeeklyAttendance() {
  const body = _root.querySelector('#att2Body');
  if (!body) return;

  const batches     = AppState.get('batches')     || [];
  const campuses    = AppState.get('campuses')    || [];
  const disciplines = AppState.get('disciplines') || [];
  const sessions    = [...new Set(batches.map(b => b.sessionPeriod).filter(Boolean))].sort().reverse();

  const campOpts = campuses.map(c =>
    `<option value="${c.id}" ${_filterCampus === c.id ? 'selected':''}>
      ${c.campusName.replace(/\s*campus\s*/i,'').trim()}
    </option>`).join('');
  const discOpts = disciplines.map(d =>
    `<option value="${d.id}" ${_filterDisc === d.id ? 'selected':''}>${d.abbreviation}</option>`).join('');
  const sessOpts = sessions.map(s =>
    `<option value="${s}" ${_filterSession === s ? 'selected':''}>${s}</option>`).join('');

  body.innerHTML = `
    <div style="display:grid;grid-template-columns:260px 1fr;flex:1;min-height:0;overflow:hidden">

      <!-- ── Sidebar ── -->
      <aside style="border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden">

        <!-- Filters -->
        <div style="padding:10px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--border);flex-shrink:0">
          <select class="att2-filter-sel" id="weeklyFiltCamp">
            <option value="">All Campuses</option>${campOpts}
          </select>
          <select class="att2-filter-sel" id="weeklyFiltDisc">
            <option value="">All Disciplines</option>${discOpts}
          </select>
          <select class="att2-filter-sel" id="weeklyFiltSess">
            <option value="">All Sessions</option>${sessOpts}
          </select>
        </div>

        <!-- Date range picker -->
        <div style="padding:8px 10px;border-bottom:1px solid var(--border);flex-shrink:0">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t3);margin-bottom:6px">Date Range</div>
          <div style="display:flex;flex-direction:column;gap:5px">
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:10.5px;color:var(--t3);min-width:24px">From</span>
              <input type="date" id="weeklyFromPick" value="${_weeklyFrom}"
                style="flex:1;background:var(--surface2);border:1px solid var(--border2);
                       border-radius:var(--r-sm);color:var(--t1);font-size:11.5px;
                       padding:4px 7px;outline:none;cursor:pointer;font-family:inherit"/>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:10.5px;color:var(--t3);min-width:24px">To</span>
              <input type="date" id="weeklyToPick" value="${_weeklyTo}"
                style="flex:1;background:var(--surface2);border:1px solid var(--border2);
                       border-radius:var(--r-sm);color:var(--t1);font-size:11.5px;
                       padding:4px 7px;outline:none;cursor:pointer;font-family:inherit"/>
            </div>
          </div>
          <div style="display:flex;gap:5px;margin-top:7px">
            <button id="weeklyThisWeekBtn"
              style="flex:1;font-size:10.5px;font-weight:700;padding:4px 0;border-radius:var(--r-sm);
                     border:1px solid var(--blue);background:var(--blue-dim);color:var(--blue);
                     cursor:pointer;font-family:inherit">This Week</button>
            <button id="weeklyThisMonthBtn"
              style="flex:1;font-size:10.5px;font-weight:700;padding:4px 0;border-radius:var(--r-sm);
                     border:1px solid var(--border2);background:var(--surface2);color:var(--t2);
                     cursor:pointer;font-family:inherit">This Month</button>
          </div>
        </div>

        <!-- Batch list label -->
        <div style="padding:7px 10px 4px;font-size:10px;font-weight:700;text-transform:uppercase;
                    letter-spacing:.06em;color:var(--t3);flex-shrink:0">
          Batches &nbsp;<span id="weeklyBatchCount" style="font-weight:400"></span>
        </div>

        <!-- Batch list -->
        <div id="weeklyBatchList" style="flex:1;overflow-y:auto"></div>
      </aside>

      <!-- ── Main ── -->
      <div id="weeklyMain" style="display:flex;flex-direction:column;overflow:hidden">
        <div class="att2-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="1.2" style="color:var(--t4)">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
          <h3>Select a Batch</h3>
          <p>Select a batch and date range to view weekly attendance.</p>
        </div>
      </div>
    </div>`;

  _renderWeeklyBatchList();
  _attachWeeklyEvents();

  if (_weeklySelBatch) {
    const b = AppState.findById('batches', _weeklySelBatch.id);
    if (b) _loadWeeklySheet(b);
  }
}

// ── Load weekly sheet ─────────────────────────────────────────
function _loadWeeklySheet(batch) {
  const mainEl = _root.querySelector('#weeklyMain');
  if (!mainEl) return;

  const today   = toISODate(new Date());
  const lpaMap  = AppState.get('lpAssignments') || {};
  const lpa     = lpaMap[batch.id];
  const disc    = AppState.findById('disciplines', batch.disciplineId);
  const campus  = AppState.findById('campuses',   batch.campusId);
  const teacher = AppState.findById('teachers',   batch.teacherId);

  // ── Compute class dates within range ──────────────────────
  let classDates = [];
  if (lpa?.rows?.length) {
    classDates = lpa.rows
      .filter(r => r.date && r.date >= _weeklyFrom && r.date <= _weeklyTo)
      .map(r => r.date)
      .sort();
  } else {
    const all = AttendanceDateGenerator.generate(batch.id);
    classDates = all.filter(d => d >= _weeklyFrom && d <= _weeklyTo).sort();
  }

  // ── Get students ──────────────────────────────────────────
  const enrolments = (AppState.get('enrolments') || [])
    .filter(e => e.batchId === batch.id && e.status === 'active');
  const students = enrolments
    .map(e => AppState.findById('students', e.studentId))
    .filter(Boolean)
    .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));

  const isAdmin   = Auth.can('admin');
  const isTeacher = Auth.can('attendance');
  const markedBy  = AppState.get('currentUser')?.id;

  // ── Format range label ────────────────────────────────────
  const fmt = d => {
    const dt = parseLocalDate(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
  };
  const rangeLabel = `${fmt(_weeklyFrom)} — ${fmt(_weeklyTo)}`;

  // ── Compute aggregate stats across all dates ──────────────
  const records = {};
  classDates.forEach(d => {
    const dayRecs = AttendanceService.getRecordsForDate(batch.id, d);
    Object.entries(dayRecs).forEach(([sid, rec]) => {
      if (!records[sid]) records[sid] = { P:0, A:0, L:0, total:0 };
      if (rec.status === 'P') { records[sid].P++; records[sid].total++; }
      else if (rec.status === 'A') { records[sid].A++; records[sid].total++; }
      else if (rec.status === 'L') { records[sid].L++; records[sid].total++; }
    });
  });

  // ── Overall stats ─────────────────────────────────────────
  let totalP = 0, totalA = 0, totalL = 0, totalMarked = 0;
  students.forEach(s => {
    const r = records[s.id];
    if (r) { totalP += r.P; totalA += r.A; totalL += r.L; totalMarked += r.total; }
  });
  const overallPct = totalMarked > 0 ? Math.round((totalP / totalMarked) * 100) : null;
  const pctColor   = overallPct === null ? 'var(--t3)' : overallPct >= 75 ? 'var(--green)' : 'var(--red)';

  // ── Build status badge for batch ─────────────────────────
  let statusBadge = '';
  if (batch.startDate && batch.endDate) {
    if (today < batch.startDate)    statusBadge = `<span class="att2-badge att2-badge-yellow">Not Started</span>`;
    else if (today > batch.endDate) statusBadge = `<span class="att2-badge att2-badge-red">Ended</span>`;
    else                            statusBadge = `<span class="att2-badge att2-badge-green">Active</span>`;
  }

  mainEl.innerHTML = `
    <!-- Batch header -->
    <div style="padding:12px 16px;background:var(--surface2);border-bottom:1px solid var(--border);
                flex-shrink:0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="font-size:15px;font-weight:800;font-family:var(--font-mono);color:var(--t1)">
            ${disc ? `<span style="color:var(--blue)">${disc.abbreviation}</span> — ` : ''}${batch.batchName}
          </span>
          ${statusBadge}
          <span class="att2-badge att2-badge-blue">📅 ${rangeLabel}</span>
          ${classDates.length
            ? `<span class="att2-badge" style="background:var(--surface3);color:var(--t2)">${classDates.length} class day${classDates.length !== 1 ? 's' : ''}</span>`
            : `<span class="att2-badge" style="background:var(--yellow-dim);color:var(--yellow)">No class days in range</span>`}
        </div>
        <div style="font-size:11.5px;color:var(--t3);margin-top:3px;display:flex;gap:10px;flex-wrap:wrap">
          ${campus  ? `<span>${campus.campusName.replace(/\s*campus\s*/i,'').trim()}</span>` : ''}
          ${teacher ? `<span>· ${teacher.fullName}</span>` : ''}
          <span>${students.length} students</span>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        ${overallPct !== null
          ? `<div style="font-size:19px;font-weight:800;font-family:var(--font-mono);color:${pctColor}">${overallPct}%</div>
             <div style="font-size:10.5px;color:var(--t3)">Overall Attendance</div>`
          : `<div style="font-size:12px;color:var(--t3)">No records yet</div>`}
      </div>
    </div>

    <!-- Stats bar -->
    <div style="padding:8px 16px;border-bottom:1px solid var(--border);flex-shrink:0;
                display:flex;align-items:center;gap:12px;flex-wrap:wrap;background:var(--surface)">
      ${totalMarked > 0 ? `
        <div style="display:flex;align-items:center;gap:10px">
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--green);background:color-mix(in srgb,var(--green) 12%,transparent);
                       padding:3px 10px;border-radius:20px">${totalP} P</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--red);background:color-mix(in srgb,var(--red) 12%,transparent);
                       padding:3px 10px;border-radius:20px">${totalA} A</span>
          <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;
                       color:var(--t2);background:var(--surface2);
                       padding:3px 10px;border-radius:20px">${totalL} Leave</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:80px;max-width:200px">
          <div style="flex:1;height:5px;background:var(--surface3);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${overallPct||0}%;background:${pctColor};border-radius:3px;transition:width .3s"></div>
          </div>
          <span style="font-size:12px;font-weight:800;color:${pctColor};min-width:36px">${overallPct ?? '—'}%</span>
        </div>
        <span style="font-size:11px;color:var(--t3)">${totalMarked} total marks</span>
      ` : `<span style="font-size:12px;color:var(--t3)">No attendance records in this range.</span>`}
      <div style="margin-left:auto;display:flex;gap:6px">
        <button id="weeklyExportBtn" class="att2-btn">⬇ Export CSV</button>
      </div>
    </div>

    <!-- No class days empty state -->
    ${!classDates.length ? `
      <div class="att2-placeholder">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="1.3" style="color:var(--t4)">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <path d="M16 2v4M8 2v4M3 10h18"/>
          <line x1="8" y1="15" x2="16" y2="15" stroke-dasharray="2 2"/>
        </svg>
        <h3>No Class Days in Range</h3>
        <p>There are no scheduled class days for <strong>${batch.batchName}</strong> between ${rangeLabel}.</p>
      </div>` : `

    <!-- Horizontal attendance sheet -->
    <div class="att2-sheet-wrap">
      ${_buildWeeklySheet(batch, students, classDates, records)}
    </div>`}
  `;

  // Wire export button
  mainEl.querySelector('#weeklyExportBtn')?.addEventListener('click', () => {
    _exportWeeklyCSV(batch, students, classDates, records);
  });

  // Wire attendance cells (read-only view for weekly — clicking opens daily tab for that date)
  mainEl.querySelectorAll('.weekly-date-cell[data-date]').forEach(cell => {
    cell.addEventListener('click', () => {
      if (!isAdmin && !isTeacher) return;
      const date = cell.dataset.date;
      if (!date) return;
      // Switch to daily tab for this date+batch
      _dailyDate     = date;
      _dailySelBatch = batch;
      _activeTab     = 'daily';
      _root.querySelectorAll('.att2-tab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === 'daily');
      });
      _renderDailyAttendance();
    });
  });
}

// ── Build weekly horizontal sheet ─────────────────────────────
function _buildWeeklySheet(batch, students, classDates, records) {
  if (!students.length) {
    return `<div style="padding:40px;text-align:center;color:var(--t3);font-size:13px">
      No active enrolled students in this batch.
    </div>`;
  }

  const today      = toISODate(new Date());
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Group dates by month
  const byMonth = {};
  classDates.forEach(d => {
    const mk = d.slice(0, 7);
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(d);
  });
  const months = Object.keys(byMonth).sort();

  // ── Get per-student per-date status map ───────────────────
  const statusMap = {}; // { sid_date → 'P'|'A'|'L'|'' }
  classDates.forEach(d => {
    const dayRecs = AttendanceService.getRecordsForDate(batch.id, d);
    students.forEach(s => {
      statusMap[`${s.id}_${d}`] = dayRecs[s.id]?.status || '';
    });
  });

  // ── Build thead ───────────────────────────────────────────
  let monthHeaderRow = `
    <th class="col-frozen col-frozen-0 th-month-hdr" rowspan="2">#</th>
    <th class="col-frozen col-frozen-1 th-month-hdr" rowspan="2">Student Name</th>
    <th class="col-frozen col-frozen-2 th-month-hdr" rowspan="2">Student ID</th>`;

  months.forEach(mk => {
    const [y, m] = mk.split('-');
    const label  = `${monthNames[parseInt(m) - 1]} ${y}`;
    monthHeaderRow += `<th class="th-month-hdr" colspan="${byMonth[mk].length}" style="text-align:center">${label}</th>`;
  });
  monthHeaderRow += `
    <th class="th-month-hdr" rowspan="2" style="text-align:center;min-width:52px">P</th>
    <th class="th-month-hdr" rowspan="2" style="text-align:center;min-width:52px">A</th>
    <th class="th-month-hdr" rowspan="2" style="text-align:center;min-width:52px">L</th>
    <th class="th-month-hdr" rowspan="2" style="text-align:center;min-width:60px">%</th>`;

  let dateHeaderRow = '';
  classDates.forEach(d => {
    const dt      = parseLocalDate(d);
    const dayShrt = DAY_SHORT[dt.getDay()];
    const dayNum  = d.slice(8);
    const isToday = d === today;
    const isFut   = d > today;
    dateHeaderRow += `
      <th style="min-width:44px;max-width:54px;padding:4px 2px" title="${d}">
        <div class="att2-date-col-hdr ${isToday ? 'is-today' : ''} ${isFut ? 'is-future' : ''}">
          <span class="att2-date-col-day">${dayShrt}</span>
          <span class="att2-date-col-date">${dayNum}</span>
        </div>
      </th>`;
  });

  // ── Build tbody ───────────────────────────────────────────
  const isAdmin   = Auth.can('admin');
  const isTeacher = Auth.can('attendance');
  const canEdit   = isAdmin || isTeacher;

  const bodyRows = students.map((stu, idx) => {
    let pCount = 0, aCount = 0, lCount = 0, totalMarked = 0;

    const cells = classDates.map(d => {
      const status  = statusMap[`${stu.id}_${d}`];
      const isFut   = d > today;
      if (status === 'P') { pCount++; totalMarked++; }
      else if (status === 'A') { aCount++; totalMarked++; }
      else if (status === 'L') { lCount++; totalMarked++; }

      const bgColor = status === 'P' ? 'var(--green-dim)' :
                      status === 'A' ? 'var(--red-dim)'   :
                      status === 'L' ? '#fef3c7'          : 'var(--surface2)';
      const txColor = status === 'P' ? 'var(--green)'     :
                      status === 'A' ? 'var(--red)'        :
                      status === 'L' ? '#92400e'            : 'var(--t4)';
      const brColor = status === 'P' ? 'var(--green)'     :
                      status === 'A' ? 'var(--red)'        :
                      status === 'L' ? '#d97706'            : 'var(--border2)';

      const titleAttr = canEdit && !isFut ? `title="Click to mark attendance for ${d}"` : '';
      const cursorSt  = canEdit && !isFut ? 'cursor:pointer;' : '';
      const opacity   = isFut ? 'opacity:.35;' : '';

      return `<td style="text-align:center;vertical-align:middle;padding:5px 3px">
        <span class="weekly-date-cell" data-date="${d}" data-sid="${stu.id}" style="
          display:inline-flex;align-items:center;justify-content:center;
          width:34px;height:28px;border-radius:6px;font-size:12px;font-weight:800;
          border:1.5px solid ${brColor};background:${bgColor};color:${txColor};
          ${cursorSt}${opacity}font-family:var(--font-mono);transition:all .1s;user-select:none"
          ${titleAttr}>${status || ''}</span>
      </td>`;
    }).join('');

    const pct      = totalMarked > 0 ? Math.round((pCount / totalMarked) * 100) : null;
    const pctColor = pct === null ? 'var(--t4)' : pct >= 75 ? 'var(--green)' : 'var(--red)';
    const shortId  = stu.registrationNo || stu.admissionNo || stu.studentCnic || stu.cnic || (stu.id?.slice(-6) || '—');

    return `<tr>
      <td class="col-frozen col-frozen-0" style="text-align:center;color:var(--t4);font-family:var(--font-mono);font-size:11px">${idx + 1}</td>
      <td class="col-frozen col-frozen-1" style="font-weight:600;color:var(--t1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px">${stu.studentName || '—'}</td>
      <td class="col-frozen col-frozen-2" style="font-family:var(--font-mono);font-size:11px;color:var(--t3)">${shortId}</td>
      ${cells}
      <td style="text-align:center;font-family:var(--font-mono);font-size:11.5px;font-weight:700;color:var(--green)">${pCount}</td>
      <td style="text-align:center;font-family:var(--font-mono);font-size:11.5px;font-weight:700;color:var(--red)">${aCount}</td>
      <td style="text-align:center;font-family:var(--font-mono);font-size:11.5px;font-weight:700;color:#d97706">${lCount}</td>
      <td style="text-align:center;padding:5px 8px">
        <div class="att2-pct" style="color:${pctColor}">${pct !== null ? pct + '%' : '—'}</div>
        <div class="att2-pct-bar"><div class="att2-pct-bar-fill" style="width:${pct||0}%;background:${pctColor}"></div></div>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="att2-sheet-table-wrap">
      <table class="att2-sheet-table">
        <thead>
          <tr>${monthHeaderRow}</tr>
          <tr>${dateHeaderRow}</tr>
        </thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
    ${canEdit ? `<div style="padding:8px 14px;font-size:11px;color:var(--t4);background:var(--surface2);border-top:1px solid var(--border)">
      💡 Click any attendance cell to open that date in Daily Attendance tab for editing.
    </div>` : ''}`;
}

// ── Export weekly CSV ─────────────────────────────────────────
function _exportWeeklyCSV(batch, students, classDates, records) {
  const fmt = d => {
    const dt = parseLocalDate(d);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${dt.getDate()}-${months[dt.getMonth()]}-${dt.getFullYear()}`;
  };

  const header = ['#', 'Student Name', 'Student ID', ...classDates.map(fmt), 'P', 'A', 'L', '%'];
  const rows   = students.map((stu, idx) => {
    let p = 0, a = 0, l = 0;
    const dayStatuses = classDates.map(d => {
      const dayRecs = AttendanceService.getRecordsForDate(batch.id, d);
      const st = dayRecs[stu.id]?.status || '';
      if (st === 'P') p++;
      else if (st === 'A') a++;
      else if (st === 'L') l++;
      return st || '—';
    });
    const total = p + a + l;
    const pct   = total > 0 ? Math.round((p / total) * 100) + '%' : '—';
    const sid   = stu.registrationNo || stu.admissionNo || stu.cnic || stu.id?.slice(-6) || '—';
    return [idx + 1, stu.studentName || '—', sid, ...dayStatuses, p, a, l, pct];
  });

  const csv  = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `weekly_attendance_${batch.batchName}_${_weeklyFrom}_to_${_weeklyTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  Toast.success('Weekly CSV exported.');
}
