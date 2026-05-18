import { put, list } from '@vercel/blob';

const BLOB_PATH = 'territory-progress.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET — load saved progress (public, no auth needed)
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_PATH });
      if (!blobs.length) return res.status(200).json({ ok: true, data: null });
      const response = await fetch(blobs[0].url);
      const data = await response.json();
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      console.error('territory GET error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to load progress' });
    }
  }

  // POST — save progress (no auth — any tech with the URL can check items off)
  if (req.method === 'POST') {
    try {
      const body = req.body;
      if (!body || typeof body.completed !== 'object') {
        return res.status(400).json({ ok: false, error: 'Invalid payload' });
      }
      const payload = {
        completed: body.completed,
        savedAt: new Date().toISOString(),
      };
      await put(BLOB_PATH, JSON.stringify(payload), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('territory POST error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to save progress' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
