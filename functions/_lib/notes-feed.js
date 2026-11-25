// The /notes feed: own articles and external materials (vc.ru articles,
// YouTube talks) in one list, newest first. Pure functions only — no seed
// import — so Node tests load this file directly; render-notes.js does the I/O.
//
// External materials come from the `notes` content doc (seed today; a KV doc
// wins once /admin manages it). They are not ours to host: no page on the site,
// no RSS item, no sitemap URL — only a row in the feed that links out.
import { escapeHtml, escapeAttr, safeHref } from './markdown.js';
import { fmtNum, channelItem } from './render.js';
import { fmtDate, NEW_TAB } from './i18n.js';
import { noteUrl } from './articles.js';
import { ORIGIN } from './site.js';

// Empty EN falls back to RU (pick treats '' as set) — keep the ||-fallback here.
export const pickL = (v, lang) => (v ? v[lang] || v.ru || v.en || '' : '');
const hasTitle = (t, lang) => !!(t && String(t[lang] || '').trim());

// Articles available in the given language: RU always; EN only when translated
// (title.en present), so EN index links don't point at 404s.
export function forLang(list, lang) {
  return lang === 'en' ? list.filter((a) => hasTitle(a.title, 'en')) : list;
}

// A view count is a snapshot. Floored to hundreds with «+», it stays true as
// the real number grows («6 299» → «6 200+»). Under a hundred: say nothing.
export function viewsLabel(n, lang) {
  const v = Math.floor((Number(n) || 0) / 100) * 100;
  if (v <= 0) return '';
  return fmtNum(v, lang) + '+ ' + (lang === 'en' ? 'views' : 'просмотров');
}

// Topics: the `notes` doc names them (`topics: [{ key, name: {ru,en}, intro: {ru,en} }]`,
// in display order); an article or an external material carries `tags: [key…]`.
// A topic is navigation — its own page and a link in a note's byline — never a
// chip in a feed row (composition rule 4: a row says when and where).
export const TOPIC_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export function topicsOf(notesDoc) {
  return ((notesDoc && notesDoc.topics) || []).filter((t) => t && TOPIC_KEY.test(String(t.key || '')));
}
export const topicUrl = (key, lang) => (lang === 'en' ? '/en' : '') + '/notes/topics/' + key;
const tagged = (x, topic) => !topic || (Array.isArray(x.tags) && x.tags.includes(topic));

// Published articles (already newest-first) + external materials with a title
// in this language, merged by date; with `topic`, only what carries that tag.
// Same-day ties keep own notes first.
export function buildFeed(articles, notesDoc, lang, topic) {
  const own = forLang(articles || [], lang)
    .filter((a) => tagged(a, topic))
    .map((a) => ({ kind: 'note', date: String(a.date || ''), item: a }));
  const ext = ((notesDoc && notesDoc.external) || [])
    .filter((x) => x && x.href && hasTitle(x.title, lang) && tagged(x, topic))
    .map((x) => ({ kind: 'external', date: String(x.date || ''), item: x }));
  return [...own, ...ext].sort((p, q) => q.date.localeCompare(p.date));
}

// The topics that have something to show in this language, each with its count.
export function liveTopics(articles, notesDoc, lang) {
  return topicsOf(notesDoc)
    .map((t) => ({ ...t, count: buildFeed(articles, notesDoc, lang, t.key).length }))
    .filter((t) => t.count > 0);
}

// «Темы: Все · Приватность · Менеджмент команды» above the feed. The page you
// are on is text with aria-current, not a link — one sign for one state.
export function topicNavHtml(topics, lang, current) {
  if (!topics.length) return '';
  const l = lang === 'en' ? 'en' : 'ru';
  const item = (label, href, on) =>
    on ? `<span aria-current="page">${escapeHtml(label)}</span>` : `<a href="${escapeAttr(href)}">${escapeHtml(label)}</a>`;
  const all = item(l === 'en' ? 'All' : 'Все', (l === 'en' ? '/en' : '') + '/notes', !current);
  const rest = topics.map((t) => item(pickL(t.name, l), topicUrl(t.key, l), t.key === current));
  return `<nav class="v4-notes-topics" aria-label="${l === 'en' ? 'Topics' : 'Темы'}">${[all, ...rest].join('<span aria-hidden="true"> · </span>')}</nav>`;
}

