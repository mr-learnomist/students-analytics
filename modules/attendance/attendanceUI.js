// ============================================================
// modules/attendance/attendanceUI.js — Attendance Module UI
//
// ARCHITECTURE (3-panel SPA within the attendance view):
//   Panel 1: Batch List          → select a batch to proceed
//   Panel 2: Date List           → pick a date to mark attendance
//   Panel 3: Attendance Sheet    → mark P / A / L per student
//
// Admin-only features:
//   - Configure class days schedule (day-of-week picker)
//   - Effective-from date for schedule changes (future only)
//   - Export CSV
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
  DAY_NAMES,
  DAY_SHORT,
  toISODate,
  parseLocalDate,
  formatDisplayDate,
} from './attendanceService.js';

// ── Inject attendance-specific styles ────────────────────────
function injectAttendanceStyles() {
  if (document.getElementById('att-styles')) return;
  const style = document.createElement('style');
  style.id = 'att-styles';
  style.textContent = `
    /* ── Layout ── */
    .att-shell { display:grid; grid-template-columns:320px 1fr; gap:0; height:100%; min-height:calc(100vh - 160px); }
    .att-sidebar { border-right:1px solid var(--border); overflow-y:auto; display:flex; flex-direction:column; }
    .att-main { overflow-y:auto; padding:24px; display:flex; flex-direction:column; gap:20px; }

    /* ── Batch List ── */
    .att-section-hdr {
      padding:16px 16px 10px;
      font-size:10.5px; font-weight:700; letter-spacing:.08em;
      text-transform:uppercase; color:var(--t3);
      border-bottom:1px solid var(--border);
      display:flex; align-items:center; justify-content:space-between;
    }
    .att-batch-item {
      padding:12px 16px; cursor:pointer; border-bottom:1px solid var(--border);
      transition:background .12s; position:relative;
    }
    .att-batch-item:hover { background:var(--surface2); }
    .att-batch-item.active {
      background:var(--blue-dim);
      border-left:3px solid var(--blue);
    }
    .att-batch-name { font-size:13px; font-weight:700; font-family:var(--font-mono); color:var(--t1); }
    .att-batch-meta { font-size:11.5px; color:var(--t3); margin-top:3px; }
    .att-batch-teacher { font-size:11.5px; color:var(--t2); margin-top:2px; display:flex; align-items:center; gap:5px; }
    .att-batch-status {
      font-size:10px; font-weight:700; padding:2px 7px; border-radius:10px;
      position:absolute; right:12px; top:12px;
    }
    .att-batch-status--active  { background:var(--green-dim); color:var(--green); }
    .att-batch-status--ended   { background:var(--red-dim);   color:var(--red);   }
    .att-batch-status--pending { background:var(--yellow-dim);color:var(--yellow);}

    /* ── Empty sidebar state ── */
    .att-empty-state {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:10px; flex:1; padding:40px 20px; text-align:center;
    }
    .att-empty-state svg { color:var(--t4); }
    .att-empty-state p { font-size:13px; color:var(--t3); line-height:1.5; }

    /* ── Main area placeholder ── */
    .att-placeholder {
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      gap:14px; min-height:400px; text-align:center;
    }
    .att-placeholder h3 { font-size:16px; color:var(--t2); font-weight:600; }
    .att-placeholder p  { font-size:13px; color:var(--t3); max-width:380px; line-height:1.6; }

    /* ── Batch header card ── */
    .att-batch-hdr {
      background:var(--surface2); border:1px solid var(--border);
      border-radius:var(--r-lg); padding:16px 20px;
      display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap;
    }
    .att-batch-hdr-info { display:flex; flex-direction:column; gap:4px; }
    .att-batch-hdr-name { font-size:18px; font-weight:800; font-family:var(--font-mono); color:var(--t1); }
    .att-batch-hdr-sub  { font-size:12.5px; color:var(--t3); }
    .att-batch-hdr-actions { display:flex; gap:8px; flex-wrap:wrap; }

    /* ── Buttons ── */
    .att-btn {
      display:inline-flex; align-items:center; gap:6px;
      padding:7px 14px; border-radius:var(--r-sm); font-size:12.5px;
      font-weight:600; cursor:pointer; border:1px solid transparent; transition:all .15s;
    }
    .att-btn--primary  { background:var(--blue);    color:#fff;         border-color:var(--blue); }
    .att-btn--primary:hover { filter:brightness(1.1); }
    .att-btn--ghost    { background:transparent;    color:var(--t2);    border-color:var(--border2); }
    .att-btn--ghost:hover  { background:var(--surface2); }
    .att-btn--success  { background:var(--green);   color:#fff;         border-color:var(--green); }
    .att-btn--success:hover { filter:brightness(1.1); }
    .att-btn--danger   { background:var(--red-dim); color:var(--red);   border-color:var(--red); }
    .att-btn--sm { padding:5px 10px; font-size:11.5px; }

    /* ── Stats bar ── */
    .att-stats-bar {
      display:flex; gap:12px; flex-wrap:wrap;
    }
    .att-stat-chip {
      background:var(--surface2); border:1px solid var(--border);
      border-radius:var(--r-sm); padding:8px 14px;
      display:flex; flex-direction:column; gap:2px; min-width:90px;
    }
    .att-stat-val { font-size:20px; font-weight:800; font-family:var(--font-mono); color:var(--t1); }
    .att-stat-lbl { font-size:10.5px; color:var(--t3); font-weight:600; text-transform:uppercase; letter-spacing:.06em; }

    /* ── Date tabs ── */
    .att-date-section { display:flex; flex-direction:column; gap:8px; }
    .att-date-section-hdr {
      font-size:10.5px; font-weight:700; text-transform:uppercase;
      letter-spacing:.07em; color:var(--t3); padding-bottom:6px;
      border-bottom:1px solid var(--border); display:flex; align-items:center;
      justify-content:space-between;
    }
    .att-date-grid {
      display:flex; flex-wrap:wrap; gap:6px;
    }
    .att-date-chip {
      padding:5px 10px; border-radius:var(--r-sm); font-size:11.5px;
      font-weight:600; cursor:pointer; border:1px solid var(--border2);
      background:var(--surface2); color:var(--t2); transition:all .12s;
      font-family:var(--font-mono);
      display:flex; flex-direction:column; align-items:center; gap:1px;
    }
    .att-date-chip:hover   { border-color:var(--blue); color:var(--blue); }
    .att-date-chip.marked  { background:var(--green-dim); border-color:var(--green); color:var(--green); }
    .att-date-chip.today   { border-color:var(--blue);    color:var(--blue); font-weight:800; }
    .att-date-chip.active  { background:var(--blue); border-color:var(--blue); color:#fff; }
    .att-date-chip .chip-day  { font-size:10px; opacity:.75; }

    /* ── Attendance sheet ── */
    .att-sheet-hdr {
      background:var(--surface2); border:1px solid var(--border);
      border-radius:var(--r-sm); padding:12px 16px;
      display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap;
    }
    .att-sheet-date { font-size:15px; font-weight:700; color:var(--t1); }
    .att-sheet-sub  { font-size:12px; color:var(--t3); margin-top:2px; }
    .att-sheet-bulk { display:flex; gap:6px; }

    .att-table { width:100%; border-collapse:separate; border-spacing:0; }
    .att-table th {
      background:var(--surface2); padding:9px 12px;
      font-size:10.5px; font-weight:700; text-transform:uppercase;
      letter-spacing:.06em; color:var(--t3);
      border-bottom:2px solid var(--border);
      text-align:left;
    }
    .att-table td {
      padding:9px 12px; border-bottom:1px solid var(--border);
      font-size:13px; color:var(--t2);
      transition:background .1s;
    }
    .att-table tr:hover td { background:var(--surface2); }
    .att-table .att-idx { font-family:var(--font-mono); font-size:11.5px; color:var(--t4); width:36px; }

    /* ── Status toggle buttons ── */
    .att-status-group { display:flex; gap:4px; }
    .att-status-btn {
      width:32px; height:32px; border-radius:var(--r-sm);
      font-size:12.5px; font-weight:800; cursor:pointer;
      border:2px solid transparent; transition:all .12s;
      display:flex; align-items:center; justify-content:center;
    }
    .att-status-btn[data-s="P"]          { background:var(--surface3); color:var(--t3); border-color:var(--border2); }
    .att-status-btn[data-s="P"].selected { background:var(--green);    color:#fff;      border-color:var(--green);   }
    .att-status-btn[data-s="A"]          { background:var(--surface3); color:var(--t3); border-color:var(--border2); }
    .att-status-btn[data-s="A"].selected { background:var(--red);      color:#fff;      border-color:var(--red);     }
    .att-status-btn[data-s="L"]          { background:var(--surface3); color:var(--t3); border-color:var(--border2); }
    .att-status-btn[data-s="L"].selected { background:var(--yellow);   color:#000;      border-color:var(--yellow);  }

    /* ── Schedule config modal ── */
    .day-chip-grid { display:flex; gap:8px; flex-wrap:wrap; margin:8px 0; }
    .day-chip {
      padding:7px 14px; border-radius:var(--r-sm); font-size:12.5px;
      font-weight:600; cursor:pointer; border:2px solid var(--border2);
      background:var(--surface2); color:var(--t2); transition:all .12s;
      user-select:none;
    }
    .day-chip:hover   { border-color:var(--blue); color:var(--blue); }
    .day-chip.selected { background:var(--blue); color:#fff; border-color:var(--blue); }
    .day-chip.disabled { opacity:.35; cursor:not-allowed; }

    /* ── Summary table ── */
    .att-pct-bar-wrap { background:var(--surface3); border-radius:4px; height:5px; width:80px; overflow:hidden; }
    .att-pct-bar { height:100%; border-radius:4px; transition:width .4s; }

    /* ── Sidebar search ── */
    .att-search-wrap {
      padding:10px 12px; border-bottom:1px solid var(--border);
      display:flex; align-items:center; gap:8px;
    }
    .att-search-wrap svg { color:var(--t4); flex-shrink:0; }
    .att-search-input {
      flex:1; background:none; border:none; outline:none;
      font-size:13px; color:var(--t1); font-family:inherit;
    }
    .att-search-input::placeholder { color:var(--t4); }

    /* Responsive */
    @media(max-width:768px) {
      .att-shell { grid-template-columns:1fr; }
      .att-sidebar { border-right:none; border-bottom:1px solid var(--border); max-height:260px; }
    }
  `;
  document.head.appendChild(style);
}

