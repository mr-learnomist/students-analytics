// api/data.js — Vercel Serverless Function (Safe + Authenticated)
const { MongoClient } = require('mongodb');

const MONGO_URI  = process.env.MONGODB_URI;
const SECRET_KEY = process.env.API_SECRET_KEY;
const DB_NAME    = 'sms';
const COL_NAME   = 'appstate';

let cachedClient = null;

async function connectDB() {
  if (cachedClient) return cachedClient;
  if (!MONGO_URI) throw new Error('MONGODB_URI environment variable not set');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

const PROTECTED_KEYS = [
  'students', 'batches', 'teachers', 'admissions',
  'attendanceRecords', 'lecturePlans', 'feeStructures',
  'challans', 'batchSchedules', 'disciplines', 'campuses',
  'institutes', 'levels', 'subjects', 'users', 'holidays',
  'roles', 'lpRows', 'lpAssignments', 'rooms', 'testRecords'
];

function mergeProtected(incoming, existing) {
  const merged = { ...incoming };
  PROTECTED_KEYS.forEach(key => {
    const inc = incoming[key];
    const cur = existing[key];

    // ✅ FIX: pehle sirf "incoming[key] EMPTY array/object hai" check hota
    // tha. Lekin agar incoming mein key BILKUL MISSING (undefined) ho —
    // jaise ab 'students' ko state.js jaan-boojh kar payload se hata deta
    // hai (kyunki wo ab alag endpoint se save hoti hai) — to purana check
    // fail ho jata tha aur poori key hi Mongo se GAYAB ho jati thi (kyunki
    // neeche poora 'data' object $set hota hai, merge nahi).
    // Ab hum "key missing" ko bhi "empty" jaisa hi treat karte hain.
    const incMissing = inc === undefined;

    const incEmpty =
      incMissing ||
      (Array.isArray(inc) && inc.length === 0) ||
      (inc && typeof inc === 'object' && !Array.isArray(inc) && Object.keys(inc).length === 0);

    const curHasData =
      (Array.isArray(cur) && cur.length > 0) ||
      (cur && typeof cur === 'object' && !Array.isArray(cur) && Object.keys(cur).length > 0);

    if (incEmpty && curHasData) {
      console.warn(`[SMS] Blocked empty/missing overwrite: ${key}`);
      merged[key] = cur;
    } else if (incMissing && cur !== undefined) {
      // Key na incoming mein hai na existing mein data hai — phir bhi
      // key ko poori tarah gayab mat hone do, jo bhi existing value hai
      // (chahe empty) wahi rakho, taake shape consistent rahe.
      merged[key] = cur;
    }
  });
  return merged;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ✅ GET aur POST dono ke liye auth check
  const incoming = req.headers['x-api-key'];
  if (!SECRET_KEY || incoming !== SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const client = await connectDB();
    const db     = client.db(DB_NAME);

    // ── GET — data read karo ─────────────────────────────────
    if (req.method === 'GET') {
      const doc  = await db.collection(COL_NAME).findOne({ _id: 'main' });
      let data   = doc ? doc.data : {};

      if (data.appState) delete data.appState.currentUser;
      if (data.session)  delete data.session;

      return res.status(200).json({ success: true, data });
    }

    // ── POST — data save karo ────────────────────────────────
    if (req.method === 'POST') {
      let payload = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid payload' });
      }

      if (payload.appState) delete payload.appState.currentUser;
      if (payload.session)  delete payload.session;

      const existing      = await db.collection(COL_NAME).findOne({ _id: 'main' });
      const existingState = existing?.data?.appState || {};
      const newState      = payload.appState || {};

      payload.appState = mergeProtected(newState, existingState);

      // ✅ FIX: pehle backup-write aur main-write sequential (ek ke baad
      // ek) chalti thin — do poore round-trips ka time lagta tha. Dono
      // writes ek dusre pe depend nahi karti (dono ka data already
      // compute ho chuka hai), isliye ab dono PARALLEL chalti hain
      // (Promise.all). Dono ab bhi poori tarah await hoti hain — koi
      // safety/reliability compromise nahi, sirf ek round-trip ka time
      // bachta hai.
      const writes = [
        db.collection(COL_NAME).updateOne(
          { _id: 'main' },
          { $set: { data: payload, updatedAt: new Date() } },
          { upsert: true }
        )
      ];

      if (existing?.data) {
        writes.push(
          db.collection('appstate_backup').replaceOne(
            { _id: 'backup_latest' },
            { _id: 'backup_latest', data: existing.data, savedAt: new Date() },
            { upsert: true }
          )
        );
      }

      await Promise.all(writes);

      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('[SMS] DB Error:', e.message);

    if (e.message.includes('MONGODB_URI')) {
      return res.status(503).json({
        success: false,
        error: 'Database not configured — MONGODB_URI missing in Vercel environment variables'
      });
    }

    return res.status(500).json({ success: false, error: e.message });
  }
};
