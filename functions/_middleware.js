// Pages middleware: edge-renders managed HTML pages by overlaying KV content
// onto the static template. Non-managed routes and non-HTML responses pass
// through untouched, so assets (CSS/JS/images/fonts) are unaffected.

import { loadDoc, loadSubscribers } from './_lib/content.js';
import { overlay } from './_lib/overlay.js';

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

export async function onRequest(context) {
  const { request, next, env } = context;
  if (request.method !== 'GET') return next();

  const { pathname } = new URL(request.url);
  // The content seed is an internal render fallback, not a public endpoint.
  if (pathname === '/content.seed.json') return new Response('Not Found', { status: 404 });

  const route = ROUTES[pathname];
  if (!route) return next();

  const response = await next();
  if (!(response.headers.get('content-type') || '').includes('text/html')) {
    return response;
  }

  const doc = await loadDoc(env, route.page);
  if (!doc) return response; // no content anywhere → serve the static template

  // Only the home page renders the live subscribers stat — skip the extra KV
  // read on about/collaborate/uses.
  if (route.page === 'home') {
    const subs = await loadSubscribers(env);
    if (subs) doc._live = { subscribers: subs };
  }

  const transformed = overlay(response, doc, route.lang);
  const headers = new Headers(transformed.headers);
  headers.set('Cache-Control', 'public, max-age=60, stale-while-revalidate=86400');
  return new Response(transformed.body, {
    status: transformed.status,
    statusText: transformed.statusText,
    headers,
  });
}
