// v0.31.2 — Telegram is the only contact, /about is hidden, no scroll chrome.
// v1.2.7 — e-mail is back as the second contact (owner's decision 2026-11-24),
// only where he put it: the home «Связаться» block, llms.txt, JSON-LD Person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { notesIndexHtml } from '../functions/_lib/article-template.js';
import { renderers } from '../functions/_lib/render.js';
import { renderJsonLd } from '../functions/_lib/jsonld.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const PAGES = ['index.html', 'en/index.html', 'collaborate.html', 'en/collaborate.html', 'consulting.html', 'en/consulting.html', 'uses.html', 'en/uses.html', 'privacy.html', 'en/privacy.html'];

test('e-mail only where the owner put it: home «Связаться», llms.txt, JSON-LD; Telegram stays first', () => {
  for (const f of ['collaborate.html', 'en/collaborate.html', 'consulting.html', 'en/consulting.html', 'uses.html', 'en/uses.html', 'privacy.html', 'en/privacy.html', '.well-known/security.txt']) {
    assert.doesNotMatch(read(f), /mailto:|s@morgunov\.tech/, f);
  }
  for (const f of ['index.html', 'en/index.html']) {
    // One mailto, in the contact block's button row, after the Telegram button.
    const row = read(f).split('data-cms-list="contact"')[1].split('</section>')[0];
    assert.ok(row.indexOf('href="https://t.me/s_mrgnv"') < row.indexOf('href="mailto:s@morgunov.tech"'), f);
    assert.equal((read(f).match(/mailto:/g) || []).length, 1, f);
  }
  const llms = read('llms.txt');
  assert.ok(llms.indexOf('- Telegram (main): https://t.me/s_mrgnv') < llms.indexOf('- Email: s@morgunov.tech'));
  assert.match(read('.well-known/security.txt'), /^Contact: https:\/\/t\.me\/s_mrgnv$/m);
  for (const lang of ['ru', 'en']) {
    const person = JSON.parse(renderJsonLd(seed.home, lang))['@graph'].find((n) => n['@type'] === 'Person');
    assert.equal(person.email, 's@morgunov.tech');
  }
  // A doc without seo.email (an older KV doc) publishes no email at all.
  const old = JSON.parse(JSON.stringify(seed.home));
  delete old.seo.email;
  assert.doesNotMatch(renderJsonLd(old, 'en'), /"email"/);
});

test('footer (v3.0.0): one link of its own — «сказать спасибо или сообщить об ошибке» → /thanks; no notes/about/uses links', () => {
  const footers = PAGES.map((f) => read(f).match(/<footer class="v4-foot">[\s\S]*?<\/footer>/)[0]);
  footers.push(notesIndexHtml('ru', '', '{}', 'abc1234', { intro: 'x' }).match(/<footer class="v4-foot">[\s\S]*?<\/footer>/)[0]);
  for (const f of footers) {
    assert.doesNotMatch(f, /href="(\/en)?\/(notes|about|uses)"/);
    assert.match(f, /<a href="(\/en)?\/thanks">(сказать спасибо или сообщить об ошибке|say thanks or report a bug)<\/a><\/span>/);
    assert.doesNotMatch(f, /t\.me\/s_mrgnv/, 'mistakes are reported from /thanks');
  }
});

test('v4.0.0: /about is a section of /uses — the pages are gone, the old URLs redirect, every page is indexable', () => {
  for (const f of ['about.html', 'en/about.html']) assert.throws(() => read(f), f);
  for (const f of ['index.html', 'collaborate.html', 'consulting.html', 'privacy.html', 'uses.html', 'en/uses.html', 'thanks.html', 'en/thanks.html']) assert.doesNotMatch(read(f), /name="robots" content="noindex"/, f);
  const mw = read('functions/_middleware.js');
  assert.match(mw, /'\/about': '\/uses#principles'/);
  assert.match(mw, /'\/en\/about': '\/en\/uses#principles'/);
  assert.match(mw, /Response\.redirect\(new URL\(MOVED\[pathname\], request\.url\)\.toString\(\), 301\)/);
  assert.doesNotMatch(mw, /page: 'about'/);
  assert.doesNotMatch(read('llms.txt'), /s\.morgunov\.tech\/(en\/)?about\b/);
  assert.match(read('llms.txt'), /s\.morgunov\.tech\/uses/);
});

