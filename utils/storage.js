// ============================================================
// utils/storage.js — File-based storage via local Express server
//
// CHANGE FROM v1: localStorage → fetch() calls to server.js
// Interface is identical — same get/set/remove/clear methods.
// AppState does not need any changes.
//
// Server endpoints used:
//   GET  http://localhost:3001/api/data  → returns full state object
//   POST http://localhost:3001/api/data  → overwrites full state object
// ============================================================

const Storage = (() => {
  const API      = 'http://localhost:3001/api/data';
  const CACHE_KEY = 'sms_cache'; // in-memory cache — avoids redundant reads

  // ── In-memory cache (state loaded once at boot) ───────────
  let _cache = null;

  return {

    // ── set(key, value) ──────────────────────────────────────
    // Writes the full state object to database.json via POST.
    // Called by AppState.saveState() on every change.
    set(key, value) {
      // Update cache immediately (synchronous-feeling for callers)
      if (!_cache) _cache = {};
      _cache[key] = value;

      // Fire-and-forget POST — non-blocking so UI stays snappy
      fetch(API, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(_cache),
      }).catch(err => {
        console.error('[Storage] POST failed — is server.js running?', err.message);
      });

      return true;
    },

    // ── get(key, fallback) ───────────────────────────────────
    // Reads from in-memory cache (populated by loadAll on boot).
    // Falls back to fallback if key is missing.
    get(key, fallback = null) {
      if (_cache === null) {
        // Cache not yet populated — this shouldn't happen after loadAll()
        // but handle gracefully just in case
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
    // MUST be called once on app boot (before AppState.loadState).
    // Fetches the full state from database.json into cache.
    // Returns the full state object (or {} on first run).
    async loadAll() {
      try {
        const res  = await fetch(API);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // Support both server response shapes:
        //   { data: { appState: {...} } }  ← Express wrapper
        //   { appState: {...} }             ← raw JSON file
        if (json && typeof json === 'object') {
          _cache = json.data ?? json;
        } else {
          _cache = {};
        }
        return _cache;
      } catch (err) {
        console.error('[Storage] loadAll failed — is server.js running?', err.message);
        _cache = {};
        return {};
      }
    },

    // ── isServerAvailable() ──────────────────────────────────
    // Optional health check — call on boot to show a clear error
    // if the user forgot to start server.js
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
