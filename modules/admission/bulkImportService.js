// ============================================================
// modules/admission/bulkImportService.js — Bulk Student Import
//
// Logic:
//   1. CSV parse kar ke rows nikalna
//   2. Har row validate karna (required fields, CNIC format)
//   3. Smart merge:
//      • Student CNIC pehle se students[] mein hai?
//          → students[] mein skip, sirf enrolment check karo
//          • Enrolment bhi hai?   → skip (duplicate, error dikhao)
//          • Enrolment nahi hai?  → enrolments[] mein add karo
//      • Naya student (CNIC nahi mila)?
//          → Agar koi field missing → error (lekin skippable)
//          → Sab fields hain → students[] + admissions[] + challan add
//   4. challanPaid = true → admission confirm, student active
// ============================================================

import { AppState, generateID }            from '../../utils/state.js';
import { Auth }                            from '../../utils/auth.js';
import {
  validateCNIC,
  formatCNIC,
  sessionFromDate,
  generateStudentId,
}                                          from '../student/studentService.js';
import {
  ADMISSION_STATUS,
  CHALLAN_STATUS,
  ensureAdmissionState,
}                                          from './admissionService.js';
import {
  EnrolmentService,
  ensureEnrolmentKeys,
  ENROLMENT_STATUSES,
  FEE_STATUSES,
}                                          from '../enrolment/enrolmentService.js';

// ── Required columns in import CSV ────────────────────────────
// Yeh columns MUST hone chahiye (case-insensitive header match)
export const REQUIRED_COLUMNS = [
  'studentName',
  'cnic',
  'gender',
  'batchName',
  'dateOfAdmission',
  'challanPaid',       // "yes"/"no" — admission confirm karne k liye
];

// Optional columns (missing = empty string saved)
export const OPTIONAL_COLUMNS = [
  'fatherName',
  'studentPhone',
  'guardianPhone',
  'qualification',
  'district',
  'province',
  'session',
  'route',
  'disciplineName',   // batch se auto-resolve hogaagar missing ho
  'campusName',       // batch se auto-resolve hoga
  'feeAmount',
  'dueDate',
  'notes',
];

// ── Sample CSV generator ───────────────────────────────────────
export function generateSampleCSV() {
  const headers = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];

  // Sample rows — ek complete, ek challanPaid=yes
  const rows = [
    [
      'Ahmed Ali',          // studentName
      '35202-1234567-1',    // cnic
      'male',               // gender
      'ACCA-F8-Batch-A',    // batchName (exactly as system mein hai)
      '2025-09-01',         // dateOfAdmission
      'no',                 // challanPaid
      'Usman Ali',          // fatherName
      '0300-1234567',       // studentPhone
      '0321-7654321',       // guardianPhone
      'A-Levels',           // qualification
      'Rawalpindi',         // district
      'Punjab',             // province
      'Dec-25',             // session (khali chhoro = auto-detect)
      '',                   // route
      'ACCA',               // disciplineName
      'Main Campus',        // campusName
      '15000',              // feeAmount
      '2025-09-30',         // dueDate
      '',                   // notes
    ],
    [
      'Sara Khan',
      '35202-9876543-2',
      'female',
      'ACCA-F8-Batch-A',
      '2025-09-01',
      'yes',                // challan paid → auto confirm
      'Khalid Khan',
      '0301-1111111',
      '',
      'F.Sc',
      'Islamabad',
      'Punjab',
      '',
      '',
      '',
      '',
      '15000',
      '2025-09-30',
      'Merit student',
    ],
  ];

  const meta = [
    '# Bulk Student Import Template',
    '# Instructions:',
    '#   1. batchName bilkul wahi likhein jo system mein hai (case-sensitive)',
    '#   2. cnic format: XXXXX-XXXXXXX-X  (dashes ke saath ya baghair dono chalte hain)',
    '#   3. gender: male / female',
    '#   4. challanPaid: yes = admission confirm + student active, no = pending rakhega',
    '#   5. dateOfAdmission: YYYY-MM-DD format',
    '#   6. Agar student pehle se exist kare to students[] update nahi hoga — sirf enrolment add hoga',
    '#   7. Agar batch nahi mila to woh row error mein jayegi (skip kar sakte hain)',
    '',
  ].join('\n');

  const csvBody = [
    headers.join(','),
    ...rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')),
  ].join('\n');

  return meta + csvBody;
}

