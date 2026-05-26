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
