// ============================================================
// utils/lecturePlanStorage.js — Lecture-plan data ke liye
// alag storage layer (lecturePlans + lpRows + lpAssignments,
// teeno ek saath — kyunke ye tightly linked hain).
// utils/studentsStorage.js jaisa hi pattern (retry, save-queue)
// lekin /api/lecturePlans endpoint se baat karta hai.
// ============================================================

const LecturePlanStorage = (() => {
  const API        = '/api/lecturePlans';
  const SECRET_KEY = 'malik@2020';

  let _saving  = false;
  let _pending = false;
  let _latest  = null; // { lecturePlans, lpRows, lpAssignments }

  async function _doSave(payload, attempt = 1) {
    try {
      const res = await fetch(API, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    SECRET_KEY,
        },
        body:  JSON.stringify(payload),
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      return true;

    } catch (err) {
      console.error(`[LecturePlanStorage] Save attempt ${attempt} failed:`, err.message);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        return _doSave(payload, attempt + 1);
      }
      console.error('[LecturePlanStorage] All save attempts failed!');
      return false;
    }
  }

  async function _queueSave() {
    if (_saving) { _pending = true; return; }
    _saving  = true;
    _pending = false;
    await _doSave(_latest);
    _saving = false;
    if (_pending) { _pending = false; _queueSave(); }
  }

  async function _doLoad(attempt = 1) {
    try {
      const res = await fetch(`${API}?_=${Date.now()}`, {
        headers: { 'x-api-key': SECRET_KEY },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      return {
        lecturePlans:  Array.isArray(json.lecturePlans) ? json.lecturePlans : [],
        lpRows:        (json.lpRows && typeof json.lpRows === 'object') ? json.lpRows : {},
        lpAssignments: (json.lpAssignments && typeof json.lpAssignments === 'object') ? json.lpAssignments : {},
      };

    } catch (err) {
      console.error(`[LecturePlanStorage] load attempt ${attempt} failed:`, err.message);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 800 * attempt));
        return _doLoad(attempt + 1);
      }
      console.error('[LecturePlanStorage] All load attempts failed — server unreachable.');
      return null; // ✅ sentinel: "load fail"
    }
  }

  return {
    // ── loadLectureData() — { lecturePlans, lpRows, lpAssignments } fetch karo ──
    async loadLectureData() {
      return _doLoad();
    },

    // ── setLectureData({ lecturePlans, lpRows, lpAssignments }) ─────────────────
    setLectureData(payload) {
      _latest = payload;
      _queueSave().catch(err =>
        console.error('[LecturePlanStorage] Queue save error:', err.message)
      );
      return true;
    },
  };
})();

export default LecturePlanStorage;
