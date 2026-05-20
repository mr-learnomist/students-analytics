// ============================================================
// server.js — SMS Server with MongoDB Atlas
// Run: node server.js
// ============================================================

const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const { MongoClient } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── MongoDB Connection ────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://mr_learnomist:malik%402020@ac-qeypqz2-shard-00-00.z2vp0of.mongodb.net:27017,ac-qeypqz2-shard-00-01.z2vp0of.mongodb.net:27017,ac-qeypqz2-shard-00-02.z2vp0of.mongodb.net:27017/?ssl=true&replicaSet=atlas-wfx9c0-shard-0&authSource=admin&appName=edu-track';
const DB_NAME   = 'sms';
const COL_NAME  = 'appstate';

let db;

async function connectDB() {
  try {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(DB_NAME);
    console.log('  ✅  MongoDB Connected:', DB_NAME);
  } catch (e) {
    console.error('  ❌  MongoDB Connection Failed:', e.message);
    process.exit(1);
  }
}

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// ── GET /api/data — Read entire state from MongoDB ───────────
app.get('/api/data', async (req, res) => {
  try {
    const doc = await db.collection(COL_NAME).findOne({ _id: 'main' });
    const data = doc ? doc.data : {};
    res.json({ success: true, data });
  } catch (e) {
    console.error('[SMS Server] Read error:', e.message);
    res.status(500).json({ success: false, error: 'Failed to read from MongoDB' });
  }
});

// ── POST /api/data — Save entire state to MongoDB ────────────
app.post('/api/data', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }
    await db.collection(COL_NAME).replaceOne(
      { _id: 'main' },
      { _id: 'main', data: payload, updatedAt: new Date() },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (e) {
    console.error('[SMS Server] Write error:', e.message);
    res.status(500).json({ success: false, error: 'Failed to write to MongoDB' });
  }
});

// ── Start ─────────────────────────────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log('');
    console.log('  ✅  SMS Server running');
    console.log(`  🌐  Open: http://localhost:${PORT}`);
    console.log(`  🍃  Database: MongoDB Atlas (${DB_NAME})`);
    console.log('');
  });
});
