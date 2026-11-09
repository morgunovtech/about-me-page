// Site-wide constants shared by the renderers and the embedded shells.
export const ORIGIN = 'https://s.morgunov.tech';

// The owner's name as it appears in <title>, share cards and JSON-LD — one
// string per language, so RU routes never fall back to the Latin spelling.
export const NAME = { ru: 'Семён Моргунов', en: 'Semyon Morgunov' };

// Short SHA of the deployed commit, stamped by scripts/version-stamp.py and
// resolved into the `{build}` placeholder of CMS prose (see overlay.js).
export const BUILD = 'a62bc37';

// The commit actually deployed: Pages exposes CF_PAGES_COMMIT_SHA to Functions;
// the stamped BUILD is the fallback (local dev, static twins).
export function buildOf(env) {
  const sha = env && env.CF_PAGES_COMMIT_SHA;
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : BUILD;
}
