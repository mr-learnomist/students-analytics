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
/* ── AS filter card ── */
.as-filter-card {
  position: sticky; top: 0; z-index: 20;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; overflow: hidden;
  width: 100%; box-sizing: border-box; flex-shrink: 0;
}
.as-filter-toggle {
  display:flex; align-items:center; gap:10px;
  width:100%; padding:11px 16px;
  background:none; border:none; font-family:inherit;
  font-size:13px; font-weight:700; color:var(--t1);
  cursor:pointer; text-align:left; transition:background .15s;
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
  display:none; flex-direction:column; gap:0;
  border-top:1px solid var(--border);
}
.as-filter-body.open { display:flex; }

/* ── Single unified filter row ── */
.as-frow1 {
  display:flex; align-items:stretch;
  gap:0; width:100%; box-sizing:border-box;
}
.as-fcell {
  display:flex; flex-direction:column;
  padding: 10px 14px;
  border-right: 1px solid var(--border);
  box-sizing: border-box;
  min-width: 0;
  flex: 1 1 0;
}
.as-fcell:last-child { border-right: none; }
.as-fcell-label {
  font-size:10px; font-weight:700;
  text-transform:uppercase; letter-spacing:.08em;
  color:var(--t3); margin-bottom:6px; white-space:nowrap;
}
.as-filter-sel {
  height:32px; padding:0 8px;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:7px; color:var(--t1); font-size:13px;
  cursor:pointer; outline:none; font-family:inherit;
  transition:border-color .15s, box-shadow .15s;
  width:100%; box-sizing:border-box; min-width:0;
}
.as-filter-sel:focus { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-dim); }
.as-filter-sel:disabled { opacity:.4; cursor:not-allowed; }

/* ── Batch cell: search on top, dropdown below ── */
.as-batch-search-wrap {
  position:relative;
  margin-bottom:5px;
}
.as-batch-search-wrap svg {
  position:absolute; left:9px; top:50%; transform:translateY(-50%);
  color:var(--t4); pointer-events:none; flex-shrink:0;
}
.as-batch-search-inp {
  width:100%; height:30px; padding:0 9px 0 30px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:7px; color:var(--t1); font-size:12.5px;
  outline:none; font-family:inherit; box-sizing:border-box;
  transition:border-color .15s, box-shadow .15s;
}
.as-batch-search-inp:focus { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-dim); }
.as-batch-search-inp::placeholder { color:var(--t4); }
.as-batch-sel {
  height:32px; padding:0 8px;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:7px; color:var(--t1); font-size:13px;
  cursor:pointer; outline:none; font-family:inherit;
  transition:border-color .15s; width:100%; box-sizing:border-box;
}
.as-batch-sel:focus { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-dim); }

