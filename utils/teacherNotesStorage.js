// ============================================================
// utils/teacherNotesStorage.js — Teacher Portal personal notes
// (sticky notes, tasks, per-student notes).
//
// Same per-record instant-save pattern as attendanceService.js:
// every create/update/delete writes straight through to
// /api/teacherNotes right away — these are small personal edits,
// not a batch form, so there's no separate "Save" step to stage.
// ============================================================

import { AppState } from './state.js';

const API_BASE   = '/api/teacherNotes';
const SECRET_KEY = 'malik@2020';
const NOTES_KEY  = 'teacherNotes'; // AppState key

function _genId() {
  return 'note_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

async function _apiUpsert(records) {
  try {
    const res = await fetch(API_BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': SECRET_KEY },
      body:    JSON.stringify({ records }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Save failed');
    return true;
  } catch (err) {
    console.error('[TeacherNotesStorage] Save failed:', err.message);
    return false;
  }
}

async function _apiDelete(id, teacherId) {
  try {
    const qs  = `id=${encodeURIComponent(id)}&teacherId=${encodeURIComponent(teacherId)}`;
    const res = await fetch(`${API_BASE}?${qs}`, {
      method:  'DELETE',
      headers: { 'x-api-key': SECRET_KEY },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Delete failed');
    return true;
  } catch (err) {
    console.error('[TeacherNotesStorage] Delete failed:', err.message);
    return false;
  }
}

// ── fetchAndSyncTeacherNotes(teacherId) — pull this teacher's notes
// from the backend and merge into AppState. Call once when the Notes
// page mounts.
export async function fetchAndSyncTeacherNotes(teacherId) {
  try {
    const res = await fetch(`${API_BASE}?teacherId=${encodeURIComponent(teacherId)}`, {
      headers: { 'x-api-key': SECRET_KEY },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.error || 'Fetch failed');

    // Merge (not replace) — keeps any other teacher's cached notes
    // that might already be in AppState from elsewhere untouched.
    const existing = AppState.get(NOTES_KEY) || [];
    const map = {};
    existing.forEach(r => { map[r.id] = r; });
    (json.records || []).forEach(r => { map[r.id] = r; });
    AppState._silentSet(NOTES_KEY, Object.values(map));
    return true;
  } catch (err) {
    console.error('[TeacherNotesStorage] Sync failed:', err.message);
    return false;
  }
}

export const TeacherNotesService = {
  // ── Reads (all local — AppState is kept in sync by fetch/create/update/remove) ──
  getAll(teacherId) {
    return (AppState.get(NOTES_KEY) || []).filter(n => n.teacherId === teacherId);
  },

  getByKind(teacherId, kind) {
    return this.getAll(teacherId).filter(n => n.kind === kind);
  },

  getForStudent(teacherId, studentId) {
    return this.getAll(teacherId).filter(n => n.kind === 'student' && n.studentId === studentId);
  },

  // ── Writes — optimistic local update, then fire-and-forget backend sync ──
  create(note) {
    const record = {
      id:        _genId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...note,
    };
    const all = AppState.get(NOTES_KEY) || [];
    AppState._silentSet(NOTES_KEY, [...all, record]);
    _apiUpsert([record]);
    return record;
  },

  update(id, patch) {
    const all = AppState.get(NOTES_KEY) || [];
    let updated = null;
    const next = all.map(n => {
      if (n.id !== id) return n;
      updated = { ...n, ...patch, updatedAt: new Date().toISOString() };
      return updated;
    });
    AppState._silentSet(NOTES_KEY, next);
    if (updated) _apiUpsert([updated]);
    return updated;
  },

  remove(id, teacherId) {
    const all = AppState.get(NOTES_KEY) || [];
    AppState._silentSet(NOTES_KEY, all.filter(n => n.id !== id));
    _apiDelete(id, teacherId);
  },
};
