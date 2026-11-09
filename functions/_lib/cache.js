// Edge cache for Function-rendered GET responses. Pages never caches Function
// output at the CDN by itself, so every visit paid a worker run + KV reads.
// caches.default keeps a rendered copy per URL for EDGE_TTL seconds — but it
// is per data center, so a purge only reaches the colo that ran it. Global
// invalidation comes from a content version in KV (bumped on every write,
// part of the cache key): other colos pick the new version up as KV
// propagates (~60 s), and old entries simply age out.
import { ORIGIN } from './site.js';

export const EDGE_TTL = 300;
export const VERSION_KEY = 'content:version';

// One cheap KV read per request (KV caches it at the edge); '' when KV is absent.
async function contentVersion(env) {
  try {
    return (env && env.CONTENT && (await env.CONTENT.get(VERSION_KEY))) || '';
  } catch {
    return '';
  }
}

// URLs a page's content feeds (purged together on save).
export const PAGE_PATHS = {
  home: ['/', '/en/', '/llms.txt', '/sitemap.xml'],
  collaborate: ['/collaborate', '/en/collaborate', '/sitemap.xml'],
  about: ['/about', '/en/about', '/sitemap.xml'],
  uses: ['/uses', '/en/uses', '/sitemap.xml'],
};
// The homepage shows the three newest feed entries, so a notes change purges it too.
export const NOTES_PATHS = ['/notes', '/en/notes', '/', '/en/', '/sitemap.xml', '/notes/feed.xml', '/en/notes/feed.xml'];
export const articlePaths = (slug) => ['/notes/' + slug, '/en/notes/' + slug, ...NOTES_PATHS];

const edge = () => {
  try {
    return caches.default || null;
  } catch {
    return null;
  }
};

// Cache key: origin + collapsed pathname (+ content version), no query and no
// method — so purges by path always hit, ?utm= variants share one copy and
// «//uses» can't grow its own never-purged entry.
export function cacheKey(request, path, version = '') {
  const u = new URL(request.url);
  const p = (path || u.pathname).replace(/\/{2,}/g, '/');
  return new Request(u.origin + p + (version ? `?cv=${encodeURIComponent(version)}` : ''), { method: 'GET' });
}

// Serve from the edge cache when possible, else render and store the copy.
// Only GET 200s without Set-Cookie are stored. The route's own Cache-Control
// is kept and gains s-maxage; both the stored copy and the returned response
// carry the same headers plus x-edge-cache: HIT | MISS.
export async function cached(ctx, render) {
  const { request, env } = ctx;
  const cache = request.method === 'GET' ? edge() : null;
  const key = cache && cacheKey(request, null, await contentVersion(env));
  if (cache) {
    const hit = await cache.match(key);
    if (hit) {
      const h = new Headers(hit.headers);
      h.set('x-edge-cache', 'HIT');
      return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers: h });
    }
  }
  const res = await render();
  if (!cache || !res || res.status !== 200 || res.headers.has('set-cookie')) return res;
  const headers = new Headers(res.headers);
  const cc = headers.get('cache-control') || 'public, max-age=60, stale-while-revalidate=86400';
  headers.set('Cache-Control', /s-maxage=/i.test(cc) ? cc : cc.replace(/^public,?\s*/i, `public, s-maxage=${EDGE_TTL}, `));
  headers.set('x-edge-cache', 'MISS');
  const copy = new Response(res.clone().body, { status: res.status, statusText: res.statusText, headers });
  const put = cache.put(key, copy);
  if (ctx.waitUntil) ctx.waitUntil(put);
  else await put;
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// Invalidate: bump the content version (global, via KV) and drop the local
// colo's copies for the given paths (immediate where the write happened).
export async function purge(request, paths, env) {
  if (env && env.CONTENT) {
    try {
      await env.CONTENT.put(VERSION_KEY, String(Date.now()));
    } catch {
      /* KV unavailable: local delete below still runs */
    }
  }
  const cache = edge();
  if (!cache) return;
  const origins = new Set([ORIGIN]);
  try {
    origins.add(new URL(request.url).origin);
  } catch {
    /* no request origin */
  }
  const version = await contentVersion(env);
  const keys = [...origins].flatMap((o) => paths.flatMap((p) => [o + p, version ? `${o}${p}?cv=${encodeURIComponent(version)}` : null].filter(Boolean)));
  await Promise.all(keys.map((k) => cache.delete(new Request(k, { method: 'GET' })).catch(() => false)));
}
