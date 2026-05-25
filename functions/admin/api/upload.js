import { json, sameOrigin } from '../../_lib/http.js';

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB
const EXT = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
};

async function shortHash(buf) {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)]
    .slice(0, 5)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);

  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'no file' }, 400);

  const type = file.type || '';
  const ext = EXT[type];
  if (!ext) return json({ error: 'unsupported type: ' + type }, 415);

  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return json({ error: 'file too large (max 6 MB)' }, 413);

  const folder = String(form.get('folder') || 'uploads').replace(/[^a-z0-9_-]/gi, '') || 'uploads';
  const key = `${folder}/${await shortHash(buf)}.${ext}`;

  await env.MEDIA.put(key, buf, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  return json({ ok: true, path: '/assets/' + key });
}
