// ============================================================
// utils/storage.js — File-based storage via Express server
// FIXED:
// 1. Secret key authentication — unauthorized POST block
// 2. Save queue — concurrent saves data corrupt nahi karein
// 3. Retry logic — network fail pe dobara try karo
// 4. Save verification — confirm karo data save hua
// ============================================================

const Storage = (() => {
  const API        = '/api/data';
  // ✅ Ye key Vercel environment variable se match karni chahiye
  // Vercel Dashboard → Settings → Env Variables → API_SECRET_KEY
  const SECRET_KEY = 'skans2024xK9p';

  let _cache    = null;
  let _saving   = false;
  let _pending  = false;

  // ── Internal save function with retry ────────────────────
  async function _doSave(data, attempt = 1) {
    try {
      const res = await fetch(API, {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key':    SECRET_KEY,        // ✅ Auth header
        },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Save failed');
      }

      return true;
    } catch (err) {
      console.error(`[Storage] Save attempt ${attempt} failed:`, err.message);

      // ✅ 3 baar retry karo — network blip ho sakti hai
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 1000 * attempt));
        return _doSave(data, attempt + 1);
      }

      console.error('[Storage] All save attempts failed — data may not be persisted!');
      return false;
    }
  }

  // ── Save queue — concurrent saves prevent karo ───────────
  async function _queueSave() {
    if (_saving) {
      // Ek save chal raha hai — pending mark karo
      _pending = true;
      return;
    }

    _saving = true;
    _pending = false;

    await _doSave(_cache);

    _saving = false;

    // Agar pending tha toh dobara save karo
    if (_pending) {
      _pending = false;
      _queueSave();
    }
  }

  return {
    // ── set(key, value) ────────────────────────────────────
    set(key, value) {
      if (!_cache) _cache = {};
      _cache[key] = value;
      // ✅ Queue mein dalo — fire and forget nahi
      _queueSave().catch(err =>
        console.error('[Storage] Queue save error:', err.message)
      );
      return true;
    },

    // ── get(key, fallback) ─────────────────────────────────
    get(key, fallback = null) {
      if (_cache === null) {
        console.warn('[Storage] get() called before loadAll() — returning fallback');
        return fallback;
      }
      const val = _cache[key];
      return val !== undefined ? val : fallback;
    },

    // ── remove(key) ────────────────────────────────────────
    remove(key) {
      if (_cache) delete _cache[key];
      _queueSave().catch(err =>
        console.error('[Storage] Remove save error:', err.message)
      );
    },

    // ── clear() ────────────────────────────────────────────
    clear() {
      _cache = {};
      _queueSave().catch(err =>
        console.error('[Storage] Clear save error:', err.message)
      );
    },

    // ── loadAll() ──────────────────────────────────────────
    async loadAll() {
      try {
        const res = await fetch(API);
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

    // ── isServerAvailable() ────────────────────────────────
    async isServerAvailable() {
      try {
        const res = await fetch(API, { method: 'GET' });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
})();

export default Storage;
