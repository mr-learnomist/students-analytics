// ============================================================
// api/teacherNotes.js — Vercel Serverless Function
// Teacher Portal personal notes: sticky notes, tasks, and
// per-student notes. Each teacher only ever sees/touches their
// own records — teacherId is always required and always filtered on.
// Same per-record upsert pattern as api/attendance.js — race
// condition safe: MongoDB $set on a single record only.
// ============================================================
const { MongoClient } = require('mongodb');

const MONGO_URI  = process.env.MONGODB_URI;
const SECRET_KEY = process.env.API_SECRET_KEY;
const DB_NAME    = 'sms';
const COL_NAME   = 'teacherNotes';

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

// Runs once per warm serverless instance — without these, GET/POST
// below would do a full collection scan on every request.
async function ensureIndexes(col) {
  if (indexesEnsured) return;
  await Promise.all([
    col.createIndex({ teacherId: 1 }),        // speeds up GET filter
    col.createIndex({ id: 1 }, { unique: true }), // speeds up POST upsert + DELETE by id
  ]);
  indexesEnsured = true;
}

const VALID_KINDS = ['sticky', 'task', 'student'];

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
    await ensureIndexes(col);

    // ── GET — is teacher ke sare notes fetch karo ────────────
    // Query: /api/teacherNotes?teacherId=xxx
    if (req.method === 'GET') {
      const { teacherId } = req.query;
      if (!teacherId) {
        return res.status(400).json({ success: false, error: 'teacherId required' });
      }
      const records = await col.find({ teacherId }, { projection: { _id: 0 } }).toArray();
      return res.status(200).json({ success: true, records });
    }

    // ── POST — ek ya multiple notes upsert karo ───────────────
    // Body: { records: [ { id, teacherId, kind, title, body, ... } ] }
    if (req.method === 'POST') {
      const { records } = req.body || {};
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, error: 'records array required' });
      }

      for (const r of records) {
        if (!r.id || !r.teacherId || !r.kind) {
          return res.status(400).json({ success: false, error: 'Each record needs id, teacherId, kind' });
        }
        if (!VALID_KINDS.includes(r.kind)) {
          return res.status(400).json({ success: false, error: `Invalid kind: ${r.kind}` });
        }
      }

      // Per-record upsert — race condition safe, same as attendance.
      const ops = records.map(r => ({
        updateOne: {
          filter: { id: r.id, teacherId: r.teacherId }, // teacherId in filter too — a teacher can never overwrite another teacher's note even with a guessed id
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

    // ── DELETE — ek note delete karo (apna hi, teacherId-scoped) ──
    // Query: /api/teacherNotes?id=xxx&teacherId=xxx
    if (req.method === 'DELETE') {
      const { id, teacherId } = req.query;
      if (!id || !teacherId) {
        return res.status(400).json({ success: false, error: 'id and teacherId required' });
      }
      const result = await col.deleteOne({ id, teacherId });
      return res.status(200).json({ success: true, deleted: result.deletedCount });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('[TeacherNotes API] Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
