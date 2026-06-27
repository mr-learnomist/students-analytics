// ============================================================
// modules/admission/bulkImportService.js — Bulk Student Import
//
// THREE IMPORT MODES per row:
//
//  MODE A — Student Info Only  (batchName empty, subjectCode empty)
//    • Adds student to students[] only (no admission, no enrolment)
//    • If CNIC already exists → entire row skipped (duplicate)
//    • Use for importing existing students without batch assignment
//
//  MODE B — Batch Enrolment  (batchName provided, subjectCode empty)
//    • batchName MUST exist in system → hard error if not found
//    • New student     → students[] + admissions[] + enrolments[active]
//    • Existing student (matched by CNIC), not enrolled in batch
//        → enrolment added only (student record untouched)
//    • Existing student already enrolled in same batch → ERROR (skipped)
//    • Same student, multiple rows with different batches → multi-batch OK
//
//  MODE C — Subject / Freeze  (subjectCode provided; batchName optional)
//    • Student MUST already exist (matched by CNIC)
//    • If batchName given → enrolment status: 'suspended' (freeze)
//    • If batchName empty → enrolment status: 'suspended' (freeze)
//    • Finds student's enrolment for that batch (or most recent active)
//    • Appends subject entry; if subject already present → ERROR (skipped)
//    • If no enrolment found → ERROR (skipped)
//
//  challanPaid = yes  → admission confirmed + student isActive = true
//  Batch not found in system → hard error (row skipped, never saved)
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

export const REQUIRED_COLUMNS = [
  'studentName',
  'cnic',
  'gender',
  'dateOfAdmission',
  // challanPaid is optional — defaults to 'yes' (paid) on bulk import.
  // Only add it if you need to mark specific rows as unpaid (value: 'no').
];

export const OPTIONAL_COLUMNS = [
  'batchName',        // MODE B: required. MODE C: optional (narrows enrolment lookup)
  'subjectCode',      // MODE C trigger — if present → subject/freeze import
  'subjectName',      // MODE C: display name for the subject
  'subjectStatus',    // MODE C: active | dormant | … (default: active)
  'fatherName',
  'dob',              // Date of birth YYYY-MM-DD
  'email',
  'studentPhone',
  'guardianPhone',
  'qualification',
  'city',
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
    'fatherName', 'dob', 'email', 'studentPhone', 'guardianPhone',
    'qualification', 'city', 'district', 'province',
    'session', 'route', 'disciplineName', 'campusName',
    'feeAmount', 'dueDate', 'notes',
  ];

  const rows = [
    // Row 1 — MODE A: student info only (no batch, no subject)
    [
      'Ahmed Ali', '35202-1234567-1', 'male', '2025-09-01', 'no',
      '', '', '', '',
      'Usman Ali', '1998-05-15', 'ahmed@email.com', '0300-1234567', '0321-7654321',
      'A-Levels', 'Rawalpindi', 'Rawalpindi', 'Punjab',
      '', '', 'ACCA', 'Main Campus',
      '', '', 'Student info only — no batch assigned',
    ],
    // Row 2 — MODE B: new student + batch enrolment
    [
      'Sara Khan', '35202-9876543-2', 'female', '2025-09-01', 'yes',
      'FA1-Dec-25-01', '', '', '',
      'Khalid Khan', '2000-11-20', 'sara@email.com', '0301-1111111', '',
      'F.Sc', 'Islamabad', 'Islamabad', 'Punjab',
      'Dec-25', '', 'ACCA', 'Main Campus',
      '15000', '2025-09-30', 'Merit student',
    ],
    // Row 3 — MODE B: existing student (Ahmed Ali), second batch
    [
      'Ahmed Ali', '35202-1234567-1', 'male', '2025-09-01', 'no',
      'FA2-Dec-25-02', '', '', '',
      '', '', '', '', '',
      '', '', '', '',
      '', '', '', '',
      '', '', 'Second batch — enrolment added only',
    ],
    // Row 4 — MODE C: freeze/subject import (subjectCode present)
    [
      'Ahmed Ali', '35202-1234567-1', 'male', '2025-09-01', 'no',
      'FA1-Dec-25-01', 'F8', 'Audit & Assurance', 'active',
      '', '', '', '', '',
      '', '', '', '',
      '', '', '', '',
      '', '', 'Paper freeze — attached to batch enrolment',
    ],
  ];

  const meta = [
    '# Bulk Student Import Template — EduTrack',
    '# ─────────────────────────────────────────────────────────',
    '# MODE A — Student Info Only:',
    '#   Leave batchName AND subjectCode empty.',
    '#   Student record saved to Students module only.',
    '#   If CNIC already exists → row skipped (no duplicate).',
    '#',
    '# MODE B — Batch Enrolment:',
    '#   Fill batchName. Leave subjectCode empty.',
    '#   batchName MUST match exactly as in system (case-insensitive).',
    '#   New student → added to Students + Admissions + Enrolments.',
    '#   Existing student → enrolment added only (student data not changed).',
    '#',
    '# MODE C — Subject / Freeze Import:',
    '#   Fill subjectCode (batchName optional to narrow enrolment).',
    '#   Student MUST already exist in system (matched by CNIC).',
    '#   Adds subject to student existing enrolment with suspended status.',
    '#   subjectStatus: active | dormant | left_campus | change_campus | left_study | exempt',
    '#',
    '# General Rules:',
    '#   cnic: XXXXX-XXXXXXX-X  (dashes optional)',
    '#   gender: male / female',
    '#   challanPaid: leave empty = auto-marked paid (bulk import default), "no" = pending',
    '#   dateOfAdmission: YYYY-MM-DD',
    '#   dob: YYYY-MM-DD (optional)',
    '#   session: leave empty = auto-detected from dateOfAdmission',
    '#   batchName: must match exact name in system (case-insensitive)',
    '#   campusName: STRONGLY RECOMMENDED when batchName is provided.',
    '#     - Same batch name may exist in multiple campuses.',
    '#     - If campusName given → enrollment goes to that campus batch.',
    '#     - If campusName empty + student exists → uses student saved campus.',
    '#     - If ambiguous (same name, multiple campuses, no campus given) → ERROR.',
    '#     - For existing student: campusName change updates student record + admission.',
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
    'date of birth':   'dob',
    'birth date':      'dob',
    'phone':           'studentPhone',
    'mobile':          'studentPhone',
    'student phone':   'studentPhone',
    'guardian phone':  'guardianPhone',
    'parent phone':    'guardianPhone',
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
    'city':            'city',
    'email':           'email',
  };
  const lower = h.toLowerCase();
  if (aliases[lower]) return aliases[lower];
  return h.charAt(0).toLowerCase() + h.slice(1).replace(/\s+(\w)/g, (_, c) => c.toUpperCase());
}

