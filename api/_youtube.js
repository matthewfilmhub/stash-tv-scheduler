// api/_youtube.js — shared YouTube OAuth utilities (not a route — underscore prefix)
import { put, list } from '@vercel/blob';

const TOKEN_BLOB = 'youtube-oauth-tokens.json';

export async function getStoredTokens() {
  try {
    const { blobs } = await list({ prefix: TOKEN_BLOB });
    if (!blobs.length) return null;
    const resp = await fetch(blobs[0].url);
    return await resp.json();
  } catch { return null; }
}

export async function storeTokens(tokens) {
  await put(TOKEN_BLOB, JSON.stringify(tokens), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
  });
}

export async function getValidAccessToken() {
  let tokens = await getStoredTokens();
  if (!tokens) throw new Error('not_authenticated');

  // Refresh if expiring within 60 seconds
  if (Date.now() > (tokens.expiry_date || 0) - 60000) {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.YOUTUBE_CLIENT_ID,
        client_secret: process.env.YOUTUBE_CLIENT_SECRET,
        refresh_token: tokens.refresh_token,
        grant_type:    'refresh_token',
      }),
    });
    const data = await resp.json();
    if (data.error) throw new Error(data.error_description || data.error);
    tokens = {
      ...tokens,
      access_token: data.access_token,
      expiry_date: Date.now() + data.expires_in * 1000,
    };
    await storeTokens(tokens);
  }

  return tokens.access_token;
}

export async function ytFetch(accessToken, path) {
  const resp = await fetch(`https://www.googleapis.com/youtube/v3/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await resp.json();
  if (!resp.ok || data.error) {
    throw new Error(data.error?.message || `YouTube API error ${resp.status}`);
  }
  return data;
}
