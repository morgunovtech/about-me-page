// Loads a page's content document: KV first (site-scoped key `site:page`),
// falling back to the committed seed when KV is empty or unavailable.

import seed from '../../content.seed.json';

const SITE = 's.morgunov.tech';

// The only page keys the CMS manages. Used to validate untrusted ?page params
// so an authed request can't probe arbitrary site-scoped KV keys.
export const PAGES = new Set(['home', 'about', 'collaborate', 'uses']);

// Articles are addressed as the page key `article:<slug>` (so the existing
// content/save/history machinery keys them at `<site>:article:<slug>` and
// archives revisions under `<site>:article:<slug>:rev:<n>` for free).
const ARTICLE_PAGE_RE = /^article:[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isArticlePage(page) {
  return typeof page === 'string' && ARTICLE_PAGE_RE.test(page);
}
// A page key the admin APIs accept (static page or an article).
export function validPageKey(page) {
  return PAGES.has(page) || isArticlePage(page);
}

// Code-side fixes for KV content live in migrations.js (no seed import there).
import { fixStaleContent } from './migrations.js';

// Wraps both return paths — the KV doc and the seed fallback — so a code-side
// fix in migrations.js reaches whichever one serves the page.
export async function loadDoc(env, page) {
  return fixStaleContent(await loadDocRaw(env, page));
}

async function loadDocRaw(env, page) {
  const key = `${SITE}:${page}`;
  if (env && env.CONTENT) {
    try {
      const fromKv = await env.CONTENT.get(key, 'json');
      if (fromKv) return fromKv;
    } catch (e) {
      // KV unavailable — fall through to seed
    }
  }
  return (seed && seed[page]) || null;
}

// Live subscriber counts pushed by the SocialBot (or null if never pushed).
export async function loadSubscribers(env) {
  if (env && env.CONTENT) {
    try {
      return await env.CONTENT.get('stats:subscribers', 'json');
    } catch (e) {
      /* ignore */
    }
  }
  return null;
}
