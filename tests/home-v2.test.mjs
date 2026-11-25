// v0.31.1 — the homepage in five sections (site v2, stage 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderers } from '../functions/_lib/render.js';
import { buildFeed } from '../functions/_lib/notes-feed.js';
import { renderJsonLd } from '../functions/_lib/jsonld.js';

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

test('product cards: TofsDevOps first, bots then web apps, version only (no year), the name links out, the live dot is labelled', () => {
  const html = renderers.products(seed.home, 'ru', false);
  assert.deepEqual(seed.home.sections.products.items.map((it) => it.name), ['TofsDevOps', 'Social Tracker Bot', 'Found You', 'Fingerprint']);
  // The head carries the version alone — synced from GitHub by scripts/sync-products.mjs.
  assert.equal((html.match(/<\/span>\n {12}<span>v\d+\.\d+<\/span>\n {10}<\/div>/g) || []).length, 4);
  assert.doesNotMatch(html, / · /);
  for (const it of seed.home.sections.products.items) assert.equal(it.year, undefined, it.name);
  assert.match(html, /<h3 class="v4-product-name"><a href="https:\/\/foundyou\.morgunov\.tech\/" target="_blank" rel="noopener noreferrer">Found You<\/a><\/h3>/);
  assert.match(html, /<span class="sr-only">Работает<\/span>/);
  assert.match(renderers.products(seed.home, 'en', false), /<span class="sr-only">Live<\/span>/);
  // The editor gets plain, editable leaves — no link to click through.
  const edit = renderers.products(seed.home, 'ru', true);
  assert.match(edit, /data-cms-text="sections\.products\.items\.0\.version">v\d+\.\d+</);
  assert.doesNotMatch(edit, /\.year"/);
  assert.doesNotMatch(edit, /<h3 class="v4-product-name"[^>]*><a /);
});

test('web products: the Russian page links the root, the English page the product\'s /en/ page — card and JSON-LD', () => {
  const ru = renderers.products(seed.home, 'ru', false);
  const en = renderers.products(seed.home, 'en', false);
  const ldRu = renderJsonLd(seed.home, 'ru');
  const ldEn = renderJsonLd(seed.home, 'en');
  const esc = (s) => s.replace(/[./-]/g, '\\$&');
  for (const host of ['foundyou', 'fprint']) {
    const root = `https://${host}.morgunov.tech/`;
    // The name and the button both link out: two hrefs per card.
    assert.equal((ru.match(new RegExp(`href="${esc(root)}"`, 'g')) || []).length, 2, host + ' ru');
    assert.equal((en.match(new RegExp(`href="${esc(root)}en/"`, 'g')) || []).length, 2, host + ' en');
    assert.doesNotMatch(en, new RegExp(`href="${esc(root)}"`), host + ' en keeps no root link');
    assert.match(ldRu, new RegExp(`"url": "${esc(root)}"`), host + ' JSON-LD ru');
    assert.match(ldEn, new RegExp(`"url": "${esc(root)}en/"`), host + ' JSON-LD en');
  }
});

test('notes block: up to three rows, own notes stay on site, external ones open a new tab', () => {
  const doc = clone(seed.home);
  const notes = (n) => Array.from({ length: n }, (_, i) => ({ slug: 'n' + i, date: `2026-10-0${i + 1}`, status: 'published', title: { ru: 'Заметка ' + i, en: '' } }));
  for (const n of [0, 1, 3, 5]) {
    doc._feed = buildFeed(notes(n).reverse(), seed.notes, 'ru').slice(0, 3);
    const html = renderers.notesFeed(doc, 'ru', false);
    assert.equal((html.match(/class="v4-feed-row"/g) || []).length, 3, `${n} notes`);
    // «date · source» in one mono line; no tag chip (v1.5.0). An own note says «Заметка».
    assert.doesNotMatch(html, /v4-tag/);
    assert.equal((html.match(/ · Заметка<\/span>/g) || []).length, Math.min(n, 3));
    assert.match(html, /<div class="v4-more"><a href="\/notes"><span>Все публикации<\/span><span aria-hidden="true">&nbsp;→<\/span><\/a><\/div>/);
  }
  doc._feed = buildFeed([], seed.notes, 'ru').slice(0, 3);
  const ext = renderers.notesFeed(doc, 'ru', false);
  assert.match(ext, /target="_blank" rel="noopener noreferrer">2 года Korzinka Go[^<]*<span aria-hidden="true">&nbsp;↗<\/span><span class="sr-only"> \(откроется в новой вкладке\)<\/span>/);
  // The source is the platform, derived from the address: it cannot be mistyped.
  assert.match(ext, /<span class="v4-feed-meta"><time datetime="2025-06-26">06\.2025<\/time> · YouTube<\/span>/);
  assert.match(ext, /<time datetime="2022-08-08">08\.2022<\/time> · vc\.ru<\/span>/);
  // EN: untranslated notes drop out; the CTA points at /en/notes.
  doc._feed = buildFeed(notes(2).reverse(), seed.notes, 'en').slice(0, 3);
  const en = renderers.notesFeed(doc, 'en', false);
  assert.doesNotMatch(en, / · Note</);
  assert.match(en, /<div class="v4-more"><a href="\/en\/notes"><span>All publications<\/span><span aria-hidden="true">&nbsp;→<\/span><\/a><\/div>/);
  assert.doesNotMatch(en, /v4-btn/);
  // No feed (KV down) → just the button.
  delete doc._feed;
  assert.doesNotMatch(renderers.notesFeed(doc, 'ru', false), /v4-feed/);
});

test('contact: who writes, ONE button with the reply time, the e-mail as a line, the consulting link last', () => {
  const ru = renderers.contact(seed.home, 'ru', false);
  // Telegram is the main contact and the block's only button; e-mail, the second
  // channel (v1.2.7), is a line of text since v1.5.0.
  assert.equal((ru.match(/class="v4-btn/g) || []).length, 1);
  assert.match(ru, /<a class="v4-btn v4-btn-primary" href="https:\/\/t\.me\/s_mrgnv" target="_blank" rel="noopener noreferrer">Написать в Telegram<\/a>\n {10}<p class="v4-contact-reply">Обычно отвечаю в течение 10 рабочих дней\.<\/p>/);
  assert.match(ru, /<p class="v4-contact-alt">или на почту: <a href="mailto:s@morgunov\.tech">s@morgunov\.tech<\/a><\/p>/);
  assert.match(ru, /href="\/consulting#consulting"><span>Форматы и цены консалтинга<\/span><span aria-hidden="true">&nbsp;→<\/span>/);
  assert.doesNotMatch(ru, /#angel/);
  // note → button row → e-mail line → link, in that order
  const at = (re) => ru.search(re);
  assert.ok(at(/v4-contact-note/) < at(/v4-cta-row/) && at(/v4-cta-row/) < at(/v4-contact-alt/) && at(/v4-contact-alt/) < at(/v4-contact-links/));
  const en = renderers.contact(seed.home, 'en', false);
  assert.match(en, /or by e-mail: <a href="mailto:s@morgunov\.tech">/);
  assert.match(en, /href="\/en\/consulting#consulting">/);
  assert.doesNotMatch(en, /#angel/);
});

test('/consulting gains «Как работаю» with the owner\'s live copy', () => {
  const html = renderers.collabWork(seed.consulting, 'ru');
  assert.match(html, /Провожу аудит в полях/);
  assert.match(html, /<h3 class="v4-h3">Чего не делаю<\/h3>/);
  // 04 and 05 since the angel section left (v1.2.8).
  assert.match(renderers.collabWork(seed.consulting, 'en'), /What I don't do/);
});

test('seed home: five sections, the stats count matches the page', () => {
  const S = seed.home.sections;
  assert.deepEqual(Object.keys(S), ['about', 'career', 'projects', 'products', 'ventures', 'notes', 'contact']);
  const own = seed.home.stats.find((s) => s.unit && s.unit.ru === 'своих проектов');
  assert.equal(Number(own.value.ru), S.products.items.length + S.ventures.items.length);
  assert.match(own.aside.ru, new RegExp(`${S.products.items.length} работают`));
  assert.equal(seed.home.hero.ctas.length, 1);
  // The one mailto is the second «Связаться» button; the hero keeps Telegram only.
  assert.equal((JSON.stringify(seed.home).match(/mailto:/g) || []).length, 1);
  assert.equal(S.contact.ctas[1].href, 'mailto:s@morgunov.tech');
  assert.equal(nb, ' ');
});
