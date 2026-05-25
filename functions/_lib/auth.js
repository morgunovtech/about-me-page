// Auth primitives for the /admin zone — all via WebCrypto (no deps).
// Password: PBKDF2-HMAC-SHA256, stored as "pbkdf2$sha256$<iter>$<saltHex>$<hashHex>".
// Session: HMAC-SHA256 signed token "<b64url(payload)>.<b64url(sig)>", payload { exp }.

const enc = new TextEncoder();

export const SESSION_COOKIE = 'msess';
const SESSION_TTL = 7 * 24 * 60 * 60; // 7 days

function b64urlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fromHex(h) {
  const a = new Uint8Array(h.length / 2);
  for (let i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16);
  return a;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
}

export async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;
  const iterations = parseInt(parts[2], 10);
  const salt = fromHex(parts[3]);
  const expected = fromHex(parts[4]);
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    expected.length * 8
  );
  return timingSafeEqual(new Uint8Array(bits), expected);
}

export async function createSession(secret) {
  const payload = { exp: Math.floor(Date.now() / 1000) + SESSION_TTL };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await hmac(secret, body);
  return body + '.' + b64urlEncode(sig);
}

export async function verifySession(secret, token) {
  if (!secret || !token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  const expected = await hmac(secret, body);
  if (!timingSafeEqual(b64urlDecode(sig), expected)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
  } catch {
    return null;
  }
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// Reissue when the session is past half its lifetime, for a sliding window.
export function shouldRefresh(payload) {
  return payload.exp - Math.floor(Date.now() / 1000) < SESSION_TTL / 2;
}

export function sessionCookie(token) {
  return `${SESSION_COOKIE}=${token}; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`;
}

export function clearCookie() {
  return `${SESSION_COOKIE}=; Path=/admin; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function getCookie(request, name) {
  const header = request.headers.get('Cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'local';
}

// Login rate limit: max attempts per rolling window, counter in KV (rl:login:<ip>).
export async function loginRateLimit(env, ip, max = 8, windowSec = 600) {
  if (!env.CONTENT) return true;
  const key = `rl:login:${ip}`;
  const current = parseInt((await env.CONTENT.get(key)) || '0', 10);
  if (current >= max) return false;
  await env.CONTENT.put(key, String(current + 1), { expirationTtl: windowSec });
  return true;
}

export async function clearRateLimit(env, ip) {
  if (env.CONTENT) await env.CONTENT.delete(`rl:login:${ip}`);
}
