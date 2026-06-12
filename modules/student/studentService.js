// ============================================================
// modules/student/studentService.js — Student Business Logic
// Simplified: Student ID (auto), CNIC, Name, Discipline,
//             Date of Admission, Session (auto-detected)
// ============================================================

import { AppState, generateID } from '../../utils/state.js';

const KEY = 'students';

// ── CNIC Utilities ────────────────────────────────────────────

export function cnicDigitsOnly(raw) {
  return (raw || '').replace(/\D/g, '');
}

export function formatCNIC(raw) {
  const digits = cnicDigitsOnly(raw);
  if (digits.length !== 13) return null;
  return digits.slice(0, 5) + '-' + digits.slice(5, 12) + '-' + digits.slice(12);
}

export function validateCNIC(raw) {
  const trimmed = (raw || '').trim();
  if (!trimmed) return { valid: false, message: 'CNIC is required.' };
  const digits = cnicDigitsOnly(trimmed);
  if (digits.length !== 13) {
    return {
      valid: false,
      message: 'CNIC must be 13 digits. You entered ' + digits.length +
               ' digit' + (digits.length !== 1 ? 's' : '') + '. Format: XXXXX-XXXXXXX-X',
    };
  }
  if (trimmed.includes('-') && !/^\d{5}-\d{7}-\d$/.test(trimmed)) {
    return { valid: false, message: 'CNIC format must be: XXXXX-XXXXXXX-X  (5 – 7 – 1 digits)' };
  }
  return { valid: true, formatted: formatCNIC(trimmed) };
}

// ── Session auto-detect from admission date ───────────────────
// Jul–Dec of year Y → Dec-YY   (e.g. 2025-09-15 → Dec-25)
// Jan–Jun of year Y → June-YY  (e.g. 2026-04-01 → June-26)
export function sessionFromDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  const y = parseInt(parts[0]);
  const m = parseInt(parts[1]);
  if (!y || !m) return '';
  if (m >= 7) return 'Dec-'  + String(y).slice(2);
  return 'June-' + String(y).slice(2);
}

export function sessionLabel(value) {
  if (!value) return '';
  const parts = value.split('-');
  const name  = parts[0];
  const yy    = parseInt(parts[1]);
  const y     = 2000 + yy;
  if (name === 'Dec')  return 'Jul ' + y + ' — Dec ' + y;
  if (name === 'June') return 'Jan ' + y + ' — Jun ' + y;
  return value;
}

// ── Generate Student ID ───────────────────────────────────────
// Format: [D][MM][YY][SSSS][G]  — 10 digits total
//   D     : 1 = ACCA,  2 = CA
//   MM    : admission month (1–12, no leading zero for Jan–Sep)
//   YY    : 2-digit year (e.g. 26 for 2026)
//   SSSS  : 4-digit unique sequence (0000–9999)
//   G     : gender digit — odd (1,3,5,7,9) = Male, even (0,2,4,6,8) = Female
//
// disciplineCode : 'ACCA' | 'CA'
// admissionDate  : 'YYYY-MM-DD'
// gender         : 'male' | 'female'
export function generateStudentId(disciplineCode, admissionDate, gender) {
  return _generateStudentIdExcluding(disciplineCode, admissionDate, gender, new Set());
}

// ── Migrate existing student IDs to new format ────────────────
// Call once at app startup to replace any old-format IDs.
export function migrateStudentIds() {
  // Run-once guard: after first successful migration, never run again
  if (AppState.get('_studentIdsMigrated')) return 0;

  const students = AppState.get('students') || [];
  if (!students.length) {
    AppState.set('_studentIdsMigrated', true);
    return 0;
  }

  // Check if migration is even needed — new IDs are exactly 10 digits
  const needsMigration = students.some(function(s) {
    return !s.studentId || String(s.studentId).length !== 10;
  });
  if (!needsMigration) {
    AppState.set('_studentIdsMigrated', true);
    return 0;
  }

  // Hoist discipline lookup outside loop (one read, not N reads)
  const disciplines = AppState.get('disciplines') || [];
  const discMap = {};
  disciplines.forEach(function(d) { discMap[d.id] = d.abbreviation; });

  // Build assigned-IDs set once (not inside each iteration)
  const assignedIds = new Set(
    students.map(function(s) { return s.studentId; }).filter(Boolean)
  );

  // Compute all patches in memory first — no AppState writes yet
  const patches = [];
  students.forEach(function(student) {
    if (student.studentId && String(student.studentId).length === 10) return;
    if (student.studentId) assignedIds.delete(student.studentId);
    const discCode = discMap[student.disciplineId] || '';
    const gender   = student.gender || 'male';
    const newId    = _generateStudentIdExcluding(discCode, student.dateOfAdmission, gender, assignedIds);
    assignedIds.add(newId);
    patches.push({ id: student.id, studentId: newId });
  });

  // Batch write — one operation instead of N individual updates
  if (patches.length) {
    if (AppState.batchUpdate) {
      AppState.batchUpdate('students', patches);
    } else {
      patches.forEach(function(p) {
        AppState.update('students', p.id, { studentId: p.studentId });
      });
    }
  }

  AppState.set('_studentIdsMigrated', true);
  return patches.length;
}

