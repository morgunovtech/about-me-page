// Blog ↔ distribution-core seam. Maps a blog article doc into the portable
// SourcePost the dist/ core consumes. This is the only place that knows both
// the blog schema and the core — extract dist/ and you rewrite just this file.
import { pick } from './i18n.js';
import { makeSourcePost } from './dist/source-post.js';

const ORIGIN = 'https://s.morgunov.tech';

// Telegram needs absolute media/link URLs; the blog stores them site-relative.
function absolutize(html, origin) {
  return String(html || '').replace(/\b(src|href)="(\/[^"]*)"/g, (m, a, p) => `${a}="${origin}${p}"`);
}
const absUrl = (u, origin) => (!u ? '' : /^https?:/i.test(u) ? u : origin + u);

export function articleToSourcePost(doc, lang, origin = ORIGIN) {
  const coverSrc = pick(doc.cover && doc.cover.src, lang);
  return makeSourcePost({
    lang,
    title: pick(doc.title, lang),
    html: absolutize(pick(doc.body, lang), origin),
    excerpt: pick(doc.excerpt, lang),
    url: origin + (lang === 'en' ? '/en' : '') + '/notes/' + doc.slug,
    images: coverSrc ? [absUrl(coverSrc, origin)] : [],
    date: doc.date,
  });
}
