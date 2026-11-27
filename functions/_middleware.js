// Pages middleware: edge-renders managed HTML pages by overlaying KV content
// onto the static template, blocks internal repo files from being served as
// static assets, and back-fills security headers on Function-generated
// responses (_headers only covers static assets). Heavy static paths never
// reach here — they're excluded in _routes.json and served straight from the
// asset layer / CDN cache.

import { loadDoc, loadSubscribers } from './_lib/content.js';
import { loadHomeFeed, loadPublishedArticles } from './_lib/render-notes.js';
import { overlay } from './_lib/overlay.js';
import { renderPageJsonLd } from './_lib/jsonld.js';
import { cached } from './_lib/cache.js';
import { buildOf, ORIGIN } from './_lib/site.js';
import { noindexOnTechnicalHost, technicalHostRedirect, withSecurityHeaders } from './_lib/http.js';
import { notFound } from './_lib/render-article.js';

// Keys are the clean URLs Pages actually serves (it 308-redirects /foo.html → /foo,
// /index.html → /). The .html paths never reach here as HTML.
const ROUTES = {
  '/': { page: 'home', lang: 'ru' },
  '/en/': { page: 'home', lang: 'en' },
  '/collaborate': { page: 'collaborate', lang: 'ru' },
  '/en/collaborate': { page: 'collaborate', lang: 'en' },
  '/consulting': { page: 'consulting', lang: 'ru' },
  '/en/consulting': { page: 'consulting', lang: 'en' },
  '/uses': { page: 'uses', lang: 'ru' },
  '/en/uses': { page: 'uses', lang: 'en' },
  '/privacy': { page: 'privacy', lang: 'ru' },
  '/en/privacy': { page: 'privacy', lang: 'en' },
};

// v4.0.0: «Принципы» became a section of /uses; the old addresses answer with a
// permanent redirect to it (the fragment rides in Location).
export const MOVED = {
  '/about': '/uses#principles',
  '/en/about': '/en/uses#principles',
};

// The deploy output IS the repo root, so tracked internal files ship as
// static assets. None of them belong on the public origin. Entries ending
// with '/' block the whole prefix. LICENSE, NOTICE and fonts/OFL.txt are
// served on purpose (_headers types them text/plain).
const BLOCKED = [
  '/content.seed.json', // internal render fallback, not a public endpoint
  '/CLAUDE.md',
  '/CHANGELOG.md',
  '/README.md',
  '/wrangler.toml',
  '/.gitignore',
  '/.sonarcloud.properties', // SonarQube Cloud analysis settings
  '/.github/', // CI workflows, Dependabot config
  '/scripts/',
  '/tests/',
];

const blocked = (pathname) =>
  BLOCKED.some((p) => (p.endsWith('/') ? pathname.startsWith(p) : pathname === p));

export async function onRequest(context) {
  const moved = technicalHostRedirect(context.request, ORIGIN);
  if (moved) return withSecurityHeaders(moved);
  return noindexOnTechnicalHost(await handle(context), context.request.url);
}

async function handle(context) {
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

  // The old address in any spelling a link may carry: /about, /about/, /about.html.
  const moved = MOVED[pathname] || MOVED[pathname.replace(/(?:\.html|\/)$/, '')];
  if (moved) {
    return withSecurityHeaders(Response.redirect(new URL(moved, request.url).toString(), 301));
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
    const res = await next();
    // An unknown path gets Pages' static 404.html as is: the stamped build and
    // the site-wide `index, follow`. Serve it the way /404 does — deployed
    // build, noindex — unless a Function already built its own 404 page.
    if (res.status === 404 && (res.headers.get('content-type') || '').includes('text/html')
        && res.headers.get('x-robots-tag') !== 'noindex') {
      return withSecurityHeaders(await notFound(env, request));
    }
    return withSecurityHeaders(res);
  }

  // Edge-cached: a rendered copy per URL, purged by admin save / ingest.
  return cached(context, async () => {
    // The template fetch and the KV reads are independent — run them in
    // parallel. The home page renders the live subscribers stat and the
    // «Публикации» block (the three newest /notes feed entries); /collaborate
    // its «Аудитория» figures (v4.6.0) and «Примеры работ», picked from the
    // published notes and the `notes` doc's external materials (v4.7.0).
    const isHome = route.page === 'home';
    const isCollab = route.page === 'collaborate';
    const [response, doc, subs, feed, articles, notesDoc] = await Promise.all([
      next(),
      loadDoc(env, route.page),
      isHome || isCollab ? loadSubscribers(env) : null,
      isHome ? loadHomeFeed(env, route.lang) : null,
      route.page === 'privacy' || isCollab ? loadPublishedArticles(env) : null,
      isCollab ? loadDoc(env, 'notes') : null,
    ]);
    if (!(response.headers.get('content-type') || '').includes('text/html')) {
      return response;
    }
    if (!doc) return response; // no content anywhere → serve the static template
    if (subs) doc._live = { subscribers: subs };
    if (feed) doc._feed = feed;
    if (articles) doc._articles = articles;
    if (notesDoc) doc._notes = notesDoc;
    doc._build = buildOf(env);

    const transformed = overlay(response, doc, route.lang, false, (d, l) => renderPageJsonLd(d, l, route.page));
    const headers = new Headers(transformed.headers);
    headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
    // The deployed commit: the footer shows the version, so a deploy is checked by this header.
    headers.set('X-Build', doc._build);
    return withSecurityHeaders(
      new Response(request.method === 'HEAD' ? null : transformed.body, {
        status: transformed.status,
        statusText: transformed.statusText,
        headers,
      })
    );
  });
}
