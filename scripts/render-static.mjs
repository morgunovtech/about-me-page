#!/usr/bin/env node
// The committed HTML pages are the seed's twins: every hook of a template holds
// what the edge overlay puts there for content.seed.json — the `data-cms-list`
// containers and the `data-cms-jsonld` script (the renderers' output), and the
// leaves hooked one by one: `data-cms-text`, `-md`, `-html` (an element's
// content) and `-content`, `-href`, `-alt`, `-abs` (an attribute). That twin is
// the fallback when KV is empty or an overlay handler throws, and it is what
// `python3 -m http.server` shows. (Until v4.1.0 only the lists and the JSON-LD
// were kept: 31 leaves had drifted — a title, a hero line, share cards.)
// The twin is the stored text: the typography pass is the edge's.
//
//   node scripts/render-static.mjs --check   # exit 1 when a template drifted
//   node scripts/render-static.mjs --write   # regenerate the twins in place
//
// Zero dependencies: imports the same renderers the Functions use.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderers, privacyRepos } from '../functions/_lib/render.js';
import { renderPageJsonLd } from '../functions/_lib/jsonld.js';
import { buildFeed } from '../functions/_lib/notes-feed.js';
import { escapeHtml, escapeAttr, renderProse, safeHref } from '../functions/_lib/markdown.js';
import { pick, resolvePath } from '../functions/_lib/i18n.js';
import { ORIGIN } from '../functions/_lib/site.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(resolve(ROOT, 'content.seed.json'), 'utf8'));

const PAGES = [
  ['index.html', 'home', 'ru'],
  ['en/index.html', 'home', 'en'],
  ['collaborate.html', 'collaborate', 'ru'],
  ['en/collaborate.html', 'collaborate', 'en'],
  ['consulting.html', 'consulting', 'ru'],
  ['en/consulting.html', 'consulting', 'en'],
  ['uses.html', 'uses', 'ru'],
  ['en/uses.html', 'uses', 'en'],
  ['privacy.html', 'privacy', 'ru'],
  ['en/privacy.html', 'privacy', 'en'],
];

// The invisible characters — a no-break space, a non-breaking hyphen, a word
// joiner — are the same HTML as their entities: compare and write the entity
// form, which a person can see in a diff. (Built from their codes: an invisible
// character in a source file is a bug waiting for the next editor.)
const INVISIBLE = [[0xa0, '&nbsp;'], [0x2011, '&#8209;'], [0x2060, '&#8288;']].map(([code, entity]) => [String.fromCharCode(code), entity]);
const ent = (s) => INVISIBLE.reduce((t, [ch, entity]) => t.split(ch).join(entity), s);
// `shape` is a template's text as written (white space aside); `norm` is a render in the
// form it is written in. Comparing shape(template) with norm(render) makes an invisible
// character typed into a template — not its entity — a drift, and --write rewrites it.
const shape = (s) => s.replace(/>\s+</g, '><').replace(/[ \t\r\n]+/g, ' ').trim();
const norm = (s) => shape(ent(s));
const clone = (v) => JSON.parse(JSON.stringify(v));

// Index just past the matching close tag of the element whose open tag ends at `from`.
function findClose(html, tag, from) {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { innerEnd: m.index, end: re.lastIndex };
  }
  throw new Error(`unbalanced <${tag}>`);
}

function indentBefore(html, idx) {
  const lineStart = html.lastIndexOf('\n', idx - 1) + 1;
  const ws = html.slice(lineStart, idx);
  return /^\s*$/.test(ws) ? ws : '';
}

function processPage(html, page, lang) {
  const doc = clone(seed[page]);
  // The «Публикации» block: the seed has no articles, so the twin holds the three
  // newest external materials (the live page adds published notes on top).
  if (page === 'home') {
    doc._feed = buildFeed([], seed.notes, lang).slice(0, 3);
    doc._privacyRepos = privacyRepos(seed.privacy);
  }
  // /privacy «Статьи» lists notes from KV: the seed has none, so the twin holds the lead and the link.
  if (page === 'privacy') doc._articles = [];
  const drift = [];
  let out = '';
  let pos = 0;
  const re = /<(\w+)(\s[^>]*?)?>/g;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[2] || '';
    const list = attrs.match(/\sdata-cms-list="([^"]+)"/);
    const isLd = /\sdata-cms-jsonld\b/.test(attrs) && m[1] === 'script';
    if (!list && !isLd) continue;
    const { innerEnd, end } = findClose(html, m[1], re.lastIndex);
    const oldInner = html.slice(re.lastIndex, innerEnd);
    let rendered;
    if (list) {
      const fn = renderers[list[1]];
      if (!fn) continue;
      rendered = fn(doc, lang, false);
    } else {
      rendered = renderPageJsonLd(doc, lang, page);
    }
    const closeIndent = indentBefore(html, innerEnd);
    const newInner = `\n${closeIndent}  ${ent(rendered).replace(/\n/g, '\n' + closeIndent + '  ')}\n${closeIndent}`;
    if (shape(oldInner) !== norm(rendered)) drift.push(list ? list[1] : 'jsonld');
    out += html.slice(pos, re.lastIndex) + newInner;
    pos = innerEnd;
    re.lastIndex = end;
  }
  out += html.slice(pos);
  const leaves = processLeaves(out, doc, lang);
  return { out: leaves.out, drift: drift.concat(leaves.drift) };
}

