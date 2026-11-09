// Builds the /notes index, the dynamic sitemap, and the RSS feed. The index is
// the feed of own articles + external materials (notes-feed.js); the sitemap
// and RSS carry own articles only — external materials are not ours to host.
import { loadArticleIndex, publishedSorted, noteUrl } from './articles.js';
import { loadDoc, loadSubscribers } from './content.js';
import { notesIndexHtml } from './article-template.js';
import { serializeLd } from './jsonld.js';
import { escapeHtml } from './markdown.js';
import { ORIGIN, NAME, buildOf } from './site.js';
import { pickL, forLang, buildFeed, feedListHtml, channelHtml } from './notes-feed.js';
const xmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INTRO = {
  ru: 'Заметки, статьи и выступления. Свои заметки — то же, что в Telegram-канале, только без привязки к платформе.',
  en: 'Notes, articles and talks. My notes mirror the Telegram channel, without the platform lock-in.',
};

// The three newest feed entries for the homepage «Заметки» block (_middleware.js
// and the /admin preview attach them to the home doc as `_feed`).
export async function loadHomeFeed(env, lang) {
  const [index, notesDoc] = await Promise.all([loadArticleIndex(env), loadDoc(env, 'notes')]);
  return buildFeed(publishedSorted(index), notesDoc, lang).slice(0, 3);
}

export async function renderNotesIndex(env, lang) {
  const [index, notesDoc, homeDoc, subs] = await Promise.all([
    loadArticleIndex(env),
    loadDoc(env, 'notes'),
    loadDoc(env, 'home'),
    loadSubscribers(env),
  ]);
  if (homeDoc && subs) homeDoc._live = { subscribers: subs };
  const feed = buildFeed(publishedSorted(index), notesDoc, lang);
  const listHtml = feedListHtml(feed, lang);
  const intro = escapeHtml(pickL(notesDoc && notesDoc.intro, lang) || INTRO[lang === 'en' ? 'en' : 'ru']);

  const self = ORIGIN + (lang === 'en' ? '/en' : '') + '/notes';
  const jsonLd = serializeLd({
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': self + '#webpage',
        url: self,
        name: (lang === 'en' ? 'Notes' : 'Заметки') + ' — ' + NAME[lang === 'en' ? 'en' : 'ru'],
        inLanguage: lang,
        isPartOf: { '@id': ORIGIN + '/#website' },
        about: { '@id': ORIGIN + '/#person' },
      },
      {
        '@type': 'ItemList',
        itemListElement: feed.map((e, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: e.kind === 'note' ? ORIGIN + noteUrl(e.item.slug, lang) : e.item.href,
          name: pickL(e.item.title, lang),
        })),
      },
    ],
  });

  const page = notesIndexHtml(lang, listHtml, jsonLd, buildOf(env), { intro, channel: channelHtml(notesDoc, homeDoc, lang) });
  return new Response(page, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=86400',
    },
  });
}

// Dynamic sitemap: the static page routes + published articles in both
// languages, each with hreflang alternates.
export async function renderSitemap(env) {
  // Clean URLs only — Pages 308-redirects /foo.html → /foo, and a sitemap
  // must not point at redirects. lastmod for CMS-managed pages comes from
  // the live KV doc (save.js bumps dateModified on every admin save), so
  // the sitemap agrees with the JSON-LD freshness signal without a redeploy.
  // /about («Принципы») is hidden until the owner rewrites it: noindex, not listed.
  const [home, collaborate, uses] = await Promise.all(
    ['home', 'collaborate', 'uses'].map((p) => loadDoc(env, p))
  );
  const mod = (doc, fallback) =>
    (doc && (doc.dateModified || (doc.updatedAt || '').slice(0, 10))) || fallback;
  const all = publishedSorted(await loadArticleIndex(env));
  // The notes index changes when an article does — never «today» by default
  // (a lastmod that moves without content makes crawlers distrust all of them).
  const notesMod = all.map((a) => (a.updatedAt || a.date || '').slice(0, 10)).filter(Boolean).sort().pop();
  const STATIC = [
    { loc: '/', ru: '/', en: '/en/', lastmod: mod(home, '2026-05-11') },
    { loc: '/en/', ru: '/', en: '/en/', lastmod: mod(home, '2026-05-11') },
    { loc: '/collaborate', ru: '/collaborate', en: '/en/collaborate', lastmod: mod(collaborate, '2026-05-04') },
    { loc: '/en/collaborate', ru: '/collaborate', en: '/en/collaborate', lastmod: mod(collaborate, '2026-05-04') },
    { loc: '/uses', ru: '/uses', en: '/en/uses', lastmod: mod(uses, '2026-05-11') },
    { loc: '/en/uses', ru: '/uses', en: '/en/uses', lastmod: mod(uses, '2026-05-11') },
    { loc: '/notes', ru: '/notes', en: '/en/notes', lastmod: notesMod },
    { loc: '/en/notes', ru: '/notes', en: '/en/notes', lastmod: notesMod },
  ];
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

// RSS 2.0 per language: RU is the channel's canonical language; the EN feed
// carries only translated pieces (same rule as the EN index).
export async function renderFeed(env, lang = 'ru') {
  const l = lang === 'en' ? 'en' : 'ru';
  const items = forLang(publishedSorted(await loadArticleIndex(env)), l).slice(0, 50);
  const base = ORIGIN + (l === 'en' ? '/en' : '') + '/notes';
  const entries = items.map((a) => {
    const link = base + '/' + a.slug;
    const pub = a.date ? new Date(a.date + 'T00:00:00Z').toUTCString() : '';
    return `    <item>\n      <title>${xmlEsc(pickL(a.title, l))}</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      ${pub ? `<pubDate>${pub}</pubDate>\n      ` : ''}<description>${xmlEsc(pickL(a.excerpt, l))}</description>\n    </item>`;
  }).join('\n');
  const latest = items.map((a) => a.updatedAt || a.date || '').filter(Boolean).sort().pop();
  const built = latest ? new Date(latest.length > 10 ? latest : latest + 'T00:00:00Z').toUTCString() : '';
  const title = (l === 'en' ? 'Notes' : 'Заметки') + ' — ' + NAME[l];
  const desc = l === 'en' ? `Notes and essays by ${NAME.en}.` : 'Заметки и эссе Семёна Моргунова.';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${xmlEsc(title)}</title>\n    <link>${base}</link>\n    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />\n    <description>${xmlEsc(desc)}</description>\n    <language>${l}</language>\n${built ? `    <lastBuildDate>${built}</lastBuildDate>\n` : ''}${entries}\n  </channel>\n</rss>\n`;
  return new Response(xml, {
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400' },
  });
}
