// api/data.js — Vercel Serverless Function
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI;
const DB_NAME   = 'sms';
const COL_NAME  = 'appstate';

let cachedClient = null;

async function connectDB() {
  if (cachedClient) return cachedClient;
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  cachedClient = client;
  return client;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const client = await connectDB();
    const db = client.db(DB_NAME);

    if (req.method === 'GET') {
      const doc = await db.collection(COL_NAME).findOne({ _id: 'main' });
      const data = doc ? doc.data : {};
      return res.status(200).json({ success: true, data });
    }

    if (req.method === 'POST') {
      const payload = req.body;
      if (!payload || typeof payload !== 'object') {
        return res.status(400).json({ success: false, error: 'Invalid payload' });
      }
      await db.collection(COL_NAME).replaceOne(
        { _id: 'main' },
        { _id: 'main', data: payload, updatedAt: new Date() },
        { upsert: true }
      );
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ success: false, error: 'Method not allowed' });

  } catch (e) {
    console.error('DB Error:', e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
};
