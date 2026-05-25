export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// CSRF guard for mutations: reject cross-origin requests. Combined with the
// SameSite=Strict session cookie, this keeps admin mutations same-origin only.
export function sameOrigin(request) {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // same-origin requests may omit Origin
  return origin === new URL(request.url).origin;
}
