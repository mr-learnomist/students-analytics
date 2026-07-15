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

  // ── Read cache ───────────────────────────────────────────────
  // loadLectureData() currently downloads EVERY lecture plan, EVERY
  // batch's assignment, and EVERY row in the system on every single
  // call — even when the caller (e.g. the Teacher Portal) only needs
  // one batch's data. That's the main reason the attendance screen
  // felt slow. The real fix is a batchId-scoped backend endpoint;
  // until that exists, this cache stops repeated calls within a short
  // window from re-downloading everything each time.
  let _cache    = null; // last successful { lecturePlans, lpRows, lpAssignments }
  let _cachedAt = 0;
  let _inflight = null; // de-dupe concurrent calls (e.g. Promise.allSettled firing twice)

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
    // ── loadLectureData(maxAgeMs) — { lecturePlans, lpRows, lpAssignments } fetch karo ──
    // maxAgeMs = 0 (default): always hits the network — unchanged
    //            behaviour for callers that must see the latest data
    //            right now (e.g. the admin Lecture Plan editor).
    // maxAgeMs > 0: if we already fetched within the last maxAgeMs
    //            milliseconds, return that cached copy instantly —
    //            no network call. Use this for read-mostly screens
    //            like the Teacher Portal's attendance view, where a
    //            few seconds/minutes of staleness is a fine trade for
    //            not re-downloading the whole system's LP data on
    //            every click.
    async loadLectureData(maxAgeMs = 0) {
      if (maxAgeMs > 0 && _cache && (Date.now() - _cachedAt) < maxAgeMs) {
        return _cache;
      }
      // De-dupe: if a load is already in flight, piggy-back on it
      // instead of firing a second identical request.
      if (_inflight) return _inflight;

      _inflight = _doLoad().then(result => {
        if (result) { _cache = result; _cachedAt = Date.now(); }
        _inflight = null;
        return result;
      });
      return _inflight;
    },

    // ── invalidateCache() — force the next loadLectureData(maxAgeMs) call
    // to hit the network even if it's within the cache window. Call this
    // right after setLectureData() saves a change, so editors don't see
    // their own stale cache.
    invalidateCache() {
      _cache = null;
      _cachedAt = 0;
    },

    // ── setLectureData({ lecturePlans, lpRows, lpAssignments }) ─────────────────
    setLectureData(payload) {
      _latest = payload;
      _cache = null; _cachedAt = 0; // saved data supersedes any cached read
      _queueSave().catch(err =>
        console.error('[LecturePlanStorage] Queue save error:', err.message)
      );
      return true;
    },
  };
})();

export default LecturePlanStorage;
