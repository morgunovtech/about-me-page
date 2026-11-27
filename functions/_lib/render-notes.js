// Builds the /notes index, the dynamic sitemap, and the RSS feed. The index is
// the feed of own articles + external materials (notes-feed.js); the sitemap
// and RSS carry own articles only — external materials are not ours to host.
import { loadArticleIndex, publishedSorted, noteUrl } from './articles.js';
import { loadDoc, loadSubscribers } from './content.js';
import { notesIndexHtml } from './article-template.js';
import { renderNotesIndexJsonLd } from './jsonld.js';
import { escapeAttr, typo } from './markdown.js';
import { ORIGIN, NAME, buildOf } from './site.js';
import { pickL, forLang, buildFeed, feedListHtml, channelHtml, liveTopics, topicNavHtml, topicUrl, topicsOf } from './notes-feed.js';
const xmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const INTRO = {
  ru: 'Заметки, статьи и выступления. Свои заметки — посты из Telegram-канала, собранные без привязки к платформе.',
  en: 'Notes, articles and talks. My notes are posts from my Telegram channel, kept here without the platform lock-in.',
};

// The three newest feed entries for the homepage «Публикации» block (_middleware.js
// and the /admin preview attach them to the home doc as `_feed`).
export async function loadHomeFeed(env, lang) {
  const [index, notesDoc] = await Promise.all([loadArticleIndex(env), loadDoc(env, 'notes')]);
  return buildFeed(publishedSorted(index), notesDoc, lang).slice(0, 3);
}

// Published notes, newest first, for the pages that list some of them by slug
// (/privacy «Статьи»): _middleware.js and the /admin preview attach them as `_articles`.
export async function loadPublishedArticles(env) {
  return publishedSorted(await loadArticleIndex(env));
}

