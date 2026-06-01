// ============================================================
// modules/lecturePlan/lecturePlanExcel.js
// Excel Export + Import for Lecture Plan rows
// Uses SheetJS (xlsx) — loaded from CDN if not already present
// ============================================================

import { getLPMeta, getLPRows, saveLPRows } from './lecturePlanService.js';
import { autoDetectType, rowHours }         from './lecturePlanService.js';
import { Toast }                            from '../../utils/helpers.js';

// ── Load SheetJS from CDN (once) ──────────────────────────────
function _loadSheetJS() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(window.XLSX); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload  = () => resolve(window.XLSX);
    s.onerror = () => reject(new Error('SheetJS load failed'));
    document.head.appendChild(s);
  });
}

// ── Column definitions ────────────────────────────────────────
// These columns appear in the exported Excel file.
// User can edit: Topic, Type, Hours
// Row ID is included (hidden column A) so import can match rows.
const COLS = [
  { key: 'id',    header: 'ID (do not edit)',  width: 28 },
  { key: 'no',    header: '#',                 width: 5  },
  { key: 'topic', header: 'Particulars',        width: 48 },
  { key: 'type',  header: 'Type',               width: 14 },
  { key: 'hours', header: 'Hours',              width: 8  },
];

const VALID_TYPES = ['Lecture', 'Test', 'Midterm', 'Mock', 'Holiday', 'Revision', 'Other'];

