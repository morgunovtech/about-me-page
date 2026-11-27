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

// v4.9.2 (owner, 2026-11-27): the reply time is 7 working days, not 10 (home
// «Связаться», /consulting), and the home contact note drops «или e-com». Regexes,
// so a no-break space or hyphen the owner's text may hold still matches; each
// swap is idempotent (its result no longer matches). Remove the entries once a
// Save of home and consulting has stored the new text.
const STALE = [
  [/(?<![\d])10([ \u00a0])рабочих дней/g, '7$1рабочих дней'],
  [/(?<![\d])10([ \u00a0])business days/g, '7$1business days'],
  [/на продукт([ \u00a0])или e[-\u2011]com или хотите/g, 'на продукт$1или хотите'],
  [/on a product or e[-\u2011]com, or want/g, 'on a product, or want'],
  // v4.10.1 (owner, 2026-11-27): TofsDevOps' card opens with what it is and for whom, not
  // «Сам себе DevOps в Telegram» — the card's «Telegram-бот» label says the rest. The RU text
  // is the bot README's new lead (sync-products.mjs reads it); the EN one its repo description.
  [/Сам[ \u00a0]себе[ \u00a0]DevOps[ \u00a0]в[ \u00a0]Telegram\./g, 'Мониторинг сайтов для тех, кто не знает, что такое DNS и ошибка 502.'],
  [/Your personal DevOps in Telegram\./g, 'Website monitoring for people who have never heard of DNS or a 502.'],
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

// Fields a renderer reads that a KV doc saved before they existed may lack:
// the seed supplies them, only when missing — never over what the owner saved —
// until the next /admin Save stores them with the doc. v2.2.2 moved the
// homepage /privacy link from the template into the products renderer, and
// the home doc in KV (rev 33) had no `sections.products.privacy`: the link
// vanished from the live page until v2.2.3 filled it here. The rev 34 Save
// (v4.0.1) stored it. v4.7.0 filled `stats.2.channels.instagram` (Instagram,
// a new channel of the subscribers stat) until `kv-push.mjs home` stored it
// with the doc (rev 42, 2026-11-27), so the table is empty again. An entry is
// { page: ['a.b.c'] }.
// v4.10.2: «10 лет в IT» links the career (`stats.0.href`, as «8 своих проектов» links the
// projects since v4.6.0); the home doc in KV has no href on its first stat.
export const SEED_FILL = { home: ['stats.0.href'] };

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
