// Builds the /notes index, the dynamic sitemap, and the RSS feed from the
// article index. All three derive from the same published-article list.
import { loadArticleIndex, publishedSorted } from './articles.js';
import { notesIndexHtml } from './article-template.js';
import { serializeLd } from './jsonld.js';
import { escapeHtml } from './markdown.js';

const ORIGIN = 'https://s.morgunov.tech';
const pickL = (v, lang) => (v ? v[lang] || v.ru || v.en || '' : '');
const xmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function fmtDate(date, lang) {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'ru-RU', {
      day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    }).format(new Date(date));
  } catch {
    return date;
  }
}

// Articles available in the given language: RU always; EN only when translated
// (title.en present), so EN index links don't point at 404s.
function forLang(list, lang) {
  return lang === 'en' ? list.filter((a) => a.title && String(a.title.en || '').trim()) : list;
}

export async function renderNotesIndex(env, lang) {
  const items = forLang(publishedSorted(await loadArticleIndex(env)), lang);
  const url = (slug) => (lang === 'en' ? '/en' : '') + '/notes/' + slug;
  const listHtml = items.length
    ? items.map((a) => {
        const t = escapeHtml(pickL(a.title, lang));
        const ex = escapeHtml(pickL(a.excerpt, lang));
        return `<article class="v4-note-item">
          <time class="v4-note-date" datetime="${escapeHtml(a.date)}">${escapeHtml(fmtDate(a.date, lang))}</time>
          <h2 class="v4-note-title"><a href="${url(a.slug)}">${t}</a></h2>
          ${ex ? `<p class="v4-note-excerpt">${ex}</p>` : ''}
        </article>`;
      }).join('\n')
    : `<p class="v4-notes-intro">${lang === 'en' ? 'No notes yet.' : 'Пока нет заметок.'}</p>`;

  const self = ORIGIN + (lang === 'en' ? '/en' : '') + '/notes';
  const jsonLd = serializeLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': self + '#webpage',
        url: self,
        name: (lang === 'en' ? 'Notes' : 'Заметки') + ' — Semyon Morgunov',
        inLanguage: lang,
        isPartOf: { '@id': ORIGIN + '/#website' },
        about: { '@id': ORIGIN + '/#person' },
      },
      {
        '@type': 'ItemList',
        itemListElement: items.map((a, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: ORIGIN + url(a.slug),
          name: pickL(a.title, lang),
        })),
      },
    ],
  });

  return new Response(notesIndexHtml(lang, listHtml, jsonLd), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=86400',
    },
  });
}

// Dynamic sitemap: the static page routes + published articles in both
// languages, each with hreflang alternates.
export async function renderSitemap(env) {
  const STATIC = [
    { loc: '/', ru: '/', en: '/en/', lastmod: '2026-05-11' },
    { loc: '/en/', ru: '/', en: '/en/', lastmod: '2026-05-11' },
    { loc: '/collaborate.html', ru: '/collaborate.html', en: '/en/collaborate.html', lastmod: '2026-05-04' },
    { loc: '/en/collaborate.html', ru: '/collaborate.html', en: '/en/collaborate.html', lastmod: '2026-05-04' },
    { loc: '/uses.html', ru: '/uses.html', en: '/en/uses.html', lastmod: '2026-05-11' },
    { loc: '/en/uses.html', ru: '/uses.html', en: '/en/uses.html', lastmod: '2026-05-11' },
    { loc: '/about.html', ru: '/about.html', en: '/en/about.html', lastmod: '2026-05-11' },
    { loc: '/en/about.html', ru: '/about.html', en: '/en/about.html', lastmod: '2026-05-11' },
    { loc: '/notes', ru: '/notes', en: '/en/notes', lastmod: new Date().toISOString().slice(0, 10) },
    { loc: '/en/notes', ru: '/notes', en: '/en/notes', lastmod: new Date().toISOString().slice(0, 10) },
  ];
  const all = publishedSorted(await loadArticleIndex(env));
  const urls = [...STATIC];
  for (const a of all) {
    const hasEn = a.title && String(a.title.en || '').trim();
    urls.push({ loc: '/notes/' + a.slug, ru: '/notes/' + a.slug, en: hasEn ? '/en/notes/' + a.slug : null, lastmod: (a.updatedAt || a.date || '').slice(0, 10) });
    if (hasEn) urls.push({ loc: '/en/notes/' + a.slug, ru: '/notes/' + a.slug, en: '/en/notes/' + a.slug, lastmod: (a.updatedAt || a.date || '').slice(0, 10) });
  }
  const body = urls.map((u) => {
    const alts = [`<xhtml:link rel="alternate" hreflang="ru" href="${ORIGIN}${u.ru}" />`];
    if (u.en) alts.push(`<xhtml:link rel="alternate" hreflang="en" href="${ORIGIN}${u.en}" />`);
    alts.push(`<xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}${u.ru}" />`);
    return `  <url>\n    <loc>${ORIGIN}${u.loc}</loc>\n    ${alts.join('\n    ')}${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}\n  </url>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${body}\n</urlset>\n`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400' },
  });
}

// RSS 2.0 of the RU feed (the canonical language of the channel).
export async function renderFeed(env) {
  const items = publishedSorted(await loadArticleIndex(env)).slice(0, 50);
  const entries = items.map((a) => {
    const link = ORIGIN + '/notes/' + a.slug;
    const pub = a.date ? new Date(a.date + 'T00:00:00Z').toUTCString() : '';
    return `    <item>\n      <title>${xmlEsc(pickL(a.title, 'ru'))}</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      ${pub ? `<pubDate>${pub}</pubDate>\n      ` : ''}<description>${xmlEsc(pickL(a.excerpt, 'ru'))}</description>\n    </item>`;
  }).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">\n  <channel>\n    <title>Заметки — Semyon Morgunov</title>\n    <link>${ORIGIN}/notes</link>\n    <description>Заметки и эссе Семёна Моргунова.</description>\n    <language>ru</language>\n${entries}\n  </channel>\n</rss>\n`;
  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400' },
  });
}
