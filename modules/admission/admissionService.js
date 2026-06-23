// ============================================================
// modules/admission/admissionService.js — Admission Business Logic
//
// Handles:
//   • New student admission (4-step wizard flow)
//   • Existing student re-admission to new batch/session
//   • Auto-linkage → students[], attendanceRecords[], batchSchedules[]
//   • Challan generation & payment tracking
//   • Role-based campus filtering (Admin sees all, others see own campus)
//   • CNIC validation reused from studentService
// ============================================================

import { AppState, generateID } from '../../utils/state.js';
import { Auth }                 from '../../utils/auth.js';
import { validateCNIC, formatCNIC, cnicDigitsOnly, generateStudentId, sessionFromDate } from '../student/studentService.js';

// ── State keys ────────────────────────────────────────────────
const KEY_ADMISSIONS = 'admissions';
const KEY_CHALLANS   = 'challans';
const KEY_STUDENTS   = 'students';

// ── Challan status constants ──────────────────────────────────
export const CHALLAN_STATUS = {
  PENDING: 'pending',
  PAID:    'paid',
  OVERDUE: 'overdue',
  WAIVED:  'waived',
};

// ── Admission status constants ────────────────────────────────
export const ADMISSION_STATUS = {
  DRAFT:     'draft',      // wizard incomplete
  PENDING:   'pending',    // submitted, challan not paid
  CONFIRMED: 'confirmed',  // challan paid → student active
  CANCELLED: 'cancelled',
};

// ── Ensure state keys exist (migration safety) ────────────────
export function ensureAdmissionState() {
  if (!AppState.get(KEY_ADMISSIONS)) AppState.set(KEY_ADMISSIONS, []);
  if (!AppState.get(KEY_CHALLANS))   AppState.set(KEY_CHALLANS,   []);
}

// ─────────────────────────────────────────────────────────────
// SECTION 1 — Data Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Return campuses visible to the current user.
 * Admin (campusId=null) → all campuses.
 * Others → only their assigned campus.
 */
export function getAccessibleCampuses() {
  const all  = AppState.get('campuses') || [];
  return Auth.filterByCampus(all);
}

/**
 * Return active batches for a campus.
 * "Active" = batch.isActive === true  (same field used by BatchModule)
 */
export function getActiveBatchesForCampus(campusId) {
  const batches = AppState.get('batches') || [];
  return batches.filter(b => b.campusId === campusId && b.isActive !== false);
}

/**
 * Return batches filtered by campus + discipline + level.
 * Any param can be null/undefined → acts as wildcard.
 */
export function getFilteredBatchesForAdmission({ campusId, disciplineId, levelId } = {}) {
  let list = AppState.get('batches') || [];
  if (campusId)     list = list.filter(b => b.campusId     === campusId);
  if (disciplineId) list = list.filter(b => b.disciplineId === disciplineId);
  if (levelId)      list = list.filter(b => b.levelId      === levelId);
  // Only active batches are eligible for new admissions
  list = list.filter(b => b.isActive !== false);
  return list;
}

/**
 * Look up an existing student by CNIC.
 * Returns student object or null.
 */
export function findStudentByCNIC(rawCNIC) {
  const result = validateCNIC(rawCNIC);
  if (!result.valid) return null;
  const students = AppState.get(KEY_STUDENTS) || [];
  return students.find(s => (s.cnic || s.uniqueId) === result.formatted) || null;
}

/**
 * Check if a student is already enrolled in a given batch+session combo.
 */
export function isAlreadyEnrolled(studentId, batchId, session) {
  const admissions = AppState.get(KEY_ADMISSIONS) || [];
  return admissions.some(
    a => a.studentId === studentId &&
         a.batchId   === batchId   &&
         a.session   === session   &&
         a.status    !== ADMISSION_STATUS.CANCELLED
  );
}

/**
 * Get all admissions for a campus (respects RBAC).
 */
export function getAdmissions({ campusId, status, session } = {}) {
  let list = AppState.get(KEY_ADMISSIONS) || [];

  // Campus-based access control
  const user = Auth.getCurrentUser();
  if (user?.campusId) {
    list = list.filter(a => a.campusId === user.campusId);
  } else if (campusId) {
    list = list.filter(a => a.campusId === campusId);
  }

  if (status)  list = list.filter(a => a.status  === status);
  if (session) list = list.filter(a => a.session === session);

  return list;
}

/**
 * Get challans — optionally filter by admissionId or status.
 */
export function getChallans({ admissionId, status } = {}) {
  let list = AppState.get(KEY_CHALLANS) || [];
  if (admissionId) list = list.filter(c => c.admissionId === admissionId);
  if (status)      list = list.filter(c => c.status      === status);
  return list;
}

/**
 * Get ALL challans across campus access, enriched with late fee info.
 * Used by the Mark Payment screen to show all challans + enable search.
 *
 * @param {{ search?: string, status?: string, campusId?: string }} opts
 * @returns {Array} challans with { ...challan, student, campus, lateFee }
 */
export function getAllChallansForPayment({ search = '', status = '', campusId = '' } = {}) {
  ensureAdmissionState();
  let challans = AppState.get(KEY_CHALLANS) || [];
  const students = AppState.get(KEY_STUDENTS) || [];
  const campuses = AppState.get('campuses')   || [];

  // Campus-based RBAC
  const user = Auth.getCurrentUser();
  if (user?.campusId) {
    challans = challans.filter(c => c.campusId === user.campusId);
  } else if (campusId) {
    challans = challans.filter(c => c.campusId === campusId);
  }

  if (status) challans = challans.filter(c => c.status === status);

  // Enrich each challan with student + campus + computed late fee
  let enriched = challans.map(c => {
    const student = students.find(s => s.id === c.studentId) || null;
    const campus  = campuses.find(x => x.id === c.campusId)  || null;
    const lf      = (c.status === CHALLAN_STATUS.PENDING)
      ? calcLateFee({ campusId: c.campusId, levelId: student?.levelId, dueDate: c.dueDate })
      : { isLate: false, daysLate: 0, lateFeeAmount: 0 };
    return { ...c, student, campus, lateFeeInfo: lf,
             totalPayable: (Number(c.feeAmount) || 0) + (lf.lateFeeAmount || 0) };
  });

  // Search across name, CNIC, challanNo, session
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    enriched = enriched.filter(c => {
      const name    = (c.studentName || c.student?.studentName || '').toLowerCase();
      const cnic    = (c.student?.cnic || c.student?.uniqueId || '').toLowerCase();
      const challan = String(c.challanNo).toLowerCase();
      const session = (c.session || '').toLowerCase();
      return name.includes(q) || cnic.includes(q) || challan.includes(q) || session.includes(q);
    });
  }

  // Sort: pending-overdue first, then pending, then others
  enriched.sort((a, b) => {
    const rank = s => {
      if (s === CHALLAN_STATUS.PENDING) return 0;
      if (s === CHALLAN_STATUS.PAID)    return 1;
      return 2;
    };
    return rank(a.status) - rank(b.status);
  });

  return enriched;
}

