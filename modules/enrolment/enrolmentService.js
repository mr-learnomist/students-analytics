// ============================================================
// modules/enrolment/enrolmentService.js — Enrolment Business Logic
// ============================================================

import { AppState, generateID } from '../../utils/state.js';

const KEY = 'enrolments';

// ── Constants (exported — consumed by enrolmentUI.js) ─────────

// Enrolment-level statuses
export const ENROLMENT_STATUSES = ['active', 'completed', 'dropped', 'suspended'];

export const STATUS_LABELS = {
  active:    'Active',
  completed: 'Completed',
  dropped:   'Dropped',
  suspended: 'Suspended',
};

// Per-subject statuses (student's status within a subject)
export const ENR_SUBJECT_STATUSES = ['active', 'dormant', 'left_campus', 'change_campus', 'left_study', 'exempt'];

export const ENR_SUBJECT_STATUS_LABELS = {
  active:        'Active',
  dormant:       'Dormant',
  left_campus:   'Left Campus',
  change_campus: 'Change Campus',
  left_study:    'Left Study',
  exempt:        'Exempt',
};

export const FEE_STATUSES = ['paid', 'partial', 'unpaid'];

export const FEE_LABELS = {
  paid:    'Paid',
  partial: 'Partial',
  unpaid:  'Unpaid',
};

// ── Ensure AppState keys exist ────────────────────────────────
export function ensureEnrolmentKeys() {
  if (!AppState.get(KEY)) AppState.set(KEY, []);
}

// ── Uniqueness check ──────────────────────────────────────────
function isDuplicateEnrolment(studentId, batchId, excludeId) {
  return (AppState.get(KEY) || []).some(function (e) {
    return e.studentId === studentId &&
           e.batchId   === batchId   &&
           e.id        !== excludeId;
  });
}

