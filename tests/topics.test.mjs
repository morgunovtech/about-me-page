// v2.2.0 — topics of notes. The `notes` doc names them; a note (and an external
// material) carries `tags`. A topic is navigation — a page per topic, a link in a
// note's byline, a line above the feed — never a chip in a feed row (composition
// rule 4), and it reaches crawlers and assistants through the sitemap, RSS
// categories, JSON-LD keywords and llms.txt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { topicsOf, buildFeed, liveTopics, topicNavHtml, topicUrl, notesList, feedItemHtml } from '../functions/_lib/notes-feed.js';
import { cleanTags, indexEntry, makeArticleDoc } from '../functions/_lib/articles.js';
import { notesIndexHtml } from '../functions/_lib/article-template.js';
import { topicPaths, NOTES_PATHS } from '../functions/_lib/cache.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const notesDoc = seed.notes;
const A = (slug, date, tags, en = 'T ' + slug) => ({ slug, date, title: { ru: 'З ' + slug, en }, excerpt: { ru: 'о ' + slug, en: 'about ' + slug }, status: 'published', tags });
const articles = [
  A('e', '2026-01-11', ['privacy']),
  A('y', '2025-12-07', ['privacy']),
  A('t', '2023-08-12', ['management'], ''),
  A('n', '2023-01-01', []),
];

test('the six topics of the owner’s table of contents, in its order', () => {
  assert.deepEqual(topicsOf(notesDoc).map((t) => t.key), ['management', 'productivity', 'career', 'tech-history', 'tools', 'privacy']);
  for (const t of topicsOf(notesDoc)) {
    for (const l of ['ru', 'en']) {
      assert.ok(t.name[l].trim() && t.intro[l].trim(), `${t.key}.${l}`);
      assert.doesNotMatch(t.name[l] + t.intro[l], /\p{Extended_Pictographic}/u, `${t.key}: no emoji`);
    }
  }
  assert.deepEqual(topicsOf({ topics: [{ key: 'Bad Key' }, { key: 'ok' }] }).map((t) => t.key), ['ok']);
});

test('a topic filters the feed — own notes and external materials alike — and only topics with something show', () => {
  assert.deepEqual(buildFeed(articles, notesDoc, 'ru', 'privacy').map((e) => e.item.slug), ['e', 'y']);
  const mgmt = buildFeed(articles, notesDoc, 'ru', 'management');
  assert.deepEqual(mgmt.map((e) => e.kind), ['external', 'external', 'note'], 'the two spot.uz pieces are tagged management');
  // English: an untranslated note is not there; the topic still lives through its external materials.
  assert.deepEqual(buildFeed(articles, notesDoc, 'en', 'management').map((e) => e.kind), ['external', 'external']);
  const live = liveTopics(articles, notesDoc, 'ru');
  assert.deepEqual(live.map((t) => [t.key, t.count]), [['management', 3], ['productivity', 1], ['career', 1], ['privacy', 2]]);
  // Feed rows stay «date · where»: no topic in the row.
  for (const e of buildFeed(articles, notesDoc, 'ru')) assert.doesNotMatch(feedItemHtml(e, 'ru'), /Приватность|Менеджмент/);
});