// ── Module State ──────────────────────────────────────────────
let _selectedBatch  = null;
let _selectedDate   = null;
let _rootEl         = null;
let _pendingChanges = {}; // { studentId → status } — unsaved sheet changes

// ── Public mount point ────────────────────────────────────────
export const AttendanceModule = {

  mount(container) {
    injectUIStyles();
    injectAttendanceStyles();
    ensureAttendanceKeys();

    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    _rootEl = el;

    el.innerHTML = _buildShell();
    _renderBatchList();
    _attachSidebarSearch();
    _showPlaceholder();
  },
};

// ── Shell HTML ────────────────────────────────────────────────
function _buildShell() {
  return `
    <div class="att-shell">
      <aside class="att-sidebar" id="attSidebar">
        <div class="att-section-hdr">
          <span>Batches</span>
          <span id="attBatchCount" style="font-size:10.5px;font-weight:600;
            background:var(--surface3);color:var(--t3);padding:1px 7px;
            border-radius:10px;font-family:var(--font-mono)">—</span>
        </div>
        <div class="att-search-wrap">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input class="att-search-input" id="attBatchSearch" placeholder="Search batches…"/>
        </div>
        <div id="attBatchList" style="flex:1;overflow-y:auto;"></div>
      </aside>
      <div class="att-main" id="attMain"></div>
    </div>
  `;
}

