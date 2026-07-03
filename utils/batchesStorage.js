// ============================================================
// utils/batchesStorage.js — Batches ke liye alag storage layer
// utils/studentsStorage.js jaisa hi pattern (retry, save-queue)
// lekin /api/batches endpoint se baat karta hai.
// Ye batches ko main appstate document se alag rakhta hai
// taake main document Vercel ki 4.5MB response limit ke andar rahe.
// ============================================================

const BatchesStorage = (() => {
  const API        = '/api/batches';
  // ✅ storage.js jaisi hi key — Vercel env var API_SECRET_KEY se match honi chahiye
  const SECRET_KEY = 'malik@2020';

  let _saving  = false;
  let _pending = false;
  let _latest  = null; // sabse recent batches array jo save hona hai

  async function _doSave(batches, attempt = 1) {
    try {
      const res = await fetch(API, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    SECRET_KEY,
        },
        body:  JSON.stringify({ batches }),
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      return true;

    } catch (err) {
      console.error(`[BatchesStorage] Save attempt ${attempt} failed:`, err.message);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        return _doSave(batches, attempt + 1);
      }
      console.error('[BatchesStorage] All save attempts failed!');
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
      return Array.isArray(json.batches) ? json.batches : [];

    } catch (err) {
      console.error(`[BatchesStorage] load attempt ${attempt} failed:`, err.message);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 800 * attempt));
        return _doLoad(attempt + 1);
      }
      console.error('[BatchesStorage] All load attempts failed — server unreachable.');
      return null; // ✅ sentinel: "load fail", storage.js jese hi pattern
    }
  }

  return {
    // ── loadBatches() — sare batches fetch karo ───────────────
    async loadBatches() {
      return _doLoad();
    },

    // ── setBatches(array) — poora array save karo ─────────────
    setBatches(batches) {
      _latest = batches;
      _queueSave().catch(err =>
        console.error('[BatchesStorage] Queue save error:', err.message)
      );
      return true;
    },
  };
})();

export default BatchesStorage;
