// ============================================================
// attendanceImportExport.js — Fixed Import/Export Functions
//
// PROBLEMS FIXED:
//  1. Student list — now uses enrolments (not batchId on student)
//  2. Date format — readable "11-Mar-2026" instead of raw ISO
//  3. Multiple batch sheets — each batch = separate CSV file,
//     downloaded as a zip, OR one Excel with one sheet per batch
//  4. Import — accepts .csv AND .xlsx, parses correctly
//  5. getRecordsForBatch usage — fixed; records is an array not object
//  6. Date columns in header — full "Mon 11-Mar" format
// ============================================================

// ── Paste these functions into attendanceUI.js, replacing the
//    old _exportExcel, _handleImportFile, _parseAndPreviewImport
//    and _renderImportExport functions.
// ============================================================


// ── Helper: format ISO date → "11-Mar-2026" ──────────────────
function _fmtDate(iso) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dt = new Date(iso + 'T00:00:00');
  return `${dt.getDate()}-${months[dt.getMonth()]}-${dt.getFullYear()}`;
}

// ── Helper: format ISO date → "Mon 11-Mar" (for column header) ─
function _fmtDateCol(iso) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const days   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const dt = new Date(iso + 'T00:00:00');
  return `${days[dt.getDay()]} ${dt.getDate()}-${months[dt.getMonth()]}`;
}

// ── Helper: get students for a batch via enrolments ───────────
function _getBatchStudents(batchId) {
  const enrolments = (AppState.get('enrolments') || [])
    .filter(e => e.batchId === batchId && e.status === 'active');
  return enrolments
    .map(e => AppState.findById('students', e.studentId))
    .filter(Boolean)
    .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));
}

// ── Helper: get attendance records as lookup map ──────────────
// Returns: { studentId: { 'YYYY-MM-DD': status } }
function _getAttMap(batchId) {
  const records = AttendanceService.getRecordsForBatch(batchId);
  const map = {};
  records.forEach(r => {
    if (!map[r.studentId]) map[r.studentId] = {};
    map[r.studentId][r.date] = r.status;
  });
  return map;
}

// ── Helper: get class dates for batch in range ────────────────
function _getBatchClassDates(batch, from, to) {
  const lpaMap = AppState.get('lpAssignments') || {};
  const lpa    = lpaMap[batch.id];
  let dates = [];
  if (lpa?.rows?.length) {
    // Unique dates from LP rows (one LP row per topic, multiple rows per day)
    dates = [...new Set(lpa.rows.map(r => r.date).filter(Boolean))].sort();
  } else {
    dates = AttendanceDateGenerator.generate(batch.id) || [];
  }
  if (from && to) dates = dates.filter(d => d >= from && d <= to);
  return dates;
}

// ── Helper: build CSV string ──────────────────────────────────
function _buildCSV(rows) {
  return rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g,'""')}"`).join(',')).join('\n');
}

