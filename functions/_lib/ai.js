// Server-side Claude calls for the editor's AI helpers. Never invoked from the
// public site. Key (ANTHROPIC_API_KEY) stays on the server. AI_DEV_MOCK lets
// local dev exercise the UI without a key.

export function aiAvailable(env) {
  return !!(env.AI_DEV_MOCK || env.ANTHROPIC_API_KEY);
}

export async function callClaude(env, { system, user, maxTokens = 1024, model = 'claude-sonnet-4-6' }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data.error && data.error.message) || 'Anthropic ' + res.status);
  return (data.content || []).map((b) => b.text || '').join('').trim();
}

// Per-IP rate limit for AI endpoints (counter in KV).
export async function aiRateLimit(env, ip, max = 40, windowSec = 60) {
  if (!env.CONTENT) return true;
  const key = `rl:ai:${ip}`;
  const current = parseInt((await env.CONTENT.get(key)) || '0', 10);
  if (current >= max) return false;
  await env.CONTENT.put(key, String(current + 1), { expirationTtl: windowSec });
  return true;
}
