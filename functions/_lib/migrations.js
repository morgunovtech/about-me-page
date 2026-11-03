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
export const MIGRATION = 30;

// Content that went dead after it was saved: a doc saved to KV before the
// templates and the seed were fixed keeps serving it — KV wins over the seed
// until someone re-saves in /admin. Unlike the numbered migrations above these
// swaps are deliberately NOT gated by MIGRATION: each is a pure string swap,
// idempotent and safe to re-run on every read, so it needs none of the "don't
// touch an edited doc" ceremony. Walks every leaf, `href` included — that is
// exactly where the links live.
const STALE = [
  // v0.30.1: the ask@ address never received mail.
  ['ask@morgunov.tech', 's@morgunov.tech'],
  // v0.30.4: the repo is private, so the footer no longer links the commit and
  // /about stops promising an open repo.
  ['Репозиторий открыт, build hash в футере кликабельный на коммит в GitHub. Каждый может увидеть, что и когда менялось.',
    'Build hash в футере — коммит, который сейчас в продакшене.'],
  ['Repo is open, the build hash in the footer links to the commit on GitHub. Anyone can see what changed and when.',
    'The build hash in the footer is the commit currently in production.'],
  [' в футере кликабельный GitHub)', ' в футере)'],
  [' в футере, кликабельный на коммит в GitHub)', ' в футере)'],
  [' in the footer, clickable through to the commit on GitHub)', ' in the footer)'],
  [' Репозиторий открыт; если хотите завести issue или PR — добро пожаловать.', ''],
  [' The repo is open; if you want to file an issue or a PR — welcome.', ''],
  // v0.30.4: korzinka.uz/go answers 502 — the homepage is the stable address.
  [/https:\/\/korzinka\.uz\/go\b/g, 'https://korzinka.uz'],
  // v0.30.4: umaigroup.kg/en/about is gone — link its Wayback snapshot. The
  // lookbehind keeps this idempotent: the snapshot URL ends with the old one.
  [/(?<!\/)https:\/\/www\.umaigroup\.kg\/en\/about/g,
    'https://web.archive.org/web/20260123151317/https://www.umaigroup.kg/en/about'],
  // v0.30.5: /about named a literal «BUILD 3cd8687» that every deploy left
  // stale — the hash is not content, `{build}` resolves to the deployed one.
  [/(<code>BUILD(?:&nbsp;| | ))[0-9a-f]{7,40}(<\/code>)/g, '$1{build}$2'],
];

export function fixStaleContent(node) {
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


// --- v0.30: structured /uses and /collaborate text fields were stored as HTML
// fragments (&nbsp;, <strong>, <b>, <code>) and emitted raw. They are now the
// same markdown subset every other field uses (**bold**, `code`, literal NBSP)
// and go through renderInline() — one escaping contract for the whole doc.
const NAMED = { nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
export function htmlToInline(html) {
  if (typeof html !== 'string' || !/[<&]/.test(html)) return html;
  return html
    .replace(/<\/?(?:strong|b)\s*>/gi, '**')
    .replace(/<\/?code\s*>/gi, '`')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/g, (m, n) => NAMED[n])
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(Number(n)));
}

const KEEP_RAW = new Set(['href', 'image', 'src', 'alt']);
function convertLeaves(node) {
  if (Array.isArray(node)) return node.forEach(convertLeaves);
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (KEEP_RAW.has(k)) continue;
    if (typeof v === 'string') node[k] = htmlToInline(v);
    else convertLeaves(v);
  }
}
export function migrateUses(doc) {
  if (!doc || !doc.sections) return doc;
  if ((doc.migration | 0) >= MIGRATION) return doc;
  doc.migration = MIGRATION;
  convertLeaves(doc.sections);
  return doc;
}
export function migrateCollaborate(doc) {
  if (!doc || !doc.sections) return doc;
  if ((doc.migration | 0) >= MIGRATION) return doc;
  migrateUses(doc); // same field model, same conversion (sets the marker)
  // CTA convention: the primary button comes first in the hero row.
  const ctas = doc.hero && doc.hero.ctas;
  if (ctas && typeof ctas === 'object') {
    for (const l of ['ru', 'en']) {
      if (typeof ctas[l] !== 'string') continue;
      const parts = ctas[l].split('\n').map((x) => x.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      const primary = parts.filter((x) => x.includes('v4-btn-primary'));
      const rest = parts.filter((x) => !x.includes('v4-btn-primary'));
      ctas[l] = [...primary, ...rest].join('\n');
    }
  }
  return doc;
}
