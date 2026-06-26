// ============================================================
// modules/analytics/reports/attendance/attendanceSheet.js
// Report: Attendance Sheet
//
// Filter flow:
//   Campus → Discipline → Session → Batch → Month (multi)
//   → Apply Filter → blank sheet with LP-derived working dates
//
// Working dates come from lecturePlan assignment rows (r.date)
// filtered to the selected months. If no LP exists, falls back
// to batch startDate→endDate range (Mon–Sat, skip Sun).
// ============================================================

import { AppState }              from '../../../../utils/state.js';
import { getAssignmentForBatch } from '../../../lecturePlan/lecturePlanService.js';

// ── Constants ────────────────────────────────────────────────
const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MON_FULL  = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Data helpers ─────────────────────────────────────────────
const _get = k => AppState.get(k) || [];

// ── Month list between two YYYY-MM-DD dates (inclusive) ──────
function _monthsBetween(startDate, endDate) {
  if (!startDate || !endDate) return [];
  const months = [];
  const [sy, sm] = startDate.split('-').map(Number);
  const [ey, em] = endDate.split('-').map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2,'0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return months;
}

// ── Working dates from LP or fallback ────────────────────────
function _workingDates(batchId, batch) {
  // Try lecture plan first
  try {
    const assignment = getAssignmentForBatch(batchId);
    const dated = (assignment?.rows || []).filter(r => r.date).map(r => r.date);
    if (dated.length) return [...new Set(dated)].sort();
  } catch(e) { /* no LP */ }

  // Fallback: Mon–Sat between startDate and endDate
  const dates = [];
  if (!batch?.startDate || !batch?.endDate) return dates;
  const cur = new Date(batch.startDate + 'T00:00:00');
  const end = new Date(batch.endDate   + 'T00:00:00');
  while (cur <= end) {
    if (cur.getDay() !== 0) { // skip Sunday
      dates.push(cur.toISOString().slice(0,10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

// ── Styles (injected once) ────────────────────────────────────
let _asStylesInjected = false;
function _injectAsStyles() {
  if (_asStylesInjected) return;
  _asStylesInjected = true;
  const st = document.createElement('style');
  st.textContent = `
/* ── AS filter card (sticky, collapsible — same as TRS) ── */
.as-filter-card {
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
.as-filter-toggle {
  display:flex; align-items:center; gap:10px;
  width:100%; padding:11px 16px;
  background:none; border:none; font-family:inherit;
  font-size:13px; font-weight:700; color:var(--t1);
  cursor:pointer; text-align:left;
  transition:background .15s;
}
.as-filter-toggle:hover { background:var(--surface2); }
.as-filter-toggle-label { flex:1; }
.as-filter-badge {
  display:inline-flex; align-items:center;
  background:var(--blue-dim); color:var(--blue);
  border-radius:20px; padding:2px 9px;
  font-size:11px; font-weight:700;
}
.as-filter-arrow { transition:transform .2s; color:var(--t3); }
.as-filter-arrow.open { transform:rotate(180deg); }
.as-filter-body {
  display:none; flex-direction:column; gap:14px;
  border-top:1px solid var(--border);
  padding:16px;
}
.as-filter-body.open { display:flex; }
.as-filter-row { display:flex; flex-wrap:wrap; gap:12px; width:100%; box-sizing:border-box; }
.as-filter-col {
  display:flex; flex-direction:column; gap:5px;
  flex:1 1 140px; min-width:120px; max-width:100%; box-sizing:border-box;
}
.as-filter-col-label {
  font-size:10.5px; font-weight:700;
  text-transform:uppercase; letter-spacing:.07em;
  color:var(--t3);
}
.as-filter-sel {
  height:34px; padding:0 10px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:8px; color:var(--t1); font-size:12.5px;
  cursor:pointer; outline:none; font-family:inherit;
  transition:border-color .12s;
  width:100%; box-sizing:border-box;
}
.as-filter-sel:focus   { border-color:var(--blue); }
.as-filter-sel:disabled { opacity:.45; cursor:not-allowed; }
.as-filter-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding-top:2px; }
.as-filter-apply {
  padding:7px 20px; border-radius:8px; border:none;
  background:var(--blue); color:#fff;
  font-size:12.5px; font-weight:700;
  cursor:pointer; transition:opacity .15s; font-family:inherit;
}
.as-filter-apply:hover { opacity:.88; }
.as-filter-clear {
  padding:7px 14px; border-radius:8px;
  border:1px solid var(--border); background:transparent;
  color:var(--t2); font-size:12px; font-weight:600;
  cursor:pointer; transition:all .15s; font-family:inherit;
}
.as-filter-clear:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }

/* ── Month chips ── */
.as-chip {
  display:inline-flex; align-items:center; gap:5px;
  padding:4px 12px; border-radius:20px; font-size:12px; font-weight:600;
  border:1px solid var(--border2); background:var(--surface);
  color:var(--t2); cursor:pointer; transition:all .15s; user-select:none;
}
.as-chip:hover  { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
.as-chip.active { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
.as-chip .chip-dot {
  width:7px; height:7px; border-radius:50%;
  background:var(--border2); transition:background .15s;
}
.as-chip.active .chip-dot { background:var(--blue); }

/* ── Applied chips row ── */
.as-chip-row { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
.as-applied-chip {
  display:inline-flex; align-items:center; gap:4px;
  padding:3px 9px; border-radius:20px;
  font-size:11px; font-weight:600;
  border:1px solid transparent;
}

/* ── Info bar ── */
.as-info-bar {
  display:flex; align-items:center; gap:8px; flex-wrap:nowrap;
  padding:9px 16px;
  background:var(--surface2);
  border:1px solid var(--border);
  border-bottom:none;
  border-radius:12px 12px 0 0;
}

/* ── Export buttons ── */
.as-export-btn {
  display:inline-flex; align-items:center; justify-content:center; gap:5px;
  height:30px; padding:0 12px; border-radius:8px;
  border:1px solid var(--border); background:var(--surface2);
  color:var(--t3); cursor:pointer; font-size:12px; font-weight:600;
  font-family:inherit; transition:all .15s; white-space:nowrap; flex-shrink:0;
}
.as-export-btn:hover { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }

/* ── Column Manager ── */
.as-col-mgr-wrap  { position:relative; flex-shrink:0; }
.as-col-mgr-btn {
  display:inline-flex; align-items:center; justify-content:center;
  width:30px; height:30px; border-radius:8px;
  border:1px solid var(--border); background:var(--surface2);
  color:var(--t3); cursor:pointer; transition:all .15s;
}
.as-col-mgr-panel {
  position:fixed; z-index:9999;
  width:200px; background:var(--surface);
  border:1px solid var(--border); border-radius:10px;
  box-shadow:0 8px 32px rgba(0,0,0,.18);
  display:none; flex-direction:column; overflow:hidden;
  max-height:min(340px, calc(100vh - 24px));
}
.as-col-mgr-panel.open { display:flex; }
.as-col-mgr-head {
  padding:9px 13px 7px;
  border-bottom:1px solid var(--border);
  display:flex; align-items:center;
  justify-content:space-between; flex-shrink:0;
}
.as-col-mgr-title {
  font-size:11.5px; font-weight:700; color:var(--t1);
  display:flex; align-items:center; gap:6px;
}
.as-col-mgr-link {
  font-size:11px; color:var(--blue); cursor:pointer;
  background:none; border:none; padding:0;
  text-decoration:underline; font-weight:600;
}
.as-col-mgr-link:hover { opacity:.8; }
.as-col-mgr-list { padding:4px 0; overflow-y:auto; flex:1; }
.as-col-mgr-item {
  display:flex; align-items:center; gap:8px;
  padding:7px 12px; cursor:default; user-select:none;
  transition:background .1s;
}
.as-col-mgr-item:hover { background:var(--surface2); }
.as-col-mgr-chk { width:14px; height:14px; accent-color:var(--blue); cursor:pointer; flex-shrink:0; }
.as-col-mgr-lbl { font-size:12.5px; color:var(--t1); flex:1; cursor:pointer; }
.as-col-mgr-item.col-hidden .as-col-mgr-lbl { color:var(--t4); }
.as-col-mgr-foot {
  padding:6px 12px; border-top:1px solid var(--border);
  font-size:10.5px; color:var(--t3); text-align:center;
  flex-shrink:0; background:var(--surface2);
}
`;
  document.head.appendChild(st);
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC MOUNT
// ═══════════════════════════════════════════════════════════════
export function mountAttendanceSheet(container, onBack) {
  _injectAsStyles();

  // ── Snapshot state ─────────────────────────────────────────
  let _campusId    = '';
  let _discId      = '';
  let _session     = '';
  let _batchId     = '';
  let _selMonths   = new Set();
  let _filterOpen  = true;
  let _applied     = null; // { campusId, discId, session, batchId }

  // ── Shell ──────────────────────────────────────────────────
  container.innerHTML = `
    <!-- Back + title -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <button id="asBack" style="display:inline-flex;align-items:center;gap:6px;height:32px;
          padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--border2);
          background:var(--surface2);color:var(--t2);font-size:12.5px;font-weight:600;cursor:pointer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>Back
      </button>
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--t1)">Attendance Sheet</div>
        <div style="font-size:12px;color:var(--t3);margin-top:1px">
          Select filters then Apply — blank sheet loads with class dates
        </div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:16px">
      <!-- Filter card -->
      <div class="as-filter-card" id="asFilterCard">
        <button class="as-filter-toggle" id="asFilterToggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
          </svg>
          <span class="as-filter-toggle-label">Select Filter</span>
          <span class="as-filter-badge" id="asFilterBadge" style="display:none"></span>
          <svg class="as-filter-arrow open" id="asFilterArrow" width="14" height="14"
               viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </button>
        <div class="as-filter-body open" id="asFilterBody">

          <!-- Row 1: Campus · Discipline · Session · Batch -->
          <div class="as-filter-row">
            <div class="as-filter-col">
              <div class="as-filter-col-label">Campus</div>
              <select id="asCampus" class="as-filter-sel">
                <option value="">All Campuses</option>
              </select>
            </div>
            <div class="as-filter-col">
              <div class="as-filter-col-label">Discipline</div>
              <select id="asDisc" class="as-filter-sel">
                <option value="">All Disciplines</option>
              </select>
            </div>
            <div class="as-filter-col">
              <div class="as-filter-col-label">Session</div>
              <select id="asSession" class="as-filter-sel">
                <option value="">All Sessions</option>
              </select>
            </div>
            <div class="as-filter-col" style="flex:2 1 200px">
              <div class="as-filter-col-label">Batch</div>
              <select id="asBatch" class="as-filter-sel">
                <option value="">— Select Batch —</option>
              </select>
            </div>
          </div>

          <!-- Row 2: Month chips -->
          <div class="as-filter-col" style="flex:unset;max-width:unset">
            <div class="as-filter-col-label">Month</div>
            <div id="asMonthChips" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:2px">
              <span style="font-size:12px;color:var(--t4);font-style:italic">Select a batch first…</span>
            </div>
          </div>

          <!-- Actions + applied chips -->
          <div class="as-filter-actions">
            <button class="as-filter-apply" id="asApplyBtn">Apply Filter</button>
            <button class="as-filter-clear"  id="asClearBtn">Clear</button>
            <div class="as-chip-row" id="asAppliedChips"></div>
          </div>

        </div>
      </div>

      <!-- Sheet output -->
      <div id="asOutput"></div>
    </div>`;

  // ── Back ───────────────────────────────────────────────────
  container.querySelector('#asBack').addEventListener('click', onBack);

  // ── Toggle collapse ────────────────────────────────────────
  container.querySelector('#asFilterToggle').addEventListener('click', () => {
    _filterOpen = !_filterOpen;
    container.querySelector('#asFilterBody').classList.toggle('open', _filterOpen);
    container.querySelector('#asFilterArrow').classList.toggle('open', _filterOpen);
  });

  // ── Populate campus ────────────────────────────────────────
  const campSel = container.querySelector('#asCampus');
  _get('campuses').forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.campusName;
    campSel.appendChild(o);
  });

  // ── Cascade helpers ────────────────────────────────────────
  function _refreshDisc() {
    _campusId = campSel.value;
    const discSel = container.querySelector('#asDisc');
    const prev    = discSel.value;
    discSel.innerHTML = '<option value="">All Disciplines</option>';
    _get('disciplines').forEach(d => {
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = `${d.abbreviation} — ${d.name || d.fullName || ''}`;
      discSel.appendChild(o);
    });
    discSel.value = prev;
    _refreshSession();
  }

  function _refreshSession() {
    _discId = container.querySelector('#asDisc').value;
    const sessSel = container.querySelector('#asSession');
    const prev    = sessSel.value;
    let batches = _get('batches');
    if (_campusId) batches = batches.filter(b => b.campusId     === _campusId);
    if (_discId)   batches = batches.filter(b => b.disciplineId === _discId);
    const sessions = [...new Set(batches.map(b => b.sessionPeriod).filter(Boolean))].sort().reverse();
    sessSel.innerHTML = '<option value="">All Sessions</option>';
    sessions.forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      if (s === prev) o.selected = true;
      sessSel.appendChild(o);
    });
    _refreshBatch();
  }

  function _refreshBatch() {
    _session = container.querySelector('#asSession').value;
    const batchSel = container.querySelector('#asBatch');
    const prev     = batchSel.value;
    let batches = _get('batches');
    if (_campusId) batches = batches.filter(b => b.campusId      === _campusId);
    if (_discId)   batches = batches.filter(b => b.disciplineId  === _discId);
    if (_session)  batches = batches.filter(b => b.sessionPeriod === _session);
    batchSel.innerHTML = '<option value="">— Select Batch —</option>';
    batches.forEach(b => {
      const o = document.createElement('option');
      o.value = b.id; o.textContent = b.batchName;
      if (b.id === prev) o.selected = true;
      batchSel.appendChild(o);
    });
    _batchId = batchSel.value;
    _refreshMonths();
  }

  function _refreshMonths() {
    _batchId = container.querySelector('#asBatch').value;
    const chipsEl = container.querySelector('#asMonthChips');
    _selMonths.clear();

    if (!_batchId) {
      chipsEl.innerHTML = '<span style="font-size:12px;color:var(--t4);font-style:italic">Select a batch first…</span>';
      return;
    }
    const batch = AppState.findById('batches', _batchId);
    if (!batch?.startDate || !batch?.endDate) {
      chipsEl.innerHTML = '<span style="font-size:12px;color:var(--t4)">Batch has no start/end date.</span>';
      return;
    }
    const months = _monthsBetween(batch.startDate, batch.endDate);
    if (!months.length) {
      chipsEl.innerHTML = '<span style="font-size:12px;color:var(--t4)">No months in batch range.</span>';
      return;
    }
    months.forEach(mk => _selMonths.add(mk));
    chipsEl.innerHTML = months.map(mk => {
      const [y, m] = mk.split('-');
      return `<span class="as-chip active" data-month="${mk}">
        <span class="chip-dot"></span>${MON_SHORT[parseInt(m)-1]} ${y}
      </span>`;
    }).join('');
    chipsEl.querySelectorAll('.as-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const mk = chip.dataset.month;
        if (_selMonths.has(mk)) { _selMonths.delete(mk); chip.classList.remove('active'); }
        else                    { _selMonths.add(mk);    chip.classList.add('active');    }
      });
    });
  }

  // ── Applied chips (badge + colored pills) ─────────────────
  function _renderAppliedChips() {
    const f = _applied;
    const badge     = container.querySelector('#asFilterBadge');
    const chipsRow  = container.querySelector('#asAppliedChips');
    if (!f) { badge.style.display = 'none'; chipsRow.innerHTML = ''; return; }

    const make = (label, color) =>
      `<span class="as-applied-chip" style="background:color-mix(in srgb,${color} 15%,transparent);color:${color};border-color:${color}">${label}</span>`;

    const chips = [];
    let count = 0;

    if (f.campusId) {
      const c = _get('campuses').find(c => c.id === f.campusId);
      if (c) { chips.push(make((c.campusName||'').replace(/\s*campus$/i,'').trim(), 'var(--blue)')); count++; }
    }
    if (f.discId) {
      const d = _get('disciplines').find(d => d.id === f.discId);
      if (d) { chips.push(make(d.abbreviation || d.fullName || '', 'var(--violet,#8b5cf6)')); count++; }
    }
    if (f.session) { chips.push(make(f.session, 'var(--green)')); count++; }
    if (f.batchId) {
      const b = _get('batches').find(b => b.id === f.batchId);
      if (b) { chips.push(make(b.batchName || '', 'var(--yellow)')); count++; }
    }

    badge.style.display = count ? '' : 'none';
    badge.textContent   = count + ' active';
    chipsRow.innerHTML  = chips.join('');
  }

  // ── Wire filter events ─────────────────────────────────────
  campSel.addEventListener('change', _refreshDisc);
  container.querySelector('#asDisc').addEventListener('change', _refreshSession);
  container.querySelector('#asSession').addEventListener('change', _refreshBatch);
  container.querySelector('#asBatch').addEventListener('change', _refreshMonths);

  _refreshDisc();

  // ── Clear ──────────────────────────────────────────────────
  container.querySelector('#asClearBtn').addEventListener('click', () => {
    campSel.value = '';
    _campusId = _discId = _session = _batchId = '';
    _selMonths.clear();
    _applied = null;
    _refreshDisc();
    _renderAppliedChips();
    container.querySelector('#asOutput').innerHTML = '';
    // Re-open filter after clear
    _filterOpen = true;
    container.querySelector('#asFilterBody').classList.add('open');
    container.querySelector('#asFilterArrow').classList.add('open');
  });

  // ── Apply ──────────────────────────────────────────────────
  container.querySelector('#asApplyBtn').addEventListener('click', () => {
    _batchId = container.querySelector('#asBatch').value;
    if (!_batchId) {
      container.querySelector('#asOutput').innerHTML = `
        <div style="padding:32px;text-align:center;color:var(--t3);font-size:13px;
                    border:1px dashed var(--border2);border-radius:var(--r-lg)">
          Please select a batch first.
        </div>`;
      return;
    }
    _applied = { campusId: _campusId, discId: _discId, session: _session, batchId: _batchId };
    _renderAppliedChips();
    // Collapse filter after apply
    _filterOpen = false;
    container.querySelector('#asFilterBody').classList.remove('open');
    container.querySelector('#asFilterArrow').classList.remove('open');
    _renderSheet(container.querySelector('#asOutput'), _batchId, [..._selMonths].sort());
  });
}

