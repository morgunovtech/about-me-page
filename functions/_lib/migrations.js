// Read-time content migrations. A doc saved to KV before a seed change keeps
// winning over the seed, so content the templates/renderers now rely on is
// merged into the KV doc when it is read (idempotent, cheap). The next admin
// Save persists the migrated shape, after which these become no-ops.
// No imports on purpose: Node tests load this file directly, and the seed
// stays a plain JSON import inside content.js (import attributes are not
// understood by every bundler the Pages build system ships).

const clone = (v) => JSON.parse(JSON.stringify(v));

// Content-schema version the migrations bring a doc up to. Saved with the doc
// (save.js persists whatever the editor loaded), so a migrated-then-edited doc
// is never touched again: renaming or deleting a card later sticks.
export const MIGRATION = 29;

export function migrateHome(doc, seedDoc) {
  if (!doc || !seedDoc || !doc.sections) return doc;
  if ((doc.migration | 0) >= MIGRATION) return doc;
  doc.migration = MIGRATION;
  // v0.29: «Tofs DevOps» card (+ per-item JSON-LD `schema`) added to products.
  const prods = doc.sections.products;
  const seedItems = (seedDoc.sections && seedDoc.sections.products && seedDoc.sections.products.items) || [];
  if (prods && Array.isArray(prods.items)) {
    for (const seedItem of seedItems) {
      const mine = prods.items.find((it) => it && it.name === seedItem.name);
      if (!mine) prods.items.push(clone(seedItem));
      else if (seedItem.schema && !mine.schema) mine.schema = clone(seedItem.schema);
    }
  }
  // v0.29: the CHANNEL meta is a template with a live counter, not a literal.
  const pubs = doc.sections.publications && doc.sections.publications.items;
  if (Array.isArray(pubs)) {
    for (const it of pubs) {
      if (!it || it.tag !== 'CHANNEL' || !it.meta || typeof it.meta !== 'object') continue;
      for (const l of ['ru', 'en']) {
        const v = it.meta[l];
        if (typeof v === 'string' && /^[\d\s\u00a0,.]+\s+(в|on)\s+Telegram$/i.test(v)) {
          it.meta[l] = l === 'en' ? '{telegram} on Telegram' : '{telegram} в Telegram';
        }
      }
    }
  }
  // The counters fall back to the subscribers stat — make sure one exists.
  if (Array.isArray(doc.stats) && !doc.stats.some((st) => st && st.kind === 'subscribers')) {
    const seedStat = (seedDoc.stats || []).find((st) => st && st.kind === 'subscribers');
    if (seedStat) doc.stats.splice(Math.min(2, doc.stats.length), 0, clone(seedStat));
  }
  return doc;
}

// v0.29: the /about «layers» block quotes the subscriber snapshot; refresh the
// old figures (5 831 = 1 139 + 4 564 + 128) to the current ones.
const ABOUT_NUMBERS = [
  ['5&nbsp;831 подписчик<', '6&nbsp;069 подписчиков<'],
  ['5&nbsp;831', '6&nbsp;069'],
  ['1&nbsp;139', '1&nbsp;141'],
  ['4&nbsp;564', '4&nbsp;800'],
  ['5,831', '6,069'],
  ['1,139', '1,141'],
  ['4,564', '4,800'],
];
export function migrateAbout(doc) {
  if (!doc || !doc.sections) return doc;
  if ((doc.migration | 0) >= MIGRATION) return doc;
  doc.migration = MIGRATION;
  const body = doc.sections.layers && doc.sections.layers.body;
  if (body && typeof body === 'object') {
    for (const l of ['ru', 'en']) {
      if (typeof body[l] !== 'string') continue;
      for (const [a, b] of ABOUT_NUMBERS) body[l] = body[l].split(a).join(b);
    }
  }
  // The build hash is not content: «Build <code>abc1234</code>» → {build},
  // resolved at render time (overlay.js) from the deployed SHA.
  for (const sec of Object.values(doc.sections)) {
    const b = sec && sec.body;
    if (!b || typeof b !== 'object') continue;
    for (const l of ['ru', 'en']) {
      if (typeof b[l] === 'string') b[l] = b[l].replace(/Build <code>[0-9a-f]{7,40}<\/code>/g, 'Build <code>{build}</code>');
    }
  }
  return doc;
}