/* ── Month chips cell ── */
.as-month-chips-row {
  display:flex; flex-wrap:wrap; gap:5px; align-items:center;
  padding-top:2px;
}
.as-chip {
  display:inline-flex; align-items:center; gap:5px;
  padding:4px 11px; border-radius:20px; font-size:12px; font-weight:600;
  border:1px solid var(--border2); background:var(--surface2);
  color:var(--t2); cursor:pointer; transition:all .15s; user-select:none;
  white-space:nowrap;
}
.as-chip:hover  { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
.as-chip.active { border-color:var(--blue); color:var(--blue); background:var(--blue-dim); }
.as-chip .chip-dot {
  width:6px; height:6px; border-radius:50%;
  background:var(--border2); transition:background .15s; flex-shrink:0;
}
.as-chip.active .chip-dot { background:var(--blue); }

/* ── Actions cell ── */
.as-factions {
  display:flex; flex-direction:column; gap:6px;
  justify-content:flex-end; align-items:stretch;
  flex: 0 0 auto; min-width:110px;
  padding:10px 14px; border-left:1px solid var(--border);
  box-sizing:border-box;
}
.as-filter-apply {
  height:34px; padding:0 12px; border-radius:8px; border:none;
  background:var(--blue); color:#fff;
  font-size:13px; font-weight:700;
  cursor:pointer; transition:opacity .15s; font-family:inherit;
  white-space:nowrap; width:100%;
}
.as-filter-apply:hover { opacity:.88; }
.as-filter-clear {
  height:30px; padding:0 12px; border-radius:8px;
  border:1px solid var(--border); background:transparent;
  color:var(--t2); font-size:12.5px; font-weight:600;
  cursor:pointer; transition:all .15s; font-family:inherit; width:100%;
}
.as-filter-clear:hover { background:var(--red-dim); color:var(--red); border-color:var(--red); }

/* applied chips */
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

/* ── Custom searchable dropdown (Subject / Batch / Month) ── */
.as-cdd {
  position:relative; width:100%;
}
.as-cdd-trigger {
  display:flex; align-items:center; justify-content:space-between;
  height:32px; padding:0 10px;
  background:var(--surface); border:1px solid var(--border2);
  border-radius:7px; color:var(--t1); font-size:13px;
  cursor:pointer; width:100%; box-sizing:border-box;
  font-family:inherit; transition:border-color .15s, box-shadow .15s;
  gap:6px; text-align:left; outline:none; user-select:none;
}
.as-cdd-trigger:hover   { border-color:var(--blue); }
.as-cdd-trigger.open    { border-color:var(--blue); box-shadow:0 0 0 3px var(--blue-dim); }
.as-cdd-trigger.disabled{ opacity:.4; cursor:not-allowed; pointer-events:none; }
.as-cdd-val { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12.5px; }
.as-cdd-val.placeholder { color:var(--t4); }
.as-cdd-arrow { flex-shrink:0; color:var(--t3); transition:transform .18s; }
.as-cdd-trigger.open .as-cdd-arrow { transform:rotate(180deg); }

.as-cdd-panel {
  position:fixed; z-index:9998;
  background:var(--surface); border:1px solid var(--border);
  border-radius:10px; box-shadow:0 8px 32px rgba(0,0,0,.18);
  display:none; flex-direction:column; overflow:hidden;
  min-width:180px; max-height:280px;
}
.as-cdd-panel.open { display:flex; }

.as-cdd-search-wrap {
  padding:8px 10px 6px; border-bottom:1px solid var(--border); flex-shrink:0;
  position:relative;
}
.as-cdd-search-wrap svg {
  position:absolute; left:18px; top:50%; transform:translateY(-50%);
  color:var(--t4); pointer-events:none;
}
.as-cdd-search {
  width:100%; height:28px; padding:0 8px 0 28px;
  background:var(--surface2); border:1px solid var(--border2);
  border-radius:6px; color:var(--t1); font-size:12px;
  outline:none; font-family:inherit; box-sizing:border-box;
}
.as-cdd-search:focus { border-color:var(--blue); }

.as-cdd-list { overflow-y:auto; flex:1; padding:4px 0; }
.as-cdd-item {
  display:flex; align-items:center; gap:8px;
  padding:7px 12px; cursor:pointer; font-size:12.5px;
  color:var(--t1); transition:background .1s; white-space:nowrap;
  user-select:none;
}
.as-cdd-item:hover    { background:var(--surface2); }
.as-cdd-item.selected { color:var(--blue); font-weight:700; }
.as-cdd-item.hidden   { display:none; }
.as-cdd-item-check {
  width:14px; height:14px; border-radius:3px; border:1.5px solid var(--border2);
  flex-shrink:0; display:flex; align-items:center; justify-content:center;
  transition:all .1s;
}
.as-cdd-item.selected .as-cdd-item-check {
  background:var(--blue); border-color:var(--blue);
}
.as-cdd-item-check svg { display:none; }
.as-cdd-item.selected .as-cdd-item-check svg { display:block; }
.as-cdd-empty {
  padding:16px 12px; text-align:center;
  font-size:12px; color:var(--t4); font-style:italic;
}
.as-cdd-footer {
  padding:6px 10px; border-top:1px solid var(--border);
  display:flex; gap:6px; align-items:center; flex-shrink:0;
  background:var(--surface2);
}
.as-cdd-footer-btn {
  font-size:11px; font-weight:600; color:var(--blue);
  background:none; border:none; padding:0; cursor:pointer; font-family:inherit;
}
.as-cdd-footer-btn:hover { opacity:.75; }
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
  let _subjectId   = '';
  let _batchSearch = '';
  let _session     = '';
  let _batchId     = '';
  let _selMonths   = new Set();
  let _filterOpen  = true;
  let _applied     = null; // { campusId, discId, subjectId, session, batchId }

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

          <!-- Single unified filter row: Campus · Discipline · Session · Subject · Batch · Month · Actions -->
          <div class="as-frow1">

            <div class="as-fcell">
              <div class="as-fcell-label">Campus</div>
              <select id="asCampus" class="as-filter-sel">
                <option value="">All Campuses</option>
              </select>
            </div>

            <div class="as-fcell">
              <div class="as-fcell-label">Discipline</div>
              <select id="asDisc" class="as-filter-sel">
                <option value="">All</option>
              </select>
            </div>

            <div class="as-fcell">
              <div class="as-fcell-label">Session</div>
              <select id="asSession" class="as-filter-sel">
                <option value="">All</option>
              </select>
            </div>

            <div class="as-fcell">
              <div class="as-fcell-label">Subject</div>
              <div class="as-cdd" id="asSubjectDd">
                <button type="button" class="as-cdd-trigger disabled" id="asSubjectTrigger">
                  <span class="as-cdd-val placeholder" id="asSubjectVal">— Select Discipline —</span>
                  <svg class="as-cdd-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="as-cdd-panel" id="asSubjectPanel">
                  <div class="as-cdd-search-wrap">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input class="as-cdd-search" id="asSubjectSearch" type="text" placeholder="Search subjects…" autocomplete="off"/>
                  </div>
                  <div class="as-cdd-list" id="asSubjectList"></div>
                </div>
              </div>
              <select id="asSubject" style="display:none"></select>
            </div>

            <!-- Batch: custom searchable dropdown -->
            <div class="as-fcell" style="flex:1.4 1 0">
              <div class="as-fcell-label">Batch</div>
              <div class="as-cdd" id="asBatchDd">
                <button type="button" class="as-cdd-trigger" id="asBatchTrigger">
                  <span class="as-cdd-val placeholder" id="asBatchVal">— Select Batch —</span>
                  <svg class="as-cdd-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="as-cdd-panel" id="asBatchPanel">
                  <div class="as-cdd-search-wrap">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input class="as-cdd-search" id="asBatchSearch" type="text" placeholder="Search batches…" autocomplete="off"/>
                  </div>
                  <div class="as-cdd-list" id="asBatchList"></div>
                </div>
              </div>
              <select id="asBatch" style="display:none"><option value="">— Select Batch —</option></select>
            </div>

            <!-- Month: custom multi-select dropdown -->
            <div class="as-fcell" style="flex:1.3 1 0">
              <div class="as-fcell-label">Month</div>
              <div class="as-cdd" id="asMonthDd">
                <button type="button" class="as-cdd-trigger" id="asMonthTrigger">
                  <span class="as-cdd-val placeholder" id="asMonthVal">Select a batch first…</span>
                  <svg class="as-cdd-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="as-cdd-panel" id="asMonthPanel">
                  <div class="as-cdd-list" id="asMonthList">
                    <div class="as-cdd-empty">Select a batch first…</div>
                  </div>
                  <div class="as-cdd-footer">
                    <button type="button" class="as-cdd-footer-btn" id="asMonthAll">All</button>
                    <button type="button" class="as-cdd-footer-btn" id="asMonthNone">None</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="as-factions">
              <button class="as-filter-apply" id="asApplyBtn">Apply Filter</button>
              <button class="as-filter-clear" id="asClearBtn">Clear</button>
            </div>

          </div>

          <!-- Applied chips row (shown after apply) -->
          <div style="padding:0 14px 10px;display:flex;gap:6px;flex-wrap:wrap" id="asAppliedChipsWrap">
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

  // ═══════════════════════════════════════════════════
  // Custom Dropdown Helper (_makeCdd)
  // mode: 'single' | 'multi'
  // opts: [{ value, label }]
  // onChange(value|Set) called on selection change
  // Returns { setValue(v), setOpts(arr), disable(bool), close() }
  // ═══════════════════════════════════════════════════
  function _makeCdd({ triggerId, panelId, searchId, listId, valId, mode = 'single', placeholder = 'Select…', onClose } = {}) {
    const trigger = container.querySelector('#' + triggerId);
    const panel   = container.querySelector('#' + panelId);
    const searchEl= searchId ? container.querySelector('#' + searchId) : null;
    const listEl  = container.querySelector('#' + listId);
    const valEl   = container.querySelector('#' + valId);

    let _opts     = []; // [{ value, label }]
    let _selected = mode === 'multi' ? new Set() : ''; // single: string, multi: Set
    let _open     = false;

    const CHECKSVG = `<svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><polyline points="2 6 5 9 10 3"/></svg>`;

    function _updateTriggerLabel() {
      if (mode === 'single') {
        const opt = _opts.find(o => o.value === _selected);
        if (opt) {
          valEl.textContent = opt.label;
          valEl.classList.remove('placeholder');
        } else {
          valEl.textContent = placeholder;
          valEl.classList.add('placeholder');
        }
      } else {
        const count = _selected.size;
        if (count === 0) {
          valEl.textContent = placeholder;
          valEl.classList.add('placeholder');
        } else if (count === _opts.length && count > 0) {
          valEl.textContent = 'All months';
          valEl.classList.remove('placeholder');
        } else {
          valEl.textContent = count + ' month' + (count > 1 ? 's' : '') + ' selected';
          valEl.classList.remove('placeholder');
        }
      }
    }

    function _renderList(filterText = '') {
      const q = filterText.trim().toLowerCase();
      listEl.innerHTML = '';
      const visible = _opts.filter(o => !q || o.label.toLowerCase().includes(q));
      if (!visible.length) {
        listEl.innerHTML = '<div class="as-cdd-empty">No results</div>';
        return;
      }
      visible.forEach(o => {
        const item = document.createElement('div');
        item.className = 'as-cdd-item' + (_isSelected(o.value) ? ' selected' : '');
        item.dataset.value = o.value;
        if (mode === 'multi') {
          item.innerHTML = `<span class="as-cdd-item-check">${CHECKSVG}</span>${o.label}`;
        } else {
          item.textContent = o.label;
        }
        item.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); _pick(o.value); });
        listEl.appendChild(item);
      });
    }

    function _isSelected(v) {
      return mode === 'multi' ? _selected.has(v) : _selected === v;
    }

    function _pick(v) {
      if (mode === 'single') {
        _selected = _selected === v ? '' : v;
        _close();
      } else {
        if (_selected.has(v)) _selected.delete(v); else _selected.add(v);
        _renderList(searchEl?.value || '');
      }
      _updateTriggerLabel();
      if (onClose) onClose(_selected);
    }

    function _position() {
      const r = trigger.getBoundingClientRect();
      const w = Math.max(r.width, 200);
      panel.style.width = w + 'px';
      // try below first
      let top  = r.bottom + 4;
      let left = r.left;
      if (top + 280 > window.innerHeight) top = r.top - 4 - Math.min(280, panel.offsetHeight || 220);
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      panel.style.top  = top  + 'px';
      panel.style.left = left + 'px';
    }

    function _open_panel() {
      if (trigger.classList.contains('disabled')) return;
      _open = true;
      _renderList('');
      if (searchEl) { searchEl.value = ''; }
      panel.classList.add('open');
      trigger.classList.add('open');
      requestAnimationFrame(() => { _position(); if (searchEl) searchEl.focus(); });
    }

    function _close() {
      _open = false;
      panel.classList.remove('open');
      trigger.classList.remove('open');
    }

    trigger.addEventListener('click', e => { e.stopPropagation(); _open ? _close() : _open_panel(); });
    if (searchEl) {
      searchEl.addEventListener('input', () => _renderList(searchEl.value));
      searchEl.addEventListener('keydown', e => { if (e.key === 'Escape') _close(); });
    }
    window.addEventListener('scroll', () => { if (_open) _position(); }, true);
    window.addEventListener('resize', () => { if (_open) _position(); });
    document.addEventListener('mousedown', e => {
      if (!_open) return;
      // Use composedPath so detached nodes (after innerHTML reset) still work correctly
      const path = e.composedPath ? e.composedPath() : [];
      if (!path.includes(panel) && !path.includes(trigger)) _close();
    });

    return {
      getValue()   { return _selected; },
      setValue(v)  {
        _selected = mode === 'multi' ? new Set(v) : (v || '');
        _updateTriggerLabel();
        if (_open) _renderList(searchEl?.value || '');
      },
      setOpts(arr) {
        _opts = arr;
        _selected = mode === 'multi' ? new Set([..._selected].filter(v => arr.some(o => o.value === v))) : (arr.some(o => o.value === _selected) ? _selected : '');
        _updateTriggerLabel();
        if (_open) _renderList(searchEl?.value || '');
      },
      disable(yes) {
        if (yes) { trigger.classList.add('disabled'); _close(); }
        else      trigger.classList.remove('disabled');
      },
      close() { _close(); },
      selectAll() { _selected = new Set(_opts.map(o => o.value)); _updateTriggerLabel(); if (_open) _renderList(); },
      selectNone(){ _selected = new Set(); _updateTriggerLabel(); if (_open) _renderList(); },
    };
  }

  // ── Populate campus ────────────────────────────────────────
  const campSel = container.querySelector('#asCampus');
  _get('campuses').forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.campusName;
    campSel.appendChild(o);
  });

  // ── Build custom dropdowns ─────────────────────────────────
  const _subjDd = _makeCdd({
    triggerId: 'asSubjectTrigger', panelId: 'asSubjectPanel',
    searchId: 'asSubjectSearch', listId: 'asSubjectList', valId: 'asSubjectVal',
    mode: 'single', placeholder: '— Select Discipline —',
    onClose: (v) => { _subjectId = v; container.querySelector('#asSubject').value = v; _refreshBatch(); }
  });

  const _batchDd = _makeCdd({
    triggerId: 'asBatchTrigger', panelId: 'asBatchPanel',
    searchId: 'asBatchSearch', listId: 'asBatchList', valId: 'asBatchVal',
    mode: 'single', placeholder: '— Select Batch —',
    onClose: (v) => {
      _batchId = v;
      const sel = container.querySelector('#asBatch');
      sel.value = v;
      _refreshMonths();
    }
  });

  const _monthDd = _makeCdd({
    triggerId: 'asMonthTrigger', panelId: 'asMonthPanel',
    searchId: null, listId: 'asMonthList', valId: 'asMonthVal',
    mode: 'multi', placeholder: 'Select a batch first…',
    onClose: (set) => { _selMonths = set; }
  });

  // Month All / None buttons
  container.querySelector('#asMonthAll')?.addEventListener('click', () => { _monthDd.selectAll(); _selMonths = _monthDd.getValue(); });
  container.querySelector('#asMonthNone')?.addEventListener('click', () => { _monthDd.selectNone(); _selMonths = _monthDd.getValue(); });

  // ── Cascade helpers ────────────────────────────────────────
  function _refreshDisc() {
    _campusId = campSel.value;
    const discSel = container.querySelector('#asDisc');
    const prev    = discSel.value;
    discSel.innerHTML = '<option value="">All</option>';
    _get('disciplines').forEach(d => {
      const o = document.createElement('option');
      o.value = d.id;
      o.textContent = d.abbreviation || d.name || d.fullName || '';
      discSel.appendChild(o);
    });
    discSel.value = prev;
    _refreshSubject();
  }

  function _refreshSubject() {
    _discId = container.querySelector('#asDisc').value;

    if (!_discId) {
      _subjDd.setOpts([{ value: '', label: 'All' }]);
      _subjDd.setValue('');
      _subjDd.disable(true);
      _subjectId = '';
    } else {
      _subjDd.disable(false);
      const levels   = (_get('levels') || []).filter(l => l.disciplineId === _discId);
      const levelIds = levels.map(l => l.id);
      const subjects = (_get('subjects') || [])
        .filter(s => levelIds.includes(s.levelId) && !s.isArchived)
        .sort((a, b) => (a.subjectCode || '').localeCompare(b.subjectCode || ''));
      const opts = [{ value: '', label: 'All Subjects' }, ...subjects.map(s => ({ value: s.id, label: s.subjectCode || s.subjectName || '' }))];
      _subjDd.setOpts(opts);
      if (!opts.find(o => o.value === _subjectId)) { _subjectId = ''; _subjDd.setValue(''); }
    }
    container.querySelector('#asSubject').value = _subjectId;
    _refreshSession();
  }

  function _refreshSession() {
    _session = '';
    const sessSel = container.querySelector('#asSession');
    const prev    = sessSel.value;
    let batches = _get('batches');
    if (_campusId) batches = batches.filter(b => b.campusId     === _campusId);
    if (_discId)   batches = batches.filter(b => b.disciplineId === _discId);
    const sessions = [...new Set(batches.map(b => b.sessionPeriod).filter(Boolean))].sort().reverse();
    sessSel.innerHTML = '<option value="">All</option>';
    sessions.forEach(s => {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      if (s === prev) o.selected = true;
      sessSel.appendChild(o);
    });
    _refreshBatch();
  }

  function _refreshBatch() {
    _session   = container.querySelector('#asSession').value;
    _subjectId = container.querySelector('#asSubject').value;

    let batches = _get('batches');
    if (_campusId)  batches = batches.filter(b => b.campusId      === _campusId);
    if (_discId)    batches = batches.filter(b => b.disciplineId  === _discId);
    if (_session)   batches = batches.filter(b => b.sessionPeriod === _session);

    if (_subjectId) {
      const subj = (_get('subjects') || []).find(s => s.id === _subjectId);
      if (subj?.subjectCode) {
        const code = subj.subjectCode.toLowerCase();
        batches = batches.filter(b => (b.batchName || '').toLowerCase().includes(code));
      }
    }

    const opts = [{ value: '', label: '— Select Batch —' }, ...batches.map(b => ({ value: b.id, label: b.batchName || '' }))];
    const prevBatchId = _batchId;
    _batchDd.setOpts(opts);
    if (!opts.find(o => o.value === prevBatchId)) { _batchId = ''; _batchDd.setValue(''); container.querySelector('#asBatch').value = ''; }
    _refreshMonths();
  }

  function _refreshMonths() {
    _batchId = container.querySelector('#asBatch').value || _batchDd.getValue();
    _selMonths = new Set();

    if (!_batchId) {
      _monthDd.setOpts([]);
      _monthDd.disable(true);
      return;
    }
    _monthDd.disable(false);

    const batch = AppState.findById('batches', _batchId);
    let months = [];
    try {
      const assignment = getAssignmentForBatch(_batchId);
      const lpDates = (assignment?.rows || []).filter(r => r.date).map(r => r.date);
      if (lpDates.length) {
        const mkSet = new Set(lpDates.map(d => d.slice(0, 7)));
        months = [...mkSet].sort();
      }
    } catch(e) { /* no LP */ }

    if (!months.length) {
      if (batch?.startDate && batch?.endDate) {
        months = _monthsBetween(batch.startDate, batch.endDate);
      }
    }

    if (!months.length) {
      _monthDd.setOpts([]);
      return;
    }

    const opts = months.map(mk => {
      const [y, m] = mk.split('-');
      return { value: mk, label: MON_SHORT[parseInt(m)-1] + ' ' + y };
    });
    _monthDd.setOpts(opts);
    _monthDd.selectAll();
    _selMonths = _monthDd.getValue();
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
    if (f.subjectId) {
      const s = (_get('subjects') || []).find(s => s.id === f.subjectId);
      if (s) { chips.push(make(s.subjectCode || s.subjectName || '', 'var(--blue)')); count++; }
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

  // ── Wire standard filter events ────────────────────────────
  campSel.addEventListener('change', _refreshDisc);
  container.querySelector('#asDisc').addEventListener('change', _refreshSubject);
  container.querySelector('#asSession').addEventListener('change', _refreshBatch);

  _refreshDisc();

  // ── Clear ──────────────────────────────────────────────────────────
  container.querySelector('#asClearBtn').addEventListener('click', () => {
    campSel.value = '';
    _campusId = _discId = _subjectId = _batchSearch = _session = _batchId = '';
    _selMonths = new Set();
    _applied = null;
    _subjDd.setValue(''); _subjDd.disable(true);
    _batchDd.setValue('');
    _monthDd.setOpts([]); _monthDd.disable(true);
    container.querySelector('#asSubject').value = '';
    container.querySelector('#asBatch').value   = '';
    _refreshDisc();
    _renderAppliedChips();
    container.querySelector('#asOutput').innerHTML = '';
    _filterOpen = true;
    container.querySelector('#asFilterBody').classList.add('open');
    container.querySelector('#asFilterArrow').classList.add('open');
  });

  // ── Apply ──────────────────────────────────────────────────────────
  container.querySelector('#asApplyBtn').addEventListener('click', () => {
    _batchId   = _batchDd.getValue() || container.querySelector('#asBatch').value;
    _subjectId = _subjDd.getValue()  || container.querySelector('#asSubject').value;
    _selMonths = _monthDd.getValue();
    if (!_batchId) {
      container.querySelector('#asOutput').innerHTML = `
        <div style="padding:32px;text-align:center;color:var(--t3);font-size:13px;
                    border:1px dashed var(--border2);border-radius:var(--r-lg)">
          Please select a batch first.
        </div>`;
      return;
    }
    _applied = { campusId: _campusId, discId: _discId, subjectId: _subjectId, session: _session, batchId: _batchId };
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
  const teacher = batch?.teacherId ? AppState.findById('teachers', batch.teacherId) : null;
  const teacherName = teacher
    ? [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || teacher.teacherName || teacher.name || ''
    : (batch?.teacherName || '');

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
  const dates    = (selMonths.length > 0)
    ? allDates.filter(d => monthSet.has(d.slice(0,7)))
    : allDates;

  if (!dates.length) {
    output.innerHTML = `
      <div style="padding:32px;text-align:center;color:var(--t3);font-size:13px;
                  border:1px dashed var(--border2);border-radius:var(--r-lg)">
        No class dates found for the selected months. Please select at least one month with class dates.
      </div>`;
    return;
  }

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
  const _DEFAULT_HIDDEN_SHEET = ['fatherName', 'email'];
  function _getAsColPrefs() {
    try {
      const r = AppState.get(AS_COL_KEY);
      if (r && Array.isArray(r.hidden)) return r;
    } catch(e){}
    return { hidden: [..._DEFAULT_HIDDEN_SHEET] };
  }

  const colPrefs        = _getAsColPrefs();
  const showCnic        = !colPrefs.hidden.includes('cnic');
  const showFatherName  = !colPrefs.hidden.includes('fatherName');
  const showStudentPhone= !colPrefs.hidden.includes('studentPhone');
  const showGuardianPhone=!colPrefs.hidden.includes('guardianPhone');
  const showEmail       = !colPrefs.hidden.includes('email');
  const showP           = !colPrefs.hidden.includes('present');
  const showA           = !colPrefs.hidden.includes('absent');
  const showL           = !colPrefs.hidden.includes('leave');
  const showPct         = !colPrefs.hidden.includes('percent');
  const totalCols       = (showP?1:0) + (showA?1:0) + (showL?1:0);

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
                 border-right:${!showCnic&&!showFatherName&&!showStudentPhone&&!showGuardianPhone&&!showEmail?'2px':'1px'} solid var(--border);font-weight:700;
                 color:var(--t1);white-space:nowrap;
                 position:sticky;left:36px;background:inherit;z-index:1;min-width:160px">
        ${stu.studentName || '—'}
      </td>
      ${showCnic ? `<td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-size:11px;color:var(--t2);white-space:nowrap;font-family:var(--font-mono)">${stu.cnic||'—'}</td>` : ''}
      ${showFatherName ? `<td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:left;
                 font-size:11px;color:var(--t2);white-space:nowrap">${stu.fatherName||'—'}</td>` : ''}
      ${showStudentPhone ? `<td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-size:11px;color:var(--t2);white-space:nowrap">${stu.studentPhone||'—'}</td>` : ''}
      ${showGuardianPhone ? `<td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-size:11px;color:var(--t2);white-space:nowrap">${stu.guardianPhone||'—'}</td>` : ''}
      ${showEmail ? `<td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:2px solid var(--border);text-align:left;
                 font-size:11px;color:var(--t2);white-space:nowrap">${stu.email||'—'}</td>` : ''}
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
            <div class="as-col-mgr-foot">Toggle student info &amp; summary columns</div>
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
                     border-right:${!showCnic&&!showFatherName&&!showStudentPhone&&!showGuardianPhone&&!showEmail?'2px':'1px'} solid var(--border);border-bottom:1px solid var(--border);
                     position:sticky;left:36px;z-index:4">Student Name</th>
                 ${showCnic ? `<th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);min-width:130px;
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border)">CNIC</th>` : ''}
                 ${showFatherName ? `<th rowspan="2" style="padding:8px 10px;text-align:left;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);min-width:140px;
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border)">Father Name</th>` : ''}
                 ${showStudentPhone ? `<th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);min-width:120px;
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border)">Student Phone</th>` : ''}
                 ${showGuardianPhone ? `<th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);min-width:120px;
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border)">Guardian Phone</th>` : ''}
                 ${showEmail ? `<th rowspan="2" style="padding:8px 10px;text-align:left;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);min-width:160px;
                     border-right:2px solid var(--border);border-bottom:1px solid var(--border)">Email</th>` : ''}
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

  // ── Determine which student-info columns to include (same as current view prefs)
  const AS_COL_KEY = 'as_col_prefs';
  const _DEFAULT_HIDDEN_CSV = ['fatherName', 'email'];
  let colPrefsCSV = { hidden: [..._DEFAULT_HIDDEN_CSV] };
  try { const r = AppState.get(AS_COL_KEY); if (r && Array.isArray(r.hidden)) colPrefsCSV = r; } catch(e){}
  const csvShowCnic         = !colPrefsCSV.hidden.includes('cnic');
  const csvShowFatherName   = !colPrefsCSV.hidden.includes('fatherName');
  const csvShowStudentPhone = !colPrefsCSV.hidden.includes('studentPhone');
  const csvShowGuardianPhone= !colPrefsCSV.hidden.includes('guardianPhone');
  const csvShowEmail        = !colPrefsCSV.hidden.includes('email');
  const csvShowP            = !colPrefsCSV.hidden.includes('present');
  const csvShowA            = !colPrefsCSV.hidden.includes('absent');
  const csvShowL            = !colPrefsCSV.hidden.includes('leave');
  const csvShowPct          = !colPrefsCSV.hidden.includes('percent');

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

  const infoHeaders = [
    ...(csvShowCnic         ? ['CNIC']           : []),
    ...(csvShowFatherName   ? ['Father Name']    : []),
    ...(csvShowStudentPhone ? ['Student Phone']  : []),
    ...(csvShowGuardianPhone? ['Guardian Phone'] : []),
    ...(csvShowEmail        ? ['Email']          : []),
  ];
  const summaryHeaders = [
    ...(csvShowP   ? ['P'] : []),
    ...(csvShowA   ? ['A'] : []),
    ...(csvShowL   ? ['L'] : []),
    ...(csvShowPct ? ['%'] : []),
  ];
  const headers = ['#', 'Student Name', ...infoHeaders, ...dateHeaders, ...summaryHeaders];

  const csvRows = students.map((stu, i) => {
    let p = 0, a = 0, l = 0;
    const cells = dates.map(d => {
      const s = recMap[`${stu.id}_${d}`] || '';
      if (s === 'P') p++; else if (s === 'A') a++; else if (s === 'L') l++;
      return s;
    });
    const total = p + a + l;
    const pct   = total > 0 ? Math.round((p / total) * 100) + '%' : '';
    const infoCells = [
      ...(csvShowCnic         ? [stu.cnic          || ''] : []),
      ...(csvShowFatherName   ? [stu.fatherName    || ''] : []),
      ...(csvShowStudentPhone ? [stu.studentPhone  || ''] : []),
      ...(csvShowGuardianPhone? [stu.guardianPhone || ''] : []),
      ...(csvShowEmail        ? [stu.email         || ''] : []),
    ];
    const summaryCells = [
      ...(csvShowP   ? [p]   : []),
      ...(csvShowA   ? [a]   : []),
      ...(csvShowL   ? [l]   : []),
      ...(csvShowPct ? [pct] : []),
    ];
    return [i+1, stu.studentName || '—', ...infoCells, ...cells, ...summaryCells]
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
function _exportPDF({ batch, disc, campus, students, dates, byMonth, monthLabel, selMonths }, output) {
  if (!students.length || !dates.length) { alert('No data to export.'); return; }

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

  // ── Which student-info columns are currently visible
  const AS_COL_KEY = 'as_col_prefs';
  const _DEF_HIDDEN = ['fatherName','email'];
  let colPrefsPDF = { hidden: [..._DEF_HIDDEN] };
  try { const r = AppState.get(AS_COL_KEY); if (r && Array.isArray(r.hidden)) colPrefsPDF = r; } catch(e){}
  const pdfShowCnic          = !colPrefsPDF.hidden.includes('cnic');
  const pdfShowFatherName    = !colPrefsPDF.hidden.includes('fatherName');
  const pdfShowStudentPhone  = !colPrefsPDF.hidden.includes('studentPhone');
  const pdfShowGuardianPhone = !colPrefsPDF.hidden.includes('guardianPhone');
  const pdfShowEmail         = !colPrefsPDF.hidden.includes('email');
  const pdfShowP             = !colPrefsPDF.hidden.includes('present');
  const pdfShowA             = !colPrefsPDF.hidden.includes('absent');
  const pdfShowL             = !colPrefsPDF.hidden.includes('leave');
  const pdfShowPct           = !colPrefsPDF.hidden.includes('percent');

  // ── Attendance record map
  const batchRecs = (AppState.get('attendance') || []).filter(r => r.batchId === batch?.id);
  const recMap    = {};
  batchRecs.forEach(r => { recMap[`${r.studentId}_${r.date}`] = r.status; });

  const DAY_S = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const MON_F = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];

  // ── Build one <table> per month
  const monthKeys = Object.keys(byMonth).sort();

  function buildMonthTable(mk) {
    const mDates  = byMonth[mk];
    const [y, m]  = mk.split('-');
    const mLabel  = MON_F[parseInt(m)-1] + ' ' + y;

    // Info col widths — auto so table distributes space smartly
    const infoColsHTML = [
      pdfShowCnic          ? '<col style="min-width:70px;width:auto"/>'  : '',
      pdfShowFatherName    ? '<col style="min-width:70px;width:auto"/>'  : '',
      pdfShowStudentPhone  ? '<col style="min-width:62px;width:auto"/>'  : '',
      pdfShowGuardianPhone ? '<col style="min-width:62px;width:auto"/>'  : '',
      pdfShowEmail         ? '<col style="min-width:88px;width:auto"/>'  : '',
    ].join('');

    const summCols = (pdfShowP?1:0)+(pdfShowA?1:0)+(pdfShowL?1:0)+(pdfShowPct?1:0);

    // Header row 1 — month span + Total span
    const dateColCount = mDates.length;
    const infoSpan = [pdfShowCnic,pdfShowFatherName,pdfShowStudentPhone,pdfShowGuardianPhone,pdfShowEmail].filter(Boolean).length;

    let hdr1 = `<th rowspan="2" class="h-no h-name" colspan="${1 + (infoSpan > 0 ? 0 : 0)}">#</th>
                <th rowspan="2" class="h-no h-name" style="text-align:left;min-width:110px">Student Name</th>`;
    if (pdfShowCnic)          hdr1 += `<th rowspan="2" class="h-no">CNIC</th>`;
    if (pdfShowFatherName)    hdr1 += `<th rowspan="2" class="h-no" style="text-align:left">Father Name</th>`;
    if (pdfShowStudentPhone)  hdr1 += `<th rowspan="2" class="h-no">Stu. Phone</th>`;
    if (pdfShowGuardianPhone) hdr1 += `<th rowspan="2" class="h-no">Grd. Phone</th>`;
    if (pdfShowEmail)         hdr1 += `<th rowspan="2" class="h-no" style="text-align:left">Email</th>`;
    hdr1 += `<th colspan="${dateColCount}" class="h-month">${mLabel}</th>`;
    if (summCols > 0) hdr1 += `<th colspan="${summCols}" class="h-no">Total</th>`;

    // Header row 2 — individual dates
    const hdr2 = mDates.map(d => {
      const dt   = new Date(d + 'T00:00:00');
      const dayN = dt.getDay();
      const isFri = dayN === 5, isSat = dayN === 6;
      return `<th class="h-date${isFri?' h-fri':isSat?' h-sat':''}">${DAY_S[dayN]}<br>${dt.getDate()}</th>`;
    }).join('') +
    (pdfShowP   ? `<th class="h-no h-p">P</th>`  : '') +
    (pdfShowA   ? `<th class="h-no h-a">A</th>`  : '') +
    (pdfShowL   ? `<th class="h-no h-l">L</th>`  : '') +
    (pdfShowPct ? `<th class="h-no h-pct">%</th>` : '');

    // Data rows
    const rowsHTML = students.map((stu, idx) => {
      let p = 0, a = 0, l = 0;
      const cells = mDates.map(d => {
        const s = recMap[`${stu.id}_${d}`] || '';
        if (s === 'P') p++; else if (s === 'A') a++; else if (s === 'L') l++;
        const cls = s === 'P' ? 'att-p' : s === 'A' ? 'att-a' : s === 'L' ? 'att-l' : 'att-empty';
        return `<td class="${cls}">${s}</td>`;
      }).join('');

      const total    = p + a + l;
      const pct      = total > 0 ? Math.round((p / total) * 100) : null;
      const rowCls   = idx % 2 === 0 ? '' : ' class="alt"';

      return `<tr${rowCls}>
        <td class="t-num">${idx+1}</td>
        <td class="t-name">${stu.studentName || '—'}</td>
        ${pdfShowCnic          ? `<td class="t-info mono">${stu.cnic||'—'}</td>`         : ''}
        ${pdfShowFatherName    ? `<td class="t-info t-left">${stu.fatherName||'—'}</td>` : ''}
        ${pdfShowStudentPhone  ? `<td class="t-info">${stu.studentPhone||'—'}</td>`      : ''}
        ${pdfShowGuardianPhone ? `<td class="t-info">${stu.guardianPhone||'—'}</td>`     : ''}
        ${pdfShowEmail         ? `<td class="t-info t-left">${stu.email||'—'}</td>`      : ''}
        ${cells}
        ${pdfShowP   ? `<td class="t-sum t-p">${total>0?p:''}</td>`                              : ''}
        ${pdfShowA   ? `<td class="t-sum t-a">${total>0?a:''}</td>`                              : ''}
        ${pdfShowL   ? `<td class="t-sum t-l">${total>0?l:''}</td>`                              : ''}
        ${pdfShowPct ? `<td class="t-sum t-pct${pct!==null&&pct<75?' t-fail':''}">${pct!==null?pct+'%':''}</td>` : ''}
      </tr>`;
    }).join('');

    return `
      <div class="month-block">
        <table>
          <colgroup>
            <col style="width:24px"/>
            <col style="min-width:100px;width:auto"/>
            ${infoColsHTML}
            ${mDates.map(() => '<col class="att-col"/>').join('')}
            ${pdfShowP   ? '<col style="width:22px"/>' : ''}
            ${pdfShowA   ? '<col style="width:22px"/>' : ''}
            ${pdfShowL   ? '<col style="width:22px"/>' : ''}
            ${pdfShowPct ? '<col style="width:30px"/>' : ''}
          </colgroup>
          <thead>
            <tr>${hdr1}</tr>
            <tr>${hdr2}</tr>
          </thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>`;
  }

  const _footerHtml = '<div class="page-footer" style="padding:5px 10px;border-top:1px solid #000;display:flex;justify-content:flex-end;font-size:8px;color:#94a3b8;margin-top:4px">Powered by <strong style="color:#2563eb;margin-left:4px">Learnomist</strong></div>';
  const tablesHTML = monthKeys.map(mk => buildMonthTable(mk)).join('') + _footerHtml;

  // Build full HTML, open as Blob URL — avoids blank-print race condition with document.write
  const _htmlStr = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8"/>
    <title>Attendance Sheet — ${batch?.batchName||''}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:'Segoe UI',Arial,sans-serif;font-size:8.5px;color:#1e293b;background:#fff}

      /* ── Page header (repeated on every print page via position) */
      .page-header{
        display:flex;justify-content:space-between;align-items:flex-start;
        border-bottom:2.5px solid #2563eb;padding:8px 10px 7px;
        margin-bottom:0;
      }
      .ph-title{font-size:13px;font-weight:700;color:#1e40af}
      .ph-sub{font-size:8px;color:#64748b;margin-top:2px}
      .ph-right{text-align:right;font-size:8px;color:#64748b;line-height:1.6}

      /* ── Month block — each starts on its own print page */
      .month-block{
        padding:8px 10px 10px;
      }
      .month-block + .month-block{
        page-break-before:always;
        break-before:page;
      }

      /* ── Table base */
      table{border-collapse:collapse;width:100%;table-layout:auto}
      th,td{border:1px solid #000;padding:2px 2px;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

      /* ── Header types */
      .h-no{background:#f1f5f9;font-weight:700;text-align:center;font-size:7.5px;color:#475569}
      .h-name{text-align:left}
      .h-month{background:#dbeafe;color:#1e40af;font-weight:700;text-align:center;font-size:8px}
      .h-date{background:#f8fafc;font-weight:700;text-align:center;font-size:7px;color:#64748b;padding:2px 1px;width:18px}
      .h-fri{color:#2563eb}
      .h-sat{color:#d97706}
      .h-p{color:#16a34a}.h-a{color:#dc2626}.h-l{color:#d97706}.h-pct{color:#7c3aed}

      /* ── Attendance date col — very narrow so teacher can handwrite */
      col.att-col{width:18px;max-width:22px}

      /* ── Data cells */
      .t-num{text-align:center;color:#94a3b8;font-size:7.5px;font-family:monospace}
      .t-name{font-weight:600;color:#0f172a;font-size:8px;text-align:left;padding-left:3px}
      .t-info{text-align:center;color:#1e293b;font-size:9px;font-weight:600}
      .t-left{text-align:left;padding-left:3px;color:#1e293b;font-size:9px;font-weight:600}
      .mono{font-family:monospace;letter-spacing:-.3px;font-size:8.5px;font-weight:600}
      .alt td{background:#f8fafc}

      /* ── Attendance value cells */
      .att-p{text-align:center;font-weight:700;color:#16a34a}
      .att-a{text-align:center;font-weight:700;color:#dc2626}
      .att-l{text-align:center;font-weight:700;color:#d97706}
      .att-empty{text-align:center;color:#e2e8f0}

      /* ── Summary cells */
      .t-sum{text-align:center;font-weight:700;font-size:8px}
      .t-p{color:#16a34a}.t-a{color:#dc2626}.t-l{color:#d97706}
      .t-pct{color:#7c3aed}.t-fail{color:#dc2626}

      /* ── Footer */
      .page-footer{
        padding:5px 10px;border-top:1px solid #000;
        display:flex;justify-content:flex-end;font-size:8px;color:#94a3b8;
        margin-top:4px;
        page-break-before:avoid;break-before:avoid;
        page-break-after:avoid;break-after:avoid;
      }

      /* ── Print settings */
      @media print{
        .no-print{display:none}
        @page{size:A4 landscape;margin:5mm 6mm}
        html,body{height:auto}
        /* repeat header on every page */
        thead{display:table-header-group}
      }

      /* ── Screen preview */
      @media screen{
        body{background:#e5e7eb;padding:12px}
        .month-block{background:#fff;border-radius:6px;margin-bottom:16px;
          box-shadow:0 1px 4px rgba(0,0,0,.12)}
        .page-header{background:#fff;border-radius:6px 6px 0 0;
          box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:8px}
      }
    </style>
  </head><body>

    <div class="page-header">
      <div>
        <div class="ph-title">Attendance Sheet — ${batch?.batchName||''}</div>
        <div class="ph-sub">${disc?.abbreviation||''}${campus?' · '+campus.campusName:''} &nbsp;·&nbsp; ${students.length} student${students.length!==1?'s':''} &nbsp;·&nbsp; ${monthLabel}${teacherName?' &nbsp;·&nbsp; '+teacherName:''}</div>
      </div>
      <div class="ph-right"><strong>${dateStr}</strong><div>${timeStr}</div></div>
    </div>

    ${tablesHTML}


    <div class="no-print" style="position:fixed;bottom:16px;right:16px">
      <button onclick="window.print()" style="padding:8px 22px;background:#2563eb;color:#fff;
        border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;
        box-shadow:0 2px 8px rgba(37,99,235,.4)">
        🖨️ Print / Save as PDF
      </button>
    </div>
  </body></html>`;

  const _blob    = new Blob([_htmlStr], { type: 'text/html;charset=utf-8' });
  const _blobUrl = URL.createObjectURL(_blob);
  const _win     = window.open(_blobUrl, '_blank');
  if (_win) {
    _win.addEventListener('load', () => {
      setTimeout(() => { _win.print(); URL.revokeObjectURL(_blobUrl); }, 300);
    }, { once: true });
  } else {
    // popup blocked — fallback to download
    const _a = document.createElement('a');
    _a.href = _blobUrl; _a.download = 'Attendance-' + (batch?.batchName||'Sheet') + '.html';
    document.body.appendChild(_a); _a.click(); document.body.removeChild(_a);
    setTimeout(() => URL.revokeObjectURL(_blobUrl), 3000);
  }
}

// ── Column Manager ─────────────────────────────────────────────
function _wireAsColManager(output, batchId, selMonths) {
  const btn   = output.querySelector('#asColMgrBtn');
  const panel = output.querySelector('#asColMgrPanel');
  const list  = output.querySelector('#asColMgrList');
  if (!btn || !panel || !list) return;

  const AS_COL_KEY = 'as_col_prefs';
  const AS_COLS = [
    { key: 'cnic',          label: 'CNIC',           defaultHidden: false },
    { key: 'fatherName',    label: 'Father Name',    defaultHidden: true  },
    { key: 'studentPhone',  label: 'Student Phone',  defaultHidden: false },
    { key: 'guardianPhone', label: 'Guardian Phone', defaultHidden: false },
    { key: 'email',         label: 'Email',          defaultHidden: true  },
    { key: 'present', label: 'P (Present)', defaultHidden: false },
    { key: 'absent',  label: 'A (Absent)',  defaultHidden: false },
    { key: 'leave',   label: 'L (Leave)',   defaultHidden: false },
    { key: 'percent', label: '% Attendance', defaultHidden: false },
  ];
  const _DEFAULT_HIDDEN = AS_COLS.filter(c => c.defaultHidden).map(c => c.key);
  function _getPrefs() {
    try {
      const r = AppState.get(AS_COL_KEY);
      if (r && Array.isArray(r.hidden)) return r;
    } catch(e){}
    return { hidden: [..._DEFAULT_HIDDEN] };
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
