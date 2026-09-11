// Loads a page's content document: KV first (site-scoped key `site:page`),
// falling back to the committed seed when KV is empty or unavailable.

import seed from '../../content.seed.json' with { type: 'json' };

const SITE = 's.morgunov.tech';

// The only page keys the CMS manages. Used to validate untrusted ?page params
// so an authed request can't probe arbitrary site-scoped KV keys.
export const PAGES = new Set(['home', 'about', 'collaborate', 'uses']);

// Articles are addressed as the page key `article:<slug>` (so the existing
// content/save/history machinery keys them at `<site>:article:<slug>` and
// archives revisions under `<site>:article:<slug>:rev:<n>` for free).
const ARTICLE_PAGE_RE = /^article:[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function isArticlePage(page) {
  return typeof page === 'string' && ARTICLE_PAGE_RE.test(page);
}
// A page key the admin APIs accept (static page or an article).
export function validPageKey(page) {
  return PAGES.has(page) || isArticlePage(page);
}

// --- Read-time migrations -------------------------------------------------
// A doc saved to KV before a seed change keeps winning over the seed, so
// content the templates/renderers now rely on is merged into the KV doc when
// it is read (idempotent, cheap). The next admin Save persists the migrated
// shape, after which these become no-ops.
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

function migrate(page, doc) {
  if (page === 'home') return migrateHome(doc, seed && seed.home);
  if (page === 'about') return migrateAbout(doc);
  return doc;
}

export async function loadDoc(env, page) {
  const key = `${SITE}:${page}`;
  if (env && env.CONTENT) {
    try {
      const fromKv = await env.CONTENT.get(key, 'json');
      if (fromKv) {
        // Migration guard: a `uses` doc saved before the cards migration lacks
        // the new structure (sections.hardware.groups). Fall back to the
        // migrated seed so the renderer never sees the old shape — until the
        // admin re-saves uses, which writes the new structure to KV.
        if (page === 'uses' && !(fromKv.sections && fromKv.sections.hardware && fromKv.sections.hardware.groups)) {
          return (seed && seed[page]) || fromKv;
        }
        // Same migration guard for collaborate (old verbatim-HTML sections lack
        // the structured shape — e.g. consulting.tiers).
        if (page === 'collaborate' && !(fromKv.sections && fromKv.sections.consulting && fromKv.sections.consulting.tiers)) {
          return (seed && seed[page]) || fromKv;
        }
        return migrate(page, fromKv);
      }
    } catch (e) {
      // KV unavailable — fall through to seed
    }
  }
  return (seed && seed[page]) || null;
}

// Live subscriber counts pushed by the SocialBot (or null if never pushed).
export async function loadSubscribers(env) {
  if (env && env.CONTENT) {
    try {
      return await env.CONTENT.get('stats:subscribers', 'json');
    } catch (e) {
      /* ignore */
    }
  }
  return null;
}
