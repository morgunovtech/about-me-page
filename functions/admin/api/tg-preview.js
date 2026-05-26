// Render the exact Telegram message plan for a published article (no send).
// Session-gated by /admin middleware. Drives the editable preview.
import { json, sameOrigin } from '../../_lib/http.js';
import { loadArticle } from '../../_lib/articles.js';
import { articleToSourcePost } from '../../_lib/tg-adapter.js';
import { getTarget } from '../../_lib/dist/targets/index.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const { slug, strategy = 'auto' } = body || {};
  const doc = await loadArticle(env, slug);
  if (!doc) return json({ error: 'статья не найдена' }, 404);
  if (doc.status !== 'published') return json({ error: 'кросс-постинг только для опубликованных статей' }, 409);

  const post = articleToSourcePost(doc, 'ru'); // channel is RU
  const plan = getTarget('telegram').render(post, { strategy });
  const already = doc.distribution && doc.distribution.telegram;
  return json({ plan, already: already || null });
}
