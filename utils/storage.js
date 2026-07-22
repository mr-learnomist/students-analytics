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
  let _pendingWaiters = []; // ✅ FIX: resolvers waiting on the NEXT save round's result

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
  // ✅ FIX: pehle ye sirf fire-and-forget tha — kisi ko pata hi nahi
  // chalta tha ke save actually kamyab hua ya nahi. Ab har caller
  // apna set()/remove()/clear() await kar sakta hai aur asal
  // success/failure (retries ke baad) wapas milta hai.
  //
  // Note: agar dusra save already chal raha ho (_saving === true),
  // to hamari mutation _cache mein already ho chuki hoti hai (set()
  // ne cache pehle hi update kar diya), lekin in-flight request ka
  // JSON.stringify() usse pehle capture ho chuka ho sakta hai —
  // isliye hum us in-flight round pe bharosa nahi karte, balke
  // agle round (jo _pending flag ki wajah se turant chalega) ka
  // wait karte hain, taake wapas milne wala result hamesha hamari
  // apni mutation ko reflect kare.
  async function _queueSave() {
    if (_saving) {
      _pending = true;
      return new Promise(resolve => _pendingWaiters.push(resolve));
    }
    _saving = true;
    let success;
    do {
      _pending = false;
      const waitersForThisRound = _pendingWaiters;
      _pendingWaiters = [];
      success = await _doSave(_cache);
      waitersForThisRound.forEach(resolve => resolve(success));
    } while (_pending); // agar await ke dauran koi naya set() aaya, ek aur round chalao
    _saving = false;
    return success;
  }

  // ── Internal load with retry — ✅ FIX ──────────────────────
  // Pehle sirf EK attempt hoti thi aur fail hone par {} return
  // hota tha — jisay state.js "fresh install" samajh ke default
  // users seed kar deta aur turant server pe OVERWRITE kar deta
  // tha. Slow/flaky internet pe ye kabhi-kabhi real data ko
  // factory-default se replace kar deta tha (isi se "kabhi
  // password accept karta kabhi nahi" hota tha). Ab 3 baar retry
  // karte hain, aur total fail hone par {} ke bajaye `null`
  // return karte hain — taake "load fail hui" aur "server pe
  // waqai koi data nahi" do alag cheezein confuse na hon.
  async function _doLoad(attempt = 1) {
    try {
      const res = await fetch(`${API}?_=${Date.now()}`, {
        headers: { 'x-api-key': SECRET_KEY },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      _cache = (json && typeof json === 'object') ? (json.data ?? json) : {};
      return _cache;

    } catch (err) {
      console.error(`[Storage] loadAll attempt ${attempt} failed:`, err.message);
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, 800 * attempt));
        return _doLoad(attempt + 1);
      }
      console.error('[Storage] All loadAll attempts failed — server unreachable.');
      return null; // ✅ sentinel: "load fail", NAHI "fresh install"
    }
  }

  return {

    // ── set(key, value) ──────────────────────────────────────
    // ✅ FIX: ab ek Promise<boolean> return karta hai jo asal
    // backend save (retries ke baad) ke result se resolve hota hai.
    // Purane sync callers pe koi asar nahi — Promise ko ignore
    // karna bhi valid hai, bas ab jo await karna chahe kar sakta hai.
    async set(key, value) {
      if (!_cache) _cache = {};
      _cache[key] = value;
      try {
        return await _queueSave();
      } catch (err) {
        console.error('[Storage] Queue save error:', err.message);
        return false;
      }
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
    async remove(key) {
      if (_cache) delete _cache[key];
      try {
        return await _queueSave();
      } catch (err) {
        console.error('[Storage] Remove save error:', err.message);
        return false;
      }
    },

    // ── clear() ──────────────────────────────────────────────
    async clear() {
      _cache = {};
      try {
        return await _queueSave();
      } catch (err) {
        console.error('[Storage] Clear save error:', err.message);
        return false;
      }
    },

    // ── loadAll() — GET pe bhi auth header, retry + safe-fail ──
    async loadAll() {
      return _doLoad();
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