// ─────────────────────────────────────────────────────────────
// SECTION 2 — Core Admission CRUD
// ─────────────────────────────────────────────────────────────

export const AdmissionService = {

  // ── Step 1 validator: Student Info ──────────────────────────
  // Call before moving to step 2.
  // Returns { valid: true } or { valid: false, errors: { field: msg } }
  validateStudentInfo(data) {
    const errors = {};

    if (!data.firstName?.trim())  errors.firstName  = 'First name is required.';
    if (!data.lastName?.trim())   errors.lastName   = 'Last name is required.';
    if (!data.fatherName?.trim()) errors.fatherName = 'Father name is required.';
    if (!data.phone?.trim())      errors.phone      = 'Phone number is required.';
    // campusId is collected in Step 2 (Course Selection) — not validated here

    // CNIC validation
    if (!data.cnic?.trim()) {
      errors.cnic = 'CNIC is required.';
    } else {
      const cnicResult = validateCNIC(data.cnic);
      if (!cnicResult.valid) errors.cnic = cnicResult.message;
    }

    // Gender
    if (!data.gender) errors.gender = 'Gender is required.';

    return { valid: Object.keys(errors).length === 0, errors };
  },

  // ── Step 2 validator: Course Selection ──────────────────────
  validateCourseSelection(data) {
    const errors = {};
    if (!data.disciplineId) errors.disciplineId = 'Discipline is required.';
    if (!data.levelId)      errors.levelId      = 'Level is required.';
    if (!data.subjectId)    errors.subjectId    = 'Subject is required.';
    if (!data.batchId)      errors.batchId      = 'Batch is required.';
    if (!data.session)      errors.session      = 'Session is required.';
    return { valid: Object.keys(errors).length === 0, errors };
  },

  // ── Submit new admission (new student) ───────────────────────
  // Creates: admission record → student record → challan
  // Returns: { success, admission, student, challan, message }
  submitNewAdmission(formData) {
    ensureAdmissionState();

    // ── Validate CNIC ─────────────────────────────────────────
    const cnicResult = validateCNIC(formData.cnic);
    if (!cnicResult.valid) return { success: false, message: cnicResult.message };
    const formattedCNIC = cnicResult.formatted;

    // ── Check duplicate CNIC in students ─────────────────────
    const existingStudent = findStudentByCNIC(formattedCNIC);
    if (existingStudent) {
      return {
        success: false,
        message: `CNIC ${formattedCNIC} already registered. Use "Existing Student" tab to re-admit.`,
        existingStudentId: existingStudent.id,
      };
    }

    // ── Resolve related records ────────────────────────────────
    const batch   = AppState.findById('batches',     formData.batchId);
    const subject = AppState.findById('subjects',    formData.subjectId);
    const level   = AppState.findById('levels',      formData.levelId);
    const campus  = AppState.findById('campuses',    formData.campusId);

    if (!batch)  return { success: false, message: 'Selected batch not found.' };
    if (!campus) return { success: false, message: 'Selected campus not found.' };

    // ── Create student record ─────────────────────────────────
    // Mirrors exact shape used by studentService.js
    const studentId = generateID('stu');

    // ── Resolve discipline abbreviation for structured studentId ──
    const discRecord  = AppState.findById('disciplines', formData.disciplineId);
    const discCode    = discRecord?.abbreviation || '';

    // ── Normalize gender to lowercase (studentService.js uses lowercase) ──
    const genderRaw   = (formData.gender || 'Male');
    const genderNorm  = genderRaw.toLowerCase(); // 'male' | 'female'

    // ── Admission date ──────────────────────────────────────────
    const admDate     = formData.admissionDate || new Date().toISOString().split('T')[0];

    // ── Generate 10-digit structured studentId ──────────────────
    const structuredStudentId = generateStudentId(discCode, admDate, genderNorm);

    // ── Campus snapshot (so Campus column shows correctly) ──────
    const campusSnapshot = campus
      ? { id: campus.id, name: campus.campusName }
      : null;

    // ── Session auto-derived from admission date ────────────────
    const derivedSession = formData.session || sessionFromDate(admDate);

    // ── Map guardian contacts → guardianPhone ───────────────────
    const guardianContacts = Array.isArray(formData.guardianContacts) ? formData.guardianContacts : [];
    const guardianPhone    = (guardianContacts.find(g => g.phone?.trim()) || {}).phone?.trim() || '';

    // ── Application Number: campusCode + auto-seq (e.g. F8001) ──
    const applicationNo = _generateApplicationNo(campus);

    const student = {
      id:               studentId,
      studentNumber:    _generateStudentNumber(),
      studentId:        structuredStudentId,       // ✅ 10-digit structured ID
      applicationNo:    applicationNo,             // ✅ e.g. F8001
      cnic:             formattedCNIC,
      uniqueId:         formattedCNIC,
      studentName:      `${formData.firstName.trim()} ${formData.lastName.trim()}`,
      firstName:        formData.firstName.trim(),
      lastName:         formData.lastName.trim(),
      fatherName:       formData.fatherName?.trim()      || '',
      gender:           genderNorm,                // ✅ lowercase: 'male' | 'female'
      dob:              formData.dob                     || '',
      studentPhone:     formData.phone?.trim()            || '',  // ✅ correct field
      guardianPhone:    guardianPhone,                            // ✅ mapped from guardianContacts
      phone:            formData.phone?.trim()            || '',  // backward compat
      email:            formData.email?.trim()            || '',
      address:          formData.address?.trim()          || '',
      city:             formData.city?.trim()             || '',
      province:         formData.province                 || '',
      route:            formData.route                    || '',
      qualification:    formData.qualification?.trim()    || '',
      guardianContacts: guardianContacts,
      campusSnapshot:   campusSnapshot,            // ✅ campus column fix
      dateOfAdmission:  admDate,                   // ✅ correct field name
      admissionDate:    admDate,                   // backward compat
      campusId:         formData.campusId,
      disciplineId:     formData.disciplineId,
      subjectId:        formData.subjectId               || null,
      levelId:          level?.id                        || null,
      batchId:          formData.batchId,
      teacherId:        batch.teacherId                  || null,
      session:          derivedSession,            // ✅ auto-derived if not provided
      admissionBatch:   formData.admissionBatch           || '',
      isActive:         false,  // becomes true after challan payment
      createdAt:        new Date().toISOString(),
      admittedVia:      'admission_module',
    };

    AppState.add(KEY_STUDENTS, student);

    // ── Create admission record ───────────────────────────────
    const admissionId = generateID('adm');
    const admission = {
      id:              admissionId,
      studentId:       studentId,
      campusId:        formData.campusId,
      disciplineId:    formData.disciplineId,
      levelId:         formData.levelId      || null,
      subjectId:       formData.subjectId    || null,
      batchId:         formData.batchId,
      session:         formData.session,
      // ── Multi-subject selections (from Step 2) ────────────
      subjectIds:      Array.isArray(formData.subjectIds)      ? formData.subjectIds      : (formData.subjectId ? [formData.subjectId] : []),
      batchSelections: (typeof formData.batchSelections === 'object' && formData.batchSelections !== null)
                         ? formData.batchSelections : (formData.batchId ? { [formData.subjectId]: formData.batchId } : {}),
      noBatchSubjectIds: Array.isArray(formData._noBatchSubjectIds) ? formData._noBatchSubjectIds : [],
      status:          ADMISSION_STATUS.PENDING,
      admittedBy:      Auth.getCurrentUser()?.userId || null,
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };

    AppState.add(KEY_ADMISSIONS, admission);

    // ── Generate challan ──────────────────────────────────────
    const challan = this._generateChallan({
      admissionId,
      studentId,
      studentName: student.studentName,
      campusId:    formData.campusId,
      batchId:     formData.batchId,
      session:     formData.session,
      feeAmount:   formData.feeAmount || 0,
      dueDate:     formData.dueDate   || _defaultDueDate(),
    });

    return { success: true, admission, student, challan };
  },

  // ── Re-admit existing student ─────────────────────────────────
  // Student already exists — just create a new admission + new challan.
  submitReAdmission(studentId, formData) {
    ensureAdmissionState();

    const student = AppState.findById(KEY_STUDENTS, studentId);
    if (!student) return { success: false, message: 'Student not found.' };

    // Prevent duplicate enrollment
    if (isAlreadyEnrolled(studentId, formData.batchId, formData.session)) {
      return { success: false, message: 'Student is already enrolled in this batch and session.' };
    }

    const batch  = AppState.findById('batches',  formData.batchId);
    const level  = AppState.findById('levels',   formData.levelId);
    if (!batch) return { success: false, message: 'Selected batch not found.' };

    // Update student's current batch/level (re-admission upgrades their profile)
    AppState.update(KEY_STUDENTS, studentId, {
      disciplineId:     formData.disciplineId     || student.disciplineId,
      levelId:          formData.levelId          || student.levelId,
      subjectId:        formData.subjectId        || student.subjectId,
      batchId:          formData.batchId,
      teacherId:        batch.teacherId           || student.teacherId,
      session:          formData.session,
      campusId:         formData.campusId         || student.campusId,
      province:         formData.province         || student.province         || '',
      route:            formData.route            || student.route            || '',
      city:             formData.city             || student.city             || '',
      admissionDate:    formData.admissionDate    || student.admissionDate    || '',
      guardianContacts: Array.isArray(formData.guardianContacts) ? formData.guardianContacts : (student.guardianContacts || []),
      admissionBatch:   formData.admissionBatch   || student.admissionBatch   || '',
      isActive:     false,
      updatedAt:    new Date().toISOString(),
    });

    const admissionId = generateID('adm');
    const admission = {
      id:              admissionId,
      studentId,
      campusId:        formData.campusId     || student.campusId,
      disciplineId:    formData.disciplineId || student.disciplineId,
      levelId:         formData.levelId      || student.levelId,
      subjectId:       formData.subjectId    || student.subjectId,
      batchId:         formData.batchId,
      session:         formData.session,
      subjectIds:      Array.isArray(formData.subjectIds)      ? formData.subjectIds      : (formData.subjectId ? [formData.subjectId] : []),
      batchSelections: (typeof formData.batchSelections === 'object' && formData.batchSelections !== null)
                         ? formData.batchSelections : (formData.batchId ? { [formData.subjectId]: formData.batchId } : {}),
      noBatchSubjectIds: Array.isArray(formData._noBatchSubjectIds) ? formData._noBatchSubjectIds : [],
      status:          ADMISSION_STATUS.PENDING,
      isReAdmission:   true,
      admittedBy:      Auth.getCurrentUser()?.userId || null,
      createdAt:       new Date().toISOString(),
      updatedAt:       new Date().toISOString(),
    };

    AppState.add(KEY_ADMISSIONS, admission);

    const challan = this._generateChallan({
      admissionId,
      studentId,
      studentName: student.studentName,
      campusId:    formData.campusId || student.campusId,
      batchId:     formData.batchId,
      session:     formData.session,
      feeAmount:   formData.feeAmount || 0,
      dueDate:     formData.dueDate   || _defaultDueDate(),
    });

    return { success: true, admission, student, challan };
  },

  // ── Mark challan as paid ──────────────────────────────────────
  // Triggers: student.isActive = true, attendance roster updated
  markChallanPaid(challanId, paymentDetails = {}) {
    const challans = AppState.get(KEY_CHALLANS) || [];
    const challan  = challans.find(c => c.id === challanId);
    if (!challan) return { success: false, message: 'Challan not found.' };
    if (challan.status === CHALLAN_STATUS.PAID) return { success: false, message: 'Challan already marked as paid.' };

    // Update challan
    AppState.update(KEY_CHALLANS, challanId, {
      status:      CHALLAN_STATUS.PAID,
      paidAt:      new Date().toISOString(),
      paidAmount:  paymentDetails.amount   || challan.feeAmount,
      paymentMode: paymentDetails.mode     || 'cash',
      receiptNo:   paymentDetails.receiptNo || generateID('rcpt'),
      updatedAt:   new Date().toISOString(),
    });

    // Confirm the admission
    AppState.update(KEY_ADMISSIONS, challan.admissionId, {
      status:    ADMISSION_STATUS.CONFIRMED,
      updatedAt: new Date().toISOString(),
    });

    // Activate student
    AppState.update(KEY_STUDENTS, challan.studentId, {
      isActive:  true,
      updatedAt: new Date().toISOString(),
    });

    // ── Add student to attendance roster if not already there ──
    this._syncAttendanceRoster(challan.studentId, challan.batchId);

    // ── Auto-create enrolment entries from admission subject selections ──
    this._syncEnrolmentsOnActivation(challan.studentId, challan.admissionId);

    return { success: true };
  },

  // ── Waive challan ─────────────────────────────────────────────
  waiveChallan(challanId, reason = '') {
    const challans = AppState.get(KEY_CHALLANS) || [];
    const challan  = challans.find(c => c.id === challanId);
    if (!challan) return { success: false, message: 'Challan not found.' };

    AppState.update(KEY_CHALLANS, challanId, {
      status:    CHALLAN_STATUS.WAIVED,
      waivedAt:  new Date().toISOString(),
      waivedBy:  Auth.getCurrentUser()?.userId || null,
      waiveNote: reason,
      updatedAt: new Date().toISOString(),
    });

    // Treat waived as confirmed — student still gets activated
    AppState.update(KEY_ADMISSIONS, challan.admissionId, {
      status:    ADMISSION_STATUS.CONFIRMED,
      updatedAt: new Date().toISOString(),
    });
    AppState.update(KEY_STUDENTS, challan.studentId, {
      isActive:  true,
      updatedAt: new Date().toISOString(),
    });

    this._syncAttendanceRoster(challan.studentId, challan.batchId);

    // ── Auto-create enrolment entries from admission subject selections ──
    this._syncEnrolmentsOnActivation(challan.studentId, challan.admissionId);

    return { success: true };
  },

  // ── Cancel admission ─────────────────────────────────────────
  cancelAdmission(admissionId, reason = '') {
    const admission = AppState.findById(KEY_ADMISSIONS, admissionId);
    if (!admission) return { success: false, message: 'Admission not found.' };
    if (admission.status === ADMISSION_STATUS.CONFIRMED) {
      return { success: false, message: 'Confirmed admissions cannot be cancelled. Contact Admin.' };
    }

    AppState.update(KEY_ADMISSIONS, admissionId, {
      status:       ADMISSION_STATUS.CANCELLED,
      cancelReason: reason,
      cancelledAt:  new Date().toISOString(),
      updatedAt:    new Date().toISOString(),
    });

    // Cancel related pending challans
    const challans = AppState.get(KEY_CHALLANS) || [];
    challans
      .filter(c => c.admissionId === admissionId && c.status === CHALLAN_STATUS.PENDING)
      .forEach(c => AppState.update(KEY_CHALLANS, c.id, {
        status:    CHALLAN_STATUS.WAIVED,
        updatedAt: new Date().toISOString(),
      }));

    return { success: true };
  },

  // ── Delete student + all pending challans ────────────────────
  // Hard-deletes student record, their admissions, and ALL pending challans.
  // Paid/waived challans are preserved for audit purposes.
  deleteStudent(studentId) {
    const students = AppState.get(KEY_STUDENTS) || [];
    if (!students.find(s => s.id === studentId)) {
      return { success: false, message: 'Student not found.' };
    }

    // 1. Remove ALL pending challans belonging to this student
    const challans = AppState.get(KEY_CHALLANS) || [];
    const pendingIds = challans
      .filter(c => c.studentId === studentId && c.status === CHALLAN_STATUS.PENDING)
      .map(c => c.id);
    if (pendingIds.length) {
      const remaining = challans.filter(c => !(c.studentId === studentId && c.status === CHALLAN_STATUS.PENDING));
      AppState.set(KEY_CHALLANS, remaining);
    }

    // 2. Cancel all non-confirmed admissions for this student
    const admissions = AppState.get(KEY_ADMISSIONS) || [];
    admissions
      .filter(a => a.studentId === studentId && a.status === ADMISSION_STATUS.PENDING)
      .forEach(a => AppState.update(KEY_ADMISSIONS, a.id, {
        status:      ADMISSION_STATUS.CANCELLED,
        cancelReason:'Student deleted',
        cancelledAt: new Date().toISOString(),
        updatedAt:   new Date().toISOString(),
      }));

    // 3. Remove student record
    const updated = (AppState.get(KEY_STUDENTS) || []).filter(s => s.id !== studentId);
    AppState.set(KEY_STUDENTS, updated);

    return { success: true, deletedPendingChallans: pendingIds.length };
  },

  // ── Summary stats (for dashboard / batch view) ────────────────
  getStats() {
    const admissions = getAdmissions();
    const challans   = AppState.get(KEY_CHALLANS) || [];
    return {
      total:     admissions.length,
      pending:   admissions.filter(a => a.status === ADMISSION_STATUS.PENDING).length,
      confirmed: admissions.filter(a => a.status === ADMISSION_STATUS.CONFIRMED).length,
      cancelled: admissions.filter(a => a.status === ADMISSION_STATUS.CANCELLED).length,
      unpaidChallans: challans.filter(c => c.status === CHALLAN_STATUS.PENDING).length,
    };
  },

  // ─────────────────────────────────────────────────────────────
  // PRIVATE helpers
  // ─────────────────────────────────────────────────────────────

  // Generate challan record and save it
  _generateChallan({ admissionId, studentId, studentName, campusId, batchId, session, feeAmount, dueDate }) {
    const challanNo = _generateChallanNumber();
    const challan = {
      id:          generateID('chl'),
      challanNo,
      admissionId,
      studentId,
      studentName,
      campusId,
      batchId,
      session,
      feeAmount:   Number(feeAmount) || 0,
      status:      CHALLAN_STATUS.PENDING,
      dueDate,
      issuedAt:    new Date().toISOString(),
      updatedAt:   new Date().toISOString(),
    };
    AppState.add(KEY_CHALLANS, challan);
    return challan;
  },

  // ── Auto-create Enrolment entries when student is activated ────────────────
  // Called after challan is paid or waived.
  // Logic:
  //   • For each subject where a batch was selected → create enrolment with status 'active'
  //   • For each subject where NO batch was selected → create enrolment with status 'suspended'
  //     (shows in Freeze tab of Enrolment module — batch can be assigned later)
  //   • Duplicate check: skip if same studentId+batchId enrolment already exists
  // ─────────────────────────────────────────────────────────────────────────────
  _syncEnrolmentsOnActivation(studentId, admissionId) {
    try {
      const admission = AppState.findById(KEY_ADMISSIONS, admissionId);
      if (!admission) return;

      const student        = AppState.findById(KEY_STUDENTS, studentId);
      const enrolments     = AppState.get('enrolments') || [];
      const today          = new Date().toISOString().split('T')[0];

      // ── Resolve subject list from admission record ──────────
      const subjectIds       = Array.isArray(admission.subjectIds)      ? admission.subjectIds      : (admission.subjectId ? [admission.subjectId] : []);
      const batchSelections  = (typeof admission.batchSelections === 'object' && admission.batchSelections !== null)
                                 ? admission.batchSelections : {};
      const noBatchSubjects  = Array.isArray(admission.noBatchSubjectIds) ? admission.noBatchSubjectIds : [];

      // ── Helper: is this enrolment already present? ──────────
      const alreadyEnrolled = (sid, bid) => enrolments.some(e =>
        e.studentId === studentId &&
        (bid ? e.batchId === bid : !e.batchId) &&
        Array.isArray(e.subjects) && e.subjects.some(s => s.subjectId === sid)
      );

      if (!subjectIds.length) {
        // Fallback for admissions without multi-subject selections (legacy/simple mode)
        // Create a single enrolment for the batch stored on the admission record
        const batchId = admission.batchId;
        if (batchId && !enrolments.some(e => e.studentId === studentId && e.batchId === batchId)) {
          const batch   = AppState.findById('batches', batchId);
          const subject = AppState.findById('subjects', admission.subjectId);
          const subjectEntry = subject ? [{
            subjectId:  subject.id,
            subjectCode: subject.subjectCode || '',
            subjectName: subject.subjectName || '',
            batchId:    batchId,
            batchName:  batch?.batchName || '',
            batchNo:    (batch?.batchName || '').split('-').pop() || '',
            session:    admission.session || batch?.session || '',
            startDate:  batch?.startDate  || '',
            endDate:    batch?.endDate    || '',
            status:     'active',
            note:       '',
          }] : [];

          const enrolment = {
            id:            generateID('enr'),
            studentId,
            batchId,
            enrolmentDate: today,
            status:        'active',
            feeStatus:     'paid',
            notes:         `Auto-created on admission confirmation (${admissionId})`,
            subjects:      subjectEntry,
            createdBy:     'admission_auto',
            createdAt:     new Date().toISOString(),
            _admissionId:  admissionId,
          };
          AppState.add('enrolments', enrolment);
        }
        return;
      }

      // ── Multi-subject mode ───────────────────────────────────
      // Group subjects by their batchId (batch-selected ones together,
      // no-batch ones get their own "suspended" enrolment each).

      // 1. Subjects WITH a batch selected → one enrolment per unique batchId
      const batchMap = {};   // batchId → [subjectId, ...]
      subjectIds.forEach(sid => {
        const bid = batchSelections[sid];
        if (bid) {
          if (!batchMap[bid]) batchMap[bid] = [];
          batchMap[bid].push(sid);
        }
      });

      Object.entries(batchMap).forEach(([batchId, sids]) => {
        // Skip if already enrolled in this batch
        if (enrolments.some(e => e.studentId === studentId && e.batchId === batchId)) return;

        const batch = AppState.findById('batches', batchId);

        const subjectEntries = sids.map(sid => {
          const subj = AppState.findById('subjects', sid);
          return {
            subjectId:   sid,
            subjectCode: subj?.subjectCode || '',
            subjectName: subj?.subjectName || '',
            batchId,
            batchName:   batch?.batchName  || '',
            batchNo:     (batch?.batchName || '').split('-').pop() || '',
            session:     admission.session || batch?.session || '',
            startDate:   batch?.startDate  || '',
            endDate:     batch?.endDate    || '',
            status:      'active',
            note:        '',
          };
        });

        const enrolment = {
          id:            generateID('enr'),
          studentId,
          batchId,
          enrolmentDate: today,
          status:        'active',
          feeStatus:     'paid',
          notes:         `Auto-created on admission confirmation (${admissionId})`,
          subjects:      subjectEntries,
          createdBy:     'admission_auto',
          createdAt:     new Date().toISOString(),
          _admissionId:  admissionId,
        };
        AppState.add('enrolments', enrolment);
      });

      // 2. Subjects WITHOUT a batch selected → one suspended enrolment each
      //    (appears in Freeze tab — batch to be assigned later)
      const noBatch = subjectIds.filter(sid => !batchSelections[sid]);
      noBatch.forEach(sid => {
        const subj = AppState.findById('subjects', sid);

        // Skip if student already has a suspended enrolment for this subject
        const dup = enrolments.some(e =>
          e.studentId === studentId &&
          e.status === 'suspended' &&
          Array.isArray(e.subjects) && e.subjects.some(s => s.subjectId === sid)
        );
        if (dup) return;

        const enrolment = {
          id:            generateID('enr'),
          studentId,
          batchId:       null,       // no batch yet
          enrolmentDate: today,
          status:        'suspended', // → Freeze tab in Enrolment UI
          feeStatus:     'paid',
          notes:         `Batch not yet assigned — auto-created from admission (${admissionId})`,
          subjects:      [{
            subjectId:   sid,
            subjectCode: subj?.subjectCode || '',
            subjectName: subj?.subjectName || '',
            batchId:     null,
            batchName:   '',
            batchNo:     '',
            session:     admission.session || '',
            startDate:   '',
            endDate:     '',
            status:      'active',
            note:        'Batch pending assignment',
          }],
          createdBy:     'admission_auto',
          createdAt:     new Date().toISOString(),
          _admissionId:  admissionId,
        };
        AppState.add('enrolments', enrolment);
      });

    } catch(err) {
      console.warn('[AdmissionService] _syncEnrolmentsOnActivation error:', err);
    }
  },

  // If the batch has a batchSchedule, add student to attendance roster
  _syncAttendanceRoster(studentId, batchId) {
    try {
      const schedules = AppState.get('batchSchedules') || [];
      const schedule  = schedules.find(s => s.batchId === batchId);
      if (!schedule) return; // no schedule yet — attendance module will handle it

      // attendanceRecords is keyed by scheduleId+date — just ensure student
      // appears in any future attendance marking. No past records are backfilled.
      // This is a no-op here; AttendanceModule reads students[] filtered by batchId.
      // Nothing to do — student record (with batchId) is enough.
    } catch (e) {
      console.warn('[AdmissionService] _syncAttendanceRoster error:', e);
    }
  },
};

