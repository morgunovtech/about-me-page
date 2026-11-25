// The /notes feed: own articles and external materials (vc.ru articles,
// YouTube talks) in one list, newest first. Pure functions only — no seed
// import — so Node tests load this file directly; render-notes.js does the I/O.
//
// External materials come from the `notes` content doc (seed today; a KV doc
// wins once /admin manages it). They are not ours to host: no page on the site,
// no RSS item, no sitemap URL — only a row in the feed that links out.
import { escapeHtml, escapeAttr, safeHref } from './markdown.js';
import { fmtNum, channelItem } from './render.js';
import { fmtDate, outMark } from './i18n.js';
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

// «Все 52 · Менеджмент команды 9 · …» above the feed: every topic with how much
// is in it, and «Все» with the total (`total`: the whole feed in this language).
// The page you are on is text with aria-current, not a link — one sign for one
// state. The number is data: a mono count after the label.
export function topicNavHtml(topics, lang, current, total) {
  if (!topics.length) return '';
  const l = lang === 'en' ? 'en' : 'ru';
  // The space is inside the count (a no-break one, kept by the inline-block): the
  // link's name reads «Team management 8», and the underline stops at the label.
  const count = (n) => (n > 0 ? `<span class="v4-count">&nbsp;${fmtNum(n, l)}</span>` : '');
  const item = (label, href, on, n) =>
    on ? `<span aria-current="page">${escapeHtml(label)}${count(n)}</span>` : `<a href="${escapeAttr(href)}">${escapeHtml(label)}${count(n)}</a>`;
  const all = item(l === 'en' ? 'All' : 'Все', (l === 'en' ? '/en' : '') + '/notes', !current, total);
  const rest = topics.map((t) => item(pickL(t.name, l), topicUrl(t.key, l), t.key === current, t.count));
  return `<nav class="v4-notes-topics" aria-label="${l === 'en' ? 'Topics' : 'Темы'}">${[all, ...rest].join('')}</nav>`;
}

export function feedItemHtml(entry, lang) {
  const it = entry.item;
  const date = it.date
    ? `<time class="v4-note-date" datetime="${escapeAttr(it.date)}">${escapeHtml(fmtDate(it.date, lang))}</time>`
    : '';
  // A row of the site's table: the date in the first column; the title and
  // what goes under it — the excerpt of a note, the source of an external
  // material — in the second.
  if (entry.kind === 'note') {
    const ex = escapeHtml(pickL(it.excerpt, lang));
    return `<article class="v4-note-item">
          <div class="v4-note-head">${date}</div>
          <div class="v4-note-main">
            <h2 class="v4-note-title"><a href="${noteUrl(it.slug, lang)}">${escapeHtml(pickL(it.title, lang))}</a></h2>${
      ex ? `\n            <p class="v4-note-excerpt">${ex}</p>` : ''}
          </div>
        </article>`;
  }
  // A trailing «↗» marks a link that leaves the site (the CTA convention);
  // the screen-reader note says what the arrow and target=_blank mean.
  // On the English feed the title is translated but the material itself is in
  // Russian (every external one is today; `lang: 'en'` on an item says otherwise):
  // the source line says so before the reader follows the link.
  const foreign = lang === 'en' && (it.lang || 'ru') !== 'en' ? 'in Russian' : '';
  const meta = [escapeHtml(it.source || ''), foreign, viewsLabel(it.views, lang)].filter(Boolean).join(' · ');
  return `<article class="v4-note-item">
          <div class="v4-note-head">${date}</div>
          <div class="v4-note-main">
            <h2 class="v4-note-title"><a href="${escapeAttr(safeHref(it.href))}" target="_blank" rel="noopener noreferrer">${escapeHtml(
              pickL(it.title, lang)
            )}${outMark(lang)}</a></h2>${
      meta ? `\n            <p class="v4-note-meta">${meta}</p>` : ''}
          </div>
        </article>`;
}

// The Telegram channel panel above the feed; its counter is resolved from the
// home doc (live SocialBot numbers).
export function channelHtml(notesDoc, homeDoc, lang) {
  const ch = notesDoc && notesDoc.channel;
  if (!ch) return '';
  return channelItem(ch, lang, homeDoc || {});
}

export function feedListHtml(feed, lang) {
  return feed.length
    ? feed.map((e) => feedItemHtml(e, lang)).join('\n')
    : `<p class="v4-notes-empty">${lang === 'en' ? 'No publications yet.' : 'Пока нет публикаций.'}</p>`;
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
