// api/youtube-auth.js — OAuth 2.0 flow for YouTube Data API
import { list, del } from '@vercel/blob';
import { getStoredTokens, storeTokens } from './_youtube.js';

const TOKEN_BLOB = 'youtube-oauth-tokens.json';

const REDIRECT_URI = process.env.YOUTUBE_REDIRECT_URI
  || 'https://stash-tv-scheduler.vercel.app/api/youtube-auth';

const SCOPES = 'https://www.googleapis.com/auth/youtube.readonly';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, code, error } = req.query;

  // ── Generate OAuth URL ──────────────────────────────────────────────
  if (action === 'url') {
    if (!process.env.YOUTUBE_CLIENT_ID) {
      return res.status(503).json({ error: 'YOUTUBE_CLIENT_ID not configured in Vercel env vars' });
    }
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id:     process.env.YOUTUBE_CLIENT_ID,
      redirect_uri:  REDIRECT_URI,
      response_type: 'code',
      scope:         SCOPES,
      access_type:   'offline',
      prompt:        'consent', // ensures we always get a refresh_token
    });
    return res.status(200).json({ url });
  }

  // ── Check connection status ─────────────────────────────────────────
  if (action === 'status') {
    const tokens = await getStoredTokens();
    return res.status(200).json({ connected: !!tokens });
  }

  // ── Disconnect: delete stored tokens ───────────────────────────────
  if (action === 'disconnect') {
    try {
      const { blobs } = await list({ prefix: TOKEN_BLOB });
      if (blobs.length) await del(blobs[0].url);
    } catch (e) { /* already gone */ }
    return res.status(200).json({ ok: true });
  }

  // ── OAuth callback (Google redirects here with ?code=...) ───────────
  if (code) {
    if (error) {
      return res.redirect(302, `/?yt_error=${encodeURIComponent(error)}`);
    }
    try {
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id:     process.env.YOUTUBE_CLIENT_ID,
          client_secret: process.env.YOUTUBE_CLIENT_SECRET,
          redirect_uri:  REDIRECT_URI,
          grant_type:    'authorization_code',
        }),
      });
      const tokens = await tokenResp.json();
      if (tokens.error) {
        return res.redirect(302, `/?yt_error=${encodeURIComponent(tokens.error_description || tokens.error)}`);
      }
      tokens.expiry_date = Date.now() + tokens.expires_in * 1000;
      await storeTokens(tokens);
      return res.redirect(302, '/?yt_connected=1');
    } catch (err) {
      return res.redirect(302, `/?yt_error=${encodeURIComponent(err.message)}`);
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
}
