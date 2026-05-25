import { loadDoc } from '../../_lib/content.js';
import { json } from '../../_lib/http.js';

export async function onRequestGet({ request, env }) {
  const page = new URL(request.url).searchParams.get('page') || 'home';
  const doc = await loadDoc(env, page);
  if (!doc) return json({ error: 'unknown page: ' + page }, 404);
  return json(doc);
}
