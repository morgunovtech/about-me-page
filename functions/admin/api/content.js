import { loadDoc, PAGES } from '../../_lib/content.js';
import { json } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const page = new URL(request.url).searchParams.get('page') || 'home';
  if (!PAGES.has(page)) return json({ error: 'unknown page: ' + page }, 404);
  const doc = await loadDoc(env, page);
  if (!doc) return json({ error: 'unknown page: ' + page }, 404);
  return json(doc);
}
