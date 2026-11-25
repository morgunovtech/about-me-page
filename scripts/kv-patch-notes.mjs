#!/usr/bin/env node
// Applies a file of exact text corrections to notes in production KV the way an
// /admin Save does — rev + 1, updatedAt/dateModified, a `:rev:<n>` copy, the
// `:revs` history index (last 20) and the note's row in the `articles` index.
// Notes live only in KV (there is no seed for them), and agents cannot write
// production KV: a proofreading pass ends in a patch file, and the owner runs this.
// Zero dependencies; talks to KV through `npx wrangler` (your wrangler login).
//
//   node scripts/kv-patch-notes.mjs patch.json          # dry run: every change in context
//   node scripts/kv-patch-notes.mjs patch.json --yes    # write it
//
// The patch file:
//   { "notes": { "<slug>": [ { "field": "body.ru", "from": "…", "to": "…", "why": "…" } ] } }
// `field` is title|excerpt|body + .ru|.en. `from` must occur in that field exactly
// once (or `"count": n` times) — otherwise the note is skipped and reported, and
// nothing of it is written: a correction never lands in the wrong place. A change
// of a title or an excerpt is repeated in the copies the doc keeps of them
// (meta.title / share.title, meta.description / share.description) where those
// still hold the old text. A second run changes nothing (the `from` is gone).
// The edge cache is not purged from here: the pages update within 300 s.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 's.morgunov.tech';
const HISTORY_MAX = 20; // as in functions/admin/api/save.js
const FIELD = /^(title|excerpt|body)\.(ru|en)$/;
const COPIES = { title: [['meta', 'title'], ['share', 'title']], excerpt: [['meta', 'description'], ['share', 'description']] };

// npx by its full path — the one that ships with the Node running this script —
// not whatever a PATH entry happens to resolve first.
const NPX = join(dirname(process.execPath), process.platform === 'win32' ? 'npx.cmd' : 'npx');

const count = (text, part) => (part ? String(text).split(part).length - 1 : 0);

// Pure: the corrected doc and what happened to each entry. No I/O — tests call it.
export function applyPatch(doc, entries) {
  const out = structuredClone(doc);
  const log = [];
  for (const e of entries) {
    const m = FIELD.exec(e.field || '');
    if (!m) { log.push({ ...e, status: 'bad-field' }); continue; }
    const [, name, lang] = m;
    const cur = out[name] && out[name][lang];
    if (typeof cur !== 'string') { log.push({ ...e, status: 'no-field' }); continue; }
    const want = e.count || 1;
    const n = count(cur, e.from);
    if (n === 0 && count(cur, e.to) >= 1) { log.push({ ...e, status: 'already' }); continue; }
    if (n !== want) { log.push({ ...e, status: n === 0 ? 'not-found' : 'ambiguous', found: n }); continue; }
    out[name][lang] = cur.split(e.from).join(e.to);
    for (const [a, b] of COPIES[name] || []) {
      const copy = out[a] && out[a][b];
      if (copy && typeof copy[lang] === 'string' && count(copy[lang], e.from) === want) copy[lang] = copy[lang].split(e.from).join(e.to);
    }
    log.push({ ...e, status: 'applied' });
  }
  return { doc: out, log, ok: log.every((x) => x.status === 'applied' || x.status === 'already') };
}

// The feed/sitemap row of a note — functions/_lib/articles.js, indexEntry().
export function indexRow(doc) {
  const tags = [...new Set((Array.isArray(doc.tags) ? doc.tags : []).map((t) => String(t || '').trim().toLowerCase()).filter((t) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(t) && t.length <= 40))].slice(0, 5);
  return {
    slug: doc.slug,
    title: doc.title,
    excerpt: doc.excerpt || { ru: '', en: '' },
    date: doc.date || '',
    status: doc.status || 'draft',
    tags,
    cover: doc.cover && doc.cover.src ? { src: doc.cover.src } : null,
    updatedAt: doc.updatedAt,
  };
}