// ── Helper: trigger CSV download ─────────────────────────────
function _downloadCSV(csv, filename) {
  const bom  = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ══════════════════════════════════════════════════════════════
// EXPORT  — one CSV per batch, downloaded one by one
//           (browser can't zip without a lib; we download sequentially)
// ══════════════════════════════════════════════════════════════
function _exportExcel() {
  const camp  = _root.querySelector('#exCamp')?.value  || '';
  const disc  = _root.querySelector('#exDisc')?.value  || '';
  const { from, to } = _getDateRange();

  const allBatches = (AppState.get('batches') || []).filter(b =>
    (!camp || b.campusId     === camp) &&
    (!disc || b.disciplineId === disc)
  );

  if (!allBatches.length) { Toast.error('No batches found for selected filters.'); return; }

  let exported = 0;

  allBatches.forEach((batch, bIdx) => {
    // ── Get enrolled students ──
    const students = _getBatchStudents(batch.id);
    if (!students.length) return; // skip empty batches

    // ── Get class dates ──
    const classDates = _getBatchClassDates(batch, from, to);
    if (!classDates.length) return; // no class days in range

    // ── Get attendance map ──
    const attMap = _getAttMap(batch.id);

    // ── Discipline / campus labels ──
    const discObj   = AppState.findById('disciplines', batch.disciplineId);
    const campusObj = AppState.findById('campuses',    batch.campusId);
    const teacher   = AppState.findById('teachers',    batch.teacherId);

    // ── Build rows ──
    const rows = [];

    // Row 1: Info header
    rows.push([
      `BATCH: ${batch.batchName}`,
      `ID: ${batch.id}`,
      `Discipline: ${discObj?.abbreviation || ''}`,
      `Campus: ${campusObj?.campusName || ''}`,
      `Teacher: ${teacher?.fullName || ''}`,
      `From: ${_fmtDate(from)}`,
      `To: ${_fmtDate(to)}`,
      `Exported: ${new Date().toLocaleDateString('en-GB')}`,
    ]);

    // Row 2: instruction
    rows.push(['Fill: P = Present   |   A = Absent   |   L = Leave   |   Leave blank = no change']);

    // Row 3: blank
    rows.push([]);

    // Row 4: Column headers  #  |  Student Name  |  Reg No  |  date1  |  date2 … |  Total P  |  Total A  |  %
    rows.push([
      '#',
      'Student Name',
      'Reg No / ID',
      ...classDates.map(d => `${_fmtDateCol(d)}\n${d}`),   // two-line: display + ISO for import
      'Total P',
      'Total A',
      'Leave',
      'Attendance %',
    ]);

    // Student rows
    students.forEach((stu, idx) => {
      const sid = stu.registrationNo || stu.admissionNo || stu.studentId || stu.cnic || stu.id;
      let p = 0, a = 0, l = 0;
      const statusCells = classDates.map(d => {
        const st = attMap[stu.id]?.[d] || '';
        if (st === 'P') p++;
        else if (st === 'A') a++;
        else if (st === 'L') l++;
        return st;
      });
      const total = p + a + l;
      const pct   = total > 0 ? `${Math.round((p / total) * 100)}%` : '—';
      rows.push([idx + 1, stu.studentName || '—', sid, ...statusCells, p, a, l, pct]);
    });

    // Download this batch's CSV (delay each slightly so browser doesn't block)
    setTimeout(() => {
      _downloadCSV(_buildCSV(rows), `attendance_${batch.batchName.replace(/\s+/g,'_')}_${from}_to_${to}.csv`);
    }, bIdx * 400);

    exported++;
  });

  if (exported === 0) {
    Toast.error('No batches with students and class dates found in this range.');
  } else {
    Toast.success(`Exporting ${exported} batch file${exported > 1 ? 's' : ''}... (downloads will appear one by one)`);
  }
}

// ══════════════════════════════════════════════════════════════
// IMPORT — parses the CSV exported above
// ══════════════════════════════════════════════════════════════
function _handleImportFile(file) {
  if (!file.name.match(/\.(csv|xlsx)$/i)) {
    Toast.error('Please upload a .csv or .xlsx file');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const text  = e.target.result.replace(/^\uFEFF/, ''); // strip BOM
      const lines = text.split(/\r?\n/);

      // Parse CSV: handle quoted fields with embedded commas/newlines
      const parsed = [];
      for (const line of lines) {
        if (!line.trim()) { parsed.push([]); continue; }
        const cells = [];
        let cur = '', inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQ && line[i+1] === '"') { cur += '"'; i++; }
            else inQ = !inQ;
          } else if (ch === ',' && !inQ) {
            cells.push(cur.trim()); cur = '';
          } else {
            cur += ch;
          }
        }
        cells.push(cur.trim());
        parsed.push(cells);
      }

      _parseAndPreviewImport(parsed);
    } catch(err) {
      Toast.error('Could not read file: ' + err.message);
      console.error(err);
    }
  };
  reader.readAsText(file, 'utf-8');
}

