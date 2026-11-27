// v0.31.1 — the homepage in five sections (site v2, stage 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderers, feedSource } from '../functions/_lib/render.js';
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

test('product cards (v4.2.0): TofsDevOps first, bots then web apps; one line — the name as the link, quietly what it is and the version; no button, no live dot', () => {
  const items = seed.home.sections.products.items;
  assert.deepEqual(items.map((it) => it.name), ['TofsDevOps', 'Social Tracker', 'Found You', 'Fingerprint']);
  const KIND = { BOT: { ru: 'Бот', en: 'Bot' }, WEB: { ru: 'Веб', en: 'Web' } };
  for (const lang of ['ru', 'en']) {
    const html = renderers.products(seed.home, lang, false);
    // The head of a card: the name, which links out with the turned arrow and the new-tab note —
    // or, for a product with a page on this site (Social Tracker, v4.4.0), to that page in the
    // same tab with no mark — then, quietly, what it is and its version (synced from GitHub by
    // sync-products.mjs).
    const heads = [...html.matchAll(/<div class="v4-product-head">\s*<h3 class="v4-product-name"><a href="(?:https:\/\/[^"]+" target="_blank" rel="noopener noreferrer">([^<]+)<span class="v4-out" aria-hidden="true">&#8288;<span class="v4-ne">→<\/span><\/span><span class="sr-only">[^<]+<\/span>|\/[a-z/-]+">([^<]+))<\/a><\/h3>\s*<span class="v4-product-meta"><span>([^<]+)<\/span>&nbsp;· <span>([^<]+)<\/span><\/span>\s*<\/div>/g)];
    assert.deepEqual(heads.map((m) => [m[1] || m[2], m[3], m[4]]), items.map((it) => [it.name, KIND[it.tag][lang], it.version]), lang);
    // The name is the action: no button in a card.
    assert.doesNotMatch(html, /v4-btn|v4-tag/, lang);
    assert.doesNotMatch(html, /v4-live-dot|v4-product-tag-row|<span class="sr-only">(Работает|Live)<\/span>/, lang);
  }
  for (const it of items) {
    assert.match(it.version, /^v\d+\.\d+$/, it.name);
    assert.equal(it.year, undefined, it.name);
    assert.equal(it.live, undefined, it.name);
    assert.ok(KIND[it.tag], it.name);
  }
  // …and a doc that still stores the flag (KV) renders the same card.
  const flagged = clone(seed.home);
  flagged.sections.products.items.forEach((it) => { it.live = true; });
  assert.equal(renderers.products(flagged, 'ru', false), renderers.products(seed.home, 'ru', false));
  // The editor gets plain, editable leaves — no link to click through; the kind as stored.
  const edit = renderers.products(seed.home, 'ru', true);
  assert.match(edit, /<span class="v4-product-meta"><span data-cms-text="sections\.products\.items\.0\.tag">BOT<\/span>&nbsp;· <span data-cms-text="sections\.products\.items\.0\.version">v\d+\.\d+<\/span><\/span>/);
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
    // The name is the one link of a card (v4.2.0: no button).
    assert.equal((ru.match(new RegExp(`href="${esc(root)}"`, 'g')) || []).length, 1, host + ' ru');
    assert.equal((en.match(new RegExp(`href="${esc(root)}en/"`, 'g')) || []).length, 1, host + ' en');
    assert.doesNotMatch(en, new RegExp(`href="${esc(root)}"`), host + ' en keeps no root link');
    assert.match(ldRu, new RegExp(`"url": "${esc(root)}"`), host + ' JSON-LD ru');
    assert.match(ldEn, new RegExp(`"url": "${esc(root)}en/"`), host + ' JSON-LD en');
  }
});

