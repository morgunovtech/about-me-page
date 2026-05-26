// Message-plan builder: SourcePost → an ordered list of platform-agnostic
// messages (text / photo / album). Pure — drives both the preview and publish.
// Length + image rules per FEATURE.md.
import { renderTgHtml, plainLength } from './tg-html.js';

const SAFE_TEXT = 4000; // margin under Telegram's 4096
const SAFE_CAPTION = 1000; // margin under 1024

const stripTags = (h) => String(h || '').replace(/<[^>]+>/g, '');
const dedup = (arr) => [...new Set(arr.filter(Boolean))];

function firstBlock(tgHtml) {
  return (tgHtml.split('\n\n')[0] || '').trim();
}
// Greedy split on paragraph (block) boundaries; tags stay balanced because the
// renderer never lets inline tags cross a \n\n block boundary.
function splitByParagraph(tgHtml, max) {
  const paras = tgHtml.split('\n\n');
  const chunks = [];
  let cur = '';
  for (const p of paras) {
    const candidate = cur ? cur + '\n\n' + p : p;
    if (plainLength(candidate) <= max || !cur) cur = candidate;
    else { chunks.push(cur); cur = p; }
  }
  if (cur) chunks.push(cur);
  return chunks;
}
function truncatePlain(text, max) {
  if ([...text].length <= max) return text;
  const slice = [...text].slice(0, max).join('');
  const at = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('\n'), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
  return (at > max * 0.5 ? slice.slice(0, at + 1) : slice).trim();
}

// strategy: 'auto' (default) | 'teaser' | 'split' | 'truncate'
export function buildPlan(post, opts = {}) {
  const strategy = opts.strategy || 'auto';
  const { html: tgHtml, images: bodyImages, plainLength: len } = renderTgHtml(post.html);
  const images = dedup([...(post.images || []), ...bodyImages]); // cover first
  const url = post.url || '';
  const warnings = [];

  const teaserText = (post.excerpt || stripTags(firstBlock(tgHtml)) || post.title || '').trim();
  const teaserMsg = () => ({ kind: 'text', text: (teaserText ? teaserText + '\n\n' : '') + url, parseMode: 'HTML', linkPreview: true });

  let mode = strategy;
  if (strategy === 'auto') mode = len <= SAFE_TEXT ? 'native' : 'teaser';

  if (mode === 'teaser') return { target: 'telegram', mode: 'teaser', warnings, messages: [teaserMsg()] };

  if (mode === 'truncate') {
    const room = SAFE_TEXT - url.length - 6;
    const cut = truncatePlain(stripTags(tgHtml), room);
    return { target: 'telegram', mode: 'truncate', warnings, messages: [{ kind: 'text', text: cut + '\n\n… ' + url, parseMode: 'HTML', linkPreview: true }] };
  }

  if (mode === 'split') {
    const parts = splitByParagraph(tgHtml, SAFE_TEXT - 12);
    const n = parts.length;
    return {
      target: 'telegram', mode: 'split', warnings,
      messages: parts.map((t, i) => ({ kind: 'text', text: `${t}\n\n(${i + 1}/${n})`, parseMode: 'HTML', linkPreview: false })),
    };
  }

  // native single post
  if (images.length === 0) {
    return { target: 'telegram', mode: 'native', warnings, messages: [{ kind: 'text', text: tgHtml, parseMode: 'HTML', linkPreview: true }] };
  }
  if (images.length === 1) {
    if (len <= SAFE_CAPTION) return { target: 'telegram', mode: 'native', warnings, messages: [{ kind: 'photo', photoUrl: images[0], caption: tgHtml, parseMode: 'HTML' }] };
    warnings.push('Текст длиннее подписи (1024) — отправляем текстом; картинка остаётся в блоге (link-preview).');
    return { target: 'telegram', mode: 'native', warnings, messages: [{ kind: 'text', text: tgHtml, parseMode: 'HTML', linkPreview: true }] };
  }
  let imgs = images;
  if (imgs.length > 10) { warnings.push('Больше 10 картинок — берём первые 10.'); imgs = imgs.slice(0, 10); }
  const captionFits = len <= SAFE_CAPTION;
  const messages = [{ kind: 'album', parseMode: 'HTML', items: imgs.map((u, i) => ({ photoUrl: u, caption: i === 0 && captionFits ? tgHtml : undefined })) }];
  if (!captionFits) { warnings.push('Подпись альбома > 1024 — текст идёт отдельным сообщением.'); messages.push({ kind: 'text', text: tgHtml, parseMode: 'HTML', linkPreview: false }); }
  return { target: 'telegram', mode: 'native', warnings, messages };
}
