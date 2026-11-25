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
  assert.deepEqual(live.map((t) => [t.key, t.count]), [['management', 3], ['privacy', 2]]);
  // Feed rows stay «date · where»: no topic in the row.
  for (const e of buildFeed(articles, notesDoc, 'ru')) assert.doesNotMatch(feedItemHtml(e, 'ru'), /Приватность|Менеджмент/);
});

test('the topic line: «Все» and each live topic; the current page is text, not a link', () => {
  const live = liveTopics(articles, notesDoc, 'ru');
  const all = topicNavHtml(live, 'ru');
  assert.match(all, /^<nav class="v4-notes-topics" aria-label="Темы"><span aria-current="page">Все<\/span>/);
  assert.match(all, /<a href="\/notes\/topics\/privacy">Безопасность и приватность<\/a>/);
  const on = topicNavHtml(live, 'en', 'privacy');
  assert.match(on, /<a href="\/en\/notes">All<\/a>/);
  assert.match(on, /<span aria-current="page">Security and privacy<\/span>/);
  assert.doesNotMatch(on, /href="\/en\/notes\/topics\/privacy"/);
  assert.equal(topicNavHtml([], 'ru'), '');
  assert.equal(topicUrl('tools', 'en'), '/en/notes/topics/tools');
});

test('a topic page: its heading, canonical, hreflang only when the topic has English pieces', () => {
  const page = notesIndexHtml('ru', '<ul></ul>', '{}', 'abc', { intro: 'i', heading: 'Безопасность и приватность', path: '/notes/topics/privacy', hasEn: false, topics: '<nav class="v4-notes-topics"></nav>' });
  assert.match(page, /<title>Безопасность и приватность — Публикации — /);
  assert.match(page, /<h1 class="v4-notes-title">Безопасность и приватность<\/h1>/);
  assert.match(page, /<link rel="canonical" href="https:\/\/s\.morgunov\.tech\/notes\/topics\/privacy" \/>/);
  assert.doesNotMatch(page, /<link rel="alternate" hreflang="en"/);
  assert.match(page, /<nav class="v4-notes-topics">/);
  const en = notesIndexHtml('en', '', '{}', 'abc', { intro: 'i', heading: 'Security and privacy', path: '/notes/topics/privacy', hasEn: true });
  assert.match(en, /<link rel="canonical" href="https:\/\/s\.morgunov\.tech\/en\/notes\/topics\/privacy" \/>/);
  assert.match(en, /hreflang="en" href="https:\/\/s\.morgunov\.tech\/en\/notes\/topics\/privacy"/);
  // /notes itself is unchanged.
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
