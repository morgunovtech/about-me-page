// Flow A — batch import of a Telegram channel archive (Telegram Desktop
// result.json) into the needs-review draft queue. Session-gated + same-origin.
// Idempotent: dedup by source message id (guard key), so re-running resumes
// rather than duplicating. Processes up to `limit` NEW posts per call and
// returns `remaining` so the client can loop until done.
import { json, sameOrigin } from '../../_lib/http.js';
import { parseArchive } from '../../_lib/dist/tg-import.js';
import { sanitizeHtml } from '../../_lib/sanitize.js';
import { articleKey, INDEX_KEY, loadArticleIndex, makeArticleDoc, indexEntry } from '../../_lib/articles.js';
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
  // Validate the handle before it ever reaches a KV key or a fetch URL.
  if (handle && !/^[A-Za-z0-9_]{3,64}$/.test(handle)) return json({ error: 'bad channel handle' }, 400);
  const relinkMedia = body.relinkMedia !== false && !!handle;
  // Each relink does 2 fetch subrequests (embed + photo); Cloudflare's free tier
  // caps fetch subrequests at 50/request, so keep the batch well under that when
  // relinking. Without relink we can take a bigger bite.
  const cap = relinkMedia ? 15 : 100;
  const limit = Math.min(Math.max(parseInt(body.limit, 10) || cap, 1), cap);

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

    const doc = makeArticleDoc({
      slug,
      status: 'needs-review',
      date: p.date,
      title: { ru: p.title || `${handle || 'tg'}/${p.messageId}`, en: '' },
      cover: { src: coverSrc, alt: { ru: '', en: '' } },
      body: { ru: bodyHtml, en: '' },
      source: { kind: 'imported', tg: { channel: handle, messageId: p.messageId } },
    });
    await env.CONTENT.put(articleKey(slug), JSON.stringify(doc));
    if (handle) await env.CONTENT.put(guardKey(handle, p.messageId), slug);
    idx.unshift(indexEntry(doc));
    known.add(slug);
    created++;
  }
  await env.CONTENT.put(INDEX_KEY, JSON.stringify(idx));
  return json({ ok: true, created, skipped, remaining, total: posts.length });
}
