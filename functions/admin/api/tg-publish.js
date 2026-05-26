// Publish a published article to Telegram. Session-gated + same-origin + gated
// to status==='published'. Re-renders the authoritative plan server-side and
// applies only the admin's text/caption edits (image URLs stay server-controlled),
// then publishes via the Telegram target and stores distribution metadata.
import { json, sameOrigin } from '../../_lib/http.js';
import { loadArticle, articleKey } from '../../_lib/articles.js';
import { articleToSourcePost } from '../../_lib/tg-adapter.js';
import { getTarget } from '../../_lib/dist/targets/index.js';

// Overlay admin-edited text onto the server-rendered plan (text + captions only).
function applyEdits(plan, edited) {
  if (!Array.isArray(edited)) return plan;
  plan.messages.forEach((m, i) => {
    const e = edited[i];
    if (!e || e.kind !== m.kind) return;
    if (m.kind === 'text' && typeof e.text === 'string') m.text = e.text;
    else if (m.kind === 'photo' && typeof e.caption === 'string') m.caption = e.caption;
    else if (m.kind === 'album' && Array.isArray(e.items) && e.items[0] && typeof e.items[0].caption === 'string' && m.items[0]) m.items[0].caption = e.items[0].caption;
  });
  return plan;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);
  const mock = !!env.TG_DEV_MOCK;
  if (!mock && !env.TELEGRAM_BOT_TOKEN) return json({ error: 'Telegram не настроен (нет TELEGRAM_BOT_TOKEN)' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const { slug, strategy = 'auto', messages } = body || {};
  const doc = await loadArticle(env, slug);
  if (!doc) return json({ error: 'статья не найдена' }, 404);
  if (doc.status !== 'published') return json({ error: 'кросс-постинг только для опубликованных статей' }, 409);

  const target = getTarget('telegram');
  const post = articleToSourcePost(doc, 'ru');
  const plan = applyEdits(target.render(post, { strategy }), messages);

  const result = await target.publish(plan, {
    token: env.TELEGRAM_BOT_TOKEN,
    channel: env.TELEGRAM_CHANNEL,
    mock,
  });
  if (!result.ok) return json({ error: result.error || 'publish failed', refs: result.refs || [] }, 502);

  // Store distribution metadata (NOT a content change — keep rev, no history).
  const first = result.refs[0] || {};
  doc.distribution = doc.distribution || {};
  doc.distribution.telegram = {
    chatId: env.TELEGRAM_CHANNEL || null,
    messageId: first.messageId ?? null,
    url: first.url || null,
    count: result.refs.length,
    postedAt: new Date().toISOString(),
    mock: !!result.mock,
  };
  try {
    await env.CONTENT.put(articleKey(slug), JSON.stringify(doc));
  } catch {
    /* metadata write is best-effort; the post already went out */
  }
  return json({ ok: true, refs: result.refs, url: first.url || null, mock: !!result.mock });
}
