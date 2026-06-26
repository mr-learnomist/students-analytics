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

// ═══════════════════════════════════════════════════════════════
// PUBLIC MOUNT
// ═══════════════════════════════════════════════════════════════
export function mountAttendanceSheet(container, onBack) {

  // ── Snapshot state ─────────────────────────────────────────
  let _campusId      = '';
  let _discId        = '';
  let _session       = '';
  let _batchId       = '';
  let _selMonths     = new Set(); // selected month keys e.g. '2025-06'

  // ── Render shell ───────────────────────────────────────────
  container.innerHTML = `
    <!-- Back + title -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
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

    <!-- Filter card -->
    <div style="background:var(--surface2);border:1px solid var(--border);
                border-radius:var(--r-md);padding:16px 18px;margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;color:var(--t3);
                  letter-spacing:.06em;margin-bottom:12px">SELECT FILTER</div>

      <!-- Row 1: Campus · Discipline · Session · Batch -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.05em">CAMPUS</label>
          <select id="asCampus" class="filter-select" style="min-width:120px">
            <option value="">All Campuses</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.05em">DISCIPLINE</label>
          <select id="asDisc" class="filter-select" style="min-width:160px">
            <option value="">All Disciplines</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.05em">SESSION</label>
          <select id="asSession" class="filter-select" style="min-width:110px">
            <option value="">All Sessions</option>
          </select>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px">
          <label style="font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.05em">BATCH</label>
          <select id="asBatch" class="filter-select" style="min-width:200px">
            <option value="">— Select Batch —</option>
          </select>
        </div>
      </div>

      <!-- Row 2: Month chips (dynamic) -->
      <div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
        <label style="font-size:10px;font-weight:700;color:var(--t3);letter-spacing:.05em">MONTH</label>
        <div id="asMonthChips" style="display:flex;gap:6px;flex-wrap:wrap">
          <span style="font-size:12px;color:var(--t4);font-style:italic">Select a batch first…</span>
        </div>
      </div>

      <!-- Apply / Clear -->
      <div style="display:flex;gap:8px">
        <button id="asApplyBtn" style="height:34px;padding:0 20px;border-radius:var(--r-sm);
            border:none;background:var(--blue);color:#fff;font-size:13px;
            font-weight:600;cursor:pointer">
          Apply Filter
        </button>
        <button id="asClearBtn" style="height:34px;padding:0 14px;border-radius:var(--r-sm);
            border:1px solid var(--border2);background:var(--surface);
            color:var(--t2);font-size:13px;font-weight:500;cursor:pointer">
          Clear
        </button>
      </div>
    </div>

    <!-- Sheet output -->
    <div id="asOutput"></div>

    <style>
      .as-chip {
        display:inline-flex;align-items:center;gap:5px;
        padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;
        border:1px solid var(--border2);background:var(--surface);
        color:var(--t2);cursor:pointer;transition:all .15s;user-select:none;
      }
      .as-chip:hover  { border-color:var(--blue);color:var(--blue);background:var(--blue-dim); }
      .as-chip.active { border-color:var(--blue);color:var(--blue);background:var(--blue-dim); }
      .as-chip .chip-dot {
        width:7px;height:7px;border-radius:50%;
        background:var(--border2);transition:background .15s;
      }
      .as-chip.active .chip-dot { background:var(--blue); }
    </style>`;

  // ── Back ──────────────────────────────────────────────────
  container.querySelector('#asBack').addEventListener('click', onBack);

  // ── Populate campus dropdown ───────────────────────────────
  const campSel = container.querySelector('#asCampus');
  _get('campuses').forEach(c => {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = c.campusName;
    campSel.appendChild(o);
  });

  // ── Filter cascade helpers ─────────────────────────────────
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
    // Unique sessions from matching batches
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

    // Default: select all months
    months.forEach(mk => _selMonths.add(mk));

    chipsEl.innerHTML = months.map(mk => {
      const [y, m] = mk.split('-');
      return `<span class="as-chip active" data-month="${mk}">
        <span class="chip-dot"></span>
        ${MON_SHORT[parseInt(m)-1]} ${y}
      </span>`;
    }).join('');

    // Toggle chips
    chipsEl.querySelectorAll('.as-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const mk = chip.dataset.month;
        if (_selMonths.has(mk)) {
          _selMonths.delete(mk);
          chip.classList.remove('active');
        } else {
          _selMonths.add(mk);
          chip.classList.add('active');
        }
      });
    });
  }

  // ── Wire filter events ─────────────────────────────────────
  campSel.addEventListener('change', _refreshDisc);
  container.querySelector('#asDisc').addEventListener('change', _refreshSession);
  container.querySelector('#asSession').addEventListener('change', _refreshBatch);
  container.querySelector('#asBatch').addEventListener('change', _refreshMonths);

  // Initial cascade
  _refreshDisc();

  // ── Clear ──────────────────────────────────────────────────
  container.querySelector('#asClearBtn').addEventListener('click', () => {
    campSel.value = '';
    _campusId = _discId = _session = _batchId = '';
    _selMonths.clear();
    _refreshDisc();
    container.querySelector('#asOutput').innerHTML = '';
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

  // ── Student rows (blank cells for attendance entry) ────────
  const rows = students.map((stu, idx) => {
    let p = 0, a = 0, l = 0;
    const cells = dates.map(d => {
      const status  = recMap[`${stu.id}_${d}`] || '';
      if (status === 'P') p++;
      else if (status === 'A') a++;
      else if (status === 'L') l++;
      const mk     = d.slice(0,7);
      const isLast = byMonth[mk][byMonth[mk].length-1] === d;
      const borderR = isLast ? '2px solid var(--border)' : '1px solid var(--border2)';
      const color  = status === 'P' ? 'var(--green)'
                   : status === 'A' ? 'var(--red)'
                   : status === 'L' ? 'var(--yellow)'
                   : 'var(--t4)';
      return `<td style="text-align:center;padding:5px 2px;
                          border-bottom:1px solid var(--border);border-right:${borderR};
                          font-size:11.5px;font-weight:700;color:${color};
                          min-width:34px">
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
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--green)">${total > 0 ? p : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--red)">${total > 0 ? a : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--yellow)">${total > 0 ? l : ''}</td>
      <td style="padding:6px 8px;border-bottom:1px solid var(--border);
                 text-align:center;font-weight:800;font-size:12px;color:${pctColor}">
        ${pct !== null ? pct + '%' : ''}
      </td>
    </tr>`;
  }).join('');

  // ── Render output ──────────────────────────────────────────
  const monthLabel = selMonths.length
    ? selMonths.map(mk => { const [y,m]=mk.split('-'); return MON_SHORT[parseInt(m)-1]+' '+y; }).join(', ')
    : 'All Months';

  output.innerHTML = `
    <!-- Info bar -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
      <div>
        <div style="font-size:15px;font-weight:800;color:var(--t1)">${batch?.batchName || '—'}</div>
        <div style="font-size:12px;color:var(--t3);margin-top:2px">
          ${disc?.abbreviation||''}${campus?' · '+campus.campusName:''}
          · ${students.length} students · ${dates.length} class days · ${monthLabel}
        </div>
      </div>
      <button id="asPrintBtn" style="margin-left:auto;display:inline-flex;align-items:center;
          gap:6px;height:34px;padding:0 14px;border-radius:var(--r-sm);
          border:1px solid var(--border2);background:var(--surface2);
          color:var(--t2);font-size:12.5px;font-weight:600;cursor:pointer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>Print / PDF
      </button>
    </div>

    ${!dates.length
      ? `<div style="padding:32px;text-align:center;color:var(--t3);font-size:13px;
                     border:1px dashed var(--border2);border-radius:var(--r-lg)">
           No class dates found for the selected months.
           ${!_get('lecturePlans').length ? '<br><span style="font-size:11px">Tip: Assign a Lecture Plan to this batch to auto-populate dates.</span>' : ''}
         </div>`
      : `<div style="overflow-x:auto;overflow-y:visible;
                     border:1px solid var(--border);border-radius:var(--r-lg)">
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
                 <th colspan="3" style="padding:6px 8px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border2)">
                   Total
                 </th>
                 <th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-bottom:1px solid var(--border);min-width:48px">%</th>
               </tr>
               <tr>
                 ${dateHeaders}
                 <th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--green);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     min-width:30px">P</th>
                 <th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--red);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     min-width:30px">A</th>
                 <th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--yellow);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     min-width:30px">L</th>
               </tr>
             </thead>
             <tbody>${rows}</tbody>
           </table>
         </div>`
    }`;

  // ── Print ──────────────────────────────────────────────────
  output.querySelector('#asPrintBtn')?.addEventListener('click', () => {
    const table = output.querySelector('#asTable');
    if (!table) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <html><head>
        <title>Attendance Sheet — ${batch?.batchName||''}</title>
        <style>
          body{font-family:sans-serif;font-size:10px;margin:12px}
          table{border-collapse:collapse;width:100%}
          th,td{border:1px solid #ccc;padding:3px 5px;text-align:center}
          th{background:#f3f4f6}
          td:nth-child(2){text-align:left}
          @media print{body{margin:6px}}
        </style>
      </head><body>
        <h3 style="margin-bottom:6px">${batch?.batchName||''} — Attendance Sheet</h3>
        <p style="color:#666;margin-bottom:10px;font-size:9px">
          ${disc?.abbreviation||''}${campus?' · '+campus.campusName:''} · ${students.length} students
          · ${dates.length} days · ${monthLabel}
        </p>
        ${table.outerHTML}
      </body></html>`);
    win.document.close();
    win.print();
  });
}
