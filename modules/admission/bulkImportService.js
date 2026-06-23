// ============================================================
// modules/admission/bulkImportService.js — Bulk Student Import
//
// Handles two import modes per row:
//
//  MODE A — Batch Enrolment  (batchName provided, subjectCode empty)
//    • New student     → students[] + admissions[] + enrolments[] + challan
//    • Existing student, not enrolled in batch → enrolments[] only
//    • Existing student, already enrolled in batch → ERROR (skipped)
//    • Same student, multiple rows with different batches → each row
//      creates a separate enrolment (multi-batch fully supported)
//
//  MODE B — Subject / Freeze Import  (subjectCode provided, batchName optional)
//    • Student must already exist (looked up by CNIC)
//    • Finds the student's active enrolment for that batch (or any if
//      batchName is blank)
//    • Appends a subject entry to enrolment.subjects[]
//    • If subject already present on that enrolment → ERROR (skipped)
//    • If no matching enrolment found → ERROR (skipped)
//
//  challanPaid = yes  → admission confirmed + student isActive = true
// ============================================================

import { AppState, generateID }  from '../../utils/state.js';
import { Auth }                  from '../../utils/auth.js';
import {
  validateCNIC,
  formatCNIC,
  sessionFromDate,
  generateStudentId,
}                                from '../student/studentService.js';
import {
  ADMISSION_STATUS,
  CHALLAN_STATUS,
  ensureAdmissionState,
}                                from './admissionService.js';
import {
  EnrolmentService,
  ensureEnrolmentKeys,
  FEE_STATUSES,
}                                from '../enrolment/enrolmentService.js';

// ── Column definitions ─────────────────────────────────────────

// MODE A — always required (unless Mode B row where batchName can be omitted)
export const REQUIRED_COLUMNS = [
  'studentName',
  'cnic',
  'gender',
  'dateOfAdmission',
  'challanPaid',
  // batchName OR subjectCode must be present — validated at runtime
];

export const OPTIONAL_COLUMNS = [
  'batchName',        // Mode A: required. Mode B: optional (used to narrow enrolment lookup)
  'subjectCode',      // Mode B trigger — if present → subject/freeze import
  'subjectName',      // Mode B: display name for the subject
  'subjectStatus',    // Mode B: active | dormant | left_campus | … (default: active)
  'fatherName',
  'studentPhone',
  'guardianPhone',
  'qualification',
  'district',
  'province',
  'session',
  'route',
  'disciplineName',
  'campusName',
  'feeAmount',
  'dueDate',
  'notes',
];

