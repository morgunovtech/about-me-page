// Auth gate for the entire /admin zone. /admin/login is reachable without a
// session; everything else requires a valid HMAC session cookie. UI routes
// redirect to login when unauthenticated; API routes return 401.

import {
  verifySession,
  getCookie,
  SESSION_COOKIE,
  sessionCookie,
  createSession,
  shouldRefresh,
} from '../_lib/auth.js';

export async function onRequest(context) {
  const { request, next, env } = context;
  const { pathname, origin } = new URL(request.url);

  if (pathname === '/admin/login') return next();

  const token = getCookie(request, SESSION_COOKIE);
  const session = token ? await verifySession(env.SESSION_SECRET, token) : null;

  if (!session) {
    if (pathname.startsWith('/admin/api/')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    return Response.redirect(origin + '/admin/login', 302);
  }

  const response = await next();

  // Sliding session: refresh the cookie once past half its lifetime.
  if (shouldRefresh(session) && env.SESSION_SECRET) {
    const refreshed = new Response(response.body, response);
    refreshed.headers.append('Set-Cookie', sessionCookie(await createSession(env.SESSION_SECRET)));
    return refreshed;
  }
  return response;
}
