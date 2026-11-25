// v3.0.0 — one site menu on every page. The bar holds the site's pages (About,
// Publications, Privacy and the «Work with me» group: Consulting, Partnerships &
// media); a page's own sections moved to the on-page line under its hero. The
// footer has one link of its own, to /thanks. /uses is hidden with /about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { siteNav, notesIndexHtml } from '../functions/_lib/article-template.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const MENU = {
  ru: [['/', 'Обо мне'], ['/notes', 'Публикации'], ['/privacy', 'Приватность'], ['/consulting', 'Консалтинг'], ['/collaborate', 'Партнёрства и медиа']],
  en: [['/en/', 'About'], ['/en/notes', 'Publications'], ['/en/privacy', 'Privacy'], ['/en/consulting', 'Consulting'], ['/en/collaborate', 'Partnerships &amp; media']],
};
const PAGES = [
  ['index.html', 'ru', '/'], ['en/index.html', 'en', '/en/'],
  ['consulting.html', 'ru', '/consulting'], ['en/consulting.html', 'en', '/en/consulting'],
  ['collaborate.html', 'ru', '/collaborate'], ['en/collaborate.html', 'en', '/en/collaborate'],
  ['privacy.html', 'ru', '/privacy'], ['en/privacy.html', 'en', '/en/privacy'],
  ['thanks.html', 'ru', null], ['en/thanks.html', 'en', null],
  ['uses.html', 'ru', null], ['en/uses.html', 'en', null],
  ['about.html', 'ru', null], ['en/about.html', 'en', null],
];
const bar = (html) => /<div class="v4-bar-mid" id="site-nav">([\s\S]*?)\n        <\/div>\n      <\/nav>/.exec(html)[1];

test('every page has the same site menu, in order, with the current page marked once', () => {
  const shells = [['notes shell', 'ru', '/notes', notesIndexHtml('ru', '', '{}', 'abc', { intro: 'x' })],
    ['notes shell', 'en', '/en/notes', notesIndexHtml('en', '', '{}', 'abc', { intro: 'x' })]];
  for (const [f, lang, current, html] of [...PAGES.map(([f, l, c]) => [f, l, c, read(f)]), ...shells]) {
    const nav = bar(html);
    const links = [...nav.matchAll(/<a (?:class="v4-menu-item" )?href="([^"]+)"( aria-current="page")?>([^<]+)<\/a>/g)];
    assert.deepEqual(links.map((m) => [m[1], m[3]]), MENU[lang], `${f}: the five links`);
    const marked = links.filter((m) => m[2]).map((m) => m[1]);
    assert.deepEqual(marked, current ? [current] : [], `${f}: aria-current`);
    // The group reads as current when one of its pages is.
    const inGroup = current && /consulting|collaborate/.test(current);
    assert.equal(/v4-nav-group is-current/.test(nav), Boolean(inGroup), `${f}: the group`);
    assert.match(nav, /<button class="v4-nav-group-btn" type="button" aria-controls="nav-work">(Сотрудничество|Work with me)<svg/, f);
    assert.doesNotMatch(nav, /href="#/, `${f}: no section anchors in the bar`);
  }
  // The article shell's helper is the same menu.
  assert.match(siteNav('ru', 'notes'), /<a href="\/notes" aria-current="page">Публикации<\/a>/);
});

test('a page\'s sections are in the on-page line under its hero, each link to a real section', () => {
  for (const [f] of PAGES) {
    const html = read(f);
    const line = /<\/section>\s*<nav class="v4-onpage" aria-label="(На этой странице|On this page)">([\s\S]*?)<\/nav>/.exec(html);
    assert.ok(line, `${f}: the line follows the hero`);
    for (const [, id] of line[2].matchAll(/href="#([a-z]+)"/g)) assert.match(html, new RegExp(`<section id="${id}" class="v4-section"`), `${f} #${id}`);
  }
  // Home keeps the CMS hooks: the line mirrors the section titles.
  assert.match(read('index.html'), /<nav class="v4-onpage"[^>]*>\s*<a href="#about" data-cms-text="sections\.about\.title">/);
  // The smooth-scroll handler covers the line.
  assert.match(read('script.js'), /\.v4-onpage a\[href\^="#"\]/);
});

test('/thanks: the dogs first, then support, the free ways and where to report a mistake', () => {
  for (const [f, lang] of [['thanks.html', 'ru'], ['en/thanks.html', 'en']]) {
    const html = read(f);
    const ids = [...html.matchAll(/<section id="([a-z]+)" class="v4-section">/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['dogs', 'support', 'free', 'bug'], f);
    assert.match(html, /href="https:\/\/www\.instagram\.com\/mehr_shelter\/"/, `${f}: Mehr, payment details on its own page`);
    assert.match(html, /href="https:\/\/t\.me\/raschet7\/151"/, `${f}: Sobaken`);
    assert.match(html, /href="https:\/\/github\.com\/sponsors\/morgunovtech"/, f);
    assert.match(html, /href="https:\/\/web\.tribute\.tg\/d\/fqH"/, f);
    assert.match(html, /href="https:\/\/t\.me\/boost\/raschet7"/, f);
    assert.match(html, new RegExp(`href="${lang === 'en' ? '/en' : ''}/uses"`), `${f}: the referral links are on the uses page`);
    assert.doesNotMatch(html, /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, `${f}: no card numbers`);
    assert.equal((html.match(/class="v4-btn/g) || []).length, 1, `${f}: one button — Telegram, for mistakes`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://s\\.morgunov\\.tech${lang === 'en' ? '/en' : ''}/thanks" />`), f);
    assert.match(html, /class="v4-menu-item v4-lang-link"[^>]*href="\/thanks"/, f);
  }
  assert.match(read('functions/_lib/render-notes.js'), /\{ loc: '\/thanks', ru: '\/thanks', en: '\/en\/thanks'/);
  assert.match(read('llms.txt'), /\[Say thanks\]\(https:\/\/s\.morgunov\.tech\/en\/thanks\)/);
  for (const f of ['scripts/check-sync.py', 'scripts/check-critical.py', 'scripts/version-stamp.py']) assert.match(read(f), /thanks\.html/, f);
});

test('/uses is hidden with /about: out of the sitemap and llms.txt; every note ends with the thanks line', () => {
  const sm = read('functions/_lib/render-notes.js');
  assert.doesNotMatch(sm, /loc: '\/(en\/)?uses'/);
  assert.doesNotMatch(read('llms.txt'), /## Uses|s\.morgunov\.tech\/(en\/)?uses/);
  const shell = read('functions/_lib/article-template.js');
  assert.match(shell, /<p class="v4-article-thanks">\$\{renderInline\(t\.thanksLine\.replace\('\{href\}', p\(l, '\/thanks'\)\)\)\}<\/p>/);
  assert.match(shell, /thanksLine: 'Если заметка пригодилась — \[вот как можно сказать спасибо\]\(\{href\}\)\.'/);
});