// ── CSV → rows[] parser ────────────────────────────────────────
// Simple parser — quoted fields + escaped quotes support
export function parseCSV(text) {
  // Remove BOM if present
  text = text.replace(/^\uFEFF/, '');

  const lines = text.split(/\r?\n/);
  const result = [];
  let headers = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;  // skip comments & blanks

    const cells = _splitCSVLine(line);
    if (!headers) {
      // Normalize header names: trim + camelCase-ish (strip spaces, lowercase first char)
      headers = cells.map(h => _normalizeHeader(h));
      continue;
    }

    // Build object
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = (cells[idx] || '').trim();
    });
    result.push({ row, lineNo: i + 1 });
  }

  return { headers, rows: result };
}

function _splitCSVLine(line) {
  const cells = [];
  let cur = '';
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }  // escaped quote
        else inQ = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function _normalizeHeader(h) {
  // Trim, remove #, lowercase first letter, camelCase rest
  h = h.replace(/^[# ]+/, '').trim();
  // Handle common aliases
  const aliases = {
    'student name':     'studentName',
    'name':             'studentName',
    'father name':      'fatherName',
    'father':           'fatherName',
    'phone':            'studentPhone',
    'mobile':           'studentPhone',
    'guardian phone':   'guardianPhone',
    'batch':            'batchName',
    'batch name':       'batchName',
    'admission date':   'dateOfAdmission',
    'date':             'dateOfAdmission',
    'paid':             'challanPaid',
    'challan paid':     'challanPaid',
    'fee paid':         'challanPaid',
    'discipline':       'disciplineName',
    'campus':           'campusName',
    'fee':              'feeAmount',
    'fee amount':       'feeAmount',
    'due date':         'dueDate',
  };
  const lower = h.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  // camelCase: first word lowercase, rest capitalize
  return h.charAt(0).toLowerCase() + h.slice(1).replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
}

// ── Row validator ──────────────────────────────────────────────
// Returns { valid: bool, errors: string[], warnings: string[] }
function _validateRow(row, batches) {
  const errors   = [];
  const warnings = [];

  // Required field checks
  if (!row.studentName?.trim())    errors.push('studentName missing');
  if (!row.cnic?.trim())           errors.push('CNIC missing');
  if (!row.gender?.trim())         errors.push('gender missing');
  if (!row.batchName?.trim())      errors.push('batchName missing');
  if (!row.dateOfAdmission?.trim()) errors.push('dateOfAdmission missing');

  // CNIC format
  if (row.cnic?.trim()) {
    const cv = validateCNIC(row.cnic);
    if (!cv.valid) errors.push('CNIC invalid: ' + cv.message);
  }

  // Gender check
  const g = (row.gender || '').toLowerCase();
  if (row.gender && g !== 'male' && g !== 'female') {
    errors.push('gender must be "male" or "female"');
  }

  // Date format
  if (row.dateOfAdmission && !/^\d{4}-\d{2}-\d{2}$/.test(row.dateOfAdmission.trim())) {
    errors.push('dateOfAdmission must be YYYY-MM-DD format');
  }

  // Batch lookup
  let batch = null;
  if (row.batchName?.trim()) {
    batch = batches.find(b => b.batchName?.toLowerCase() === row.batchName.trim().toLowerCase());
    if (!batch) errors.push('Batch "' + row.batchName + '" nahi mila — exact name check karein');
  }

  // Optional warnings
  if (!row.fatherName?.trim()) warnings.push('fatherName khali hai');
  if (!row.studentPhone?.trim()) warnings.push('studentPhone khali hai');

  return { valid: errors.length === 0, errors, warnings, batch };
}

// ── Main import processor ──────────────────────────────────────
/**
 * CSV text + options lekar sab rows process karta hai.
 *
 * @param {string} csvText
 * @param {{ dryRun?: bool, importedBy?: string }} opts
 * @returns {{
 *   totalRows: number,
 *   imported: number,          // students + enrolments added
 *   enrolmentOnly: number,     // existing student, enrolment add hua
 *   skipped: number,           // duplicate enrolment ya user ne skip kiya
 *   errors: Array<{lineNo, studentName, cnic, issues}>,
 *   results: Array<{lineNo, status, studentName, cnic, message}>
 * }}
 */
export function processBulkImport(csvText, opts) {
  opts = opts || {};
  const dryRun     = !!opts.dryRun;
  const importedBy = opts.importedBy || (Auth.getCurrentUser()?.userId) || null;

  ensureAdmissionState();
  ensureEnrolmentKeys();

  const { rows } = parseCSV(csvText);
  const batches     = AppState.get('batches')     || [];
  const students    = AppState.get('students')    || [];
  const admissions  = AppState.get('admissions')  || [];
  const enrolments  = AppState.get('enrolments')  || [];
  const disciplines = AppState.get('disciplines') || [];
  const campuses    = AppState.get('campuses')    || [];

  const summary = {
    totalRows:     rows.length,
    imported:      0,
    enrolmentOnly: 0,
    skipped:       0,
    errors:        [],
    results:       [],
  };

  for (const { row, lineNo } of rows) {
    const name = row.studentName || '—';
    const cnic = row.cnic        || '';

    // ── Step 1: Validate ───────────────────────────────────────
    const { valid, errors, warnings, batch } = _validateRow(row, batches);

    if (!valid) {
      summary.errors.push({ lineNo, studentName: name, cnic, issues: errors });
      summary.results.push({
        lineNo, status: 'error', studentName: name, cnic,
        message: errors.join(' | '),
      });
      summary.skipped++;
      continue;
    }

    const formattedCNIC = formatCNIC(row.cnic);

    // ── Step 2: Existing student check ─────────────────────────
    const existingStudent = students.find(s => s.cnic === formattedCNIC || s.uniqueId === formattedCNIC);

    if (existingStudent) {
      // Student exists — check if already enrolled in this batch
      const alreadyInAdmissions = admissions.some(
        a => a.studentId === existingStudent.id &&
             a.batchId   === batch.id           &&
             a.status    !== ADMISSION_STATUS.CANCELLED
      );
      const alreadyInEnrolments = enrolments.some(
        e => e.studentId === existingStudent.id &&
             e.batchId   === batch.id
      );

      if (alreadyInAdmissions || alreadyInEnrolments) {
        summary.errors.push({
          lineNo,
          studentName: name,
          cnic: formattedCNIC,
          issues: ['Yeh student is batch mein pehle se enrolled hai (duplicate)'],
        });
        summary.results.push({
          lineNo, status: 'duplicate',
          studentName: existingStudent.studentName,
          cnic: formattedCNIC,
          message: 'Duplicate — students[] mein skip, enrolment bhi already exist karta hai',
        });
        summary.skipped++;
        continue;
      }

      // Existing student, no enrolment → enrolments[] mein add karo
      if (!dryRun) {
        const enrDate    = row.dateOfAdmission || new Date().toISOString().split('T')[0];
        const paid       = (row.challanPaid || '').toLowerCase() === 'yes';
        EnrolmentService.add({
          studentId:     existingStudent.id,
          batchId:       batch.id,
          enrolmentDate: enrDate,
          status:        'active',
          feeStatus:     paid ? 'paid' : 'unpaid',
          notes:         (row.notes || '').trim(),
          subjects:      [],
        }, importedBy);
      }

      summary.enrolmentOnly++;
      summary.results.push({
        lineNo, status: 'enrolment_added',
        studentName: existingStudent.studentName,
        cnic: formattedCNIC,
        message: 'Existing student — sirf enrolment add hua' + (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
      });
      continue;
    }

    // ── Step 3: New student ────────────────────────────────────
    // Resolve discipline (batch se pehle, phir column se)
    let discRecord = null;
    if (batch.disciplineId) {
      discRecord = disciplines.find(d => d.id === batch.disciplineId);
    }
    if (!discRecord && row.disciplineName) {
      discRecord = disciplines.find(
        d => d.abbreviation?.toLowerCase() === row.disciplineName.trim().toLowerCase() ||
             d.name?.toLowerCase()         === row.disciplineName.trim().toLowerCase()
      );
    }

    // Resolve campus
    let campusRecord = null;
    if (batch.campusId) {
      campusRecord = campuses.find(c => c.id === batch.campusId);
    }
    if (!campusRecord && row.campusName) {
      campusRecord = campuses.find(
        c => c.campusName?.toLowerCase() === row.campusName.trim().toLowerCase()
      );
    }

    const genderNorm     = (row.gender || 'male').toLowerCase();
    const admDate        = row.dateOfAdmission.trim();
    const discCode       = discRecord?.abbreviation || '';
    const derivedSession = row.session?.trim() || sessionFromDate(admDate);
    const paid           = (row.challanPaid || '').toLowerCase() === 'yes';
    const campusSnapshot = campusRecord
      ? { id: campusRecord.id, name: campusRecord.campusName }
      : null;

    if (!dryRun) {
      // Create student
      const studentInternalId  = generateID('stu');
      const structuredStudentId = generateStudentId(discCode, admDate, genderNorm);

      const newStudent = {
        id:               studentInternalId,
        studentId:        structuredStudentId,
        cnic:             formattedCNIC,
        uniqueId:         formattedCNIC,
        studentName:      row.studentName.trim(),
        fatherName:       (row.fatherName    || '').trim(),
        gender:           genderNorm,
        studentPhone:     (row.studentPhone  || '').trim(),
        phone:            (row.studentPhone  || '').trim(),
        guardianPhone:    (row.guardianPhone || '').trim(),
        qualification:    (row.qualification || '').trim(),
        district:         (row.district      || '').trim(),
        province:         (row.province      || '').trim(),
        route:            (row.route         || '').trim(),
        campusId:         campusRecord?.id   || '',
        campusSnapshot,
        disciplineId:     discRecord?.id     || '',
        batchId:          batch.id,
        dateOfAdmission:  admDate,
        admissionDate:    admDate,
        session:          derivedSession,
        isActive:         paid,   // challan paid = active
        admittedVia:      'bulk_import',
        createdAt:        new Date().toISOString(),
      };

      AppState.add('students', newStudent);

      // Create admission record
      const admissionId = generateID('adm');
      const admission = {
        id:           admissionId,
        studentId:    studentInternalId,
        campusId:     campusRecord?.id   || '',
        disciplineId: discRecord?.id     || '',
        batchId:      batch.id,
        session:      derivedSession,
        status:       paid ? ADMISSION_STATUS.CONFIRMED : ADMISSION_STATUS.PENDING,
        admittedBy:   importedBy,
        createdAt:    new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
      };

      AppState.add('admissions', admission);

      // Also add to enrolments (cross-module link)
      EnrolmentService.add({
        studentId:     studentInternalId,
        batchId:       batch.id,
        enrolmentDate: admDate,
        status:        'active',
        feeStatus:     paid ? 'paid' : 'unpaid',
        notes:         (row.notes || '').trim(),
        subjects:      [],
      }, importedBy);

      // Generate challan if fee amount provided
      const feeAmount = parseFloat(row.feeAmount) || 0;
      if (feeAmount > 0) {
        const challan = {
          id:          generateID('chl'),
          admissionId,
          studentId:   studentInternalId,
          studentName: newStudent.studentName,
          campusId:    campusRecord?.id || '',
          batchId:     batch.id,
          session:     derivedSession,
          feeAmount,
          dueDate:     row.dueDate || _defaultDueDate(),
          status:      paid ? CHALLAN_STATUS.PAID : CHALLAN_STATUS.PENDING,
          paidAt:      paid ? new Date().toISOString() : null,
          createdAt:   new Date().toISOString(),
        };
        AppState.add('challans', challan);

        // Challan paid → admission confirm, student active
        if (paid) {
          AppState.update('admissions', admissionId, { status: ADMISSION_STATUS.CONFIRMED });
          AppState.update('students',   studentInternalId, { isActive: true });
        }
      }
    }

    summary.imported++;
    summary.results.push({
      lineNo, status: paid ? 'imported_paid' : 'imported_pending',
      studentName: row.studentName.trim(),
      cnic: formattedCNIC,
      message: (paid ? 'Import + Confirmed (challan paid)' : 'Import — challan pending')
               + (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
    });
  }

  return summary;
}

// ── Helper ─────────────────────────────────────────────────────
function _defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().split('T')[0];
}
