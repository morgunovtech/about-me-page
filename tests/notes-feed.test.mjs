// The /notes feed: own articles + external materials (v0.31.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildFeed, feedListHtml, feedItemHtml, channelHtml, viewsLabel } from '../functions/_lib/notes-feed.js';
import { publishedSorted } from '../functions/_lib/articles.js';

const seed = JSON.parse(readFileSync(new URL('../content.seed.json', import.meta.url), 'utf8'));
const notes = seed.notes;
const nb = ' ';

const article = (slug, date, ru, en = '', status = 'published') => ({
  slug, date, status, title: { ru, en }, excerpt: { ru: 'Кратко', en: en ? 'Short' : '' },
});

test('seed: external materials are complete, dated and linked out', () => {
  assert.ok(Array.isArray(notes.external) && notes.external.length === 5);
  for (const x of notes.external) {
    assert.match(x.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(x.href, /^https:\/\//);
    assert.ok(['ARTICLE', 'VIDEO'].includes(x.tag));
    assert.ok(x.title.ru.trim() && x.title.en.trim(), 'both languages');
    assert.ok(Number.isInteger(x.views) && x.views > 0);
  }
  assert.equal(notes.channel.tag, 'CHANNEL');
});

test('feed with no articles: external materials only, newest first', () => {
  const feed = buildFeed([], notes, 'ru');
  assert.deepEqual(feed.map((e) => e.date), ['2025-06-26', '2024-02-18', '2022-08-08', '2022-07-08', '2022-06-19']);
  assert.ok(feed.every((e) => e.kind === 'external'));
  const html = feedListHtml(feed, 'ru');
  assert.ok(!html.includes('Пока нет заметок'));
  assert.equal((html.match(/target="_blank" rel="noopener noreferrer"/g) || []).length, 5);
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
    ['fresh', '2025-06-26', '2024-02-18', 'mid', '2022-08-08', '2022-07-08', '2022-06-19']);
  const first = feedItemHtml(feed[0], 'ru');
  assert.ok(first.includes('<span class="v4-tag">NOTE</span>'));
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
  assert.ok(feedListHtml(buildFeed([], doc, 'en'), 'en').includes('No notes yet.'));
});

test('views are floored to hundreds with «+», never overstated', () => {
  assert.equal(viewsLabel(6299, 'ru'), `6${nb}200+ просмотров`);
  assert.equal(viewsLabel(30506, 'en'), '30,500+ views');
  assert.equal(viewsLabel(99, 'ru'), '');
  assert.equal(viewsLabel(undefined, 'ru'), '');
  const html = feedListHtml(buildFeed([], notes, 'ru'), 'ru');
  assert.ok(html.includes(`vc.ru · 38${nb}100+ просмотров`));
  assert.ok(html.includes(`YouTube · 3${nb}600+ просмотров`));
});

test('external hrefs pass through safeHref, titles are escaped', () => {
  const doc = { external: [{ date: '2024-01-01', tag: 'ARTICLE', source: 'x', href: 'javascript:alert(1)', title: { ru: '<b>Заголовок</b>' }, views: 0 }] };
  const html = feedListHtml(buildFeed([], doc, 'ru'), 'ru');
  assert.ok(!html.includes('javascript:'));
  assert.ok(html.includes('&lt;b&gt;Заголовок&lt;/b&gt;'));
});

test('channel block resolves the live Telegram counter from the home doc', () => {
  const home = structuredClone(seed.home);
  home._live = { subscribers: { telegram: 1234, linkedin: 1, youtube: 1 } };
  const ru = channelHtml(notes, home, 'ru');
  assert.ok(ru.includes(`1${nb}234 в Telegram`));
  assert.ok(ru.includes('https://t.me/raschet7/261'));
  assert.ok(channelHtml(notes, home, 'en').includes('1,234 on Telegram'));
  assert.equal(channelHtml({}, home, 'ru'), '');
});