// ═══════════════════════════════════════════════════════════════
// PRIVATE — Sheet renderer
// ═══════════════════════════════════════════════════════════════
function _renderSheet(output, batchId, selMonths) {

  const batch   = AppState.findById('batches',     batchId);
  const disc    = AppState.findById('disciplines', batch?.disciplineId);
  const campus  = AppState.findById('campuses',    batch?.campusId);

  // ── Students (active enrolments) ──────────────────────────
  const enrolments = _get('enrolments').filter(e => e.batchId === batchId && e.status === 'active');
  const students   = enrolments
    .map(e => AppState.findById('students', e.studentId))
    .filter(Boolean)
    .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));

  if (!students.length) {
    output.innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--t3);font-size:13px;
                  border:1px dashed var(--border2);border-radius:var(--r-lg)">
        No active enrolled students in this batch.
      </div>`;
    return;
  }

  // ── Working dates filtered to selected months ──────────────
  const allDates = _workingDates(batchId, batch);
  const monthSet = new Set(selMonths);
  const dates    = selMonths.length
    ? allDates.filter(d => monthSet.has(d.slice(0,7)))
    : allDates;

  // Existing attendance records (for read-only view if any)
  const batchRecs = _get('attendance').filter(r => r.batchId === batchId);
  const recMap    = {};
  batchRecs.forEach(r => { recMap[`${r.studentId}_${r.date}`] = r.status; });

  // ── Group dates by month ───────────────────────────────────
  const byMonth = {};
  dates.forEach(d => {
    const mk = d.slice(0,7);
    (byMonth[mk] = byMonth[mk] || []).push(d);
  });
  const months = Object.keys(byMonth).sort();

  // ── Month header row ───────────────────────────────────────
  const monthHeaders = months.map(mk => {
    const [y, m] = mk.split('-');
    return `<th colspan="${byMonth[mk].length}" style="
        padding:7px 8px;text-align:center;font-size:11px;font-weight:700;
        background:var(--blue-dim);color:var(--blue);
        border-right:2px solid var(--border);border-bottom:1px solid var(--border2)">
      ${MON_FULL[parseInt(m)-1]} ${y}
    </th>`;
  }).join('');

  // ── Date + Day sub-header row ──────────────────────────────
  const dateHeaders = dates.map((d, idx) => {
    const dt   = new Date(d + 'T00:00:00');
    const day  = dt.getDate();
    const dayN = dt.getDay();
    // Right border: thick at month boundary
    const mk   = d.slice(0,7);
    const isLast = byMonth[mk][byMonth[mk].length-1] === d;
    const borderR = isLast ? '2px solid var(--border)' : '1px solid var(--border2)';
    return `<th style="padding:4px 2px;text-align:center;min-width:34px;
                       border-right:${borderR};border-bottom:1px solid var(--border);
                       background:var(--surface2)">
      <div style="font-size:9px;font-weight:600;color:${dayN===5?'var(--blue)':dayN===6?'var(--yellow)':'var(--t4)'}">
        ${DAY_SHORT[dayN]}
      </div>
      <div style="font-size:11px;font-weight:700;color:var(--t2)">${day}</div>
    </th>`;
  }).join('');

  // ── Column prefs (persisted in AppState) ──────────────────
  const AS_COL_KEY = 'as_col_prefs';
  function _getAsColPrefs() {
    try { const r = AppState.get(AS_COL_KEY); if (r && Array.isArray(r.hidden)) return r; } catch(e){}
    return { hidden: [] };
  }

  const colPrefs  = _getAsColPrefs();
  const showP     = !colPrefs.hidden.includes('present');
  const showA     = !colPrefs.hidden.includes('absent');
  const showL     = !colPrefs.hidden.includes('leave');
  const showPct   = !colPrefs.hidden.includes('percent');
  const totalCols = (showP?1:0) + (showA?1:0) + (showL?1:0);

  // ── Student rows (respects col visibility) ─────────────────
  const rows = students.map((stu, idx) => {
    let p = 0, a = 0, l = 0;
    const cells = dates.map(d => {
      const status  = recMap[`${stu.id}_${d}`] || '';
      if (status === 'P') p++;
      else if (status === 'A') a++;
      else if (status === 'L') l++;
      const mk      = d.slice(0,7);
      const isLast  = byMonth[mk][byMonth[mk].length-1] === d;
      const borderR = isLast ? '2px solid var(--border)' : '1px solid var(--border2)';
      const color   = status === 'P' ? 'var(--green)'
                    : status === 'A' ? 'var(--red)'
                    : status === 'L' ? 'var(--yellow)'
                    : 'var(--t4)';
      return `<td style="text-align:center;padding:5px 2px;
                         border-bottom:1px solid var(--border);border-right:${borderR};
                         font-size:11.5px;font-weight:700;color:${color};min-width:34px">
        ${status || ''}
      </td>`;
    }).join('');

    const total    = p + a + l;
    const pct      = total > 0 ? Math.round((p / total) * 100) : null;
    const pctColor = pct === null ? 'var(--t4)' : pct >= 75 ? 'var(--green)' : 'var(--red)';
    const rowBg    = idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)';

    return `<tr style="background:${rowBg}">
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 color:var(--t4);font-size:11px;font-family:var(--font-mono);
                 position:sticky;left:0;background:inherit;z-index:1">${idx + 1}</td>
      <td style="padding:6px 12px;border-bottom:1px solid var(--border);
                 border-right:2px solid var(--border);font-weight:700;
                 color:var(--t1);white-space:nowrap;
                 position:sticky;left:36px;background:inherit;z-index:1;min-width:160px">
        ${stu.studentName || '—'}
      </td>
      ${cells}
      ${showP ? `<td style="padding:6px 8px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--green)">${total > 0 ? p : ''}</td>` : ''}
      ${showA ? `<td style="padding:6px 8px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--red)">${total > 0 ? a : ''}</td>` : ''}
      ${showL ? `<td style="padding:6px 8px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--yellow)">${total > 0 ? l : ''}</td>` : ''}
      ${showPct ? `<td style="padding:6px 8px;border-bottom:1px solid var(--border);
                 text-align:center;font-weight:800;font-size:12px;color:${pctColor}">
        ${pct !== null ? pct + '%' : ''}
      </td>` : ''}
    </tr>`;
  }).join('');

  // ── Render output ──────────────────────────────────────────
  const monthLabel = selMonths.length
    ? selMonths.map(mk => { const [y,m]=mk.split('-'); return MON_SHORT[parseInt(m)-1]+' '+y; }).join(', ')
    : 'All Months';

  // ── Info bar ───────────────────────────────────────────────
  const infoBar = `
    <div class="as-info-bar">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2" style="flex-shrink:0">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      </svg>
      <span style="font-size:12.5px;font-weight:700;color:var(--t1);white-space:nowrap">${batch?.batchName || '—'}</span>
      <span style="color:var(--border2);font-size:16px;font-weight:300;margin:0 2px;flex-shrink:0">|</span>
      <span style="font-size:11.5px;color:var(--t3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
        ${disc?.abbreviation||''}${campus ? ' · ' + campus.campusName : ''}
        · ${students.length} student${students.length!==1?'s':''}
        · ${dates.length} class day${dates.length!==1?'s':''}
        · ${monthLabel}
      </span>
      <div style="display:flex;gap:6px;align-items:center;margin-left:auto;flex-shrink:0">
        <button class="as-export-btn" id="asExportCSV">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
          </svg>CSV
        </button>
        <button class="as-export-btn" id="asExportPDF">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>PDF
        </button>
        <div class="as-col-mgr-wrap">
          <button class="as-col-mgr-btn" id="asColMgrBtn" title="Show / hide columns">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="18" rx="1"/>
              <rect x="14" y="3" width="7" height="18" rx="1"/>
            </svg>
          </button>
          <div class="as-col-mgr-panel" id="asColMgrPanel">
            <div class="as-col-mgr-head">
              <span class="as-col-mgr-title">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="18" rx="1"/>
                </svg>Columns
              </span>
              <button class="as-col-mgr-link" id="asColMgrShowAll">Show All</button>
            </div>
            <div class="as-col-mgr-list" id="asColMgrList"></div>
            <div class="as-col-mgr-foot">Applies to summary columns</div>
          </div>
        </div>
      </div>
    </div>`;

  output.innerHTML = infoBar + (
    !dates.length
      ? `<div style="padding:32px;text-align:center;color:var(--t3);font-size:13px;
                     border:1px solid var(--border);border-top:none;border-radius:0 0 12px 12px">
           No class dates found for the selected months.
           ${!_get('lecturePlans').length ? '<br><span style="font-size:11px;color:var(--t4)">Tip: Assign a Lecture Plan to this batch to auto-populate dates.</span>' : ''}
         </div>`
      : `<div style="overflow-x:auto;overflow-y:visible;border:1px solid var(--border);
                     border-top:none;border-radius:0 0 12px 12px">
           <table id="asTable" style="border-collapse:collapse;font-size:12.5px;min-width:100%">
             <thead>
               <tr>
                 <th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);width:36px;
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     position:sticky;left:0;z-index:4">#</th>
                 <th rowspan="2" style="padding:8px 12px;text-align:left;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);min-width:160px;
                     border-right:2px solid var(--border);border-bottom:1px solid var(--border);
                     position:sticky;left:36px;z-index:4">Student Name</th>
                 ${monthHeaders}
                 ${totalCols > 0 ? `<th colspan="${totalCols}" style="padding:6px 8px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border2)">Total</th>` : ''}
                 ${showPct ? `<th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-bottom:1px solid var(--border);min-width:48px">%</th>` : ''}
               </tr>
               <tr>
                 ${dateHeaders}
                 ${showP ? `<th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--green);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);min-width:30px">P</th>` : ''}
                 ${showA ? `<th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--red);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);min-width:30px">A</th>` : ''}
                 ${showL ? `<th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--yellow);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);min-width:30px">L</th>` : ''}
               </tr>
             </thead>
             <tbody>${rows}</tbody>
           </table>
         </div>`
  );

  // ── Wire export buttons ────────────────────────────────────
  const _exportCtx = { batch, disc, campus, students, dates, byMonth, monthLabel, selMonths };

  output.querySelector('#asExportCSV')?.addEventListener('click', () =>
    _exportCSV(_exportCtx));

  output.querySelector('#asExportPDF')?.addEventListener('click', () =>
    _exportPDF(_exportCtx, output));

  // ── Wire Column Manager ────────────────────────────────────
  _wireAsColManager(output, batchId, selMonths);
}

// ── CSV Export ────────────────────────────────────────────────
function _exportCSV({ batch, disc, campus, students, dates, byMonth, monthLabel, selMonths }) {
  if (!students.length || !dates.length) { alert('No data to export.'); return; }

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

  const batchRecs = (AppState.get('attendance') || []).filter(r => r.batchId === batch?.id);
  const recMap    = {};
  batchRecs.forEach(r => { recMap[`${r.studentId}_${r.date}`] = r.status; });

  const metaLines = [
    'Attendance Sheet',
    `Batch: ${batch?.batchName || '—'}`,
    `${disc?.abbreviation||''}${campus?' · '+campus.campusName:''}`,
    `Months: ${monthLabel}`,
    `Generated: ${dateStr} ${timeStr}`,
    '',
  ].join('\n');

  const dateHeaders = dates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return `${['Su','Mo','Tu','We','Th','Fr','Sa'][dt.getDay()]} ${dt.getDate()}/${dt.getMonth()+1}`;
  });
  const headers = ['#', 'Student Name', ...dateHeaders, 'P', 'A', 'L', '%'];

  const csvRows = students.map((stu, i) => {
    let p = 0, a = 0, l = 0;
    const cells = dates.map(d => {
      const s = recMap[`${stu.id}_${d}`] || '';
      if (s === 'P') p++; else if (s === 'A') a++; else if (s === 'L') l++;
      return s;
    });
    const total = p + a + l;
    const pct   = total > 0 ? Math.round((p / total) * 100) + '%' : '';
    return [i+1, stu.studentName || '—', ...cells, p, a, l, pct]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });

  const csv  = metaLines + headers.map(h=>`"${h}"`).join(',') + '\n' + csvRows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Attendance-${batch?.batchName||'Sheet'}-${dateStr.replace(/ /g,'-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF / Print Export ────────────────────────────────────────
function _exportPDF({ batch, disc, campus, students, dates, byMonth, monthLabel }, output) {
  const table = output.querySelector('#asTable');
  if (!table) { alert('No sheet to export.'); return; }

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Attendance Sheet — ${batch?.batchName||''}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:9px;color:#1e293b;background:#fff;padding:14px 16px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;
              border-bottom:2.5px solid #2563eb;padding-bottom:8px;margin-bottom:10px}
      .header .title{font-size:15px;font-weight:700;color:#1e40af}
      .header .sub{font-size:9px;color:#64748b;margin-top:2px}
      .header .right{text-align:right;font-size:9px;color:#64748b;line-height:1.6}
      table{border-collapse:collapse;width:100%}
      th,td{border:1px solid #cbd5e1;padding:3px 4px;text-align:center;white-space:nowrap}
      th{background:#f1f5f9;font-weight:700;font-size:8.5px}
      td:nth-child(2){text-align:left;font-weight:600}
      .month-hdr{background:#dbeafe;color:#1e40af;font-size:8px;font-weight:700}
      .footer{margin-top:10px;padding-top:7px;border-top:1px solid #e2e8f0;
              display:flex;justify-content:space-between;font-size:7.5px;color:#94a3b8}
      @media print{body{padding:6px 8px}.no-print{display:none}@page{size:A4 landscape;margin:6mm}}
    </style>
  </head><body>
    <div class="header">
      <div>
        <div class="title">Attendance Sheet — ${batch?.batchName||''}</div>
        <div class="sub">${disc?.abbreviation||''}${campus?' · '+campus.campusName:''} · ${students.length} students · ${dates.length} class days · ${monthLabel}</div>
      </div>
      <div class="right"><strong>${dateStr}</strong><div>${timeStr}</div></div>
    </div>
    ${table.outerHTML}
    <div class="footer">
      <span>Attendance Sheet · ${batch?.batchName||''}</span>
      <span>Powered by <strong style="color:#2563eb">Learnomist</strong></span>
    </div>
    <div class="no-print" style="margin-top:10px;text-align:center">
      <button onclick="window.print()" style="padding:6px 20px;background:#2563eb;color:#fff;
        border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer">
        Print / Save as PDF
      </button>
    </div>
  </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 500);
}

// ── Column Manager ─────────────────────────────────────────────
function _wireAsColManager(output, batchId, selMonths) {
  const btn   = output.querySelector('#asColMgrBtn');
  const panel = output.querySelector('#asColMgrPanel');
  const list  = output.querySelector('#asColMgrList');
  if (!btn || !panel || !list) return;

  const AS_COL_KEY = 'as_col_prefs';
  const AS_COLS = [
    { key: 'present', label: 'P (Present)' },
    { key: 'absent',  label: 'A (Absent)'  },
    { key: 'leave',   label: 'L (Leave)'   },
    { key: 'percent', label: '% Attendance' },
  ];
  function _getPrefs() {
    try { const r = AppState.get(AS_COL_KEY); if (r && Array.isArray(r.hidden)) return r; } catch(e){}
    return { hidden: [] };
  }
  function _savePrefs(p) { AppState.set(AS_COL_KEY, p); }

  const _positionPanel = () => {
    const r = btn.getBoundingClientRect();
    const w = 200;
    let left = r.right - w;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    panel.style.left = left + 'px';
    panel.style.top  = (r.bottom + 6) + 'px';
  };

  const _renderList = () => {
    const prefs = _getPrefs();
    list.innerHTML = '';
    AS_COLS.forEach(col => {
      const isVisible = !prefs.hidden.includes(col.key);
      const item = document.createElement('div');
      item.className = 'as-col-mgr-item' + (isVisible ? '' : ' col-hidden');
      item.innerHTML =
        `<input type="checkbox" class="as-col-mgr-chk" id="as_chk_${col.key}"${isVisible?' checked':''}/>`+
        `<label class="as-col-mgr-lbl" for="as_chk_${col.key}">${col.label}</label>`;
      item.querySelector('.as-col-mgr-chk').addEventListener('change', e => {
        const p = _getPrefs();
        if (e.target.checked) {
          p.hidden = p.hidden.filter(h => h !== col.key);
          item.classList.remove('col-hidden');
        } else {
          if (!p.hidden.includes(col.key)) p.hidden.push(col.key);
          item.classList.add('col-hidden');
        }
        _savePrefs(p);
        panel.classList.remove('open');
        btn.style.cssText = '';
        _renderSheet(output, batchId, selMonths);
      });
      list.appendChild(item);
    });
  };

  btn.addEventListener('click', e => {
    e.stopPropagation();
    const isOpen = panel.classList.contains('open');
    if (isOpen) {
      panel.classList.remove('open');
      btn.style.cssText = '';
    } else {
      _renderList();
      _positionPanel();
      panel.classList.add('open');
      btn.style.borderColor = 'var(--blue)';
      btn.style.color = 'var(--blue)';
      btn.style.background = 'var(--blue-dim)';
    }
  });

  output.querySelector('#asColMgrShowAll')?.addEventListener('click', () => {
    AppState.set(AS_COL_KEY, { hidden: [] });
    panel.classList.remove('open');
    btn.style.cssText = '';
    _renderSheet(output, batchId, selMonths);
  });

  const _outside = e => {
    if (!panel.contains(e.target) && e.target !== btn) {
      panel.classList.remove('open');
      btn.style.cssText = '';
    }
  };
  document.addEventListener('click', _outside);
  window.addEventListener('scroll', () => { if (panel.classList.contains('open')) _positionPanel(); }, true);
  window.addEventListener('resize', () => { if (panel.classList.contains('open')) _positionPanel(); });
}
