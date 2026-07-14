import { put, list } from '@vercel/blob';

// Separate blobs so each POST writes directly — no read-modify-write needed.
const BLOB_PROGRESS = 'territory-progress.json';  // stores { completed }
const BLOB_MATCHES  = 'territory-matches.json';   // stores { matchSelections }
const BLOB_REPORT   = 'territory-report.json';

async function readBlob(key) {
  try {
    const { blobs } = await list({ prefix: key });
    if (!blobs.length) return null;
    const resp = await fetch(blobs[0].url);
    return await resp.json();
  } catch { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET ──────────────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const type = req.query?.type || 'progress';

    try {
      if (type === 'report') {
        const data = await readBlob(BLOB_REPORT);
        return res.status(200).json({ ok: true, data });
      }

      // Fetch progress + matches in parallel and merge into one response
      const [progressData, matchesData] = await Promise.all([
        readBlob(BLOB_PROGRESS),
        readBlob(BLOB_MATCHES),
      ]);
      const data = (progressData || matchesData) ? {
        ...(progressData  || {}),
        ...(matchesData   || {}),
      } : null;
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

    // Report: requires upload key (admin only)
    if (body.reportData !== undefined) {
      const uploadKey  = req.headers['x-upload-key'];
      const expectedKey = process.env.UPLOAD_KEY;
      if (!expectedKey) {
        return res.status(500).json({ ok: false, error: 'Server misconfigured: UPLOAD_KEY not set' });
      }
      if (!uploadKey || uploadKey !== expectedKey) {
        return res.status(401).json({ ok: false, error: 'Invalid upload key' });
      }
      try {
        await put(BLOB_REPORT, JSON.stringify({
          reportData: body.reportData,
          savedAt: new Date().toISOString(),
        }), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('territory report POST error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to save report' });
      }
    }

    // Completed checkboxes — write directly, no read needed
    if (body.completed !== undefined) {
      try {
        await put(BLOB_PROGRESS, JSON.stringify({
          completed: body.completed,
          savedAt: new Date().toISOString(),
        }), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('territory progress POST error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to save progress' });
      }
    }

    // Match selections — write directly, no read needed
    if (body.matchSelections !== undefined) {
      try {
        await put(BLOB_MATCHES, JSON.stringify({
          matchSelections: body.matchSelections,
          savedAt: new Date().toISOString(),
        }), { access: 'public', contentType: 'application/json', addRandomSuffix: false });
        return res.status(200).json({ ok: true });
      } catch (err) {
        console.error('territory matches POST error:', err);
        return res.status(500).json({ ok: false, error: 'Failed to save selections' });
      }
    }

    return res.status(400).json({ ok: false, error: 'Unknown payload — expected completed, matchSelections, or reportData' });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
