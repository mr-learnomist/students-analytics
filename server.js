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
// ✅ Password sirf environment variable se aata hai — hardcoded nahi
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

// ✅ Static files serve karo — index.html aur sab JS/CSS/pages
app.use(express.static(path.join(__dirname)));

// ── GET /api/data — Read entire state from MongoDB ───────────
app.get('/api/data', async (req, res) => {
  try {
    if (!db) return res.status(503).json({ success: false, error: 'Database not connected' });
    const doc  = await db.collection(COL_NAME).findOne({ _id: 'main' });
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
    if (!db) return res.status(503).json({ success: false, error: 'Database not connected' });
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

// ✅ Catch-all — index.html serve karo unknown routes pe
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
    console.log('');
  });
});

// ✅ Vercel ke liye module export
module.exports = app;
