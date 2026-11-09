#!/usr/bin/env node
// The committed HTML pages are the seed's twins: every `data-cms-list`
// container and `data-cms-jsonld` script holds exactly what the edge renderer
// emits for content.seed.json. That twin is the fallback when KV is empty or
// an overlay handler throws, and it is what `python3 -m http.server` shows.
//
//   node scripts/render-static.mjs --check   # exit 1 when a template drifted
//   node scripts/render-static.mjs --write   # regenerate the twins in place
//
// Zero dependencies: imports the same renderers the Functions use.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { renderers } from '../functions/_lib/render.js';
import { renderPageJsonLd } from '../functions/_lib/jsonld.js';
import { buildFeed } from '../functions/_lib/notes-feed.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const seed = JSON.parse(readFileSync(resolve(ROOT, 'content.seed.json'), 'utf8'));

const PAGES = [
  ['index.html', 'home', 'ru'],
  ['en/index.html', 'home', 'en'],
  ['collaborate.html', 'collaborate', 'ru'],
  ['en/collaborate.html', 'collaborate', 'en'],
  ['about.html', 'about', 'ru'],
  ['en/about.html', 'about', 'en'],
  ['uses.html', 'uses', 'ru'],
  ['en/uses.html', 'uses', 'en'],
];

// Entities vs. literal NBSP are the same HTML — compare and write the entity form.
const ent = (s) => s.replace(/\u00a0/g, '&nbsp;');
const norm = (s) => ent(s).replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();
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
  if (page === 'home') doc._feed = buildFeed([], seed.notes, lang).slice(0, 3);
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
    if (norm(oldInner) !== norm(rendered)) drift.push(list ? list[1] : 'jsonld');
    out += html.slice(pos, re.lastIndex) + newInner;
    pos = innerEnd;
    re.lastIndex = end;
  }
  out += html.slice(pos);
  return { out, drift };
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
