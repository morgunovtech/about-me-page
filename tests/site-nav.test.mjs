// v3.0.0 — one site menu on every page. The bar holds the site's pages (About,
// Publications, Privacy and the «Work with me» group: Consulting, Partnerships &
// media); a page's own sections moved to the on-page line under its hero. The
// footer has one link of its own, to /thanks. /uses is hidden with /about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { siteNav, notesIndexHtml, articleShell } from '../functions/_lib/article-template.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const MENU = {
  ru: [['/', 'Обо мне'], ['/notes', 'Публикации'], ['/privacy', 'Приватность'], ['/consulting', 'Консалтинг'], ['/collaborate', 'Партнёрства и медиа'], ['/uses', 'Стек']],
  en: [['/en/', 'About'], ['/en/notes', 'Publications'], ['/en/privacy', 'Privacy'], ['/en/consulting', 'Consulting'], ['/en/collaborate', 'Partnerships &amp; media'], ['/en/uses', 'Uses']],
};
const PAGES = [
  ['index.html', 'ru', '/'], ['en/index.html', 'en', '/en/'],
  ['consulting.html', 'ru', '/consulting'], ['en/consulting.html', 'en', '/en/consulting'],
  ['collaborate.html', 'ru', '/collaborate'], ['en/collaborate.html', 'en', '/en/collaborate'],
  ['privacy.html', 'ru', '/privacy'], ['en/privacy.html', 'en', '/en/privacy'],
  ['thanks.html', 'ru', null], ['en/thanks.html', 'en', null],
  ['uses.html', 'ru', '/uses'], ['en/uses.html', 'en', '/en/uses'],
];
const bar = (html) => /<div class="v4-bar-mid" id="site-nav">([\s\S]*?)\n        <\/div>\n      <\/nav>/.exec(html)[1];

