// Builds the public (or preview) Response for a single article: precompute the
// scalar helper fields, then overlay the doc onto the embedded shell using the
// Article JSON-LD renderer.
import { pick } from './i18n.js';
import { escapeAttr, escapeHtml } from './markdown.js';
import { renderArticleJsonLd } from './jsonld.js';
import { overlay } from './overlay.js';
import { articleShell } from './article-template.js';
import { loadArticle } from './articles.js';
import { ORIGIN, NAME, buildOf } from './site.js';

function dateDisplay(date, lang) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(date));
  } catch {
    return date;
  }
}

const nonEmpty = (v) => !!(v && String(v).trim());

// _headers never applies to Function responses, so the 404 page's headers
// are set here (cacheable at the browser, explicitly noindex).
export async function notFound(env, request) {
  try {
    const r = await env.ASSETS.fetch(new URL('/404.html', request.url));
    if (!r.ok) throw new Error('404 template unavailable');
    // The static template carries the stamped build; show the deployed one.
    const build = buildOf(env);
    const page = new HTMLRewriter()
      .on('[data-cms-text="_build"]', { element(el) { el.setInnerContent(build); } })
      .transform(new Response(r.body, r));
    return new Response(request.method === 'HEAD' ? null : page.body, {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300, stale-while-revalidate=86400',
        'x-robots-tag': 'noindex',
      },
    });
  } catch {
    return new Response('Not Found', { status: 404 });
  }
}

// opts: { doc?, preview? }. Returns a Response, or null when the article is
// missing / unpublished / not available in the requested language.
export async function renderArticlePage(env, slug, lang, request, opts = {}) {
  const doc = opts.doc || (await loadArticle(env, slug));
  if (!doc) return null;
  if (doc.status !== 'published' && !opts.preview) return null;

  // EN is translated on demand; if a piece has no EN yet, the EN URL 404s
  // rather than serving the RU body under an English URL (avoids duplicate).
  if (lang === 'en' && !opts.preview && !(nonEmpty(doc.title && doc.title.en) && nonEmpty(doc.body && doc.body.en))) {
    return null;
  }

  doc._url = ORIGIN + (lang === 'en' ? '/en' : '') + '/notes/' + slug;
  doc._urlRu = ORIGIN + '/notes/' + slug;
  doc._urlEn = ORIGIN + '/en/notes/' + slug;
  // No EN text yet → the EN URL 404s, so the shell drops the hreflang="en"
  // alternate and the English menu item (data-cms-omit="_noEn").
  doc._noEn = !(nonEmpty(doc.title && doc.title.en) && nonEmpty(doc.body && doc.body.en));
  doc._dateDisplay = dateDisplay(doc.date, lang);
  doc._build = buildOf(env);
  // <time> needs a machine-readable datetime next to the localized text.
  doc._dateHtml = doc.date
    ? `<time datetime="${escapeAttr(doc.date)}">${escapeHtml(doc._dateDisplay)}</time>`
    : '';

  const coverSrc = pick(doc.cover && doc.cover.src, lang);
  const coverAlt = pick(doc.cover && doc.cover.alt, lang) || pick(doc.title, lang) || '';
  doc._coverHtml = coverSrc
    ? `<img src="${escapeAttr(coverSrc)}" alt="${escapeAttr(coverAlt)}" loading="eager" />`
    : '';

  // Resolve share/meta to scalars for the rendered language, with sensible
  // fallbacks so the og/twitter/title tags are never empty.
  const share = doc.share || {};
  doc.share = {
    title: pick(share.title, lang) || pick(doc.title, lang) || '',
    description: pick(share.description, lang) || pick(doc.excerpt, lang) || '',
    image: pick(share.image, lang) || coverSrc || `${ORIGIN}/images/og-card-${lang === 'en' ? 'en' : 'ru'}.png`,
    imageAlt: pick(share.imageAlt, lang) || coverAlt || pick(doc.title, lang) || '',
  };
  const meta = doc.meta || {};
  doc.meta = {
    title: (pick(meta.title, lang) || pick(doc.title, lang) || '') + ' — ' + NAME[lang === 'en' ? 'en' : 'ru'],
    description: pick(meta.description, lang) || pick(doc.excerpt, lang) || '',
  };

  const res = new Response(articleShell(lang), { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const transformed = overlay(res, doc, lang, !!opts.edit, renderArticleJsonLd);
  const headers = new Headers(transformed.headers);
  headers.set('Cache-Control', opts.preview ? 'no-store' : 'public, max-age=120, stale-while-revalidate=86400');
  if (opts.preview) headers.set('x-robots-tag', 'noindex');
  return new Response(transformed.body, { status: 200, headers });
}
