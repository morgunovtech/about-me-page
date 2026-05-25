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

function escapeAttr(s) {
  return escapeHtml(s).replace(/"/g, '&quot;');
}

function isExternal(href) {
  return /^https?:\/\//i.test(href);
}

// Escape a text run, then apply inline emphasis (**bold**).
function fmt(text) {
  return escapeHtml(text).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
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
    const href = m[2];
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
