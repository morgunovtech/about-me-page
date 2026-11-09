// v0.31.1 — the homepage in five sections (site v2, stage 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderers } from '../functions/_lib/render.js';
import { buildFeed } from '../functions/_lib/notes-feed.js';

const seed = JSON.parse(readFileSync(new URL('../content.seed.json', import.meta.url), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const nb = ' ';

test('the seed home doc renders every slot, public and edit mode', () => {
  const doc = clone(seed.home);
  doc._feed = buildFeed([], seed.notes, 'ru').slice(0, 3);
  for (const slot of ['heroCtas', 'stats', 'career', 'products', 'ventures', 'notesFeed', 'contact']) {
    assert.equal(typeof renderers[slot](doc, 'ru', false), 'string', slot);
    assert.equal(typeof renderers[slot](doc, 'en', true), 'string', slot + ' (edit)');
  }
});

test('product cards: TofsDevOps first, version only (no year), the name links out, the live dot is labelled', () => {
  const html = renderers.products(seed.home, 'ru', false);
  assert.deepEqual(seed.home.sections.products.items.map((it) => it.name), ['TofsDevOps', 'FoundYou', 'Fingerprint']);
  // The head carries the version alone — synced from GitHub by scripts/sync-products.mjs.
  assert.equal((html.match(/<\/span>\n {12}<span>v\d+\.\d+<\/span>\n {10}<\/div>/g) || []).length, 3);
  assert.doesNotMatch(html, / · /);
  for (const it of seed.home.sections.products.items) assert.equal(it.year, undefined, it.name);
  assert.match(html, /<h3 class="v4-product-name"><a href="https:\/\/foundyou\.morgunov\.tech\/" target="_blank" rel="noopener noreferrer">FoundYou<\/a><\/h3>/);
  assert.match(html, /<span class="sr-only">Работает<\/span>/);
  assert.match(renderers.products(seed.home, 'en', false), /<span class="sr-only">Live<\/span>/);
  // The editor gets plain, editable leaves — no link to click through.
  const edit = renderers.products(seed.home, 'ru', true);
  assert.match(edit, /data-cms-text="sections\.products\.items\.0\.version">v\d+\.\d+</);
  assert.doesNotMatch(edit, /\.year"/);
  assert.doesNotMatch(edit, /<h3 class="v4-product-name"[^>]*><a /);
});

test('notes block: up to three rows, own notes stay on site, external ones open a new tab', () => {
  const doc = clone(seed.home);
  const notes = (n) => Array.from({ length: n }, (_, i) => ({ slug: 'n' + i, date: `2026-10-0${i + 1}`, status: 'published', title: { ru: 'Заметка ' + i, en: '' } }));
  for (const n of [0, 1, 3, 5]) {
    doc._feed = buildFeed(notes(n).reverse(), seed.notes, 'ru').slice(0, 3);
    const html = renderers.notesFeed(doc, 'ru', false);
    assert.equal((html.match(/class="v4-feed-row"/g) || []).length, 3, `${n} notes`);
    assert.equal((html.match(/<span class="v4-tag">NOTE<\/span>/g) || []).length, Math.min(n, 3));
    assert.match(html, /<div class="v4-more"><a href="\/notes">→ Все публикации<\/a><\/div>/);
  }
  doc._feed = buildFeed([], seed.notes, 'ru').slice(0, 3);
  const ext = renderers.notesFeed(doc, 'ru', false);
  assert.match(ext, /target="_blank" rel="noopener noreferrer">2 года Korzinka Go[^<]*<span aria-hidden="true">&nbsp;→<\/span><span class="sr-only"> \(откроется в новой вкладке\)<\/span>/);
  assert.match(ext, /<time class="v4-feed-date" datetime="2025-06-26">26 июня 2025/);
  // EN: untranslated notes drop out; the CTA points at /en/notes.
  doc._feed = buildFeed(notes(2).reverse(), seed.notes, 'en').slice(0, 3);
  const en = renderers.notesFeed(doc, 'en', false);
  assert.doesNotMatch(en, />NOTE</);
  assert.match(en, /<div class="v4-more"><a href="\/en\/notes">→ All publications<\/a><\/div>/);
  assert.doesNotMatch(en, /v4-btn/);
  // No feed (KV down) → just the button.
  delete doc._feed;
  assert.doesNotMatch(renderers.notesFeed(doc, 'ru', false), /v4-feed/);
});

test('contact: who writes, the consulting link, then Telegram with the reply time', () => {
  const ru = renderers.contact(seed.home, 'ru', false);
  assert.equal((ru.match(/class="v4-btn/g) || []).length, 1);
  assert.doesNotMatch(ru, /mailto:/);
  assert.match(ru, /Обычно отвечаю в течение 10 рабочих дней\./);
  assert.match(ru, /href="\/collaborate#consulting">→ Консалтинг: форматы и цены</);
  assert.doesNotMatch(ru, /#angel/);
  // note → link → button row, in that order
  const at = (re) => ru.search(re);
  assert.ok(at(/v4-contact-note/) < at(/v4-contact-links/) && at(/v4-contact-links/) < at(/v4-cta-row/));
  const en = renderers.contact(seed.home, 'en', false);
  assert.match(en, /href="\/en\/collaborate#consulting">/);
  assert.doesNotMatch(en, /#angel/);
});

test('/collaborate gains «Как работаю» with the owner\'s live copy', () => {
  const html = renderers.collabWork(seed.collaborate, 'ru');
  assert.match(html, /Провожу аудит в полях/);
  assert.match(html, /<h3 class="v4-h3">Чего не делаю<\/h3>/);
  assert.equal(seed.collaborate.sections.contact.num, '06');
  assert.match(renderers.collabWork(seed.collaborate, 'en'), /What I don't do/);
});

test('seed home: five sections, the stats count matches the page', () => {
  const S = seed.home.sections;
  assert.deepEqual(Object.keys(S), ['about', 'career', 'projects', 'products', 'ventures', 'notes', 'contact']);
  const own = seed.home.stats.find((s) => s.unit && s.unit.ru === 'своих проектов');
  assert.equal(Number(own.value.ru), S.products.items.length + S.ventures.items.length);
  assert.match(own.aside.ru, new RegExp(`${S.products.items.length} работают`));
  assert.equal(seed.home.hero.ctas.length, 1);
  assert.ok(!JSON.stringify(seed.home).includes('mailto:'));
  assert.equal(nb, ' ');
});
