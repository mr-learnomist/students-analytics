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

// ── Backup helpers ────────────────────────────────────────────
const BACKUP_COL    = 'appstate_backup';
const MAX_BACKUPS   = 20; // zyada ho jayein to purane auto-backups delete hote hain

/** Record counts from appState for backup metadata */
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

// ── POST /api/backup/create — Named backup banao ──────────────
app.post('/api/backup/create', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'DB not connected' });

    const { name } = req.body || {};
    const backupId = (name || `backup_${Date.now()}`).slice(0, 120).replace(/\s+/g, '_');

    const current = await db.collection(COL_NAME).findOne({ _id: 'main' });
    if (!current?.data) return res.status(404).json({ success: false, error: 'No current data found' });

    const appState = current.data?.appState || {};
    const counts   = _countRecords(appState);
    const dataStr  = JSON.stringify(current.data);
    const sizeKB   = Math.round(Buffer.byteLength(dataStr, 'utf8') / 1024);

    await db.collection(BACKUP_COL).updateOne(
      { _id: backupId },
      { $set: { _id: backupId, name: backupId, data: current.data, savedAt: new Date(), counts, sizeKB } },
      { upsert: true }
    );

    // Auto-clean: agar 20+ auto backups hain to purana delete karo
    const autoBackups = await db.collection(BACKUP_COL)
      .find({ name: /^auto_/ }, { projection: { _id: 1, savedAt: 1 } })
      .sort({ savedAt: 1 })
      .toArray();
    if (autoBackups.length > MAX_BACKUPS) {
      const toDelete = autoBackups.slice(0, autoBackups.length - MAX_BACKUPS).map(b => b._id);
      await db.collection(BACKUP_COL).deleteMany({ _id: { $in: toDelete } });
      console.log(`[SMS Backup] Auto-cleaned ${toDelete.length} old auto-backups`);
    }

    console.log(`[SMS Backup] Created: ${backupId} (${sizeKB} KB)`);
    res.json({ success: true, name: backupId, savedAt: new Date(), counts, sizeKB });
  } catch (e) {
    console.error('[SMS Backup] Create error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/backup/list — Sari backups ki list ───────────────
app.get('/api/backup/list', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'DB not connected' });
    const backups = await db.collection(BACKUP_COL)
      .find({}, { projection: { data: 0 } }) // data exclude — sirf metadata
      .sort({ savedAt: -1 })
      .toArray();
    const list = backups.map(b => ({
      name:    b.name || b._id,
      savedAt: b.savedAt,
      counts:  b.counts || {},
      sizeKB:  b.sizeKB || null,
    }));
    res.json({ success: true, backups: list });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── GET /api/backup/get/:name — Ek backup ka full data ────────
app.get('/api/backup/get/:name', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'DB not connected' });
    const doc = await db.collection(BACKUP_COL).findOne({ _id: req.params.name });
    if (!doc) return res.status(404).json({ success: false, error: 'Backup not found' });
    res.json({ success: true, name: doc.name || doc._id, savedAt: doc.savedAt, data: doc.data });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/backup/restore — Kisi backup se restore karo ────
app.post('/api/backup/restore', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'DB not connected' });

    const { name } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name required' });

    const backup = await db.collection(BACKUP_COL).findOne({ _id: name });
    if (!backup?.data) return res.status(404).json({ success: false, error: 'Backup not found' });

    // Restore karne se pehle current state ka quick backup banao
    const current = await db.collection(COL_NAME).findOne({ _id: 'main' });
    if (current?.data) {
      const preRestoreId = `pre_restore_${Date.now()}`;
      const appState     = current.data?.appState || {};
      await db.collection(BACKUP_COL).updateOne(
        { _id: preRestoreId },
        { $set: { _id: preRestoreId, name: preRestoreId, data: current.data,
                  savedAt: new Date(), counts: _countRecords(appState), sizeKB: null } },
        { upsert: true }
      );
      console.log(`[SMS Backup] Pre-restore snapshot: ${preRestoreId}`);
    }

    await db.collection(COL_NAME).updateOne(
      { _id: 'main' },
      { $set: { data: backup.data, updatedAt: new Date() } },
      { upsert: true }
    );

    console.log(`[SMS Backup] Restored from: ${name}, savedAt: ${backup.savedAt}`);
    res.json({ success: true, message: 'Restore complete', restoredFrom: name, savedAt: backup.savedAt });
  } catch (e) {
    console.error('[SMS Backup] Restore error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/backup/delete — Ek backup delete karo ──────────
app.post('/api/backup/delete', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'DB not connected' });
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    const result = await db.collection(BACKUP_COL).deleteOne({ _id: name });
    if (!result.deletedCount) return res.status(404).json({ success: false, error: 'Backup not found' });
    console.log(`[SMS Backup] Deleted: ${name}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ── POST /api/backup/import — JSON file se import karo ────────
app.post('/api/backup/import', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'DB not connected' });
    const { name, data } = req.body || {};
    if (!data) return res.status(400).json({ success: false, error: 'data required' });

    // Current state ka backup banao import se pehle
    const current = await db.collection(COL_NAME).findOne({ _id: 'main' });
    if (current?.data) {
      const preId    = `pre_import_${Date.now()}`;
      const appState = current.data?.appState || {};
      await db.collection(BACKUP_COL).updateOne(
        { _id: preId },
        { $set: { _id: preId, name: preId, data: current.data,
                  savedAt: new Date(), counts: _countRecords(appState), sizeKB: null } },
        { upsert: true }
      );
    }

    // Import karo
    const importId = `imported_${(name || 'file').slice(0,40)}_${Date.now()}`;
    await db.collection(COL_NAME).updateOne(
      { _id: 'main' },
      { $set: { data, updatedAt: new Date() } },
      { upsert: true }
    );

    console.log(`[SMS Backup] Imported: ${importId}`);
    res.json({ success: true, importedName: importId });
  } catch (e) {
    console.error('[SMS Backup] Import error:', e.message);
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
