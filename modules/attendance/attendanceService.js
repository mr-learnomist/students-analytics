// ============================================================
// modules/attendance/attendanceService.js
// Attendance Business Logic — Date generation, CRUD, reporting
//
// DATA MODELS
// ──────────────────────────────────────────────────────────────
// batchSchedules[]:
// {
//   id:          'sch_xxx',
//   batchId:     'batch_xxx',
//   classDays:   [1,3,5],           // 0=Sun,1=Mon,...,6=Sat  (never 0)
//   effectiveFrom: '2025-07-01',    // ISO date string — this schedule
//                                   // applies from this date onward
//   createdAt:   '...',
//   createdBy:   'user_1',          // admin user ID
// }
//
// attendanceRecords[]:
// {
//   id:          'att_xxx',
//   batchId:     'batch_xxx',
//   studentId:   'stu_xxx',
//   date:        '2025-07-07',      // ISO date string YYYY-MM-DD
//   status:      'P' | 'A' | 'L',
//   markedAt:    '...',
//   markedBy:    'user_1',
// }
// ============================================================

import { AppState, generateID } from '../../utils/state.js';

const SCHEDULES_KEY = 'batchSchedules';
const RECORDS_KEY   = 'attendanceRecords';

// ── Attendance API — direct MongoDB per-record upsert ─────────
// Race condition safe: har record independently upsert hota hai
// 100 teachers ek saath mark kar sakte hain bina data overwrite ke
const _API_BASE = '/api/attendance';
const _API_KEY  = () => window.__SMS_API_KEY__ || '';

async function _apiUpsert(records) {
  try {
    const res = await fetch(_API_BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': _API_KEY() },
      body:    JSON.stringify({ records }),
    });
    if (!res.ok) console.error('[AttendanceService] API upsert failed:', res.status);
  } catch (e) {
    console.error('[AttendanceService] API upsert error:', e.message);
  }
}

// Delete a single attendance record from the backend (used when a
// student's mark is "unchecked" — the record should no longer exist at
// all, not just be blank). Requires the backend to support
// DELETE /api/attendance?id=<recordId>.
async function _apiDelete(recordId) {
  try {
    const res = await fetch(`${_API_BASE}?id=${encodeURIComponent(recordId)}`, {
      method:  'DELETE',
      headers: { 'x-api-key': _API_KEY() },
    });
    if (!res.ok) console.error('[AttendanceService] API delete failed:', res.status);
  } catch (e) {
    console.error('[AttendanceService] API delete error:', e.message);
  }
}

// `date` is OPTIONAL. Pass it when the caller only needs one day's
// records (e.g. the Teacher Portal's today-only sheet) — this avoids
// downloading the batch's ENTIRE attendance history just to show one
// day, which is what was making that screen slow to load on batches
// with a long running history. Omit `date` to keep the old
// full-history behaviour (used by admin views that need past dates).
//
// NOTE: this only speeds things up if the backend /api/attendance
// GET handler actually filters by the `date` query param. If the
// endpoint currently ignores unknown params, ask the backend dev to
// add that filter — that's where the real time savings come from.
export async function fetchAndSyncBatchAttendance(batchId, date = null) {
  try {
    const qs = date
      ? `batchId=${batchId}&date=${encodeURIComponent(date)}`
      : `batchId=${batchId}`;
    const res = await fetch(`${_API_BASE}?${qs}`, {
      headers: { 'x-api-key': _API_KEY() },
    });
    if (!res.ok) return;
    const { records } = await res.json();
    if (!Array.isArray(records)) return;

    // Merge fetched records into local AppState cache
    const existing = AppState.get(RECORDS_KEY) || [];
    const map = {};
    existing.forEach(r => { map[r.id] = r; });
    records.forEach(r => { map[r.id] = r; });
    // Direct set without triggering saveState (read-only sync)
    AppState._silentSet(RECORDS_KEY, Object.values(map));
  } catch (e) {
    console.error('[AttendanceService] fetchAndSync error:', e.message);
  }
}

