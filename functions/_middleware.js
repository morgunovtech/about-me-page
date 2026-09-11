// Pages middleware: edge-renders managed HTML pages by overlaying KV content
// onto the static template, blocks internal repo files from being served as
// static assets, and back-fills security headers on Function-generated
// responses (_headers only covers static assets). Heavy static paths never
// reach here — they're excluded in _routes.json and served straight from the
// asset layer / CDN cache.

import { loadDoc, loadSubscribers } from './_lib/content.js';
import { overlay } from './_lib/overlay.js';
import { renderPageJsonLd } from './_lib/jsonld.js';
import { cached } from './_lib/cache.js';
import { buildOf, buildUrl } from './_lib/site.js';
import { withSecurityHeaders } from './_lib/http.js';

// Keys are the clean URLs Pages actually serves (it 308-redirects /foo.html → /foo,
// /index.html → /). The .html paths never reach here as HTML.
const ROUTES = {
  '/': { page: 'home', lang: 'ru' },
  '/en/': { page: 'home', lang: 'en' },
  '/about': { page: 'about', lang: 'ru' },
  '/en/about': { page: 'about', lang: 'en' },
  '/collaborate': { page: 'collaborate', lang: 'ru' },
  '/en/collaborate': { page: 'collaborate', lang: 'en' },
  '/uses': { page: 'uses', lang: 'ru' },
  '/en/uses': { page: 'uses', lang: 'en' },
};

// The deploy output IS the repo root, so tracked internal files ship as
// static assets. None of them belong on the public origin (the GitHub repo
// is public — this is surface reduction, not secret-keeping). Entries ending
// with '/' block the whole prefix.
const BLOCKED = [
  '/content.seed.json', // internal render fallback, not a public endpoint
  '/CLAUDE.md',
  '/CHANGELOG.md',
  '/wrangler.toml',
  '/.gitignore',
  '/scripts/',
  '/tests/',
];

const blocked = (pathname) =>
  BLOCKED.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));

export async function onRequest(context) {
  const { request, next, env } = context;
  // HEAD must see the same guards and rendering as GET — otherwise
  // `curl -I` reaches blocked files and reports the untransformed template.
  // Other methods (admin API POSTs) skip the route table but still get the
  // security-header back-fill.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return withSecurityHeaders(await next());
  }

  // Collapse duplicate slashes BEFORE matching: //content.seed.json must hit
  // the same guard as /content.seed.json, //en/ the same route as /en/.
  const rawPath = new URL(request.url).pathname;
  const pathname = rawPath.replace(/\/{2,}/g, '/');
  // «//uses» and friends: canonicalise instead of rendering (and caching) a twin.
  if (pathname !== rawPath) {
    const u = new URL(request.url);
    u.pathname = pathname;
    return Response.redirect(u.toString(), 308);
  }

  if (blocked(pathname)) {
    return withSecurityHeaders(new Response('Not Found', { status: 404 }));
  }

  const route = ROUTES[pathname];
  if (!route) {
    // Function-generated responses (admin, notes, sitemap, APIs) don't get
    // _headers — back-fill the security set. Skip CSP for the /admin editor
    // shell: its srcdoc preview iframe needs a dedicated policy (login sets
    // its own strict CSP inline).
    // Route-specific CSPs (admin shell, login, /assets) are set by the route
    // and win — withSecurityHeaders only fills what is missing.
    return withSecurityHeaders(await next());
  }

  // Edge-cached: a rendered copy per URL, purged by admin save / ingest.
  return cached(context, async () => {
    // The template fetch and the two KV reads are independent — run them in
    // parallel. Only the home page renders the live subscribers stat.
    const [response, doc, subs] = await Promise.all([
      next(),
      loadDoc(env, route.page),
      route.page === 'home' ? loadSubscribers(env) : null,
    ]);
    if (!(response.headers.get('content-type') || '').includes('text/html')) {
      return response;
    }
    if (!doc) return response; // no content anywhere → serve the static template
    if (subs) doc._live = { subscribers: subs };
    doc._build = buildOf(env);
    doc._buildUrl = buildUrl(doc._build);

    const transformed = overlay(response, doc, route.lang, false, (d, l) => renderPageJsonLd(d, l, route.page));
    const headers = new Headers(transformed.headers);
    headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
    return withSecurityHeaders(
      new Response(request.method === 'HEAD' ? null : transformed.body, {
        status: transformed.status,
        statusText: transformed.statusText,
        headers,
      })
    );
  });
}
