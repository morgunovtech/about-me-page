// v4.9.1 — every sub-page carries a BreadcrumbList in its JSON-LD: the notes, /notes and the topic
// pages, and /consulting (they had none; /uses, /collaborate, /privacy and the static product pages
// did). A note's author node names the same url as the homepage's Person on both languages. The
// project's technical host <project>.pages.dev answers a page request with a 301 to s.morgunov.tech;
// its previews keep answering, with noindex.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderArticleJsonLd, renderPageJsonLd, renderNotesIndexJsonLd } from '../functions/_lib/jsonld.js';
import { technicalHostRedirect } from '../functions/_lib/http.js';
import { withName, TITLE_MAX } from '../functions/_lib/site.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const ORIGIN = 'https://s.morgunov.tech';
const crumbs = (graph) => graph.find((n) => n['@type'] === 'BreadcrumbList');
const trail = (bc) => bc.itemListElement.map((i) => [i.position, i.name, i.item]);

test('a note: Home → Publications → the note; the author is one Person with one url', () => {
  const note = (lang) => ({
    _url: ORIGIN + (lang === 'en' ? '/en' : '') + '/notes/hello',
    date: '2026-05-26',
    title: { ru: 'Привет', en: 'Hi' },
    excerpt: { ru: 'кратко', en: 'short' },
  });
  const ru = JSON.parse(renderArticleJsonLd(note('ru'), 'ru'))['@graph'];
  assert.deepEqual(trail(crumbs(ru)), [
    [1, 'Главная', ORIGIN + '/'],
    [2, 'Публикации', ORIGIN + '/notes'],
    [3, 'Привет', ORIGIN + '/notes/hello'],
  ]);
  assert.equal(crumbs(ru)['@id'], ORIGIN + '/notes/hello#breadcrumb');
  const en = JSON.parse(renderArticleJsonLd(note('en'), 'en'))['@graph'];
  assert.deepEqual(trail(crumbs(en)), [
    [1, 'Home', ORIGIN + '/en/'],
    [2, 'Publications', ORIGIN + '/en/notes'],
    [3, 'Hi', ORIGIN + '/en/notes/hello'],
  ]);
  for (const g of [ru, en]) {
    const person = g.find((n) => n['@type'] === 'Person');
    assert.equal(person['@id'], ORIGIN + '/#person');
    assert.equal(person.url, ORIGIN + '/', 'the homepage graph names the RU homepage on both languages');
  }
});

test('/consulting gets a breadcrumb beside its Service', () => {
  for (const lang of ['ru', 'en']) {
    const g = JSON.parse(renderPageJsonLd(seed.consulting, lang, 'consulting'))['@graph'];
    const url = ORIGIN + (lang === 'en' ? '/en' : '') + '/consulting';
    assert.ok(g.find((n) => n['@type'] === 'Service'), lang);
    assert.deepEqual(trail(crumbs(g)), [
      [1, lang === 'en' ? 'Home' : 'Главная', ORIGIN + (lang === 'en' ? '/en/' : '/')],
      [2, lang === 'en' ? 'Consulting' : 'Консалтинг', url],
    ]);
    assert.equal(g.find((n) => n['@type'] === 'WebPage').breadcrumb['@id'], url + '#breadcrumb');
  }
  // The pages that had one keep it.
  for (const page of ['uses', 'collaborate', 'privacy']) {
    assert.ok(crumbs(JSON.parse(renderPageJsonLd(seed[page], 'ru', page))['@graph']), page);
  }
});

