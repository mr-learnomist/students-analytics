// ============================================================
// modules/analytics/reports/attendance/attendanceSheet.js
// Report: Batchwise Detail Attendance
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
import { Toast }                 from '../../../../utils/helpers.js';
import { getAssignmentForBatch } from '../../../lecturePlan/lecturePlanService.js';

// ── Constants ────────────────────────────────────────────────
const DAY_SHORT = ['Su','Mo','Tu','We','Th','Fr','Sa'];
const MON_FULL  = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
const MON_SHORT = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Reorderable student-info columns (shared across sheet/CSV/PDF) ──
const AS_INFO_ORDER_DEFAULT = ['studentId','cnic','fatherName','studentPhone','guardianPhone','email'];
const AS_INFO_META = {
  studentId:     { label: 'Student ID',     short: 'Student ID', minWidth: '110px', colW: '50px', align: 'center', mono: false, value: stu => stu.studentId },
  cnic:          { label: 'CNIC',           short: 'CNIC',       minWidth: '130px', colW: '55px', align: 'center', mono: true,  value: stu => stu.cnic },
  fatherName:    { label: 'Father Name',    short: 'Father Name',minWidth: '140px', colW: '65px', align: 'left',   mono: false, value: stu => stu.fatherName },
  studentPhone:  { label: 'Student Phone',  short: 'Stu. Phone', minWidth: '120px', colW: '52px', align: 'center', mono: false, value: stu => stu.studentPhone },
  guardianPhone: { label: 'Guardian Phone', short: 'Grd. Phone', minWidth: '120px', colW: '52px', align: 'center', mono: false, value: stu => stu.guardianPhone },
  email:         { label: 'Email',          short: 'Email',      minWidth: '160px', colW: '75px', align: 'left',   mono: false, value: stu => stu.email },
};
// Normalize a stored order array: keep only known keys, then append any missing ones (new columns / corrupted prefs)
function _asNormalizeOrder(order) {
  const stored  = Array.isArray(order) ? order.filter(k => AS_INFO_ORDER_DEFAULT.includes(k)) : [];
  const missing = AS_INFO_ORDER_DEFAULT.filter(k => !stored.includes(k));
  return [...stored, ...missing];
}

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

// ── Is a batch currently active? (defensive — schema may vary) ──
function _isBatchActive(b) {
  if (!b) return false;
  if (typeof b.isActive === 'boolean') return b.isActive;
  if (b.status) return String(b.status).toLowerCase() === 'active';
  if (b.endDate) {
    const today = new Date().toISOString().slice(0, 10);
    return b.endDate >= today;
  }
  return true; // no status/end-date info available — treat as active
}

// ── Shared: load an external script once (SheetJS / jsPDF / JSZip) ──
function _loadScript(src, cb, errCb) {
  const existing = document.querySelector(`script[src="${src}"]`);
  if (existing) { cb(); return; }
  const s = document.createElement('script');
  s.src = src;
  s.onload  = cb;
  s.onerror = errCb;
  document.head.appendChild(s);
}
// xlsx-js-style — a drop-in SheetJS fork that additionally supports real
// cell styling (fill color, font color/bold, borders) via cell.s, which
// the plain community-edition 'xlsx' library silently drops on write.
// We track our OWN "loaded" flag rather than checking window.XLSX,
// because other features in this app may load the plain (unstyled)
// 'xlsx' library on the same page — checking window.XLSX's mere
// existence could pick up that unstyled version instead of this one.
const _XLSX_STYLE_SRC = 'https://cdn.jsdelivr.net/npm/xlsx-js-style/dist/xlsx.bundle.js';
let _xlsxStyleLoaded = false;
function _withXLSX(cb, errCb) {
  if (_xlsxStyleLoaded && window.XLSX) { cb(window.XLSX); return; }
  _loadScript(_XLSX_STYLE_SRC, () => { _xlsxStyleLoaded = true; cb(window.XLSX); },
    errCb || (() => Toast.error('Could not load Excel styling library.')));
}