// Day index constants (mirrors JS Date.getDay())
export const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
export const DAY_SHORT = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// ── State initialisation guard ────────────────────────────────
// Ensure new keys exist in AppState without breaking old state
export function ensureAttendanceKeys() {
  if (!AppState.get(SCHEDULES_KEY)) AppState.set(SCHEDULES_KEY, []);
  if (!AppState.get(RECORDS_KEY))   AppState.set(RECORDS_KEY,   []);
}

// ── Date Utility Helpers ──────────────────────────────────────

/**
 * Parse a YYYY-MM-DD string → Date at midnight local time.
 * Avoids timezone shift from new Date(str) which uses UTC.
 */
export function parseLocalDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format a Date → 'YYYY-MM-DD'
 */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a date string → human-readable (e.g. "Mon, 7 Jul 2025")
 */
export function formatDisplayDate(isoStr) {
  const d = parseLocalDate(isoStr);
  if (!d) return isoStr;
  return d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Schedule Service ──────────────────────────────────────────
export const ScheduleService = {

  /**
   * Get the active schedule for a batch on a given date.
   * "Active" = latest schedule whose effectiveFrom <= targetDate.
   * If no schedule exists, returns null.
   */
  getActiveSchedule(batchId, targetDate) {
    const all = (AppState.get(SCHEDULES_KEY) || [])
      .filter(s => s.batchId === batchId && s.effectiveFrom <= targetDate)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)); // newest first
    return all[0] || null;
  },

  /**
   * Get all schedules for a batch, sorted oldest → newest.
   */
  getSchedulesForBatch(batchId) {
    return (AppState.get(SCHEDULES_KEY) || [])
      .filter(s => s.batchId === batchId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  },

  /**
   * Add or update a class-day schedule for a batch.
   * Only admins may call this (enforced at UI level).
   *
   * Rules:
   *  - classDays must not include 0 (Sunday — always excluded)
   *  - effectiveFrom must be today or a future date
   *  - Past attendance dates remain unchanged (past records are not touched)
   *
   * @param {string}   batchId
   * @param {number[]} classDays    Array of day indices 1-6
   * @param {string}   effectiveFrom  YYYY-MM-DD
   * @param {string}   createdBy    user ID
   * @returns {{ success: boolean, message?: string, schedule?: Object }}
   */
  setSchedule(batchId, classDays, effectiveFrom, createdBy) {
    if (!batchId) return { success: false, message: 'Batch ID is required.' };
    if (!classDays || !classDays.length)
      return { success: false, message: 'Select at least one class day.' };
    if (classDays.includes(0))
      return { success: false, message: 'Sunday cannot be a class day.' };
    if (!effectiveFrom)
      return { success: false, message: 'Effective-from date is required.' };

    const batch = AppState.findById('batches', batchId);
    if (!batch) return { success: false, message: 'Batch not found.' };

    // Validate effectiveFrom is within batch range (if batch has dates)
    if (batch.startDate && effectiveFrom < batch.startDate)
      return { success: false, message: `Effective date cannot be before batch start date (${batch.startDate}).` };
    if (batch.endDate && effectiveFrom > batch.endDate)
      return { success: false, message: `Effective date cannot be after batch end date (${batch.endDate}).` };

    // Deduplicate day indices and sort
    const days = [...new Set(classDays.filter(d => d >= 1 && d <= 6))].sort();

    const schedule = {
      id:            generateID('sch'),
      batchId,
      classDays:     days,
      effectiveFrom,
      createdAt:     new Date().toISOString(),
      createdBy:     createdBy || null,
    };

    AppState.add(SCHEDULES_KEY, schedule);
    return { success: true, schedule };
  },

  /**
   * Delete a schedule entry (admin only — cannot delete if it's the only one)
   */
  deleteSchedule(scheduleId) {
    const schedule = AppState.findById(SCHEDULES_KEY, scheduleId);
    if (!schedule) return { success: false, message: 'Schedule not found.' };

    const siblings = (AppState.get(SCHEDULES_KEY) || [])
      .filter(s => s.batchId === schedule.batchId);
    if (siblings.length <= 1)
      return { success: false, message: 'Cannot delete the only schedule for a batch.' };

    AppState.remove(SCHEDULES_KEY, scheduleId);
    return { success: true };
  },
};

