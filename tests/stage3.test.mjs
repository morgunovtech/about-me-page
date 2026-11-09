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