// ── Sanitize a batch name into a valid, unique Excel sheet name ──
function _safeSheetName(name, used) {
  let base = String(name || 'Batch').replace(/[:\\/?*\[\]]/g, '-').trim().slice(0, 31) || 'Batch';
  let out = base;
  let n = 2;
  while (used.has(out)) {
    const suffix = ` (${n++})`;
    out = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(out);
  return out;
}

// ── Gather everything needed to render/export one batch's full sheet ──
// (all working dates — no month filter — used by the bulk exporters)
function _bulkGatherBatchData(batchId) {
  const batch = AppState.findById('batches', batchId);
  if (!batch) return null;

  const disc    = AppState.findById('disciplines', batch.disciplineId);
  const campus  = AppState.findById('campuses',    batch.campusId);
  const teacher = batch.teacherId ? AppState.findById('teachers', batch.teacherId) : null;
  const teacherName = (() => {
    if (teacher) {
      return [teacher.firstName, teacher.lastName].filter(Boolean).join(' ').trim()
          || teacher.teacherName || teacher.fullName || teacher.name || '';
    }
    return batch.teacherName || batch.teacher || '';
  })();

  const enrolments = _get('enrolments').filter(e => e.batchId === batchId && e.status === 'active');
  const students = enrolments
    .map(e => AppState.findById('students', e.studentId))
    .filter(Boolean)
    .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
  if (!students.length) return null;

  const dates = _workingDates(batchId, batch);
  if (!dates.length) return null;

  const batchRecs = _get('attendanceRecords').filter(r => r.batchId === batchId);
  const recMap = {};
  batchRecs.forEach(r => { recMap[`${r.studentId}_${r.date}`] = r.status; });

  const byMonth = {};
  dates.forEach(d => { const mk = d.slice(0, 7); (byMonth[mk] = byMonth[mk] || []).push(d); });

  // Column prefs — same persisted prefs the on-screen sheet/CSV/PDF use
  const AS_COL_KEY   = 'as_col_prefs';
  const _DEF_HIDDEN  = ['fatherName', 'email'];
  let colPrefs = { hidden: [..._DEF_HIDDEN] };
  try { const r = AppState.get(AS_COL_KEY); if (r && Array.isArray(r.hidden)) colPrefs = r; } catch(e){}
  const showMap = {};
  ['studentId','cnic','fatherName','studentPhone','guardianPhone','email'].forEach(k => {
    showMap[k] = !colPrefs.hidden.includes(k);
  });
  const visibleInfo = _asNormalizeOrder(colPrefs.order).filter(k => showMap[k]);
  const showP   = !colPrefs.hidden.includes('present');
  const showA   = !colPrefs.hidden.includes('absent');
  const showL   = !colPrefs.hidden.includes('leave');
  const showPct = !colPrefs.hidden.includes('percent');

  return { batch, disc, campus, teacherName, students, dates, byMonth, recMap, visibleInfo, showP, showA, showL, showPct };
}

// ── Build array-of-arrays + merges for one batch's Excel sheet ──
// Mirrors the on-screen layout: month header row (merged) + date/day row
// + student rows, same student-info columns and P/A/L/% summary.
function _bulkBuildAoa(data) {
  const { batch, disc, campus, teacherName, students, dates, byMonth, recMap, visibleInfo, showP, showA, showL, showPct } = data;
  const monthKeys = Object.keys(byMonth).sort();
  const now = new Date();

  const rows = [];
  const merges = [];

  // ── Meta rows ──
  rows.push([`Batch: ${batch.batchName || ''}`, `Discipline: ${disc?.abbreviation || ''}`,
              `Campus: ${campus?.campusName || ''}`, `Teacher: ${teacherName || ''}`,
              `Generated: ${now.toLocaleDateString('en-GB')} ${now.toLocaleTimeString('en-GB', {hour:'2-digit',minute:'2-digit'})}`]);
  rows.push([]);

  const infoHeaders = visibleInfo.map(k => AS_INFO_META[k].label);
  const baseColCount = 2 + infoHeaders.length; // # + Student Name + info cols
  const summaryHeaders = [
    ...(showP ? ['P'] : []), ...(showA ? ['A'] : []),
    ...(showL ? ['L'] : []), ...(showPct ? ['%'] : []),
  ];

  // ── Row: month header (merged across each month's date columns) ──
  const monthRow = new Array(baseColCount).fill('');
  let colCursor = baseColCount;
  monthKeys.forEach(mk => {
    const span = byMonth[mk].length;
    const [y, m] = mk.split('-');
    monthRow.push(`${MON_FULL[parseInt(m)-1]} ${y}`);
    for (let i = 1; i < span; i++) monthRow.push('');
    if (span > 1) {
      merges.push({ s: { r: rows.length, c: colCursor }, e: { r: rows.length, c: colCursor + span - 1 } });
    }
    colCursor += span;
  });
  if (summaryHeaders.length > 1) {
    monthRow.push('Total');
    for (let i = 1; i < summaryHeaders.length; i++) monthRow.push('');
    merges.push({ s: { r: rows.length, c: colCursor }, e: { r: rows.length, c: colCursor + summaryHeaders.length - 1 } });
  } else if (summaryHeaders.length === 1) {
    monthRow.push('');
  }
  rows.push(monthRow);

  // ── Row: date/day sub-header ──
  const dateHeaderRow = [
    '#', 'Student Name', ...infoHeaders,
    ...dates.map(d => { const dt = new Date(d + 'T00:00:00'); return `${DAY_SHORT[dt.getDay()]} ${dt.getDate()}/${dt.getMonth()+1}`; }),
    ...summaryHeaders,
  ];
  rows.push(dateHeaderRow);

  // ── Student rows ──
  students.forEach((stu, idx) => {
    let p = 0, a = 0, l = 0;
    const cells = dates.map(d => {
      const s = recMap[`${stu.id}_${d}`] || '';
      if (s === 'P') p++; else if (s === 'A') a++; else if (s === 'L') l++;
      return s;
    });
    const total = p + a + l;
    const pct   = total > 0 ? Math.round((p / total) * 100) + '%' : '';
    const infoVals = visibleInfo.map(k => AS_INFO_META[k].value(stu) || '');
    const summaryVals = [
      ...(showP ? [total > 0 ? p : ''] : []), ...(showA ? [total > 0 ? a : ''] : []),
      ...(showL ? [total > 0 ? l : ''] : []), ...(showPct ? [pct] : []),
    ];
    rows.push([idx + 1, stu.studentName || '—', ...infoVals, ...cells, ...summaryVals]);
  });

  const colWidths = [
    { wch: 4 }, { wch: 22 },
    ...visibleInfo.map(() => ({ wch: 14 })),
    ...dates.map(() => ({ wch: 8 })),
    ...summaryHeaders.map(() => ({ wch: 6 })),
  ];

  const meta = {
    monthRowIdx:  2,               // row index of the merged month header
    dateHeaderRowIdx: 3,           // row index of the #/Name/date sub-header
    dataStartRowIdx:  4,           // first student row
    infoColCount: infoHeaders.length,
    dateColStart: baseColCount,
    dateColCount: dates.length,
    summaryColStart: baseColCount + dates.length,
    summaryCount: summaryHeaders.length,
    monthKeys, byMonth,
    showP, showA, showL, showPct,
    totalCols: baseColCount + dates.length + summaryHeaders.length,
  };

  return { rows, merges, colWidths, meta };
}

// ── Colors — same palette used on-screen and in the PDF export ──
const XLS_COLOR = {
  monthFill:   'DBEAFE', monthFont:   '1E40AF', // blue-dim / blue
  subFill:     'F1F5F9', subFont:     '475569', // surface2 / t3
  altRowFill:  'F8FAFC',
  present:     '16A34A', absent: 'DC2626', leave: 'D97706', // green / red / amber
  pctGood:     '16A34A', pctBad: 'DC2626',
  borderThin:  'CBD5E1', borderThick: '94A3B8',
  nameFont:    '0F172A',
};

function _cellRef(XLSX, r, c) { return XLSX.utils.encode_cell({ r, c }); }
function _styleCell(XLSX, ws, r, c, style) {
  const ref = _cellRef(XLSX, r, c);
  if (!ws[ref]) ws[ref] = { t: 's', v: '' };
  ws[ref].s = { ...(ws[ref].s || {}), ...style };
}

// ── Apply real fill/font/border styling to a built worksheet ──
// (xlsx-js-style only — the plain community 'xlsx' silently ignores .s)
function _bulkApplyXlsxStyles(XLSX, ws, meta, rowCount) {
  const thin  = { style: 'thin',  color: { rgb: XLS_COLOR.borderThin } };
  const thick = { style: 'medium', color: { rgb: XLS_COLOR.borderThick } };
  const { monthRowIdx, dateHeaderRowIdx, dataStartRowIdx, dateColStart, dateColCount,
           summaryColStart, summaryCount, monthKeys, byMonth, totalCols } = meta;

  // Column index -> true if it's the LAST date column of its month (thicker right border)
  const monthEndCols = new Set();
  let cursor = dateColStart;
  monthKeys.forEach(mk => { cursor += byMonth[mk].length; monthEndCols.add(cursor - 1); });
  const infoEndCol = dateColStart - 1; // last student-info column before dates start

  // ── Header rows (month band + date/day sub-header) ──
  for (let r = monthRowIdx; r <= dateHeaderRowIdx; r++) {
    for (let c = 0; c < totalCols; c++) {
      _styleCell(XLSX, ws, r, c, {
        fill: { fgColor: { rgb: r === monthRowIdx ? XLS_COLOR.monthFill : XLS_COLOR.subFill } },
        font: { bold: true, sz: 9, color: { rgb: r === monthRowIdx ? XLS_COLOR.monthFont : XLS_COLOR.subFont } },
        alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
        border: {
          top: thin, bottom: thin,
          left: thin,
          right: (c === infoEndCol || monthEndCols.has(c) || c === totalCols - 1) ? thick : thin,
        },
      });
    }
  }

  // ── Data rows ──
  for (let r = dataStartRowIdx; r < dataStartRowIdx + rowCount; r++) {
    const alt = (r - dataStartRowIdx) % 2 === 1;
    for (let c = 0; c < totalCols; c++) {
      const ref = _cellRef(XLSX, r, c);
      const val = ws[ref] ? ws[ref].v : '';
      const isDateCol = c >= dateColStart && c < dateColStart + dateColCount;
      const isSummaryCol = c >= summaryColStart && c < summaryColStart + summaryCount;
      const isPctCol = isSummaryCol && c === summaryColStart + summaryCount - 1 && meta.showPct;

      const style = {
        border: {
          top: thin, bottom: thin, left: thin,
          right: (c === infoEndCol || monthEndCols.has(c) || c === totalCols - 1) ? thick : thin,
        },
        alignment: { horizontal: c === 1 ? 'left' : 'center', vertical: 'center' },
        fill: alt ? { fgColor: { rgb: XLS_COLOR.altRowFill } } : undefined,
      };

      if (c === 1) style.font = { bold: true, sz: 9, color: { rgb: XLS_COLOR.nameFont } };
      else if (isDateCol && val) {
        const color = val === 'P' ? XLS_COLOR.present : val === 'A' ? XLS_COLOR.absent : val === 'L' ? XLS_COLOR.leave : null;
        if (color) style.font = { bold: true, sz: 9, color: { rgb: color } };
      } else if (isPctCol && typeof val === 'string' && val.endsWith('%')) {
        const n = parseInt(val, 10);
        style.font = { bold: true, sz: 9, color: { rgb: n >= 75 ? XLS_COLOR.pctGood : XLS_COLOR.pctBad } };
      } else if (isSummaryCol) {
        style.font = { bold: true, sz: 9 };
      }

      _styleCell(XLSX, ws, r, c, style);
    }
  }

  // ── Meta/title rows — bold first line ──
  _styleCell(XLSX, ws, 0, 0, { font: { bold: true, sz: 11, color: { rgb: XLS_COLOR.monthFont } } });
}

// ── Bulk Export: one .xlsx workbook, one sheet per matched batch ──
function _bulkExportWorkbook(batches) {
  if (!batches.length) { Toast.error('No active batches matched the selected filters.'); return; }

  // ── Order sheets by starting date, earliest first ──
  // Prefer the batch's own startDate; if missing, fall back to its
  // earliest actual working/class date so it still sorts sensibly.
  const _batchStartKey = (b) => {
    if (b.startDate) return b.startDate;
    const dates = _workingDates(b.id, b);
    return dates[0] || '9999-99-99'; // unknown start — push to the end
  };
  const sortedBatches = [...batches].sort((a, b) => _batchStartKey(a).localeCompare(_batchStartKey(b)));

  _withXLSX((XLSX) => {
    const wb   = XLSX.utils.book_new();
    const used = new Set();
    let added  = 0;

    sortedBatches.forEach(batch => {
      const data = _bulkGatherBatchData(batch.id);
      if (!data) return; // no active students or no class dates
      const { rows, merges, colWidths, meta } = _bulkBuildAoa(data);
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols']   = colWidths;
      if (merges.length) ws['!merges'] = merges;
      _bulkApplyXlsxStyles(XLSX, ws, meta, data.students.length);
      XLSX.utils.book_append_sheet(wb, ws, _safeSheetName(batch.batchName, used));
      added++;
    });

    if (!added) { Toast.error('None of the matched batches have active students and class dates.'); return; }

    const dateTag = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g, '-');
    XLSX.writeFile(wb, `Attendance-Bulk-${dateTag}.xlsx`);
    Toast.success(`Workbook downloaded — ${added} batch sheet${added !== 1 ? 's' : ''} in one file.`);
  });
}

