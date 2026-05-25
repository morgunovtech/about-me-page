import { json, sameOrigin } from '../../_lib/http.js';
import { aiAvailable, callClaude, aiRateLimit } from '../../_lib/ai.js';
import { clientIp } from '../../_lib/auth.js';

const SYSTEM = (lang) => `You are a meticulous proofreader for ${
  lang === 'en' ? 'English' : 'Russian'
} website copy.
Fix ONLY spelling, punctuation, and grammar. Preserve meaning, tone, length, and Markdown (links [text](url), **bold**, lists). Do NOT rewrite style or rephrase.
Return ONLY a JSON object, no prose: {"corrected": "<text>", "notes": ["<short reason>", ...]}.
If nothing needs fixing, return the original text with an empty notes array.`;

function parseJson(s) {
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* ignore */
      }
    }
    return null;
  }
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ error: 'cross-origin blocked' }, 403);
  if (!aiAvailable(env)) return json({ error: 'AI не настроен' }, 503);
  if (!(await aiRateLimit(env, clientIp(request)))) return json({ error: 'too many requests' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const text = String((body && body.text) || '');
  const lang = body && body.lang === 'en' ? 'en' : 'ru';
  if (!text.trim()) return json({ corrected: text, notes: [] });

  if (env.AI_DEV_MOCK) {
    const corrected = text.replace(/ {2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    return json({ corrected, notes: corrected !== text ? ['[MOCK] убраны лишние пробелы'] : [] });
  }

  try {
    const raw = await callClaude(env, { system: SYSTEM(lang), user: text, maxTokens: 1500 });
    const parsed = parseJson(raw);
    if (!parsed || typeof parsed.corrected !== 'string') {
      return json({ corrected: text, notes: [], warning: 'AI вернул неожиданный формат' });
    }
    return json({ corrected: parsed.corrected, notes: Array.isArray(parsed.notes) ? parsed.notes : [] });
  } catch (e) {
    return json({ error: String(e.message || e) }, 502);
  }
}
