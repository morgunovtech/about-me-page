// Blog body HTML → Telegram-HTML (parse_mode=HTML). Pure, dependency-free (no
// HTMLRewriter), so the core stays portable. Input is the blog's own sanitized
// HTML (small, well-nested tag set), so a compact stack parser is enough.
//
// Mapping (see FEATURE.md): b/strong→b, i/em→i, u/ins→u, s/strike/del→s,
// code→code, a→a(href), pre→pre, blockquote→blockquote; h2/h3→bold line;
// ul→"• ", ol→"1. "; hr→"···"; img→collected (never inline); figcaption→<i>.
// Text nodes are already entity-escaped by the blog sanitizer, so they pass
// through (Telegram decodes the same &amp;/&lt;/&gt;).

const INLINE = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', ins: 'u', s: 's', strike: 's', del: 's', code: 'code' };
const VOID = new Set(['img', 'hr', 'br']);

// Tokenize into tags and text runs.
function tokenize(html) {
  return String(html || '').match(/<\/?[a-z0-9-]+(?:\s[^>]*?)?\/?>|[^<]+/gi) || [];
}
function parseTag(tok) {
  const m = /^<(\/?)([a-z0-9-]+)([^>]*?)(\/?)>$/i.exec(tok);
  if (!m) return null;
  return { close: m[1] === '/', tag: m[2].toLowerCase(), rawAttrs: m[3], self: m[4] === '/' };
}
function attr(rawAttrs, name) {
  const m = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i').exec(rawAttrs || '');
  return m ? m[1] : null;
}

// Build a lightweight node tree.
function parse(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  for (const tok of tokenize(html)) {
    if (tok[0] === '<' && tok[1] !== ' ') {
      const t = parseTag(tok);
      if (!t) continue;
      if (t.close) {
        for (let i = stack.length - 1; i > 0; i--) {
          if (stack[i].tag === t.tag) { stack.length = i; break; }
        }
      } else {
        const node = { tag: t.tag, attrs: t.rawAttrs, children: [] };
        stack[stack.length - 1].children.push(node);
        if (!t.self && !VOID.has(t.tag)) stack.push(node);
      }
    } else {
      stack[stack.length - 1].children.push({ tag: '#text', value: tok });
    }
  }
  return root;
}

// Inline serialization (within a block). Collects image URLs into `images`.
function inline(nodes, images) {
  let out = '';
  for (const n of nodes) {
    if (n.tag === '#text') { out += n.value; continue; }
    if (n.tag === 'br') { out += '\n'; continue; }
    if (n.tag === 'img') { const s = attr(n.attrs, 'src'); if (s) images.push(s); continue; }
    if (n.tag === 'a') {
      const href = attr(n.attrs, 'href');
      out += href ? `<a href="${href}">${inline(n.children, images)}</a>` : inline(n.children, images);
      continue;
    }
    const tg = INLINE[n.tag];
    if (tg) out += `<${tg}>${inline(n.children, images)}</${tg}>`;
    else out += inline(n.children, images); // unwrap unknown inline
  }
  return out;
}

// A block container whose children may themselves be blocks (e.g. blockquote
// wrapping <p>s) — join child blocks with single newlines.
function innerBlocks(node, images) {
  const parts = [];
  let buf = '';
  const flush = () => { if (buf.trim() !== '') parts.push(buf.trim()); buf = ''; };
  for (const c of node.children) {
    if (c.tag === 'p' || c.tag === 'br') { flush(); if (c.tag === 'p') parts.push(inline(c.children, images).trim()); }
    else buf += inline([c], images);
  }
  flush();
  return parts.filter(Boolean).join('\n');
}

function block(node, images) {
  switch (node.tag) {
    case 'h2':
    case 'h3':
      return `<b>${inline(node.children, images).trim()}</b>`;
    case 'p':
      return inline(node.children, images).trim();
    case 'blockquote':
      return `<blockquote>${innerBlocks(node, images) || inline(node.children, images).trim()}</blockquote>`;
    case 'pre':
      return `<pre>${inline(node.children, images)}</pre>`;
    case 'hr':
      return '···';
    case 'ul':
    case 'ol': {
      const lis = node.children.filter((c) => c.tag === 'li');
      return lis.map((li, i) => (node.tag === 'ol' ? `${i + 1}. ` : '• ') + inline(li.children, images).trim()).join('\n');
    }
    case 'figure': {
      const cap = node.children.find((c) => c.tag === 'figcaption');
      // image already collected by inline(); surface a caption line if present.
      inline(node.children, images);
      return cap ? `<i>${inline(cap.children, images).trim()}</i>` : '';
    }
    default:
      return inline([node], images).trim();
  }
}

// Plain text length as Telegram counts it: the message text (not the markup),
// in UTF-16 code units (so an emoji counts as 2) — matches the 4096/1024 limits.
function plainLength(tgHtml) {
  const text = tgHtml.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  return text.length;
}

export function renderTgHtml(html) {
  const root = parse(html);
  const images = [];
  const blocks = [];
  for (const node of root.children) {
    if (node.tag === '#text') { const t = node.value.trim(); if (t) blocks.push(t); continue; }
    const b = block(node, images);
    if (b !== '') blocks.push(b);
  }
  const tg = blocks.join('\n\n');
  return { html: tg, images, plainLength: plainLength(tg) };
}

export { plainLength };