// ── Batch List (Sidebar) ──────────────────────────────────────
function _renderBatchList(filter = '') {
  const listEl = _rootEl.querySelector('#attBatchList');
  const countEl = _rootEl.querySelector('#attBatchCount');
  if (!listEl) return;

  let batches = AppState.get('batches') || [];
  if (filter) {
    const q = filter.toLowerCase();
    batches = batches.filter(b => {
      const teacher = AppState.findById('teachers', b.teacherId);
      return (b.batchName || '').toLowerCase().includes(q) ||
             (teacher?.fullName || '').toLowerCase().includes(q) ||
             (b.sessionPeriod || '').toLowerCase().includes(q);
    });
  }

  if (countEl) countEl.textContent = batches.length;

  if (!batches.length) {
    listEl.innerHTML = `
      <div class="att-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
        <p>${filter ? 'No batches match your search.' : 'No batches found.<br>Create batches in the Batches module.'}</p>
      </div>`;
    return;
  }

  const today = toISODate(new Date());

  listEl.innerHTML = batches.map(batch => {
    const teacher = AppState.findById('teachers', batch.teacherId);
    const discipline = AppState.findById('disciplines', batch.disciplineId);

    // Status
    let statusLabel = 'Pending';
    let statusClass = 'pending';
    if (batch.startDate && batch.endDate) {
      if (today < batch.startDate)        { statusLabel = 'Not Started'; statusClass = 'pending'; }
      else if (today > batch.endDate)     { statusLabel = 'Ended';       statusClass = 'ended';   }
      else                                { statusLabel = 'Active';      statusClass = 'active';  }
    }

    const isActive = _selectedBatch?.id === batch.id;

    return `
      <div class="att-batch-item ${isActive ? 'active' : ''}" data-batch-id="${batch.id}">
        <span class="att-batch-status att-batch-status--${statusClass}">${statusLabel}</span>
        <div class="att-batch-name">${batch.batchName}</div>
        <div class="att-batch-meta">
          ${discipline ? `<span class="badge badge--blue" style="font-size:10px">${discipline.abbreviation}</span>` : ''}
          ${batch.sessionPeriod ? `<span style="margin-left:4px">${batch.sessionPeriod}</span>` : ''}
          ${batch.startDate ? `<span style="margin-left:4px;color:var(--t4)">${batch.startDate} → ${batch.endDate || '?'}</span>` : ''}
        </div>
        <div class="att-batch-teacher">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          ${teacher ? teacher.fullName : '<span style="color:var(--t4)">No teacher assigned</span>'}
        </div>
      </div>
    `;
  }).join('');

  // Click delegation
  listEl.querySelectorAll('.att-batch-item').forEach(item => {
    item.addEventListener('click', () => {
      const batchId = item.dataset.batchId;
      const batch   = AppState.findById('batches', batchId);
      if (!batch) return;
      _selectBatch(batch);
    });
  });
}

function _attachSidebarSearch() {
  _rootEl.querySelector('#attBatchSearch')?.addEventListener('input', e => {
    _renderBatchList(e.target.value.trim());
  });
}

