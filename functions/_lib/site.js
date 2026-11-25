// Site-wide constants shared by the renderers and the embedded shells.
export const ORIGIN = 'https://s.morgunov.tech';

// The owner's name as it appears in <title>, share cards and JSON-LD — one
// string per language, so RU routes never fall back to the Latin spelling.
export const NAME = { ru: 'Семён Моргунов', en: 'Semyon Morgunov' };

// Short SHA of the deployed commit, stamped by scripts/version-stamp.py and
// resolved into the `{build}` placeholder of CMS prose (see overlay.js).
export const BUILD = '4c37513';

// The release, as the top entry of CHANGELOG.md names it; stamped by
// scripts/version-stamp.py. The footer shows it as the build mark, a link to
// the changelog on GitHub (ds/v1/USAGE.md, «Build mark»).
export const VERSION = '4.1.1';
export const CHANGELOG_URL = 'https://github.com/morgunovtech/about-me-page/blob/main/CHANGELOG.md';

// The commit actually deployed: Pages exposes CF_PAGES_COMMIT_SHA to Functions;
// the stamped BUILD is the fallback (local dev, static twins).
export function buildOf(env) {
  const sha = env && env.CF_PAGES_COMMIT_SHA;
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : BUILD;
}