test('every page has the same site menu, in order, with the current page marked once', () => {
  const shells = [['notes shell', 'ru', '/notes', notesIndexHtml('ru', '', '{}', 'abc', { intro: 'x' })],
    ['notes shell', 'en', '/en/notes', notesIndexHtml('en', '', '{}', 'abc', { intro: 'x' })]];
  for (const [f, lang, current, html] of [...PAGES.map(([f, l, c]) => [f, l, c, read(f)]), ...shells]) {
    const nav = bar(html);
    const links = [...nav.matchAll(/<a (?:class="v4-menu-item" )?href="([^"]+)"( aria-current="page")?>([^<]+)<\/a>/g)];
    assert.deepEqual(links.map((m) => [m[1], m[3]]), MENU[lang], `${f}: the six links`);
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

const onpage = (html) => /<\/section>\s*<nav class="v4-onpage" aria-label="(На этой странице|On this page)">([\s\S]*?)<\/nav>/.exec(html);

test('a page\'s sections are in the on-page line under its hero: links only, in the page\'s order, each to a real section', () => {
  // The homepage has none since v4.2.0: a page of a screen and a half needs no table of
  // contents (owner, 2026-11-26). Its section ids stay — old links to /#contact keep working.
  for (const f of ['index.html', 'en/index.html']) {
    assert.doesNotMatch(read(f), /v4-onpage/, f);
    for (const id of ['about', 'career', 'projects', 'notes', 'contact']) assert.match(read(f), new RegExp(`<section id="${id}" class="v4-section"`), `${f} #${id}`);
  }
  for (const [f] of PAGES.filter(([p]) => !/index\.html$/.test(p))) {
    const html = read(f);
    const line = onpage(html);
    assert.ok(line, `${f}: the line follows the hero`);
    const ids = [...line[2].matchAll(/href="#([a-z]+)"/g)].map((m) => m[1]);
    for (const id of ids) assert.match(html, new RegExp(`<section id="${id}" class="v4-section"`), `${f} #${id}`);
    // The line reads in the order the page does.
    const sections = [...html.matchAll(/<section id="([a-z]+)" class="v4-section"/g)].map((m) => m[1]);
    assert.deepEqual(ids, sections.filter((id) => ids.includes(id)), `${f}: the page's order`);
    // The links are set apart by space alone: a «·» between them (it was a pseudo-element)
    // started the second row whenever the line wrapped on a phone.
    assert.equal(line[2].replace(/<a href="#[a-z]+"[^>]*>[^<]+<\/a>/g, '').trim(), '', `${f}: nothing in the line but its links`);
  }
  const css = read('ds/v1/components.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /\.v4-onpage[^{},]*::?(before|after)/, 'no separator drawn between the links');
  // The line wraps like text and splits evenly (two links and two, not three and a lone last
  // one): the links are its words — never broken inside, set apart by a margin and the space
  // between two words. Not boxes: a box kept that space at the start of a balanced second row.
  assert.match(css, /\.v4-onpage \{[^}]*\btext-wrap: balance;/);
  assert.match(css, /\.v4-onpage a \{[^}]*\bwhite-space: nowrap;[^}]*\bmargin-right: 20px;/);
  assert.doesNotMatch(css, /\.v4-onpage(?: a)? \{[^}]*\bdisplay:/);
  // The smooth-scroll handler covers the line.
  assert.match(read('script.js'), /\.v4-onpage a\[href\^="#"\]/);
});

test('the on-page lines of /consulting and /collaborate name what a section holds', () => {
  const links = (f) => [...onpage(read(f))[2].matchAll(/<a href="(#[a-z]+)">([^<]+)<\/a>/g)].map((m) => [m[1], m[2]]);
  // /consulting: «Как работаю / Чего не делаю» is a section a client looks for — it is in the line.
  assert.deepEqual(links('consulting.html'), [['#consulting', 'Форматы и цены'], ['#strategy', 'Стратегия'], ['#work', 'Как работаю'], ['#contact', 'Связаться']]);
  assert.deepEqual(links('en/consulting.html'), [['#consulting', 'Formats and pricing'], ['#strategy', 'Strategy'], ['#work', 'How I work'], ['#contact', 'Contact']]);
  // /collaborate: its last block is «Нужен консалтинг?» with a button to /consulting, so the
  // link to it says «Консалтинг» — «Связаться» promised a way to write that is not there.
  assert.deepEqual(links('collaborate.html'), [['#partnerships', 'Партнёрства и медиа'], ['#contact', 'Консалтинг']]);
  assert.deepEqual(links('en/collaborate.html'), [['#partnerships', 'Partnerships &amp; Media'], ['#contact', 'Consulting']]);
  for (const f of ['collaborate.html', 'en/collaborate.html']) {
    const contact = read(f).split('<section id="contact"')[1].split('</section>')[0];
    assert.match(contact, /<a class="v4-btn v4-btn-primary" href="(\/en)?\/consulting">/, f);
  }
});

test('every page has one <main>, closed before the footer', () => {
  // /thanks went out without </main>: the parser closed it only with the shell, so the footer
  // sat inside <main> and was not the page's footer to a screen reader.
  const pages = [...PAGES.map(([f]) => [f, read(f)]), ['404.html', read('404.html')], ['notes shell', notesIndexHtml('ru', '', '{}', 'abc', { intro: 'x' })], ['note shell', articleShell('en')]];
  for (const [f, html] of pages) {
    assert.equal((html.match(/<main[\s>]/g) || []).length, 1, `${f}: one <main>`);
    assert.equal((html.match(/<\/main>/g) || []).length, 1, `${f}: one </main>`);
    const [bar, open, close, foot] = ['</header>', '<main id="main">', '</main>', '<footer class="v4-foot">'].map((s) => html.indexOf(s));
    assert.ok(bar > 0 && bar < open && open < close && close < foot, `${f}: the bar, <main>…</main>, then the footer`);
    // The skip link leads to it.
    assert.match(html, /<a href="#main" class="skip-link"/, f);
  }
});

test('the 404 page carries the site menu like every page — both languages in one file, no page marked — one button and the footer\'s link', () => {
  const html = read('404.html');
  const nav = bar(html);
  // One file for both languages: the markup is Russian, and script.js swaps in the English
  // label (textContent) and address of every element that carries them.
  const links = [...nav.matchAll(/<a (?:class="v4-menu-item" )?href="([^"]+)" data-i18n-href-en="([^"]+)" data-i18n-ru="([^"]+)" data-i18n-en="([^"]+)">([^<]+)<\/a>/g)];
  assert.deepEqual(links.map((m) => [m[1], m[5]]), MENU.ru, 'the six links of every Russian page');
  assert.deepEqual(links.map((m) => [m[2], m[4]]), MENU.en, 'and their English twins');
  assert.equal((nav.match(/<a /g) || []).length, MENU.ru.length);
  assert.doesNotMatch(nav, /aria-current|is-current/, 'a missing page is none of the menu\'s pages');
  assert.doesNotMatch(nav, /href="#/);
  // script.js sets textContent: a label that shared its element with the chevron would take the
  // chevron with it, so each toggle keeps its label in a span of its own.
  assert.match(html, /<button class="v4-bar-btn v4-nav-toggle" type="button" aria-controls="site-nav"><span data-i18n-ru="Меню" data-i18n-en="Menu">Меню<\/span><svg class="v4-chevron"/);
  assert.match(nav, /<button class="v4-nav-group-btn" type="button" aria-controls="nav-work"><span data-i18n-ru="Сотрудничество" data-i18n-en="Work with me">Сотрудничество<\/span><svg class="v4-chevron"/);
  assert.match(nav, /<span class="v4-nav-group-cap" aria-hidden="true" data-i18n-ru="Сотрудничество" data-i18n-en="Work with me">Сотрудничество<\/span>/);
  assert.match(html, /<nav class="v4-nav v4-dropdown" aria-label="Основная навигация" data-i18n-aria-en="Main navigation">/);
  // The same holds for everything the script rewrites: it is text only, and the text in the
  // markup is its Russian label.
  let swapped = 0;
  for (const [, , attrs, inner] of html.matchAll(/<(\w+)([^>]*\sdata-i18n-en="[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g)) {
    swapped++;
    assert.doesNotMatch(inner, /</, `an element with data-i18n-en holds text only: ${inner.slice(0, 60)}`);
    // (The text in the markup is typeset — scripts/typo-static.mjs — the label is plain.)
    assert.equal(/\sdata-i18n-ru="([^"]*)"/.exec(attrs)[1], inner.replace(/&nbsp;/g, ' '), 'the visible text is the Russian label');
  }
  assert.ok(swapped >= 20, `${swapped} labels`);
  // The hero: what happened and ONE button. «Консалтинг» and «Telegram» were buttons here —
  // the menu above leads to every page, and a missing page is no reason to write.
  const hero = /<section class="v4-hero v4-hero--simple"[\s\S]*?<\/section>/.exec(html)[0];
  assert.deepEqual(hero.match(/<a [^>]*>[^<]*<\/a>/g), ['<a class="v4-btn v4-btn-primary" href="/" data-i18n-href-en="/en/" data-i18n-ru="На главную" data-i18n-en="Go to homepage">На&nbsp;главную</a>']);
  assert.doesNotMatch(html, /t\.me\//);
  assert.ok(hero.includes('<p class="v4-tagline" data-i18n-ru="Такой страницы нет, или она была перемещена." data-i18n-en="This page doesn\'t exist or has been moved.">Такой страницы нет, или она была перемещена.</p>'));
  // The footer's own link, as on every page: after the build mark, in both languages.
  const foot = /<footer class="v4-foot">[\s\S]*?<\/footer>/.exec(html)[0];
  assert.match(foot, /<a class="v4-build" [^>]*>v\d+\.\d+\.\d+<\/a>&nbsp;· <a href="\/thanks" data-i18n-href-en="\/en\/thanks" data-i18n-ru="Сказать спасибо или сообщить об ошибке" data-i18n-en="Say thanks or report a bug">Сказать спасибо или сообщить об&nbsp;ошибке<\/a><\/span>/);
  // The language is switched by attributes handled in script.js — no inline script in <body>.
  assert.doesNotMatch(html.slice(html.indexOf('<body')), /<script(?![^>]*\ssrc=)/);
});

test('/thanks: the dogs first, then support, the free ways and where to report a mistake', () => {
  for (const [f, lang] of [['thanks.html', 'ru'], ['en/thanks.html', 'en']]) {
    const html = read(f);
    const ids = [...html.matchAll(/<section id="([a-z]+)" class="v4-section">/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['dogs', 'support', 'free', 'bug'], f);
    assert.match(html, /href="https:\/\/www\.instagram\.com\/mehr_shelter\/"/, `${f}: Mehr, payment details on its own page`);
    assert.doesNotMatch(html, /Sobaken|raschet7\/151/, `${f}: only Mehr, the shelter the owner vouches for`);
    assert.match(html, /href="https:\/\/web\.tribute\.tg\/d\/fqH"/, `${f}: Tribute — a direct donation, next to GitHub Sponsors`);
    assert.match(html, /href="https:\/\/github\.com\/sponsors\/morgunovtech"/, f);
    assert.match(html, /href="https:\/\/t\.me\/boost\/raschet7"/, f);
    // The referral links go to /uses when it comes back (owner): not here.
    assert.doesNotMatch(html.replace(/<header class="v4-bar"[\s\S]*?<\/header>/, ''), /href="(\/en)?\/uses"/, `${f}: the site menu aside`);
    // Mehr: straight to the payment details, not through the channel.
    assert.doesNotMatch(html, /t\.me\/raschet7\/152/, f);
    // «Бесплатно»: one action a line, the channel first.
    const free = /<section id="free"[\s\S]*?<\/section>/.exec(html)[0];
    const items = [...free.matchAll(/<li>/g)].length;
    assert.equal(items, 6, `${f}: six free ways`);
    assert.match(free, /<ul class="v4-list v4-list--spaced"><li>(Подписаться на&nbsp;|Subscribe to my )<a href="https:\/\/t\.me\/raschet7"/, f);
    assert.doesNotMatch(html, /\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b/, `${f}: no card numbers`);
    assert.equal((html.match(/class="v4-btn/g) || []).length, 1, `${f}: one button — Telegram, for mistakes`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://s\\.morgunov\\.tech${lang === 'en' ? '/en' : ''}/thanks" />`), f);
    assert.match(html, /class="v4-menu-item v4-lang-link"[^>]*href="\/thanks"/, f);
  }
  assert.match(read('functions/_lib/render-notes.js'), /\{ loc: '\/thanks', ru: '\/thanks', en: '\/en\/thanks'/);
  assert.match(read('llms.txt'), /\[Say thanks\]\(https:\/\/s\.morgunov\.tech\/en\/thanks\)/);
  for (const f of ['scripts/check-sync.py', 'scripts/check-critical.py', 'scripts/version-stamp.py']) assert.match(read(f), /thanks\.html/, f);
});

test('/uses («Стек и принципы», v4.0.0) is public: in the sitemap and llms.txt, with «Как устроен этот сайт»; every note ends with the thanks line', () => {
  const sm = read('functions/_lib/render-notes.js');
  assert.match(sm, /loc: '\/uses'/);
  assert.match(read('llms.txt'), /s\.morgunov\.tech\/uses/);
  for (const f of ['uses.html', 'en/uses.html']) {
    const html = read(f);
    assert.match(html, /<section id="principles" class="v4-section">[\s\S]*?data-cms-list="usesPrinciples"/, f);
    assert.match(html, /<nav class="v4-onpage"[^>]*>[\s\S]*?href="#principles"/, f);
  }
  // One quiet sentence with a link to /thanks, between the text and «← Все публикации». It is
  // the shell's own text, so the typography pass runs where the shell is built: the dash stays
  // with the word before it (a no-break space), in the editor's preview too — nothing here is
  // the doc's to save.
  const ru = articleShell('ru');
  assert.ok(ru.includes('<p class="v4-article-thanks">Если заметка пригодилась\u00a0— <a href="/thanks">вот как можно сказать спасибо</a>.</p>'));
  assert.ok(articleShell('en').includes('<p class="v4-article-thanks">If this note was useful, <a href="/en/thanks">here’s how you can say thanks</a>.</p>'));
  const at = (s) => ru.indexOf(s);
  assert.ok(at('class="v4-article-body"') < at('class="v4-article-thanks"') && at('class="v4-article-thanks"') < at('class="v4-article-foot"'));
});

test('a note\'s language menu leads to its twin by a site-relative address; canonical and hreflang stay absolute', () => {
  for (const lang of ['ru', 'en']) {
    const shell = articleShell(lang);
    // A site-relative address, like every other link of the bar: an absolute one (the menu was
    // filled from `_urlRu` / `_urlEn`) takes the reader of a preview deployment to production.
    assert.match(shell, /<a class="v4-menu-item v4-lang-link" role="menuitemradio" aria-checked="(true|false)" data-cms-href="_pathRu" href="\/notes" hreflang="ru" lang="ru">Русский<\/a>/, lang);
    assert.match(shell, /<a class="v4-menu-item v4-lang-link" role="menuitemradio" aria-checked="(true|false)" data-cms-href="_pathEn" data-cms-omit="_noEn" href="\/en\/notes" hreflang="en" lang="en">English<\/a>/, lang);
    // What a crawler reads is absolute, and it is all in <head>.
    for (const tag of [
      '<link rel="canonical" data-cms-href="_url" href="" />',
      '<link rel="alternate" hreflang="ru" data-cms-href="_urlRu" href="" />',
      '<link rel="alternate" hreflang="en" data-cms-href="_urlEn" data-cms-omit="_noEn" href="" />',
      '<link rel="alternate" hreflang="x-default" data-cms-href="_urlRu" href="" />',
    ]) assert.ok(shell.slice(0, shell.indexOf('</head>')).includes(tag), `${lang}: ${tag}`);
    assert.doesNotMatch(shell.slice(shell.indexOf('<body')), /data-cms-href="_url/, `${lang}: no absolute address in a link of the page`);
  }
  const ra = read('functions/_lib/render-article.js');
  assert.match(ra, /doc\._pathRu = '\/notes\/' \+ slug;/);
  assert.match(ra, /doc\._pathEn = '\/en\/notes\/' \+ slug;/);
  assert.match(ra, /doc\._urlRu = ORIGIN \+ '\/notes\/' \+ slug;/);
  assert.match(ra, /doc\._urlEn = ORIGIN \+ '\/en\/notes\/' \+ slug;/);
});
