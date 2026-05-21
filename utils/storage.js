// ============================================================
// utils/storage.js — File-based storage via Express server
//
// FIX: localhost:3001 → relative URL (/api/data)
// Ab yeh learnomist.com pe bhi kaam karega aur localhost pe bhi.
// Koi bhi device pe kholo — same MongoDB Atlas ka data milega.
// ============================================================

const Storage = (() => {
  // ✅ KEY FIX: Relative URL — localhost nahi, jo bhi server ho wahi use hoga
  // localhost pe:    http://localhost:3001/api/data
  // learnomist.com:  https://www.learnomist.com/api/data
  const API = '/api/data';

  // ── In-memory cache (state loaded once at boot) ───────────
  let _cache = null;

  return {

    // ── set(key, value) ──────────────────────────────────────
    set(key, value) {
      if (!_cache) _cache = {};
      _cache[key] = value;

      fetch(API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(_cache),
      }).catch(err => {
        console.error('[Storage] POST failed:', err.message);
      });

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
      fetch(API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(_cache || {}),
      }).catch(err => console.error('[Storage] remove POST failed:', err.message));
    },

    // ── clear() ──────────────────────────────────────────────
    clear() {
      _cache = {};
      fetch(API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      }).catch(err => console.error('[Storage] clear POST failed:', err.message));
    },

    // ── loadAll() ────────────────────────────────────────────
    async loadAll() {
      try {
        const res  = await fetch(API);
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
        const res = await fetch(API, { method: 'GET' });
        return res.ok;
      } catch {
        return false;
      }
    },
  };
})();

export default Storage;
