import { clearCookie, NOT_BEFORE_KEY } from '../_lib/auth.js';

export async function onRequest({ request, env }) {
  // Stateless HMAC sessions can't be deleted — void everything issued so far.
  if (env && env.CONTENT) {
    try {
      await env.CONTENT.put(NOT_BEFORE_KEY, String(Math.floor(Date.now() / 1000)));
    } catch {
      /* KV unavailable: the cookie is still cleared below */
    }
  }
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(request.url).origin + '/admin/login', 'Set-Cookie': clearCookie() },
  });
}
