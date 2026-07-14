// api/notion-sync.js — Syncs Copyright Claim flags from Notion HIT tracker database
import { put, list } from '@vercel/blob';

export const config = { maxDuration: 60 };

const NOTION_DB_ID = 'a355e03e-e63a-4ca8-8880-aaa469f6b370';

function extractVideoId(url) {
  if (!url) return null;
  const m = url.match(/[?&]v=([^&]+)/) || url.match(/youtu\.be\/([^?]+)/);
  return m ? m[1] : null;
}

function normTitle(t) {
  return t.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const configured = !!process.env.NOTION_TOKEN;

  // ── GET: return status ─────────────────────────────────────────────────
  if (req.method === 'GET') {
    let lastSync = null;
    let rowCount = null;
    try {
      const { blobs } = await list({ prefix: 'notion-cic.json' });
      if (blobs.length) {
        const resp = await fetch(blobs[0].url);
        const data = await resp.json();
        lastSync = data.syncedAt || null;
        rowCount = data.rowCount != null ? data.rowCount : null;
      }
    } catch (e) { /* blob not found or unreadable */ }

    return res.status(200).json({ configured, lastSync, rowCount });
  }

  // ── POST: run full sync ────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!configured) {
    return res.status(503).json({ ok: false, error: 'NOTION_TOKEN not configured' });
  }

  const token = process.env.NOTION_TOKEN;
  const rows = [];
  let cursor = undefined;
  let hasMore = true;

  while (hasMore) {
    const body = cursor ? { start_cursor: cursor } : {};
    const resp = await fetch(
      `https://api.notion.com/v1/databases/${NOTION_DB_ID}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(502).json({ ok: false, error: `Notion API error: ${resp.status} ${errText}` });
    }

    const data = await resp.json();

    for (const page of data.results || []) {
      const props = page.properties || {};
      const title = props['Title Name']?.title?.map(t => t.plain_text).join('') || '';
      const hasCIC = props['Copyright Claims?']?.checkbox === true;
      const hasMusicCIC = props['Music Copyright Claims?']?.checkbox === true;
      const ytUrl = props['YouTube URL']?.url || '';
      const restrictions = props['Restrictions']?.multi_select || [];
      const isAgeRestricted = restrictions.some(r => /age.?restrict/i.test(r.name));

      rows.push({ title, hasCIC, hasMusicCIC, ytUrl, isAgeRestricted });
    }

    hasMore = data.has_more;
    cursor = data.next_cursor;
  }

  // Build lookup maps
  const byVideoId = {};
  const byTitle = {};

  for (const row of rows) {
    const entry = {
      hasCIC: row.hasCIC,
      hasMusicCIC: row.hasMusicCIC,
      isAgeRestricted: row.isAgeRestricted,
      title: row.title,
    };

    const videoId = extractVideoId(row.ytUrl);
    if (videoId) byVideoId[videoId] = entry;

    const key = normTitle(row.title);
    if (key) byTitle[key] = entry;
  }

  const syncedAt = new Date().toISOString();
  const payload = { byVideoId, byTitle, rowCount: rows.length, syncedAt };

  await put('notion-cic.json', JSON.stringify(payload), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });

  return res.status(200).json({ ok: true, rowCount: rows.length, syncedAt });
}
