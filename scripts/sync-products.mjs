#!/usr/bin/env node
// Syncs the homepage product cards (content.seed.json → home.sections.products)
// with their GitHub repos. Zero dependencies; reads GitHub through `gh api`
// (your gh login).
//
//   node scripts/sync-products.mjs           # dry run: prints what would change
//   node scripts/sync-products.mjs --write   # updates content.seed.json
//
// Then: `node scripts/render-static.mjs --write` (static twins) and, to put it
// live, `node scripts/kv-push.mjs home` — the live page renders from KV.
//
// Per card with a `repo` field:
// - version: the highest version the repo declares — latest release, tags,
//   package.json, pyproject.toml, the first CHANGELOG.md heading — shown as
//   vMAJOR.MINOR. No version anywhere → the card keeps its own and a warning
//   says so (tag a release to fix it).
// - description: EN = the repo description, RU = README.ru.md (the H1's part
//   after «—», then the first paragraph). Updated only when BOTH exist, so the
//   two languages never drift apart; otherwise the card keeps its text and a
//   warning says which side is missing. Emoji and markdown are stripped (the
//   site has no emoji).
// The card order, names, tags, buttons and links are the seed's — edit them there.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = resolve(ROOT, 'content.seed.json');
const WRITE = process.argv.includes('--write');

function gh(path) {
  try {
    return JSON.parse(execFileSync('gh', ['api', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
  } catch {
    return null;
  }
}
function ghFile(repo, path) {
  const f = gh(`repos/${repo}/contents/${path}`);
  return f && f.content ? Buffer.from(f.content, 'base64').toString('utf8') : null;
}

const SEMVER = /v?(\d+)\.(\d+)(?:\.(\d+))?/;
const parse = (s) => {
  const m = SEMVER.exec(String(s || ''));
  return m ? [+m[1], +m[2], +(m[3] || 0)] : null;
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function versionFrom(repo) {
  const found = [];
  const add = (src, raw) => { const v = parse(raw); if (v) found.push({ src, v }); };
  const rel = gh(`repos/${repo}/releases/latest`);
  if (rel && rel.tag_name) add('release', rel.tag_name);
  const tags = gh(`repos/${repo}/tags`);
  if (Array.isArray(tags)) for (const t of tags.slice(0, 20)) add('tag', t.name);
  const pkg = ghFile(repo, 'package.json');
  if (pkg) { try { add('package.json', JSON.parse(pkg).version); } catch { /* not JSON */ } }
  const py = ghFile(repo, 'pyproject.toml');
  if (py) add('pyproject.toml', (/^version\s*=\s*"([^"]+)"/m.exec(py) || [])[1]);
  const cl = ghFile(repo, 'CHANGELOG.md');
  if (cl) add('CHANGELOG.md', (/^#{1,3}\s*\[?v?(\d+\.\d+(?:\.\d+)?)/m.exec(cl) || [])[1]);
  if (!found.length) return null;
  found.sort((a, b) => cmp(b.v, a.v));
  const best = found[0];
  return { version: `v${best.v[0]}.${best.v[1]}`, sources: found.filter((f) => cmp(f.v, best.v) === 0).map((f) => f.src) };
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
export const plain = (s) =>
  String(s || '')
    .replace(EMOJI, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [text](url) → text
    .replace(/\*\*|__|`/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
const sentence = (s) => (s && !/[.!?…]$/.test(s) ? s + '.' : s);

// RU text from a README.ru.md: «H1 tail after —» + the first paragraph.
export function ruFromReadme(md) {
  const lines = String(md || '').split('\n');
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  if (h1 < 0) return null;
  const tail = (lines[h1].split(/\s—\s/)[1] || '').trim();
  const para = [];
  for (const l of lines.slice(h1 + 1)) {
    if (!l.trim()) { if (para.length) break; continue; }
    if (/^#{1,6}\s/.test(l)) break;
    para.push(l.replace(/^>\s?/, '').trim());
  }
  const body = plain(para.join(' '));
  if (!body) return null;
  const lead = tail ? sentence(plain(tail[0].toUpperCase() + tail.slice(1))) + ' ' : '';
  return sentence(lead + body);
}

function main() {
  const seed = JSON.parse(readFileSync(SEED, 'utf8'));
  const items = seed.home.sections.products.items;
  let changed = 0;
  const warn = [];
  for (const it of items) {
    if (!it.repo) continue;
    const repo = gh(`repos/${it.repo}`);
    if (!repo) { warn.push(`${it.name}: ${it.repo} not reachable with gh — skipped`); continue; }
    const v = versionFrom(it.repo);
    if (!v) warn.push(`${it.name}: no version on GitHub (release, tag, package.json, pyproject.toml, CHANGELOG) — kept ${it.version}`);
    else if (v.version !== it.version) {
      console.log(`${it.name}: version ${it.version} → ${v.version} (${v.sources.join(', ')})`);
      it.version = v.version;
      changed++;
    }
    const en = sentence(plain(repo.description));
    const ru = ruFromReadme(ghFile(it.repo, 'README.ru.md'));
    if (!en || !ru) {
      warn.push(`${it.name}: description kept — missing on GitHub: ${[!en && 'repo description (EN)', !ru && 'README.ru.md (RU)'].filter(Boolean).join(', ')}`);
      continue;
    }
    if (it.desc.en !== en || it.desc.ru !== ru) {
      console.log(`${it.name}: description\n  EN ${it.desc.en}\n   → ${en}\n  RU ${it.desc.ru}\n   → ${ru}`);
      it.desc = { ru, en };
      changed++;
    }
  }
  for (const w of warn) console.log('warning: ' + w);
  if (!changed) console.log('products are in sync with GitHub');
  else if (WRITE) {
    writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
    console.log(`wrote ${changed} change(s) to content.seed.json — next: node scripts/render-static.mjs --write, then node scripts/kv-push.mjs home`);
  } else console.log(`${changed} change(s) — run with --write to apply`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