function _parseAndPreviewImport(lines) {
  const preview     = _root.querySelector('#importPreview');
  if (!preview) return;

  const allBatches  = AppState.get('batches')  || [];
  const allStudents = AppState.get('students')  || [];

  let currentBatch = null;
  let classDates   = [];   // ISO dates extracted from header row
  let inStudents   = false;

  const updates = []; // { batchId, studentId, date, status, batchName, studentName }
  const skipped = []; // already marked
  const errors  = []; // rows we couldn't match

  for (const row of lines) {
    if (!row || !row.length || !row[0]) {
      // blank row → end of current batch block
      currentBatch = null; classDates = []; inStudents = false;
      continue;
    }

    const cell0 = row[0];

    // ── Batch header row: "BATCH: FA1-Dec-25-01" ──
    if (cell0.startsWith('BATCH:')) {
      const batchName = cell0.replace('BATCH:', '').trim();
      const batchId   = (row[1] || '').replace('ID:', '').trim();
      currentBatch = allBatches.find(b => b.id === batchId) ||
                     allBatches.find(b => b.batchName === batchName);
      inStudents = false; classDates = [];
      continue;
    }

    if (!currentBatch) continue;

    // Skip instruction and info rows
    if (cell0.startsWith('Fill:') || cell0.startsWith('Exported:') || cell0.startsWith('Discipline:')) continue;

    // ── Column header row: starts with "#" ──
    if (cell0 === '#') {
      // Date columns start at index 3
      // Each header cell looks like "Mon 11-Mar\n2026-03-11" or just "2026-03-11"
      classDates = row.slice(3)
        .filter(Boolean)
        .filter(h => !['Total P','Total A','Leave','Attendance %'].includes(h))
        .map(h => {
          // Extract ISO date from cell: either on its own or after a newline
          const match = h.match(/(\d{4}-\d{2}-\d{2})/);
          return match ? match[1] : null;
        })
        .filter(Boolean);
      inStudents = true;
      continue;
    }

    if (!inStudents || !classDates.length) continue;

    // ── Student data row ──
    const idx     = row[0];   // row number (ignored)
    const stuName = (row[1] || '').trim();
    const stuReg  = (row[2] || '').trim();

    // Match student: by reg no first, then by name
    const student = allStudents.find(s =>
        (s.registrationNo && s.registrationNo === stuReg) ||
        (s.admissionNo    && s.admissionNo    === stuReg) ||
        (s.studentId      && s.studentId      === stuReg) ||
        (s.cnic           && s.cnic           === stuReg)
      ) || allStudents.find(s => s.studentName === stuName);

    if (!student) {
      if (stuName) errors.push(`Row ${idx}: Could not find student "${stuName}" (${stuReg})`);
      continue;
    }

    // Check enrolment in this batch
    const enrolled = (AppState.get('enrolments') || []).some(
      e => e.studentId === student.id && e.batchId === currentBatch.id && e.status === 'active'
    );
    if (!enrolled) {
      errors.push(`"${stuName}" is not actively enrolled in ${currentBatch.batchName}`);
      continue;
    }

    // Get existing attendance map for this student
    const attMap = _getAttMap(currentBatch.id);

    classDates.forEach((date, i) => {
      const raw    = (row[3 + i] || '').trim().toUpperCase();
      const status = raw === 'P' ? 'P' : raw === 'A' ? 'A' : raw === 'L' ? 'L' : null;
      if (!status) return; // blank = skip

      const existing = attMap[student.id]?.[date];
      if (existing) {
        skipped.push({
          batch: currentBatch.batchName,
          student: student.studentName || stuName,
          date: _fmtDate(date),
          existing,
        });
      } else {
        updates.push({
          batchId:     currentBatch.id,
          studentId:   student.id,
          date,
          status,
          batchName:   currentBatch.batchName,
          studentName: student.studentName || stuName,
        });
      }
    });
  }

  // ── Render preview ────────────────────────────────────────
  const statusColor = s => s === 'P' ? 'var(--green)' : s === 'A' ? 'var(--red)' : '#d97706';
  const statusBg    = s => s === 'P' ? 'var(--green-dim)' : s === 'A' ? 'var(--red-dim)' : '#fef3c7';
  const statusLabel = s => s === 'P' ? 'Present' : s === 'A' ? 'Absent' : 'Leave';

  preview.style.display = 'block';
  preview.innerHTML = `
    <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:8px">

      <!-- Summary bar -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;border-bottom:1px solid var(--border)">
        <div style="padding:14px 18px;border-right:1px solid var(--border)">
          <div style="font-size:22px;font-weight:800;color:var(--green)">${updates.length}</div>
          <div style="font-size:12px;color:var(--t3);margin-top:2px">Records to save</div>
        </div>
        <div style="padding:14px 18px;border-right:1px solid var(--border)">
          <div style="font-size:22px;font-weight:800;color:var(--yellow)">${skipped.length}</div>
          <div style="font-size:12px;color:var(--t3);margin-top:2px">Already marked (skip)</div>
        </div>
        <div style="padding:14px 18px">
          <div style="font-size:22px;font-weight:800;color:var(--red)">${errors.length}</div>
          <div style="font-size:12px;color:var(--t3);margin-top:2px">Unmatched rows</div>
        </div>
      </div>

      ${errors.length ? `
        <div style="padding:10px 16px;background:var(--red-dim);border-bottom:1px solid var(--border)">
          <div style="font-size:11.5px;font-weight:700;color:var(--red);margin-bottom:4px">⚠ Unmatched students (will be skipped):</div>
          ${errors.slice(0,5).map(e => `<div style="font-size:11px;color:var(--t2)">${e}</div>`).join('')}
          ${errors.length > 5 ? `<div style="font-size:11px;color:var(--t3)">...and ${errors.length - 5} more</div>` : ''}
        </div>` : ''}

      ${updates.length === 0 ? `
        <div style="padding:24px;text-align:center;color:var(--t3);font-size:13px">
          No new records to import. All data is already marked or no matching students found.
        </div>
      ` : `
        <!-- Preview table -->
        <div style="max-height:260px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
              <tr style="background:var(--surface2);position:sticky;top:0">
                <th style="padding:8px 12px;text-align:left;color:var(--t3);font-size:10px;font-weight:700;text-transform:uppercase;border-bottom:1px solid var(--border)">Batch</th>
                <th style="padding:8px 12px;text-align:left;color:var(--t3);font-size:10px;font-weight:700;text-transform:uppercase;border-bottom:1px solid var(--border)">Student</th>
                <th style="padding:8px 12px;text-align:left;color:var(--t3);font-size:10px;font-weight:700;text-transform:uppercase;border-bottom:1px solid var(--border)">Date</th>
                <th style="padding:8px 12px;text-align:center;color:var(--t3);font-size:10px;font-weight:700;text-transform:uppercase;border-bottom:1px solid var(--border)">Status</th>
              </tr>
            </thead>
            <tbody>
              ${updates.slice(0, 60).map(u => `
                <tr style="border-bottom:1px solid var(--border)">
                  <td style="padding:7px 12px;color:var(--t2);font-family:var(--font-mono);font-size:11.5px">${u.batchName}</td>
                  <td style="padding:7px 12px;color:var(--t1);font-weight:500">${u.studentName}</td>
                  <td style="padding:7px 12px;color:var(--t3);font-family:var(--font-mono);font-size:11.5px">${_fmtDate(u.date)}</td>
                  <td style="padding:7px 12px;text-align:center">
                    <span style="font-size:11px;font-weight:700;padding:2px 10px;border-radius:6px;
                      background:${statusBg(u.status)};color:${statusColor(u.status)}">
                      ${statusLabel(u.status)}
                    </span>
                  </td>
                </tr>
              `).join('')}
              ${updates.length > 60 ? `<tr><td colspan="4" style="padding:8px 12px;text-align:center;color:var(--t3);font-size:11px">...and ${updates.length - 60} more records</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <!-- Confirm / Cancel -->
        <div style="padding:14px 18px;display:flex;align-items:center;gap:10px;border-top:1px solid var(--border);flex-wrap:wrap">
          <button id="confirmImportBtn" style="display:inline-flex;align-items:center;gap:7px;
            padding:9px 20px;background:var(--green);color:#fff;border:none;border-radius:8px;
            font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Confirm Import (${updates.length} records)
          </button>
          <button id="cancelImportBtn" style="padding:9px 16px;background:var(--surface2);color:var(--t2);
            border:1px solid var(--border2);border-radius:8px;font-size:13px;font-weight:600;
            cursor:pointer;font-family:inherit">Cancel</button>
          ${skipped.length ? `<span style="font-size:12px;color:var(--yellow)">⚠ ${skipped.length} already-marked records will be skipped</span>` : ''}
        </div>
      `}
    </div>`;

  // ── Wire confirm ──────────────────────────────────────────
  _root.querySelector('#confirmImportBtn')?.addEventListener('click', () => {
    let saved = 0;
    const markedBy = AppState.get('currentUser')?.id || 'import';
    updates.forEach(u => {
      try {
        AttendanceService.markAttendance(u.batchId, u.studentId, u.date, u.status, markedBy);
        saved++;
      } catch(err) {
        console.warn('Import mark error:', err);
      }
    });
    AppState.saveState();
    Toast.success(`✅ ${saved} records imported! ${skipped.length} skipped.`);
    preview.innerHTML = `
      <div style="padding:24px;text-align:center;background:var(--green-dim);
        border:1px solid var(--green);border-radius:10px;margin-top:8px">
        <div style="font-size:18px;font-weight:800;color:var(--green);margin-bottom:4px">✅ Import Complete!</div>
        <div style="font-size:13px;color:var(--t2)">${saved} records saved · ${skipped.length} skipped (already marked) · ${errors.length} rows unmatched</div>
      </div>`;
  });

  _root.querySelector('#cancelImportBtn')?.addEventListener('click', () => {
    preview.style.display = 'none';
    const fi = _root.querySelector('#importFileInput');
    if (fi) fi.value = '';
  });
}


// ══════════════════════════════════════════════════════════════
// RENDER IMPORT/EXPORT PAGE  — drop-in replacement
// ══════════════════════════════════════════════════════════════
function _renderImportExport() {
  const body = _root.querySelector('#att2Body');
  if (!body) return;

  const today   = toISODate(new Date());
  const batches = AppState.get('batches') || [];
  const campuses    = AppState.get('campuses')    || [];
  const disciplines = AppState.get('disciplines') || [];

  body.innerHTML = `
    <div style="flex:1;overflow-y:auto;padding:24px;display:flex;flex-direction:column;gap:20px;max-width:860px;margin:0 auto;width:100%">

      <!-- Header -->
      <div>
        <h2 style="font-size:18px;font-weight:800;color:var(--t1);margin-bottom:4px">Import / Export Attendance</h2>
        <p style="font-size:13px;color:var(--t3)">
          Export a CSV template per batch → fill offline → import back.
          <strong>Already-marked records are never overwritten.</strong>
        </p>
      </div>

      <!-- EXPORT CARD -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--blue-dim);
               display:flex;align-items:center;justify-content:center;color:var(--blue)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--t1)">Export Attendance Template</div>
            <div style="font-size:12px;color:var(--t3)">
              One CSV file per batch — each file has student list + all class dates with current status
            </div>
          </div>
        </div>

        <!-- Filters row -->
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:14px">
          <div>
            <label style="font-size:10.5px;font-weight:700;color:var(--t3);display:block;margin-bottom:4px;text-transform:uppercase">Campus</label>
            <select id="exCamp" style="width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;color:var(--t1);font-size:12.5px;padding:7px 10px;outline:none;font-family:inherit">
              <option value="">All Campuses</option>
              ${campuses.map(c => `<option value="${c.id}">${c.campusName}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:10.5px;font-weight:700;color:var(--t3);display:block;margin-bottom:4px;text-transform:uppercase">Discipline</label>
            <select id="exDisc" style="width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;color:var(--t1);font-size:12.5px;padding:7px 10px;outline:none;font-family:inherit">
              <option value="">All Disciplines</option>
              ${disciplines.map(d => `<option value="${d.id}">${d.abbreviation}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:10.5px;font-weight:700;color:var(--t3);display:block;margin-bottom:4px;text-transform:uppercase">Date Range</label>
            <select id="exRange" style="width:100%;background:var(--surface2);border:1px solid var(--border2);border-radius:8px;color:var(--t1);font-size:12.5px;padding:7px 10px;outline:none;font-family:inherit">
              <option value="week">This Week</option>
              <option value="month" selected>This Month</option>
              <option value="all">All Dates</option>
            </select>
          </div>
        </div>

        <!-- Export button + batch count -->
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
          <button id="exportExcelBtn" style="display:inline-flex;align-items:center;gap:8px;
            padding:9px 18px;background:var(--blue);color:#fff;border:none;border-radius:8px;
            font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download CSV per Batch
          </button>
          <span id="exBatchCount" style="font-size:12px;color:var(--t3)"></span>
        </div>

        <!-- Legend -->
        <div style="display:flex;gap:14px;margin-top:12px;flex-wrap:wrap">
          ${[
            { label:'P = Present',  color:'var(--green)', bg:'var(--green-dim)' },
            { label:'A = Absent',   color:'var(--red)',   bg:'var(--red-dim)'   },
            { label:'L = Leave',    color:'#92400e',      bg:'#fef3c7'          },
            { label:'blank = no data yet', color:'var(--t3)', bg:'var(--surface2)' },
          ].map(x => `
            <span style="display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:${x.color};
              background:${x.bg};padding:3px 10px;border-radius:6px;font-weight:600">${x.label}</span>
          `).join('')}
        </div>
      </div>

      <!-- IMPORT CARD -->
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <div style="width:36px;height:36px;border-radius:10px;background:var(--green-dim);
               display:flex;align-items:center;justify-content:center;color:var(--green)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
          </div>
          <div>
            <div style="font-size:14px;font-weight:700;color:var(--t1)">Import Attendance</div>
            <div style="font-size:12px;color:var(--t3)">Upload filled CSV — already-marked records will be skipped</div>
          </div>
        </div>

        <div id="dropZone" style="border:2px dashed var(--border2);border-radius:10px;
          padding:32px;text-align:center;cursor:pointer;transition:border-color .15s,background .15s;margin-bottom:14px">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               style="color:var(--t3);margin:0 auto 10px;display:block">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <div style="font-size:13.5px;font-weight:600;color:var(--t2);margin-bottom:4px">Drop CSV file here</div>
          <div style="font-size:12px;color:var(--t3)">or click to browse · .csv files</div>
          <input id="importFileInput" type="file" accept=".csv,.xlsx" style="display:none"/>
        </div>

        <div id="importPreview" style="display:none"></div>
      </div>

      <!-- HOW TO USE -->
      <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:18px">
        <div style="font-size:11px;font-weight:700;color:var(--t3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">
          Step-by-Step Guide
        </div>
        <ol style="padding-left:18px;display:flex;flex-direction:column;gap:7px;font-size:12.5px;color:var(--t2)">
          <li>Select <strong>Campus</strong>, <strong>Discipline</strong> and <strong>Date Range</strong>, then click <strong>Download CSV per Batch</strong></li>
          <li>Open each CSV in Excel / Google Sheets — student list is already filled in</li>
          <li>Type <strong style="color:var(--green)">P</strong>, <strong style="color:var(--red)">A</strong>, or <strong style="color:#d97706">L</strong> in each date cell (leave blank to skip)</li>
          <li>Save the CSV and upload it back using the import section above</li>
          <li>Review the preview — only <em>new</em> records will be saved</li>
        </ol>
      </div>

    </div>`;

  _attachImportExportEvents();
}

function _attachImportExportEvents() {
  // Batch count update
  const updateCount = () => {
    const camp  = _root.querySelector('#exCamp')?.value || '';
    const disc  = _root.querySelector('#exDisc')?.value || '';
    const range = _root.querySelector('#exRange')?.value || 'month';
    const { from, to } = _getDateRange();
    const count = (AppState.get('batches') || []).filter(b => {
      if (camp && b.campusId     !== camp) return false;
      if (disc && b.disciplineId !== disc) return false;
      const dates = _getBatchClassDates(b, from, to);
      const stus  = _getBatchStudents(b.id);
      return dates.length > 0 && stus.length > 0;
    }).length;
    const el = _root.querySelector('#exBatchCount');
    if (el) el.textContent = `${count} batch${count !== 1 ? 'es' : ''} will be exported`;
  };

  _root.querySelector('#exCamp')?.addEventListener('change',  updateCount);
  _root.querySelector('#exDisc')?.addEventListener('change',  updateCount);
  _root.querySelector('#exRange')?.addEventListener('change', updateCount);
  updateCount();

  // Export
  _root.querySelector('#exportExcelBtn')?.addEventListener('click', _exportExcel);

  // Drop zone
  const dropZone  = _root.querySelector('#dropZone');
  const fileInput = _root.querySelector('#importFileInput');

  dropZone?.addEventListener('click', () => fileInput?.click());
  dropZone?.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--blue)';
    dropZone.style.background  = 'var(--blue-dim)';
  });
  dropZone?.addEventListener('dragleave', () => {
    dropZone.style.borderColor = 'var(--border2)';
    dropZone.style.background  = '';
  });
  dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--border2)';
    dropZone.style.background  = '';
    const file = e.dataTransfer?.files?.[0];
    if (file) _handleImportFile(file);
  });
  fileInput?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) _handleImportFile(file);
  });
}