test('the topic line: «Все» with the total and each live topic with its count, set apart by space alone; the current page is text, not a link', () => {
  const name = (key, lang) => notesDoc.topics.find((t) => t.key === key).name[lang];
  // Every item says how much is behind it. The number is quiet — the line's own face, regular,
  // muted — and the space before it is a no-break one INSIDE the count: a link's name reads «Менеджмент команды 3»,
  // not «…команды3», and the underline of the link stops at the label.
  const count = (n) => `<span class="v4-count">&nbsp;${n}</span>`;
  const live = liveTopics(articles, notesDoc, 'ru');
  const total = buildFeed(articles, notesDoc, 'ru').length;
  assert.equal(total, 13);
  // No «·» between the items — space alone sets them apart (a margin and the space between two
  // words: the line wraps like text and splits evenly), as in the on-page line of a page, where
  // a separator started the second row whenever the line wrapped.
  assert.equal(topicNavHtml(live, 'ru', undefined, total), '<nav class="v4-notes-topics" aria-label="Темы">'
    + `<span aria-current="page">Все${count(13)}</span>`
    + ` <a href="/notes/topics/management">${name('management', 'ru')}${count(3)}</a>`
    + ` <a href="/notes/topics/productivity">${name('productivity', 'ru')}${count(1)}</a>`
    + ` <a href="/notes/topics/career">${name('career', 'ru')}${count(1)}</a>`
    + ` <a href="/notes/topics/privacy">${name('privacy', 'ru')}${count(2)}</a>`
    + '</nav>');
  // On a topic's page «All» is a link again and still carries the total; the topic is the text.
  const liveEn = liveTopics(articles, notesDoc, 'en');
  const on = topicNavHtml(liveEn, 'en', 'privacy', buildFeed(articles, notesDoc, 'en').length);
  assert.ok(on.startsWith(`<nav class="v4-notes-topics" aria-label="Topics"><a href="/en/notes">All${count(12)}</a>`), on);
  assert.ok(on.includes(`<span aria-current="page">Security and privacy${count(2)}</span>`), on);
  assert.doesNotMatch(on, /href="\/en\/notes\/topics\/privacy"/);
  assert.equal((on.match(/aria-current="page"/g) || []).length, 1, 'one sign for one state');
  assert.doesNotMatch(on, /·/);
  // A count is formatted as every number of the page; a missing or zero one is not shown at all.
  assert.ok(topicNavHtml(liveEn, 'en', undefined, 1234).includes(`All${count('1,234')}</span>`));
  assert.ok(topicNavHtml(live, 'ru', undefined, 1234).includes(`Все${count('1\u00a0234')}</span>`));
  assert.ok(topicNavHtml(live, 'ru').startsWith('<nav class="v4-notes-topics" aria-label="Темы"><span aria-current="page">Все</span> <a '));
  assert.ok(topicNavHtml(live, 'ru', undefined, 0).includes('<span aria-current="page">Все</span>'));
  assert.equal(topicNavHtml([], 'ru', undefined, 5), '');
  assert.equal(topicUrl('tools', 'en'), '/en/notes/topics/tools');
  // The count is an inline-block: a link's underline is not drawn under it.
  assert.match(read('styles.css'), /\.v4-count \{[^}]*display: inline-block;/);
  // «Все» gets the whole feed of the language, on /notes and on a topic's page alike.
  const rn = read('functions/_lib/render-notes.js');
  assert.match(rn, /const total = topicKey \? buildFeed\(articles, notesDoc, l\)\.length : feed\.length;/);
  assert.match(rn, /topicNavHtml\(topics, l, topic && topic\.key, total\)/);
});

test('a topic page: the site\'s page title with how many publications it lists, canonical, hreflang only when the topic has English pieces', () => {
  const page = notesIndexHtml('ru', '<article class="v4-note-item"></article>', '{}', 'abc', { intro: 'i', heading: 'Безопасность и приватность', count: 7, path: '/notes/topics/privacy', hasEn: false, topics: '<nav class="v4-notes-topics"></nav>' });
  assert.match(page, /<title>Безопасность и приватность — Публикации — /);
  // The title is the one page title of the site (.v4-h1 in the hero every page opens with), not
  // a style of its own. Beside it — how many publications the page lists: the number for the
  // eye, the words for a screen reader («Безопасность и приватность — всего: 7»).
  assert.ok(page.includes('<section class="v4-hero v4-hero--simple" aria-labelledby="hero-title">'));
  assert.ok(page.includes('<h1 class="v4-h1" id="hero-title">Безопасность и приватность <span class="v4-h1-count"><span class="sr-only">— всего: </span>7</span></h1>'));
  assert.ok(page.includes('<p class="v4-tagline">i</p>'));
  assert.equal((page.match(/<h1[\s>]/g) || []).length, 1);
  assert.doesNotMatch(page, /v4-notes-title|v4-notes-intro|v4-notes-channel|<div class="v4-article">/);
  assert.match(page, /<link rel="canonical" href="https:\/\/s\.morgunov\.tech\/notes\/topics\/privacy" \/>/);
  assert.doesNotMatch(page, /<link rel="alternate" hreflang="en"/);
  // Under the title: the topic line, then the feed in its own container (the first row draws
  // the table's top rule as the container's first child).
  const at = (s) => page.indexOf(s);
  assert.ok(at('</section>') > 0 && at('</section>') < at('<nav class="v4-notes-topics">') && at('<nav class="v4-notes-topics">') < at('<div class="v4-notes-feed">'));
  assert.match(page, /<div class="v4-notes-feed">\s*<article class="v4-note-item"><\/article>\s*<\/div>\s*<\/main>/);
  const en = notesIndexHtml('en', '', '{}', 'abc', { intro: 'i', heading: 'Security and privacy', count: 2, path: '/notes/topics/privacy', hasEn: true });
  assert.ok(en.includes('<h1 class="v4-h1" id="hero-title">Security and privacy <span class="v4-h1-count"><span class="sr-only">— total: </span>2</span></h1>'));
  assert.match(en, /<link rel="canonical" href="https:\/\/s\.morgunov\.tech\/en\/notes\/topics\/privacy" \/>/);
  assert.match(en, /hreflang="en" href="https:\/\/s\.morgunov\.tech\/en\/notes\/topics\/privacy"/);
  // /notes itself: «Публикации» with the count of the whole feed, the channel panel between the
  // topic line and the feed; a page with nothing to count shows the title alone, never «0».
  const index = notesIndexHtml('ru', '', '{}', 'abc', { intro: 'i', count: 52, topics: '<nav class="v4-notes-topics"></nav>', channel: '<section class="v4-channel"></section>' });
  assert.ok(index.includes('<h1 class="v4-h1" id="hero-title">Публикации <span class="v4-h1-count"><span class="sr-only">— всего: </span>52</span></h1>'));
  assert.ok(index.indexOf('<nav class="v4-notes-topics">') < index.indexOf('<section class="v4-channel">') && index.indexOf('<section class="v4-channel">') < index.indexOf('<div class="v4-notes-feed">'));
  assert.ok(notesIndexHtml('ru', '', '{}', 'abc', { intro: 'i' }).includes('<h1 class="v4-h1" id="hero-title">Публикации</h1>'));
  assert.ok(notesIndexHtml('en', '', '{}', 'abc', { intro: 'i', count: 0 }).includes('<h1 class="v4-h1" id="hero-title">Publications</h1>'));
  // The number beside the title is the feed of this page — a topic's own on a topic's page.
  assert.match(read('functions/_lib/render-notes.js'), /count: feed\.length,/);
  assert.match(notesIndexHtml('ru', '', '{}', 'abc', { intro: 'i' }), /<link rel="canonical" href="https:\/\/s\.morgunov\.tech\/notes" \/>/);
  for (const f of ['functions/notes/topics/[key].js', 'functions/en/notes/topics/[key].js']) {
    assert.match(read(f), /renderNotesIndex\(env, '(ru|en)', String\(key \|\| ''\)\)/, f);
    assert.match(read(f), /return res \|\| notFound\(env, request\)/, f);
  }
});