// ── Bulk Export: one PDF per matched batch, zipped ──
function _bulkExportPDFZip(batches) {
  if (!batches.length) { Toast.error('No active batches matched the selected filters.'); return; }

  const _buildPDF = (batch, jsPDF, autoTable) => {
    const data = _bulkGatherBatchData(batch.id);
    if (!data) return null;
    const { disc, campus, teacherName, students, byMonth, recMap, visibleInfo, showP, showA, showL, showPct } = data;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const PW  = doc.internal.pageSize.getWidth();
    const PH  = doc.internal.pageSize.getHeight();
    const ML  = 24, MR = 24;

    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const monthKeys = Object.keys(byMonth).sort();
    const dataColStart = 2 + visibleInfo.length;

    monthKeys.forEach((mk, mIdx) => {
      const mDates = byMonth[mk];
      const [y, m] = mk.split('-');
      const mLabel = MON_FULL[parseInt(m) - 1] + ' ' + y;

      if (mIdx > 0) doc.addPage();

      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 64, 175);
      doc.text(`Batchwise Detail Attendance — ${batch.batchName || ''}`, ML, 26);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100, 116, 139);
      doc.text(
        `${disc?.abbreviation || ''}${campus ? ' · ' + campus.campusName : ''} · ${students.length} student${students.length !== 1 ? 's' : ''} · ${mLabel}${teacherName ? ' · ' + teacherName : ''}`,
        ML, 38
      );
      doc.setDrawColor(37, 99, 235); doc.setLineWidth(1.2);
      doc.line(ML, 44, PW - MR, 44);

      const infoHeads = visibleInfo.map(k => AS_INFO_META[k].short);
      const head = [[
        '#', 'Student Name', ...infoHeads,
        ...mDates.map(d => { const dt = new Date(d + 'T00:00:00'); return `${DAY_SHORT[dt.getDay()]} ${dt.getDate()}`; }),
        ...(showP ? ['P'] : []), ...(showA ? ['A'] : []), ...(showL ? ['L'] : []), ...(showPct ? ['%'] : []),
      ]];

      const body = students.map((stu, idx) => {
        let p = 0, a = 0, l = 0;
        const cells = mDates.map(d => {
          const s = recMap[`${stu.id}_${d}`] || '';
          if (s === 'P') p++; else if (s === 'A') a++; else if (s === 'L') l++;
          return s;
        });
        const total = p + a + l;
        const pct   = total > 0 ? Math.round((p / total) * 100) + '%' : '';
        const infoVals = visibleInfo.map(k => AS_INFO_META[k].value(stu) || '—');
        return [
          idx + 1, stu.studentName || '—', ...infoVals, ...cells,
          ...(showP ? [total > 0 ? p : ''] : []), ...(showA ? [total > 0 ? a : ''] : []),
          ...(showL ? [total > 0 ? l : ''] : []), ...(showPct ? [pct] : []),
        ];
      });

      autoTable(doc, {
        startY: 50,
        margin: { left: ML, right: MR },
        head, body,
        styles: { fontSize: 6.5, cellPadding: 1.5, lineColor: [0, 0, 0], lineWidth: 0.3 },
        headStyles: { fillColor: [219, 234, 254], textColor: [30, 64, 175], fontStyle: 'bold', halign: 'center' },
        columnStyles: { 0: { halign: 'center', cellWidth: 16 }, 1: { cellWidth: 72, halign: 'left' } },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        didParseCell: (d) => {
          if (d.section !== 'body') return;
          const dataColEnd = dataColStart + mDates.length;
          if (d.column.index >= dataColStart && d.column.index < dataColEnd) {
            const v = d.cell.raw;
            if (v === 'P') d.cell.styles.textColor = [22, 163, 74];
            else if (v === 'A') d.cell.styles.textColor = [220, 38, 38];
            else if (v === 'L') d.cell.styles.textColor = [217, 119, 6];
            d.cell.styles.halign = 'center'; d.cell.styles.fontStyle = 'bold';
          }
        },
        didDrawPage: (d) => {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(148, 163, 184);
          doc.text(`${batch.batchName || ''} — Attendance Export`, ML, PH - 10);
          doc.text(`Generated ${dateStr} ${timeStr}   |   Page ${d.pageNumber}`, PW - MR, PH - 10, { align: 'right' });
        },
      });
    });

    if (!monthKeys.length) return null;
    return doc.output('arraybuffer');
  };

  const doExport = (jsPDF, autoTable, JSZip) => {
    const zip = new JSZip();
    let added = 0;

    batches.forEach(batch => {
      const buf = _buildPDF(batch, jsPDF, autoTable);
      if (!buf) return;
      const safeName = (batch.batchName || 'Batch').replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 80);
      zip.file(`${safeName}.pdf`, buf);
      added++;
    });

    if (!added) { Toast.error('None of the matched batches have active students and class dates.'); return; }

    const dateTag = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).replace(/ /g, '-');
    zip.generateAsync({ type: 'blob' }).then(blob => {
      const url = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `Attendance-PDF-Bulk-${dateTag}.zip` }).click();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      Toast.success(`ZIP downloaded — ${added} PDF file${added !== 1 ? 's' : ''}.`);
    });
  };

  const JSPDF_SRC     = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  const AUTOTABLE_SRC = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
  const JSZIP_SRC     = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const err = () => Toast.error('Could not load PDF library. Check your internet connection.');
  const run = () => {
    const jsPDF     = window.jspdf?.jsPDF || window.jsPDF;
    const autoTable = window.jspdf?.autoTable || ((doc, opts) => doc.autoTable(opts));
    doExport(jsPDF, autoTable, window.JSZip);
  };
  if (window.jspdf?.jsPDF && window.JSZip) { run(); return; }
  _loadScript(JSPDF_SRC, () => {
    _loadScript(AUTOTABLE_SRC, () => {
      if (window.JSZip) { run(); return; }
      _loadScript(JSZIP_SRC, run, err);
    }, err);
  }, err);
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
.as-col-mgr-reorder { display:flex; flex-direction:column; gap:1px; flex-shrink:0; }
.as-col-mgr-move {
  width:16px; height:12px; display:flex; align-items:center; justify-content:center;
  background:none; border:none; padding:0; cursor:pointer; color:var(--t3);
  border-radius:3px; transition:background .1s, color .1s;
}
.as-col-mgr-move:hover:not(:disabled) { background:var(--border2); color:var(--t1); }
.as-col-mgr-move:disabled { opacity:.25; cursor:not-allowed; }
.as-col-mgr-divider {
  padding:6px 12px 3px; font-size:9.5px; font-weight:700; text-transform:uppercase;
  letter-spacing:.06em; color:var(--t4); border-top:1px solid var(--border); margin-top:2px;
}
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

