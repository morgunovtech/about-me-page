// Telegram distribution target. render() is pure (delegates to the plan
// builder); publish() performs the Bot API calls server-side. Config (token,
// channel, fetch, sleep, mock) is injected — the module reads no env, so it
// stays portable and testable.
import { buildPlan } from '../plan.js';

const API = 'https://api.telegram.org/bot';
const MAX_RETRIES = 3;

function channelToUrl(channel, id) {
  if (id == null) return null;
  if (typeof channel === 'string' && channel.startsWith('@')) return `https://t.me/${channel.slice(1)}/${id}`;
  return null; // numeric chat ids have no public permalink
}

async function callApi(method, payload, cfg) {
  const fetchImpl = cfg.fetch || globalThis.fetch;
  const sleep = cfg.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetchImpl(`${API}${cfg.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({ ok: false, description: 'bad response' }));
    if (data.ok) return data.result;
    // 429: honor parameters.retry_after, then retry (capped).
    if (data.error_code === 429 && data.parameters && data.parameters.retry_after != null && attempt < MAX_RETRIES - 1) {
      await sleep(Math.min(Number(data.parameters.retry_after) || 1, 60) * 1000);
      continue;
    }
    throw new Error('Telegram ' + method + ': ' + (data.description || data.error_code || 'error'));
  }
  throw new Error('Telegram ' + method + ': retries exhausted');
}

export const telegram = {
  id: 'telegram',

  render(post, opts) {
    return buildPlan(post, opts);
  },

  // cfg: { token, channel, fetch?, sleep?, mock? }
  async publish(plan, cfg) {
    // Mock first: it needs no token (only a channel, for the fake permalink).
    if (cfg && cfg.mock) {
      return { ok: true, mock: true, refs: plan.messages.map((_, i) => ({ messageId: 1000 + i, url: channelToUrl(cfg.channel, 1000 + i) })) };
    }
    if (!cfg || !cfg.token || !cfg.channel) return { ok: false, error: 'нет TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL', refs: [] };
    const chat = cfg.channel;
    const sleep = cfg.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const refs = [];
    try {
      for (let i = 0; i < plan.messages.length; i++) {
        const m = plan.messages[i];
        let result;
        if (m.kind === 'text') {
          result = await callApi('sendMessage', { chat_id: chat, text: m.text, parse_mode: m.parseMode || 'HTML', link_preview_options: { is_disabled: !m.linkPreview } }, cfg);
        } else if (m.kind === 'photo') {
          result = await callApi('sendPhoto', { chat_id: chat, photo: m.photoUrl, caption: m.caption || '', parse_mode: m.parseMode || 'HTML' }, cfg);
        } else if (m.kind === 'album') {
          result = await callApi('sendMediaGroup', {
            chat_id: chat,
            media: m.items.map((it) => ({ type: 'photo', media: it.photoUrl, ...(it.caption ? { caption: it.caption, parse_mode: m.parseMode || 'HTML' } : {}) })),
          }, cfg);
        } else {
          continue;
        }
        const msg = Array.isArray(result) ? result[0] : result;
        const id = msg && msg.message_id;
        refs.push({ messageId: id, url: channelToUrl(chat, id) });
        if (i < plan.messages.length - 1) await sleep(700); // be gentle between messages
      }
      return { ok: true, refs };
    } catch (e) {
      return { ok: false, error: String(e.message || e), refs };
    }
  },
};
