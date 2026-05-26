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

// Sniff the real format from magic bytes so a mislabeled file can't be stored
// under a trusted content-type. Returns the detected MIME or null.
export function sniffType(buf) {
  const b = new Uint8Array(buf);
  const ascii = (off, str) => str.split('').every((c, i) => b[off + i] === c.charCodeAt(0));
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (ascii(0, 'GIF8')) return 'image/gif';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(4, 'ftyp') && (ascii(8, 'avif') || ascii(8, 'avis'))) return 'image/avif';
  // SVG is text: skip BOM/whitespace, then expect '<' and an <svg somewhere early.
  const head = new TextDecoder().decode(b.slice(0, 512)).replace(/^﻿/, '').trimStart();
  if (head.startsWith('<') && /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);

  const form = await request.formData().catch(() => null);
  const file = form && form.get('file');
  if (!file || typeof file === 'string') return json({ error: 'no file' }, 400);

  const declared = file.type || '';
  if (!EXT[declared]) return json({ error: 'unsupported type: ' + declared }, 415);

  const buf = await file.arrayBuffer();
  if (buf.byteLength > MAX_BYTES) return json({ error: 'file too large (max 6 MB)' }, 413);

  // Trust the bytes, not the client label: the stored content-type comes from
  // the sniff, and it must be a permitted image that matches the declared type.
  const type = sniffType(buf);
  if (!type || !EXT[type]) return json({ error: 'file content is not a supported image' }, 415);
  if (type !== declared) return json({ error: `content/type mismatch (declared ${declared}, got ${type})` }, 415);
  const ext = EXT[type];

  const folder = String(form.get('folder') || 'uploads').replace(/[^a-z0-9_-]/gi, '') || 'uploads';
  const key = `${folder}/${await shortHash(buf)}.${ext}`;

  await env.MEDIA.put(key, buf, {
    httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' },
  });

  return json({ ok: true, path: '/assets/' + key });
}