test('Social Tracker (v4.4.0): the card\'s name leads to its page on this site, in the visitor\'s language; JSON-LD names the absolute URL', () => {
  const card = seed.home.sections.products.items.find((it) => it.name === 'Social Tracker');
  assert.deepEqual(card.cta.href, { ru: '/social-tracker', en: '/en/social-tracker' });
  for (const [lang, path] of [['ru', '/social-tracker'], ['en', '/en/social-tracker']]) {
    const html = renderers.products(seed.home, lang, false);
    // A page of the site opens in the same tab and carries no «leaves the site» mark.
    assert.ok(html.includes(`<h3 class="v4-product-name"><a href="${path}">Social Tracker</a></h3>`), lang);
    assert.doesNotMatch(html, /href="https:\/\/github\.com\/morgunovtech\/social-tracker-bot"/, lang);
    const item = JSON.parse(renderJsonLd(seed.home, lang))['@graph']
      .find((n) => n['@type'] === 'ItemList').itemListElement.map((li) => li.item).find((it) => it.name === 'Social Tracker');
    assert.equal(item.url, 'https://s.morgunov.tech' + path, lang);
    assert.equal(item.operatingSystem, 'Telegram', lang);
  }
  // An absolute address is kept as it is.
  const ext = clone(seed.home);
  ext.sections.products.items[1].cta.href = 'https://example.com/x';
  assert.match(renderJsonLd(ext, 'ru'), /"url": "https:\/\/example\.com\/x"/);
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
    // An own note stays on the site: no new tab and no mark of one; an external row has both.
    assert.equal((html.match(/target="_blank"/g) || []).length, 3 - Math.min(n, 3), `${n} notes`);
    assert.equal((html.match(/class="v4-ne"/g) || []).length, 3 - Math.min(n, 3), `${n} notes`);
    assert.match(html, /<div class="v4-more"><a href="\/notes"><span>Все публикации<\/span><span aria-hidden="true">&nbsp;→<\/span><\/a><\/div>/);
  }
  doc._feed = buildFeed([], seed.notes, 'ru').slice(0, 3);
  const ext = renderers.notesFeed(doc, 'ru', false);
  // A material published elsewhere says that it leaves the site: for the eye the line's own «→»
  // turned 45° by .v4-ne (never the character «↗» — the IBM Plex subsets have none, a system
  // one is a hairline), for a screen reader the new-tab note.
  assert.match(ext, /target="_blank" rel="noopener noreferrer">«Это не диагноз рынку Узбекистана»[^<]*<span class="v4-out" aria-hidden="true">&#8288;<span class="v4-ne">→<\/span><\/span><span class="sr-only"> \(откроется в новой вкладке\)<\/span><\/a><\/li>/);
  assert.doesNotMatch(ext, /↗/);
  // The source is the platform, derived from the address: it cannot be mistyped.
  assert.match(ext, /<span class="v4-feed-meta"><time datetime="2026-03-02">03\.2026<\/time> · spot\.uz<\/span>/);
  assert.match(ext, /<time datetime="2026-02-06">02\.2026<\/time> · spot\.uz<\/span>/);
  assert.equal(feedSource({ kind: 'external', item: { href: 'https://youtu.be/BthlUR9eO1M' } }, 'ru'), 'YouTube');
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

test('contact (v4.2.0): one panel — who writes and the pages to read first; ONE button, the e-mail under it, the reply time last', () => {
  const c = seed.home.sections.contact;
  const re = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const ru = renderers.contact(seed.home, 'ru', false);
  // Telegram is the main contact and the block's only button; e-mail, the second
  // channel (v1.2.7), is a line of text since v1.5.0.
  assert.equal((ru.match(/class="v4-btn/g) || []).length, 1);
  assert.match(ru, new RegExp([
    '^<div class="v4-contact">',
    '<div class="v4-contact-text">',
    `<p class="v4-contact-note">${re(c.note.ru)}</p>`,
    '<div class="v4-contact-links">',
    '<div class="v4-more"><a href="/consulting#consulting"><span>Форматы и цены консалтинга</span><span aria-hidden="true">&nbsp;→</span></a></div>',
    '<div class="v4-more"><a href="/collaborate"><span>Партнёрства и медиа</span><span aria-hidden="true">&nbsp;→</span></a></div>',
    '</div>',
    '</div>',
    '<div class="v4-contact-act">',
    '<div class="v4-cta-row">',
    '<a class="v4-btn v4-btn-primary" href="https://t\\.me/s_mrgnv" target="_blank" rel="noopener noreferrer">Написать в Telegram</a>',
    '</div>',
    '<p class="v4-contact-alt">Или на почту: <a href="mailto:s@morgunov\\.tech">s@morgunov\\.tech</a></p>',
    `<p class="v4-contact-reply">${re(c.reply.ru)}</p>`,
    '</div>',
    '</div>$',
  ].join('\\s*')));
  assert.equal(c.reply.ru, 'Обычно отвечаю в течение 10 рабочих дней.');
  assert.doesNotMatch(ru, /#angel/);
  const en = renderers.contact(seed.home, 'en', false);
  assert.match(en, /<p class="v4-contact-alt">Or by e-mail: <a href="mailto:s@morgunov\.tech">s@morgunov\.tech<\/a><\/p>\s*<p class="v4-contact-reply">[^<]+<\/p>\s*<\/div>\s*<\/div>$/);
  assert.match(en, /<a class="v4-btn v4-btn-primary" href="https:\/\/t\.me\/s_mrgnv" target="_blank" rel="noopener noreferrer">Message me on Telegram<\/a>/);
  assert.match(en, /href="\/en\/consulting#consulting">/);
  assert.match(en, /href="\/en\/collaborate"><span>Partnerships and media<\/span>/);
  assert.doesNotMatch(en, /#angel/);
  // A doc without the optional parts (no reply time, no e-mail, no links) is the bare panel:
  // nothing is rendered empty.
  const bare = clone(seed.home);
  delete bare.sections.contact.reply;
  delete bare.sections.contact.links;
  bare.sections.contact.ctas = bare.sections.contact.ctas.filter((x) => !String(x.href).startsWith('mailto:'));
  assert.doesNotMatch(renderers.contact(bare, 'ru', false), /v4-contact-reply|v4-contact-alt|v4-contact-links|<p[^>]*><\/p>/);
  // The editor edits the same leaves: the note, the button's label, the reply time, the address.
  const edit = renderers.contact(seed.home, 'ru', true);
  for (const path of ['sections.contact.note', 'sections.contact.ctas.0.label', 'sections.contact.reply', 'sections.contact.ctas.1.label', 'sections.contact.links.0.label']) {
    assert.ok(edit.includes(`data-cms-text="${path}"`), path);
  }
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
