// ============================================================
// api/students.js — Vercel Serverless Function
// Dedicated students endpoint — students ko appstate.main se
// alag collection mein rakhta hai taake main document chota
// rahe (Vercel 4.5MB response limit se bachne ke liye).
//
// Frontend abhi bhi "poora array bhejo, poora array wapas lo"
// tareeqay se kaam karta hai (state.js isi tarah save karta hai),
// isliye ye endpoint bhi full-array replace ka pattern follow
// karta hai — bilkul jaisa pehle appstate.main karta tha, sirf
// ab sirf 'students' collection ke liye, baaki data ko touch
// kiye baghair.
// ============================================================
const { MongoClient } = require('mongodb');

const MONGO_URI  = process.env.MONGODB_URI;
const SECRET_KEY = process.env.API_SECRET_KEY;
const DB_NAME    = 'sms';
const COL_NAME   = 'students'; // alag collection — appstate se separate

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

    // ── GET — sare students wapas do ──────────────────────────
    if (req.method === 'GET') {
      const students = await col.find({}, { projection: { _id: 0 } }).toArray();
      return res.status(200).json({ success: true, students });
    }

    // ── POST — poora students array replace karo ───────────────
    // Body: { students: [ {...}, {...}, ... ] }
    if (req.method === 'POST') {
      const { students } = req.body || {};
      if (!Array.isArray(students)) {
        return res.status(400).json({ success: false, error: 'students array required' });
      }

      // ✅ Safety guard: agar incoming array khali hai lekin collection
      // mein pehle se data mojood hai, to accidental wipe mat hone do.
      // (data.js ke mergeProtected wala hi idea, yahan bhi zaroori hai
      // kyunki frontend hamesha "poora array" bhejta hai.)
      if (students.length === 0) {
        const existingCount = await col.countDocuments();
        if (existingCount > 0) {
          console.warn(`[Students API] Blocked empty overwrite — ${existingCount} existing records safe rakhe.`);
          return res.status(200).json({ success: true, blocked: true, existingCount });
        }
      }

      // Full replace — jo array bheja gaya wahi ab authoritative hai
      await col.deleteMany({});
      if (students.length > 0) {
        await col.insertMany(students, { ordered: false });
      }

      return res.status(200).json({ success: true, count: students.length });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('[Students API] Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