/* ── Bulk Export modal ── */
.as-bulk-backdrop {
  display:none; position:fixed; inset:0; z-index:9997;
  background:rgba(15,23,42,.5);
  align-items:center; justify-content:center; padding:20px;
}
.as-bulk-backdrop.open { display:flex; }
.as-bulk-modal {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; overflow: hidden; width: 100%; max-width:640px;
  box-shadow:0 20px 60px rgba(0,0,0,.3);
  max-height:calc(100vh - 40px); display:flex; flex-direction:column;
}
.as-bulk-head {
  display:flex; align-items:flex-start; gap:10px; padding:14px 18px;
  border-bottom:1px solid var(--border);
}
.as-bulk-title { font-size:14px; font-weight:700; color:var(--t1); flex:1; }
.as-bulk-sub   { font-size:11.5px; color:var(--t3); margin-top:3px; }
.as-bulk-close {
  display:inline-flex; align-items:center; justify-content:center;
  width:28px; height:28px; border-radius:7px; border:none;
  background:var(--surface2); color:var(--t3); cursor:pointer; flex-shrink:0;
  transition:all .15s;
}
.as-bulk-close:hover { background:var(--red-dim); color:var(--red); }
.as-bulk-body  { padding:16px 18px; display:flex; flex-direction:column; gap:14px; overflow-y:auto; }
.as-bulk-row   { display:flex; gap:10px; flex-wrap:wrap; }
.as-bulk-cell  { flex:1 1 160px; min-width:150px; }
.as-bulk-footer{
  display:flex; align-items:center; gap:12px; flex-wrap:wrap;
  padding-top:12px; border-top:1px dashed var(--border2);
}
.as-bulk-count { font-size:12.5px; color:var(--t2); font-weight:600; }
.as-bulk-count b { color:var(--blue); }
.as-bulk-btn {
  display:inline-flex; align-items:center; gap:7px;
  height:32px; padding:0 14px; border-radius:8px; border:none;
  font-size:12.5px; font-weight:700; cursor:pointer; font-family:inherit;
  transition:opacity .15s;
}
.as-bulk-btn:hover { opacity:.88; }
.as-bulk-btn:disabled { opacity:.4; cursor:not-allowed; }
.as-bulk-btn.xlsx { background:var(--green); color:#fff; }
.as-bulk-btn.pdf  { background:#dc2626; color:#fff; }
`;
  document.head.appendChild(st);
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC MOUNT
// ═══════════════════════════════════════════════════════════════
export function mountBatchwiseDetailAttendance(container, onBack) {
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
        <div style="font-size:16px;font-weight:700;color:var(--t1)">Batchwise Detail Attendance</div>
        <div style="font-size:12px;color:var(--t3);margin-top:1px">
          Select filters then Apply — sheet loads with class dates, filled with marked attendance
        </div>
      </div>
      <button id="asBulkOpenBtn" title="Bulk Export — Multiple Batches" style="display:inline-flex;align-items:center;gap:6px;height:32px;
          margin-left:auto;padding:0 12px;border-radius:var(--r-sm);border:1px solid var(--border2);
          background:var(--surface2);color:var(--t2);font-size:12.5px;font-weight:600;cursor:pointer">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>Bulk Export
      </button>
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

      <!-- Bulk Export modal (hidden until opened via header icon) -->
      <div class="as-bulk-backdrop" id="asBulkBackdrop">
        <div class="as-bulk-modal" id="asBulkModal">
          <div class="as-bulk-head">
            <div>
              <div class="as-bulk-title">Bulk Export — Multiple Batches</div>
              <div class="as-bulk-sub">Campus → Discipline → Session (multi) → Level — exports every matching <strong>active</strong> batch, all its class dates</div>
            </div>
            <button type="button" id="asBulkCloseBtn" class="as-bulk-close" title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <div class="as-bulk-body">
            <div class="as-bulk-row">
              <div class="as-bulk-cell">
                <div class="as-fcell-label">Campus</div>
                <select id="asBulkCampus" class="as-filter-sel">
                  <option value="">All Campuses</option>
                </select>
              </div>
              <div class="as-bulk-cell">
                <div class="as-fcell-label">Discipline</div>
                <select id="asBulkDisc" class="as-filter-sel">
                  <option value="">All</option>
                </select>
              </div>
              <div class="as-bulk-cell">
                <div class="as-fcell-label">Session</div>
                <div class="as-cdd" id="asBulkSessionDd">
                  <button type="button" class="as-cdd-trigger" id="asBulkSessionTrigger">
                    <span class="as-cdd-val placeholder" id="asBulkSessionVal">All Sessions</span>
                    <svg class="as-cdd-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div class="as-cdd-panel" id="asBulkSessionPanel">
                    <div class="as-cdd-list" id="asBulkSessionList"></div>
                    <div class="as-cdd-footer">
                      <button type="button" class="as-cdd-footer-btn" id="asBulkSessionAll">All</button>
                      <button type="button" class="as-cdd-footer-btn" id="asBulkSessionNone">None</button>
                    </div>
                  </div>
                </div>
              </div>
              <div class="as-bulk-cell">
                <div class="as-fcell-label">Level</div>
                <select id="asBulkLevel" class="as-filter-sel">
                  <option value="">All Levels</option>
                </select>
              </div>
            </div>
            <div class="as-bulk-footer">
              <span class="as-bulk-count" id="asBulkCount"><b>0</b> active batches matched</span>
              <button class="as-bulk-btn xlsx" id="asBulkXlsxBtn" disabled>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>Download Workbook (.xlsx)
              </button>
              <button class="as-bulk-btn pdf" id="asBulkPdfBtn" disabled>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>Download PDFs (.zip, one per batch)
              </button>
            </div>
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
      container.querySelector('#asSubject').value = '';
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
    _subjectId = _subjDd.getValue() || container.querySelector('#asSubject').value;

    let batches = _get('batches');
    if (_campusId)  batches = batches.filter(b => b.campusId      === _campusId);
    if (_discId)    batches = batches.filter(b => b.disciplineId  === _discId);
    if (_session)   batches = batches.filter(b => b.sessionPeriod === _session);

    if (_subjectId) {
      // Primary: direct subjectId field on batch
      const hasDirectField = batches.some(b => b.subjectId !== undefined);
      if (hasDirectField) {
        batches = batches.filter(b => b.subjectId === _subjectId);
      } else {
        // Fallback: match subjectCode in batchName
        const subj = (_get('subjects') || []).find(s => s.id === _subjectId);
        if (subj?.subjectCode) {
          const code = subj.subjectCode.toLowerCase();
          batches = batches.filter(b => (b.batchName || '').toLowerCase().includes(code));
        }
      }
    }

    const _natSort = (a, b) => {
      const num = s => { const m = (s||'').match(/(\d+)(?!.*\d)/); return m ? parseInt(m[1]) : 0; };
      return num(a.label) - num(b.label) || (a.label||'').localeCompare(b.label||'');
    };
    const opts = [{ value: '', label: '— Select Batch —' }, ...batches.map(b => ({ value: b.id, label: b.batchName || '' })).sort(_natSort)];
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

  // ═══════════════════════════════════════════════════════════
  // BULK EXPORT — Campus → Discipline → Session (multi) → Level
  // ═══════════════════════════════════════════════════════════
  let _bCampusId  = '';
  let _bDiscId    = '';
  let _bSessions  = new Set();
  let _bLevelId   = '';

  const bCampSel  = container.querySelector('#asBulkCampus');
  const bDiscSel  = container.querySelector('#asBulkDisc');
  const bLevelSel = container.querySelector('#asBulkLevel');
  const bXlsxBtn  = container.querySelector('#asBulkXlsxBtn');
  const bPdfBtn   = container.querySelector('#asBulkPdfBtn');
  const bCountEl  = container.querySelector('#asBulkCount');

  // ── Modal open/close ────────────────────────────────────────
  const bBackdrop = container.querySelector('#asBulkBackdrop');
  const bModal    = container.querySelector('#asBulkModal');
  const _bulkOpen  = () => bBackdrop.classList.add('open');
  const _bulkClose = () => bBackdrop.classList.remove('open');
  container.querySelector('#asBulkOpenBtn').addEventListener('click', _bulkOpen);
  container.querySelector('#asBulkCloseBtn').addEventListener('click', _bulkClose);
  bBackdrop.addEventListener('mousedown', e => { if (e.target === bBackdrop) _bulkClose(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && bBackdrop.classList.contains('open')) _bulkClose(); });

  _get('campuses').forEach(c => {
    const o = document.createElement('option');
    o.value = c.id; o.textContent = c.campusName;
    bCampSel.appendChild(o);
  });
  _get('disciplines').forEach(d => {
    const o = document.createElement('option');
    o.value = d.id; o.textContent = d.abbreviation || d.name || d.fullName || '';
    bDiscSel.appendChild(o);
  });

  const _bSessionDd = _makeCdd({
    triggerId: 'asBulkSessionTrigger', panelId: 'asBulkSessionPanel',
    searchId: null, listId: 'asBulkSessionList', valId: 'asBulkSessionVal',
    mode: 'multi', placeholder: 'All Sessions',
    onClose: (set) => { _bSessions = set; _bRefreshMatch(); }
  });
  container.querySelector('#asBulkSessionAll')?.addEventListener('click', () => { _bSessionDd.selectAll(); _bSessions = _bSessionDd.getValue(); _bRefreshMatch(); });
  container.querySelector('#asBulkSessionNone')?.addEventListener('click', () => { _bSessionDd.selectNone(); _bSessions = _bSessionDd.getValue(); _bRefreshMatch(); });

  function _bRefreshSessionOpts() {
    let batches = _get('batches');
    if (_bCampusId) batches = batches.filter(b => b.campusId === _bCampusId);
    if (_bDiscId)   batches = batches.filter(b => b.disciplineId === _bDiscId);
    const sessions = [...new Set(batches.map(b => b.sessionPeriod).filter(Boolean))].sort().reverse();
    const prevSel = _bSessionDd.getValue();
    _bSessionDd.setOpts(sessions.map(s => ({ value: s, label: s })));
    _bSessions = new Set([...prevSel].filter(s => sessions.includes(s)));
    _bSessionDd.setValue(_bSessions);
  }

  function _bRefreshLevelOpts() {
    const prev = bLevelSel.value;
    bLevelSel.innerHTML = '<option value="">All Levels</option>';
    const levels = (_get('levels') || []).filter(l => !_bDiscId || l.disciplineId === _bDiscId);
    levels.forEach(l => {
      const o = document.createElement('option');
      o.value = l.id; o.textContent = l.levelName || l.name || l.abbreviation || '';
      bLevelSel.appendChild(o);
    });
    bLevelSel.value = levels.some(l => l.id === prev) ? prev : '';
    _bLevelId = bLevelSel.value;
  }

  function _bMatchedBatches() {
    let batches = _get('batches').filter(_isBatchActive);
    if (_bCampusId) batches = batches.filter(b => b.campusId === _bCampusId);
    if (_bDiscId)   batches = batches.filter(b => b.disciplineId === _bDiscId);
    if (_bSessions.size) batches = batches.filter(b => _bSessions.has(b.sessionPeriod));
    if (_bLevelId) {
      const subjects = (_get('subjects') || []).filter(s => s.levelId === _bLevelId);
      const subjIds  = new Set(subjects.map(s => s.id));
      const hasDirectField = batches.some(b => b.subjectId !== undefined);
      if (hasDirectField) {
        batches = batches.filter(b => subjIds.has(b.subjectId));
      } else {
        const codes = subjects.map(s => (s.subjectCode || '').toLowerCase()).filter(Boolean);
        batches = batches.filter(b => codes.some(code => (b.batchName || '').toLowerCase().includes(code)));
      }
    }
    return batches;
  }

  function _bRefreshMatch() {
    const matched = _bMatchedBatches();
    bCountEl.innerHTML = `<b>${matched.length}</b> active batch${matched.length !== 1 ? 'es' : ''} matched`;
    bXlsxBtn.disabled = !matched.length;
    bPdfBtn.disabled  = !matched.length;
  }

  bCampSel.addEventListener('change', () => {
    _bCampusId = bCampSel.value;
    _bRefreshSessionOpts();
    _bRefreshMatch();
  });
  bDiscSel.addEventListener('change', () => {
    _bDiscId = bDiscSel.value;
    _bRefreshSessionOpts();
    _bRefreshLevelOpts();
    _bRefreshMatch();
  });
  bLevelSel.addEventListener('change', () => {
    _bLevelId = bLevelSel.value;
    _bRefreshMatch();
  });

  _bRefreshSessionOpts();
  _bRefreshLevelOpts();
  _bRefreshMatch();

  bXlsxBtn.addEventListener('click', () => _bulkExportWorkbook(_bMatchedBatches()));
  bPdfBtn.addEventListener('click',  () => _bulkExportPDFZip(_bMatchedBatches()));
}

// ═══════════════════════════════════════════════════════════════
// PRIVATE — Sheet renderer
// ═══════════════════════════════════════════════════════════════
function _renderSheet(output, batchId, selMonths) {

  const batch   = AppState.findById('batches',     batchId);
  const disc    = AppState.findById('disciplines', batch?.disciplineId);
  const campus  = AppState.findById('campuses',    batch?.campusId);
  const teacher = batch?.teacherId ? AppState.findById('teachers', batch.teacherId) : null;
  const teacherName = (() => {
    if (teacher) {
      return [teacher.firstName, teacher.lastName].filter(Boolean).join(' ').trim()
          || teacher.teacherName || teacher.fullName || teacher.name || '';
    }
    return batch?.teacherName || batch?.teacher || '';
  })();

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
  const batchRecs = _get('attendanceRecords').filter(r => r.batchId === batchId);
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
  const showStudentId   = !colPrefs.hidden.includes('studentId');
  const showCnic        = !colPrefs.hidden.includes('cnic');
  const showFatherName  = !colPrefs.hidden.includes('fatherName');
  const showStudentPhone= !colPrefs.hidden.includes('studentPhone');
  const showGuardianPhone=!colPrefs.hidden.includes('guardianPhone');
  const showEmail       = !colPrefs.hidden.includes('email');
  const showAttendance  = !colPrefs.hidden.includes('attendance');
  const showP           = !colPrefs.hidden.includes('present');
  const showA           = !colPrefs.hidden.includes('absent');
  const showL           = !colPrefs.hidden.includes('leave');
  const showPct         = !colPrefs.hidden.includes('percent');
  const totalCols       = (showP?1:0) + (showA?1:0) + (showL?1:0);
  const showMap = { studentId: showStudentId, cnic: showCnic, fatherName: showFatherName,
                     studentPhone: showStudentPhone, guardianPhone: showGuardianPhone, email: showEmail };
  const infoOrder     = _asNormalizeOrder(colPrefs.order);
  const visibleInfo   = infoOrder.filter(k => showMap[k]);
  const lastInfoKey   = visibleInfo[visibleInfo.length - 1];

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
                 border-right:${!visibleInfo.length?'2px':'1px'} solid var(--border);font-weight:700;
                 color:var(--t1);white-space:nowrap;
                 position:sticky;left:36px;background:inherit;z-index:1;min-width:160px">
        ${stu.studentName || '—'}
      </td>
      ${visibleInfo.map(key => {
        const meta = AS_INFO_META[key];
        const isLast = key === lastInfoKey;
        const val = meta.value(stu) || '—';
        return `<td style="padding:6px 10px;border-bottom:1px solid var(--border);
                 border-right:${isLast?'2px solid var(--border)':'1px solid var(--border2)'};text-align:${meta.align};
                 font-size:11px;color:var(--t2);white-space:nowrap${meta.mono?';font-family:var(--font-mono)':''}">${val}</td>`;
      }).join('')}
      ${showAttendance ? cells : ''}
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
        · ${monthLabel}${teacherName ? ' · ' + teacherName : ''}
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
                     border-right:${!visibleInfo.length?'2px':'1px'} solid var(--border);border-bottom:1px solid var(--border);
                     position:sticky;left:36px;z-index:4">Student Name</th>
                 ${visibleInfo.map(key => {
                   const meta = AS_INFO_META[key];
                   const isLast = key === lastInfoKey;
                   return `<th rowspan="2" style="padding:8px 10px;text-align:${meta.align};font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);min-width:${meta.minWidth};
                     border-right:${isLast?'2px solid var(--border)':'1px solid var(--border2)'};border-bottom:1px solid var(--border)">${meta.label}</th>`;
                 }).join('')}
                 ${showAttendance ? monthHeaders : ''}
                 ${totalCols > 0 ? `<th colspan="${totalCols}" style="padding:6px 8px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-right:1px solid var(--border2);border-bottom:1px solid var(--border2)">Total</th>` : ''}
                 ${showPct ? `<th rowspan="2" style="padding:8px 10px;text-align:center;font-size:10px;
                     font-weight:700;color:var(--t3);background:var(--surface2);
                     border-bottom:1px solid var(--border);min-width:48px">%</th>` : ''}
               </tr>
               <tr>
                 ${showAttendance ? dateHeaders : ''}
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


  const batchRecs = (AppState.get('attendanceRecords') || []).filter(r => r.batchId === batch?.id);
  const recMap    = {};
  batchRecs.forEach(r => { recMap[`${r.studentId}_${r.date}`] = r.status; });

  // ── Determine which student-info columns to include (same as current view prefs)
  const AS_COL_KEY = 'as_col_prefs';
  const _DEFAULT_HIDDEN_CSV = ['fatherName', 'email'];
  let colPrefsCSV = { hidden: [..._DEFAULT_HIDDEN_CSV] };
  try { const r = AppState.get(AS_COL_KEY); if (r && Array.isArray(r.hidden)) colPrefsCSV = r; } catch(e){}
  const csvShowStudentId    = !colPrefsCSV.hidden.includes('studentId');
  const csvShowCnic         = !colPrefsCSV.hidden.includes('cnic');
  const csvShowFatherName   = !colPrefsCSV.hidden.includes('fatherName');
  const csvShowStudentPhone = !colPrefsCSV.hidden.includes('studentPhone');
  const csvShowGuardianPhone= !colPrefsCSV.hidden.includes('guardianPhone');
  const csvShowEmail        = !colPrefsCSV.hidden.includes('email');
  const csvShowAttendance   = !colPrefsCSV.hidden.includes('attendance');
  const csvShowP            = !colPrefsCSV.hidden.includes('present');
  const csvShowA            = !colPrefsCSV.hidden.includes('absent');
  const csvShowL            = !colPrefsCSV.hidden.includes('leave');
  const csvShowPct          = !colPrefsCSV.hidden.includes('percent');
  const csvShowMap = { studentId: csvShowStudentId, cnic: csvShowCnic, fatherName: csvShowFatherName,
                        studentPhone: csvShowStudentPhone, guardianPhone: csvShowGuardianPhone, email: csvShowEmail };
  const csvVisibleInfo = _asNormalizeOrder(colPrefsCSV.order).filter(k => csvShowMap[k]);

  const metaLines = [
    'Batchwise Detail Attendance',
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

  const infoHeaders = csvVisibleInfo.map(key => AS_INFO_META[key].label);
  const summaryHeaders = [
    ...(csvShowP   ? ['P'] : []),
    ...(csvShowA   ? ['A'] : []),
    ...(csvShowL   ? ['L'] : []),
    ...(csvShowPct ? ['%'] : []),
  ];
  const headers = ['#', 'Student Name', ...infoHeaders, ...(csvShowAttendance ? dateHeaders : []), ...summaryHeaders];

  const csvRows = students.map((stu, i) => {
    let p = 0, a = 0, l = 0;
    const cells = dates.map(d => {
      const s = recMap[`${stu.id}_${d}`] || '';
      if (s === 'P') p++; else if (s === 'A') a++; else if (s === 'L') l++;
      return s;
    });
    const total = p + a + l;
    const pct   = total > 0 ? Math.round((p / total) * 100) + '%' : '';
    const infoCells = csvVisibleInfo.map(key => AS_INFO_META[key].value(stu) || '');
    const summaryCells = [
      ...(csvShowP   ? [p]   : []),
      ...(csvShowA   ? [a]   : []),
      ...(csvShowL   ? [l]   : []),
      ...(csvShowPct ? [pct] : []),
    ];
    return [i+1, stu.studentName || '—', ...infoCells, ...(csvShowAttendance ? cells : []), ...summaryCells]
      .map(v => `"${String(v).replace(/"/g,'""')}"`).join(',');
  });

  const csv  = metaLines + headers.map(h=>`"${h}"`).join(',') + '\n' + csvRows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `Batchwise-Detail-Attendance-${batch?.batchName||'Sheet'}-${dateStr.replace(/ /g,'-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── PDF / Print Export ────────────────────────────────────────
function _exportPDF({ batch, disc, campus, students, dates, byMonth, monthLabel, selMonths }, output) {
  if (!students.length || !dates.length) { alert('No data to export.'); return; }

  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
  const timeStr = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

  const _pdfTeacher = batch?.teacherId ? AppState.findById('teachers', batch.teacherId) : null;
  const teacherName = (() => {
    if (_pdfTeacher) {
      return [_pdfTeacher.firstName, _pdfTeacher.lastName].filter(Boolean).join(' ').trim()
          || _pdfTeacher.teacherName || _pdfTeacher.fullName || _pdfTeacher.name || '';
    }
    return batch?.teacherName || batch?.teacher || '';
  })();

  // ── Which student-info columns are currently visible
  const AS_COL_KEY = 'as_col_prefs';
  const _DEF_HIDDEN = ['fatherName','email'];
  let colPrefsPDF = { hidden: [..._DEF_HIDDEN] };
  try { const r = AppState.get(AS_COL_KEY); if (r && Array.isArray(r.hidden)) colPrefsPDF = r; } catch(e){}
  const pdfShowStudentId     = !colPrefsPDF.hidden.includes('studentId');
  const pdfShowCnic          = !colPrefsPDF.hidden.includes('cnic');
  const pdfShowFatherName    = !colPrefsPDF.hidden.includes('fatherName');
  const pdfShowStudentPhone  = !colPrefsPDF.hidden.includes('studentPhone');
  const pdfShowGuardianPhone = !colPrefsPDF.hidden.includes('guardianPhone');
  const pdfShowEmail         = !colPrefsPDF.hidden.includes('email');
  const pdfShowAttendance    = !colPrefsPDF.hidden.includes('attendance');
  const pdfShowP             = !colPrefsPDF.hidden.includes('present');
  const pdfShowA             = !colPrefsPDF.hidden.includes('absent');
  const pdfShowL             = !colPrefsPDF.hidden.includes('leave');
  const pdfShowPct           = !colPrefsPDF.hidden.includes('percent');
  const pdfShowMap = { studentId: pdfShowStudentId, cnic: pdfShowCnic, fatherName: pdfShowFatherName,
                        studentPhone: pdfShowStudentPhone, guardianPhone: pdfShowGuardianPhone, email: pdfShowEmail };
  const pdfVisibleInfo = _asNormalizeOrder(colPrefsPDF.order).filter(k => pdfShowMap[k]);

  // ── Attendance record map
  const batchRecs = (AppState.get('attendanceRecords') || []).filter(r => r.batchId === batch?.id);
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

    // Info col widths — fixed so table doesn't expand unnecessarily
    const infoColsHTML = pdfVisibleInfo.map(key => `<col style="width:${AS_INFO_META[key].colW}"/>`).join('');

    const summCols = (pdfShowP?1:0)+(pdfShowA?1:0)+(pdfShowL?1:0)+(pdfShowPct?1:0);

    // Header row 1 — month span + Total span
    const dateColCount = mDates.length;
    const infoSpan = pdfVisibleInfo.length;

    let hdr1 = `<th rowspan="2" class="h-no h-name" colspan="${1 + (infoSpan > 0 ? 0 : 0)}">#</th>
                <th rowspan="2" class="h-no h-name" style="text-align:left">Student Name</th>`;
    hdr1 += pdfVisibleInfo.map(key => {
      const meta = AS_INFO_META[key];
      return `<th rowspan="2" class="h-no"${meta.align==='left'?' style="text-align:left"':''}>${meta.short}</th>`;
    }).join('');
    if (pdfShowAttendance)    hdr1 += `<th colspan="${dateColCount}" class="h-month">${mLabel}</th>`;
    if (summCols > 0) hdr1 += `<th colspan="${summCols}" class="h-no">Total</th>`;

    // Header row 2 — individual dates
    const hdr2 = (pdfShowAttendance ? mDates.map(d => {
      const dt   = new Date(d + 'T00:00:00');
      const dayN = dt.getDay();
      const isFri = dayN === 5, isSat = dayN === 6;
      return `<th class="h-date${isFri?' h-fri':isSat?' h-sat':''}">${DAY_S[dayN]}<br>${dt.getDate()}</th>`;
    }).join('') : '') +
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
        ${pdfVisibleInfo.map(key => {
          const meta = AS_INFO_META[key];
          const cls = 't-info' + (meta.mono ? ' mono' : '') + (meta.align === 'left' ? ' t-left' : '') + (key === 'fatherName' ? ' t-wrap' : '');
          return `<td class="${cls}">${meta.value(stu) || '—'}</td>`;
        }).join('')}
        ${pdfShowAttendance ? cells : ''}
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
            <col style="width:18px"/>
            <col style="width:90px"/>
            ${infoColsHTML}
            ${pdfShowAttendance ? mDates.map(() => '<col class="att-col"/>').join('') : ''}
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
    <title>Batchwise Detail Attendance — ${batch?.batchName||''}</title>
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
      table{border-collapse:collapse;width:100%;table-layout:fixed}
      th,td{border:1px solid #000;padding:2px 2px;font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

      /* ── Header types */
      .h-no{background:#f1f5f9;font-weight:700;text-align:center;font-size:7.5px;color:#475569}
      .h-name{text-align:left}
      .h-month{background:#dbeafe;color:#1e40af;font-weight:700;text-align:center;font-size:8px}
      .h-date{background:#f8fafc;font-weight:700;text-align:center;font-size:7px;color:#64748b;padding:2px 1px;width:12px}
      .h-fri{color:#2563eb}
      .h-sat{color:#d97706}
      .h-p{color:#16a34a}.h-a{color:#dc2626}.h-l{color:#d97706}.h-pct{color:#7c3aed}

      /* ── Attendance date col — very narrow so teacher can handwrite */
      col.att-col{width:12px;max-width:14px}

      /* ── Data cells */
      .t-num{text-align:center;color:#94a3b8;font-size:7.5px;font-family:monospace}
      .t-name{font-weight:600;color:#0f172a;font-size:8px;text-align:left;padding-left:3px;
        white-space:normal;overflow:visible;text-overflow:clip;word-break:break-word;line-height:1.15;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
      .t-info{text-align:center;color:#1e293b;font-size:9px;font-weight:600}
      .t-left{text-align:left;padding-left:3px;color:#1e293b;font-size:9px;font-weight:600}
      .t-wrap{white-space:normal;overflow:visible;text-overflow:clip;word-break:break-word;line-height:1.1;
        display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
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
        <div class="ph-title">Batchwise Detail Attendance — ${batch?.batchName||''}</div>
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
    _a.href = _blobUrl; _a.download = 'Batchwise-Detail-Attendance-' + (batch?.batchName||'Sheet') + '.html';
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
  const AS_FIXED_COLS = [
    { key: 'attendance', label: 'Attendance',    defaultHidden: false },
    { key: 'present',    label: 'P (Present)',   defaultHidden: false },
    { key: 'absent',     label: 'A (Absent)',    defaultHidden: false },
    { key: 'leave',      label: 'L (Leave)',     defaultHidden: false },
    { key: 'percent',    label: '% Attendance',  defaultHidden: false },
  ];
  const AS_INFO_DEFAULT_HIDDEN = { studentId: false, cnic: false, fatherName: true, studentPhone: false, guardianPhone: false, email: true };
  const _DEFAULT_HIDDEN = [
    ...AS_INFO_ORDER_DEFAULT.filter(k => AS_INFO_DEFAULT_HIDDEN[k]),
    ...AS_FIXED_COLS.filter(c => c.defaultHidden).map(c => c.key),
  ];
  function _getPrefs() {
    try {
      const r = AppState.get(AS_COL_KEY);
      if (r && Array.isArray(r.hidden)) return { hidden: r.hidden, order: _asNormalizeOrder(r.order) };
    } catch(e){}
    return { hidden: [..._DEFAULT_HIDDEN], order: [...AS_INFO_ORDER_DEFAULT] };
  }
  function _savePrefs(p) { AppState.set(AS_COL_KEY, p); }
  function _wireToggle(item, key) {
    item.querySelector('.as-col-mgr-chk').addEventListener('change', e => {
      const p = _getPrefs();
      if (e.target.checked) {
        p.hidden = p.hidden.filter(h => h !== key);
        item.classList.remove('col-hidden');
      } else {
        if (!p.hidden.includes(key)) p.hidden.push(key);
        item.classList.add('col-hidden');
      }
      _savePrefs(p);
      panel.classList.remove('open');
      btn.style.cssText = '';
      _renderSheet(output, batchId, selMonths);
    });
  }

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

    // ── Reorderable student-info columns ──
    prefs.order.forEach((key, idx) => {
      const meta = AS_INFO_META[key];
      const isVisible = !prefs.hidden.includes(key);
      const item = document.createElement('div');
      item.className = 'as-col-mgr-item' + (isVisible ? '' : ' col-hidden');
      item.innerHTML =
        `<div class="as-col-mgr-reorder">
           <button type="button" class="as-col-mgr-move" data-dir="up" ${idx===0?'disabled':''} title="Move up">▲</button>
           <button type="button" class="as-col-mgr-move" data-dir="down" ${idx===prefs.order.length-1?'disabled':''} title="Move down">▼</button>
         </div>` +
        `<input type="checkbox" class="as-col-mgr-chk" id="as_chk_${key}"${isVisible?' checked':''}/>`+
        `<label class="as-col-mgr-lbl" for="as_chk_${key}">${meta.label}</label>`;
      _wireToggle(item, key);
      item.querySelectorAll('.as-col-mgr-move').forEach(mbtn => {
        mbtn.addEventListener('click', e => {
          e.stopPropagation();
          const p   = _getPrefs();
          const ord = p.order;
          const i   = ord.indexOf(key);
          const j   = mbtn.dataset.dir === 'up' ? i - 1 : i + 1;
          if (i === -1 || j < 0 || j >= ord.length) return;
          [ord[i], ord[j]] = [ord[j], ord[i]];
          p.order = ord;
          _savePrefs(p);
          _renderList();
          _renderSheet(output, batchId, selMonths);
        });
      });
      list.appendChild(item);
    });

    // ── Fixed columns (attendance grid + P/A/L/%) — not reorderable ──
    const divider = document.createElement('div');
    divider.className = 'as-col-mgr-divider';
    divider.textContent = 'Attendance & Summary';
    list.appendChild(divider);

    AS_FIXED_COLS.forEach(col => {
      const isVisible = !prefs.hidden.includes(col.key);
      const item = document.createElement('div');
      item.className = 'as-col-mgr-item' + (isVisible ? '' : ' col-hidden');
      item.innerHTML =
        `<input type="checkbox" class="as-col-mgr-chk" id="as_chk_${col.key}"${isVisible?' checked':''}/>`+
        `<label class="as-col-mgr-lbl" for="as_chk_${col.key}">${col.label}</label>`;
      _wireToggle(item, col.key);
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
    const p = _getPrefs();
    _savePrefs({ hidden: [], order: p.order });
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
