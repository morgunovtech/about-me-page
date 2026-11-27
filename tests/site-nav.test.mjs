// v3.0.0 — one site menu on every page. The bar holds the site's pages (About,
// Publications, Privacy and the «Work with me» group: Consulting, Partnerships &
// media); a page's own sections moved to the on-page line under its hero. The
// footer has one link of its own, to /thanks. /uses is hidden with /about.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

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
  // v4.4.0: reached from the homepage's product card and from links, not from the menu.
  ['social-tracker.html', 'ru', null], ['en/social-tracker.html', 'en', null],
  ['tofsdevops.html', 'ru', null], ['en/tofsdevops.html', 'en', null],
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
  // /collaborate has none since v4.8.0 either: a short page read top to bottom (owner).
  for (const f of ['collaborate.html', 'en/collaborate.html']) assert.doesNotMatch(read(f), /v4-onpage/, f);
  for (const [f] of PAGES.filter(([p]) => !/(index|collaborate)\.html$/.test(p))) {
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
  // Strategic consulting is a card among the formats since v4.6.0, not a section of its own.
  assert.deepEqual(links('consulting.html'), [['#consulting', 'Форматы и цены'], ['#work', 'Как работаю'], ['#contact', 'Связаться']]);
  assert.deepEqual(links('en/consulting.html'), [['#consulting', 'Formats and pricing'], ['#work', 'How I work'], ['#contact', 'Contact']]);
  // /collaborate: its last block is «Нужен консалтинг?» with a button to /consulting, so the
  // link to it says «Консалтинг» — «Связаться» promised a way to write that is not there.
  // v4.6.0: what we can do together («Форматы»), who reads («Аудитория»), consulting.
  // /collaborate has no line since v4.8.0 (the page is short); its way to consulting is last.
  for (const f of ['collaborate.html', 'en/collaborate.html']) {
    const consulting = read(f).split('<section id="consulting"')[1].split('</section>')[0];
    assert.match(consulting, /<div class="v4-more"><a href="(\/en)?\/consulting">/, f);
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

test('/social-tracker (v4.4.0): the bot\'s page — install and code first, then what it does, the data, the cost, the steps, the honest part, the cloud version', () => {
  const REPO = 'https://github.com/morgunovtech/social-tracker-bot';
  const EXT = 'target="_blank" rel="noopener noreferrer"';
  for (const [f, lang] of [['social-tracker.html', 'ru'], ['en/social-tracker.html', 'en']]) {
    const html = read(f);
    const main = /<main id="main">[\s\S]*?<\/main>/.exec(html)[0];
    const url = `https://s.morgunov.tech${lang === 'en' ? '/en' : ''}/social-tracker`;
    const setup = `${REPO}/blob/main/docs/SETUP${lang === 'en' ? '.en' : ''}.md`;
    const ids = [...html.matchAll(/<section id="([a-z]+)" class="v4-section">/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['what', 'data', 'cost', 'install', 'honest', 'cloud'], f);
    // The hero: the name, two buttons — install (primary, first), the code.
    const hero = /<section class="v4-hero v4-hero--simple"[\s\S]*?<\/section>/.exec(html)[0];
    assert.match(hero, /<h1 class="v4-h1" id="hero-title">Social Tracker<\/h1>/, f);
    const buttons = [...hero.matchAll(/<a class="(v4-btn[^"]*)" href="([^"]+)" ([^>]+)>/g)].map((m) => [m[1], m[2], m[3]]);
    assert.deepEqual(buttons, [['v4-btn v4-btn-primary', setup, EXT], ['v4-btn', REPO, EXT]], f);
    // Step 2: the Railway template with the referral code, said so in the line under it, with
    // the address without the code.
    assert.ok(main.includes(`href="https://railway.com/deploy/social-tracker-bot?referralCode=7hTMqE" ${EXT}`), f);
    const note = /<p class="v4-terms">([\s\S]*?)<\/p>/.exec(main)[1];
    assert.match(note, lang === 'en' ? /referral code/ : /реферальным кодом/, f);
    assert.ok(note.includes(`<a href="https://railway.com/deploy/social-tracker-bot" ${EXT}>railway.com/deploy/social-tracker-bot</a>`), f);
    // The Claude skill: the guide's own section.
    assert.ok(main.includes(`href="${setup}#${lang === 'en' ? 'help-from-claude' : 'помощь-claude'}"`), f);
    // The cloud version: one button, the site's Telegram contact (its label is tests/stage3's).
    const cloud = /<section id="cloud"[\s\S]*?<\/section>/.exec(html)[0];
    assert.deepEqual(cloud.match(/class="v4-btn[^"]*"/g), ['class="v4-btn v4-btn-primary"'], f);
    assert.match(cloud, /href="https:\/\/t\.me\/s_mrgnv"/, f);
    // No images in the page (the share card only feeds og:image); no word about cookies in it.
    assert.doesNotMatch(main, /<img|<picture|<svg/, f);
    assert.doesNotMatch(main, /cookie/i, f);
    // Addresses and the share card.
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}" />`), f);
    assert.match(html, /<link rel="alternate" hreflang="ru" href="https:\/\/s\.morgunov\.tech\/social-tracker" \/>/, f);
    assert.match(html, /<link rel="alternate" hreflang="en" href="https:\/\/s\.morgunov\.tech\/en\/social-tracker" \/>/, f);
    assert.match(html, /<link rel="alternate" hreflang="x-default" href="https:\/\/s\.morgunov\.tech\/social-tracker" \/>/, f);
    assert.match(html, new RegExp(`<meta property="og:url" content="${url}" />`), f);
    const card = `https://s.morgunov.tech/images/og-card-social-tracker-${lang}.png`;
    for (const tag of ['property="og:image"', 'name="twitter:image"']) assert.ok(html.includes(`<meta ${tag} content="${card}" />`), `${f}: ${tag}`);
    for (const tag of ['property="og:title"', 'property="og:description"', 'property="og:image:alt"', 'name="twitter:title"', 'name="twitter:description"', 'name="twitter:image:alt"', 'name="twitter:card"']) {
      assert.match(html, new RegExp(`<meta ${tag} content="[^"]+" />`), `${f}: ${tag}`);
    }
    // The card is a 1200 × 630 PNG, like every share card of the site.
    const png = readFileSync(new URL(`../images/og-card-social-tracker-${lang}.png`, import.meta.url));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', f);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], f);
    // The language menu leads to the twin; the page's JSON-LD: the page, the way back, the app.
    assert.match(html, /class="v4-menu-item v4-lang-link"[^>]*href="\/social-tracker" hreflang="ru"/, f);
    assert.match(html, /class="v4-menu-item v4-lang-link"[^>]*href="\/en\/social-tracker" hreflang="en"/, f);
    const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1])['@graph'];
    const app = graph.find((n) => n['@type'] === 'SoftwareApplication');
    assert.equal(app.name, 'Social Tracker', f);
    assert.equal(app.url, url, f);
    assert.equal(app.operatingSystem, 'Telegram', f);
    assert.equal(app.applicationCategory, 'SocialNetworkingApplication', f);
    assert.equal(app.isAccessibleForFree, true, f);
    assert.deepEqual(app.offers, { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, f);
    assert.equal(app.license, 'https://opensource.org/licenses/MIT', f);
    assert.equal(app.sameAs, REPO, f);
    assert.equal(app.installUrl, setup, f);
    const page = graph.find((n) => n['@type'] === 'WebPage');
    assert.equal(page.url, url, f);
    assert.equal(page.inLanguage, lang, f);
    assert.deepEqual(page.mainEntity, { '@id': app['@id'] }, f);
    assert.ok(graph.some((n) => n['@type'] === 'BreadcrumbList'), f);
  }
  assert.match(read('functions/_lib/render-notes.js'), /\{ loc: '\/social-tracker', ru: '\/social-tracker', en: '\/en\/social-tracker'/);
  assert.match(read('functions/_lib/render-notes.js'), /\{ loc: '\/en\/social-tracker', ru: '\/social-tracker', en: '\/en\/social-tracker'/);
  const llms = read('llms.txt');
  assert.match(llms, /\[Social Tracker Bot\]\(https:\/\/s\.morgunov\.tech\/en\/social-tracker\)/);
  assert.match(llms, /^- Social Tracker, the Telegram bot \(RU\): https:\/\/s\.morgunov\.tech\/social-tracker$/m);
  assert.match(llms, /^- Social Tracker, the Telegram bot \(EN\): https:\/\/s\.morgunov\.tech\/en\/social-tracker$/m);
  for (const f of ['scripts/check-sync.py', 'scripts/check-critical.py', 'scripts/version-stamp.py', 'scripts/typo-static.mjs']) assert.match(read(f), /social-tracker/, f);
});

test('/tofsdevops (v4.5.0): the bot\'s page, built like /social-tracker — two ways to install, the data table, a question last', () => {
  const REPO = 'https://github.com/morgunovtech/Tofs_DevOps_bot';
  const EXT = 'target="_blank" rel="noopener noreferrer"';
  const NE = '<span class="v4-out" aria-hidden="true">&#8288;<span class="v4-ne">→</span></span>';
  for (const [f, lang] of [['tofsdevops.html', 'ru'], ['en/tofsdevops.html', 'en']]) {
    const html = read(f);
    const main = /<main id="main">[\s\S]*?<\/main>/.exec(html)[0];
    const url = `https://s.morgunov.tech${lang === 'en' ? '/en' : ''}/tofsdevops`;
    // The step-by-step guide is Russian only: the English page installs from the README.
    const setup = lang === 'en' ? `${REPO}/blob/main/README.md#install--two-ways` : `${REPO}/blob/main/docs/SETUP.md`;
    const ids = [...html.matchAll(/<section id="([a-z]+)" class="v4-section">/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['what', 'data', 'cost', 'install', 'honest', 'questions'], f);
    const hero = /<section class="v4-hero v4-hero--simple"[\s\S]*?<\/section>/.exec(html)[0];
    assert.match(hero, /<h1 class="v4-h1" id="hero-title">TofsDevOps<\/h1>/, f);
    const buttons = [...hero.matchAll(/<a class="(v4-btn[^"]*)" href="([^"]+)" ([^>]+)>/g)].map((m) => [m[1], m[2], m[3]]);
    assert.deepEqual(buttons, [['v4-btn v4-btn-primary', setup, EXT], ['v4-btn', REPO, EXT]], f);
    // «Что он делает»: eight items, each opening with its point in bold.
    const what = /<section id="what"[\s\S]*?<\/section>/.exec(html)[0];
    assert.equal((what.match(/<li><strong>/g) || []).length, 8, f);
    // The site's rule: no emoji — the bot's red and orange marks are said in words.
    assert.doesNotMatch(main, /\p{Extended_Pictographic}/u, f);
    // «Ваши данные» ends with the full table of what leaves the server, a link that leaves the site.
    const data = /<section id="data"[\s\S]*?<\/section>/.exec(html)[0];
    const table = lang === 'en' ? `${REPO}/blob/main/README.md#what-leaves-your-server` : `${REPO}/blob/main/README.ru.md#что-уходит-с-вашего-сервера`;
    assert.ok(data.includes(`<div class="v4-more"><a href="${table}" ${EXT}><span>`) && data.includes(`</span>${NE}<span class="sr-only">`), f);
    // Two ways: Railway in three steps (the referral link said so, the address without the code
    // beside it) and the one command for your own server; the guide last.
    const install = /<section id="install"[\s\S]*?<\/section>/.exec(html)[0];
    assert.equal((install.match(/<h3 class="v4-h3">/g) || []).length, 2, f);
    assert.equal((install.match(/<p><strong>(Шаг|Step) \d\.<\/strong>/g) || []).length, 3, f);
    assert.ok(install.includes(`href="https://railway.com/deploy/tofsdevops?referralCode=7hTMqE" ${EXT}`), f);
    const note = /<p class="v4-terms">([\s\S]*?)<\/p>/.exec(install)[1];
    assert.match(note, lang === 'en' ? /referral code/ : /реферальным кодом/, f);
    assert.ok(note.includes(`<a href="https://railway.com/deploy/tofsdevops" ${EXT}>railway.com/deploy/tofsdevops</a>`), f);
    // The command in the site's code idiom; <wbr> lets it wrap on a phone and copies as nothing.
    const cmd = /<p><code>(curl [^<]*(?:<wbr>[^<]*)*)<\/code><\/p>/.exec(install);
    assert.ok(cmd, f);
    assert.equal(cmd[1].replace(/<wbr>/g, ''), 'curl -fsSL https://raw.githubusercontent.com/morgunovtech/Tofs_DevOps_bot/main/scripts/install.sh | sh', f);
    assert.match(install, /<code>TELEGRAM_PROXY<\/code>/, f);
    assert.ok(install.includes(`<div class="v4-more"><a href="${setup}" ${EXT}><span>`), f);
    // The last block: one button, the site's Telegram contact (its label is tests/stage3's).
    const questions = /<section id="questions"[\s\S]*?<\/section>/.exec(html)[0];
    assert.deepEqual(questions.match(/class="v4-btn[^"]*"/g), ['class="v4-btn v4-btn-primary"'], f);
    assert.match(questions, /href="https:\/\/t\.me\/s_mrgnv"/, f);
    assert.doesNotMatch(main, /<img|<picture|<svg/, f);
    // Addresses, the share card, the language menu.
    assert.match(html, new RegExp(`<link rel="canonical" href="${url}" />`), f);
    for (const [hl, path] of [['ru', '/tofsdevops'], ['en', '/en/tofsdevops'], ['x-default', '/tofsdevops']]) {
      assert.ok(html.includes(`<link rel="alternate" hreflang="${hl}" href="https://s.morgunov.tech${path}" />`), `${f}: ${hl}`);
    }
    assert.match(html, new RegExp(`<meta property="og:url" content="${url}" />`), f);
    const card = `https://s.morgunov.tech/images/og-card-tofsdevops-${lang}.png`;
    for (const tag of ['property="og:image"', 'name="twitter:image"']) assert.ok(html.includes(`<meta ${tag} content="${card}" />`), `${f}: ${tag}`);
    const png = readFileSync(new URL(`../images/og-card-tofsdevops-${lang}.png`, import.meta.url));
    assert.equal(png.toString('ascii', 1, 4), 'PNG', f);
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], f);
    assert.match(html, /class="v4-menu-item v4-lang-link"[^>]*href="\/tofsdevops" hreflang="ru"/, f);
    assert.match(html, /class="v4-menu-item v4-lang-link"[^>]*href="\/en\/tofsdevops" hreflang="en"/, f);
    const graph = JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)[1])['@graph'];
    const app = graph.find((n) => n['@type'] === 'SoftwareApplication');
    assert.equal(app.name, 'TofsDevOps', f);
    assert.equal(app.url, url, f);
    assert.equal(app.operatingSystem, 'Telegram', f);
    assert.equal(app.isAccessibleForFree, true, f);
    assert.deepEqual(app.offers, { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, f);
    assert.equal(app.license, 'https://opensource.org/licenses/MIT', f);
    assert.equal(app.sameAs, REPO, f);
    assert.equal(app.installUrl, setup, f);
    assert.deepEqual(graph.find((n) => n['@type'] === 'WebPage').mainEntity, { '@id': app['@id'] }, f);
  }
  const sm = read('functions/_lib/render-notes.js');
  assert.match(sm, /\{ loc: '\/tofsdevops', ru: '\/tofsdevops', en: '\/en\/tofsdevops'/);
  assert.match(sm, /\{ loc: '\/en\/tofsdevops', ru: '\/tofsdevops', en: '\/en\/tofsdevops'/);
  const llms = read('llms.txt');
  assert.match(llms, /\[TofsDevOps\]\(https:\/\/s\.morgunov\.tech\/en\/tofsdevops\)/);
  assert.match(llms, /^- TofsDevOps, the Telegram bot \(RU\): https:\/\/s\.morgunov\.tech\/tofsdevops$/m);
  assert.match(llms, /^- TofsDevOps, the Telegram bot \(EN\): https:\/\/s\.morgunov\.tech\/en\/tofsdevops$/m);
  for (const f of ['scripts/check-sync.py', 'scripts/check-critical.py', 'scripts/version-stamp.py', 'scripts/typo-static.mjs']) assert.match(read(f), /tofsdevops/, f);
});

test('readers in Russia: a static page stays under 14 KB compressed (ISPs cut a Cloudflare response after about 16 KB)', () => {
  // Since June 2025 Russian ISPs stop every file served through Cloudflare after about 16 KB
  // of transferred bytes. gzip -9 stands for what Cloudflare sends (it is brotli or gzip).
  for (const f of ['thanks.html', 'en/thanks.html', 'social-tracker.html', 'en/social-tracker.html', 'tofsdevops.html', 'en/tofsdevops.html']) {
    const size = gzipSync(readFileSync(new URL('../' + f, import.meta.url)), { level: 9 }).length;
    assert.ok(size < 14 * 1024, `${f}: ${size} bytes compressed`);
  }
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
