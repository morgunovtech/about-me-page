// Article store. KV keys: `<site>:article:<slug>` for each article doc and
// `<site>:articles` for the lightweight index used by the feed/sitemap.
const SITE = 's.morgunov.tech';

// Slugs become URL segments and KV keys, so keep them strict.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function validSlug(s) {
  return typeof s === 'string' && s.length >= 1 && s.length <= 80 && SLUG_RE.test(s);
}

export const articleKey = (slug) => `${SITE}:article:${slug}`;
export const INDEX_KEY = `${SITE}:articles`;

export async function loadArticle(env, slug) {
  if (!validSlug(slug) || !env || !env.CONTENT) return null;
  try {
    return await env.CONTENT.get(articleKey(slug), 'json');
  } catch {
    return null;
  }
}

// Index entries: { slug, title:{ru,en}, excerpt:{ru,en}, date, status, cover }.
export async function loadArticleIndex(env) {
  if (!env || !env.CONTENT) return [];
  try {
    return (await env.CONTENT.get(INDEX_KEY, 'json')) || [];
  } catch {
    return [];
  }
}

// Published, newest first — what the public feed/sitemap/index show.
export function publishedSorted(index) {
  return (index || [])
    .filter((a) => a && a.status === 'published')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

const today = () => new Date().toISOString().slice(0, 10);
const loc = () => ({ ru: '', en: '' });

// Single source of truth for the article doc shape — used by create (blank),
// t.me import, and archive import, so the three paths can't drift.
export function makeArticleDoc(p = {}) {
  return {
    slug: p.slug,
    status: p.status || 'draft',
    date: p.date || today(),
    title: p.title || loc(),
    excerpt: p.excerpt || loc(),
    cover: p.cover || { src: '', alt: loc() },
    body: p.body || loc(),
    meta: p.meta || { title: loc(), description: loc() },
    share: p.share || { image: loc(), title: loc(), description: loc() },
    ...(p.source ? { source: p.source } : {}),
    rev: 0,
  };
}

// The feed/sitemap index row derived from a doc. One definition (was duplicated
// in save.js and three endpoints).
export function indexEntry(doc) {
  return {
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt || loc(),
    date: doc.date || '',
    status: doc.status || 'draft',
    cover: doc.cover && doc.cover.src ? { src: doc.cover.src } : null,
    updatedAt: doc.updatedAt || new Date().toISOString(),
  };
}
