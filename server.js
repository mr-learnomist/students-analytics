// ============================================================
// server.js — SMS Server with MongoDB Atlas
// Run: node server.js
// ============================================================

const express         = require('express');
const cors            = require('cors');
const path            = require('path');
const { MongoClient } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── MongoDB Connection ────────────────────────────────────────
const MONGO_URI = process.env.MONGODB_URI || '';
const DB_NAME   = 'sms';
const COL_NAME  = 'appstate';
let db;

async function connectDB() {
  try {
    if (!MONGO_URI) {
      console.error('  ❌  MONGODB_URI environment variable not set!');
      return;
    }
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('  ✅  MongoDB Connected:', DB_NAME);
  } catch (e) {
    console.error('  ❌  MongoDB Connection Failed:', e.message);
  }
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ── GET /api/data — Read state from MongoDB ──────────────────
app.get('/api/data', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not connected' });

    const doc  = await db.collection(COL_NAME).findOne({ _id: 'main' });
    let data   = doc ? doc.data : {};

    // ✅ session kabhi client ko wapas mat bhejo MongoDB se
    if (data.appState) delete data.appState.currentUser;
    if (data.session)  delete data.session;

    res.json({ success: true, data });
  } catch (e) {
    console.error('[SMS Server] Read error:', e.message);
    res.status(500).json({ success: false, error: 'Failed to read from MongoDB' });
  }
});

// ── POST /api/data — Safe Save with backup & protection ──────
app.post('/api/data', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not connected' });

    let payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    // ✅ Fix 1: session aur currentUser kabhi MongoDB mein save mat karo
    if (payload.appState) delete payload.appState.currentUser;
    if (payload.session)  delete payload.session;

    // ✅ Fix 2: existing data fetch karo merge ke liye
    const existing      = await db.collection(COL_NAME).findOne({ _id: 'main' });
    const existingState = existing?.data?.appState || {};
    const newState      = payload.appState || {};

    // ✅ Fix 3: empty array se existing data overwrite na ho
    const protectedArrays = [
      'students', 'batches', 'teachers', 'admissions',
      'attendanceRecords', 'lecturePlans', 'feeStructures',
      'challans', 'batchSchedules', 'disciplines', 'campuses',
      'institutes', 'levels', 'subjects', 'users', 'holidays',
      'roles', 'lpRows', 'lpAssignments'
    ];

    protectedArrays.forEach(key => {
      const incoming = newState[key];
      const current  = existingState[key];

      const incomingIsEmpty =
        (Array.isArray(incoming) && incoming.length === 0) ||
        (incoming && typeof incoming === 'object' && !Array.isArray(incoming) && Object.keys(incoming).length === 0);

      const currentHasData =
        (Array.isArray(current) && current.length > 0) ||
        (current && typeof current === 'object' && !Array.isArray(current) && Object.keys(current).length > 0);

      if (incomingIsEmpty && currentHasData) {
        console.warn(`[SMS] Blocked empty overwrite for: ${key}`);
        newState[key] = current;
      }
    });

    payload.appState = newState;

    // ✅ Fix 4: save se pehle backup banao
    if (existing?.data) {
      await db.collection('appstate_backup').replaceOne(
        { _id: 'backup_latest' },
        { _id: 'backup_latest', data: existing.data, savedAt: new Date() },
        { upsert: true }
      );
    }

    // ✅ Fix 5: replaceOne ki jagah updateOne/$set — safer
    await db.collection(COL_NAME).updateOne(
      { _id: 'main' },
      { $set: { data: payload, updatedAt: new Date() } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (e) {
    console.error('[SMS Server] Write error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/backup — Latest backup dekho ────────────────────
app.get('/api/backup', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'DB not connected' });
    const doc = await db.collection('appstate_backup').findOne({ _id: 'backup_latest' });
    if (!doc) return res.status(404).json({ success: false, error: 'No backup found' });
    res.json({ success: true, savedAt: doc.savedAt, data: doc.data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/restore — Backup se data wapas lao ─────────────
app.post('/api/restore', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'DB not connected' });

    const backup = await db.collection('appstate_backup').findOne({ _id: 'backup_latest' });
    if (!backup?.data) return res.status(404).json({ success: false, error: 'No backup found' });

    await db.collection(COL_NAME).updateOne(
      { _id: 'main' },
      { $set: { data: backup.data, updatedAt: new Date() } },
      { upsert: true }
    );

    console.log('[SMS] Data restored from backup, savedAt:', backup.savedAt);
    res.json({ success: true, message: 'Data restored from backup', restoredFrom: backup.savedAt });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/health — Server & DB status check ───────────────
app.get('/api/health', async (req, res) => {
  try {
    const dbOk = !!db;
    let recordCount = 0;
    if (dbOk) {
      const doc = await db.collection(COL_NAME).findOne({ _id: 'main' });
      const s   = doc?.data?.appState || {};
      recordCount = {
        students:         (s.students         || []).length,
        batches:          (s.batches          || []).length,
        teachers:         (s.teachers         || []).length,
        users:            (s.users            || []).length,
        attendanceRecords:(s.attendanceRecords|| []).length,
      };
    }
    res.json({
      success: true,
      db:      dbOk ? 'connected' : 'disconnected',
      counts:  recordCount,
      time:    new Date().toISOString()
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── Catch-all — SPA ke liye index.html ───────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ── Start ─────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ✅  SMS Server running');
    console.log(`  🌐  Open: http://localhost:${PORT}`);
    console.log(`  🍃  Database: MongoDB Atlas (${DB_NAME})`);
    console.log(`  🔒  Backup: enabled (appstate_backup collection)`);
    console.log('');
  });
});

// ✅ Vercel ke liye module export
module.exports = app;
