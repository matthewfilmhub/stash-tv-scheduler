// api/auth.js — Passcode auth: validates passcode, sets/clears HTTP-only session cookie.
// Set SITE_PASSCODE in Vercel env vars to enable. If unset, auth is bypassed.
import crypto from 'crypto';

const COOKIE = 'stash_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

function makeToken(passcode) {
  const secret = process.env.SITE_AUTH_SECRET || process.env.UPLOAD_KEY || 'stash-auth-default';
  return crypto.createHash('sha256').update(passcode + ':' + secret).digest('hex');
}

function cookieHeader(token, maxAge = MAX_AGE) {
  return `${COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const PASSCODE = process.env.SITE_PASSCODE;

  // ── GET ?action=logout ──────────────────────────────────────────────
  if (req.method === 'GET' && req.query.action === 'logout') {
    res.setHeader('Set-Cookie', cookieHeader('', 0));
    return res.redirect(302, '/login');
  }

  // Auth disabled — pass through
  if (!PASSCODE) {
    return res.status(200).json({ ok: true, bypass: true });
  }

  // ── POST: validate passcode, set cookie ─────────────────────────────
  if (req.method === 'POST') {
    const { passcode } = req.body || {};
    if (!passcode) return res.status(400).json({ ok: false, error: 'No passcode provided' });

    if (passcode !== PASSCODE) {
      await new Promise(r => setTimeout(r, 500)); // slow brute-force
      return res.status(401).json({ ok: false, error: 'Incorrect passcode' });
    }

    res.setHeader('Set-Cookie', cookieHeader(makeToken(PASSCODE)));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ ok: false, error: 'Method not allowed' });
}
