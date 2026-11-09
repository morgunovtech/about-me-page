// The /notes feed: own articles and external materials (vc.ru articles,
// YouTube talks) in one list, newest first. Pure functions only — no seed
// import — so Node tests load this file directly; render-notes.js does the I/O.
//
// External materials come from the `notes` content doc (seed today; a KV doc
// wins once /admin manages it). They are not ours to host: no page on the site,
// no RSS item, no sitemap URL — only a row in the feed that links out.
import { escapeHtml, escapeAttr, safeHref } from './markdown.js';
import { fmtNum, pubItem } from './render.js';
import { fmtDate, NEW_TAB } from './i18n.js';
import { noteUrl } from './articles.js';

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

// Published articles (already newest-first) + external materials with a title
// in this language, merged by date. Same-day ties keep own notes first.
export function buildFeed(articles, notesDoc, lang) {
  const own = forLang(articles || [], lang).map((a) => ({ kind: 'note', date: String(a.date || ''), item: a }));
  const ext = ((notesDoc && notesDoc.external) || [])
    .filter((x) => x && x.href && hasTitle(x.title, lang))
    .map((x) => ({ kind: 'external', date: String(x.date || ''), item: x }));
  return [...own, ...ext].sort((p, q) => q.date.localeCompare(p.date));
}

export function feedItemHtml(entry, lang) {
  const it = entry.item;
  const date = it.date
    ? `<time class="v4-note-date" datetime="${escapeAttr(it.date)}">${escapeHtml(fmtDate(it.date, lang))}</time>`
    : '';
  if (entry.kind === 'note') {
    const ex = escapeHtml(pickL(it.excerpt, lang));
    return `<article class="v4-note-item">
          <div class="v4-note-head">${date}<span class="v4-tag">NOTE</span></div>
          <h2 class="v4-note-title"><a href="${noteUrl(it.slug, lang)}">${escapeHtml(pickL(it.title, lang))}</a></h2>
          ${ex ? `<p class="v4-note-excerpt">${ex}</p>` : ''}
        </article>`;
  }
  // A trailing «→» marks a link that leaves the site (the CTA convention);
  // the screen-reader note says what the arrow and target=_blank mean.
  const meta = [escapeHtml(it.source || ''), viewsLabel(it.views, lang)].filter(Boolean).join(' · ');
  return `<article class="v4-note-item">
          <div class="v4-note-head">${date}<span class="v4-tag">${escapeHtml(it.tag || 'LINK')}</span></div>
          <h2 class="v4-note-title"><a href="${escapeAttr(safeHref(it.href))}" target="_blank" rel="noopener noreferrer">${escapeHtml(
            pickL(it.title, lang)
          )}<span aria-hidden="true">&nbsp;→</span><span class="sr-only">${NEW_TAB[lang === 'en' ? 'en' : 'ru']}</span></a></h2>
          ${meta ? `<p class="v4-note-meta">${meta}</p>` : ''}
        </article>`;
}

// The Telegram channel block above the feed — the homepage's CHANNEL item,
// same markup, counters resolved from the home doc (live SocialBot numbers).
export function channelHtml(notesDoc, homeDoc, lang) {
  const ch = notesDoc && notesDoc.channel;
  if (!ch) return '';
  return `<div class="v4-notes-channel">
        ${pubItem(ch, lang, false, '', homeDoc || {})}
      </div>`;
}

export function feedListHtml(feed, lang) {
  return feed.length
    ? feed.map((e) => feedItemHtml(e, lang)).join('\n')
    : `<p class="v4-notes-intro">${lang === 'en' ? 'No publications yet.' : 'Пока нет публикаций.'}</p>`;
}