const context = (text, part) => {
  const i = String(text).indexOf(part);
  if (i < 0) return '';
  const a = Math.max(0, i - 40);
  return (a ? '…' : '') + String(text).slice(a, i + part.length + 40).replace(/\s+/g, ' ') + '…';
};

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  const YES = args.includes('--yes');
  if (!file) {
    console.error('usage: node scripts/kv-patch-notes.mjs <patch.json> [--yes]');
    process.exit(2);
  }
  const patch = JSON.parse(readFileSync(resolve(process.cwd(), file), 'utf8')).notes || {};

  const wrangler = (...a) =>
    execFileSync(NPX, ['wrangler', 'kv', 'key', ...a, '--binding', 'CONTENT', '--remote'], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024,
    });
  const kvGet = (key) => {
    try {
      return JSON.parse(wrangler('get', key));
    } catch (e) {
      if (/404|not found/i.test(String(e.stderr || e.message))) return null;
      throw new Error(`could not read ${key} from KV (is \`npx wrangler whoami\` logged in?)\n${e.stderr || e.message}`);
    }
  };
  const dir = mkdtempSync(join(tmpdir(), 'kv-patch-notes-'));
  const kvPut = (key, value) => {
    const f = join(dir, key.replace(/[^a-z0-9.-]/gi, '_') + '.json');
    writeFileSync(f, JSON.stringify(value));
    wrangler('put', key, '--path', f);
  };

  const ready = [];
  let skipped = 0;
  for (const [slug, entries] of Object.entries(patch)) {
    const key = `${SITE}:article:${slug}`;
    const cur = kvGet(key);
    if (!cur) { console.log(`\n${slug}: no such note in KV — skipped`); skipped++; continue; }
    const { doc, log, ok } = applyPatch(cur, entries);
    const applied = log.filter((x) => x.status === 'applied');
    console.log(`\n${slug} (rev ${cur.rev}): ${applied.length} of ${entries.length} correction(s)`);
    for (const x of log) {
      if (x.status === 'applied') console.log(`  ${x.field}\n    - ${context(cur[x.field.split('.')[0]][x.field.split('.')[1]], x.from)}\n    + ${x.to.replace(/\s+/g, ' ').slice(0, 160)}`);
      else console.log(`  ${x.field}: ${x.status}${x.found != null ? ` (found ${x.found})` : ''} — «${String(x.from).slice(0, 70)}»`);
    }
    if (!ok) { console.log('  → this note is NOT written: fix the entries above in the patch file.'); skipped++; continue; }
    if (applied.length) ready.push({ slug, key, cur, doc });
  }

  console.log(`\n${ready.length} note(s) to write, ${skipped} skipped.`);
  if (!YES || !ready.length) {
    if (!YES) console.log('Dry run. Run with --yes to write.');
    return;
  }

  const written = [];
  for (const { slug, key, cur, doc } of ready) {
    // Re-read right before writing: an /admin Save in between would be overwritten.
    const now = kvGet(key);
    if ((now?.rev ?? null) !== (cur.rev ?? null)) { console.log(`${slug}: changed while this ran (rev ${cur.rev} → ${now?.rev}) — skipped, run again`); continue; }
    writeFileSync(join(dir, `backup-${slug}-rev${cur.rev}.json`), JSON.stringify(cur, null, 2));
    doc.rev = (cur.rev || 0) + 1;
    doc.updatedAt = new Date().toISOString();
    doc.dateModified = doc.updatedAt.slice(0, 10);
    kvPut(key, doc);
    kvPut(`${key}:rev:${doc.rev}`, doc);
    const revs = kvGet(`${key}:revs`) || [];
    revs.unshift({ rev: doc.rev, updatedAt: doc.updatedAt });
    kvPut(`${key}:revs`, revs.slice(0, HISTORY_MAX));
    for (const old of revs.slice(HISTORY_MAX)) wrangler('delete', `${key}:rev:${old.rev}`);
    written.push(doc);
    console.log(`wrote ${slug} rev ${doc.rev}`);
  }
  if (!written.length) return;
  // The index last, read right before the write: one doc for all notes.
  const index = kvGet(`${SITE}:articles`) || [];
  for (const doc of written) {
    const i = index.findIndex((a) => a && a.slug === doc.slug);
    if (i >= 0) index[i] = indexRow(doc); else index.unshift(indexRow(doc));
  }
  kvPut(`${SITE}:articles`, index);
  console.log(`\nThe index is updated; the previous docs are backed up in ${dir}.`);
  console.log('The live pages update within 300 s (edge cache).');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
