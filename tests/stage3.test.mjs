// v0.31.2 — Telegram is the only contact, /about is hidden, no scroll chrome.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { notesIndexHtml } from '../functions/_lib/article-template.js';
import { renderers } from '../functions/_lib/render.js';
import { renderJsonLd } from '../functions/_lib/jsonld.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const PAGES = ['index.html', 'en/index.html', 'collaborate.html', 'en/collaborate.html', 'about.html', 'en/about.html', 'uses.html', 'en/uses.html'];

test('no e-mail anywhere a visitor, a crawler or an AI agent reads', () => {
  for (const f of [...PAGES, 'llms.txt', '.well-known/security.txt', 'content.seed.json']) {
    assert.doesNotMatch(read(f), /mailto:|s@morgunov\.tech/, f);
  }
  assert.match(read('.well-known/security.txt'), /^Contact: https:\/\/t\.me\/s_mrgnv$/m);
  assert.doesNotMatch(renderJsonLd(seed.home, 'en'), /"email"/);
});

test('footer: «стек · нашли опечатку?» → Telegram; no notes/about links', () => {
  const footers = PAGES.map((f) => read(f).match(/<footer class="v4-foot">[\s\S]*?<\/footer>/)[0]);
  footers.push(notesIndexHtml('ru', '', '{}', 'abc1234', { intro: 'x' }).match(/<footer class="v4-foot">[\s\S]*?<\/footer>/)[0]);
  for (const f of footers) {
    assert.doesNotMatch(f, /href="(\/en)?\/(notes|about)"/);
    assert.match(f, /<a href="https:\/\/t\.me\/s_mrgnv" target="_blank" rel="noopener noreferrer">(нашли опечатку\?|found a typo\?)<\/a>/);
  }
});

test('/about is hidden: noindex, out of llms.txt', () => {
  for (const f of ['about.html', 'en/about.html']) assert.match(read(f), /<meta name="robots" content="noindex" \/>/);
  for (const f of ['index.html', 'collaborate.html', 'uses.html']) assert.doesNotMatch(read(f), /name="robots" content="noindex"/);
  assert.doesNotMatch(read('llms.txt'), /s\.morgunov\.tech\/(en\/)?about/);
});

test('/collaborate: the pitch and the contact go to Telegram, one contact button', () => {
  const c = seed.collaborate;
  assert.equal(c.sections.angel.cta.href, 'https://t.me/s_mrgnv');
  assert.match(c.sections.angel.groups.at(-1).prose.ru, /коротког[оа] сообщения в Telegram/);
  const html = renderers.collabContact(c, 'ru');
  assert.equal((html.match(/class="v4-btn/g) || []).length, 1);
  assert.match(html, /href="https:\/\/t\.me\/s_mrgnv"[^>]*>Написать →</);
});

test('/uses promises no referral discounts it does not have', () => {
  const sw = seed.uses.sections.software;
  assert.doesNotMatch(sw.intro.ru, /по моей ссылке|скидк/);
  assert.match(sw.intro.ru, /не партнёрские/);
  const labels = sw.cards.map((c) => c.cta.label.ru);
  assert.ok(!labels.includes('6 месяцев premium →'));
});

test('no side column, back-to-top or progress bar left in markup, CSS or JS', () => {
  for (const f of [...PAGES, 'script.js', 'ds/v1/components.css', 'styles.css', 'functions/_lib/article-template.js']) {
    assert.doesNotMatch(read(f), /v4-section-nav|v4-scroll-top|v4-scroll-progress/, f);
  }
  assert.doesNotMatch(read('script.js'), /addEventListener\('scroll'/);
});

// v0.31.4 — the owner's answers to the proofreading questions.
import { fixStaleContent } from '../functions/_lib/migrations.js';

test('KV home copy: Korzinka ×23, one channel line, a kiosk chain — idempotent', () => {
  const nb = ' ';
  const doc = {
    ru: `Строил продукт.\n\n- Заказы в день: 400 → 10${nb}000 (ATH) за 3 года\n- Расширение: 1 → 9 городов`,
    en: 'Built the product.\n\n- Orders: 400 → 10,000 (ATH) per day over 3 years\n- Expansion: 1 → 9 cities',
    about: `Currently building two tools on digital privacy and running a [Telegram${nb}channel](https://t.me/raschet7) about what I learn at work. I live in Tashkent.`,
    snacks: 'Snack vending kiosks',
  };
  fixStaleContent(doc);
  assert.match(doc.ru, new RegExp(`- Заказы в день: ×23 за 3 года, пик — 10${nb}000 \\(ATH\\)\\n`));
  assert.match(doc.en, /- Daily orders: ×23 over 3 years, peaking at 10,000 \(ATH\)\n/);
  assert.equal(doc.about, `Currently building two tools on digital privacy and running a [Telegram${nb}channel](https://t.me/raschet7). I live in Tashkent.`);
  assert.equal(doc.snacks, 'Snack kiosk chain');
  const once = JSON.stringify(doc);
  assert.equal(JSON.stringify(fixStaleContent(doc)), once);
  // The seed (= the static twin) already says ×23, like /collaborate.
  assert.ok(!JSON.stringify(seed.home).includes('400 → 10'));
  assert.ok(!JSON.stringify(seed.home).includes('about what I learn at work'));
  assert.match(JSON.stringify(seed.collaborate), /×23/);
});

test('RU pages speak Russian: /collaborate units, /uses headings, tags and prices', () => {
  const tiers = seed.collaborate.sections.consulting.tiers;
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

test('/collaborate v0.31.5: two-business-day async reply, the FinTech conflict-of-interest line', () => {
  const c = seed.collaborate.sections;
  const asyncLine = c.consulting.tiers[1].features.find((f) => f.ru.startsWith('Async'));
  assert.equal(asyncLine.ru, 'Async-поддержка между сессиями (ответ в течение двух рабочих дней)');
  assert.equal(asyncLine.en, 'Async support between sessions (reply within two business days)');
  const not = c.work.blocks[2].items.at(-1);
  assert.match(not.ru, /^Не консультирую FinTech-проекты в Узбекистане/);
  assert.match(not.en, /^I don't consult FinTech projects in Uzbekistan/);
  assert.match(renderers.collabWork(seed.collaborate, 'ru'), /пока работаю в Yandex Uzbekistan/);
});
