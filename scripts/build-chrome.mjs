#!/usr/bin/env node
// ds/v1/chrome.js is script.js without the regions marked «site-only»: the
// theme, the dropdown controller (mobile nav, language, theme) and the anchor
// navigation, for every service of the family. One source, one checked twin —
// the same idea as the static twins and the critical-CSS check.
//
//   node scripts/build-chrome.mjs --check   # exit 1 when ds/v1/chrome.js drifted (check.sh runs this)
//   node scripts/build-chrome.mjs --write   # regenerate it after editing script.js
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'script.js');
const OUT = join(root, 'ds/v1/chrome.js');

const HEADER = `/* morgunov.tech design system — v1 — chrome.js
   The behaviour of the family chrome: the theme (four themes, the
   «theme-preference» key), one dropdown controller for the mobile nav, the
   language menu and the theme menu, and the anchor navigation of .v4-bar-mid.
   Markup and rules: ds/v1/USAGE.md, «Service chrome».
   GENERATED from /script.js by scripts/build-chrome.mjs — edit script.js,
   then run the script with --write. */
`;

export function buildChrome(source) {
  const start = /^[ \t]*\/\* site-only:start[\s\S]*?\*\/\n/m;
  const end = /^[ \t]*\/\* site-only:end \*\/\n/m;
  let out = source;
  let regions = 0;
  for (;;) {
    const s = start.exec(out);
    if (!s) break;
    const rest = out.slice(s.index + s[0].length);
    const e = end.exec(rest);
    if (!e) throw new Error('site-only:start without a matching site-only:end');
    out = out.slice(0, s.index) + rest.slice(e.index + e[0].length);
    regions += 1;
  }
  if (!regions) throw new Error('script.js has no site-only region: the markers are gone');
  if (/site-only:/.test(out)) throw new Error('a stray site-only marker is left');
  // Collapse the blank lines the cut leaves behind.
  out = out.replace(/\n{3,}/g, '\n\n');
  return HEADER + out;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const mode = process.argv[2];
  const built = buildChrome(readFileSync(SRC, 'utf8'));
  if (mode === '--write') {
    writeFileSync(OUT, built);
    console.log('wrote ds/v1/chrome.js (' + built.length + ' bytes)');
  } else if (mode === '--check') {
    let current = '';
    try { current = readFileSync(OUT, 'utf8'); } catch { /* missing file = drift */ }
    if (current !== built) {
      console.error('ds/v1/chrome.js is not the twin of script.js — run: node scripts/build-chrome.mjs --write');
      process.exit(1);
    }
    console.log('ok: ds/v1/chrome.js is the twin of script.js');
  } else {
    console.error('usage: node scripts/build-chrome.mjs --check | --write');
    process.exit(2);
  }
}
