// ============================================================
// api/attendance.js — Vercel Serverless Function
// Dedicated attendance endpoint — per-record upsert
// Race condition safe: MongoDB $set on single record only
// ============================================================
const { MongoClient } = require('mongodb');

const MONGO_URI  = process.env.MONGODB_URI;
const SECRET_KEY = process.env.API_SECRET_KEY;
const DB_NAME    = 'sms';
const COL_NAME   = 'attendance'; // alag collection — appstate se separate

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth check
  const incoming = req.headers['x-api-key'];
  if (!SECRET_KEY || incoming !== SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const client = await connectDB();
    const col    = client.db(DB_NAME).collection(COL_NAME);

    // ── GET — batch ki attendance fetch karo ─────────────────
    // Query: /api/attendance?batchId=xxx
    // Query: /api/attendance?batchId=xxx&date=2025-07-07
    if (req.method === 'GET') {
      const { batchId, date } = req.query;
      if (!batchId) {
        return res.status(400).json({ success: false, error: 'batchId required' });
      }

      const filter = { batchId };
      if (date) filter.date = date;

      const records = await col.find(filter, { projection: { _id: 0 } }).toArray();
      return res.status(200).json({ success: true, records });
    }

    // ── POST — ek ya multiple records upsert karo ─────────────
    // Body: { records: [ { id, batchId, studentId, date, status, markedAt, markedBy } ] }
    if (req.method === 'POST') {
      const { records } = req.body || {};
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, error: 'records array required' });
      }

      // Validate each record
      for (const r of records) {
        if (!r.batchId || !r.studentId || !r.date || !r.id) {
          return res.status(400).json({ success: false, error: 'Each record needs id, batchId, studentId, date' });
        }
        if (!['P', 'A', 'L'].includes(r.status)) {
          return res.status(400).json({ success: false, error: `Invalid status: ${r.status}` });
        }
      }

      // Per-record upsert — race condition safe
      // Har record apna khud ka _id use karta hai (r.id)
      // 100 teachers ek saath mark karein — har record independently save hoga
      const ops = records.map(r => ({
        updateOne: {
          filter: { id: r.id },
          update: { $set: { ...r } },
          upsert: true,
        },
      }));

      const result = await col.bulkWrite(ops, { ordered: false });

      return res.status(200).json({
        success: true,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
      });
    }

    // ── DELETE — kisi batch ki sari records delete karo ───────
    // Body: { batchId, date? }
    if (req.method === 'DELETE') {
      const { batchId, date } = req.body || {};
      if (!batchId) {
        return res.status(400).json({ success: false, error: 'batchId required' });
      }
      const filter = { batchId };
      if (date) filter.date = date;
      const result = await col.deleteMany(filter);
      return res.status(200).json({ success: true, deleted: result.deletedCount });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('[Attendance API] Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