test('/consulting: the contact goes to Telegram, one contact button', () => {
  const c = seed.consulting;
  // The angel section with its «Отправить питч →» is gone since v1.2.8.
  assert.equal(c.sections.angel, undefined);
  assert.equal(c.sections.strategy.cta.href, 'https://t.me/s_mrgnv');
  const html = renderers.collabContact(c, 'ru');
  assert.equal((html.match(/class="v4-btn/g) || []).length, 1);
  assert.match(html, /href="https:\/\/t\.me\/s_mrgnv"[^>]*>Написать →</);
});

test('/uses names its referral links and promises no bonus without one', () => {
  const sw = seed.uses.sections.software;
  // Since v1.5.2 three cards carry the owner's referral links again; the intro says which.
  assert.match(sw.intro.ru, /ссылки реферальные/);
  assert.match(sw.intro.en, /referral links/);
  assert.doesNotMatch(sw.intro.ru, /не партнёрские/);
  const referral = /dashlane\.com\/en\/im\/|go\.setapp\.com\/invite\/|airalo\.go\.link\//;
  const named = sw.cards.filter((c) => referral.test(c.cta.href)).map((c) => c.name);
  assert.deepEqual(named, ['Dashlane', 'Setapp', 'Airalo']);
  for (const name of named) assert.ok(sw.intro.ru.includes(name) && sw.intro.en.includes(name), name);
  // A card without a referral link does not promise a bonus.
  for (const c of sw.cards.filter((c) => !named.includes(c.name))) {
    assert.doesNotMatch(c.cta.label.ru, /бесплатно|скидк|месяц/i, c.name);
  }
  assert.ok(!sw.cards.some((c) => c.name === 'Arc Browser'));
});

test('no side column, back-to-top or progress bar left in markup, CSS or JS', () => {
  for (const f of [...PAGES, 'script.js', 'ds/v1/components.css', 'styles.css', 'functions/_lib/article-template.js']) {
    assert.doesNotMatch(read(f), /v4-section-nav|v4-scroll-top|v4-scroll-progress/, f);
  }
  assert.doesNotMatch(read('script.js'), /addEventListener\('scroll'/);
});

// v0.31.4 — the owner's answers to the proofreading questions.

test('home copy: Korzinka ×23, one channel line, a kiosk chain (seed = the saved KV doc)', () => {
  const h = JSON.stringify(seed.home);
  assert.ok(!h.includes('400 → 10'));
  assert.match(h, /×23 за 3 года, пик/);
  assert.ok(!h.includes('about what I learn at work'));
  assert.ok(h.includes('Snack kiosk chain') && !h.includes('Snack vending'));
  assert.match(JSON.stringify(seed.consulting), /×23/);
});

test('RU pages speak Russian: /consulting units, /uses headings, tags and prices', () => {
  const tiers = seed.consulting.sections.consulting.tiers;
  assert.deepEqual(tiers.map((t) => t.price.ru), ['$300 / **сессия**', '$2 000 / **месяц**']);
  assert.deepEqual(tiers.map((t) => t.price.en), ['$300 / **SESSION**', '$2,000 / **MONTH**']);
  const u = seed.uses.sections;
  const ruLabels = [
    ...u.hardware.groups.flatMap((g) => [g.heading.ru, ...g.cards.map((c) => c.tag.ru)]),
    ...u.software.cards.flatMap((c) => [c.tag.ru, c.price.ru]),
  ];
  const english = ruLabels.filter((s) => /[A-Za-z]/.test(s) && !/[А-Яа-яЁё]/.test(s) && s !== 'eSIM');
  assert.deepEqual(english, []);
  assert.equal(u.hardware.groups[0].heading.en, 'Compute'); // EN untouched
});

test('/consulting v0.31.5: two-business-day async reply, the FinTech conflict-of-interest line', () => {
  const c = seed.consulting.sections;
  const asyncLine = c.consulting.tiers[1].features.find((f) => f.ru.startsWith('Async'));
  assert.equal(asyncLine.ru, 'Async-поддержка между сессиями (ответ в течение двух рабочих дней)');
  assert.equal(asyncLine.en, 'Async support between sessions (reply within two business days)');
  const not = c.work.blocks[2].items.at(-1);
  assert.match(not.ru, /^Не консультирую прямых конкурентов Яндекса и FinTech-проекты в Узбекистане/);
  assert.match(not.en, /^I don't consult Yandex's direct competitors, or FinTech projects in Uzbekistan/);
  assert.match(renderers.collabWork(seed.consulting, 'ru'), /пока работаю в Yandex Uzbekistan/);
});
