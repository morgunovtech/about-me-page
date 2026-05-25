import { clearCookie } from '../_lib/auth.js';

export async function onRequest({ request }) {
  return new Response(null, {
    status: 302,
    headers: { Location: new URL(request.url).origin + '/admin/login', 'Set-Cookie': clearCookie() },
  });
}
