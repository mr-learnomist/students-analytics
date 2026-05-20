// ============================================================
// utils/changeConfig.js
// Central configuration for master data change control.
//
// Each entity defines:
//   allow   — which change modes are permitted
//   impacts — which transactional stores to scan for dependents
//   fields  — which fields, if changed, trigger the impact check
//
// MODES:
//   SAFE          — update master only; all transactional data
//                   keeps its existing snapshot values untouched.
//   STRUCTURE_ONLY — update master + fix forward-looking records
//                    (e.g. new batches get the new levelName),
//                    but NEVER touch enrolments or attendance.
//   LP_ONLY        — update master + re-stamp lecturePlan name
//                    fields only. Safe for historical alignment.
//
// Adding a new module later?  Just add its key to `impacts`
// and batchImpact / levelImpact handlers, then AppState
// will find it automatically.
// ============================================================

export const CHANGE_CONFIG = {

  institute: {
    type: 'MASTER',
    allow: ['SAFE'],
    // Campuses store instituteId but not instituteName — low risk.
    // Full cascade never allowed.
    impacts: [],
    // Which field changes trigger the impact dialog at all
    sensitiveFields: ['instituteName'],
  },

  campuses: {
    type: 'MASTER',
    allow: ['SAFE'],
    // Batches store campusId only. A rename must not silently
    // change historical batch display names.
    impacts: ['batches', 'enrolments'],
    sensitiveFields: ['campusName', 'abbreviation'],
  },

  disciplines: {
    type: 'MASTER',
    allow: ['SAFE', 'STRUCTURE_ONLY'],
    // Batches embed disciplineId and batchName contains the
    // abbreviation — the most critical coupling.
    impacts: ['batches', 'lecturePlans', 'enrolments'],
    sensitiveFields: ['fullName', 'abbreviation'],
  },

  levels: {
    type: 'MASTER',
    allow: ['SAFE', 'STRUCTURE_ONLY'],
    impacts: ['batches', 'lecturePlans', 'enrolments'],
    sensitiveFields: ['levelName'],
  },

  subjects: {
    type: 'MASTER',
    allow: ['SAFE', 'LP_ONLY'],
    // subjectCode is baked into batchName string at creation.
    // LP_ONLY lets us re-stamp lecturePlan subject labels only.
    impacts: ['batches', 'lecturePlans', 'enrolments'],
    sensitiveFields: ['subjectName', 'subjectCode'],
  },
};

// ── Human-readable mode labels shown in the modal ────────────
export const MODE_LABELS = {
  SAFE: {
    label:       'Keep history unchanged (recommended)',
    description: 'Only the master record is updated. All existing batches, lecture plans, and enrolments continue to show their original values.',
    badge:       '✓ Safe',
  },
  STRUCTURE_ONLY: {
    label:       'Update new records only (structure change)',
    description: 'Master record is updated. Snapshot name fields in existing batches are refreshed. Enrolments and attendance are never touched.',
    badge:       '⚠ Partial',
  },
  LP_ONLY: {
    label:       'Update lecture plans only',
    description: 'Master record is updated and the subject label in linked lecture plans is refreshed. Batches and enrolments are untouched.',
    badge:       '⚠ Partial',
  },
};
