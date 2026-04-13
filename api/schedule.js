import { put, head, list } from '@vercel/blob';

const BLOB_PATH = 'stash-schedule.json';

export default async function handler(req, res) {
  // CORS headers for same-origin fetch from the frontend
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ── GET: fetch the latest schedule (public, no auth) ──
  if (req.method === 'GET') {
    try {
      const { blobs } = await list({ prefix: BLOB_PATH });
      if (!blobs.length) {
        return res.status(200).json({ ok: true, data: null });
      }
      // Fetch the blob content
      const blobUrl = blobs[0].url;
      const response = await fetch(blobUrl);
      const data = await response.json();
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      console.error('GET error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to load schedule' });
    }
  }

  // ── POST: upload new schedule data (password-protected) ──
  if (req.method === 'POST') {
    // Validate upload key
    const uploadKey = req.headers['x-upload-key'];
    const expectedKey = process.env.UPLOAD_KEY;

    if (!expectedKey) {
      return res.status(500).json({ ok: false, error: 'Server misconfigured: UPLOAD_KEY not set' });
    }

    if (!uploadKey || uploadKey !== expectedKey) {
      return res.status(401).json({ ok: false, error: 'Invalid upload key' });
    }

    try {
      const body = req.body;

      if (!body || !body.items || !body.channels) {
        return res.status(400).json({ ok: false, error: 'Invalid payload — must include items and channels' });
      }

      // Add metadata
      const payload = {
        items: body.items,
        channels: body.channels,
        hasPriority: body.hasPriority || false,
        uploadedAt: new Date().toISOString(),
      };

      // Store in Vercel Blob (overwrites previous)
      await put(BLOB_PATH, JSON.stringify(payload), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });

      return res.status(200).json({ ok: true, message: 'Schedule saved' });
    } catch (err) {
      console.error('POST error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to save schedule' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
