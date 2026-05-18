import { put, list } from '@vercel/blob';

const BLOB_PROGRESS = 'territory-progress.json';
const BLOB_REPORT   = 'territory-report.json';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const type = req.query?.type || 'progress';

    try {
      const blobPath = type === 'report' ? BLOB_REPORT : BLOB_PROGRESS;
      const { blobs } = await list({ prefix: blobPath });
      if (!blobs.length) return res.status(200).json({ ok: true, data: null });
      const response = await fetch(blobs[0].url);
      const data = await response.json();
      return res.status(200).json({ ok: true, data });
    } catch (err) {
      console.error('territory GET error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to load data' });
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ ok: false, error: 'Invalid payload' });
    }

    // Saving the full report requires the upload key (admin only)
    if (body.reportData !== undefined) {
      const uploadKey = req.headers['x-upload-key'];
      const expectedKey = process.env.UPLOAD_KEY;
      if (!expectedKey) {
        return res.status(500).json({ ok: false, error: 'Server misconfigured: UPLOAD_KEY not set' });
      }
      if (!uploadKey || uploadKey !== expectedKey) {
        return res.status(401).json({ ok: false, error: 'Invalid upload key' });
      }

      try {
        const payload = {
          reportData: body.reportData,
          savedAt: new Date().toISOString(),
        };
        await put(BLOB_REPORT, JSON.stringify(payload), {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
        });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('territory report POST error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to save report' });
      }
    }

    // Saving progress / match selections — no auth needed
    try {
      let existing = {};
      try {
        const { blobs } = await list({ prefix: BLOB_PROGRESS });
        if (blobs.length) {
          const r = await fetch(blobs[0].url);
          existing = await r.json();
        }
      } catch (_) {}

      const payload = {
        ...existing,
        ...(body.completed        !== undefined && { completed: body.completed }),
        ...(body.matchSelections  !== undefined && { matchSelections: body.matchSelections }),
        savedAt: new Date().toISOString(),
      };
      await put(BLOB_PROGRESS, JSON.stringify(payload), {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false,
      });
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.error('territory POST error:', err);
      return res.status(500).json({ ok: false, error: 'Failed to save data' });
    }
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