// ─────────────────────────────────────────────────────────────
// SECTION 3 — Pure utility functions
// ─────────────────────────────────────────────────────────────

/**
 * Application Number: campusCode + zero-padded sequence (e.g. F8001, BWP002)
 * Campus code is derived from campusName:
 *   • If name contains alphanumeric token like "F8", "G9", "G11" → use it (max 3 chars)
 *   • Otherwise take first 3 uppercase letters (e.g. "Rawalpindi" → "RWP")
 * Sequence auto-increments per campus, padded to 3 digits min.
 */
function _generateApplicationNo(campus) {
  if (!campus) return '';

  // ── Derive campus code from campusName ──────────────────────
  const name = (campus.campusName || campus.name || '').trim();

  // Try to find a token like F8, G9, G11, DHA etc.
  const tokenMatch = name.match(/\b([A-Z]{1,3}\d{1,2}|\d{1,2}[A-Z]{0,2}|[A-Z]{2,4})\b/i);
  let campusCode;
  if (tokenMatch) {
    campusCode = tokenMatch[1].toUpperCase().slice(0, 4);
  } else {
    // Fallback: first 3 consonants/letters of name
    campusCode = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
  }
  if (!campusCode) campusCode = 'STU';

  // ── Find highest existing sequence for this campus code ──────
  const students = AppState.get(KEY_STUDENTS) || [];
  let maxSeq = 0;
  const prefix = campusCode;
  students.forEach(function(s) {
    const appNo = s.applicationNo || '';
    if (appNo.startsWith(prefix)) {
      const seq = parseInt(appNo.slice(prefix.length), 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  });

  const nextSeq = maxSeq + 1;
  // Pad to at least 3 digits
  const padded = String(nextSeq).padStart(3, '0');

  let candidate = prefix + padded;
  // Guarantee uniqueness
  while (students.some(function(s) { return s.applicationNo === candidate; })) {
    candidate = prefix + String(++maxSeq + 1).padStart(3, '0');
  }
  return candidate;
}

/**
 * Student number: unique sequential ID (e.g. STU-0001)
 * Auto-increments based on existing students.
 */
function _generateStudentNumber() {
  const students = AppState.get(KEY_STUDENTS) || [];
  let maxNo = 1000;
  students.forEach(s => {
    const raw = s.studentNumber || '';
    const n   = parseInt(raw.replace(/\D/g, ''), 10);
    if (!isNaN(n) && n >= maxNo) maxNo = n + 1;
  });
  // Guarantee uniqueness
  let candidate = 'STU-' + String(maxNo).padStart(4, '0');
  while (students.some(s => s.studentNumber === candidate)) {
    maxNo++;
    candidate = 'STU-' + String(maxNo).padStart(4, '0');
  }
  return candidate;
}

/**
 * Challan number: unique 7-digit numeric (e.g. 1025428)
 * Starts from 1000000, auto-increments based on existing challans.
 * Guarantees no duplicates by checking challans[] state.
 */
function _generateChallanNumber() {
  const challans  = AppState.get(KEY_CHALLANS) || [];
  // Find the highest existing numeric challan number
  let maxNo = 1000000;
  challans.forEach(c => {
    const n = parseInt(c.challanNo, 10);
    if (!isNaN(n) && n >= maxNo) maxNo = n + 1;
  });
  // Add small random offset so concurrent admissions don't collide
  const candidate = maxNo + Math.floor(Math.random() * 3);
  // Final uniqueness check — keep incrementing if collision found
  let challanNo = candidate;
  while (challans.some(c => String(c.challanNo) === String(challanNo))) {
    challanNo++;
  }
  return String(challanNo);
}

/** Default due date = 15 days from today */
function _defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 15);
  return d.toISOString().split('T')[0];
}

