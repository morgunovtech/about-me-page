// Code-side fixes for content stored in KV. A doc saved to KV keeps winning
// over `content.seed.json`, so a copy fix made in code reaches the live page
// only through this table — until the next /admin Save persists the fixed
// text, after which the entry is dead and gets removed.
//
// On 2026-11-09 (v1.0.1) the home and about docs were saved with every earlier
// swap and read-time migration applied (`migration: 31` in the doc), and those
// swaps and migrations were removed. Their history — the STALE entries of
// v0.30.1–v0.31.4 and the gated migrations, the last being v0.31.1 `homeV2` —
// is in git. The entries below are v1.5.0's.
//
// Rules for a new entry: a pure string (or /g regex) swap, idempotent — a
// second pass must change nothing, so anchor a whole-field swap with ^…$ when
// the new text contains the old one — and check it against the live KV doc
// (`npx wrangler kv key get … --remote`), not a screenshot: owner text holds
// NBSPs. A change to a doc's shape needs a read-time migration instead.
//
// No imports on purpose: Node tests load this file directly.

const STALE = [
  // v1.5.0 — a «more» link names what is behind it and carries no glyph of its
  // own (the renderer adds «→» / «↗»). Checked against the live pages of
  // 2026-11-25: the stored labels are these strings, with plain spaces.
  ['→ Подробнее на LinkedIn', 'Вся карьера на LinkedIn'],
  ['→ More on LinkedIn', 'Full career on LinkedIn'],
  ['→ Другие проекты на GitHub', 'Все проекты на GitHub'],
  ['→ More projects on GitHub', 'All projects on GitHub'],
  ['→ Все публикации', 'Все публикации'],
  ['→ All publications', 'All publications'],
  ['→ Консалтинг: форматы и цены', 'Форматы и цены консалтинга'],
  ['→ Consulting: formats and pricing', 'Consulting formats and pricing'],
  // v2.0.0 — consulting moved from /collaborate to /consulting; the homepage
  // doc in KV (rev 33, read 2026-11-25) links `/collaborate#consulting` and
  // `/en/collaborate#consulting`. One substring swap covers both.
  ['/collaborate#consulting', '/consulting#consulting'],
  // v2.2.1 — Korzinka Go reached 9 cities in 12 months, not 10 (owner, 2026-11-25;
  // his LinkedIn says «8 cities in 12 months»). The homepage doc in KV (rev 33,
  // read 2026-11-25) holds these strings with plain spaces.
  ['1 → 9 городов за 10 месяцев', '1 → 9 городов за 12 месяцев'],
  ['1 → 9 cities in 10 months', '1 → 9 cities in 12 months'],
];

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
