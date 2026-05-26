// Telegram Desktop export (result.json) → normalized importable posts. Pure,
// dependency-free (part of the portable dist/ core). The inverse of tg-html:
// text_entities → blog HTML. Inline escapers (no blog-module import) keep dist/
// self-contained.

const escapeHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s) => escapeHtml(s).replace(/"/g, '&quot;');

// Map a Telegram entity type → blog inline HTML.
function entitySpan(e) {
  const text = escapeHtml(e.text || '');
  switch (e.type) {
    case 'bold': return `<strong>${text}</strong>`;
    case 'italic': return `<em>${text}</em>`;
    case 'underline': return `<u>${text}</u>`;
    case 'strikethrough': return `<s>${text}</s>`;
    case 'code': return `<code>${text}</code>`;
    case 'pre': return `<pre>${text}</pre>`;
    case 'blockquote': return `<blockquote>${text}</blockquote>`;
    case 'text_link': return `<a href="${escapeAttr(e.href || '')}">${text}</a>`;
    case 'link': return `<a href="${escapeAttr(e.text || '')}">${text}</a>`;
    // mention / hashtag / email / phone / bot_command / spoiler / cashtag / plain → plain text
    default: return text;
  }
}

// Raw concatenated text (newlines preserved) — for the title's first line.
function plainText(ents) {
  if (typeof ents === 'string') return ents;
  if (!Array.isArray(ents)) return '';
  return ents.map((e) => (typeof e === 'string' ? e : e.text || '')).join('');
}

function paragraphize(html) {
  return html.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => '<p>' + p.replace(/\n/g, '<br>') + '</p>').join('');
}

// `text_entities` (preferred) or `text` (string | array of string|entity).
export function entitiesToHtml(ents) {
  if (ents == null) return '';
  if (typeof ents === 'string') return paragraphize(escapeHtml(ents));
  if (!Array.isArray(ents)) return '';
  let s = '';
  for (const e of ents) s += typeof e === 'string' ? escapeHtml(e) : entitySpan(e);
  return paragraphize(s);
}

// Telegram Desktop export object (or its `messages` array) → importable posts.
// Skips service messages and empty (no text & no photo) entries.
export function parseArchive(exp) {
  const messages = Array.isArray(exp) ? exp : (exp && Array.isArray(exp.messages) ? exp.messages : []);
  const out = [];
  for (const msg of messages) {
    if (!msg || msg.type !== 'message') continue;
    const ents = msg.text_entities && msg.text_entities.length ? msg.text_entities : msg.text;
    const html = entitiesToHtml(ents);
    const raw = plainText(ents).trim();
    if (!raw && !msg.photo) continue;
    const firstLine = (raw.split('\n').find((l) => l.trim()) || '').trim();
    out.push({
      messageId: msg.id,
      date: typeof msg.date === 'string' ? msg.date.slice(0, 10) : '',
      title: firstLine.slice(0, 120),
      html,
      photo: typeof msg.photo === 'string' ? msg.photo : null,
    });
  }
  return out;
}
