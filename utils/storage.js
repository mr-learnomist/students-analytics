// ============================================================
// utils/storage.js — File-based storage via Express server
// FIXED:
// 1. Secret key authentication — GET + POST dono secure
// 2. Save queue — concurrent saves data corrupt nahi karein
// 3. Retry logic — network fail pe dobara try karo
// ============================================================

const Storage = (() => {
  const API        = '/api/data';
  // ✅ Vercel env variable se match karni chahiye: API_SECRET_KEY
  const SECRET_KEY = 'malik@2020';

  let _cache   = null;
  let _saving  = false;
  let _pending = false;

  // ── Internal save with retry ──────────────────────────────
  async function _doSave(data, attempt = 1) {
    try {
      const res = await fetch(API, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    SECRET_KEY,
        },
        body:  JSON.stringify(data),
        cache: 'no-store',
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Save failed');
      return true;

    } catch (err) {
      console.error(`[Storage] Save attempt ${attempt} failed:`, err.message);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        return _doSave(data, attempt + 1);
      }
      console.error('[Storage] All save attempts failed!');
      return false;
    }
  }

  // ── Save queue — concurrent saves prevent karo ────────────
  async function _queueSave() {
    if (_saving) { _pending = true; return; }
    _saving  = true;
    _pending = false;
    await _doSave(_cache);
    _saving = false;
    if (_pending) { _pending = false; _queueSave(); }
  }

  return {

    // ── set(key, value) ──────────────────────────────────────
    set(key, value) {
      if (!_cache) _cache = {};
      _cache[key] = value;
      _queueSave().catch(err =>
        console.error('[Storage] Queue save error:', err.message)
      );
      return true;
    },

    // ── get(key, fallback) ───────────────────────────────────
    get(key, fallback = null) {
      if (_cache === null) {
        console.warn('[Storage] get() called before loadAll() — returning fallback');
        return fallback;
      }
      const val = _cache[key];
      return val !== undefined ? val : fallback;
    },

    // ── remove(key) ──────────────────────────────────────────
    remove(key) {
      if (_cache) delete _cache[key];
      _queueSave().catch(err =>
        console.error('[Storage] Remove save error:', err.message)
      );
    },

    // ── clear() ──────────────────────────────────────────────
    clear() {
      _cache = {};
      _queueSave().catch(err =>
        console.error('[Storage] Clear save error:', err.message)
      );
    },

    // ── loadAll() — GET pe bhi auth header ───────────────────
    async loadAll() {
      try {
        // ✅ FIX: cache:'no-store' + timestamp param — browser ya koi
        // bhi proxy/CDN purana (stale) users/password data serve na kare.
        // Yehi wajah thi ke login 2-3 dafa fail hota tha aur sirf hard
        // refresh (Ctrl+Shift+R) se fix hota tha.
        const res = await fetch(`${API}?_=${Date.now()}`, {
          headers: { 'x-api-key': SECRET_KEY },
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const json = await res.json();
        if (json && typeof json === 'object') {
          _cache = json.data ?? json;
        } else {
          _cache = {};
        }
        return _cache;
      } catch (err) {
        console.error('[Storage] loadAll failed:', err.message);
        _cache = {};
        return {};
      }
    },

    // ── isServerAvailable() ──────────────────────────────────
    async isServerAvailable() {
      try {
        const res = await fetch(`${API}?_=${Date.now()}`, {
          headers: { 'x-api-key': SECRET_KEY },
          cache: 'no-store',
        });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
})();

export default Storage;
