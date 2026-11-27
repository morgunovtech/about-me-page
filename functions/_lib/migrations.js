// Code-side fixes for content stored in KV. A doc saved to KV keeps winning
// over `content.seed.json`, so a copy fix made in code reaches the live page
// only through this table — until the next /admin Save persists the fixed
// text, after which the entry is dead and gets removed.
//
// On 2026-11-09 (v1.0.1) the home and about docs were saved with every earlier
// swap and read-time migration applied (`migration: 31` in the doc), and those
// swaps and migrations were removed. On 2026-11-25 (v4.0.1) the home doc was
// saved again through /admin (rev 34) with the entries of v1.5.0, v2.0.0 and
// v2.2.1 and the seed fill of v2.2.3 applied, and both tables were emptied
// again (the about doc went with v4.0.0). Their history is in git.
//
// Rules for a new entry: a pure string (or /g regex) swap, idempotent — a
// second pass must change nothing, so anchor a whole-field swap with ^…$ when
// the new text contains the old one — and check it against the live KV doc
// (`npx wrangler kv key get … --remote`), not a screenshot: owner text holds
// NBSPs. A change to a doc's shape needs a read-time migration instead.
//
// No imports on purpose: Node tests load this file directly.

const STALE = [];

export function fixStaleContent(node) {
  if (!STALE.length) return node;
  if (Array.isArray(node)) {
    node.forEach(fixStaleContent);
    return node;
  }
  if (!node || typeof node !== 'object') return node;
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string') {
      const fixed = STALE.reduce((s, [from, to]) => s.replaceAll(from, to), v);
      if (fixed !== v) node[k] = fixed;
    } else fixStaleContent(v);
  }
  return node;
}

// Fields a renderer reads that a KV doc saved before they existed may lack:
// the seed supplies them, only when missing — never over what the owner saved —
// until the next /admin Save stores them with the doc. v2.2.2 moved the
// homepage /privacy link from the template into the products renderer, and
// the home doc in KV (rev 33) had no `sections.products.privacy`: the link
// vanished from the live page until v2.2.3 filled it here. The rev 34 Save
// (v4.0.1) stored it. v4.7.0 made Instagram a channel of the subscribers stat
// (the third figure of the homepage, `stats.2`): the home doc in KV (rev 41)
// has no `channels.instagram`, so the homepage and `llms.txt` would leave it
// out of the total until `kv-push.mjs home` stores it — then remove the entry.
// An entry is { page: ['a.b.c'] }.
export const SEED_FILL = { home: ['stats.2.channels.instagram'] };

export function fillFromSeed(doc, page, from, table = SEED_FILL) {
  const paths = table[page];
  const src = from && from[page];
  if (!doc || !paths || !src || doc === src) return doc;
  for (const path of paths) {
    const keys = path.split('.');
    const value = keys.reduce((o, k) => (o == null ? undefined : o[k]), src);
    if (value === undefined) continue;
    let node = doc;
    for (const k of keys.slice(0, -1)) {
      if (node[k] == null || typeof node[k] !== 'object') { node = null; break; }
      node = node[k];
    }
    const last = keys[keys.length - 1];
    if (node && node[last] === undefined) node[last] = JSON.parse(JSON.stringify(value));
  }
  return doc;
}