// ── Service ───────────────────────────────────────────────────
export const EnrolmentService = {

  // Return raw enrolment records, optionally filtered
  getAll(opts) {
    opts = opts || {};
    let list = AppState.get(KEY) || [];
    if (opts.batchId)    list = list.filter(function (e) { return e.batchId   === opts.batchId;   });
    if (opts.studentId)  list = list.filter(function (e) { return e.studentId === opts.studentId; });
    if (opts.status)     list = list.filter(function (e) { return e.status    === opts.status;    });
    if (opts.feeStatus)  list = list.filter(function (e) { return e.feeStatus === opts.feeStatus; });
    return list;
  },

  // Return a single enrolment by id
  getById(id) {
    return (AppState.get(KEY) || []).find(function (e) { return e.id === id; }) || null;
  },

  // Return enrolments enriched with student & batch names
  // Accepts (batchId, status) positional args OR an opts object — matches both call styles in enrolmentUI.js
  getEnriched(batchIdOrOpts, status) {
    let opts = {};
    if (batchIdOrOpts && typeof batchIdOrOpts === 'object') {
      opts = batchIdOrOpts;
    } else {
      if (batchIdOrOpts) opts.batchId = batchIdOrOpts;
      if (status)        opts.status  = status;
    }

    const students = AppState.get('students') || [];
    const batches  = AppState.get('batches')  || [];

    return EnrolmentService.getAll(opts).map(function (e) {
      const student = students.find(function (s) { return s.id === e.studentId; });
      const batch   = batches.find(function  (b) { return b.id === e.batchId;   });
      return Object.assign({}, e, {
        studentName: student?.studentName || '—',
        studentCnic: student?.cnic        || '',   // note: UI uses studentCnic (lowercase c)
        batchName:   batch?.batchName     || '—',
      });
    });
  },

  // Summary counts used by renderSummary()
  getSummary() {
    const list = AppState.get(KEY) || [];
    return {
      total:     list.length,
      active:    list.filter(function (e) { return e.status    === 'active';    }).length,
      completed: list.filter(function (e) { return e.status    === 'completed'; }).length,
      dropped:   list.filter(function (e) { return e.status    === 'dropped';   }).length,
      suspended: list.filter(function (e) { return e.status    === 'suspended'; }).length,
      feePaid:   list.filter(function (e) { return e.feeStatus === 'paid';      }).length,
      feeUnpaid: list.filter(function (e) { return e.feeStatus === 'unpaid';    }).length,
    };
  },

  // Add a new enrolment
  add(data, createdBy) {
    if (!data.studentId)    return { success: false, message: 'Student is required.' };
    if (!data.batchId)      return { success: false, message: 'Batch is required.' };
    if (!data.enrolmentDate) return { success: false, message: 'Enrolment date is required.' };

    if (isDuplicateEnrolment(data.studentId, data.batchId)) {
      return { success: false, message: 'This student is already enrolled in that batch.' };
    }

    const enrolment = {
      id:             generateID('enr'),
      studentId:      data.studentId,
      batchId:        data.batchId,
      enrolmentDate:  data.enrolmentDate,
      status:         ENROLMENT_STATUSES.includes(data.status)    ? data.status    : 'active',
      feeStatus:      FEE_STATUSES.includes(data.feeStatus)       ? data.feeStatus : 'unpaid',
      notes:          (data.notes || '').trim(),
      subjects:       Array.isArray(data.subjects) ? data.subjects : [],
      createdBy:      createdBy || null,
      createdAt:      new Date().toISOString(),
    };

    AppState.add(KEY, enrolment);
    return { success: true, enrolment };
  },

  // Update status / feeStatus / notes (studentId & batchId are immutable)
  update(id, data, updatedBy) {
    const existing = AppState.findById(KEY, id);
    if (!existing) return { success: false, message: 'Enrolment not found.' };

    const patch = {
      enrolmentDate: data.enrolmentDate  || existing.enrolmentDate,
      status:        ENROLMENT_STATUSES.includes(data.status) || ENR_SUBJECT_STATUSES.includes(data.status)
                       ? data.status    : existing.status,
      feeStatus:     FEE_STATUSES.includes(data.feeStatus)      ? data.feeStatus : existing.feeStatus,
      notes:         data.notes !== undefined ? (data.notes || '').trim() : existing.notes,
      subjects:      Array.isArray(data.subjects) ? data.subjects : existing.subjects,
      updatedBy:     updatedBy  || null,
      updatedAt:     new Date().toISOString(),
    };

    const updated = AppState.update(KEY, id, patch);
    return { success: true, enrolment: updated };
  },

  // Remove an enrolment record
  remove(id) {
    const existing = AppState.findById(KEY, id);
    if (!existing) return { success: false, message: 'Enrolment not found.' };
    AppState.remove(KEY, id);
    return { success: true };
  },

  // ── CSV Export ───────────────────────────────────────────────
  exportCSV(rows) {
    const enrolments = rows || EnrolmentService.getEnriched();
    if (!enrolments.length) return;

    const headers = ['studentName', 'studentCNIC', 'batchName', 'enrolmentDate', 'status', 'feeStatus', 'notes'];
    const now     = new Date();
    const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

    const meta = [
      'Enrolment Report',
      'Generated: ' + dateStr + ' ' + timeStr,
      'Total Enrolments: ' + enrolments.length,
      '',
    ].join('\n');

    const csvRows = enrolments.map(function (e) {
      return [
        e.studentName   || '',
        e.studentCNIC   || '',
        e.batchName     || '',
        e.enrolmentDate || '',
        STATUS_LABELS[e.status]    || e.status    || '',
        FEE_LABELS[e.feeStatus]    || e.feeStatus || '',
        e.notes         || '',
      ].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
    });

    const csv  = meta + headers.join(',') + '\n' + csvRows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: 'Enrolments-' + dateStr.replace(/ /g, '-') + '.csv',
    });
    a.click();
    URL.revokeObjectURL(url);
  },
};
