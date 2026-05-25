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