// ── Validators ─────────────────────────────────────────────────

const VALID_SUBJECT_STATUSES = [
  'active', 'dormant', 'left_campus', 'change_campus', 'left_study', 'exempt',
];

// Returns { mode: 'info'|'batch'|'subject', valid, errors, warnings, batch }
function _validateRow(row, batches, students) {
  const errors   = [];
  const warnings = [];

  // ── Determine mode first (needed to decide which fields are required) ──
  const hasSubjectCode = !!row.subjectCode?.trim();
  const hasBatchName   = !!row.batchName?.trim();

  // MODE LOGIC:
  //   batchName only              → 'batch'   (Mode B: enrol in batch)
  //   batchName + subjectCode     → 'batch'   (Mode B+S: enrol + attach subject in one row)
  //   subjectCode only (no batch) → 'subject' (Mode C: attach subject to existing enrolment)
  //   neither                     → 'info'    (Mode A: student info only)
  let mode = 'info';
  if (hasBatchName)   mode = 'batch';    // batch always wins when present
  else if (hasSubjectCode) mode = 'subject';

  // ── Check if this CNIC already exists in system ──
  // For MODE B (batch enrolment): if student already exists, gender +
  // dateOfAdmission are NOT required — we enrol them without touching
  // their student record.
  const rawCNIC = row.cnic?.trim() || '';
  const formattedForLookup = rawCNIC ? formatCNIC(rawCNIC) : '';
  const existingForValidation = formattedForLookup
    ? students.find(s => s.cnic === formattedForLookup || s.uniqueId === formattedForLookup)
    : null;

  const isExistingStudentBatchRow = mode === 'batch' && !!existingForValidation;

  // For Mode B rows where student is NOT in system and gender/dateOfAdmission
  // are also missing — the real problem is "student not found", not missing fields.
  // Push a single clear error instead of confusing "gender is required" messages.
  const isMissingNewStudentFields = !row.gender?.trim() || !row.dateOfAdmission?.trim();
  const isUnknownBatchStudent     = mode === 'batch' && !existingForValidation && isMissingNewStudentFields;

  // ── Common required fields ──
  if (!row.studentName?.trim()) errors.push('studentName is required');
  if (!row.cnic?.trim())        errors.push('CNIC is required');

  if (isUnknownBatchStudent) {
    // Student not in system + not enough info to create → single clear message
    errors.push('Student not found in system — CNIC not registered. Check CNIC or add student manually first.');
  } else if (!isExistingStudentBatchRow) {
    // New student creation path — all fields required
    if (!row.gender?.trim())          errors.push('gender is required');
    if (!row.dateOfAdmission?.trim()) errors.push('dateOfAdmission is required');
  }

  // CNIC format
  if (row.cnic?.trim()) {
    const cv = validateCNIC(row.cnic);
    if (!cv.valid) errors.push('Invalid CNIC: ' + cv.message);
  }

  // Gender value check (only when provided)
  const g = (row.gender || '').toLowerCase();
  if (row.gender?.trim() && g !== 'male' && g !== 'female') {
    errors.push('gender must be "male" or "female"');
  }

  // Date format (only when provided)
  if (row.dateOfAdmission?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.dateOfAdmission.trim())) {
    errors.push('dateOfAdmission must be YYYY-MM-DD');
  }

  // DOB format (optional)
  if (row.dob?.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(row.dob.trim())) {
    warnings.push('dob format should be YYYY-MM-DD — ignored');
  }

  // Batch lookup — HARD error if batch specified but not found
  // Campus-aware: if campusName provided, match batch to that campus first.
  // If campusName empty and student already exists, use their saved campusId.
  let batch = null;
  if (hasBatchName) {
    const rawCampusName = row.campusName?.trim() || '';
    // Try to resolve campusId from CSV campusName column
    const csvCampus = rawCampusName
      ? (AppState.get('campuses') || []).find(
          c => c.campusName?.toLowerCase() === rawCampusName.toLowerCase()
        )
      : null;

    // Determine the target campusId:
    //   1. Campus explicitly in CSV row
    //   2. Existing student's campusId (when no campus in CSV)
    //   3. No campus filter (fall back to name-only — ambiguous)
    const targetCampusId = csvCampus?.id
      || existingForValidation?.campusId
      || null;

    if (targetCampusId) {
      // Prefer campus-filtered match
      batch = batches.find(
        b => b.batchName?.toLowerCase() === row.batchName.trim().toLowerCase()
          && b.campusId === targetCampusId
      );
    }

    // Fallback: name-only (no campus info available)
    if (!batch) {
      const nameMatches = batches.filter(
        b => b.batchName?.toLowerCase() === row.batchName.trim().toLowerCase()
      );
      if (nameMatches.length === 1) {
        batch = nameMatches[0];
      } else if (nameMatches.length > 1) {
        // Ambiguous — multiple batches with same name, campus required
        errors.push(
          'Batch "' + row.batchName.trim() + '" exists in multiple campuses. ' +
          'Please specify campusName column to avoid wrong campus enrollment.'
        );
      }
    }

    if (!batch && !errors.some(e => e.includes('multiple campuses'))) {
      errors.push('Batch "' + row.batchName.trim() + '" does not exist in system — check exact name');
    }
  }

  // Subject status validation (Mode C)
  if (mode === 'subject' && row.subjectStatus?.trim()) {
    if (!VALID_SUBJECT_STATUSES.includes(row.subjectStatus.trim())) {
      errors.push(
        'subjectStatus "' + row.subjectStatus + '" is invalid. ' +
        'Valid: ' + VALID_SUBJECT_STATUSES.join(', ')
      );
    }
  }

  // Optional field warnings (skip for existing-student batch rows — we won't use these anyway)
  if (!isExistingStudentBatchRow) {
    if (!row.fatherName?.trim())   warnings.push('fatherName is empty');
    if (!row.studentPhone?.trim()) warnings.push('studentPhone is empty');
  }

  return { mode, valid: errors.length === 0, errors, warnings, batch };
}

