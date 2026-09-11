// /llms.txt with live subscriber counters. The committed llms.txt is the
// template ({total}, {telegram}, {linkedin}, {youtube}); the numbers come from
// the same counters() the homepage renders, so the AI-facing file can never
// disagree with the page.
import { loadDoc, loadSubscribers } from './_lib/content.js';
import { counters } from './_lib/render.js';

export async function onRequest({ env, request }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const [asset, doc, subs] = await Promise.all([
    env.ASSETS.fetch(new URL('/llms.txt', request.url)),
    loadDoc(env, 'home'),
    loadSubscribers(env),
  ]);
  let text = await asset.text();
  if (doc) {
    if (subs) doc._live = { subscribers: subs };
    const c = counters(doc, 'en');
    text = text.replace(/\{(telegram|linkedin|youtube|total)\}/g, (m, k) => (c[k] != null ? c[k] : m));
  }
  return new Response(request.method === 'HEAD' ? null : text, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
    },
  });
}
