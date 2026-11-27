// The /notes feed: own articles + external materials (v0.31.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildFeed, feedListHtml, feedItemHtml, channelHtml, viewsLabel } from '../functions/_lib/notes-feed.js';
import { publishedSorted } from '../functions/_lib/articles.js';
import { fmtDate } from '../functions/_lib/i18n.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const notes = seed.notes;
// The mark of a link that leaves the site: the line's «→» turned 45° and the new-tab note.
const OUT = {
  ru: '<span class="v4-out" aria-hidden="true">&#8288;<span class="v4-ne">→</span></span><span class="sr-only"> (откроется в новой вкладке)</span>',
  en: '<span class="v4-out" aria-hidden="true">&#8288;<span class="v4-ne">→</span></span><span class="sr-only"> (opens in a new tab)</span>',
};
// A pattern for a piece of markup: its lines in order, whatever the indentation between them.
const lines = (...parts) => new RegExp('^' + parts.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*') + '$');
const nb = ' ';

const article = (slug, date, ru, en = '', status = 'published') => ({
  slug, date, status, title: { ru, en }, excerpt: { ru: 'Кратко', en: en ? 'Short' : '' },
});

test('seed: external materials are complete, dated and linked out', () => {
  assert.ok(Array.isArray(notes.external) && notes.external.length === 9);
  for (const x of notes.external) {
    assert.match(x.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(x.href, /^https:\/\//);
    // No free-text tag since v1.5.0: the feed names the platform from the address.
    assert.equal(x.tag, undefined);
    assert.ok(x.title.ru.trim() && x.title.en.trim(), 'both languages');
    // A view count for the owner's own material where the platform shows one (vc.ru, YouTube);
    // press and company news (spot.uz, tashkenttimes.uz, a company's channel) carry none (v2.2.1).
    if (x.views !== undefined) assert.ok(Number.isInteger(x.views) && x.views > 0);
    else assert.doesNotMatch(x.href, /^https:\/\/(vc\.ru|youtu\.be|www\.youtube\.com)\//, x.href);
    // Every material is in Russian unless it says otherwise (the English feed tells the reader).
    assert.ok(x.lang === undefined || ['ru', 'en'].includes(x.lang), x.href);
  }
});

test('feed with no articles: external materials only, newest first', () => {
  const feed = buildFeed([], notes, 'ru');
  assert.deepEqual(feed.map((e) => e.date), ['2026-03-02', '2026-02-06', '2025-12-10', '2025-06-26', '2025-01-28', '2024-02-18', '2022-08-08', '2022-07-08', '2022-06-19']);
  assert.ok(feed.every((e) => e.kind === 'external'));
  const html = feedListHtml(feed, 'ru');
  assert.ok(!html.includes('v4-notes-empty') && !html.includes('Пока нет'));
  assert.equal((html.match(/<article class="v4-note-item">/g) || []).length, 9);
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 9);
  assert.ok(html.includes('откроется в новой вкладке'));
});

test('feed interleaves published articles by date, drafts stay out', () => {
  const idx = [
    article('fresh', '2026-10-01', 'Свежая', 'Fresh'),
    article('mid', '2023-05-05', 'Середина'),
    article('draft', '2026-11-01', 'Черновик', '', 'draft'),
  ];
  const feed = buildFeed(publishedSorted(idx), notes, 'ru');
  assert.deepEqual(feed.map((e) => (e.kind === 'note' ? e.item.slug : e.date)),
    ['fresh', '2026-03-02', '2026-02-06', '2025-12-10', '2025-06-26', '2025-01-28', '2024-02-18', 'mid', '2022-08-08', '2022-07-08', '2022-06-19']);
  const first = feedItemHtml(feed[0], 'ru');
  assert.ok(!first.includes('v4-tag'));
  assert.ok(first.includes('href="/notes/fresh"'));
  assert.ok(!first.includes('target="_blank"'));
});

test('EN feed: untranslated articles drop out, external materials keep EN titles', () => {
  const idx = [article('fresh', '2026-10-01', 'Свежая', 'Fresh'), article('mid', '2023-05-05', 'Середина')];
  const feed = buildFeed(publishedSorted(idx), notes, 'en');
  assert.deepEqual(feed.filter((e) => e.kind === 'note').map((e) => e.item.slug), ['fresh']);
  const html = feedListHtml(feed, 'en');
  assert.ok(html.includes('href="/en/notes/fresh"'));
  assert.ok(html.includes('How low-cost airlines make money'));
  assert.ok(html.includes('opens in a new tab'));
  assert.ok(!html.includes('Середина'));
});

test('an external material without a title in this language is left out', () => {
  const doc = { external: [{ date: '2024-01-01', tag: 'VIDEO', source: 'YouTube', href: 'https://youtu.be/x', title: { ru: 'Только RU', en: '' }, views: 500 }] };
  assert.equal(buildFeed([], doc, 'ru').length, 1);
  assert.equal(buildFeed([], doc, 'en').length, 0);
  assert.ok(feedListHtml(buildFeed([], doc, 'en'), 'en').includes('No publications yet.'));
});

test('views are floored to hundreds with «+», never overstated', () => {
  assert.equal(viewsLabel(6299, 'ru'), `6${nb}200+ просмотров`);
  assert.equal(viewsLabel(30506, 'en'), '30,500+ views');
  assert.equal(viewsLabel(99, 'ru'), '');
  assert.equal(viewsLabel(undefined, 'ru'), '');
  const html = feedListHtml(buildFeed([], notes, 'ru'), 'ru');
  assert.ok(html.includes(`vc.ru · 41${nb}000+ просмотров`));
  assert.ok(html.includes(`YouTube · 3${nb}600+ просмотров`));
});

test('external hrefs pass through safeHref, titles are escaped', () => {
  const doc = { external: [{ date: '2024-01-01', tag: 'ARTICLE', source: 'x', href: 'javascript:alert(1)', title: { ru: '<b>Заголовок</b>' }, views: 0 }] };
  const html = feedListHtml(buildFeed([], doc, 'ru'), 'ru');
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('&lt;b&gt;Заголовок&lt;/b&gt;'));
});

test('channel panel: what the channel is, how many read it — the live Telegram counter of the home doc — since when, the selected posts, and ONE small button', () => {
  // The doc says what the panel shows and nothing else: the «CHANNEL» tag, the `kind` and the
  // «{telegram} в Telegram» template of the old row went with the row.
  assert.deepEqual(Object.keys(notes.channel).sort(), ['cta', 'more', 'prose', 'since', 'title']);
  assert.deepEqual(notes.channel.since, { ru: 'пишу с 2022 года', en: 'writing since 2022' });
  assert.equal(notes.channel.title.en, 'My Telegram channel');
  // What a reader gets there and not here: posts come out more often and in a freer form.
  assert.match(notes.channel.prose.ru, /В канале посты выходят чаще и в более свободном формате, чем заметки на сайте\./);
  assert.match(notes.channel.prose.en, /Posts there come out more often and in a looser format than the notes on this site\./);
  const home = structuredClone(seed.home);
  home._live = { subscribers: { telegram: 1234, linkedin: 1, youtube: 1 } };
  const ru = channelHtml(notes, home, 'ru');
  assert.match(ru, lines(
    '<section class="v4-channel" aria-labelledby="channel-title">',
    '<div>',
    `<h2 class="v4-channel-title" id="channel-title">${notes.channel.title.ru}</h2>`,
    `<p class="v4-channel-desc">${notes.channel.prose.ru}</p>`,
    // The counter with its noun declined, since when, and the selected posts — a link that
    // leaves the site, marked as one.
    `<p class="v4-channel-meta">1${nb}234&nbsp;подписчика · пишу с 2022 года · <a href="https://t.me/raschet7/261" target="_blank" rel="noopener noreferrer">Избранные посты${OUT.ru}</a></p>`,
    '</div>',
    '<a class="v4-btn v4-btn--sm" href="https://t.me/raschet7" target="_blank" rel="noopener noreferrer">Подписаться</a>',
    '</section>',
  ));
  const en = channelHtml(notes, home, 'en');
  assert.match(en, lines(
    '<section class="v4-channel" aria-labelledby="channel-title">',
    '<div>',
    '<h2 class="v4-channel-title" id="channel-title">My Telegram channel</h2>',
    `<p class="v4-channel-desc">${notes.channel.prose.en}</p>`,
    `<p class="v4-channel-meta">1,234&nbsp;subscribers · writing since 2022 · <a href="https://t.me/raschet7/261" target="_blank" rel="noopener noreferrer">Selected posts${OUT.en}</a></p>`,
    '</div>',
    '<a class="v4-btn v4-btn--sm" href="https://t.me/raschet7" target="_blank" rel="noopener noreferrer">Subscribe</a>',
    '</section>',
  ));
  for (const html of [ru, en]) {
    assert.equal((html.match(/class="v4-btn/g) || []).length, 1, 'one button in a block');
    assert.equal((html.match(/2022/g) || []).length, 1, '«since 2022» is said once, in the meta line');
    assert.doesNotMatch(html, /CHANNEL|v4-tag|v4-pub|\{telegram\}/);
  }
  // Without live numbers the counter is the home doc's own, declined all the same.
  assert.ok(channelHtml(notes, seed.home, 'ru').includes(`<p class="v4-channel-meta">1${nb}157&nbsp;подписчиков · `));
  // No home doc at all: the line starts with the next fact.
  assert.ok(channelHtml(notes, null, 'ru').includes('<p class="v4-channel-meta">пишу с 2022 года · '));
  assert.equal(channelHtml({}, home, 'ru'), '');
});

test('a feed row is a row of the site\'s table: the date, then the title and what goes under it; an empty feed says so', () => {
  const [own] = buildFeed(publishedSorted([article('fresh', '2026-10-01', 'Свежая', 'Fresh')]), {}, 'ru');
  // An own note stays on the site; its excerpt goes under the title.
  assert.match(feedItemHtml(own, 'ru'), lines(
    '<article class="v4-note-item">',
    '<div class="v4-note-head"><time class="v4-note-date" datetime="2026-10-01">1 октября 2026</time></div>',
    '<div class="v4-note-main">',
    '<h2 class="v4-note-title"><a href="/notes/fresh">Свежая</a></h2>',
    '<p class="v4-note-excerpt">Кратко</p>',
    '</div>',
    '</article>',
  ));
  // A material published elsewhere leaves the site and says so; under the title — where it
  // was published and how many saw it.
  const item = { date: '2022-06-19', source: 'vc.ru', href: 'https://vc.ru/x', title: { ru: 'Заголовок', en: 'Title' }, views: 6299 };
  const row = (lang, over = {}) => feedItemHtml({ kind: 'external', date: item.date, item: { ...item, ...over } }, lang);
  assert.match(row('ru'), lines(
    '<article class="v4-note-item">',
    '<div class="v4-note-head"><time class="v4-note-date" datetime="2022-06-19">19 июня 2022</time></div>',
    '<div class="v4-note-main">',
    `<h2 class="v4-note-title"><a href="https://vc.ru/x" target="_blank" rel="noopener noreferrer">Заголовок${OUT.ru}</a></h2>`,
    `<p class="v4-note-meta">vc.ru · 6${nb}200+ просмотров</p>`,
    '</div>',
    '</article>',
  ));
  // Nothing to put under a title → no empty paragraph; no date → an empty first column, not a broken <time>.
  assert.doesNotMatch(row('ru', { source: '', views: 0 }), /v4-note-meta|<p/);
  assert.doesNotMatch(feedItemHtml({ kind: 'note', item: { slug: 's', title: { ru: 'Т' } } }, 'ru'), /v4-note-excerpt|<p|<time/);
  // The row carries no tag, no topic and no source chip of its own (composition rule 4).
  assert.doesNotMatch(row('ru') + feedItemHtml(own, 'ru'), /v4-tag/);
  assert.equal(feedListHtml([], 'ru'), '<p class="v4-notes-empty">Пока нет публикаций.</p>');
  assert.equal(feedListHtml([], 'en'), '<p class="v4-notes-empty">No publications yet.</p>');
});

test('/en/notes says that a material is in Russian before the reader follows the link; the Russian feed does not', () => {
  const item = { date: '2025-06-26', source: 'spot.uz', href: 'https://www.spot.uz/x', title: { ru: 'Заголовок', en: 'Title' }, views: 3611 };
  const meta = (lang, over = {}) => (/<p class="v4-note-meta">([^<]*)<\/p>/.exec(feedItemHtml({ kind: 'external', date: item.date, item: { ...item, ...over } }, lang)) || [])[1];
  // The title is translated, the material is not: the source line says so, between where and how many.
  assert.equal(meta('en'), 'spot.uz · in Russian · 3,600+ views');
  assert.equal(meta('en', { views: undefined }), 'spot.uz · in Russian');
  assert.equal(meta('en', { source: '', views: undefined }), 'in Russian');
  // A material that is in English says nothing: `lang: 'en'` on the item.
  assert.equal(meta('en', { lang: 'en' }), 'spot.uz · 3,600+ views');
  // The Russian feed is unchanged — there the language is the reader's own.
  assert.equal(meta('ru'), `spot.uz · 3${nb}600+ просмотров`);
  assert.equal(meta('ru', { lang: 'en' }), `spot.uz · 3${nb}600+ просмотров`);
  // Today every external material of the seed is in Russian: each English row says so, once.
  const en = buildFeed([], notes, 'en');
  assert.ok(en.length > 0);
  for (const e of en) assert.equal((feedItemHtml(e, 'en').match(/in Russian/g) || []).length, 1, e.item.href);
  // An own note has an English page of its own (/en/notes/<slug>): nothing to warn about.
  const [own] = buildFeed(publishedSorted([article('fresh', '2026-10-01', 'Свежая', 'Fresh')]), {}, 'en');
  assert.doesNotMatch(feedItemHtml(own, 'en'), /in Russian/);
});

test('a date reads «8 ноября 2026» — no «г.» after the year — and “8 November 2026”; the feed and a note\'s byline share one formatter', () => {
  assert.equal(fmtDate('2026-11-08', 'ru'), '8 ноября 2026');
  assert.equal(fmtDate('2025-06-26', 'ru'), '26 июня 2025');
  // English: day month year, as the English copy writes its dates («Checked on 25 November 2026»).
  assert.equal(fmtDate('2026-11-08', 'en'), '8 November 2026');
  // Every month, both languages: a day, a word, a year — and nothing after the year.
  for (let m = 1; m <= 12; m++) {
    const date = `2026-${String(m).padStart(2, '0')}-15`;
    assert.match(fmtDate(date, 'ru'), /^15 [а-яё]+ 2026$/, date);
    assert.match(fmtDate(date, 'en'), /^15 [A-Z][a-z]+ 2026$/, date);
  }
  // A YYYY-MM-DD date has no time zone: the day does not shift with the machine's.
  assert.equal(fmtDate('2026-01-01', 'ru'), '1 января 2026');
  assert.equal(fmtDate('2026-12-31', 'en'), '31 December 2026');
  assert.equal(fmtDate('', 'ru'), '');
  assert.equal(fmtDate(undefined, 'en'), '');
  // A date that cannot be read is shown as written — never an exception in the middle of a page.
  assert.equal(fmtDate('скоро', 'ru'), 'скоро');
  // The row of the feed uses it…
  const [own] = buildFeed(publishedSorted([article('fresh', '2026-11-08', 'Свежая', 'Fresh')]), {}, 'en');
  assert.ok(feedItemHtml(own, 'en').includes('<time class="v4-note-date" datetime="2026-11-08">8 November 2026</time>'));
  // …and so does the page of a note: render-article.js had a twin of the formatter, which kept
  // «г.»; there is one function now.
  const ra = read('functions/_lib/render-article.js');
  assert.match(ra, /import \{ pick, fmtDate \} from '\.\/i18n\.js';/);
  assert.match(ra, /doc\._dateDisplay = fmtDate\(doc\.date, lang\);/);
  assert.doesNotMatch(ra, /Intl\.DateTimeFormat|function dateDisplay/);
});

test('the intro of /notes: the seed and the fallback in render-notes.js are the same two sentences', () => {
  assert.equal(notes.intro.ru, 'Заметки, статьи и выступления. Свои заметки — посты из Telegram-канала, собранные без привязки к платформе.');
  assert.equal(notes.intro.en, 'Notes, articles and talks. My notes are posts from my Telegram channel, kept here without the platform lock-in.');
  // render-notes.js keeps a copy for a notes doc without an intro; a copy that drifts is a second text.
  const src = read('functions/_lib/render-notes.js');
  for (const l of ['ru', 'en']) assert.ok(src.includes(`  ${l}: '${notes.intro[l]}',`), `INTRO.${l}`);
});