// ── Attendance Date Generator ─────────────────────────────────
export const AttendanceDateGenerator = {

  /**
   * Generate all class dates for a batch between two dates,
   * respecting scheduled class days and public holidays.
   *
   * Algorithm:
   *  1. Walk each calendar day from startDate → endDate
   *  2. Skip Sunday (day 0) always
   *  3. Resolve which schedule was active on that day
   *  4. Check if the day-of-week is in the active schedule's classDays
   *  5. Skip public holidays
   *
   * @param {string} batchId
   * @param {string} fromDate   YYYY-MM-DD (defaults to batch.startDate)
   * @param {string} toDate     YYYY-MM-DD (defaults to batch.endDate or today)
   * @returns {string[]} sorted array of YYYY-MM-DD strings
   */
  generate(batchId, fromDate, toDate) {
    const batch = AppState.findById('batches', batchId);
    if (!batch) return [];

    const start = fromDate || batch.startDate;
    const end   = toDate   || batch.endDate;
    if (!start) return [];

    const today    = toISODate(new Date());
    const endBound = end ? (end < today ? end : today) : today;

    if (start > endBound) return [];

    // Collect holiday dates (for future use — already structured)
    const holidays = new Set(
      (AppState.get('holidays') || []).map(h => h.date)
    );

    const results = [];
    let cursor = parseLocalDate(start);
    const endDate = parseLocalDate(endBound);

    while (cursor <= endDate) {
      const isoDate  = toISODate(cursor);
      const dayOfWk  = cursor.getDay(); // 0=Sun

      // Always skip Sunday
      if (dayOfWk !== 0) {
        // Skip public holidays
        if (!holidays.has(isoDate)) {
          // Resolve the active schedule for this date
          const schedule = ScheduleService.getActiveSchedule(batchId, isoDate);
          if (schedule && schedule.classDays.includes(dayOfWk)) {
            results.push(isoDate);
          }
        }
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return results;
  },

  /**
   * Determine whether a specific date is a valid class day for a batch.
   */
  isClassDay(batchId, isoDate) {
    const date = parseLocalDate(isoDate);
    if (!date) return false;
    const dayOfWk = date.getDay();
    if (dayOfWk === 0) return false; // Sunday always excluded

    const holidays = new Set((AppState.get('holidays') || []).map(h => h.date));
    if (holidays.has(isoDate)) return false;

    const schedule = ScheduleService.getActiveSchedule(batchId, isoDate);
    return !!(schedule && schedule.classDays.includes(dayOfWk));
  },
};

// ── Attendance Record Service ─────────────────────────────────
export const AttendanceService = {

  /**
   * Fetch attendance records for a batch on a specific date.
   * Returns a map: { studentId → record }
   */
  getRecordsForDate(batchId, date) {
    const all = AppState.get(RECORDS_KEY) || [];
    const map = {};
    all
      .filter(r => r.batchId === batchId && r.date === date)
      .forEach(r => { map[r.studentId] = r; });
    return map;
  },

  /**
   * Fetch all attendance records for a batch.
   */
  getRecordsForBatch(batchId) {
    return (AppState.get(RECORDS_KEY) || [])
      .filter(r => r.batchId === batchId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  /**
   * Fetch all attendance records for a single student across all batches.
   */
  getRecordsForStudent(studentId) {
    return (AppState.get(RECORDS_KEY) || [])
      .filter(r => r.studentId === studentId)
      .sort((a, b) => a.date.localeCompare(b.date));
  },

  /**
   * Save or update a single attendance record.
   * @param {string} batchId
   * @param {string} studentId
   * @param {string} date         YYYY-MM-DD
   * @param {string} status       'P' | 'A' | 'L'
   * @param {string} markedBy     user ID
   * @returns {{ success: boolean, record?: Object, message?: string }}
   */
  markAttendance(batchId, studentId, date, status, markedBy) {
    if (!batchId || !studentId || !date)
      return { success: false, message: 'Batch, student and date are required.' };
    if (!['P', 'A', 'L'].includes(status))
      return { success: false, message: 'Status must be P, A, or L.' };

    const batch = AppState.findById('batches', batchId);
    if (!batch) return { success: false, message: 'Batch not found.' };

    // Enforce batch date boundaries
    if (batch.startDate && date < batch.startDate)
      return { success: false, message: 'Date is before batch start date.' };
    if (batch.endDate && date > batch.endDate)
      return { success: false, message: 'Date is after batch end date.' };

    const all      = AppState.get(RECORDS_KEY) || [];
    const existing = all.find(r => r.batchId === batchId && r.studentId === studentId && r.date === date);

    let record;
    if (existing) {
      const updated = { ...existing, status, markedAt: new Date().toISOString(), markedBy: markedBy || null };
      AppState.update(RECORDS_KEY, existing.id, { status, markedAt: updated.markedAt, markedBy: updated.markedBy });
      record = updated;
    } else {
      record = {
        id:        generateID('att'),
        batchId,
        studentId,
        date,
        status,
        markedAt:  new Date().toISOString(),
        markedBy:  markedBy || null,
      };
      AppState.add(RECORDS_KEY, record);
    }

    // ✅ Direct MongoDB upsert — race condition safe
    // AppState save se alag — sirf ye ek record MongoDB mein update hoga
    // 100 teachers ek saath mark karein — koi overwrite nahi hogi
    _apiUpsert([record]);

    return { success: true, record };
  },

  /**
   * Uncheck / clear a student's attendance for a given date.
   * After this call the student has NO record for that date — not P,
   * not A, not L. Used when a teacher clicks an already-active status
   * again to "uncheck" it.
   * @param {string} batchId
   * @param {string} studentId
   * @param {string} date   YYYY-MM-DD
   * @returns {{ success: boolean, message?: string }}
   */
  clearAttendance(batchId, studentId, date) {
    if (!batchId || !studentId || !date)
      return { success: false, message: 'Batch, student and date are required.' };

    const all      = AppState.get(RECORDS_KEY) || [];
    const existing = all.find(r => r.batchId === batchId && r.studentId === studentId && r.date === date);

    if (!existing) return { success: true }; // already unmarked — nothing to do

    AppState.remove(RECORDS_KEY, existing.id);

    // ✅ Remove from MongoDB too, so it stays unmarked after reload/sync
    _apiDelete(existing.id);

    return { success: true };
  },

  /**
   * Bulk-save attendance for an entire batch on one date.
   * @param {string} batchId
   * @param {string} date
   * @param {{ studentId: string, status: string }[]} entries
   * @param {string} markedBy
   * @returns {{ saved: number, errors: string[] }}
   */
  bulkMarkAttendance(batchId, date, entries, markedBy) {
    let saved = 0;
    const errors = [];
    entries.forEach(({ studentId, status }) => {
      const r = this.markAttendance(batchId, studentId, date, status, markedBy);
      if (r.success) saved++;
      else errors.push(`Student ${studentId}: ${r.message}`);
    });
    return { saved, errors };
  },

  /**
   * Compute attendance summary statistics for a batch.
   * Returns per-student totals and batch-wide percentages.
   */
  getSummary(batchId) {
    const records  = this.getRecordsForBatch(batchId);
    const students = (AppState.get('students') || []).filter(s => s.batchId === batchId);

    const summary = {};
    students.forEach(s => {
      summary[s.id] = { studentId: s.id, studentName: s.studentName, P: 0, A: 0, L: 0, total: 0 };
    });

    records.forEach(r => {
      if (!summary[r.studentId]) {
        summary[r.studentId] = { studentId: r.studentId, studentName: '—', P: 0, A: 0, L: 0, total: 0 };
      }
      summary[r.studentId][r.status] = (summary[r.studentId][r.status] || 0) + 1;
      summary[r.studentId].total++;
    });

    const entries = Object.values(summary).map(e => ({
      ...e,
      attendancePercent: e.total > 0 ? Math.round((e.P / e.total) * 100) : null,
    }));

    const totalRecords   = records.length;
    const presentRecords = records.filter(r => r.status === 'P').length;
    const batchPercent   = totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : null;

    return { students: entries, batchPercent, totalRecords };
  },

  /**
   * Check if attendance has been marked for a batch on a date.
   */
  isDateMarked(batchId, date) {
    return (AppState.get(RECORDS_KEY) || []).some(r => r.batchId === batchId && r.date === date);
  },

  /**
   * Export attendance for a batch as CSV.
   * Rows: Student Name | CNIC | date1 | date2 | ... | % Present
   */
  exportCSV(batchId) {
    const batch    = AppState.findById('batches', batchId);
    const students = (AppState.get('students') || []).filter(s => s.batchId === batchId);
    const dates    = AttendanceDateGenerator.generate(batchId);

    if (!batch || !students.length) return;

    const header = ['Student Name', 'CNIC', ...dates, 'Present%'];
    const rows = students.map(stu => {
      const recMap = {};
      (AppState.get(RECORDS_KEY) || [])
        .filter(r => r.studentId === stu.id && r.batchId === batchId)
        .forEach(r => { recMap[r.date] = r.status; });

      const statuses = dates.map(d => recMap[d] || '—');
      const marked   = statuses.filter(s => s === 'P' || s === 'A' || s === 'L').length;
      const present  = statuses.filter(s => s === 'P').length;
      const pct      = marked > 0 ? Math.round((present / marked) * 100) + '%' : '—';

      return [stu.studentName, stu.cnic || '', ...statuses, pct]
        .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });

    const csv  = [header.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `attendance_${batch.batchName}_${Date.now()}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  },

  /**
   * Gather everything needed to build a "sample" attendance template
   * for ONE specific batch — active students, all class dates (via LP
   * or the fallback generator), and any already-marked statuses.
   * Pure data — no DOM/CSV work here, so the Import/Export UI (or any
   * other caller) can format it however it needs (CSV, Excel, PDF...).
   *
   * @param {string} batchId
   * @returns {{ batch: Object, students: Object[], classDates: string[], attMap: Object }|null}
   *          null if the batch itself doesn't exist.
   */
  getBatchSampleData(batchId) {
    const batch = AppState.findById('batches', batchId);
    if (!batch) return null;

    // Active enrolled students (same source of truth as Daily Attendance)
    const enrolments = (AppState.get('enrolments') || [])
      .filter(e => e.batchId === batchId && e.status === 'active');
    const students = enrolments
      .map(e => AppState.findById('students', e.studentId))
      .filter(Boolean)
      .sort((a, b) => (a.studentName || '').localeCompare(b.studentName || ''));

    // Class dates — lecture-plan rows first, fallback generator otherwise
    const lpaMap = AppState.get('lpAssignments') || {};
    const lpa    = lpaMap[batchId];
    const classDates = (lpa?.rows?.length)
      ? [...new Set(lpa.rows.map(r => r.date).filter(Boolean))].sort()
      : (AttendanceDateGenerator.generate(batchId) || []);

    // Already-marked statuses, same shape as the daily-sheet's attMap
    const attMap = {};
    this.getRecordsForBatch(batchId).forEach(r => {
      if (!attMap[r.studentId]) attMap[r.studentId] = {};
      attMap[r.studentId][r.date] = r.status;
    });

    return { batch, students, classDates, attMap };
  },
};