/**
 * Auto-lookup tuition fee from feeStructures.
 *
 * Actual data shape (from feeStructure.js):
 *   rec = {
 *     id, campusId, disciplineId,
 *     applicableFrom, applicableTo,
 *     tuitionEnabled, examEnabled,
 *     tuitionCurrency, examCurrency,
 *     fees: {
 *       [subjectId]: { tuition: 28000, exam: null },
 *       ...
 *     }
 *   }
 *
 * Matching order: campus → discipline → date → subject (inside fees map)
 * Date rule:
 *   applicableFrom <= today  (equal ya pehle — applies)
 *   applicableTo   >= today  OR empty/null (still active)
 * Multiple matches → latest applicableFrom wins (most recent applicable)
 *
 * Returns: { found: true, amount, currency, symbol } | { found: false }
 */
export function lookupTuitionFee({ campusId, disciplineId, levelId, subjectId } = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const CURRENCIES = [
    { code: 'PKR', symbol: 'Rs.' }, { code: 'USD', symbol: '$' },
    { code: 'GBP', symbol: '£' },   { code: 'EUR', symbol: '€' },
    { code: 'SAR', symbol: 'SR' },  { code: 'AED', symbol: 'AED' },
  ];
  const getSymbol = (code) => CURRENCIES.find(c => c.code === code)?.symbol || 'Rs.';

  const feeStructures = AppState.get('feeStructures') || [];

  // Step 1: Filter records by campus + discipline + date range
  const candidates = feeStructures.filter(rec => {
    // Campus match (String comparison)
    if (campusId && String(rec.campusId) !== String(campusId)) return false;

    // Discipline match
    if (disciplineId && String(rec.disciplineId) !== String(disciplineId)) return false;

    // applicableFrom must exist and be <= today
    if (!rec.applicableFrom) return false;
    const fromDate = new Date(rec.applicableFrom);
    fromDate.setHours(0, 0, 0, 0);
    if (fromDate > today) return false;  // future fee — not applicable yet

    // applicableTo: if set must be >= today (still active)
    if (rec.applicableTo) {
      const toDate = new Date(rec.applicableTo);
      toDate.setHours(0, 0, 0, 0);
      if (toDate < today) return false;  // expired
    }

    return true;
  });

  if (!candidates.length) return { found: false };

  // Step 2: Sort by applicableFrom descending — most recent applicable first
  candidates.sort((a, b) =>
    new Date(b.applicableFrom) - new Date(a.applicableFrom)
  );

  // Step 3: Find subject fee inside rec.fees[subjectId]
  for (const rec of candidates) {
    const feesMap = rec.fees || {};

    if (subjectId && feesMap[subjectId] !== undefined) {
      const entry    = feesMap[subjectId];
      const amount   = Number(entry?.tuition ?? entry?.exam ?? 0);
      const currency = rec.tuitionCurrency || 'PKR';
      const symbol   = getSymbol(currency);
      if (amount > 0) {
        return { found: true, amount, currency, symbol, record: rec };
      }
      // amount is 0/null — still "found" but zero fee
      return { found: true, amount: 0, currency, symbol, record: rec };
    }

    // Fallback: subjectId not given or not in fees map — try any subject in this level
    if (levelId && !subjectId) {
      const allSubjects = AppState.get('subjects') || [];
      const levelSubjectIds = allSubjects
        .filter(s => String(s.levelId) === String(levelId))
        .map(s => s.id);

      for (const sid of levelSubjectIds) {
        if (feesMap[sid] !== undefined) {
          const entry  = feesMap[sid];
          const amount = Number(entry?.tuition ?? 0);
          const currency = rec.tuitionCurrency || 'PKR';
          return { found: true, amount, currency, symbol: getSymbol(currency), record: rec };
        }
      }
    }
  }

  return { found: false };
}

