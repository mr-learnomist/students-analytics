// ============================================================
// api/lecturePlans.js — Vercel Serverless Function
// Dedicated endpoint for lecturePlans + lpRows + lpAssignments.
//
// Ye teeno keys appstate.main se nikal ke apni khud ki collection
// (`lecturePlanData`) mein rakhte hain — ek hi document (_id:'main')
// ke andar, kyunke ye teeno aapas mein tightly linked hain
// (lpRows aur lpAssignments dono lecturePlans ke IDs se reference
// karte hain — lecturePlanService.js mein saath hi manage hote hain).
//
// Full-object-replace pattern (bilkul students/batches jesa) —
// frontend poora { lecturePlans, lpRows, lpAssignments } object
// bhejta hai, poora wapas leta hai.
// ============================================================
const { MongoClient } = require('mongodb');

const MONGO_URI  = process.env.MONGODB_URI;
const SECRET_KEY = process.env.API_SECRET_KEY;
const DB_NAME    = 'sms';
const COL_NAME   = 'lecturePlanData'; // alag collection — appstate se separate

let cachedClient = null;

async function connectDB() {
  if (cachedClient) return cachedClient;
  if (!MONGO_URI) throw new Error('MONGODB_URI environment variable not set');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

function isEmptyPayload(lecturePlans, lpRows, lpAssignments) {
  const plansEmpty = !Array.isArray(lecturePlans) || lecturePlans.length === 0;
  const rowsEmpty  = !lpRows || typeof lpRows !== 'object' || Object.keys(lpRows).length === 0;
  const assignEmpty= !lpAssignments || typeof lpAssignments !== 'object' || Object.keys(lpAssignments).length === 0;
  return plansEmpty && rowsEmpty && assignEmpty;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const incoming = req.headers['x-api-key'];
  if (!SECRET_KEY || incoming !== SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const client = await connectDB();
    const col    = client.db(DB_NAME).collection(COL_NAME);

    // ── GET — poora lecture-plan data wapas do ────────────────
    if (req.method === 'GET') {
      const doc = await col.findOne({ _id: 'main' });
      const data = doc?.data || { lecturePlans: [], lpRows: {}, lpAssignments: {} };
      return res.status(200).json({ success: true, ...data });
    }

    // ── POST — poora object replace karo ──────────────────────
    // Body: { lecturePlans: [...], lpRows: {...}, lpAssignments: {...} }
    if (req.method === 'POST') {
      const { lecturePlans, lpRows, lpAssignments } = req.body || {};

      if (!Array.isArray(lecturePlans) || typeof lpRows !== 'object' || typeof lpAssignments !== 'object') {
        return res.status(400).json({
          success: false,
          error: 'lecturePlans (array), lpRows (object), lpAssignments (object) required',
        });
      }

      // ✅ Safety guard: agar poora incoming payload khali hai lekin
      // DB mein pehle se data mojood hai, to accidental wipe mat hone do.
      if (isEmptyPayload(lecturePlans, lpRows, lpAssignments)) {
        const existing = await col.findOne({ _id: 'main' });
        const existingHasData = existing?.data && !isEmptyPayload(
          existing.data.lecturePlans, existing.data.lpRows, existing.data.lpAssignments
        );
        if (existingHasData) {
          console.warn('[LecturePlans API] Blocked empty overwrite — existing data safe rakha gaya.');
          return res.status(200).json({ success: true, blocked: true });
        }
      }

      await col.updateOne(
        { _id: 'main' },
        { $set: { data: { lecturePlans, lpRows, lpAssignments }, updatedAt: new Date() } },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        count: { lecturePlans: lecturePlans.length, lpRows: Object.keys(lpRows).length, lpAssignments: Object.keys(lpAssignments).length },
      });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('[LecturePlans API] Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
