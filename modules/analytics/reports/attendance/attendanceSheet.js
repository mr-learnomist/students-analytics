// ============================================================
// modules/analytics/reports/attendance/attendanceSheet.js
// Report: Attendance Sheet
// Batch-wise daily attendance — student-wise P/A/L summary
// with percentage. Mirrors testResultSummary.js structure.
// ============================================================

import { AppState } from '../../../../utils/state.js';

// ── Constants ───────────────────────────────────────────────
const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Data helpers ────────────────────────────────────────────
function _getBatches()     { return AppState.get('batches')     || []; }
function _getCampuses()    { return AppState.get('campuses')    || []; }
function _getDisciplines() { return AppState.get('disciplines') || []; }
function _getEnrolments()  { return AppState.get('enrolments')  || []; }
function _getAttendance()  { return AppState.get('attendance')  || []; }

// ── Public mount ────────────────────────────────────────────
// container : DOM node to render into
// onBack    : callback — called when user clicks Back
export function mountAttendanceSheet(container, onBack) {
  const batches     = _getBatches();
  const campuses    = _getCampuses();
  const disciplines = _getDisciplines();
  const sessions    = [...new Set(batches.map(b => b.sessionPeriod).filter(Boolean))].sort().reverse();

  // ── Filter state ───────────────────────────────────────────
  let _session  = sessions[0] || '';
  let _campusId = '';
  let _discId   = '';
  let _batchId  = '';

  const sessOpts = sessions.map(s =>
    `<option value="${s}" ${s === _session ? 'selected' : ''}>${s}</option>`).join('');
  const campOpts = campuses.map(c =>
    `<option value="${c.id}">${c.campusName}</option>`).join('');
  const discOpts = disciplines.map(d =>
    `<option value="${d.id}">${d.abbreviation} — ${d.name}</option>`).join('');

  // ── Shell HTML ─────────────────────────────────────────────
  container.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <button id="asBack" style="
          display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;
          border-radius:var(--r-sm);border:1px solid var(--border2);background:var(--surface2);
          color:var(--t2);font-size:12.5px;font-weight:600;cursor:pointer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2.2">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
        Back
      </button>
      <div>
        <div style="font-size:16px;font-weight:700;color:var(--t1)">Attendance Sheet</div>
        <div style="font-size:12px;color:var(--t3);margin-top:1px">
          Batch-wise daily attendance — P / A / L summary
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px;
                padding:14px 16px;background:var(--surface2);border:1px solid var(--border);
                border-radius:var(--r-md)">
      <select id="asSession" class="filter-select" style="min-width:120px">
        <option value="">All Sessions</option>
        ${sessOpts}
      </select>
      <select id="asCampus" class="filter-select" style="min-width:140px">
        <option value="">All Campuses</option>
        ${campOpts}
      </select>
      <select id="asDisc" class="filter-select" style="min-width:160px">
        <option value="">All Disciplines</option>
        ${discOpts}
      </select>
      <select id="asBatch" class="filter-select" style="min-width:200px">
        <option value="">— Select Batch —</option>
      </select>
      <button id="asGenBtn" style="
          height:36px;padding:0 18px;border-radius:var(--r-sm);border:none;
          background:var(--blue);color:#fff;font-size:13px;font-weight:600;
          cursor:pointer;white-space:nowrap">
        Generate
      </button>
    </div>

    <!-- Output area -->
    <div id="asOutput"></div>`;

  // ── Back ───────────────────────────────────────────────────
  container.querySelector('#asBack').addEventListener('click', onBack);

  // ── Batch dropdown population ──────────────────────────────
  const _populateBatches = () => {
    _campusId = container.querySelector('#asCampus').value;
    _discId   = container.querySelector('#asDisc').value;
    _session  = container.querySelector('#asSession').value;

    let filtered = _getBatches();
    if (_campusId) filtered = filtered.filter(b => b.campusId      === _campusId);
    if (_discId)   filtered = filtered.filter(b => b.disciplineId  === _discId);
    if (_session)  filtered = filtered.filter(b => b.sessionPeriod === _session);

    const sel  = container.querySelector('#asBatch');
    const prev = sel.value;
    sel.innerHTML =
      `<option value="">— Select Batch —</option>` +
      filtered.map(b =>
        `<option value="${b.id}" ${b.id === prev ? 'selected' : ''}>${b.batchName}</option>`
      ).join('');
    _batchId = sel.value;
  };

  ['#asSession','#asCampus','#asDisc'].forEach(id => {
    container.querySelector(id).addEventListener('change', _populateBatches);
  });
  container.querySelector('#asBatch').addEventListener('change', e => { _batchId = e.target.value; });

  _populateBatches(); // initial fill

  // ── Generate ───────────────────────────────────────────────
  container.querySelector('#asGenBtn').addEventListener('click', () => {
    _batchId = container.querySelector('#asBatch').value;
    _renderSheet(container.querySelector('#asOutput'), _batchId);
  });
}

// ══════════════════════════════════════════════════════════════
// PRIVATE — Sheet renderer
// ══════════════════════════════════════════════════════════════
function _renderSheet(output, batchId) {
  // ── No batch selected ──────────────────────────────────────
  if (!batchId) {
    output.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--t3);
                  border:1px dashed var(--border2);border-radius:var(--r-lg)">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="1.5"
             style="margin:0 auto 10px;display:block">
          <path d="M9 11l3 3L22 4"/>
          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
        </svg>
        <div style="font-size:13px;font-weight:600;color:var(--t2)">
          Select a batch to generate the sheet
        </div>
      </div>`;
    return;
  }

  // ── Resolve entities ───────────────────────────────────────
  const batch      = AppState.findById('batches',      batchId);
  const disc       = AppState.findById('disciplines',  batch?.disciplineId);
  const campus     = AppState.findById('campuses',     batch?.campusId);

  const enrolments = _getEnrolments()
    .filter(e => e.batchId === batchId && e.status === 'active');

  const students = enrolments
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

  // ── Attendance data ────────────────────────────────────────
  const batchRecs = _getAttendance().filter(r => r.batchId === batchId);
  const dates     = [...new Set(batchRecs.map(r => r.date))].sort();

  // studentId_date → status
  const recMap = {};
  batchRecs.forEach(r => { recMap[`${r.studentId}_${r.date}`] = r.status; });

  // Group dates by month for colspan header
  const byMonth = {};
  dates.forEach(d => {
    const mk = d.slice(0, 7);
    (byMonth[mk] = byMonth[mk] || []).push(d);
  });
  const months = Object.keys(byMonth).sort();

  // ── Month headers ──────────────────────────────────────────
  const monthHeaders = months.map(mk => {
    const [y, m] = mk.split('-');
    return `<th colspan="${byMonth[mk].length}" style="
        padding:6px 8px;text-align:center;font-size:11px;font-weight:700;
        background:var(--blue-dim);color:var(--blue);
        border-right:1px solid var(--border2);border-bottom:1px solid var(--border2)">
      ${MON_SHORT[parseInt(m) - 1]} ${y}
    </th>`;
  }).join('');

  // ── Date sub-headers ───────────────────────────────────────
  const dateHeaders = dates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    return `<th style="padding:4px 2px;text-align:center;min-width:36px;
                       font-size:10px;font-weight:600;color:var(--t3);
                       border-right:1px solid var(--border2);border-bottom:1px solid var(--border)">
      <div style="font-size:9px;color:var(--t4)">${DAY_SHORT[dt.getDay()]}</div>
      <div>${d.slice(8)}</div>
    </th>`;
  }).join('');

  // ── Student rows ───────────────────────────────────────────
  const rows = students.map((stu, idx) => {
    let p = 0, a = 0, l = 0;

    const cells = dates.map(d => {
      const status = recMap[`${stu.id}_${d}`] || '';
      if (status === 'P') p++;
      else if (status === 'A') a++;
      else if (status === 'L') l++;
      const color = status === 'P' ? 'var(--green)'
                  : status === 'A' ? 'var(--red)'
                  : status === 'L' ? 'var(--yellow)'
                  : 'var(--t4)';
      return `<td style="text-align:center;padding:5px 4px;
                          border-bottom:1px solid var(--border);
                          border-right:1px solid var(--border2);
                          font-size:11.5px;font-weight:700;color:${color}">
        ${status || '—'}
      </td>`;
    }).join('');

    const total    = p + a + l;
    const pct      = total > 0 ? Math.round((p / total) * 100) : null;
    const pctColor = pct === null ? 'var(--t4)'
                   : pct >= 75   ? 'var(--green)'
                   :               'var(--red)';

    return `<tr style="background:${idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)'}">
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 color:var(--t4);font-size:11px;font-family:var(--font-mono)">${idx + 1}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);font-weight:600;
                 color:var(--t1);white-space:nowrap">${stu.studentName || '—'}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);font-family:var(--font-mono);
                 font-size:11px;color:var(--t3);white-space:nowrap">
        ${stu.cnic || stu.registrationNo || '—'}
      </td>
      ${cells}
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--green)">${p}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--red)">${a}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:1px solid var(--border2);text-align:center;
                 font-weight:700;font-size:12px;color:var(--yellow)">${l}</td>
      <td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 text-align:center;font-weight:800;font-size:12px;color:${pctColor}">
        ${pct !== null ? pct + '%' : '—'}
      </td>
    </tr>`;
  }).join('');

  // ── Day-summary row (bottom) ───────────────────────────────
  const summaryRow = dates.map(d => {
    const p     = students.filter(s => recMap[`${s.id}_${d}`] === 'P').length;
    const total = students.filter(s => recMap[`${s.id}_${d}`]).length;
    const pct   = total > 0 ? Math.round((p / total) * 100) : null;
    const col   = pct === null ? 'var(--t4)' : pct >= 75 ? 'var(--green)' : 'var(--red)';
    return `<td style="padding:5px 4px;text-align:center;font-size:10.5px;font-weight:700;
                       color:${col};border-right:1px solid var(--border2);
                       background:var(--surface3)">
      ${pct !== null ? pct + '%' : '—'}
    </td>`;
  }).join('');

  // ── Render ─────────────────────────────────────────────────
  output.innerHTML = `
    <!-- Batch info bar -->
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <div>
        <div style="font-size:15px;font-weight:800;color:var(--t1)">${batch?.batchName || '—'}</div>
        <div style="font-size:12px;color:var(--t3);margin-top:2px">
          ${disc?.abbreviation || ''}${campus ? ' · ' + campus.campusName : ''}
          · ${students.length} students · ${dates.length} class days
        </div>
      </div>
      <button id="asPrintBtn" style="
          margin-left:auto;display:inline-flex;align-items:center;gap:6px;
          height:34px;padding:0 14px;border-radius:var(--r-sm);
          border:1px solid var(--border2);background:var(--surface2);
          color:var(--t2);font-size:12.5px;font-weight:600;cursor:pointer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" stroke-width="2">
          <polyline points="6 9 6 2 18 2 18 9"/>
          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
          <rect x="6" y="14" width="12" height="8"/>
        </svg>
        Print / PDF
      </button>
    </div>

    ${!dates.length
      ? `<div style="padding:32px;text-align:center;color:var(--t3);font-size:13px;
                     border:1px dashed var(--border2);border-radius:var(--r-lg)">
           No attendance records found for this batch.
         </div>`
      : `<div style="overflow-x:auto;border:1px solid var(--border);border-radius:var(--r-lg)">
           <table id="asTable" style="border-collapse:collapse;font-size:12.5px;min-width:100%">
             <thead>
               <tr>
                 <th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     width:36px">#</th>
                 <th rowspan="2" style="padding:8px 10px;text-align:left;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     min-width:160px">Student Name</th>
                 <th rowspan="2" style="padding:8px 10px;text-align:left;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     min-width:120px">ID / CNIC</th>
                 ${monthHeaders}
                 <th colspan="3" style="padding:6px 8px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border2)">
                   Total
                 </th>
                 <th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-bottom:1px solid var(--border);min-width:52px">%</th>
               </tr>
               <tr>
                 ${dateHeaders}
                 <th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--green);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     min-width:32px">P</th>
                 <th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--red);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     min-width:32px">A</th>
                 <th style="padding:5px 6px;text-align:center;font-size:10px;font-weight:700;
                     color:var(--yellow);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border);
                     min-width:32px">L</th>
               </tr>
             </thead>
             <tbody>
               ${rows}
               <tr>
                 <td colspan="3" style="padding:6px 10px;font-size:11px;font-weight:700;
                     color:var(--t2);background:var(--surface3);
                     border-right:1px solid var(--border2)">Day %</td>
                 ${summaryRow}
                 <td colspan="4" style="background:var(--surface3)"></td>
               </tr>
             </tbody>
           </table>
         </div>`
    }`;

  // ── Print handler ──────────────────────────────────────────
  output.querySelector('#asPrintBtn')?.addEventListener('click', () => {
    const table = output.querySelector('#asTable');
    if (!table) return;
    const win = window.open('', '_blank');
    win.document.write(`
      <html>
      <head>
        <title>Attendance Sheet — ${batch?.batchName || ''}</title>
        <style>
          body { font-family:sans-serif; font-size:11px; margin:16px; }
          table { border-collapse:collapse; width:100%; }
          th, td { border:1px solid #ccc; padding:4px 6px; }
          th { background:#f3f4f6; }
          @media print { body { margin:8px; } }
        </style>
      </head>
      <body>
        <h3 style="margin-bottom:8px">${batch?.batchName || ''} — Attendance Sheet</h3>
        <p style="color:#666;margin-bottom:12px;font-size:10px">
          ${disc?.abbreviation || ''}${campus ? ' · ' + campus.campusName : ''}
          · ${students.length} students · ${dates.length} days
        </p>
        ${table.outerHTML}
      </body>
      </html>`);
    win.document.close();
    win.print();
  });
}