/**
 * Auto-lookup fee for each selected subject individually.
 * Returns array of { subjectId, found, amount, currency, symbol }
 */
export function lookupFeesForSubjects({ campusId, disciplineId, levelId, subjectIds = [] }) {
  if (!subjectIds.length) {
    const result = lookupTuitionFee({ campusId, disciplineId, levelId });
    return [{ subjectId: null, ...result }];
  }

  return subjectIds.map(subjectId => ({
    subjectId,
    ...lookupTuitionFee({ campusId, disciplineId, levelId, subjectId }),
  }));
}

/**
 * Lookup Registration Fee from registrationFees state.
 *
 * Record shape (from feeStructure.js RegistrationFeeModule):
 *   { id, campusId, disciplineId, levelId, amount, currency, effectiveFrom, effectiveTo }
 *
 * Matching logic: campus → discipline → level
 * Date rule: effectiveFrom <= today  AND  (effectiveTo empty OR effectiveTo >= today)
 * Multiple matches → latest effectiveFrom wins.
 *
 * Existing student rule: if studentId is provided and student already exists
 * in students[] with any confirmed admission → return { found: true, waived: true, amount: 0 }
 *
 * Returns: { found, waived, amount, currency, symbol }
 */
export function lookupRegistrationFee({ campusId, disciplineId, levelId, studentId } = {}) {
  const CURRENCIES = [
    { code: 'PKR', symbol: 'Rs.' }, { code: 'USD', symbol: '$' },
    { code: 'GBP', symbol: '£' },   { code: 'EUR', symbol: '€' },
    { code: 'SAR', symbol: 'SR' },  { code: 'AED', symbol: 'AED' },
  ];
  const getSymbol = (code) => CURRENCIES.find(c => c.code === code)?.symbol || 'Rs.';

  // ── Existing student check — no reg fee if already admitted before ──
  if (studentId) {
    const admissions = AppState.get(KEY_ADMISSIONS) || [];
    const hadAdmission = admissions.some(
      a => a.studentId === studentId &&
           a.status !== ADMISSION_STATUS.CANCELLED
    );
    if (hadAdmission) {
      return { found: true, waived: true, amount: 0, currency: 'PKR', symbol: 'Rs.',
               reason: 'Existing student — registration fee waived' };
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // registrationFees key used by RegistrationFeeModule
  const regFees = AppState.get('registrationFees') || [];

  // Step 1: filter by campus + discipline + level + date
  const candidates = regFees.filter(rec => {
    if (campusId     && String(rec.campusId)     !== String(campusId))     return false;
    if (disciplineId && String(rec.disciplineId) !== String(disciplineId)) return false;
    if (levelId      && rec.levelId && String(rec.levelId) !== String(levelId)) return false;

    // effectiveFrom <= today
    if (!rec.effectiveFrom) return false;
    const fromDate = new Date(rec.effectiveFrom);
    fromDate.setHours(0, 0, 0, 0);
    if (fromDate > today) return false;  // not yet applicable

    // effectiveTo: if set must be >= today
    if (rec.effectiveTo) {
      const toDate = new Date(rec.effectiveTo);
      toDate.setHours(0, 0, 0, 0);
      if (toDate < today) return false;  // expired
    }

    return true;
  });

  if (!candidates.length) return { found: false, waived: false, amount: 0, currency: 'PKR', symbol: 'Rs.' };

  // Step 2: latest effectiveFrom wins
  candidates.sort((a, b) => new Date(b.effectiveFrom) - new Date(a.effectiveFrom));

  const best     = candidates[0];
  const amount   = Number(best.amount || 0);
  const currency = best.currency || 'PKR';

  return { found: true, waived: false, amount, currency, symbol: getSymbol(currency), record: best };
}

/**
 * Lookup applicable Late Fee policy from policies[] state.
 * Matches campus + level (most specific wins), falls back to global.
 *
 * Policy shape (policies.js lateFee type):
 *   { type:'lateFee', scope, campusId?, campusIds?, levelId?, levelIds?,
 *     lateFeeAmount, lateFeePer, lateFeeGrace, lateFeeSlabs? }
 *
 * @returns {{ found, amount, per, graceDays, slabs, policyId }} | {{ found:false }}
 */
export function lookupLateFee({ campusId, levelId } = {}) {
  const policies = AppState.get('policies') || [];
  const latePols = policies.filter(p => p.type === 'lateFee' && p.lateFeeAmount);
  if (!latePols.length) return { found: false };

  function score(p) {
    const hasCampus = campusId && (
      (p.campusIds?.length && p.campusIds.includes(campusId)) ||
      (p.campusId && String(p.campusId) === String(campusId))
    );
    const hasLevel = levelId && (
      (p.levelIds?.length && p.levelIds.includes(levelId)) ||
      (p.levelId  && String(p.levelId)  === String(levelId))
    );
    if (p.scope === 'global')                            return 1;
    if (p.scope === 'level'  &&  hasLevel)               return 2;
    if (p.scope === 'campus' &&  hasCampus && !hasLevel) return 3;
    if (p.scope === 'campus' &&  hasCampus &&  hasLevel) return 4;
    return 0;
  }

  const ranked = latePols
    .map(p => ({ p, s: score(p) }))
    .filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!ranked.length) return { found: false };
  const best = ranked[0].p;
  return {
    found:     true,
    amount:    Number(best.lateFeeAmount) || 0,
    per:       best.lateFeePer   || 'once',
    graceDays: Number(best.lateFeeGrace) || 0,
    slabs:     best.lateFeeSlabs || [],
    policyId:  best.id,
  };
}

/**
 * Calculate late fee owed for a challan.
 * @param {{ campusId, levelId, dueDate: string (YYYY-MM-DD), today?: Date }}
 * @returns {{ isLate, daysLate, lateFeeAmount, breakdown, withinGrace? }}
 */
export function calcLateFee({ campusId, levelId, dueDate, today } = {}) {
  if (!dueDate) return { isLate: false, daysLate: 0, lateFeeAmount: 0 };
  const now = today ? new Date(today) : new Date();
  now.setHours(0, 0, 0, 0);
  const [y, m, d] = dueDate.split('-').map(Number);
  const due = new Date(y, m - 1, d, 0, 0, 0, 0);
  if (now <= due) return { isLate: false, daysLate: 0, lateFeeAmount: 0 };

  const daysLate = Math.floor((now - due) / 86400000);
  const policy   = lookupLateFee({ campusId, levelId });
  if (!policy.found) return { isLate: true, daysLate, lateFeeAmount: 0 };

  const effectiveDays = Math.max(0, daysLate - (policy.graceDays || 0));
  if (effectiveDays <= 0) return { isLate: true, daysLate, lateFeeAmount: 0, withinGrace: true };

  let lateFeeAmount = 0, breakdown = '';

  if (policy.slabs?.length) {
    const slab = policy.slabs.find(s => {
      const from = Number(s.daysFrom) || 0;
      const to   = s.daysTo ? Number(s.daysTo) : Infinity;
      return effectiveDays >= from && effectiveDays <= to;
    });
    if (slab) { lateFeeAmount = Number(slab.amount) || 0; breakdown = `Slab ${slab.daysFrom}-${slab.daysTo||'inf'} days`; }
  } else {
    switch (policy.per) {
      case 'once':  lateFeeAmount = policy.amount; breakdown = 'One-time'; break;
      case 'day':   lateFeeAmount = policy.amount * effectiveDays; breakdown = `Rs.${policy.amount} x ${effectiveDays} days`; break;
      case 'week':  lateFeeAmount = policy.amount * Math.ceil(effectiveDays / 7);  breakdown = `Rs.${policy.amount} x ${Math.ceil(effectiveDays/7)} weeks`; break;
      case 'month': lateFeeAmount = policy.amount * Math.ceil(effectiveDays / 30); breakdown = `Rs.${policy.amount} x ${Math.ceil(effectiveDays/30)} months`; break;
      default:      lateFeeAmount = policy.amount; breakdown = 'Fixed';
    }
  }
  return { isLate: true, daysLate, effectiveDays, lateFeeAmount, breakdown, policyId: policy.policyId };
}

/** Generate a list of available sessions (same logic as studentService) */
export function generateSessions() {
  const sessions = [];
  const y0 = new Date().getFullYear();
  for (let y = y0 - 1; y <= y0 + 2; y++) {
    const ys = String(y).slice(2);
    const yn = String(y + 1).slice(2);
    sessions.push({ value: 'Dec-' + ys,  label: 'Dec-' + ys  + '  (Jul ' + y       + ' — Dec ' + y       + ')' });
    sessions.push({ value: 'June-' + yn, label: 'June-' + yn + '  (Jan ' + (y + 1) + ' — Jun ' + (y + 1) + ')' });
  }
  return sessions;
}
