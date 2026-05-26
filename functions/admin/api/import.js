// Import a public Telegram post into a draft article. The admin pastes a
// t.me/<channel>/<id> link; we fetch ONLY the t.me embed (SSRF guard — the URL
// is never used as the fetch target directly, we rebuild it from the parsed
// channel+id), extract the message text + photo, sanitize, and create a draft.
import { json, sameOrigin } from '../../_lib/http.js';
import { sanitizeHtml } from '../../_lib/sanitize.js';
import { articleKey, INDEX_KEY, loadArticleIndex, makeArticleDoc, indexEntry } from '../../_lib/articles.js';
import { sniffType } from './upload.js';

const TME_RE = /^https?:\/\/(?:www\.)?t\.me\/([A-Za-z0-9_]{3,64})\/(\d{1,12})\b/;
const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/avif': 'avif' };

const TRANSLIT = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
export function slugify(s) {
  return String(s || '').toLowerCase().replace(/[а-яё]/g, (c) => TRANSLIT[c] ?? '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

export const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, '');
const decodeEntities = (s) => String(s)
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');

export function extractText(html) {
  // The message text block is followed by other tgme_widget_message_* divs.
  let m = html.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="tgme_widget_message_/);
  if (!m) m = html.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  return m ? m[1] : '';
}
function extractPhoto(html) {
  const m = html.match(/tgme_widget_message_photo_wrap[^"]*"[^>]*style="[^"]*background-image:url\('([^']+)'\)/);
  return m ? m[1] : '';
}
function extractDate(html) {
  const m = html.match(/<time[^>]*datetime="([^"]+)"/);
  return m ? m[1].slice(0, 10) : new Date().toISOString().slice(0, 10);
}

// Telegram message HTML → paragraphed HTML (sanitized afterwards). Inline tags
// (<b>/<i>/<a>/<code>…) survive; <br> runs become paragraph breaks.
export function tgToHtml(raw) {
  const s = raw.replace(/<br\s*\/?>/gi, '\n');
  return s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
}

async function storePhoto(env, url) {
  try {
    const host = new URL(url).hostname;
    // Only fetch Telegram's own CDN — never an arbitrary host.
    if (!/(?:^|\.)cdn-telegram\.org$|(?:^|\.)telegram\.org$|(?:^|\.)telesco\.pe$/.test(host)) return '';
    const r = await fetch(url);
    if (!r.ok) return '';
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 6 * 1024 * 1024) return '';
    const type = sniffType(buf);
    if (!type || !EXT[type]) return '';
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const hash = [...new Uint8Array(digest)].slice(0, 5).map((b) => b.toString(16).padStart(2, '0')).join('');
    const key = `articles/${hash}.${EXT[type]}`;
    await env.MEDIA.put(key, buf, { httpMetadata: { contentType: type, cacheControl: 'public, max-age=31536000, immutable' } });
    return '/assets/' + key;
  } catch {
    return '';
  }
}

// Relink a public channel post's photo by message id (archive import has no
// media bytes, but the channel is public): fetch the t.me embed → store in R2.
// Best-effort — returns '' on any failure.
export async function relinkChannelPhoto(env, channel, messageId) {
  try {
    const handle = String(channel || '').replace(/^@/, '');
    if (!/^[A-Za-z0-9_]{3,64}$/.test(handle)) return '';
    const r = await fetch(`https://t.me/${handle}/${messageId}?embed=1&mode=tme`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; morgunov.tech import)' },
    });
    if (!r.ok) return '';
    const photo = extractPhoto(await r.text());
    return photo ? await storePhoto(env, photo) : '';
  } catch {
    return '';
  }
}

async function uniqueSlug(env, base, id) {
  let slug = base || 'post-' + id;
  if (!(await env.CONTENT.get(articleKey(slug)))) return slug;
  slug = (base ? base + '-' : 'post-') + id;
  return slug;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const m = TME_RE.exec(String((body && body.url) || '').trim());
  if (!m) return json({ error: 'Ожидается ссылка вида https://t.me/<канал>/<id>' }, 400);
  const channel = m[1];
  const id = m[2];

  let pageHtml;
  try {
    const r = await fetch(`https://t.me/${channel}/${id}?embed=1&mode=tme`, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; morgunov.tech import)' },
    });
    if (!r.ok) return json({ error: 't.me вернул ' + r.status }, 502);
    pageHtml = await r.text();
  } catch {
    return json({ error: 'не удалось получить пост из t.me' }, 502);
  }

  const rawText = extractText(pageHtml);
  if (!rawText.trim()) return json({ error: 'не нашёл текст поста (приватный канал или только медиа?)' }, 422);

  const bodyHtml = await sanitizeHtml(tgToHtml(rawText));
  const plain = decodeEntities(stripTags(rawText.replace(/<br\s*\/?>/gi, '\n'))).trim();
  const firstLine = (plain.split('\n').find((l) => l.trim()) || '').trim();
  const title = firstLine.slice(0, 120) || `${channel}/${id}`;
  const coverSrc = await storePhoto(env, extractPhoto(pageHtml));
  const slug = await uniqueSlug(env, slugify(title), id);

  const doc = makeArticleDoc({
    slug,
    date: extractDate(pageHtml),
    title: { ru: title, en: '' },
    cover: { src: coverSrc, alt: { ru: '', en: '' } },
    body: { ru: bodyHtml, en: '' },
    source: { kind: 'imported', tme: `https://t.me/${channel}/${id}`, importedAt: new Date().toISOString() },
  });
  await env.CONTENT.put(articleKey(slug), JSON.stringify(doc));
  const idx = (await loadArticleIndex(env)) || [];
  idx.unshift(indexEntry(doc));
  await env.CONTENT.put(INDEX_KEY, JSON.stringify(idx));

  return json({ ok: true, slug });
}