// ── Internal: generate ID excluding a custom Set of used IDs ──
function _generateStudentIdExcluding(disciplineCode, admissionDate, gender, excludeSet) {
  const disciplineDigit = (disciplineCode || '').toUpperCase() === 'CA' ? '2' : '1';

  let monthStr = '', yearStr = '';
  if (admissionDate) {
    const parts = admissionDate.split('-');
    const yr    = parseInt(parts[0]);
    const mo    = parseInt(parts[1]);
    monthStr = isNaN(mo) ? '01' : String(mo);
    yearStr  = isNaN(yr) ? '00' : String(yr).slice(2);
  } else {
    const now = new Date();
    monthStr  = String(now.getMonth() + 1);
    yearStr   = String(now.getFullYear()).slice(2);
  }

  const genderPool = (gender || '').toLowerCase() === 'female'
    ? [0, 2, 4, 6, 8]
    : [1, 3, 5, 7, 9];

  const paddedMonth = monthStr.padStart(2, '0');
  const fixedPrefix = disciplineDigit + paddedMonth + yearStr; // 5 chars

  // excludeSet already contains all used IDs passed by caller.
  // For direct calls (generateStudentId), we merge with stored IDs.
  const mergedExclude = excludeSet.size > 0
    ? excludeSet
    : new Set((AppState.get('students') || []).map(function(s) { return s.studentId; }));

  for (let seq = 0; seq <= 9999; seq++) {
    const seqStr = String(seq).padStart(4, '0');
    for (let gi = 0; gi < genderPool.length; gi++) {
      const candidate = fixedPrefix + seqStr + String(genderPool[gi]);
      if (!mergedExclude.has(candidate)) return candidate;
    }
  }

  // Fallback (extremely unlikely)
  const seqFallback = String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  const gFallback   = String(genderPool[Math.floor(Math.random() * genderPool.length)]);
  return fixedPrefix + seqFallback + gFallback;
}

// ── Uniqueness checks ─────────────────────────────────────────
export function isDuplicateCNIC(formattedCNIC, excludeId) {
  return (AppState.get(KEY) || []).some(function(s) {
    return s.cnic === formattedCNIC && s.id !== excludeId;
  });
}

export function isDuplicateStudentId(studentId, excludeId) {
  return (AppState.get(KEY) || []).some(function(s) {
    return s.studentId === studentId && s.id !== excludeId;
  });
}

// ── Route options per discipline ──────────────────────────────
export const ROUTE_OPTIONS = {}; // kept for backward-compat

export function getDiscRoutes(disciplineId) {
  const disc = AppState.findById('disciplines', disciplineId);
  if (!disc || !disc.hasRoutes || !disc.routes || !disc.routes.length) return [];
  return disc.routes;
}

// Normalize exempted papers — preserve full snapshot { id, subjectCode, subjectName }
// so that future edits to subjects.js never corrupt historical student records.
function _sanitizeExemptedPapers(raw) {
  if (!raw) return { count: 0, codes: [], papers: [] };
  const papers = (Array.isArray(raw.papers) ? raw.papers : [])
    .map(function(p) {
      return {
        id:          p.id          || '',
        subjectCode: (p.subjectCode || '').toUpperCase().trim(),
        subjectName: (p.subjectName || '').trim(),
      };
    })
    .filter(function(p) { return p.subjectCode; });
  // codes array kept in sync for CSV export / legacy display
  const codes = papers.map(function(p) { return p.subjectCode; });
  return { count: papers.length, codes, papers };
}

