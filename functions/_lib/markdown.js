// Minimal, zero-dependency Markdown subset — only what the site's content uses:
// paragraphs, unordered lists, links, and **bold**. Deliberately not a full
// CommonMark implementation. External http(s) links get target/rel per the
// site's link-hygiene rule; internal/mailto links do not.

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

export function isExternal(href) {
  return /^(?:https?:)?\/\//i.test(href);
}

// Reject dangerous URL schemes (javascript:, data:, vbscript:, …). Relative
// paths, anchors, and http/https/mailto/tel pass through. Tabs/newlines are
// stripped first because browsers ignore them when parsing the scheme, so
// "java\tscript:x" would otherwise slip past a naive check.
// Internal pages live at clean URLs (Pages 308-redirects /foo.html → /foo).
// Older KV docs still carry .html hrefs — normalize them at render time so
// no visitor click pays a redirect round-trip.
const INTERNAL_HTML_HREF = /^\/(?:en\/)?(?:collaborate|about|uses)\.html(?=$|[#?])/;

export function safeHref(href) {
  const h = String(href == null ? '' : href).replace(/[\t\n\r]/g, '').trim();
  if (h === '') return h;
  const scheme = h.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^(https?|mailto|tel)$/i.test(scheme[1])) return '#';
  // Protocol-relative //host/… is an off-site link — make that explicit so
  // the external-link treatment (target/rel) applies.
  if (/^\/\//.test(h)) return 'https:' + h;
  return h.replace(INTERNAL_HTML_HREF, (m) => m.slice(0, -'.html'.length));
}

// Escape a text run, then apply inline code (`x`) and emphasis (**bold**).
// Code spans are resolved first so a literal ** inside them stays literal.
function fmt(text) {
  return escapeHtml(text)
    .split(/(`[^`\n]+`)/)
    .map((part, i) => (i % 2 ? `<code>${part.slice(1, -1)}</code>` : part.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')))
    .join('');
}

// Render inline markdown (links + emphasis) without any block wrapping.
export function renderInline(md) {
  if (md == null) return '';
  const linkRe = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = linkRe.exec(md)) !== null) {
    out += fmt(md.slice(last, m.index));
    const label = fmt(m[1]);
    const href = safeHref(m[2]);
    const ext = isExternal(href);
    out += `<a href="${escapeAttr(href)}"${
      ext ? ' target="_blank" rel="noopener noreferrer"' : ''
    }>${label}</a>`;
    last = linkRe.lastIndex;
  }
  out += fmt(md.slice(last));
  return out;
}

// Render block markdown into an array of block-level HTML strings.
// Blank lines separate blocks; lines starting with "- " or "* " form a list.
export function renderBlocks(md) {
  if (md == null) return [];
  const lines = String(md).split('\n');
  const blocks = [];
  let para = [];
  let list = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push('<p>' + renderInline(para.join(' ')) + '</p>');
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      blocks.push(
        '<ul class="v4-list">' +
          list.map((li) => '<li>' + renderInline(li) + '</li>').join('') +
          '</ul>'
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flushPara();
      flushList();
      continue;
    }
    const li = line.match(/^[-*]\s+(.*)$/);
    if (li) {
      flushPara();
      (list || (list = [])).push(li[1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

// Join blocks (used for multi-paragraph prose like the About section).
export function renderProse(md) {
  return renderBlocks(md).join('');
}

// Career "ctx": a single paragraph renders inline (bare text, no <p> wrapper,
// matching the template); anything with lists/multiple paragraphs keeps blocks.
export function renderCtx(md) {
  const blocks = renderBlocks(md);
  if (blocks.length === 1 && blocks[0].startsWith('<p>') && blocks[0].endsWith('</p>')) {
    return blocks[0].slice(3, -4);
  }
  return blocks.join('');
}
