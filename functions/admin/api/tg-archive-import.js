// Flow A — batch import of a Telegram channel archive (Telegram Desktop
// result.json) into the needs-review draft queue. Session-gated + same-origin.
// Idempotent: dedup by source message id (guard key), so re-running resumes
// rather than duplicating. Processes up to `limit` NEW posts per call and
// returns `remaining` so the client can loop until done.
import { json, sameOrigin } from '../../_lib/http.js';
import { parseArchive } from '../../_lib/dist/tg-import.js';
import { sanitizeHtml } from '../../_lib/sanitize.js';
import { articleKey, INDEX_KEY, loadArticleIndex } from '../../_lib/articles.js';
import { relinkChannelPhoto, slugify } from './import.js';

const SITE = 's.morgunov.tech';
const guardKey = (handle, id) => `${SITE}:tgimport:${handle}:${id}`;

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const channel = String((body && body.channel) || env.TELEGRAM_CHANNEL || '').trim();
  const handle = channel.replace(/^@/, '');
  const relinkMedia = body.relinkMedia !== false && !!handle;
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || 40, 1), 200);

  const posts = parseArchive(body.export || body);
  const idx = (await loadArticleIndex(env)) || [];
  const known = new Set(idx.map((a) => a.slug));

  let created = 0, skipped = 0, processed = 0, remaining = 0;
  for (const p of posts) {
    // Dedup by source message id (idempotent re-import).
    if (handle && (await env.CONTENT.get(guardKey(handle, p.messageId)))) { skipped++; continue; }
    if (processed >= limit) { remaining++; continue; }
    processed++;

    let slug = slugify(p.title) || 'post-' + p.messageId;
    if (known.has(slug) || (await env.CONTENT.get(articleKey(slug)))) slug = slug + '-' + p.messageId;

    const bodyHtml = await sanitizeHtml(p.html); // external content → sanitize
    let coverSrc = '';
    if (relinkMedia && p.photo) coverSrc = await relinkChannelPhoto(env, channel, p.messageId);

    const doc = {
      slug,
      status: 'needs-review',
      date: p.date || new Date().toISOString().slice(0, 10),
      title: { ru: p.title || `${handle || 'tg'}/${p.messageId}`, en: '' },
      excerpt: { ru: '', en: '' },
      cover: { src: coverSrc, alt: { ru: '', en: '' } },
      body: { ru: bodyHtml, en: '' },
      meta: { title: { ru: '', en: '' }, description: { ru: '', en: '' } },
      share: { image: { ru: '', en: '' }, title: { ru: '', en: '' }, description: { ru: '', en: '' } },
      source: { kind: 'imported', tg: { channel: handle, messageId: p.messageId } },
      rev: 0,
    };
    await env.CONTENT.put(articleKey(slug), JSON.stringify(doc));
    if (handle) await env.CONTENT.put(guardKey(handle, p.messageId), slug);
    idx.unshift({ slug, title: doc.title, excerpt: doc.excerpt, date: doc.date, status: 'needs-review', cover: coverSrc ? { src: coverSrc } : null, updatedAt: new Date().toISOString() });
    known.add(slug);
    created++;
  }
  await env.CONTENT.put(INDEX_KEY, JSON.stringify(idx));
  return json({ ok: true, created, skipped, remaining, total: posts.length });
}
