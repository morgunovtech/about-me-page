// Loads a page's content document: KV first (site-scoped key `site:page`),
// falling back to the committed seed when KV is empty or unavailable.

import seed from '../../content.seed.json';

const SITE = 's.morgunov.tech';

export async function loadDoc(env, page) {
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
