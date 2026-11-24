// Cloudflare Pages applies _headers only to static-asset responses — anything
// a Function generates (admin pages, sitemap, notes, API errors) ships bare
// unless it sets these itself. Applied centrally in functions/_middleware.js;
// only fills headers the response doesn't already carry, so route-specific
// values (e.g. the sandbox CSP on /assets/*) always win.
export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export function withSecurityHeaders(response, { csp = true } = {}) {
  const wrapped = new Response(response.body, response);
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!csp && name === 'Content-Security-Policy') continue;
    if (!wrapped.headers.has(name)) wrapped.headers.set(name, value);
  }
  return wrapped;
}

// <project>.pages.dev and its preview hosts are technical addresses of the
// site and must stay out of search. _headers marks their static files
// noindex, but it never reaches what Functions build (/notes, RSS,
// /sitemap.xml, /llms.txt, the rendered pages), so the middleware passes
// every response through this. Set, not append: the value stays a plain
// `noindex` whatever the response carried.
export function noindexOnTechnicalHost(response, url) {
  if (!new URL(url).hostname.endsWith('.pages.dev')) return response;
  const marked = new Response(response.body, response);
  marked.headers.set('X-Robots-Tag', 'noindex');
  return marked;
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// CSRF guard for mutations: reject cross-origin requests. Combined with the
// SameSite=Strict session cookie, this keeps admin mutations same-origin only.
export function sameOrigin(request) {
  // Modern browsers send Sec-Fetch-Site on every request. Only same-origin
  // passes — reject cross-site/same-site AND 'none' (direct navigation / non-
  // browser clients have no business POSTing to an admin mutation API).
  const site = request.headers.get('Sec-Fetch-Site');
  if (site) return site === 'same-origin';
  // No Sec-Fetch-Site (older browsers / some tools): fall back to Origin.
  const origin = request.headers.get('Origin');
  if (!origin) return true; // genuine same-origin requests may omit Origin
  return origin === new URL(request.url).origin;
}

// Route handlers that only ever produce GET content: answer HEAD with the same
// headers and no body (link checkers, uptime monitors and sitemap validators
// probe with HEAD; a Pages Function exporting only onRequestGet 404s them),
// and reject every other method.
export function getOrHead(handler) {
  return async (ctx) => {
    const method = ctx.request.method;
    if (method !== 'GET' && method !== 'HEAD') {
      return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }
    const res = await handler(ctx);
    return method === 'HEAD' ? new Response(null, res) : res;
  };
}
