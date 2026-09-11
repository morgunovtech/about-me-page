// Site-wide constants shared by the renderers and the embedded shells.
export const ORIGIN = 'https://s.morgunov.tech';

// The owner's name as it appears in <title>, share cards and JSON-LD — one
// string per language, so RU routes never fall back to the Latin spelling.
export const NAME = { ru: 'Семён Моргунов', en: 'Semyon Morgunov' };

// Short SHA of the deployed commit, stamped by scripts/version-stamp.py and
// resolved into the `{build}` placeholder of CMS prose (see overlay.js).
export const BUILD = '0134ba8';