test('/notes and a topic page: Home → Publications (→ the topic), the feed as the main entity', () => {
  const items = [{ url: ORIGIN + '/notes/a', name: 'А' }, { url: 'https://vc.ru/x', name: 'Б' }];
  const index = JSON.parse(renderNotesIndexJsonLd({ url: ORIGIN + '/notes', lang: 'ru', name: 'Публикации — Семён Моргунов', topic: null, items }))['@graph'];
  assert.deepEqual(trail(crumbs(index)), [[1, 'Главная', ORIGIN + '/'], [2, 'Публикации', ORIGIN + '/notes']]);
  const page = index.find((n) => n['@type'] === 'CollectionPage');
  assert.equal(page.breadcrumb['@id'], ORIGIN + '/notes#breadcrumb');
  assert.equal(page.mainEntity['@id'], ORIGIN + '/notes#feed');
  assert.deepEqual(page.about, { '@id': ORIGIN + '/#person' });
  const feed = index.find((n) => n['@type'] === 'ItemList');
  assert.equal(feed['@id'], ORIGIN + '/notes#feed');
  assert.deepEqual(feed.itemListElement.map((i) => [i.position, i.url, i.name]), [[1, ORIGIN + '/notes/a', 'А'], [2, 'https://vc.ru/x', 'Б']]);

  const url = ORIGIN + '/en/notes/topics/management';
  const topic = JSON.parse(renderNotesIndexJsonLd({ url, lang: 'en', name: 'Team management — Publications — Semyon Morgunov', topic: 'Team management', items }))['@graph'];
  assert.deepEqual(trail(crumbs(topic)), [[1, 'Home', ORIGIN + '/en/'], [2, 'Publications', ORIGIN + '/en/notes'], [3, 'Team management', url]]);
  assert.deepEqual(topic.find((n) => n['@type'] === 'CollectionPage').about, { '@type': 'Thing', name: 'Team management' });
  // The route builds it from the feed it renders.
  assert.match(read('functions/_lib/render-notes.js'), /renderNotesIndexJsonLd\(\{/);
});

test('<project>.pages.dev moves to s.morgunov.tech; previews, other methods and the site stay', () => {
  const req = (url, method = 'GET') => new Request(url, { method });
  const moved = technicalHostRedirect(req('https://about-me-page-cr2.pages.dev/en/notes/yubikey?x=1'), ORIGIN);
  assert.equal(moved.status, 301);
  assert.equal(moved.headers.get('location'), ORIGIN + '/en/notes/yubikey?x=1');
  assert.equal(moved.headers.get('x-robots-tag'), 'noindex');
  assert.equal(technicalHostRedirect(req('https://about-me-page-cr2.pages.dev/', 'HEAD'), ORIGIN).status, 301);
  assert.equal(technicalHostRedirect(req('https://about-me-page-cr2.pages.dev/admin/api/save', 'POST'), ORIGIN), null);
  for (const host of ['abc123.about-me-page-cr2.pages.dev', 'cc-branch.about-me-page-cr2.pages.dev', 's.morgunov.tech', 'localhost:8788']) {
    assert.equal(technicalHostRedirect(req(`https://${host}/notes`), ORIGIN), null, host);
  }
  assert.match(read('functions/_middleware.js'), /technicalHostRedirect\(context\.request, ORIGIN\)/);
});

test('a note keeps the author’s name in <title> while the whole fits in 70 characters', () => {
  assert.equal(TITLE_MAX, 70);
  assert.equal(withName('YubiKey', 'ru'), 'YubiKey — Семён Моргунов');
  assert.equal(withName('Hi', 'en'), 'Hi — Semyon Morgunov');
  const long = 'Airalo: how the Singapore incubator Antler helped create the largest eSIM marketplace';
  assert.equal(withName(long, 'en'), long);
  const edge = 'x'.repeat(TITLE_MAX - ' — Семён Моргунов'.length);
  assert.equal(withName(edge, 'ru').length, TITLE_MAX, 'exactly 70 keeps the name');
  assert.equal(withName(edge + 'x', 'ru'), edge + 'x');
  assert.match(read('functions/_lib/render-article.js'), /title: withName\(pick\(meta\.title, lang\) \|\| pick\(doc\.title, lang\) \|\| '', lang\)/);
});
