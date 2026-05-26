import { json, sameOrigin } from '../../_lib/http.js';
import { PAGES } from '../../_lib/content.js';

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
  if (!PAGES.has(page)) return json({ error: 'unknown page' }, 400);

  const errors = page === 'home' ? validateHome(doc) : [];
  if (errors.length) return json({ error: 'validation failed', details: errors }, 400);

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
