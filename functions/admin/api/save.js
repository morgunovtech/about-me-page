import { json, sameOrigin } from '../../_lib/http.js';
import { validPageKey, isArticlePage } from '../../_lib/content.js';
import { INDEX_KEY, indexEntry } from '../../_lib/articles.js';
import { sanitizeHtml, sanitizeButtons } from '../../_lib/sanitize.js';

const SITE = 's.morgunov.tech';
// Keys whose values are bound to attributes (href/src) or already escaped at
// render time (alt) — never run them through the HTML sanitizer, or they'd be
// double-encoded. Everything else under sections/* is emitted raw by render.js
// and IS a trust boundary.
const SANITIZE_SKIP_KEYS = new Set(['href', 'image', 'src', 'url', 'alt']);

// Recursively sanitize every string leaf, skipping url/alt keys. Used for the
// uses/collaborate structured docs, whose text fields (tag/name/desc/prose/…)
// render.js emits as raw HTML (they legitimately carry &nbsp; / <strong> / <code>).
async function sanitizeLeaves(node) {
  if (typeof node === 'string') return sanitizeHtml(node);
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) node[i] = await sanitizeLeaves(node[i]);
    return node;
  }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      if (SANITIZE_SKIP_KEYS.has(k)) continue;
      node[k] = await sanitizeLeaves(node[k]);
    }
    return node;
  }
  return node;
}
const SECTION_IDS = ['about', 'career', 'help', 'ventures', 'products', 'publications', 'contact'];
const HISTORY_MAX = 20; // keep the last N revisions per page

// Structural validation so a malformed import can't break the public page.
// Mirrors what render.js/jsonld.js dereference without guards: every list the
// renderers .map() over and the seo block the JSON-LD graph is built from.
function validateHome(doc) {
  const e = [];
  if (!doc || typeof doc !== 'object') return ['doc is not an object'];
  if (!doc.meta || !doc.meta.title) e.push('missing meta.title');
  if (!doc.hero || typeof doc.hero !== 'object') e.push('missing hero');
  else if (!Array.isArray(doc.hero.ctas)) e.push('hero.ctas must be an array');
  if (!Array.isArray(doc.stats)) e.push('stats must be an array');
  if (!doc.seo || typeof doc.seo !== 'object') e.push('missing seo');
  else if (!doc.seo.worksFor || typeof doc.seo.worksFor !== 'object') e.push('missing seo.worksFor');
  if (!doc.sections || typeof doc.sections !== 'object') e.push('missing sections');
  else {
    for (const id of SECTION_IDS) if (!doc.sections[id]) e.push('missing section: ' + id);
    const lists = [
      ['career', 'items'],
      ['ventures', 'items'],
      ['products', 'items'],
      ['publications', 'items'],
      ['help', 'blocks'],
      ['contact', 'ctas'],
    ];
    for (const [id, key] of lists) {
      const sec = doc.sections[id];
      if (sec && !Array.isArray(sec[key])) e.push(`sections.${id}.${key} must be an array`);
    }
    // "{telegram} в Telegram"-style metas resolve against the subscribers stat
    // (or live KV) — without that stat the placeholder would render empty.
    const pubs = doc.sections.publications && Array.isArray(doc.sections.publications.items) ? doc.sections.publications.items : [];
    const usesCounters = pubs.some((it) => it && it.meta && ['ru', 'en'].some((l) => /\{(telegram|linkedin|youtube|total)\}/.test(String(it.meta[l] || ''))));
    if (usesCounters && Array.isArray(doc.stats)) {
      const st = doc.stats.find((x) => x && x.kind === 'subscribers');
      if (!st || !st.channels || !st.channels.telegram) e.push('publications meta uses {counter} placeholders but stats has no subscribers entry with channels');
    }
  }
  return e;
}

function validateArticle(doc, slug) {
  const e = [];
  if (!doc || typeof doc !== 'object') return ['doc is not an object'];
  if (!doc.title || typeof doc.title !== 'object') e.push('missing title');
  if (!doc.body || typeof doc.body !== 'object') e.push('missing body');
  if (!['draft', 'needs-review', 'published'].includes(doc.status)) e.push('status must be draft|needs-review|published');
  if (doc.slug && doc.slug !== slug) e.push('slug mismatch');
  return e;
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

  // about edits its section bodies inline (contenteditable), so those HTML
  // fields are a trust boundary — sanitize them on save.
  if (page === 'about') {
    for (const sk of Object.keys(doc.sections || {})) {
      const body = doc.sections[sk] && doc.sections[sk].body;
      if (body && typeof body === 'object') {
        for (const l of ['ru', 'en']) {
          if (typeof body[l] === 'string') body[l] = await sanitizeHtml(body[l]);
        }
      }
    }
  }

  // uses/collaborate are structured docs whose text fields render.js emits RAW
  // (they carry inline HTML), so they're a trust boundary too. Sanitize every
  // string leaf under sections/*; the hero.ctas are styled <a> markup, so they
  // get the button-aware sanitizer (keeps class, strips scripts/handlers).
  if (page === 'uses' || page === 'collaborate') {
    const ctas = doc.hero && doc.hero.ctas;
    if (ctas && typeof ctas === 'object') {
      for (const l of ['ru', 'en']) {
        if (typeof ctas[l] === 'string') ctas[l] = await sanitizeButtons(ctas[l]);
      }
    }
    if (doc.sections && typeof doc.sections === 'object') {
      doc.sections = await sanitizeLeaves(doc.sections);
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