// ── Select Batch → show main panel ───────────────────────────
function _selectBatch(batch) {
  _selectedBatch = batch;
  _selectedDate  = null;
  _pendingChanges = {};

  // Highlight sidebar item
  _rootEl.querySelectorAll('.att-batch-item').forEach(el => {
    el.classList.toggle('active', el.dataset.batchId === batch.id);
  });

  _renderMainPanel();
}

// ── Main Panel ────────────────────────────────────────────────
function _renderMainPanel() {
  const mainEl = _rootEl.querySelector('#attMain');
  if (!mainEl || !_selectedBatch) return;

  const batch    = _selectedBatch;
  const teacher  = AppState.findById('teachers', batch.teacherId);
  const disc     = AppState.findById('disciplines', batch.disciplineId);
  const subject  = AppState.findById('subjects', batch.subjectId);
  const students = (AppState.get('students') || []).filter(s => s.batchId === batch.id);
  const schedule = ScheduleService.getActiveSchedule(batch.id, toISODate(new Date()));
  const isAdmin  = Auth.can('admin');
  const today    = toISODate(new Date());

  // Summary stats
  const summary    = AttendanceService.getSummary(batch.id);
  const classDates = AttendanceDateGenerator.generate(batch.id);
  const markedCount = classDates.filter(d => AttendanceService.isDateMarked(batch.id, d)).length;

  // Batch status
  let batchStatusBadge = '';
  if (batch.startDate && batch.endDate) {
    if (today < batch.startDate)
      batchStatusBadge = `<span style="background:var(--yellow-dim);color:var(--yellow);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">Not Started</span>`;
    else if (today > batch.endDate)
      batchStatusBadge = `<span style="background:var(--red-dim);color:var(--red);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">Ended</span>`;
    else
      batchStatusBadge = `<span style="background:var(--green-dim);color:var(--green);padding:2px 8px;border-radius:10px;font-size:11px;font-weight:700">Active</span>`;
  }

  mainEl.innerHTML = `
    <!-- Batch Header -->
    <div class="att-batch-hdr">
      <div class="att-batch-hdr-info">
        <div style="display:flex;align-items:center;gap:10px">
          <span class="att-batch-hdr-name">${batch.batchName}</span>
          ${batchStatusBadge}
        </div>
        <div class="att-batch-hdr-sub">
          ${disc ? `<span class="badge badge--blue" style="font-size:10px">${disc.abbreviation}</span>` : ''}
          ${subject ? `<span style="margin-left:6px">${subject.subjectCode} — ${subject.subjectName}</span>` : ''}
          ${teacher ? `<span style="margin-left:10px;color:var(--t2)">👤 ${teacher.fullName}</span>` : ''}
          ${batch.startDate ? `<span style="margin-left:10px;color:var(--t4)">${batch.startDate} → ${batch.endDate || '?'}</span>` : ''}
        </div>
      </div>
      <div class="att-batch-hdr-actions">
        ${isAdmin ? `<button class="att-btn att-btn--ghost att-btn--sm" id="attConfigBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93A10 10 0 0 0 2.93 19.07M4.93 4.93A10 10 0 0 0 19.07 19.07"/>
          </svg>
          Class Schedule
        </button>` : ''}
        <button class="att-btn att-btn--ghost att-btn--sm" id="attSummaryBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
          Summary
        </button>
        <button class="att-btn att-btn--ghost att-btn--sm" id="attExportBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export CSV
        </button>
      </div>
    </div>

    <!-- Stats -->
    <div class="att-stats-bar">
      <div class="att-stat-chip">
        <span class="att-stat-val">${students.length}</span>
        <span class="att-stat-lbl">Students</span>
      </div>
      <div class="att-stat-chip">
        <span class="att-stat-val">${classDates.length}</span>
        <span class="att-stat-lbl">Class Days</span>
      </div>
      <div class="att-stat-chip">
        <span class="att-stat-val">${markedCount}</span>
        <span class="att-stat-lbl">Marked</span>
      </div>
      <div class="att-stat-chip">
        <span class="att-stat-val" style="color:${summary.batchPercent !== null ? (summary.batchPercent >= 75 ? 'var(--green)' : 'var(--red)') : 'var(--t4)'}">
          ${summary.batchPercent !== null ? summary.batchPercent + '%' : '—'}
        </span>
        <span class="att-stat-lbl">Avg Present</span>
      </div>
      <div class="att-stat-chip">
        <span class="att-stat-val" style="font-size:13px;margin-top:3px;color:var(--t2)">
          ${schedule ? schedule.classDays.map(d => DAY_SHORT[d]).join(', ') : '—'}
        </span>
        <span class="att-stat-lbl">Class Days</span>
      </div>
    </div>

    <!-- No schedule warning -->
    ${!schedule && isAdmin ? `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
      background:var(--yellow-dim);border:1px solid var(--yellow);border-radius:var(--r-sm)">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--yellow)" stroke-width="2">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <div>
        <div style="font-size:13px;font-weight:700;color:var(--yellow)">No Class Schedule Configured</div>
        <div style="font-size:12px;color:var(--t2);margin-top:2px">
          Click <strong>Class Schedule</strong> to define which days of the week this batch has classes.
          Without a schedule, no attendance dates will be generated.
        </div>
      </div>
    </div>` : ''}

    ${!schedule && !isAdmin ? `
    <div style="display:flex;align-items:center;gap:10px;padding:12px 16px;
      background:var(--yellow-dim);border:1px solid var(--yellow);border-radius:var(--r-sm)">
      <span style="font-size:13px;color:var(--yellow)">⚠ No class schedule configured. Contact your admin to set up class days.</span>
    </div>` : ''}

    <!-- Date Grid -->
    ${_buildDateGrid(batch, classDates)}

    <!-- Attendance Sheet (rendered when date is selected) -->
    <div id="attSheetContainer"></div>
  `;

  // Wire buttons
  _rootEl.querySelector('#attConfigBtn')?.addEventListener('click', () => _openScheduleModal(batch));
  _rootEl.querySelector('#attSummaryBtn')?.addEventListener('click', () => _openSummaryModal(batch));
  _rootEl.querySelector('#attExportBtn')?.addEventListener('click', () => {
    AttendanceService.exportCSV(batch.id);
    Toast.success('CSV export started.');
  });

  // Re-select date if one was selected
  if (_selectedDate) {
    _renderAttendanceSheet(batch, _selectedDate);
    _rootEl.querySelectorAll('.att-date-chip').forEach(chip => {
      if (chip.dataset.date === _selectedDate) chip.classList.add('active');
    });
  }
}

