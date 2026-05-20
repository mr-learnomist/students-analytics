// ============================================================
// modules/testing/testingService.js — Testing Data Service
// Handles all AppState CRUD for tests, schedules, results
// ============================================================

import { AppState, generateID } from '../../utils/state.js';

// ── AppState Keys ─────────────────────────────────────────────
export const KEYS = {
  TESTS:     'tests',       // Test definitions (name, subject, totalMarks, etc.)
  SCHEDULES: 'testSchedules', // Scheduled test instances (batchId, date, venue, etc.)
  RESULTS:   'testResults',   // Per-student results
};

// ── Test CRUD ─────────────────────────────────────────────────

export function getTests() {
  return AppState.get(KEYS.TESTS) || [];
}

export function getTestById(id) {
  return AppState.findById(KEYS.TESTS, id) || null;
}

export function addTest(data) {
  const id = generateID('test');
  AppState.add(KEYS.TESTS, { ...data, id, createdAt: new Date().toISOString() });
  return id;
}

export function updateTest(id, data) {
  AppState.update(KEYS.TESTS, id, { ...data, updatedAt: new Date().toISOString() });
}

export function deleteTest(id) {
  // Also remove all schedules and results linked to this test
  const schedules = getSchedulesByTest(id);
  schedules.forEach(s => deleteSchedule(s.id));
  AppState.remove(KEYS.TESTS, id);
}

// ── Schedule CRUD ─────────────────────────────────────────────

export function getSchedules() {
  return AppState.get(KEYS.SCHEDULES) || [];
}

export function getScheduleById(id) {
  return AppState.findById(KEYS.SCHEDULES, id) || null;
}

export function getSchedulesByBatch(batchId) {
  return getSchedules().filter(s => s.batchId === batchId);
}

export function getSchedulesByTest(testId) {
  return getSchedules().filter(s => s.testId === testId);
}

export function addSchedule(data) {
  const id = generateID('tsched');
  AppState.add(KEYS.SCHEDULES, { ...data, id, createdAt: new Date().toISOString() });
  return id;
}

export function updateSchedule(id, data) {
  AppState.update(KEYS.SCHEDULES, id, { ...data, updatedAt: new Date().toISOString() });
}

export function deleteSchedule(id) {
  // Also remove all results for this schedule
  const results = getResultsBySchedule(id);
  results.forEach(r => AppState.remove(KEYS.RESULTS, r.id));
  AppState.remove(KEYS.SCHEDULES, id);
}

// ── Results CRUD ──────────────────────────────────────────────

export function getResults() {
  return AppState.get(KEYS.RESULTS) || [];
}

export function getResultsBySchedule(scheduleId) {
  return getResults().filter(r => r.scheduleId === scheduleId);
}

export function getResultsByStudent(studentId) {
  return getResults().filter(r => r.studentId === studentId);
}

// ── Resolve helpers ───────────────────────────────────────────
// These resolve linked entities from AppState for display

export function resolveScheduleDisplay(schedule) {
  if (!schedule) return null;
  const test     = AppState.findById('tests',       schedule.testId)     || null;
  const batch    = AppState.findById('batches',     schedule.batchId)    || null;
  const subject  = schedule.subjectId ? AppState.findById('subjects', schedule.subjectId) : null;
  const campus   = batch?.campusId    ? AppState.findById('campuses', batch.campusId)    : null;
  const teacher  = schedule.invigilatorId ? AppState.findById('teachers', schedule.invigilatorId) : null;

  return { ...schedule, test, batch, subject, campus, teacher };
}

// ── Status helpers ────────────────────────────────────────────

export function getScheduleStatus(schedule) {
  if (!schedule?.date) return 'draft';
  const today     = new Date(); today.setHours(0,0,0,0);
  const schedDate = new Date(schedule.date + 'T00:00:00');
  if (schedule.status === 'cancelled') return 'cancelled';
  if (schedule.status === 'completed') return 'completed';
  if (schedDate < today) return 'overdue';
  if (schedDate.getTime() === today.getTime()) return 'today';
  return 'upcoming';
}

export const STATUS_META = {
  draft:     { label: 'Draft',     color: 'var(--t3)',     bg: 'var(--surface3)'    },
  upcoming:  { label: 'Upcoming',  color: 'var(--blue)',   bg: 'var(--blue-dim)'    },
  today:     { label: 'Today',     color: 'var(--yellow)', bg: 'var(--yellow-dim)'  },
  overdue:   { label: 'Overdue',   color: 'var(--red)',    bg: 'var(--red-dim)'     },
  completed: { label: 'Completed', color: 'var(--green)',  bg: 'var(--green-dim)'   },
  cancelled: { label: 'Cancelled', color: 'var(--t3)',     bg: 'var(--surface3)'    },
};

// ── Test type options ─────────────────────────────────────────
export const TEST_TYPES = [
  { value: 'mcq',        label: 'MCQ'              },
  { value: 'written',    label: 'Written'           },
  { value: 'mock',       label: 'Mock Exam'         },
  { value: 'midterm',    label: 'Mid-Term'          },
  { value: 'final',      label: 'Final Exam'        },
  { value: 'quiz',       label: 'Quiz'              },
  { value: 'assignment', label: 'Assignment'        },
  { value: 'practical',  label: 'Practical'         },
];

export const TEST_TYPE_META = {
  mcq:        { color: 'var(--blue)',   bg: 'var(--blue-dim)'   },
  written:    { color: 'var(--violet)', bg: 'var(--violet-dim)' },
  mock:       { color: 'var(--cyan)',   bg: 'var(--cyan-dim)'   },
  midterm:    { color: 'var(--yellow)', bg: 'var(--yellow-dim)' },
  final:      { color: 'var(--red)',    bg: 'var(--red-dim)'    },
  quiz:       { color: 'var(--green)',  bg: 'var(--green-dim)'  },
  assignment: { color: 'var(--t2)',     bg: 'var(--surface3)'   },
  practical:  { color: 'var(--cyan)',   bg: 'var(--cyan-dim)'   },
};

// ── Duration format helper ────────────────────────────────────
export function formatDuration(minutes) {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h)      return `${h}h`;
  return `${m}m`;
}

// ── Date format helper ────────────────────────────────────────
export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}