export function feedItemHtml(entry, lang) {
  const it = entry.item;
  const date = it.date
    ? `<time class="v4-note-date" datetime="${escapeAttr(it.date)}">${escapeHtml(fmtDate(it.date, lang))}</time>`
    : '';
  if (entry.kind === 'note') {
    const ex = escapeHtml(pickL(it.excerpt, lang));
    return `<article class="v4-note-item">
          <div class="v4-note-head">${date}</div>
          <h2 class="v4-note-title"><a href="${noteUrl(it.slug, lang)}">${escapeHtml(pickL(it.title, lang))}</a></h2>
          ${ex ? `<p class="v4-note-excerpt">${ex}</p>` : ''}
        </article>`;
  }
  // A trailing «→» marks a link that leaves the site (the CTA convention);
  // the screen-reader note says what the arrow and target=_blank mean.
  const meta = [escapeHtml(it.source || ''), viewsLabel(it.views, lang)].filter(Boolean).join(' · ');
  return `<article class="v4-note-item">
          <div class="v4-note-head">${date}</div>
          <h2 class="v4-note-title"><a href="${escapeAttr(safeHref(it.href))}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            pickL(it.title, lang)
          )}<span aria-hidden="true">&nbsp;↗</span><span class="sr-only">${NEW_TAB[lang === 'en' ? 'en' : 'ru']}</span></a></h2>
          ${meta ? `<p class="v4-note-meta">${meta}</p>` : ''}
        </article>`;
}

// The Telegram channel block above the feed — the homepage's CHANNEL item,
// same markup, counters resolved from the home doc (live SocialBot numbers).
export function channelHtml(notesDoc, homeDoc, lang) {
  const ch = notesDoc && notesDoc.channel;
  if (!ch) return '';
  return `<div class="v4-notes-channel">
        ${channelItem(ch, lang, homeDoc || {})}
      </div>`;
}

export function feedListHtml(feed, lang) {
  return feed.length
    ? feed.map((e) => feedItemHtml(e, lang)).join('\n')
    : `<p class="v4-notes-intro">${lang === 'en' ? 'No publications yet.' : 'Пока нет публикаций.'}</p>`;
}

// {notes}: the owner's published notes grouped by topic, in English where a
// translation exists (else the Russian title, marked so) — the citable writing an
// assistant should find first. Empty when nothing is published.
export function notesList(articles, notesDoc) {
  const line = (a) => {
    const en = String((a.title && a.title.en) || '').trim();
    const url = ORIGIN + (en ? '/en' : '') + '/notes/' + a.slug;
    const title = en || pickL(a.title, 'ru');
    const ex = pickL(a.excerpt, en ? 'en' : 'ru');
    return `- [${title}](${url})${en ? '' : ' — in Russian'}${ex ? ' — ' + ex : ''}`;
  };
  const topics = topicsOf(notesDoc);
  const seen = new Set();
  const blocks = [];
  for (const t of topics) {
    const mine = articles.filter((a) => (a.tags || []).includes(t.key));
    if (!mine.length) continue;
    mine.forEach((a) => seen.add(a.slug));
    blocks.push(`\n### ${pickL(t.name, 'en')} (${ORIGIN}/en/notes/topics/${t.key})\n\n${mine.map(line).join('\n')}`);
  }
  const rest = articles.filter((a) => !seen.has(a.slug));
  if (rest.length) blocks.push(`\n### Other notes\n\n${rest.map(line).join('\n')}`);
  return blocks.length ? `\nOwn notes by topic:\n${blocks.join('\n')}\n` : '';
}
