// Subscriber-count ingest. The SocialBot (Railway) pushes here on its own
// schedule. Token-authenticated (no cookies, no session). The site only reads
// stats:subscribers; the bot only writes it.
import { json } from '../../_lib/http.js';

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function nonNegInt(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

export async function onRequestPost({ request, env }) {
  const provided =
    (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '') ||
    request.headers.get('X-Ingest-Token') ||
    '';
  if (!env.SOCIALBOT_INGEST_TOKEN || !safeEqual(provided, env.SOCIALBOT_INGEST_TOKEN)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const telegram = nonNegInt(body.telegram);
  const youtube = nonNegInt(body.youtube);
  const linkedin = nonNegInt(body.linkedin);
  if (telegram === null || youtube === null || linkedin === null) {
    return json({ error: 'telegram, youtube, linkedin must be non-negative numbers' }, 400);
  }

  const record = {
    telegram,
    youtube,
    linkedin,
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : new Date().toISOString(),
  };
  await env.CONTENT.put('stats:subscribers', JSON.stringify(record));
  return json({ ok: true, stored: record });
}
