// IndexNow (indexnow.org): one POST tells Bing, Yandex and the other engines
// that share the protocol which pages changed, so they come for them now
// instead of on their next pass over the sitemap. Google does not take part;
// it reads the sitemap.
//
// The key is public by design: the engines check that it is served as
// /<key>.txt on this host (the file sits at the repo root and _routes.json
// keeps it off Functions). Whoever knows it can only ask the engines to crawl
// our own pages.
//
// Only real content writes announce (an /admin Save of a page, a published
// note saved or deleted) — never the subscriber ingest, whose counters change
// every few hours. Drafts are not public, so creating or importing one says
// nothing. Only production announces: a save on a preview or in local dev
// would vouch for addresses whose content did not change.
import { ORIGIN } from './site.js';

export const INDEXNOW_KEY = 's-morgunov-tech-indexnow';
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';

// Pages only: the sitemap, the feeds and llms.txt are read by the engines on
// their own schedule. Absolute, without duplicates, in the order given.
export function indexNowUrls(paths) {
  return [...new Set((paths || []).filter((p) => typeof p === 'string' && p.startsWith('/') && !/\.(xml|txt)$/.test(p)).map((p) => ORIGIN + p))];
}

export function indexNowBody(urls) {
  return { host: new URL(ORIGIN).host, key: INDEXNOW_KEY, keyLocation: `${ORIGIN}/${INDEXNOW_KEY}.txt`, urlList: urls };
}

// POST the URLs; never throws — an announcement must not fail a save.
export async function pingIndexNow(urls, fetchImpl = fetch) {
  if (!urls.length) return false;
  try {
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(indexNowBody(urls)),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// From a Function: announce the paths after the response, on production only.
export function announce(ctx, paths, fetchImpl = fetch) {
  let host = '';
  try {
    host = new URL(ctx.request.url).host;
  } catch {
    return null;
  }
  if (host !== new URL(ORIGIN).host) return null;
  const job = pingIndexNow(indexNowUrls(paths), fetchImpl);
  if (typeof ctx.waitUntil === 'function') ctx.waitUntil(job);
  return job;
}
