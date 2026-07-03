// ============================================================
// api/batches.js — Vercel Serverless Function
// Dedicated batches endpoint — batches ko appstate.main se
// alag collection mein rakhta hai taake main document chota
// rahe (Vercel 4.5MB response limit se bachne ke liye).
//
// Bilkul api/students.js jesa pattern — frontend poora array
// bhejta hai, poora array wapas leta hai (full-array-replace).
// ============================================================
const { MongoClient } = require('mongodb');

const MONGO_URI  = process.env.MONGODB_URI;
const SECRET_KEY = process.env.API_SECRET_KEY;
const DB_NAME    = 'sms';
const COL_NAME   = 'batches'; // alag collection — appstate se separate

let cachedClient = null;

async function connectDB() {
  if (cachedClient) return cachedClient;
  if (!MONGO_URI) throw new Error('MONGODB_URI environment variable not set');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth check — GET aur POST dono
  const incoming = req.headers['x-api-key'];
  if (!SECRET_KEY || incoming !== SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const client = await connectDB();
    const col    = client.db(DB_NAME).collection(COL_NAME);

    // ── GET — sare batches wapas do ───────────────────────────
    if (req.method === 'GET') {
      const batches = await col.find({}, { projection: { _id: 0 } }).toArray();
      return res.status(200).json({ success: true, batches });
    }

    // ── POST — poora batches array replace karo ────────────────
    // Body: { batches: [ {...}, {...}, ... ] }
    if (req.method === 'POST') {
      const { batches } = req.body || {};
      if (!Array.isArray(batches)) {
        return res.status(400).json({ success: false, error: 'batches array required' });
      }

      // ✅ Safety guard: agar incoming array khali hai lekin collection
      // mein pehle se data mojood hai, to accidental wipe mat hone do.
      if (batches.length === 0) {
        const existingCount = await col.countDocuments();
        if (existingCount > 0) {
          console.warn(`[Batches API] Blocked empty overwrite — ${existingCount} existing records safe rakhe.`);
          return res.status(200).json({ success: true, blocked: true, existingCount });
        }
      }

      // Full replace — jo array bheja gaya wahi ab authoritative hai
      await col.deleteMany({});
      if (batches.length > 0) {
        await col.insertMany(batches, { ordered: false });
      }

      return res.status(200).json({ success: true, count: batches.length });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('[Batches API] Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
