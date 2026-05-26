import { json, sameOrigin } from '../../_lib/http.js';
import { validPageKey, isArticlePage } from '../../_lib/content.js';
import { INDEX_KEY } from '../../_lib/articles.js';
import { sanitizeHtml } from '../../_lib/sanitize.js';

const SITE = 's.morgunov.tech';
const SECTION_IDS = ['about', 'career', 'help', 'ventures', 'products', 'publications', 'contact'];
const HISTORY_MAX = 20; // keep the last N revisions per page

// Light structural validation so a malformed import can't break the public page.
function validateHome(doc) {
  const e = [];
  if (!doc || typeof doc !== 'object') return ['doc is not an object'];
  if (!doc.meta || !doc.meta.title) e.push('missing meta.title');
  if (!doc.hero || typeof doc.hero !== 'object') e.push('missing hero');
  if (!Array.isArray(doc.stats)) e.push('stats must be an array');
  if (!doc.sections || typeof doc.sections !== 'object') e.push('missing sections');
  else for (const id of SECTION_IDS) if (!doc.sections[id]) e.push('missing section: ' + id);
  return e;
}

function validateArticle(doc, slug) {
  const e = [];
  if (!doc || typeof doc !== 'object') return ['doc is not an object'];
  if (!doc.title || typeof doc.title !== 'object') e.push('missing title');
  if (!doc.body || typeof doc.body !== 'object') e.push('missing body');
  if (doc.status !== 'draft' && doc.status !== 'published') e.push('status must be draft|published');
  if (doc.slug && doc.slug !== slug) e.push('slug mismatch');
  return e;
}

// Index entry surfaced in the feed/sitemap — derived from the saved doc.
function indexEntry(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt || { ru: '', en: '' },
    date: doc.date || '',
    status: doc.status || 'draft',
    cover: doc.cover && doc.cover.src ? { src: doc.cover.src } : null,
    updatedAt: doc.updatedAt,
  };
}

async function upsertIndex(env, doc) {
  let idx = [];
  try {
    idx = (await env.CONTENT.get(INDEX_KEY, 'json')) || [];
  } catch {
    /* start fresh */
  }
  const i = idx.findIndex((a) => a && a.slug === doc.slug);
  const entry = indexEntry(doc);
  if (i >= 0) idx[i] = entry;
  else idx.unshift(entry);
  await env.CONTENT.put(INDEX_KEY, JSON.stringify(idx));
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const { page, doc } = body || {};
  if (!page || !doc) return json({ error: 'missing page or doc' }, 400);
  if (!validPageKey(page)) return json({ error: 'unknown page' }, 400);

  const article = isArticlePage(page);
  const slug = article ? page.slice('article:'.length) : null;
  const errors = page === 'home' ? validateHome(doc) : article ? validateArticle(doc, slug) : [];
  if (errors.length) return json({ error: 'validation failed', details: errors }, 400);

  // Article body HTML is the trust boundary: sanitize both languages
  // server-side before persisting (editor output / imported t.me HTML).
  if (article) {
    doc.slug = slug;
    if (doc.body && typeof doc.body === 'object') {
      for (const l of ['ru', 'en']) {
        if (typeof doc.body[l] === 'string') doc.body[l] = await sanitizeHtml(doc.body[l]);
      }
    }
  }

  // Monotonic rev: bump past whatever is currently stored, so saving a restored
  // older revision can't collide with a newer rev number.
  let base = typeof doc.rev === 'number' ? doc.rev : 0;
  try {
    const cur = await env.CONTENT.get(`${SITE}:${page}`, 'json');
    if (cur && typeof cur.rev === 'number') base = Math.max(base, cur.rev);
  } catch (e) {
    /* fall back to doc.rev */
  }
  doc.rev = base + 1;
  doc.updatedAt = new Date().toISOString();
  doc.dateModified = doc.updatedAt.slice(0, 10);

  await env.CONTENT.put(`${SITE}:${page}`, JSON.stringify(doc));

  // Keep the article index (feed/sitemap source) in sync with this save.
  if (article) {
    try {
      await upsertIndex(env, doc);
    } catch {
      /* index is derived; a save must not fail on it */
    }
  }

  // Archive this revision for version history (best-effort — never fail a save).
  try {
    await env.CONTENT.put(`${SITE}:${page}:rev:${doc.rev}`, JSON.stringify(doc));
    const idxKey = `${SITE}:${page}:revs`;
    let idx = (await env.CONTENT.get(idxKey, 'json')) || [];
    idx.unshift({ rev: doc.rev, updatedAt: doc.updatedAt });
    const pruned = idx.slice(HISTORY_MAX);
    idx = idx.slice(0, HISTORY_MAX);
    await env.CONTENT.put(idxKey, JSON.stringify(idx));
    for (const old of pruned) await env.CONTENT.delete(`${SITE}:${page}:rev:${old.rev}`);
  } catch (e) {
    /* history is best-effort; the save itself already succeeded */
  }

  return json({ ok: true, rev: doc.rev, updatedAt: doc.updatedAt });
}
