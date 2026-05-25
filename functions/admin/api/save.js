import { json, sameOrigin } from '../../_lib/http.js';

const SITE = 's.morgunov.tech';
const SECTION_IDS = ['about', 'career', 'help', 'ventures', 'products', 'publications', 'contact'];

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

  const errors = page === 'home' ? validateHome(doc) : [];
  if (errors.length) return json({ error: 'validation failed', details: errors }, 400);

  // Maintain freshness signals automatically.
  doc.rev = (typeof doc.rev === 'number' ? doc.rev : 0) + 1;
  doc.updatedAt = new Date().toISOString();
  doc.dateModified = doc.updatedAt.slice(0, 10);

  await env.CONTENT.put(`${SITE}:${page}`, JSON.stringify(doc));
  return json({ ok: true, rev: doc.rev, updatedAt: doc.updatedAt });
}
