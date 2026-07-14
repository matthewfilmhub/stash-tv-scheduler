// api/auth.js — Simple passcode-based auth for the Stash Content Tools
// Set SITE_PASSCODE in Vercel env vars to enable. If unset, auth is bypassed.
// Set SITE_AUTH_SECRET for token signing (falls back to UPLOAD_KEY if not set).
import crypto from 'crypto';

function makeToken(passcode) {
  const secret = process.env.SITE_AUTH_SECRET || process.env.UPLOAD_KEY || 'stash-auth-default';
  return crypto.createHash('sha256').update(passcode + ':' + secret).digest('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const PASSCODE = process.env.SITE_PASSCODE;

  // No passcode configured → auth is disabled, let everyone through
  if (!PASSCODE) {
    return res.status(200).json({ ok: true, bypass: true });
  }

  // ── GET: validate a stored token ─────────────────────────────────────
  if (req.method === 'GET') {
    const { token } = req.query;
    if (!token) return res.status(200).json({ ok: false });
    const expected = makeToken(PASSCODE);
    return res.status(200).json({ ok: token === expected });
  }

  // ── POST: validate passcode, return token ────────────────────────────
  if (req.method === 'POST') {
    const { passcode } = req.body || {};
    if (!passcode) return res.status(400).json({ ok: false, error: 'No passcode provided' });

    if (passcode !== PASSCODE) {
      // Small delay to slow brute-force attempts
      await new Promise(r => setTimeout(r, 500));
      return res.status(401).json({ ok: false, error: 'Incorrect passcode' });
    }

    return res.status(200).json({ ok: true, token: makeToken(PASSCODE) });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
