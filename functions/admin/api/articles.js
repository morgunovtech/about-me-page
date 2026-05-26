// Article management (session-gated by /admin middleware).
//   GET                      → { articles: <index> }
//   POST {op:'create',slug,title} → make a blank draft, return { slug }
//   POST {op:'delete',slug}       → remove doc, revisions, and index entry
// Editing/saving an article reuses /admin/api/{content,save,history} with the
// page key `article:<slug>`.
import { json, sameOrigin } from '../../_lib/http.js';
import { loadArticleIndex, articleKey, INDEX_KEY, validSlug } from '../../_lib/articles.js';

const today = () => new Date().toISOString().slice(0, 10);

function blankArticle(slug, titleRu) {
  return {
    slug,
    status: 'draft',
    date: today(),
    title: { ru: titleRu || '', en: '' },
    excerpt: { ru: '', en: '' },
    cover: { src: '', alt: { ru: '', en: '' } },
    body: { ru: '', en: '' },
    meta: { title: { ru: '', en: '' }, description: { ru: '', en: '' } },
    share: { image: { ru: '', en: '' }, title: { ru: '', en: '' }, description: { ru: '', en: '' } },
    rev: 0,
  };
}

export async function onRequestGet({ env }) {
  return json({ articles: await loadArticleIndex(env) });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const op = body && body.op;
  const slug = body && body.slug;
  if (!validSlug(slug)) return json({ error: 'invalid slug' }, 400);

  if (op === 'create') {
    const existing = await env.CONTENT.get(articleKey(slug));
    if (existing) return json({ error: 'slug already exists' }, 409);
    const doc = blankArticle(slug, body.title);
    await env.CONTENT.put(articleKey(slug), JSON.stringify(doc));
    const idx = (await loadArticleIndex(env)) || [];
    idx.unshift({ slug, title: doc.title, excerpt: doc.excerpt, date: doc.date, status: 'draft', cover: null, updatedAt: new Date().toISOString() });
    await env.CONTENT.put(INDEX_KEY, JSON.stringify(idx));
    return json({ ok: true, slug });
  }

  if (op === 'delete') {
    await env.CONTENT.delete(articleKey(slug));
    // Drop archived revisions too.
    try {
      const revsKey = `${articleKey(slug)}:revs`;
      const revs = (await env.CONTENT.get(revsKey, 'json')) || [];
      for (const r of revs) await env.CONTENT.delete(`${articleKey(slug)}:rev:${r.rev}`);
      await env.CONTENT.delete(revsKey);
    } catch {
      /* best-effort */
    }
    const idx = (await loadArticleIndex(env)) || [];
    await env.CONTENT.put(INDEX_KEY, JSON.stringify(idx.filter((a) => a && a.slug !== slug)));
    return json({ ok: true });
  }

  return json({ error: 'unknown op' }, 400);
}
