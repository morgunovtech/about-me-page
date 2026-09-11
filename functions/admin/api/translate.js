import { json, sameOrigin } from '../../_lib/http.js';
import { aiAvailable, callClaude, aiRateLimit } from '../../_lib/ai.js';
import { clientIp } from '../../_lib/auth.js';

const SYSTEM = `You translate website content from Russian to English.
- Return ONLY the translation — no preamble, no quotes, no explanation.
- Preserve Markdown exactly: links [text](url) keep the URL, **bold**, lists, line breaks.
- Do NOT translate proper nouns, brands, or technical terms: Yandex, Korzinka, Skyeng, Skysmart, BNPL, MFO, FinTech, EdTech, e-com, EBITDA, GMV, CSAT, PCI DSS, P&L, Telegram, LinkedIn, YouTube, GitHub.
- Keep the concise, factual tone and match the original length closely.
- Keep placeholders in curly braces — {telegram}, {linkedin}, {youtube}, {total} — exactly as written; the site substitutes live numbers for them.`;

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);
  if (!aiAvailable(env)) return json({ error: 'AI не настроен (нет ANTHROPIC_API_KEY)' }, 503);
  if (!(await aiRateLimit(env, clientIp(request)))) return json({ error: 'too many requests' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const text = String((body && body.text) || '');
  if (!text.trim()) return json({ translation: '' });

  if (env.AI_DEV_MOCK) return json({ translation: '[EN-MOCK] ' + text });

  try {
    const translation = await callClaude(env, { system: SYSTEM, user: text, maxTokens: 1024 });
    return json({ translation });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}
