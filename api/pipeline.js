import { put, list } from '@vercel/blob';

const BLOB_KEY = 'pipeline-data.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_KEY });
      if (!blobs.length) return res.status(200).json({ ok: true, data: null });
      const response = await fetch(blobs[0].url);
      const data = await response.json();
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      console.error('pipeline GET error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to load pipeline data' });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body;
    if (!body || !Array.isArray(body.rows)) {
      return res.status(400).json({ ok: false, error: 'Invalid payload — expected { rows: [...] }' });
    }
    try {
      const payload = {
        rows: body.rows,
        savedAt: new Date().toISOString(),
      };
      await put(BLOB_KEY, JSON.stringify(payload), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('pipeline POST error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to save pipeline data' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
