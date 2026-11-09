#!/usr/bin/env node
// Puts a page's content.seed.json doc live: writes it to production KV the way
// an /admin Save does — rev + 1, updatedAt/dateModified, a `:rev:<n>` copy and
// the `:revs` history index (last 20, pruned copies deleted). Zero dependencies;
// talks to KV through `npx wrangler` (your wrangler login).
//
//   node scripts/kv-push.mjs home          # dry run: what would change on the live page
//   node scripts/kv-push.mjs home --yes    # write it
//   node scripts/kv-push.mjs uses --create # first KV doc for a page that renders from the seed
//
// Use it after a content change committed to the seed (scripts/sync-products.mjs,
// a copy fix) — a KV doc wins over the seed, so the seed alone never reaches the
// live page. It replaces the whole doc: an /admin edit that is not in the seed
// is lost, which is why the dry run lists every field that changes. The old doc
// stays in /admin's version history (and is backed up to a temp file).
// The edge cache is not purged from here (it lives inside the worker): the
// pages update within 300 s.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 's.morgunov.tech';
const HISTORY_MAX = 20; // as in functions/admin/api/save.js
const PAGES = ['home', 'collaborate', 'about', 'uses'];

const args = process.argv.slice(2);
const page = args.find((a) => !a.startsWith('--'));
const YES = args.includes('--yes');
const CREATE = args.includes('--create');
if (!PAGES.includes(page)) {
  console.error(`usage: node scripts/kv-push.mjs <${PAGES.join('|')}> [--yes] [--create]`);
  process.exit(2);
}

const wrangler = (...a) =>
  execFileSync('npx', ['wrangler', 'kv', 'key', ...a, '--binding', 'CONTENT', '--remote'], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
function kvGet(key) {
  try {
    return JSON.parse(wrangler('get', key));
  } catch (e) {
    if (/404|not found/i.test(String(e.stderr || e.message))) return null;
    throw new Error(`could not read ${key} from KV (is \`npx wrangler whoami\` logged in?)\n${e.stderr || e.message}`);
  }
}
const dir = mkdtempSync(join(tmpdir(), `kv-push-${page}-`));
function kvPut(key, value) {
  const f = join(dir, key.replace(/[^a-z0-9.-]/gi, '_') + '.json');
  writeFileSync(f, JSON.stringify(value));
  wrangler('put', key, '--path', f);
}

const META = new Set(['rev', 'updatedAt', 'dateModified']);
function leaves(o, p = '', out = {}) {
  if (o && typeof o === 'object') for (const k of Object.keys(o)) leaves(o[k], p ? `${p}.${k}` : k, out);
  else out[p] = o;
  return out;
}
const short = (v) => (v === undefined ? '—' : JSON.stringify(v).slice(0, 140));

const seed = JSON.parse(readFileSync(resolve(ROOT, 'content.seed.json'), 'utf8'))[page];
const key = `${SITE}:${page}`;
const cur = kvGet(key);
if (!cur && !CREATE) {
  console.log(`${key} has no KV doc — the page renders from the seed already, nothing to push.`);
  console.log('Pass --create to make one anyway (from then on KV wins over the seed).');
  process.exit(0);
}

const a = leaves(cur || {});
const b = leaves(seed);
const diff = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(
  (k) => !META.has(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]),
);
if (!diff.length) {
  console.log(`${key} (rev ${cur.rev}) already matches the seed.`);
  process.exit(0);
}
console.log(`${key}: rev ${cur ? cur.rev : '(none)'} → ${(cur?.rev || 0) + 1}, ${diff.length} field(s) change:`);
for (const k of diff) console.log(`  ${k}\n    ${short(a[k])}\n  → ${short(b[k])}`);
if (!YES) {
  console.log('\nDry run. Run with --yes to write it.');
  process.exit(0);
}

// Re-read right before writing: an /admin Save in between would be overwritten.
const now = kvGet(key);
if ((now?.rev ?? null) !== (cur?.rev ?? null)) {
  console.error(`${key} changed while this ran (rev ${cur?.rev} → ${now?.rev}); run it again.`);
  process.exit(1);
}
if (cur) writeFileSync(join(dir, `backup-rev${cur.rev}.json`), JSON.stringify(cur, null, 2));

const doc = structuredClone(seed);
doc.rev = (cur?.rev || 0) + 1;
doc.updatedAt = new Date().toISOString();
doc.dateModified = doc.updatedAt.slice(0, 10);
kvPut(key, doc);
kvPut(`${key}:rev:${doc.rev}`, doc);
const idx = kvGet(`${key}:revs`) || [];
idx.unshift({ rev: doc.rev, updatedAt: doc.updatedAt });
kvPut(`${key}:revs`, idx.slice(0, HISTORY_MAX));
for (const old of idx.slice(HISTORY_MAX)) wrangler('delete', `${key}:rev:${old.rev}`);

console.log(`\nwrote ${key} rev ${doc.rev}${cur ? ` (previous doc backed up to ${dir}/backup-rev${cur.rev}.json)` : ''}.`);
console.log('The live pages update within 300 s (edge cache).');
