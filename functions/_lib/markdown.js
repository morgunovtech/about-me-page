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

// --- Typography: where a line must not break ---
// Applied to text on its way to a PUBLIC page (never in the editor: there the
// text in the page is the text of the doc, and never to an attribute), so the
// content stays plain and the rule is one for every page:
//   · a hyphen after a one-letter prefix does not break («e-com», «e-grocery»
//     used to end a line with «e-»);
//   · a «·» stays with the item before it, a «—» with the word before it — a
//     line never starts with a separator or a dash;
//   · a number that stands on its own stays with the word it counts («10 лет»,
//     «4 работают») and a group of thousands with its number («20 000»); a
//     range does not break after its dash («3–4 часа»);
//   · an arrow stays with the word it follows («Гайд →») or leads («← Все»);
//   · Russian: a one- or two-letter preposition, conjunction or «не» / «ни»
//     stays with the word after it — no «и», «в», «на» hanging at a line's end.
// The characters are written as escapes: an invisible one in a source file is
// a bug waiting for the next editor.
const NBSP = '\u00a0'; // no-break space
const NBHY = '\u2011'; // non-breaking hyphen
const WJ = '\u2060'; // word joiner
const RU_SHORT = /(^|[\s\u00a0(«„“"])((?:[вксуоиая]|не|ни|на|но|по|за|из|до|от|об|со|во|ко))[ \t]+(?=\S)/giu;
// A number that stands on its own — not the tail of a word, an address or a
// version («raschet7/76», «v3.13», «RG405V») — and the word it counts. A
// function word after a number is not counted by it: «iPhone 15 и iPad»,
// «с 2009 по 2012», “in 2007 the…”.
const NUM_WORD = /(^|[\s\u00a0(«„“"~≈–—])(\d(?:[\d.,]*\d)?[+%]?)[ \t]+(?=(\p{L}+))/gu;
const NOT_COUNTED = new Set(
  ('в во к ко с со у о об и а я не ни на но по за из до от или для при под над без что как то же ли бы '
    + 'a an and as at by for from in is it of on or the to was were with we i he she they but are').split(' ')
);
export function typoText(s, lang) {
  let out = String(s == null ? '' : s)
    .replace(/(^|[^\p{L}\p{N}\u2011-])(\p{L})-(?=\p{L})/gu, '$1$2' + NBHY)
    .replace(/[ \t]+([·—])(?=[ \t\u00a0]|$)/g, NBSP + '$1')
    .replace(/(\d)[ \t]+(?=\d{3}(?!\d))/g, '$1' + NBSP)
    .replace(NUM_WORD, (m, pre, num, word) => (NOT_COUNTED.has(word.toLowerCase()) ? m : pre + num + NBSP))
    .replace(/(\d)–(?=\d)/g, '$1–' + WJ)
    .replace(/[ \t]+(?=→)/g, NBSP)
    .replace(/←[ \t]+(?=\S)/g, '←' + NBSP);
  if (lang !== 'en') {
    // Twice: «и в этом» — the second short word starts where the first match ended.
    out = out.replace(RU_SHORT, '$1$2' + NBSP).replace(RU_SHORT, '$1$2' + NBSP);
  }
  return out;
}

// The same for a fragment of HTML: text only — not tags, and not what is inside
// <code>, <pre>, <script> or <style> (a non-breaking hyphen in a command would
// break its copy). An inline tag does not hide a rule from its neighbours: in
// «в <strong>Skyeng</strong>» the «в» is still a short word before a word, and
// in «Name <span>· Founder</span>» the «·» still follows an item — a space at
// such a boundary is judged together with the text on its other side.
// Two elements side by side are not one phrase, though: where one closes and
// another opens («…<span>52</span></a> <a>Тема») only a separator is tied to
// what stands before it — the count of one link is not the number of the next
// link's word (that rule chained the whole line of topics into one unbreakable
// string).
const TYPO_SKIP = /^<(\/?)(code|pre|script|style|textarea)\b/i;
const TYPO_INLINE = /^<\/?(?:a|abbr|b|code|em|i|mark|s|small|span|strong|sub|sup|time|u)\b/i;
// A tag ends at the first «>» outside its quoted attribute values.
const TYPO_TAG = /(<(?:[^<>"']|"[^"]*"|'[^']*')*>)/;
// Would the rules put a no-break space between `before` and `after`?
const glues = (before, after, lang) =>
  typoText(before + ' ' + after, lang).startsWith(typoText(before, lang) + NBSP);
const SEPARATOR = new RegExp('^[·—](?:[ \\t' + NBSP + ']|$)');

export function typo(html, lang) {
  const parts = String(html == null ? '' : html).split(TYPO_TAG);
  // The text on the other side of the inline tags next to parts[i] ('' at the
  // edge of a block), and which way those tags go: into an element, out of
  // one, or both.
  const across = (i, dir) => {
    let opens = false;
    let closes = false;
    for (let j = i + dir; j >= 0 && j < parts.length; j += dir) {
      if (j % 2) {
        if (!TYPO_INLINE.test(parts[j])) break;
        if (parts[j][1] === '/') closes = true;
        else opens = true;
      } else if (parts[j] !== '') return { text: parts[j], opens, closes };
    }
    return { text: '', opens, closes };
  };
  // The space between `before` and `after` becomes a no-break one — when the
  // texts are one phrase, by every rule; when they are two elements side by
  // side, only before a separator.
  const ties = (before, after, neighbours) =>
    before !== '' && after !== '' && !/\s$/.test(before) && !/^\s/.test(after)
    && (!neighbours || SEPARATOR.test(after))
    && glues(before.slice(-40), after.slice(0, 40), lang);
  let skip = 0;
  return parts.map((part, i) => {
    if (i % 2) {
      const m = TYPO_SKIP.exec(part);
      if (m) skip = Math.max(0, skip + (m[1] ? -1 : 1));
      return part;
    }
    if (skip || part === '') return part;
    let text = part;
    // A space that stands alone between two inline elements («…</a> <span>· Founder»).
    if (/^[ \t]+$/.test(text)) {
      const prev = across(i, -1);
      const next = across(i, 1);
      const neighbours = (prev.opens || prev.closes) && (next.opens || next.closes);
      return ties(prev.text, next.text, neighbours) ? NBSP : text;
    }
    const tail = /[ \t]+$/.exec(text);
    if (tail && tail.index > 0) {
      const next = across(i, 1);
      if (ties(text.slice(0, tail.index), next.text, next.opens && next.closes)) text = text.slice(0, tail.index) + NBSP;
    }
    const head = /^[ \t]+/.exec(text);
    if (head && head[0].length < text.length) {
      const prev = across(i, -1);
      if (ties(prev.text, text.slice(head[0].length), prev.opens && prev.closes)) text = NBSP + text.slice(head[0].length);
    }
    return typoText(text, lang);
  }).join('');
}

export function isExternal(href) {
  return /^(?:https?:)?\/\//i.test(href);
}

// Reject dangerous URL schemes (javascript:, data:, vbscript:, …). Relative
// paths, anchors, and http/https/mailto/tel pass through. Tabs/newlines are
// stripped first because browsers ignore them when parsing the scheme, so
// "java\tscript:x" would otherwise slip past a naive check.
export function safeHref(href) {
  const h = String(href == null ? '' : href).replace(/[\t\n\r]/g, '').trim();
  if (h === '') return h;
  const scheme = h.match(/^([a-z][a-z0-9+.-]*):/i);
  if (scheme && !/^(https?|mailto|tel)$/i.test(scheme[1])) return '#';
  // Protocol-relative //host/… is an off-site link — make that explicit so
  // the external-link treatment (target/rel) applies.
  if (/^\/\//.test(h)) return 'https:' + h;
  return h;
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
