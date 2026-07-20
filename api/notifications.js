// ============================================================
// api/notifications.js — Vercel Serverless Function
// Generic notification system — works for any logged-in user
// (teacher, admin, etc). Scoped by userId throughout.
// Same per-record upsert pattern as api/attendance.js and
// api/teacherNotes.js — race condition safe.
// ============================================================
const { MongoClient } = require('mongodb');

const MONGO_URI  = process.env.MONGODB_URI;
const SECRET_KEY = process.env.API_SECRET_KEY;
const DB_NAME    = 'sms';
const COL_NAME   = 'notifications';

let cachedClient   = null;
let indexesEnsured = false;

async function connectDB() {
  if (cachedClient) return cachedClient;
  if (!MONGO_URI) throw new Error('MONGODB_URI environment variable not set');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

async function ensureIndexes(col) {
  if (indexesEnsured) return;
  await Promise.all([
    col.createIndex({ userId: 1 }),           // speeds up GET filter
    col.createIndex({ id: 1 }, { unique: true }), // speeds up POST upsert + DELETE by id
  ]);
  indexesEnsured = true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const incoming = req.headers['x-api-key'];
  if (!SECRET_KEY || incoming !== SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const client = await connectDB();
    const col    = client.db(DB_NAME).collection(COL_NAME);
    await ensureIndexes(col);

    // ── GET — is user ke sare notifications fetch karo ─────────
    // Query: /api/notifications?userId=xxx
    if (req.method === 'GET') {
      const { userId } = req.query;
      if (!userId) {
        return res.status(400).json({ success: false, error: 'userId required' });
      }
      const records = await col.find({ userId }, { projection: { _id: 0 } })
        .sort({ createdAt: -1 })
        .limit(200) // a notification list never needs unbounded history
        .toArray();
      return res.status(200).json({ success: true, records });
    }

    // ── POST — ek ya multiple notifications upsert karo ─────────
    // Body: { records: [ { id, userId, type, title, message, link, read, createdAt } ] }
    if (req.method === 'POST') {
      const { records } = req.body || {};
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, error: 'records array required' });
      }
      for (const r of records) {
        if (!r.id || !r.userId || !r.title) {
          return res.status(400).json({ success: false, error: 'Each record needs id, userId, title' });
        }
      }
      const ops = records.map(r => ({
        updateOne: {
          filter: { id: r.id, userId: r.userId },
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

    // ── DELETE — ek notification delete karo (apna hi, userId-scoped) ──
    // Query: /api/notifications?id=xxx&userId=xxx
    if (req.method === 'DELETE') {
      const { id, userId } = req.query;
      if (!id || !userId) {
        return res.status(400).json({ success: false, error: 'id and userId required' });
      }
      const result = await col.deleteOne({ id, userId });
      return res.status(200).json({ success: true, deleted: result.deletedCount });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('[Notifications API] Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