// --- The leaves: what overlay.js sets hook by hook ---

const NB = String.fromCharCode(0xa0);
// The value an attribute holds, entities resolved — to compare it with the doc's.
const unent = (s) =>
  s.split('&nbsp;').join(NB).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const absolutize = (p) => (/^https?:\/\//i.test(p) ? p : ORIGIN + p);
// hook → [the attribute it sets, how the doc's value becomes the attribute's, set an empty value?]
const ATTR_HOOKS = [
  ['content', 'content', (v) => v, true],
  ['href', 'href', (v) => safeHref(v), true],
  ['alt', 'alt', (v) => v, true],
  ['abs', 'content', absolutize, false],
];
// hook → the element's content for the doc's value
const INNER_HOOKS = {
  text: (v) => escapeHtml(v),
  md: (v) => renderProse(v),
  html: (v) => v,
};

function processLeaves(html, doc, lang) {
  const drift = [];
  const value = (path) => pick(resolvePath(doc, path), lang);

  // Attributes, inside the open tag itself.
  let out = html.replace(/<\w+\s[^>]*?data-cms-(?:content|href|alt|abs)="[^>]*>/g, (tag) => {
    let t = tag;
    for (const [hook, attr, map, setEmpty] of ATTR_HOOKS) {
      const m = t.match(new RegExp(`\\sdata-cms-${hook}="([^"]+)"`));
      if (!m) continue;
      const val = value(m[1]);
      if (val == null || (!setEmpty && !val)) continue;
      const want = map(String(val));
      const re = new RegExp(`(\\s${attr}=")([^"]*)(")`);
      const cur = t.match(re);
      if (cur && unent(cur[2]) === want) continue;
      drift.push(m[1]);
      const written = ent(escapeAttr(want));
      t = cur ? t.replace(re, (all, a, b, c) => a + written + c) : t.replace(/\s*\/?>$/, (close) => ` ${attr}="${written}"${close}`);
    }
    return t;
  });

  // Element content.
  let res = '';
  let pos = 0;
  const re = /<(\w+)(\s[^>]*?)?>/g;
  let m;
  while ((m = re.exec(out))) {
    const hook = (m[2] || '').match(/\sdata-cms-(text|md|html)="([^"]+)"/);
    if (!hook) continue;
    const val = value(hook[2]);
    // `{build}` in a verbatim block resolves at the edge to the deployed commit: no twin for it.
    if (val == null || /\{build\}/.test(String(val))) continue;
    const { innerEnd, end } = findClose(out, m[1], re.lastIndex);
    const oldInner = out.slice(re.lastIndex, innerEnd);
    // Prose: a paragraph (or a list) a line, as a person would write the template.
    const rendered = INNER_HOOKS[hook[1]](String(val)).replace(/(<\/(?:p|ul)>)(?=<(?:p|ul)\b)/g, '$1\n');
    if (shape(oldInner) === norm(rendered)) {
      re.lastIndex = end;
      continue;
    }
    drift.push(hook[2]);
    // A block written on its own lines keeps that shape; a leaf inside a line stays inline.
    const closeIndent = indentBefore(out, innerEnd);
    const block = /^\s*\n/.test(oldInner);
    const newInner = !block
      ? ent(rendered)
      : rendered === ''
        ? `\n${closeIndent}`
        : `\n${closeIndent}  ${ent(rendered).replace(/\n/g, '\n' + closeIndent + '  ')}\n${closeIndent}`;
    res += out.slice(pos, re.lastIndex) + newInner;
    pos = innerEnd;
    re.lastIndex = end;
  }
  res += out.slice(pos);
  return { out: res, drift };
}

const mode = process.argv.includes('--write') ? 'write' : 'check';
let failed = false;
for (const [file, page, lang] of PAGES) {
  const path = resolve(ROOT, file);
  const html = readFileSync(path, 'utf8');
  const { out, drift } = processPage(html, page, lang);
  if (mode === 'write') {
    if (out !== html) writeFileSync(path, out);
    console.log(`  ${out !== html ? 'WROTE ' : 'same  '} ${file}${drift.length ? '  (' + drift.join(', ') + ')' : ''}`);
  } else if (drift.length) {
    failed = true;
    console.log(`DRIFT ${file}: ${drift.join(', ')} differ from the seed render`);
  } else {
    console.log(`  ok   ${file}`);
  }
}
if (mode === 'check' && failed) {
  console.log('Run `node scripts/render-static.mjs --write` to regenerate the twins.');
  process.exit(1);
}