// ── Sample CSV ─────────────────────────────────────────────────
export function generateSampleCSV() {
  const headers = [
    'studentName', 'cnic', 'gender', 'dateOfAdmission', 'challanPaid',
    'batchName', 'subjectCode', 'subjectName', 'subjectStatus',
    'fatherName', 'studentPhone', 'guardianPhone',
    'qualification', 'district', 'province',
    'session', 'route', 'disciplineName', 'campusName',
    'feeAmount', 'dueDate', 'notes',
  ];

  const rows = [
    // Row 1 — new student, batch enrolment
    [
      'Ahmed Ali', '35202-1234567-1', 'male', '2025-09-01', 'no',
      'ACCA-F8-Batch-A', '', '', '',
      'Usman Ali', '0300-1234567', '0321-7654321',
      'A-Levels', 'Rawalpindi', 'Punjab',
      'Dec-25', '', 'ACCA', 'Main Campus',
      '15000', '2025-09-30', '',
    ],
    // Row 2 — same student, second batch (multi-batch enrolment)
    [
      'Ahmed Ali', '35202-1234567-1', 'male', '2025-09-01', 'no',
      'ACCA-P1-Batch-B', '', '', '',
      '', '', '',
      '', '', '',
      '', '', '', '',
      '', '', 'Second batch enrolment',
    ],
    // Row 3 — existing student, subject/freeze import (no batch needed)
    [
      'Ahmed Ali', '35202-1234567-1', 'male', '2025-09-01', 'no',
      'ACCA-F8-Batch-A', 'F8', 'Audit & Assurance', 'active',
      '', '', '',
      '', '', '',
      '', '', '', '',
      '', '', 'Paper freeze import',
    ],
    // Row 4 — new student, challan paid
    [
      'Sara Khan', '35202-9876543-2', 'female', '2025-09-01', 'yes',
      'ACCA-F8-Batch-A', '', '', '',
      'Khalid Khan', '0301-1111111', '',
      'F.Sc', 'Islamabad', 'Punjab',
      '', '', '', '',
      '15000', '2025-09-30', 'Merit student',
    ],
  ];

  const meta = [
    '# Bulk Student Import Template',
    '# ─────────────────────────────────────────────────',
    '# MODE A — Batch Enrolment:',
    '#   Fill batchName. Leave subjectCode empty.',
    '#   One row per student per batch.',
    '#   Same student can appear multiple times with different batchName values.',
    '#',
    '# MODE B — Subject / Freeze Import:',
    '#   Fill subjectCode (and optionally subjectName, subjectStatus).',
    '#   batchName is optional — used to narrow down which enrolment to attach to.',
    '#   Student must already exist in the system (matched by CNIC).',
    '#   subjectStatus values: active | dormant | left_campus | change_campus | left_study | exempt',
    '#',
    '# General Rules:',
    '#   cnic format: XXXXX-XXXXXXX-X  (dashes optional)',
    '#   gender: male / female',
    '#   challanPaid: yes = admission confirmed + student active, no = pending',
    '#   dateOfAdmission: YYYY-MM-DD',
    '#   session: leave empty = auto-detected from dateOfAdmission',
    '#   batchName must match exactly as it appears in the system (case-insensitive)',
    '',
  ].join('\n');

  const csvBody = [
    headers.join(','),
    ...rows.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')),
  ].join('\n');

  return meta + csvBody;
}