// ── Shared state loader ────────────────────────────────────────
function _loadState() {
  return {
    batches:     AppState.get('batches')     || [],
    students:    AppState.get('students')    || [],
    admissions:  AppState.get('admissions')  || [],
    enrolments:  AppState.get('enrolments')  || [],
    disciplines: AppState.get('disciplines') || [],
    campuses:    AppState.get('campuses')    || [],
    subjects:    AppState.get('subjects')    || [],
  };
}

function _makeSummary(totalRows) {
  return {
    totalRows,
    imported:      0,
    enrolmentOnly: 0,
    subjectAdded:  0,
    infoOnly:      0,
    skipped:       0,
    notFound:      0,   // Mode B rows where CNIC not in system & new-student fields missing
    errors:        [],
    results:       [],
  };
}

// ── Process a single row (pure logic, no I/O) ──────────────────
function _processRow({ row, lineNo }, state, summary, dryRun, importedBy) {
  const { batches, students, admissions, enrolments, disciplines, campuses, subjects } = state;
  const name = (row.studentName || '—').trim();
  const cnic = row.cnic || '';

  const { mode, valid, errors, warnings, batch } = _validateRow(row, batches, students);

  if (!valid) {
    // Use 'not_found' badge (orange) when the sole issue is student not in system,
    // 'error' (red) for all other validation failures.
    const isNotFoundError = errors.length === 1 && errors[0].startsWith('Student not found in system');
    const status = isNotFoundError ? 'not_found' : 'error';
    if (isNotFoundError) summary.notFound++;
    summary.errors.push({ lineNo, studentName: name, cnic, issues: errors });
    summary.results.push({ lineNo, status, studentName: name, cnic, message: errors.join(' | ') });
    summary.skipped++;
    return;
  }

  const formattedCNIC   = formatCNIC(row.cnic);
  const existingStudent = students.find(
    s => s.cnic === formattedCNIC || s.uniqueId === formattedCNIC
  );

  // ── MODE C ──────────────────────────────────────────────────
  if (mode === 'subject') {
    if (!existingStudent) {
      const issue = 'Student not found (CNIC: ' + formattedCNIC + '). Subject import requires an existing student.';
      summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
      summary.results.push({ lineNo, status: 'error', studentName: name, cnic: formattedCNIC, message: issue });
      summary.skipped++;
      return;
    }

    let targetEnrolment = null;
    const studentEnrolments = enrolments.filter(e => e.studentId === existingStudent.id);

    if (batch) {
      targetEnrolment = studentEnrolments.find(e => e.batchId === batch.id);
    } else {
      targetEnrolment = studentEnrolments
        .filter(e => e.status === 'active' || e.status === 'suspended')
        .sort((a, b) => new Date(b.enrolmentDate) - new Date(a.enrolmentDate))[0] || null;
    }

    if (!targetEnrolment) {
      const batchHint = batch ? ' in batch "' + batch.batchName + '"' : '';
      const issue = 'No enrolment found for this student' + batchHint + '. Cannot attach subject.';
      summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
      summary.results.push({ lineNo, status: 'error', studentName: name, cnic: formattedCNIC, message: issue });
      summary.skipped++;
      return;
    }

    const subCode          = row.subjectCode.trim();
    const existingSubjects = Array.isArray(targetEnrolment.subjects) ? targetEnrolment.subjects : [];
    const alreadyHasSub    = existingSubjects.some(s => s.subjectCode?.toLowerCase() === subCode.toLowerCase());

    if (alreadyHasSub) {
      const issue = 'Subject "' + subCode + '" already on this enrolment (duplicate).';
      summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
      summary.results.push({ lineNo, status: 'duplicate', studentName: existingStudent.studentName, cnic: formattedCNIC, message: issue });
      summary.skipped++;
      return;
    }

    const masterSubject = subjects.find(
      s => s.code?.toLowerCase() === subCode.toLowerCase() ||
           s.abbreviation?.toLowerCase() === subCode.toLowerCase()
    );

    const subStatus = VALID_SUBJECT_STATUSES.includes(row.subjectStatus?.trim())
      ? row.subjectStatus.trim()
      : 'suspended';

    const newSubjectEntry = {
      subjectId:   masterSubject?.id || '',
      subjectCode: subCode,
      subjectName: row.subjectName?.trim() || masterSubject?.name || subCode,
      status:      subStatus,
      addedAt:     new Date().toISOString(),
      addedBy:     importedBy,
    };

    if (!dryRun) {
      const updatedSubjects = [...existingSubjects, newSubjectEntry];
      EnrolmentService.update(targetEnrolment.id, { subjects: updatedSubjects }, importedBy);
      const idx = enrolments.findIndex(e => e.id === targetEnrolment.id);
      if (idx !== -1) enrolments[idx] = { ...enrolments[idx], subjects: updatedSubjects };
    }

    summary.subjectAdded++;
    summary.results.push({
      lineNo, status: 'subject_added',
      studentName: existingStudent.studentName,
      cnic: formattedCNIC,
      message:
        'Subject "' + subCode + '" added' +
        (batch ? ' (' + batch.batchName + ')' : ' (most recent enrolment)') +
        ' · status: ' + subStatus +
        (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
    });
    return;
  }

  // ── MODE A ──────────────────────────────────────────────────
  if (mode === 'info') {
    if (existingStudent) {
      const issue = 'CNIC ' + formattedCNIC + ' already registered as "' + existingStudent.studentName + '" — skipped.';
      summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
      summary.results.push({ lineNo, status: 'duplicate', studentName: name, cnic: formattedCNIC, message: issue });
      summary.skipped++;
      return;
    }

    if (!dryRun) {
      const { newStudent } = _buildNewStudent(row, formattedCNIC, null, disciplines, campuses, importedBy);
      AppState.add('students', newStudent);
      students.push(newStudent);
    }

    summary.imported++;
    summary.infoOnly++;
    summary.results.push({
      lineNo, status: 'info_only',
      studentName: row.studentName.trim(),
      cnic: formattedCNIC,
      message: 'Student info saved (no batch/enrolment)' +
        (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
    });
    return;
  }

  // ── MODE B (+ optional subject) — Existing student ───────────
  if (existingStudent) {
    const alreadyEnrolled = enrolments.some(
      e => e.studentId === existingStudent.id && e.batchId === batch.id
    );

    if (alreadyEnrolled) {
      const issue = 'Already enrolled in batch "' + batch.batchName + '" (duplicate).';
      summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
      summary.results.push({ lineNo, status: 'duplicate', studentName: existingStudent.studentName, cnic: formattedCNIC, message: issue });
      summary.skipped++;
      return;
    }

    const paid = (row.challanPaid || '').toLowerCase() !== 'no'; // default: paid (bulk import = fee already collected)
    const enrolDate = row.dateOfAdmission?.trim() || existingStudent.dateOfAdmission || existingStudent.admissionDate || new Date().toISOString().split('T')[0];

    // ── Campus change: if CSV has campusName and it differs from student's saved campus,
    //    update the student record and their admission record accordingly.
    const csvCampusForUpdate = row.campusName?.trim()
      ? campuses.find(c => c.campusName?.toLowerCase() === row.campusName.trim().toLowerCase())
      : null;
    const campusChanged = csvCampusForUpdate && csvCampusForUpdate.id !== existingStudent.campusId;
    if (campusChanged && !dryRun) {
      AppState.update('students', existingStudent.id, {
        campusId:       csvCampusForUpdate.id,
        campusSnapshot: { id: csvCampusForUpdate.id, name: csvCampusForUpdate.campusName },
      });
      existingStudent.campusId = csvCampusForUpdate.id;
      // Update any existing admission for this student to reflect new campus
      const existingAdm = admissions.find(a => a.studentId === existingStudent.id);
      if (existingAdm) {
        AppState.update('admissions', existingAdm.id, { campusId: csvCampusForUpdate.id });
      }
    }

    // Build subject entry if subjectCode provided
    const subCode = row.subjectCode?.trim() || '';
    let initialSubjects = [];
    if (subCode) {
      const masterSubject = subjects.find(
        s => s.code?.toLowerCase() === subCode.toLowerCase() ||
             s.abbreviation?.toLowerCase() === subCode.toLowerCase()
      );
      const subStatus = VALID_SUBJECT_STATUSES.includes(row.subjectStatus?.trim())
        ? row.subjectStatus.trim()
        : 'active';
      initialSubjects = [{
        subjectId:   masterSubject?.id || '',
        subjectCode: subCode,
        subjectName: row.subjectName?.trim() || masterSubject?.name || subCode,
        status:      subStatus,
        addedAt:     new Date().toISOString(),
        addedBy:     importedBy,
      }];
    }

    if (!dryRun) {
      const result = EnrolmentService.add({
        studentId:     existingStudent.id,
        batchId:       batch.id,
        enrolmentDate: enrolDate,
        status:        'active',
        feeStatus:     paid ? 'paid' : 'unpaid',
        notes:         (row.notes || '').trim(),
        subjects:      initialSubjects,
      }, importedBy);
      if (result.success) enrolments.push(result.enrolment);
    }

    summary.enrolmentOnly++;
    summary.results.push({
      lineNo, status: 'enrolment_added',
      studentName: existingStudent.studentName,
      cnic: formattedCNIC,
      message: 'Existing student — enrolment added for "' + batch.batchName + '"' +
        (campusChanged ? ' · campus updated to "' + csvCampusForUpdate.campusName + '"' : '') +
        (subCode ? ' · subject: ' + subCode : '') +
        (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
    });
    return;
  }

  // New student + batch enrolment
  // If gender or dateOfAdmission are missing (user only provided name+cnic+batch),
  // we cannot create a new student record — skip with a clear message.
  if (!row.gender?.trim() || !row.dateOfAdmission?.trim()) {
    const issue = 'Student not found in system (CNIC: ' + formattedCNIC + '). ' +
      'Cannot create new student — gender and dateOfAdmission are required for new students.';
    summary.errors.push({ lineNo, studentName: name, cnic: formattedCNIC, issues: [issue] });
    summary.results.push({ lineNo, status: 'not_found', studentName: name, cnic: formattedCNIC, message: issue });
    summary.skipped++;
    summary.notFound++;
    return;
  }

  const paid = (row.challanPaid || '').toLowerCase() !== 'no'; // default: paid (bulk import = fee already collected)

  // Build subject entry for new student enrolment if subjectCode provided
  const newStuSubCode = row.subjectCode?.trim() || '';
  let newStuSubjects = [];
  if (newStuSubCode) {
    const masterSubject = subjects.find(
      s => s.code?.toLowerCase() === newStuSubCode.toLowerCase() ||
           s.abbreviation?.toLowerCase() === newStuSubCode.toLowerCase()
    );
    const subStatus = VALID_SUBJECT_STATUSES.includes(row.subjectStatus?.trim())
      ? row.subjectStatus.trim()
      : 'active';
    newStuSubjects = [{
      subjectId:   masterSubject?.id || '',
      subjectCode: newStuSubCode,
      subjectName: row.subjectName?.trim() || masterSubject?.name || newStuSubCode,
      status:      subStatus,
      addedAt:     new Date().toISOString(),
      addedBy:     importedBy,
    }];
  }

  if (!dryRun) {
    const { newStudent, discRecord, campusRecord, derivedSession } =
      _buildNewStudent(row, formattedCNIC, batch, disciplines, campuses, importedBy);

    AppState.add('students', newStudent);
    students.push(newStudent);

    const admissionId = generateID('adm');
    AppState.add('admissions', {
      id:           admissionId,
      studentId:    newStudent.id,
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
      studentId:     newStudent.id,
      batchId:       batch.id,
      enrolmentDate: row.dateOfAdmission,
      status:        'active',
      feeStatus:     paid ? 'paid' : 'unpaid',
      notes:         (row.notes || '').trim(),
      subjects:      newStuSubjects,
    }, importedBy);
    if (enrResult.success) enrolments.push(enrResult.enrolment);

    const feeAmount = parseFloat(row.feeAmount) || 0;
    if (feeAmount > 0) {
      const challan = {
        id:          generateID('chl'),
        admissionId,
        studentId:   newStudent.id,
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
        AppState.update('students', newStudent.id, { isActive: true });
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
      ' · batch: ' + batch.batchName +
      (warnings.length ? ' | Warnings: ' + warnings.join(', ') : ''),
  });
}

// ── Async chunked import (primary — use this for large files) ──
// onProgress(done, total) called after each chunk
export async function processBulkImportAsync(csvText, opts, onProgress) {
  opts = opts || {};
  const dryRun     = !!opts.dryRun;
  const importedBy = opts.importedBy || (Auth.getCurrentUser()?.userId) || null;
  const chunkSize  = opts.chunkSize  || 50;

  ensureAdmissionState();
  ensureEnrolmentKeys();

  const { rows } = parseCSV(csvText);
  const state    = _loadState();
  const summary  = _makeSummary(rows.length);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    for (const item of chunk) {
      _processRow(item, state, summary, dryRun, importedBy);
    }
    // Yield to browser between chunks so UI stays responsive
    await new Promise(r => setTimeout(r, 0));
    onProgress?.(Math.min(i + chunkSize, rows.length), rows.length);
  }

  return summary;
}

// ── Sync import (kept for backward-compat; avoid on large files) ─
export function processBulkImport(csvText, opts) {
  opts = opts || {};
  const dryRun     = !!opts.dryRun;
  const importedBy = opts.importedBy || (Auth.getCurrentUser()?.userId) || null;

  ensureAdmissionState();
  ensureEnrolmentKeys();

  const { rows }    = parseCSV(csvText);
  const state       = _loadState();
  const summary     = _makeSummary(rows.length);

  for (const item of rows) {
    _processRow(item, state, summary, dryRun, importedBy);
  }

  return summary;
}

// ── Build new student object (aligned with admissionService.js fields) ──
function _buildNewStudent(row, formattedCNIC, batch, disciplines, campuses, importedBy) {
  const g = (row.gender || '').toLowerCase();
  const genderNorm     = (g === 'female') ? 'female' : 'male';
  const admDate        = row.dateOfAdmission.trim();
  const derivedSession = row.session?.trim() || sessionFromDate(admDate);
  const paid           = (row.challanPaid || '').toLowerCase() !== 'no'; // default: paid

  // Resolve discipline — prefer batch's disciplineId, fallback to row.disciplineName
  let discRecord = null;
  if (batch?.disciplineId) {
    discRecord = disciplines.find(d => d.id === batch.disciplineId);
  }
  if (!discRecord && row.disciplineName?.trim()) {
    discRecord = disciplines.find(
      d => d.abbreviation?.toLowerCase() === row.disciplineName.trim().toLowerCase() ||
           d.name?.toLowerCase()         === row.disciplineName.trim().toLowerCase()
    );
  }

  // Resolve campus — prefer batch's campusId, fallback to row.campusName
  let campusRecord = null;
  if (batch?.campusId) {
    campusRecord = campuses.find(c => c.id === batch.campusId);
  }
  if (!campusRecord && row.campusName?.trim()) {
    campusRecord = campuses.find(
      c => c.campusName?.toLowerCase() === row.campusName.trim().toLowerCase()
    );
  }

  const discCode       = discRecord?.abbreviation || '';
  const campusSnapshot = campusRecord
    ? { id: campusRecord.id, name: campusRecord.campusName }
    : null;

  const studentInternalId   = generateID('stu');
  const structuredStudentId = generateStudentId(discCode, admDate, genderNorm);

  // Split name into first/last for compatibility with admissionService.js format
  const nameParts = row.studentName.trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName  = nameParts.slice(1).join(' ') || '';

  // DOB validation
  const dobRaw = row.dob?.trim() || '';
  const dob    = /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? dobRaw : '';

  const newStudent = {
    // Identity
    id:               studentInternalId,
    studentId:        structuredStudentId,
    applicationNo:    '',                              // not generated on bulk import
    cnic:             formattedCNIC,
    uniqueId:         formattedCNIC,

    // Names
    studentName:      row.studentName.trim(),
    firstName:        firstName,
    lastName:         lastName,
    fatherName:       (row.fatherName    || '').trim(),

    // Personal
    gender:           genderNorm,
    dob:              dob,
    email:            (row.email         || '').trim(),

    // Contact
    studentPhone:     (row.studentPhone  || '').trim(),
    phone:            (row.studentPhone  || '').trim(),  // backward compat
    guardianPhone:    (row.guardianPhone || '').trim(),
    guardianContacts: row.guardianPhone?.trim()
      ? [{ label: 'Guardian', phone: row.guardianPhone.trim() }]
      : [],

    // Location
    city:             (row.city          || '').trim(),
    district:         (row.district      || '').trim(),
    province:         (row.province      || '').trim(),
    address:          '',

    // Academic
    qualification:    (row.qualification || '').trim(),
    route:            (row.route         || '').trim(),

    // Campus / Discipline
    campusId:         campusRecord?.id   || '',
    campusSnapshot,
    disciplineId:     discRecord?.id     || '',

    // Admission
    dateOfAdmission:  admDate,
    admissionDate:    admDate,                         // backward compat
    session:          derivedSession,
    batchId:          batch?.id          || '',
    admissionBatch:   '',

    // Status
    isActive:         paid,
    admittedVia:      'bulk_import',
    createdAt:        new Date().toISOString(),
  };

  return { newStudent, discRecord, campusRecord, derivedSession };
}

function _defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().split('T')[0];
}