test('tags on a note: clean keys, kept in the feed index, a change purges the topic pages', () => {
  assert.deepEqual(cleanTags(['Privacy', 'privacy', ' tools ', 'bad key', 'a'.repeat(41), null, 'x', 'y', 'z', 'w']), ['privacy', 'tools', 'x', 'y', 'z']);
  assert.deepEqual(cleanTags('privacy'), []);
  assert.deepEqual(makeArticleDoc({ slug: 's', tags: ['privacy'] }).tags, ['privacy']);
  assert.deepEqual(indexEntry({ slug: 's', title: {}, tags: ['management', 'Bad key'] }).tags, ['management']);
  assert.deepEqual(topicPaths(['privacy']), ['/notes/topics/privacy', '/en/notes/topics/privacy']);
  assert.ok(NOTES_PATHS.includes('/llms.txt'));
  assert.match(read('functions/admin/api/save.js'), /doc\.tags = cleanTags\(doc\.tags\);/);
  assert.match(read('functions/admin/api/save.js'), /\.\.\.topicPaths\(doc\.tags\)/);
  assert.match(read('admin-app.js'), /Темы \(ключи через запятую\)/);
});

test('crawlers and assistants see the topics: sitemap, RSS categories, JSON-LD keywords, the byline, llms.txt', () => {
  const rn = read('functions/_lib/render-notes.js');
  assert.match(rn, /for \(const t of liveTopics\(all, notesDoc, 'ru'\)\)/);
  assert.match(rn, /<category>\$\{xmlEsc\(names\.get\(k\)\)\}<\/category>/);
  assert.match(read('functions/_lib/jsonld.js'), /keywords: doc\._keywords\.join\(', '\)/);
  assert.match(read('functions/_lib/article-template.js'), /<span data-cms-html="_topicsHtml"><\/span><\/p>/);
  assert.match(read('functions/_lib/render-article.js'), /doc\._topicsHtml = topics\.length/);
  const txt = notesList(articles, notesDoc);
  assert.match(txt, /### Security and privacy \(https:\/\/s\.morgunov\.tech\/en\/notes\/topics\/privacy\)\n\n- \[T e\]\(https:\/\/s\.morgunov\.tech\/en\/notes\/e\) — about e/);
  assert.match(txt, /- \[З t\]\(https:\/\/s\.morgunov\.tech\/notes\/t\) — in Russian — о t/);
  assert.match(txt, /### Other notes\n\n- \[T n\]/);
  assert.equal(notesList([], notesDoc), '');
  assert.match(read('llms.txt'), /^\{notes\}$/m);
});
