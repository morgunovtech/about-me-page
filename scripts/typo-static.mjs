#!/usr/bin/env node
// Typesets the hand-written text of the static templates — the text no renderer
// builds and no overlay touches on its way to a visitor: the footer of every
// page, and the whole <main> of the pages without a CMS doc (/thanks,
// /social-tracker, /404).
// A CMS page gets the site's typography pass at the edge (overlay.js → typo()
// in functions/_lib/markdown.js); these files get the same pass here, written
// into them as entities — so «и», «в», «у» do not hang at a line's end on
// /thanks, and a footer line never starts with «·».
//
//   node scripts/typo-static.mjs --check   # exit 1 when a file is not typeset
//   node scripts/typo-static.mjs --write   # typeset in place
//
// Run --write after editing the text of /thanks, /social-tracker, /404 or a
// footer; check.sh runs --check. Zero dependencies.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { typo } from '../functions/_lib/markdown.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = ['index', 'consulting', 'collaborate', 'uses', 'privacy', 'thanks', 'social-tracker'];
// The one bilingual file (404.html) is Russian in its text nodes; its English
// copy lives in data-i18n-* attributes, which a typography pass never touches.
export const FILES = [
  ...PAGES.map((p) => [p + '.html', 'ru']),
  ...PAGES.map((p) => ['en/' + p + '.html', 'en']),
  ['404.html', 'ru'],
];
const WHOLE_MAIN = new Set(['thanks.html', 'en/thanks.html', 'social-tracker.html', 'en/social-tracker.html', '404.html']);
const FOOT = /<footer class="v4-foot">[\s\S]*?<\/footer>/g;
const MAIN = /<main\b[\s\S]*?<\/main>/g;

// In a template the invisible characters are entities: a no-break space, a
// non-breaking hyphen, a word joiner. (Built from their codes: an invisible
// character in a source file is a bug waiting for the next editor.)
const CHARS = [[0xa0, '&nbsp;'], [0x2011, '&#8209;'], [0x2060, '&#8288;']].map(([code, entity]) => [String.fromCharCode(code), entity]);
const decode = (s) => CHARS.reduce((t, [ch, entity]) => t.split(entity).join(ch), s);
const encode = (s) => CHARS.reduce((t, [ch, entity]) => t.split(ch).join(entity), s);

// Pure: the typeset text of a template. Tests call it.
export function typeset(html, file, lang) {
  const region = (s) => encode(typo(decode(s), lang));
  const out = html.replace(FOOT, region);
  return WHOLE_MAIN.has(file) ? out.replace(MAIN, region) : out;
}

function main() {
  const WRITE = process.argv.includes('--write');
  const drift = [];
  for (const [file, lang] of FILES) {
    const path = resolve(ROOT, file);
    const html = readFileSync(path, 'utf8');
    const out = typeset(html, file, lang);
    if (out === html) continue;
    drift.push(file);
    if (WRITE) writeFileSync(path, out);
  }
  if (!drift.length) {
    console.log(`typo-static: ${FILES.length} templates typeset`);
    return;
  }
  if (WRITE) {
    console.log(`typo-static: typeset ${drift.join(', ')}`);
    return;
  }
  console.error(`typo-static: not typeset — ${drift.join(', ')}\n  run: node scripts/typo-static.mjs --write`);
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
