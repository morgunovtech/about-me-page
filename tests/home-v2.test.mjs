// v0.31.1 — the homepage in five sections (site v2, stage 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { migrateHome, fixStaleContent, MIGRATION } from '../functions/_lib/migrations.js';
import { renderers } from '../functions/_lib/render.js';
import { buildFeed } from '../functions/_lib/notes-feed.js';

const seed = JSON.parse(readFileSync(new URL('../content.seed.json', import.meta.url), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const nb = ' ';

// A KV home doc as it was saved before v2 (the owner's /admin edits, no marker).
function oldKvDoc() {
  return {
    hero: {
      tagline: { ru: 'Запускаю E-com и Fintech продукты…', en: 'Building products…' },
      ctas: [
        { label: { ru: 'Написать в Telegram', en: 'Message me on Telegram' }, href: 'https://t.me/s_mrgnv', primary: true },
        { label: { ru: 'Чем могу помочь', en: 'How I can help' }, href: { ru: '/collaborate.html', en: '/en/collaborate.html' } },
      ],
    },
    stats: [
      { value: { ru: '10', en: '10' }, unit: { ru: 'лет в IT', en: 'yrs in tech' } },
      { kind: 'subscribers', auto: true, value: { ru: '5 831', en: '5,831' }, channels: { telegram: { ru: '1 139', en: '1,139' } } },
      { value: { ru: '4', en: '4' }, unit: { ru: 'своих проекта', en: 'own ventures' }, aside: { ru: 'с 2009 года · 1 продан', en: 'since 2009 · 1 sold' } },
    ],
    sections: {
      about: { num: '01', title: { ru: 'Обо мне', en: 'About' }, prose: { ru: 'Мой текст', en: 'My text' } },
      career: { num: '02', title: { ru: 'Карьера', en: 'Career' }, items: [], more: { label: { ru: 'L', en: 'L' }, href: 'https://l' } },
      help: { num: '03', blocks: [{ type: 'subhead', text: { ru: 'Как работаю', en: 'How I work' } }] },
      ventures: { num: '04', title: { ru: 'Своё дело', en: 'Own ventures' }, items: [{ year: '2023', name: { ru: 'Школа', en: 'School' }, arc: { ru: 'Запустил → Не нашёл PMF → На паузе', en: 'x' } }] },
      products: {
        num: '05', title: { ru: 'Продукты', en: 'Products' },
        items: [
          { tag: 'WEB', live: true, version: 'v2.5', name: 'Fingerprint', desc: { ru: 'мой текст', en: 'my text' }, cta: { label: { ru: 'Проверить →', en: 'Check →' }, href: 'https://fprint.morgunov.tech/' } },
          { tag: 'WEB', live: true, version: 'v1.0', name: 'FoundYou', desc: { ru: 'т', en: 't' }, cta: { label: { ru: 'Очистить →', en: 'Clean →' }, href: 'https://foundyou.morgunov.tech/' } },
        ],
        more: { label: { ru: '→ GitHub', en: '→ GitHub' }, href: 'https://github.com/morgunovtech' },
      },
      publications: { items: [{ tag: 'CHANNEL', meta: { ru: '1 139 в Telegram', en: '1,139 on Telegram' } }] },
      contact: { num: '07', title: { ru: 'Связаться', en: 'Get in touch' }, note: { ru: 'Читаю всё.', en: 'I read everything.' },
        ctas: [{ label: { ru: 'Telegram', en: 'Telegram' }, href: 'https://t.me/s_mrgnv', primary: true }, { label: { ru: 'Email', en: 'Email' }, href: 'mailto:s@morgunov.tech' }] },
    },
  };
}

test('migration 31 turns an old KV home doc into the five-section shape', () => {
  const kv = migrateHome(oldKvDoc(), clone(seed.home));
  const S = kv.sections;
  assert.equal(kv.migration, MIGRATION);
  assert.equal(MIGRATION, 31);
  assert.equal(kv.hero.tagline.ru, seed.home.hero.tagline.ru);
  assert.deepEqual(kv.hero.ctas.map((c) => c.href), ['https://t.me/s_mrgnv']);
  const own = kv.stats.find((s) => s.unit && /^своих проект/.test(s.unit.ru));
  assert.deepEqual([own.value.ru, own.unit.ru, own.aside.ru], ['7', 'своих проектов', 'с 2009 · 1 продан · 3 работают']);
  assert.ok(S.projects && S.notes);
  assert.equal(S.help, undefined);
  assert.equal(S.publications, undefined);
  // Products: the seed's TofsDevOps card joins, every card gets its year, newest first.
  assert.deepEqual(S.products.items.map((i) => [i.name, i.year]), [['FoundYou', '2026'], ['TofsDevOps', '2026'], ['Fingerprint', '2025']]);
  assert.equal(S.products.title, undefined);
  assert.equal(S.ventures.title, undefined);
  // The owner's own copy survives.
  assert.equal(S.about.prose.ru, 'Мой текст');
  assert.equal(S.products.items[2].desc.ru, 'мой текст');
  assert.equal(S.ventures.items[0].arc.ru, 'Запустил → Не нашёл PMF → На паузе');
  // Contact: the approved copy, Telegram only, two links to /collaborate.
  assert.deepEqual(S.contact.ctas.map((c) => c.href), ['https://t.me/s_mrgnv']);
  assert.equal(S.contact.links.length, 2);
  assert.equal(S.contact.num, '05');
});

test('migration 31 runs once: later /admin edits stick', () => {
  const kv = migrateHome(oldKvDoc(), clone(seed.home));
  kv.hero.tagline.ru = 'Моя новая подпись';
  kv.sections.contact.note.ru = 'Мой текст контакта';
  kv.sections.products.items.reverse();
  const before = JSON.stringify(kv);
  migrateHome(kv, clone(seed.home));
  assert.equal(JSON.stringify(kv), before);
});

test('the live KV home doc survives migration + stale fixes and still renders every slot', () => {
  const kv = fixStaleContent(migrateHome(oldKvDoc(), clone(seed.home)));
  kv._feed = buildFeed([], seed.notes, 'ru').slice(0, 3);
  for (const slot of ['heroCtas', 'stats', 'career', 'products', 'ventures', 'notesFeed', 'contact']) {
    assert.equal(typeof renderers[slot](kv, 'ru', false), 'string', slot);
    assert.equal(typeof renderers[slot](kv, 'en', true), 'string', slot + ' (edit)');
  }
});

test('product cards: year · version, the name links out, the live dot is labelled', () => {
  const html = renderers.products(seed.home, 'ru', false);
  assert.match(html, /<span>2026<\/span> · <span>v1\.0<\/span>/);
  assert.match(html, /<h3 class="v4-product-name"><a href="https:\/\/foundyou\.morgunov\.tech\/" target="_blank" rel="noopener noreferrer">FoundYou<\/a><\/h3>/);
  assert.match(html, /<span class="sr-only">Работает<\/span>/);
  assert.match(renderers.products(seed.home, 'en', false), /<span class="sr-only">Live<\/span>/);
  // The editor gets plain, editable leaves — no link to click through.
  const edit = renderers.products(seed.home, 'ru', true);
  assert.match(edit, /data-cms-text="sections\.products\.items\.0\.year">2026</);
  assert.match(edit, /data-cms-text="sections\.products\.items\.0\.version">v1\.0</);
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
    assert.match(html, /href="\/notes">Все публикации →<\/a>/);
  }
  doc._feed = buildFeed([], seed.notes, 'ru').slice(0, 3);
  const ext = renderers.notesFeed(doc, 'ru', false);
  assert.match(ext, /target="_blank" rel="noopener noreferrer">2 года Korzinka Go[^<]*<span aria-hidden="true">&nbsp;→<\/span><span class="sr-only"> \(откроется в новой вкладке\)<\/span>/);
  assert.match(ext, /<time class="v4-feed-date" datetime="2025-06-26">26 июня 2025/);
  // EN: untranslated notes drop out; the CTA points at /en/notes.
  doc._feed = buildFeed(notes(2).reverse(), seed.notes, 'en').slice(0, 3);
  const en = renderers.notesFeed(doc, 'en', false);
  assert.doesNotMatch(en, />NOTE</);
  assert.match(en, /href="\/en\/notes">All publications →<\/a>/);
  // No feed (KV down) → just the button.
  delete doc._feed;
  assert.doesNotMatch(renderers.notesFeed(doc, 'ru', false), /v4-feed/);
});

test('contact: who writes, Telegram only with the reply time, two links to /collaborate', () => {
  const ru = renderers.contact(seed.home, 'ru', false);
  assert.equal((ru.match(/class="v4-btn/g) || []).length, 1);
  assert.doesNotMatch(ru, /mailto:/);
  assert.match(ru, /Обычно отвечаю в течение 10 рабочих дней\./);
  assert.match(ru, /href="\/collaborate#consulting">→ Консалтинг: форматы и цены</);
  assert.match(ru, /href="\/collaborate#angel">→ Инвестиции: что прислать</);
  assert.match(renderers.contact(seed.home, 'en', false), /href="\/en\/collaborate#angel">→ Investing: what to send</);
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