// ── Export: one LP → Excel ────────────────────────────────────
export async function exportLPToExcel(lpId) {
  try {
    const XLSX = await _loadSheetJS();

    const meta = getLPMeta().find(m => m.id === lpId);
    if (!meta) { Toast.error('Plan not found.'); return; }

    const rows = getLPRows(lpId);
    if (!rows.length) { Toast.error('No rows to export.'); return; }

    const wb = XLSX.utils.book_new();

    // ── Sheet 1: Rows (editable) ──────────────────────────────
    const sheetData = [
      // Header row
      COLS.map(c => c.header),
      // Data rows
      ...rows.map((r, i) => [
        r.id,
        i + 1,
        r.topic || '',
        r.type  || 'Lecture',
        rowHours(r),
      ]),
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    // Column widths
    ws['!cols'] = COLS.map(c => ({ wch: c.width }));

    // Style header row (bold, background) — basic cell props
    const headerStyle = {
      font:    { bold: true, color: { rgb: 'FFFFFF' } },
      fill:    { fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center' },
    };
    COLS.forEach((_, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (ws[cellRef]) ws[cellRef].s = headerStyle;
    });

    // Freeze top row
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    // Row colors by type
    const typeColors = {
      test:     'FEF3C7',
      midterm:  'FDE68A',
      mock:     'EDE9FE',
      holiday:  'FEE2E2',
      revision: 'CFFAFE',
      lecture:  'FFFFFF',
      other:    'F1F5F9',
    };
    rows.forEach((r, ri) => {
      const color = typeColors[(r.type || 'lecture').toLowerCase()] || 'FFFFFF';
      COLS.forEach((_, ci) => {
        const cellRef = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            fill: { fgColor: { rgb: color } },
            alignment: ci === 1 ? { horizontal: 'center' } : { horizontal: 'left' },
          };
        }
      });
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Rows');

    // ── Sheet 2: Info (read-only reference) ──────────────────
    const infoData = [
      ['Field',         'Value'],
      ['Plan Code',     meta.code],
      ['Plan Title',    meta.title],
      ['Description',   meta.desc || ''],
      ['Discipline',    meta.disciplineName || ''],
      ['Subject',       meta.subjectName    || ''],
      ['Total Rows',    rows.length],
      [''],
      ['VALID TYPES',   VALID_TYPES.join(', ')],
      [''],
      ['INSTRUCTIONS', ''],
      ['1', 'Edit only columns: Particulars, Type, Hours'],
      ['2', 'Do NOT edit the ID column (column A)'],
      ['3', 'Do NOT add or remove rows — row count must stay same'],
      ['4', 'Type must be one of the VALID TYPES listed above'],
      ['5', 'Save the file and import it back using "Import Excel"'],
    ];

    const wsInfo = XLSX.utils.aoa_to_sheet(infoData);
    wsInfo['!cols'] = [{ wch: 18 }, { wch: 60 }];

    // Bold header
    ['A1','B1'].forEach(ref => {
      if (wsInfo[ref]) wsInfo[ref].s = { font: { bold: true }, fill: { fgColor: { rgb: 'EFF6FF' } } };
    });

    XLSX.utils.book_append_sheet(wb, wsInfo, 'Info');

    // ── Download ──────────────────────────────────────────────
    const fileName = `LP_${meta.code}_${new Date().toISOString().slice(0,10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    Toast.success(`Exported: ${fileName}`);

  } catch (err) {
    console.error('[LP Excel Export]', err);
    Toast.error('Export failed: ' + err.message);
  }
}

// ── Import: Excel → LP rows ───────────────────────────────────
export async function importLPFromExcel(lpId, file, onDone) {
  try {
    const XLSX = await _loadSheetJS();

    const meta = getLPMeta().find(m => m.id === lpId);
    if (!meta) { Toast.error('Plan not found.'); return; }

    const buffer = await file.arrayBuffer();
    const wb     = XLSX.read(buffer, { type: 'array' });

    // Read "Rows" sheet
    const ws = wb.Sheets['Rows'];
    if (!ws) { Toast.error('Invalid file — "Rows" sheet not found.'); return; }

    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    if (raw.length < 2) { Toast.error('No data rows found in Excel.'); return; }

    // Skip header row
    const dataRows = raw.slice(1).filter(row => row[0] || row[2]); // must have ID or topic

    if (!dataRows.length) { Toast.error('No valid rows found.'); return; }

    // Get existing rows to merge (preserve date, status, remarks)
    const existingRows = getLPRows(lpId);
    const existingById = {};
    existingRows.forEach(r => { existingById[r.id] = r; });

    const errors   = [];
    const newRows  = [];

    dataRows.forEach((row, i) => {
      const rowNo   = i + 2; // Excel row number (1=header, so data starts at 2)
      const id      = String(row[0] || '').trim();
      const topic   = String(row[2] || '').trim();
      const typeRaw = String(row[3] || '').trim();
      const hrsRaw  = row[4];

      // Validate type
      const typeNorm = VALID_TYPES.find(t => t.toLowerCase() === typeRaw.toLowerCase());
      if (typeRaw && !typeNorm) {
        errors.push(`Row ${rowNo}: Invalid type "${typeRaw}" — using auto-detect`);
      }

      const type  = typeNorm || autoDetectType(topic);
      const hours = hrsRaw !== '' && !isNaN(parseFloat(hrsRaw)) ? parseFloat(hrsRaw) : undefined;

      // Merge with existing row (preserve date, status, remarks)
      const existing = existingById[id] || {};

      newRows.push({
        id:      id || existing.id || ('row-' + Date.now() + '-' + i),
        topic,
        type,
        ...(hours !== undefined ? { hours } : {}),
        date:    existing.date    || '',
        status:  existing.status  || 'Pending',
        remarks: existing.remarks || '',
      });
    });

    if (errors.length) {
      Toast.info(`Imported with ${errors.length} warning(s). Check console.`);
      console.warn('[LP Excel Import] Warnings:', errors);
    }

    // Save
    saveLPRows(lpId, newRows);
    Toast.success(`✅ ${newRows.length} rows imported successfully.`);

    if (typeof onDone === 'function') onDone(newRows);

  } catch (err) {
    console.error('[LP Excel Import]', err);
    Toast.error('Import failed: ' + err.message);
  }
}
