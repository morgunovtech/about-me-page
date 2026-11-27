// Site-wide constants shared by the renderers and the embedded shells.
export const ORIGIN = 'https://s.morgunov.tech';

// The owner's name as it appears in <title>, share cards and JSON-LD — one
// string per language, so RU routes never fall back to the Latin spelling.
export const NAME = { ru: 'Семён Моргунов', en: 'Semyon Morgunov' };

// A note's <title> is its headline + « — Семён Моргунов» while the whole stays within TITLE_MAX
// characters; a longer headline goes alone (v4.9.1). Google shows about 60 characters of a title
// and Yandex about 70: past that the name was cut off in the result anyway, and 30 of the 86
// notes ran to 75–103 characters with it. The author is still in the byline and in the JSON-LD;
// a note's own `meta.title` (Settings in /admin) overrides the headline here as before.
export const TITLE_MAX = 70;
export function withName(base, lang) {
  const full = base + ' — ' + NAME[lang === 'en' ? 'en' : 'ru'];
  return !base || full.length <= TITLE_MAX ? full : base;
}

// Short SHA of the deployed commit, stamped by scripts/version-stamp.py and
// resolved into the `{build}` placeholder of CMS prose (see overlay.js).
export const BUILD = '308f605';

// The release, as the top entry of CHANGELOG.md names it; stamped by
// scripts/version-stamp.py. The footer shows it as the build mark, a link to
// the changelog on GitHub (ds/v1/USAGE.md, «Build mark»).
export const VERSION = '4.10.0';
export const CHANGELOG_URL = 'https://github.com/morgunovtech/about-me-page/blob/main/CHANGELOG.md';

// The commit actually deployed: Pages exposes CF_PAGES_COMMIT_SHA to Functions;
// the stamped BUILD is the fallback (local dev, static twins).
export function buildOf(env) {
  const sha = env && env.CF_PAGES_COMMIT_SHA;
  return typeof sha === 'string' && /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : BUILD;
}
