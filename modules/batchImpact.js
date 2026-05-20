// ============================================================
// modules/batchImpact.js
// Batch-specific impact handler for master data changes.
//
// Called AFTER ChangeManager.handleUpdate() returns a mode.
// This file is the ONLY place allowed to write snapshot fields
// back into batch records.
//
// RULES:
//   - SAFE          → do nothing to batches
//   - STRUCTURE_ONLY → refresh snapshot name fields in batches
//                      that reference the changed entity.
//                      Never touch enrolments.
//   - LP_ONLY       → not applicable to batches (subjects only
//                      affects lecturePlans in LP_ONLY mode).
//                      Batches untouched.
//
// SNAPSHOT FIELDS per entity:
//   campus      → campusName (snapshot)
//   discipline  → disciplineName, disciplineAbbr (snapshot)
//                 batchName regenerated from stored snapshot
//   level       → levelName (snapshot)
//   subject     → subjectName, subjectCode (snapshot)
//                 batchName regenerated from stored snapshot
// ============================================================

import { AppState } from '../utils/state.js';
import { Toast }    from '../utils/helpers.js';

const KEY = 'batches';

// ── Helper: pad batch number ──────────────────────────────────
const fmt2 = n => String(n || 1).padStart(2, '0');

// ── Helper: rebuild batchName from stored snapshots ──────────
// Uses the snapshot fields already on the batch record — does
// NOT look up live master data.  This prevents a second drift.
function rebuildBatchName(batch) {
  // Prefer subjectCode snapshot, fall back to disciplineAbbr snapshot
  const prefix = (batch.subjectCode || batch.disciplineAbbr || 'XX').toUpperCase();
  const session = batch.sessionPeriod || '';
  const no      = fmt2(batch.batchNo);
  return `${prefix}-${session}-${no}`;
}

// ── Campus change impact ──────────────────────────────────────
// STRUCTURE_ONLY: refresh campusName snapshot in batches.
// Enrolments are never touched.
export function applyCampusImpact(campusId, newCampusData, mode) {
  if (mode !== 'STRUCTURE_ONLY') return;

  const batches  = AppState.get(KEY) || [];
  let   updated  = 0;

  batches.forEach(batch => {
    if (batch.campusId !== campusId) return;

    AppState.update(KEY, batch.id, {
      campusName: newCampusData.campusName || batch.campusName,
    });
    updated++;
  });

  if (updated > 0) {
    Toast.success(`Campus name updated in ${updated} batch${updated !== 1 ? 'es' : ''}.`);
  }
}

// ── Discipline change impact ──────────────────────────────────
// STRUCTURE_ONLY: refresh disciplineName + disciplineAbbr
//   snapshots, then rebuild batchName from stored snapshots.
export function applyDisciplineImpact(disciplineId, newDiscData, mode) {
  if (mode !== 'STRUCTURE_ONLY') return;

  const batches = AppState.get(KEY) || [];
  let   updated = 0;

  batches.forEach(batch => {
    if (batch.disciplineId !== disciplineId) return;

    const patch = {
      disciplineName: newDiscData.fullName        || batch.disciplineName,
      disciplineAbbr: newDiscData.abbreviation    || batch.disciplineAbbr,
    };

    // Rebuild batchName only if this batch has no subjectCode
    // (subject-based batches keep their subjectCode prefix)
    if (!batch.subjectCode) {
      const tempBatch  = { ...batch, ...patch };
      patch.batchName  = rebuildBatchName(tempBatch);
    }

    AppState.update(KEY, batch.id, patch);
    updated++;
  });

  if (updated > 0) {
    Toast.success(`Discipline updated in ${updated} batch${updated !== 1 ? 'es' : ''}.`);
  }
}

// ── Level change impact ───────────────────────────────────────
// STRUCTURE_ONLY: refresh levelName snapshot.
// batchName does not contain the levelName, so no rebuild needed.
export function applyLevelImpact(levelId, newLevelData, mode) {
  if (mode !== 'STRUCTURE_ONLY') return;

  const batches = AppState.get(KEY) || [];
  let   updated = 0;

  batches.forEach(batch => {
    if (batch.levelId !== levelId) return;

    AppState.update(KEY, batch.id, {
      levelName: newLevelData.levelName || batch.levelName,
    });
    updated++;
  });

  if (updated > 0) {
    Toast.success(`Level updated in ${updated} batch${updated !== 1 ? 'es' : ''}.`);
  }
}

// ── Subject change impact ─────────────────────────────────────
// SAFE    → batches untouched.
// LP_ONLY → batches untouched (LP_ONLY only touches lecturePlans).
//
// This function exists so the calling site is symmetric across
// all entities — it simply does nothing for non-applicable modes.
export function applySubjectImpactOnBatches(subjectId, newSubjectData, mode) {
  // Subject changes in LP_ONLY mode are handled by lecturePlan
  // impact handler.  Batch snapshot fields (subjectCode in batchName)
  // are frozen by design — they represent the historical record.
  if (mode !== 'STRUCTURE_ONLY') return;

  // STRUCTURE_ONLY for subjects is deliberately left as a no-op
  // for batches because subjectCode is baked into batchName.
  // Changing it would alter the identity of historical batches.
  // The config for 'subjects' allows only ['SAFE', 'LP_ONLY']
  // so this branch is never reached in practice — it is a safety net.
  console.warn(
    '[batchImpact] STRUCTURE_ONLY reached for subject — ' +
    'this should not happen per changeConfig. No batches updated.'
  );
}
