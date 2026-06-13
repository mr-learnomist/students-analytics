// ============================================================
// api/backup.js — Vercel Serverless Function
// Backup system ke sare endpoints handle karta hai.
//
// Routes (req.query.action se differentiate):
//   POST   action=create   — named backup banao
//   GET    action=list     — sari backups ki list
//   GET    action=get      — ek backup ka data (name required)
//   POST   action=restore  — kisi backup se restore karo
//   POST   action=delete   — ek backup delete karo
//   POST   action=import   — JSON file data import karo
//
// Vercel mein ek hi function file sab handle karti hai kyunki
// /api/backup/* ko /api/backup.js pe map karna hota hai via
// vercel.json rewrites.
// ============================================================

const { MongoClient } = require('mongodb');

const MONGO_URI  = process.env.MONGODB_URI;
const SECRET_KEY = process.env.API_SECRET_KEY;
const DB_NAME    = 'sms';
const COL_NAME   = 'appstate';
const BACKUP_COL = 'appstate_backup';
const MAX_AUTO_BACKUPS = 20;

let cachedClient = null;

async function connectDB() {
  if (cachedClient) return cachedClient;
  if (!MONGO_URI) throw new Error('MONGODB_URI environment variable not set');
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

function _countRecords(appState = {}) {
  const keys = ['students','batches','teachers','attendanceRecords',
                 'lecturePlans','subjects','levels','disciplines','campuses','users'];
  const counts = {};
  keys.forEach(k => {
    const v = appState[k];
    counts[k] = Array.isArray(v) ? v.length
              : (v && typeof v === 'object') ? Object.keys(v).length
              : 0;
  });
  return counts;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth
  const incoming = req.headers['x-api-key'];
  if (!SECRET_KEY || incoming !== SECRET_KEY) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  // Action: URL path ya query se determine karo
  // e.g. /api/backup/list  → req.query.action = 'list'  (via vercel.json rewrite)
  // e.g. /api/backup/get   → req.query.action = 'get'
  const pathParts = (req.url || '').split('/').filter(Boolean);
  // pathParts: ['api','backup','list'] or ['api','backup','get','somename']
  const action    = req.query.action || pathParts[2] || '';
  const nameParam = req.query.name   || pathParts[3] || req.body?.name || '';

  try {
    const client = await connectDB();
    const db     = client.db(DB_NAME);
    const bkCol  = db.collection(BACKUP_COL);
    const mainCol= db.collection(COL_NAME);

    // ── CREATE ───────────────────────────────────────────────
    if (action === 'create' && req.method === 'POST') {
      const label    = (req.body?.name || '').slice(0, 120).replace(/\s+/g, '_');
      const backupId = label || `backup_${Date.now()}`;

      const current = await mainCol.findOne({ _id: 'main' });
      if (!current?.data) return res.status(404).json({ success: false, error: 'No current data found' });

      const appState = current.data?.appState || {};
      const counts   = _countRecords(appState);
      const sizeKB   = Math.round(Buffer.byteLength(JSON.stringify(current.data), 'utf8') / 1024);

      await bkCol.updateOne(
        { _id: backupId },
        { $set: { _id: backupId, name: backupId, data: current.data, savedAt: new Date(), counts, sizeKB } },
        { upsert: true }
      );

      // Auto-clean old auto backups
      const autoList = await bkCol
        .find({ name: /^auto_/ }, { projection: { _id: 1, savedAt: 1 } })
        .sort({ savedAt: 1 }).toArray();
      if (autoList.length > MAX_AUTO_BACKUPS) {
        const toDelete = autoList.slice(0, autoList.length - MAX_AUTO_BACKUPS).map(b => b._id);
        await bkCol.deleteMany({ _id: { $in: toDelete } });
      }

      return res.status(200).json({ success: true, name: backupId, savedAt: new Date(), counts, sizeKB });
    }

    // ── LIST ─────────────────────────────────────────────────
    if (action === 'list' && req.method === 'GET') {
      const backups = await bkCol
        .find({}, { projection: { data: 0 } })
        .sort({ savedAt: -1 })
        .toArray();
      const list = backups.map(b => ({
        name:    b.name || b._id,
        savedAt: b.savedAt,
        counts:  b.counts || {},
        sizeKB:  b.sizeKB || null,
      }));
      return res.status(200).json({ success: true, backups: list });
    }

    // ── GET (single backup data) ──────────────────────────────
    if (action === 'get' && req.method === 'GET') {
      if (!nameParam) return res.status(400).json({ success: false, error: 'name required' });
      const doc = await bkCol.findOne({ _id: nameParam });
      if (!doc) return res.status(404).json({ success: false, error: 'Backup not found' });
      return res.status(200).json({ success: true, name: doc.name || doc._id, savedAt: doc.savedAt, data: doc.data });
    }

    // ── RESTORE ──────────────────────────────────────────────
    if (action === 'restore' && req.method === 'POST') {
      const name = req.body?.name || '';
      if (!name) return res.status(400).json({ success: false, error: 'name required' });

      const backup = await bkCol.findOne({ _id: name });
      if (!backup?.data) return res.status(404).json({ success: false, error: 'Backup not found' });

      // Pre-restore snapshot
      const current = await mainCol.findOne({ _id: 'main' });
      if (current?.data) {
        const preId = `pre_restore_${Date.now()}`;
        await bkCol.updateOne(
          { _id: preId },
          { $set: { _id: preId, name: preId, data: current.data, savedAt: new Date(),
                    counts: _countRecords(current.data?.appState || {}), sizeKB: null } },
          { upsert: true }
        );
      }

      await mainCol.updateOne(
        { _id: 'main' },
        { $set: { data: backup.data, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.status(200).json({ success: true, message: 'Restore complete', restoredFrom: name, savedAt: backup.savedAt });
    }

    // ── DELETE ───────────────────────────────────────────────
    if (action === 'delete' && req.method === 'POST') {
      const name = req.body?.name || '';
      if (!name) return res.status(400).json({ success: false, error: 'name required' });
      const result = await bkCol.deleteOne({ _id: name });
      if (!result.deletedCount) return res.status(404).json({ success: false, error: 'Backup not found' });
      return res.status(200).json({ success: true });
    }

    // ── IMPORT ───────────────────────────────────────────────
    if (action === 'import' && req.method === 'POST') {
      const { name, data } = req.body || {};
      if (!data) return res.status(400).json({ success: false, error: 'data required' });

      // Pre-import snapshot
      const current = await mainCol.findOne({ _id: 'main' });
      if (current?.data) {
        const preId = `pre_import_${Date.now()}`;
        await bkCol.updateOne(
          { _id: preId },
          { $set: { _id: preId, name: preId, data: current.data, savedAt: new Date(),
                    counts: _countRecords(current.data?.appState || {}), sizeKB: null } },
          { upsert: true }
        );
      }

      const importId = `imported_${(name || 'file').slice(0,40)}_${Date.now()}`;
      await mainCol.updateOne(
        { _id: 'main' },
        { $set: { data, updatedAt: new Date() } },
        { upsert: true }
      );
      return res.status(200).json({ success: true, importedName: importId });
    }

    return res.status(400).json({ success: false, error: `Unknown action: ${action}` });

  } catch (e) {
    console.error('[Backup API] Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
