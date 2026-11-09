// Code-side fixes for content stored in KV. A doc saved to KV keeps winning
// over `content.seed.json`, so a copy fix made in code reaches the live page
// only through this table — until the next /admin Save persists the fixed
// text, after which the entry is dead and gets removed.
//
// The table is empty: on 2026-11-09 (v1.0.1) the home and about docs were
// saved with every earlier swap and read-time migration applied (`migration:
// 31` in the doc), and those swaps and migrations were removed. Their history
// — the STALE entries of v0.30.1–v0.31.4 and the gated migrations, the last
// being v0.31.1 `homeV2` — is in git.
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
