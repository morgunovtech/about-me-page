import { overlay } from '../../_lib/overlay.js';
import { json, sameOrigin } from '../../_lib/http.js';
import { loadSubscribers } from '../../_lib/content.js';

// Maps a page+lang to its static template. The raw template (fetched via the
// ASSETS binding, bypassing the public middleware) is overlaid with the DRAFT
// doc, so the preview is the exact production render of unsaved edits.
const TEMPLATES = {
  home: { ru: '/index.html', en: '/en/index.html' },
  about: { ru: '/about.html', en: '/en/about.html' },
  collaborate: { ru: '/collaborate.html', en: '/en/collaborate.html' },
  uses: { ru: '/uses.html', en: '/en/uses.html' },
};

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  const { page = 'home', lang = 'ru', doc } = body || {};
  const tmplPath = TEMPLATES[page] && TEMPLATES[page][lang];
  if (!tmplPath || !doc) return json({ error: 'bad page/lang/doc' }, 400);

  const template = await env.ASSETS.fetch(new URL(tmplPath, request.url));
  const subs = await loadSubscribers(env);
  if (subs) doc._live = { subscribers: subs };
  const rendered = overlay(template, doc, lang);
  return new Response(rendered.body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}
