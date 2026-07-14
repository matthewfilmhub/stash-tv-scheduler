// middleware.js — Edge Middleware: runs on every request before content is served.
// Checks for a valid HTTP-only session cookie. If missing/invalid, redirects to /login.
// Set SITE_PASSCODE in Vercel env vars to enable. If unset, all traffic passes through.

const COOKIE = 'stash_session';

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k.trim() === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export default async function middleware(request) {
  const { pathname } = new URL(request.url);

  // Always pass through: login page, auth APIs, and Vercel internals.
  // /api/youtube-auth must be bypassed because Google redirects back to it
  // as a cross-site navigation — SameSite=Strict blocks the session cookie
  // on that first request, so the middleware would otherwise drop the OAuth code.
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/youtube-auth') ||
    pathname.startsWith('/_vercel')
  ) {
    return; // undefined = pass through
  }

  const PASSCODE = process.env.SITE_PASSCODE;

  // Auth disabled — pass everything through
  if (!PASSCODE) return;

  const token = getCookie(request, COOKIE);

  if (token) {
    const secret = process.env.SITE_AUTH_SECRET || process.env.UPLOAD_KEY || 'stash-auth-default';
    const expected = await sha256hex(PASSCODE + ':' + secret);
    if (token === expected) return; // valid — pass through
  }

  // Not authenticated — redirect to login
  return Response.redirect(new URL('/login', request.url), 302);
}

export const config = {
  matcher: ['/((?!_vercel|favicon\\.ico).*)'],
};
