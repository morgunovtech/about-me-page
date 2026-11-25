// Localization helpers. A "localized" value is an object whose only keys are
// `ru` and/or `en`. Anything else (plain string, structured object) passes
// through untouched.

export function isLocalized(v) {
  return (
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length > 0 &&
    Object.keys(v).every((k) => k === 'ru' || k === 'en')
  );
}

// Resolve a possibly-localized value for the given language, falling back to
// the other language if one side is empty.
export function pick(v, lang) {
  if (isLocalized(v)) return v[lang] ?? v.ru ?? v.en ?? '';
  return v;
}

// Resolve a dotted path ("hero.tagline", "sections.about.prose") into the doc.
export function resolvePath(doc, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), doc);
}

// «26 июня 2025» / «26 June 2025» — the date of a note, in the feed and in its
// byline. The «г.» Intl appends in Russian is dropped: after a year it says
// nothing. UTC: a YYYY-MM-DD date has no time zone.
export function fmtDate(date, lang) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(date)).replace(/\s*г\.$/, '');
  } catch {
    return date;
  }
}

// Screen-reader note after a link that opens in a new tab.
export const NEW_TAB = { ru: ' (откроется в новой вкладке)', en: ' (opens in a new tab)' };

// The mark after a link that leaves the site: «↗» for the eye, the new-tab note
// for a screen reader. The glyph is the line's own «→» turned 45° (.v4-ne in
// ds/v1/components.css): the IBM Plex subsets carry no arrow but ↑ ↓, and a
// system «↗» comes from a symbol font of one hairline weight, thin and tall
// beside a 600 title. With no CSS the mark degrades to «→».
// The turned arrow is a box, and a line may break before a box even after a
// no-break space — the arrow then starts a line alone (measured: 30 window
// widths of 230). So the mark is a no-wrap span (.v4-out) that opens with a
// word joiner (&#8288;): no break before the joiner, none inside the span. The
// gap before the arrow is the arrow's margin, not a space: the underline of a
// link ends at its last word.
export const NE_ARROW = '<span class="v4-out" aria-hidden="true">&#8288;<span class="v4-ne">→</span></span>';
export const outMark = (lang) => `${NE_ARROW}<span class="sr-only">${NEW_TAB[lang === 'en' ? 'en' : 'ru']}</span>`;