// /notes, or with `topicKey` the page of one topic (/notes/topics/<key>): the
// same feed filtered by the tag, the topic's name and intro on top, the channel
// block only on /notes. An unknown topic, or one with nothing in this language,
// returns null (the route answers 404).
export async function renderNotesIndex(env, lang, topicKey) {
  const l = lang === 'en' ? 'en' : 'ru';
  const [index, notesDoc, homeDoc, subs] = await Promise.all([
    loadArticleIndex(env),
    loadDoc(env, 'notes'),
    loadDoc(env, 'home'),
    loadSubscribers(env),
  ]);
  if (homeDoc && subs) homeDoc._live = { subscribers: subs };
  const articles = publishedSorted(index);
  const topics = liveTopics(articles, notesDoc, l);
  const topic = topicKey ? topics.find((t) => t.key === topicKey) : null;
  if (topicKey && !topic) return null;
  const feed = buildFeed(articles, notesDoc, l, topicKey);
  // How many publications there are in this language: «Все 52» in the topic
  // line; the number beside the page title is the feed on this page.
  const total = topicKey ? buildFeed(articles, notesDoc, l).length : feed.length;
  const listHtml = typo(feedListHtml(feed, l), l);
  // Escaped for an attribute: the intro goes into <meta content="…"> as well as
  // into the page, and a straight quote in it would end the attribute.
  const intro = escapeAttr(
    topic ? pickL(topic.intro, l) || pickL(topic.name, l) : pickL(notesDoc && notesDoc.intro, l) || INTRO[l]
  );
  const publications = l === 'en' ? 'Publications' : 'Публикации';
  const heading = topic ? pickL(topic.name, l) : publications;
  // The English twin of a topic page exists only when the topic has English pieces.
  const hasEn = !topic || liveTopics(articles, notesDoc, 'en').some((t) => t.key === topic.key);

  const path = topic ? topicUrl(topic.key, 'ru') : '/notes';
  const self = ORIGIN + (topic ? topicUrl(topic.key, l) : (l === 'en' ? '/en' : '') + '/notes');
  const jsonLd = renderNotesIndexJsonLd({
    url: self,
    lang: l,
    name: (topic ? heading + ' — ' + publications : publications) + ' — ' + NAME[l],
    topic: topic ? heading : null,
    items: feed.map((e) => ({
      url: e.kind === 'note' ? ORIGIN + noteUrl(e.item.slug, lang) : e.item.href,
      name: pickL(e.item.title, lang),
    })),
  });

  const page = notesIndexHtml(l, listHtml, jsonLd, buildOf(env), {
    intro,
    channel: topic ? '' : typo(channelHtml(notesDoc, homeDoc, l), l),
    topics: typo(topicNavHtml(topics, l, topic && topic.key, total), l),
    count: feed.length,
    heading,
    path,
    hasEn,
  });
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
  // /about («Принципы») is a section of /uses since v4.0.0 (a 301 in _middleware.js).
  // /thanks, /social-tracker and /tofsdevops are static pages.
  const [home, collaborate, consulting, uses, privacy] = await Promise.all(
    ['home', 'collaborate', 'consulting', 'uses', 'privacy'].map((p) => loadDoc(env, p))
  );
  const mod = (doc, fallback) =>
    (doc && (doc.dateModified || (doc.updatedAt || '').slice(0, 10))) || fallback;
  const [all, notesDoc] = await Promise.all([
    loadArticleIndex(env).then(publishedSorted),
    loadDoc(env, 'notes'),
  ]);
  // The notes index changes when an article does — never «today» by default
  // (a lastmod that moves without content makes crawlers distrust all of them).
  const notesMod = all.map((a) => (a.updatedAt || a.date || '').slice(0, 10)).filter(Boolean).sort().pop();
  const STATIC = [
    { loc: '/', ru: '/', en: '/en/', lastmod: mod(home, '2026-05-11') },
    { loc: '/en/', ru: '/', en: '/en/', lastmod: mod(home, '2026-05-11') },
    { loc: '/collaborate', ru: '/collaborate', en: '/en/collaborate', lastmod: mod(collaborate, '2026-05-04') },
    { loc: '/en/collaborate', ru: '/collaborate', en: '/en/collaborate', lastmod: mod(collaborate, '2026-05-04') },
    { loc: '/consulting', ru: '/consulting', en: '/en/consulting', lastmod: mod(consulting, '2026-11-25') },
    { loc: '/en/consulting', ru: '/consulting', en: '/en/consulting', lastmod: mod(consulting, '2026-11-25') },
    { loc: '/uses', ru: '/uses', en: '/en/uses', lastmod: mod(uses, '2026-11-25') },
    { loc: '/en/uses', ru: '/uses', en: '/en/uses', lastmod: mod(uses, '2026-11-25') },
    { loc: '/thanks', ru: '/thanks', en: '/en/thanks', lastmod: '2026-11-25' },
    { loc: '/en/thanks', ru: '/thanks', en: '/en/thanks', lastmod: '2026-11-25' },
    { loc: '/social-tracker', ru: '/social-tracker', en: '/en/social-tracker', lastmod: '2026-11-27' },
    { loc: '/en/social-tracker', ru: '/social-tracker', en: '/en/social-tracker', lastmod: '2026-11-27' },
    { loc: '/tofsdevops', ru: '/tofsdevops', en: '/en/tofsdevops', lastmod: '2026-11-27' },
    { loc: '/en/tofsdevops', ru: '/tofsdevops', en: '/en/tofsdevops', lastmod: '2026-11-27' },
    { loc: '/privacy', ru: '/privacy', en: '/en/privacy', lastmod: mod(privacy, '2026-11-25') },
    { loc: '/en/privacy', ru: '/privacy', en: '/en/privacy', lastmod: mod(privacy, '2026-11-25') },
    { loc: '/notes', ru: '/notes', en: '/en/notes', lastmod: notesMod },
    { loc: '/en/notes', ru: '/notes', en: '/en/notes', lastmod: notesMod },
  ];
  const urls = [...STATIC];
  // Topic pages: one per topic that has something in that language; lastmod is
  // its newest note (external materials have no page here and no say).
  const enTopics = new Set(liveTopics(all, notesDoc, 'en').map((t) => t.key));
  for (const t of liveTopics(all, notesDoc, 'ru')) {
    const ru = topicUrl(t.key, 'ru');
    const en = enTopics.has(t.key) ? topicUrl(t.key, 'en') : null;
    const lastmod = all.filter((a) => (a.tags || []).includes(t.key))
      .map((a) => (a.updatedAt || a.date || '').slice(0, 10)).filter(Boolean).sort().pop();
    urls.push({ loc: ru, ru, en, lastmod });
    if (en) urls.push({ loc: en, ru, en, lastmod });
  }
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
  const [index, notesDoc] = await Promise.all([loadArticleIndex(env), loadDoc(env, 'notes')]);
  const items = forLang(publishedSorted(index), l).slice(0, 50);
  const names = new Map(topicsOf(notesDoc).map((t) => [t.key, pickL(t.name, l)]));
  const base = ORIGIN + (l === 'en' ? '/en' : '') + '/notes';
  const entries = items.map((a) => {
    const link = base + '/' + a.slug;
    const pub = a.date ? new Date(a.date + 'T00:00:00Z').toUTCString() : '';
    const cats = (a.tags || []).filter((k) => names.has(k)).map((k) => `<category>${xmlEsc(names.get(k))}</category>\n      `).join('');
    return `    <item>\n      <title>${xmlEsc(pickL(a.title, l))}</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      ${pub ? `<pubDate>${pub}</pubDate>\n      ` : ''}${cats}<description>${xmlEsc(pickL(a.excerpt, l))}</description>\n    </item>`;
  }).join('\n');
  const latest = items.map((a) => a.updatedAt || a.date || '').filter(Boolean).sort().pop();
  const built = latest ? new Date(latest.length > 10 ? latest : latest + 'T00:00:00Z').toUTCString() : '';
  const title = (l === 'en' ? 'Notes' : 'Заметки') + ' — ' + NAME[l];
  const desc = l === 'en' ? `Notes and essays by ${NAME.en}.` : 'Заметки и эссе Семёна Моргунова.';
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n  <channel>\n    <title>${xmlEsc(title)}</title>\n    <link>${base}</link>\n    <atom:link href="${base}/feed.xml" rel="self" type="application/rss+xml" />\n    <description>${xmlEsc(desc)}</description>\n    <language>${l}</language>\n${built ? `    <lastBuildDate>${built}</lastBuildDate>\n` : ''}${entries}\n  </channel>\n</rss>\n`;
  return new Response(xml, {
    // A feed is for readers and for discovering the notes, not a search result:
    // Google listed /notes/feed.xml as «crawled, not indexed». noindex keeps it
    // out of the index; its links are still followed.
    headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=600, stale-while-revalidate=86400', 'X-Robots-Tag': 'noindex' },
  });
}