// ── CRUD ──────────────────────────────────────────────────────
export const StudentService = {

  getStudents(opts) {
    opts = opts || {};
    let list = AppState.get(KEY) || [];
    if (opts.disciplineId) list = list.filter(function(s) { return s.disciplineId === opts.disciplineId; });
    if (opts.session)      list = list.filter(function(s) { return s.session      === opts.session; });
    return list;
  },

  addStudent(data) {
    if (!data.studentName?.trim()) return { success: false, message: 'Student name is required.' };
    if (!data.disciplineId)        return { success: false, message: 'Discipline is required.' };
    if (!data.dateOfAdmission)     return { success: false, message: 'Date of admission is required.' };
    if (!data.gender)              return { success: false, message: 'Gender is required.' };

    // CNIC is optional — old data may not have it
    let cnic = '';
    if (data.cnicRaw && data.cnicRaw.trim()) {
      const cnicResult = validateCNIC(data.cnicRaw);
      if (!cnicResult.valid) return { success: false, message: cnicResult.message };
      cnic = cnicResult.formatted;
      if (isDuplicateCNIC(cnic)) {
        return { success: false, message: 'CNIC ' + cnic + ' is already registered.' };
      }
    }

    // Resolve discipline code (abbreviation) for ID generation
    const discRecord = (AppState.get('disciplines') || []).find(function(d) { return d.id === data.disciplineId; });
    const discCode   = discRecord?.abbreviation || '';

    const studentId = generateStudentId(discCode, data.dateOfAdmission, data.gender);

    // Campus snapshot — freeze name at time of enrollment so renames don't corrupt records
    const campusRecord = data.campusId ? (AppState.findById('campuses', data.campusId) || null) : null;
    const campusSnapshot = campusRecord
      ? { id: campusRecord.id, name: campusRecord.campusName }
      : null;

    const student = {
      id:              generateID('stu'),
      studentId,
      cnic,
      studentName:     data.studentName.trim(),
      fatherName:      (data.fatherName || '').trim(),
      gender:          data.gender,
      studentPhone:    (data.studentPhone || '').trim(),
      guardianPhone:   (data.guardianPhone || '').trim(),
      qualification:   (data.qualification || '').trim(),
      district:        (data.district || '').trim(),
      province:        (data.province || '').trim(),
      campusId:        campusRecord ? campusRecord.id : '',
      campusSnapshot,
      disciplineId:    data.disciplineId,
      dateOfAdmission: data.dateOfAdmission,
      session:         sessionFromDate(data.dateOfAdmission),
      admissionBatch:  (data.admissionBatch || '').trim(),
      route:           (data.route || '').trim(),
      exemptedPapers:  data.route === 'Exemption' ? _sanitizeExemptedPapers(data.exemptedPapers) : null,
      createdAt:       new Date().toISOString(),
    };
    AppState.add(KEY, student);
    return { success: true, student };
  },

  updateStudent(id, data) {
    const existing = AppState.findById(KEY, id);
    if (!existing) return { success: false, message: 'Student not found.' };

    let cnic = existing.cnic;
    if (data.cnicRaw && data.cnicRaw.trim()) {
      const r = validateCNIC(data.cnicRaw);
      if (!r.valid) return { success: false, message: r.message };
      cnic = r.formatted;
      if (isDuplicateCNIC(cnic, id)) {
        return { success: false, message: 'CNIC ' + cnic + ' is already registered to another student.' };
      }
    }

    const dateOfAdmission = data.dateOfAdmission || existing.dateOfAdmission;
    const gender          = data.gender          || existing.gender || 'male';
    const disciplineId    = data.disciplineId    || existing.disciplineId;

    // Regenerate student ID if any ID-determining field changed
    const discRecord = (AppState.get('disciplines') || []).find(function(d) { return d.id === disciplineId; });
    const discCode   = discRecord?.abbreviation || '';

    const idFieldChanged =
      disciplineId    !== existing.disciplineId    ||
      dateOfAdmission !== existing.dateOfAdmission ||
      gender          !== existing.gender;

    // Temporarily clear the old ID so it doesn't block the uniqueness check
    let studentId = existing.studentId;
    if (idFieldChanged) {
      AppState.update(KEY, id, { studentId: null });
      studentId = generateStudentId(discCode, dateOfAdmission, gender);
    }

    // Campus snapshot
    let campusId       = existing.campusId       || '';
    let campusSnapshot = existing.campusSnapshot || null;
    if (data.campusId !== undefined) {
      const campusRecord = data.campusId ? (AppState.findById('campuses', data.campusId) || null) : null;
      campusId       = campusRecord ? campusRecord.id : '';
      campusSnapshot = campusRecord ? { id: campusRecord.id, name: campusRecord.campusName } : null;
    }

    const patch = {
      cnic,
      studentId,
      studentName:     (data.studentName || existing.studentName).trim(),
      fatherName:      data.fatherName !== undefined ? (data.fatherName || '').trim() : (existing.fatherName || ''),
      gender,
      studentPhone:    data.studentPhone !== undefined ? (data.studentPhone || '').trim() : (existing.studentPhone || ''),
      guardianPhone:   data.guardianPhone !== undefined ? (data.guardianPhone || '').trim() : (existing.guardianPhone || ''),
      qualification:   data.qualification !== undefined ? (data.qualification || '').trim() : (existing.qualification || ''),
      district:        data.district !== undefined ? (data.district || '').trim() : (existing.district || ''),
      province:        data.province !== undefined ? (data.province || '').trim() : (existing.province || ''),
      campusId,
      campusSnapshot,
      disciplineId,
      dateOfAdmission,
      session:         sessionFromDate(dateOfAdmission),
      admissionBatch:  data.admissionBatch !== undefined ? data.admissionBatch.trim() : (existing.admissionBatch || ''),
      route:           data.route !== undefined ? (data.route || '').trim() : (existing.route || ''),
      exemptedPapers:  (data.route !== undefined ? data.route : existing.route) === 'Exemption'
                         ? _sanitizeExemptedPapers(data.exemptedPapers !== undefined ? data.exemptedPapers : existing.exemptedPapers)
                         : null,
      updatedAt:       new Date().toISOString(),
    };

    const updated = AppState.update(KEY, id, patch);
    return { success: true, student: updated };
  },

  deleteStudent(id) {
    AppState.remove(KEY, id);
    return { success: true };
  },

  // ── CSV Export ───────────────────────────────────────────────
  exportCSV(rows) {
    const students = rows || AppState.get(KEY) || [];
    if (!students.length) return;

    const headers  = ['studentId', 'cnic', 'studentName', 'fatherName', 'gender', 'studentPhone', 'guardianPhone', 'qualification', 'district', 'province', 'campus', 'discipline', 'dateOfAdmission', 'session', 'admissionBatch', 'route', 'exemptedPaperCount', 'exemptedPaperCodes'];
    const now      = new Date();
    const dateStr  = now.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    const timeStr  = now.toLocaleTimeString('en-GB', { hour:'2-digit', minute:'2-digit' });

    const meta = [
      'Student Report',
      'Generated: ' + dateStr + ' ' + timeStr,
      'Total Students: ' + students.length,
      '',
    ].join('\n');

    const csvRows = students.map(function(s) {
      const disc = AppState.findById('disciplines', s.disciplineId);
      // Use ="value" formula syntax for CNIC and date so Excel treats them as
      // text — prevents CNIC scientific notation and date auto-reformatting
      const safeCNIC = s.cnic ? '="' + s.cnic + '"' : '';
      const safeDate = s.dateOfAdmission ? '="' + s.dateOfAdmission + '"' : '';
      return [
        s.studentId        || '',
        safeCNIC,
        s.studentName      || '',
        s.fatherName       || '',
        s.gender           ? (s.gender.charAt(0).toUpperCase() + s.gender.slice(1)) : '',
        s.studentPhone     || '',
        s.guardianPhone    || '',
        s.qualification    || '',
        s.district         || '',
        s.province         || '',
        s.campus           || s.campusSnapshot?.name || '',
        disc?.abbreviation || '',
        safeDate,
        s.session          || '',
        s.admissionBatch   || '',
        s.route            || '',
        s.exemptedPapers?.count != null ? String(s.exemptedPapers.count) : '',
        s.exemptedPapers?.codes?.length ? s.exemptedPapers.codes.join(' | ') : '',
      ].map(function(v, i) {
        if (i === 1 || i === 12) return v;  // safeCNIC at idx 1, safeDate at idx 12
        return '"' + String(v).replace(/"/g, '""') + '"';
      }).join(',');
    });

    // \uFEFF = UTF-8 BOM — fixes encoding in Excel (prevents garbled chars)
    const csv  = '\uFEFF' + meta + headers.join(',') + '\n' + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: 'Students-' + dateStr.replace(/ /g, '-') + '.csv',
    });
    a.click();
    URL.revokeObjectURL(url);
  },

  // ── Import Template (XLSX) ────────────────────────────────────
  downloadTemplate() {
    const disciplines = AppState.get('disciplines') || [];
    const discList    = disciplines.map(function(d) { return d.abbreviation; }).join(' | ') || 'CS | IT | BBA';
    const discEx      = disciplines[0]?.abbreviation || 'CS';

    // Load SheetJS from CDN then build the XLSX
    function buildAndDownload(XLSX) {
      const wb = XLSX.utils.book_new();

      // ── Sheet 1: Student Import ──────────────────────────────
      // We build rows as arrays; column order matches the table exactly
      const HEADERS = [
        'studentId', 'cnic', 'studentName', 'fatherName', 'gender',
        'studentPhone', 'guardianPhone', 'qualification', 'district', 'province',
        'campus', 'discipline', 'dateOfAdmission', 'session', 'admissionBatch',
      ];

      const HINTS = [
        'Auto-generated — leave BLANK',
        '13 digits  e.g. 35202-1234567-8',
        'Full name of the student',
        'Father\'s full name',
        'Male or Female',
        'Student mobile number',
        'Guardian/Parent mobile number',
        'e.g. Matric, FA, BA, BSc',
        'e.g. Rawalpindi, Lahore',
        'e.g. Punjab, Sindh, KPK',
        'e.g. Main Campus, North Campus',
        'Abbreviation  e.g. ' + (discEx || 'ACCA'),
        'Format: YYYY-MM-DD  e.g. 2025-09-01',
        'Auto-detected — leave BLANK',
        'Optional  e.g. Batch-1, Fall-2025',
      ];

      // Sample rows — studentId & session blank (auto)
      const SAMPLES = [
        ['', '35202-1234567-8', 'Muhammad Ali', 'Ahmad Ali',   'Male',   '0300-1234567', '0300-7654321', 'Matric',    'Rawalpindi', 'Punjab', 'Main Campus',  discEx, '2025-09-01', '', 'Batch-1'],
        ['', '35202-9876543-2', 'Sara Khan',    'Imran Khan',  'Female', '0321-9876543', '0321-1234567', 'FA',        'Lahore',     'Punjab', 'North Campus', discEx, '2026-03-15', '', 'Batch-2'],
        ['', '35202-1111111-9', 'Ahmed Raza',   'Raza Hussain','Male',   '0333-1111111', '0333-9999999', 'BA',        'Karachi',    'Sindh',  'Main Campus',  discEx, '2025-11-20', '', 'Batch-1'],
      ];

      // 100 empty data rows after samples
      const EMPTY_ROWS = Array.from({ length: 97 }, function() { return ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '']; });

      const wsData = [HEADERS, HINTS, ...SAMPLES, ...EMPTY_ROWS];
      const ws     = XLSX.utils.aoa_to_sheet(wsData);

      // Column widths (chars)
      ws['!cols'] = [
        { wch: 22 }, // studentId
        { wch: 22 }, // cnic
        { wch: 26 }, // studentName
        { wch: 26 }, // fatherName
        { wch: 10 }, // gender
        { wch: 18 }, // studentPhone
        { wch: 18 }, // guardianPhone
        { wch: 16 }, // qualification
        { wch: 18 }, // district
        { wch: 16 }, // province
        { wch: 20 }, // campus
        { wch: 18 }, // discipline
        { wch: 20 }, // dateOfAdmission
        { wch: 16 }, // session
        { wch: 20 }, // admissionBatch
      ];

      // Force CNIC (col B, idx 1) and dateOfAdmission (col M, idx 12) to text
      const textCols = [1, 12];
      const totalRows = wsData.length;
      textCols.forEach(function(colIdx) {
        for (let r = 0; r < totalRows; r++) {
          const addr = XLSX.utils.encode_cell({ r: r, c: colIdx });
          if (!ws[addr]) ws[addr] = { v: '', t: 's' };
          ws[addr].t = 's'; // force string type — no auto-conversion
          ws[addr].z = '@'; // text number format
        }
      });

      XLSX.utils.book_append_sheet(wb, ws, 'Student Import');

      // ── Sheet 2: Instructions ────────────────────────────────
      const instrData = [
        ['How to use this template', ''],
        ['Column', 'Instructions'],
        ['studentId',       'Leave BLANK — auto-generated on import'],
        ['cnic',            '13 digits with dashes: 35202-1234567-8\n(without dashes also accepted: 3520212345678)'],
        ['studentName',     'Full name  e.g. Muhammad Ali'],
        ['fatherName',      'Father\'s full name  e.g. Ahmad Ali'],
        ['gender',          'Male or Female'],
        ['studentPhone',    'Student mobile number  e.g. 0300-1234567'],
        ['guardianPhone',   'Guardian/Parent mobile number  e.g. 0321-9876543'],
        ['qualification',   'Previous qualification  e.g. Matric, FA, BA, BSc'],
        ['district',        'District of residence  e.g. Rawalpindi, Lahore, Karachi'],
        ['province',        'Province  e.g. Punjab, Sindh, KPK, Balochistan'],
        ['campus',          'Campus name  e.g. Main Campus, North Campus'],
        ['discipline',      'Use exact abbreviation from system\nAvailable: ' + discList],
        ['dateOfAdmission', 'YYYY-MM-DD format only  e.g. 2025-09-01\nColumn is TEXT — do not change format'],
        ['session',         'Leave BLANK — auto-detected from dateOfAdmission\nJul–Dec → Dec-YY  |  Jan–Jun → June-YY'],
        ['admissionBatch',  'Optional — e.g. Batch-1, Fall-2025, Morning'],
        ['', ''],
        ['Important Notes', '• Delete the 3 blue sample rows before importing\n• Do not add or remove columns\n• Save as .csv (UTF-8) when importing into system'],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(instrData);
      ws2['!cols'] = [{ wch: 22 }, { wch: 60 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

      // ── Download ─────────────────────────────────────────────
      XLSX.writeFile(wb, 'students_import_template.xlsx');
    }

    // Check if SheetJS already loaded
    if (window.XLSX) {
      buildAndDownload(window.XLSX);
      return;
    }

    // Dynamically load SheetJS from CDN
    const script  = document.createElement('script');
    script.src    = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = function() { buildAndDownload(window.XLSX); };
    script.onerror = function() {
      // Fallback to plain CSV if CDN fails
      const csv = [
        'studentId,cnic,studentName,fatherName,gender,studentPhone,guardianPhone,qualification,district,province,campus,discipline,dateOfAdmission,session,admissionBatch',
        ',"35202-1234567-8",Muhammad Ali,Ahmad Ali,Male,0300-1234567,0300-7654321,Matric,Rawalpindi,Punjab,Main Campus,'  + discEx + ',"2025-09-01",,Batch-1',
        ',"35202-9876543-2",Sara Khan,Imran Khan,Female,0321-9876543,0321-1234567,FA,Lahore,Punjab,North Campus,'    + discEx + ',"2026-03-15",,Batch-2',
        ',"35202-1111111-9",Ahmed Raza,Raza Hussain,Male,0333-1111111,0333-9999999,BA,Karachi,Sindh,Main Campus,'    + discEx + ',"2025-11-20",,Batch-1',
      ].join('\n');
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: 'students_import_template.csv' }).click();
      URL.revokeObjectURL(url);
    };
    document.head.appendChild(script);
  },

  // ── CSV Import ────────────────────────────────────────────────
  parseCSV(text) {
    const allLines  = text.trim().split(/\r?\n/);
    const dataLines = allLines.filter(function(l) { return !l.trim().startsWith('#') && l.trim() !== ''; });

    if (dataLines.length < 2) return { valid: [], errors: ['No data rows found. Check the file is not empty and has a header row.'] };

    // Normalize headers
    const rawHeaders = dataLines[0].split(',').map(function(h) {
      return h.replace(/"/g, '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    });

    // ── Skip hints/description row ──────────────────────────────
    // The XLSX template has a row 2 with column hints like
    // "Auto-generated — leave BLANK", "13 digits e.g. ...", etc.
    // Detect it: if the row after the header has no valid CNIC-like
    // value in the cnic column AND contains hint keywords → skip it.
    const HINT_KEYWORDS = [
      'auto-generated', 'leave blank', 'digits', 'full name',
      'abbreviation', 'yyyy-mm-dd', 'auto-detected', 'optional',
      'format:', 'e.g.', 'example',
    ];
    function isHintRow(line) {
      const lower = line.toLowerCase();
      return HINT_KEYWORDS.some(function(kw) { return lower.includes(kw); });
    }
    // dataLines[0] = header, dataLines[1] = possible hints row
    const startIdx = (dataLines.length > 1 && isHintRow(dataLines[1])) ? 2 : 1;

    // Flexible column aliases
    function findCol(aliases) {
      for (let i = 0; i < aliases.length; i++) {
        const idx = rawHeaders.indexOf(aliases[i]);
        if (idx !== -1) return idx;
      }
      return -1;
    }

    const colIdx = {
      studentId:       findCol(['studentid', 'stuid', 'id']),
      cnic:            findCol(['cnic', 'uniqueid', 'nationalid', 'cnid']),
      studentName:     findCol(['studentname', 'name', 'fullname', 'studentfullname']),
      fatherName:      findCol(['fathername', 'father', 'fatherfullname']),
      gender:          findCol(['gender', 'sex']),
      studentPhone:    findCol(['studentphone', 'phone', 'mobile', 'studentmobile', 'studentcontact']),
      guardianPhone:   findCol(['guardianphone', 'guardianmobile', 'parentphone', 'parentmobile', 'guardiancontact']),
      qualification:   findCol(['qualification', 'qual', 'education', 'previousqualification']),
      district:        findCol(['district']),
      province:        findCol(['province']),
      campus:          findCol(['campus', 'campusname', 'branch']),
      discipline:      findCol(['discipline', 'disc', 'program', 'dept']),
      dateOfAdmission: findCol(['dateofadmission', 'admissiondate', 'doa', 'admissiondateyyyy-mm-dd']),
      session:         findCol(['session', 'sess']),
      admissionBatch:  findCol(['admissionbatch', 'batch', 'batchno', 'batchname']),
      route:           findCol(['route']),
      exemptedCodes:   findCol(['exemptedpapercodes', 'exemptcodes', 'papercodes', 'exemptedcodes']),
    };

    const requiredCols = ['cnic', 'studentName', 'discipline', 'dateOfAdmission'];
    const missingCols = requiredCols
      .filter(function(k) { return colIdx[k] === -1; });

    if (missingCols.length) {
      return {
        valid:  [],
        errors: [
          'Missing required columns: ' + missingCols.join(', ') + '.',
          'Your file has these headers: ' + rawHeaders.join(', '),
          'Required: cnic, studentName, discipline, dateOfAdmission',
        ],
      };
    }

    // CSV row parser — handles quoted fields and embedded commas
    function parseRow(line) {
      const vals = [];
      let cur = '', inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
      vals.push(cur.trim());
      return vals;
    }

    const disciplines = AppState.get('disciplines') || [];
    const valid      = [];
    const errors     = [];
    const duplicates = [];  // rows with CNIC already in system

    dataLines.slice(startIdx).forEach(function(line, i) {
      const rowNum = startIdx + i + 1;
      if (!line.trim()) return;

      const vals          = parseRow(line);
      // Strip quotes and leading = (Excel formula prefix ="value" used to force text)
      const get           = function(idx) { return (vals[idx] || '').replace(/"/g,'').replace(/^=/, '').trim(); };
      const rawCNIC       = get(colIdx.cnic);
      const studentName   = get(colIdx.studentName);
      const fatherName    = colIdx.fatherName   !== -1 ? get(colIdx.fatherName)   : '';
      const disciplineStr = get(colIdx.discipline);
      const dateStr       = get(colIdx.dateOfAdmission);
      const genderRaw     = colIdx.gender !== -1 ? get(colIdx.gender).toLowerCase() : '';
      const gender        = genderRaw === 'female' || genderRaw === 'f' ? 'female' : 'male';
      const studentPhone  = colIdx.studentPhone  !== -1 ? get(colIdx.studentPhone)  : '';
      const guardianPhone = colIdx.guardianPhone !== -1 ? get(colIdx.guardianPhone) : '';
      const qualification = colIdx.qualification !== -1 ? get(colIdx.qualification) : '';
      const district      = colIdx.district      !== -1 ? get(colIdx.district)      : '';
      const province      = colIdx.province      !== -1 ? get(colIdx.province)      : '';
      const campusRaw     = colIdx.campus !== -1 ? get(colIdx.campus) : '';
      // Resolve campus name → campusId + snapshot
      const campuses      = AppState.get('campuses') || [];
      const campusRecord  = campusRaw
        ? campuses.find(function(c) { return c.campusName.toLowerCase() === campusRaw.toLowerCase(); })
        : null;
      const campusId       = campusRecord ? campusRecord.id : '';
      const campusSnapshot = campusRecord ? { id: campusRecord.id, name: campusRecord.campusName } : null;
      const rowErrors     = [];

      // ── Name ──
      if (!studentName) rowErrors.push('studentName is required');

      // ── CNIC (optional — old data may not have it) ──
      let formattedCNIC = '';
      let _isDupSystem  = false;
      let _isDupInFile  = false;
      if (rawCNIC) {
        const cr = validateCNIC(rawCNIC);
        if (!cr.valid) {
          rowErrors.push(cr.message);
        } else {
          formattedCNIC = cr.formatted;
          if (isDuplicateCNIC(formattedCNIC)) {
            _isDupSystem = true;   // existing in AppState — warn user, don't hard-error
          } else if (
            valid.some(function(v) { return v.cnic === formattedCNIC; }) ||
            duplicates.some(function(v) { return v.cnic === formattedCNIC; })
          ) {
            _isDupInFile = true;   // same CNIC appears twice in this CSV
          }
        }
      }

      // ── Discipline ──
      let disc = null;
      if (!disciplineStr) {
        rowErrors.push('discipline is required');
      } else {
        disc = disciplines.find(function(d) {
          return d.abbreviation.toLowerCase() === disciplineStr.toLowerCase() ||
                 d.fullName.toLowerCase()     === disciplineStr.toLowerCase();
        });
        if (!disc) {
          const avail = disciplines.map(function(d) { return d.abbreviation; }).join(', ');
          rowErrors.push('Discipline "' + disciplineStr + '" not found. Available: ' + (avail || 'none configured'));
        }
      }

      // ── Date of Admission ──
      if (!dateStr) {
        rowErrors.push('dateOfAdmission is required (format: YYYY-MM-DD)');
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        rowErrors.push('dateOfAdmission must be YYYY-MM-DD, got "' + dateStr + '"');
      } else if (isNaN(Date.parse(dateStr))) {
        rowErrors.push('"' + dateStr + '" is not a valid date');
      }

      if (rowErrors.length) {
        errors.push('Row ' + rowNum + (studentName ? ' (' + studentName + ')' : '') + ': ' + rowErrors.join('; '));
        return;
      }

      // Auto-generate unique studentId using new structured format
      const discCode  = disc ? disc.abbreviation : '';
      const studentId = generateStudentId(discCode, dateStr, gender);

      const admissionBatch = colIdx.admissionBatch !== -1 ? get(colIdx.admissionBatch) : '';
      const route          = colIdx.route          !== -1 ? get(colIdx.route).trim()   : '';
      let exemptedPapers   = null;
      if (route === 'Exemption' && colIdx.exemptedCodes !== -1) {
        const codesRaw = get(colIdx.exemptedCodes);
        const codes = codesRaw.split(/[|,;]+/).map(function(c) { return c.trim().toUpperCase(); }).filter(Boolean);
        exemptedPapers = { count: codes.length, codes };
      }

      const rowData = {
        _rowNum:         rowNum,
        studentId,
        cnic:            formattedCNIC,
        studentName,
        fatherName,
        gender,
        studentPhone,
        guardianPhone,
        qualification,
        district,
        province,
        campusId,
        campusSnapshot,
        disciplineId:    disc.id,
        dateOfAdmission: dateStr,
        session:         sessionFromDate(dateStr),
        admissionBatch,
        route,
        exemptedPapers,
        createdAt:       new Date().toISOString(),
      };

      if (_isDupSystem) {
        // Already exists in system — put in duplicates for user to review
        duplicates.push(Object.assign(rowData, { _dupReason: 'system' }));
      } else if (_isDupInFile) {
        // Same CNIC twice in this file — treat as hard error
        errors.push('Row ' + rowNum + ' (' + studentName + '): CNIC ' + formattedCNIC + ' appears more than once in this file');
      } else {
        valid.push(rowData);
      }
    });

    return { valid, errors, duplicates };
  },

  importStudents(rows) {
    let added = 0;
    rows.forEach(function(row) {
      const data = Object.assign({}, row);
      delete data._rowNum;
      AppState.add(KEY, Object.assign(data, { id: generateID('stu') }));
      added++;
    });
    return added;
  },
};