// ── CSV parser ─────────────────────────────────────────────────
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/);
  const result = [];
  let headers = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const cells = _splitCSVLine(line);
    if (!headers) {
      headers = cells.map(h => _normalizeHeader(h));
      continue;
    }

    const row = {};
    headers.forEach((h, idx) => { row[h] = (cells[idx] || '').trim(); });
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
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"')       { inQ = true; }
      else if (ch === ',')  { cells.push(cur); cur = ''; }
      else                    cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function _normalizeHeader(h) {
  h = h.replace(/^[# ]+/, '').trim();
  const aliases = {
    'student name':    'studentName',
    'name':            'studentName',
    'father name':     'fatherName',
    'father':          'fatherName',
    'phone':           'studentPhone',
    'mobile':          'studentPhone',
    'guardian phone':  'guardianPhone',
    'batch':           'batchName',
    'batch name':      'batchName',
    'admission date':  'dateOfAdmission',
    'date':            'dateOfAdmission',
    'paid':            'challanPaid',
    'challan paid':    'challanPaid',
    'fee paid':        'challanPaid',
    'subject code':    'subjectCode',
    'subject name':    'subjectName',
    'subject status':  'subjectStatus',
    'paper':           'subjectCode',
    'paper code':      'subjectCode',
    'discipline':      'disciplineName',
    'campus':          'campusName',
    'fee':             'feeAmount',
    'fee amount':      'feeAmount',
    'due date':        'dueDate',
  };
  const lower = h.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  return h.charAt(0).toLowerCase() + h.slice(1).replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
}

// ── Validators ─────────────────────────────────────────────────

const VALID_SUBJECT_STATUSES = [
  'active', 'dormant', 'left_campus', 'change_campus', 'left_study', 'exempt',
];

// Returns { mode: 'batch'|'subject', valid, errors, warnings, batch }
function _validateRow(row, batches) {
  const errors   = [];
  const warnings = [];

  // Common required fields
  if (!row.studentName?.trim())     errors.push('studentName is required');
  if (!row.cnic?.trim())            errors.push('CNIC is required');
  if (!row.gender?.trim())          errors.push('gender is required');
  if (!row.dateOfAdmission?.trim()) errors.push('dateOfAdmission is required');

  // CNIC format
  if (row.cnic?.trim()) {
    const cv = validateCNIC(row.cnic);
    if (!cv.valid) errors.push('Invalid CNIC: ' + cv.message);
  }

  // Gender
  const g = (row.gender || '').toLowerCase();
  if (row.gender && g !== 'male' && g !== 'female') {
    errors.push('gender must be "male" or "female"');
  }

  // Date format
  if (row.dateOfAdmission && !/^\d{4}-\d{2}-\d{2}$/.test(row.dateOfAdmission.trim())) {
    errors.push('dateOfAdmission must be YYYY-MM-DD');
  }

  // Determine mode
  const hasSubjectCode = !!row.subjectCode?.trim();
  const hasBatchName   = !!row.batchName?.trim();
  const mode = hasSubjectCode ? 'subject' : 'batch';

  if (!hasSubjectCode && !hasBatchName) {
    errors.push('Either batchName (for batch enrolment) or subjectCode (for subject/freeze import) must be provided');
  }

  // Batch lookup (needed in both modes when batchName is given)
  let batch = null;
  if (hasBatchName) {
    batch = batches.find(b => b.batchName?.toLowerCase() === row.batchName.trim().toLowerCase());
    if (!batch) errors.push('Batch "' + row.batchName + '" not found — check the exact name');
  } else if (mode === 'batch') {
    errors.push('batchName is required for batch enrolment');
  }

  // Subject status validation (Mode B)
  if (mode === 'subject' && row.subjectStatus?.trim()) {
    if (!VALID_SUBJECT_STATUSES.includes(row.subjectStatus.trim())) {
      errors.push(
        'subjectStatus "' + row.subjectStatus + '" is invalid. ' +
        'Valid values: ' + VALID_SUBJECT_STATUSES.join(', ')
      );
    }
  }

  // Optional warnings
  if (!row.fatherName?.trim())   warnings.push('fatherName is empty');
  if (!row.studentPhone?.trim()) warnings.push('studentPhone is empty');

  return { mode, valid: errors.length === 0, errors, warnings, batch };
}

// ── Main processor ─────────────────────────────────────────────
export function processBulkImport(csvText, opts) {
  opts = opts || {};
  const dryRun     = !!opts.dryRun;
  const importedBy = opts.importedBy || (Auth.getCurrentUser()?.userId) || null;

  ensureAdmissionState();
  ensureEnrolmentKeys();

  const { rows }    = parseCSV(csvText);
  const batches     = AppState.get('batches')     || [];
  const students    = AppState.get('students')    || [];
  const admissions  = AppState.get('admissions')  || [];
  const enrolments  = AppState.get('enrolments')  || [];
  const disciplines = AppState.get('disciplines') || [];
  const campuses    = AppState.get('campuses')    || [];
  const subjects    = AppState.get('subjects')    || [];  // subject master list

  const summary = {
    totalRows:      rows.length,
    imported:       0,   // new students added
    enrolmentOnly:  0,   // existing student, batch enrolment added
    subjectAdded:   0,   // subject entry appended to existing enrolment
    skipped:        0,
    errors:         [],
    results:        [],
  };

  for (const { row, lineNo } of rows) {
    const name = (row.studentName || '—').trim();
    const cnic = row.cnic || '';

    // ── Validate ───────────────────────────────────────────────
    const { mode, valid, errors, warnings, batch } = _validateRow(row, batches);

    if (!valid) {
      summary.errors.push({ lineNo, studentName: name, cnic, issues: errors });
      summary.results.push({ lineNo, status: 'error', studentName: name, cnic, message: errors.join(' | ') });
      summary.skipped++;
      continue;
    }

    const formattedCNIC = formatCNIC(row.cnic);
    const existingStudent = students.find(
      s => s.cnic === formattedCNIC || s.uniqueId === formattedCNIC
    );

    // ══════════════════════════════════════════════════════════
    //  MODE B — Subject / Freeze Import
    // ══════════════════════════════════════════════════════════
    if (mode === 'subject') {
      if (!existingStudent) {
        const issue = 'Student not found (CNIC: ' + formattedCNIC + '). Subject import requires an existing student.';
        summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
        summary.results.push({ lineNo, status: 'error', studentName: name, cnic: formattedCNIC, message: issue });
        summary.skipped++;
        continue;
      }

      // Find the correct enrolment — prefer batch match, fallback to any active
      let targetEnrolment = null;
      const studentEnrolments = enrolments.filter(e => e.studentId === existingStudent.id);

      if (batch) {
        targetEnrolment = studentEnrolments.find(e => e.batchId === batch.id);
      } else {
        // No batch specified — use the most recent active enrolment
        targetEnrolment = studentEnrolments
          .filter(e => e.status === 'active')
          .sort((a, b) => new Date(b.enrolmentDate) - new Date(a.enrolmentDate))[0] || null;
      }

      if (!targetEnrolment) {
        const batchHint = batch ? ' in batch "' + batch.batchName + '"' : '';
        const issue = 'No enrolment found for this student' + batchHint + '. Cannot attach subject.';
        summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
        summary.results.push({ lineNo, status: 'error', studentName: name, cnic: formattedCNIC, message: issue });
        summary.skipped++;
        continue;
      }

      // Check if subject already on this enrolment
      const subCode = row.subjectCode.trim();
      const existingSubjects = Array.isArray(targetEnrolment.subjects) ? targetEnrolment.subjects : [];
      const alreadyHasSubject = existingSubjects.some(
        s => s.subjectCode?.toLowerCase() === subCode.toLowerCase()
      );

      if (alreadyHasSubject) {
        const issue = 'Subject "' + subCode + '" is already on this enrolment (duplicate).';
        summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
        summary.results.push({ lineNo, status: 'duplicate', studentName: existingStudent.studentName, cnic: formattedCNIC, message: issue });
        summary.skipped++;
        continue;
      }

      // Resolve subjectId from master list (optional — graceful if not found)
      const masterSubject = subjects.find(
        s => s.code?.toLowerCase() === subCode.toLowerCase() ||
             s.abbreviation?.toLowerCase() === subCode.toLowerCase()
      );

      const newSubjectEntry = {
        subjectId:   masterSubject?.id   || '',
        subjectCode: subCode,
        subjectName: row.subjectName?.trim() || masterSubject?.name || subCode,
        status:      VALID_SUBJECT_STATUSES.includes(row.subjectStatus?.trim())
                       ? row.subjectStatus.trim()
                       : 'active',
        addedAt:     new Date().toISOString(),
        addedBy:     importedBy,
      };

      if (!dryRun) {
        const updatedSubjects = [...existingSubjects, newSubjectEntry];
        EnrolmentService.update(targetEnrolment.id, { subjects: updatedSubjects }, importedBy);
        // Refresh local reference so same-session rows see updated data
        const idx = enrolments.findIndex(e => e.id === targetEnrolment.id);
        if (idx !== -1) enrolments[idx] = { ...enrolments[idx], subjects: updatedSubjects };
      }

      summary.subjectAdded++;
      summary.results.push({
        lineNo, status: 'subject_added',
        studentName: existingStudent.studentName,
        cnic: formattedCNIC,
        message:
          'Subject "' + subCode + '" added to enrolment' +
          (batch ? ' (' + batch.batchName + ')' : ' (most recent active enrolment)') +
          (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
      });
      continue;
    }

    // ══════════════════════════════════════════════════════════
    //  MODE A — Batch Enrolment
    // ══════════════════════════════════════════════════════════

    if (existingStudent) {
      // Check duplicate enrolment for this specific batch
      const alreadyInAdmissions = admissions.some(
        a => a.studentId === existingStudent.id &&
             a.batchId   === batch.id &&
             a.status    !== ADMISSION_STATUS.CANCELLED
      );
      const alreadyInEnrolments = enrolments.some(
        e => e.studentId === existingStudent.id && e.batchId === batch.id
      );

      if (alreadyInAdmissions || alreadyInEnrolments) {
        const issue = 'Already enrolled in batch "' + batch.batchName + '" (duplicate).';
        summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
        summary.results.push({
          lineNo, status: 'duplicate',
          studentName: existingStudent.studentName,
          cnic: formattedCNIC,
          message: issue,
        });
        summary.skipped++;
        continue;
      }

      // Existing student, new batch → enrolment only
      const paid = (row.challanPaid || '').toLowerCase() === 'yes';
      if (!dryRun) {
        const newEnr = {
          studentId:     existingStudent.id,
          batchId:       batch.id,
          enrolmentDate: row.dateOfAdmission,
          status:        'active',
          feeStatus:     paid ? 'paid' : 'unpaid',
          notes:         (row.notes || '').trim(),
          subjects:      [],
        };
        const result = EnrolmentService.add(newEnr, importedBy);
        // Add to local cache so same-run duplicate check works
        if (result.success) enrolments.push(result.enrolment);
      }

      summary.enrolmentOnly++;
      summary.results.push({
        lineNo, status: 'enrolment_added',
        studentName: existingStudent.studentName,
        cnic: formattedCNIC,
        message:
          'Existing student — enrolment added for batch "' + batch.batchName + '"' +
          (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
      });
      continue;
    }

    // ── New student ────────────────────────────────────────────
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

    let campusRecord = null;
    if (batch.campusId) {
      campusRecord = campuses.find(c => c.id === batch.campusId);
    }
    if (!campusRecord && row.campusName) {
      campusRecord = campuses.find(
        c => c.campusName?.toLowerCase() === row.campusName.trim().toLowerCase()
      );
    }

    const genderNorm     = g || 'male';
    const admDate        = row.dateOfAdmission.trim();
    const discCode       = discRecord?.abbreviation || '';
    const derivedSession = row.session?.trim() || sessionFromDate(admDate);
    const paid           = (row.challanPaid || '').toLowerCase() === 'yes';
    const campusSnapshot = campusRecord
      ? { id: campusRecord.id, name: campusRecord.campusName }
      : null;

    if (!dryRun) {
      const studentInternalId   = generateID('stu');
      const structuredStudentId = generateStudentId(discCode, admDate, genderNorm);

      const newStudent = {
        id:              studentInternalId,
        studentId:       structuredStudentId,
        cnic:            formattedCNIC,
        uniqueId:        formattedCNIC,
        studentName:     row.studentName.trim(),
        fatherName:      (row.fatherName    || '').trim(),
        gender:          genderNorm,
        studentPhone:    (row.studentPhone  || '').trim(),
        phone:           (row.studentPhone  || '').trim(),
        guardianPhone:   (row.guardianPhone || '').trim(),
        qualification:   (row.qualification || '').trim(),
        district:        (row.district      || '').trim(),
        province:        (row.province      || '').trim(),
        route:           (row.route         || '').trim(),
        campusId:        campusRecord?.id   || '',
        campusSnapshot,
        disciplineId:    discRecord?.id     || '',
        batchId:         batch.id,
        dateOfAdmission: admDate,
        admissionDate:   admDate,
        session:         derivedSession,
        isActive:        paid,
        admittedVia:     'bulk_import',
        createdAt:       new Date().toISOString(),
      };

      AppState.add('students', newStudent);
      // Add to local cache for same-run deduplication
      students.push(newStudent);

      const admissionId = generateID('adm');
      AppState.add('admissions', {
        id:           admissionId,
        studentId:    studentInternalId,
        campusId:     campusRecord?.id || '',
        disciplineId: discRecord?.id   || '',
        batchId:      batch.id,
        session:      derivedSession,
        status:       paid ? ADMISSION_STATUS.CONFIRMED : ADMISSION_STATUS.PENDING,
        admittedBy:   importedBy,
        createdAt:    new Date().toISOString(),
        updatedAt:    new Date().toISOString(),
      });

      const enrResult = EnrolmentService.add({
        studentId:     studentInternalId,
        batchId:       batch.id,
        enrolmentDate: admDate,
        status:        'active',
        feeStatus:     paid ? 'paid' : 'unpaid',
        notes:         (row.notes || '').trim(),
        subjects:      [],
      }, importedBy);
      if (enrResult.success) enrolments.push(enrResult.enrolment);

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

        if (paid) {
          AppState.update('admissions', admissionId, { status: ADMISSION_STATUS.CONFIRMED });
          AppState.update('students', studentInternalId, { isActive: true });
        }
      }
    }

    summary.imported++;
    summary.results.push({
      lineNo, status: paid ? 'imported_paid' : 'imported_pending',
      studentName: row.studentName.trim(),
      cnic: formattedCNIC,
      message:
        (paid ? 'Imported & Confirmed (challan paid)' : 'Imported — challan pending') +
        (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
    });
  }

  return summary;
}

function _defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().split('T')[0];
}