function _showPlaceholder() {
  const mainEl = _rootEl.querySelector('#attMain');
  if (!mainEl) return;
  mainEl.innerHTML = `
    <div class="att-placeholder">
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.2" style="color:var(--t4)">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>
      </svg>
      <h3>Select a Batch</h3>
      <p>Choose a batch from the left panel to view dates and mark attendance for students.</p>
    </div>
  `;
}

// ── Date Grid ─────────────────────────────────────────────────
function _buildDateGrid(batch, classDates) {
  const today = toISODate(new Date());

  if (!classDates.length) {
    const hasSchedule = !!ScheduleService.getActiveSchedule(batch.id, today);
    return `
      <div class="att-date-section">
        <div class="att-date-section-hdr"><span>Class Dates</span></div>
        <div style="padding:20px;text-align:center;color:var(--t3);font-size:13px">
          ${!hasSchedule
            ? 'No class schedule configured. Set up class days to generate attendance dates.'
            : !batch.startDate
              ? 'This batch has no start date configured.'
              : 'No class dates generated yet for the current date range.'
          }
        </div>
      </div>`;
  }

  // Group by month
  const byMonth = {};
  classDates.forEach(d => {
    const key = d.slice(0, 7); // YYYY-MM
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(d);
  });

  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const monthSections = Object.entries(byMonth).map(([monthKey, dates]) => {
    const [y, m] = monthKey.split('-');
    const monthLabel = `${monthNames[parseInt(m) - 1]} ${y}`;

    const chips = dates.map(d => {
      const dateObj  = parseLocalDate(d);
      const dayName  = DAY_SHORT[dateObj.getDay()];
      const isMarked = AttendanceService.isDateMarked(batch.id, d);
      const isToday  = d === today;
      const isFuture = d > today;

      let cls = 'att-date-chip';
      if (isMarked)                          cls += ' marked';
      else if (isToday)                      cls += ' today';
      if (_selectedDate === d)               cls += ' active';

      return `
        <div class="${cls}" data-date="${d}" title="${formatDisplayDate(d)}${isMarked ? ' ✓ Marked' : ''}${isFuture ? ' (future)' : ''}">
          <span class="chip-day">${dayName}</span>
          <span>${d.slice(8)}</span>
        </div>`;
    }).join('');

    const markedInMonth = dates.filter(d => AttendanceService.isDateMarked(batch.id, d)).length;

    return `
      <div class="att-date-section">
        <div class="att-date-section-hdr">
          <span>${monthLabel}</span>
          <span style="font-size:10.5px;color:var(--t4)">${markedInMonth}/${dates.length} marked</span>
        </div>
        <div class="att-date-grid">${chips}</div>
      </div>`;
  }).join('');

  const html = `<div id="attDateGrid" style="display:flex;flex-direction:column;gap:14px">${monthSections}</div>`;

  // Wire date chip clicks after DOM insert via event delegation on container
  setTimeout(() => {
    _rootEl.querySelector('#attDateGrid')?.addEventListener('click', e => {
      const chip = e.target.closest('.att-date-chip');
      if (!chip || !chip.dataset.date) return;

      const date = chip.dataset.date;
      const today = toISODate(new Date());

      // Optionally allow future dates to be clicked (just won't be saveable)
      _selectedDate = date;

      // Update active state
      _rootEl.querySelectorAll('.att-date-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      _renderAttendanceSheet(_selectedBatch, date);
      // Scroll sheet into view
      setTimeout(() => {
        _rootEl.querySelector('#attSheetContainer')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  }, 0);

  return html;
}

// ── Attendance Sheet ──────────────────────────────────────────
function _renderAttendanceSheet(batch, date) {
  const sheetEl = _rootEl.querySelector('#attSheetContainer');
  if (!sheetEl) return;

  const students  = (AppState.get('students') || []).filter(s => s.batchId === batch.id);
  const today     = toISODate(new Date());
  const isFuture  = date > today;
  const existing  = AttendanceService.getRecordsForDate(batch.id, date);
  const isAdmin   = Auth.can('admin');
  const isTeacher = Auth.can('attendance');

  // Build pending changes from existing records (pre-load)
  _pendingChanges = {};
  Object.entries(existing).forEach(([sid, rec]) => {
    _pendingChanges[sid] = rec.status;
  });

  if (!students.length) {
    sheetEl.innerHTML = `
      <div style="padding:20px;text-align:center;color:var(--t3);font-size:13px;
        background:var(--surface2);border:1px solid var(--border);border-radius:var(--r-sm)">
        No students enrolled in this batch yet.
      </div>`;
    return;
  }

  const canMark = (isAdmin || isTeacher) && !isFuture;
  const alreadyMarked = Object.keys(existing).length > 0;

  sheetEl.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px">
      <!-- Sheet header -->
      <div class="att-sheet-hdr">
        <div>
          <div class="att-sheet-date">${formatDisplayDate(date)}</div>
          <div class="att-sheet-sub">
            ${students.length} student${students.length !== 1 ? 's' : ''} •
            ${alreadyMarked ? `<span style="color:var(--green);font-weight:600">✓ Attendance already recorded</span>` : 'Not yet marked'}
            ${isFuture ? `<span style="color:var(--yellow);margin-left:8px">⚠ Future date — cannot mark yet</span>` : ''}
          </div>
        </div>
        ${canMark ? `
        <div class="att-sheet-bulk">
          <button class="att-btn att-btn--ghost att-btn--sm" id="markAllP">✓ All Present</button>
          <button class="att-btn att-btn--ghost att-btn--sm" id="markAllA">✗ All Absent</button>
          <button class="att-btn att-btn--success att-btn--sm" id="saveAttBtn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
            </svg>
            Save Attendance
          </button>
        </div>` : ''}
      </div>

      <!-- Table -->
      <table class="att-table">
        <thead>
          <tr>
            <th class="att-idx">#</th>
            <th>Student Name</th>
            <th style="width:140px">CNIC</th>
            <th style="width:140px">Status</th>
          </tr>
        </thead>
        <tbody id="attSheetBody">
          ${students.map((stu, idx) => {
            const rec    = existing[stu.id];
            const status = _pendingChanges[stu.id] || rec?.status || null;
            return `
              <tr data-student-id="${stu.id}">
                <td class="att-idx">${idx + 1}</td>
                <td style="font-weight:500;color:var(--t1)">${stu.studentName}</td>
                <td style="font-family:var(--font-mono);font-size:11.5px;color:var(--t3)">${stu.cnic || '—'}</td>
                <td>
                  ${canMark
                    ? `<div class="att-status-group" data-student-id="${stu.id}">
                        ${['P','A','L'].map(s => `
                          <button class="att-status-btn ${status === s ? 'selected' : ''}"
                                  data-s="${s}" title="${s === 'P' ? 'Present' : s === 'A' ? 'Absent' : 'Leave'}">
                            ${s}
                          </button>`).join('')}
                       </div>`
                    : `<span style="font-family:var(--font-mono);font-weight:700;font-size:13px;
                         color:${status === 'P' ? 'var(--green)' : status === 'A' ? 'var(--red)' : status === 'L' ? 'var(--yellow)' : 'var(--t4)'}">
                         ${status || '—'}
                       </span>`
                  }
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;

  if (!canMark) return;

  // Wire status toggle buttons
  sheetEl.querySelectorAll('.att-status-group').forEach(group => {
    group.addEventListener('click', e => {
      const btn = e.target.closest('.att-status-btn');
      if (!btn) return;
      const studentId = group.dataset.studentId;
      const status    = btn.dataset.s;

      _pendingChanges[studentId] = status;

      // Update button visuals in this group
      group.querySelectorAll('.att-status-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // Mark all present
  sheetEl.querySelector('#markAllP')?.addEventListener('click', () => {
    students.forEach(s => { _pendingChanges[s.id] = 'P'; });
    _refreshStatusButtons(sheetEl, 'P');
  });

  // Mark all absent
  sheetEl.querySelector('#markAllA')?.addEventListener('click', () => {
    students.forEach(s => { _pendingChanges[s.id] = 'A'; });
    _refreshStatusButtons(sheetEl, 'A');
  });

  // Save
  sheetEl.querySelector('#saveAttBtn')?.addEventListener('click', () => {
    _saveAttendance(batch, date, students, sheetEl);
  });
}

function _refreshStatusButtons(sheetEl, status) {
  sheetEl.querySelectorAll('.att-status-group').forEach(group => {
    group.querySelectorAll('.att-status-btn').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.s === status);
    });
  });
}

function _saveAttendance(batch, date, students, sheetEl) {
  // Validate: all students must have a status
  const missing = students.filter(s => !_pendingChanges[s.id]);
  if (missing.length) {
    Toast.warning(`Please mark attendance for all students. ${missing.length} student${missing.length !== 1 ? 's' : ''} not marked.`);
    // Highlight missing rows
    missing.forEach(s => {
      const row = sheetEl.querySelector(`tr[data-student-id="${s.id}"]`);
      if (row) {
        row.style.background = 'var(--red-dim)';
        setTimeout(() => { row.style.background = ''; }, 2000);
      }
    });
    return;
  }

  const currentUser = AppState.get('currentUser');
  const entries = students.map(s => ({ studentId: s.id, status: _pendingChanges[s.id] }));

  const { saved, errors } = AttendanceService.bulkMarkAttendance(
    batch.id, date, entries, currentUser?.id
  );

  if (errors.length) {
    Toast.error(`${errors.length} record(s) failed to save.`);
    console.error('[Attendance] Save errors:', errors);
    return;
  }

  Toast.success(`Attendance for ${formatDisplayDate(date)} saved — ${saved} records.`);

  // Refresh the date chip to show "marked" state
  _rootEl.querySelectorAll('.att-date-chip').forEach(chip => {
    if (chip.dataset.date === date) {
      chip.classList.add('marked');
      chip.classList.remove('today');
    }
  });

  // Refresh the sheet header to show "already marked"
  const subEl = sheetEl.querySelector('.att-sheet-sub');
  if (subEl) {
    subEl.innerHTML = `${students.length} students • <span style="color:var(--green);font-weight:600">✓ Attendance already recorded</span>`;
  }

  // Refresh stats bar
  _refreshStatsBar(batch);
}

function _refreshStatsBar(batch) {
  const summary    = AttendanceService.getSummary(batch.id);
  const classDates = AttendanceDateGenerator.generate(batch.id);
  const markedCount = classDates.filter(d => AttendanceService.isDateMarked(batch.id, d)).length;

  const statsBar = _rootEl.querySelector('.att-stats-bar');
  if (!statsBar) return;

  const chips = statsBar.querySelectorAll('.att-stat-chip');
  if (chips[2]) chips[2].querySelector('.att-stat-val').textContent = markedCount;
  if (chips[3]) {
    const pctEl = chips[3].querySelector('.att-stat-val');
    pctEl.textContent = summary.batchPercent !== null ? summary.batchPercent + '%' : '—';
    pctEl.style.color = summary.batchPercent !== null
      ? (summary.batchPercent >= 75 ? 'var(--green)' : 'var(--red)')
      : 'var(--t4)';
  }
}

// ── Schedule Config Modal (Admin only) ────────────────────────
function _openScheduleModal(batch) {
  const existing  = ScheduleService.getSchedulesForBatch(batch.id);
  const active    = ScheduleService.getActiveSchedule(batch.id, toISODate(new Date()));
  const today     = toISODate(new Date());

  // Default effective date = today
  const defaultEffective = today;
  const selectedDays = new Set(active?.classDays || []);

  const historyHTML = existing.length
    ? existing.map(s => `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
          <div style="flex:1">
            <span style="font-family:var(--font-mono);font-size:12px;font-weight:700;color:var(--t1)">
              ${s.classDays.map(d => DAY_NAMES[d]).join(', ')}
            </span>
            <span style="font-size:11.5px;color:var(--t3);margin-left:8px">from ${s.effectiveFrom}</span>
            ${s.effectiveFrom === (existing[existing.length - 1]?.effectiveFrom) && existing.length > 1
              ? `<span style="font-size:10px;background:var(--green-dim);color:var(--green);
                   padding:1px 6px;border-radius:8px;margin-left:6px;font-weight:700">Current</span>` : ''}
          </div>
          ${existing.length > 1 ? `
          <button class="att-btn att-btn--danger att-btn--sm" data-delete-sch="${s.id}" title="Delete this schedule">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
            </svg>
          </button>` : ''}
        </div>`).join('')
    : `<div style="color:var(--t3);font-size:12.5px;padding:8px 0">No schedules configured yet.</div>`;

  Modal.open({
    title: `Class Schedule — ${batch.batchName}`,
    size:  'md',
    body: `
      <!-- Day picker -->
      <div class="form-group">
        <label class="form-label">Select Class Days <span class="req">*</span></label>
        <div class="day-chip-grid" id="dayChipGrid">
          ${[1,2,3,4,5,6].map(d => `
            <div class="day-chip ${selectedDays.has(d) ? 'selected' : ''}" data-day="${d}" title="${DAY_NAMES[d]}">
              ${DAY_SHORT[d]}
            </div>`).join('')}
          <div class="day-chip disabled" title="Sunday is always excluded">Sun</div>
        </div>
        <span class="form-hint">Sunday is permanently excluded. Select 1–6 days.</span>
      </div>

      <!-- Effective from -->
      <div class="form-group">
        <label class="form-label">Effective From <span class="req">*</span></label>
        <input type="date" id="schedEffectiveFrom" class="form-input"
               value="${defaultEffective}"
               min="${batch.startDate || today}"
               max="${batch.endDate || ''}"/>
        <span class="form-hint">
          Changes apply from this date onward. Past attendance records are never modified.
        </span>
      </div>

      <!-- History -->
      <div class="form-group" style="margin-top:16px">
        <label class="form-label" style="margin-bottom:8px">Schedule History</label>
        <div id="schedHistoryList">${historyHTML}</div>
      </div>
    `,
    actions: [
      { label: 'Cancel', variant: 'ghost' },
      {
        label: 'Save Schedule',
        variant: 'primary',
        close: false,
        handler: (modalEl) => {
          const grid = modalEl.querySelector('#dayChipGrid');
          const days = [...grid.querySelectorAll('.day-chip.selected:not(.disabled)')]
            .map(c => parseInt(c.dataset.day));
          const effective = modalEl.querySelector('#schedEffectiveFrom').value;
          const currentUser = AppState.get('currentUser');

          const result = ScheduleService.setSchedule(batch.id, days, effective, currentUser?.id);
          if (!result.success) {
            Toast.error(result.message);
            return;
          }

          Toast.success('Class schedule saved. Future attendance dates updated.');
          Modal.closeAll();

          // Re-render main panel
          _renderMainPanel();
        }
      }
    ],
    onOpen: (modalEl) => {
      // Day chip toggle
      modalEl.querySelector('#dayChipGrid')?.addEventListener('click', e => {
        const chip = e.target.closest('.day-chip:not(.disabled)');
        if (!chip) return;
        chip.classList.toggle('selected');
      });

      // Delete schedule entries
      modalEl.querySelector('#schedHistoryList')?.addEventListener('click', e => {
        const btn = e.target.closest('[data-delete-sch]');
        if (!btn) return;
        const id = btn.dataset.deleteSch;
        const r  = ScheduleService.deleteSchedule(id);
        if (!r.success) { Toast.error(r.message); return; }
        Toast.info('Schedule entry deleted.');
        Modal.closeAll();
        _openScheduleModal(batch);
      });
    }
  });
}

// ── Summary Modal ─────────────────────────────────────────────
function _openSummaryModal(batch) {
  const summary  = AttendanceService.getSummary(batch.id);
  const students = summary.students;

  const rowsHTML = students.length
    ? students.map((s, i) => {
        const pct   = s.attendancePercent;
        const color = pct === null ? 'var(--t4)' : pct >= 75 ? 'var(--green)' : 'var(--red)';
        const barW  = pct !== null ? pct : 0;
        return `
          <tr>
            <td style="color:var(--t3);font-family:var(--font-mono);font-size:11.5px;width:32px">${i+1}</td>
            <td style="font-weight:500;color:var(--t1)">${s.studentName}</td>
            <td style="text-align:center;font-family:var(--font-mono);font-weight:700;color:var(--green)">${s.P}</td>
            <td style="text-align:center;font-family:var(--font-mono);font-weight:700;color:var(--red)">${s.A}</td>
            <td style="text-align:center;font-family:var(--font-mono);font-weight:700;color:var(--yellow)">${s.L}</td>
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <span style="font-weight:700;color:${color};font-family:var(--font-mono);min-width:36px">
                  ${pct !== null ? pct + '%' : '—'}
                </span>
                <div class="att-pct-bar-wrap">
                  <div class="att-pct-bar" style="width:${barW}%;background:${color}"></div>
                </div>
              </div>
            </td>
          </tr>`;
      }).join('')
    : `<tr><td colspan="6" style="text-align:center;color:var(--t3);padding:20px">No students enrolled.</td></tr>`;

  Modal.open({
    title: `Attendance Summary — ${batch.batchName}`,
    size:  'lg',
    body: `
      <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
        <div class="att-stat-chip">
          <span class="att-stat-val">${summary.totalRecords}</span>
          <span class="att-stat-lbl">Total Records</span>
        </div>
        <div class="att-stat-chip">
          <span class="att-stat-val" style="color:${summary.batchPercent !== null && summary.batchPercent >= 75 ? 'var(--green)' : 'var(--red)'}">
            ${summary.batchPercent !== null ? summary.batchPercent + '%' : '—'}
          </span>
          <span class="att-stat-lbl">Batch Average</span>
        </div>
        <div class="att-stat-chip">
          <span class="att-stat-val">${students.filter(s => s.attendancePercent !== null && s.attendancePercent < 75).length}</span>
          <span class="att-stat-lbl">Below 75%</span>
        </div>
      </div>
      <div style="overflow-x:auto">
        <table class="att-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Student Name</th>
              <th style="text-align:center;color:var(--green)">P</th>
              <th style="text-align:center;color:var(--red)">A</th>
              <th style="text-align:center;color:var(--yellow)">L</th>
              <th>Attendance %</th>
            </tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    `,
    actions: [
      { label: 'Close', variant: 'ghost' },
      {
        label: 'Export CSV', variant: 'primary',
        handler: () => {
          AttendanceService.exportCSV(batch.id);
          Toast.success('CSV export started.');
        }
      }
    ]
  });
}
