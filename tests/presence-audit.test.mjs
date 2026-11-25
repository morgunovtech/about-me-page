// v1.2.7 — the owner's decisions on the web presence audit (2026-11-24):
// one consulting phrase, no calendar booking, e-mail as the second contact,
// no angel / advisor claims in llms.txt and JSON-LD, small copy fixes.
// v1.2.8 — «Да, убери»: no angel investing or advisory on the pages either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

import { renderers } from '../functions/_lib/render.js';
import { renderJsonLd, renderPageJsonLd } from '../functions/_lib/jsonld.js';
import { feedItemHtml } from '../functions/_lib/notes-feed.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const clone = (v) => JSON.parse(JSON.stringify(v));

const PHRASE = {
  ru: 'Помогаю e-com и ритейлу в Центральной Азии довести продукт до положительной юнит-экономики: e-grocery и доставка, рост и монетизация, продуктовая стратегия и команда; финтех — вне Узбекистана.',
  en: 'I help e-commerce and retail companies in Central Asia get products to positive unit economics: e-grocery and delivery, growth and monetization, product strategy and teams; FinTech outside Uzbekistan.',
};

// Every served or rendering file: pages, llms.txt, the seed, Functions, scripts.
function files(dir) {
  return readdirSync(new URL('../' + dir, import.meta.url)).flatMap((f) => {
    const p = dir ? `${dir}/${f}` : f;
    if (/^(\.git|\.claude|node_modules|tests|CHANGELOG\.md)$/.test(f)) return [];
    if (statSync(new URL('../' + p, import.meta.url)).isDirectory()) return files(p);
    return /\.(html|txt|json|js|mjs)$/.test(f) ? [p] : [];
  });
}

test('no calendar booking anywhere', () => {
  for (const f of files('')) assert.doesNotMatch(read(f), /book\.morgen\.so|morgen\.so/, f);
});

test('/collaborate: the phrase first, tiers to Telegram, the home page reply time beside them', () => {
  const c = seed.collaborate.sections.consulting;
  assert.deepEqual(c.prose, PHRASE);
  assert.deepEqual(c.tiers.map((t) => t.cta.href), ['https://t.me/s_mrgnv', 'https://t.me/s_mrgnv']);
  assert.deepEqual(c.tiers.map((t) => t.cta.label), [0, 1].map(() => ({ ru: 'Написать в Telegram →', en: 'Message me on Telegram →' })));
  assert.deepEqual(c.note, seed.home.sections.contact.reply);
  // Prices and the 75-minute session stay.
  assert.deepEqual(c.tiers.map((t) => t.price.ru), ['$300 / **сессия**', '$2\u00a0000 / **месяц**']);
  assert.equal(c.tiers[0].features[0].ru, '75 минут встречи + до 45 минут подготовки');
  for (const lang of ['ru', 'en']) {
    const html = renderers.collabConsulting(seed.collaborate, lang);
    const at = (s) => html.indexOf(s);
    assert.ok(at(PHRASE[lang]) >= 0 && at(PHRASE[lang]) < at('v4-products') && at('v4-products') < at('v4-terms'), lang);
  }
  assert.equal(seed.collaborate.meta.title.ru, 'Консалтинг по e-com и продукту в Центральной Азии — Семён Моргунов');
  assert.equal(seed.collaborate.meta.title.en, 'E-com and product consulting in Central Asia — Semyon Morgunov');
  for (const f of ['collaborate.html', 'en/collaborate.html']) {
    const lang = f.startsWith('en/') ? 'en' : 'ru';
    assert.ok(read(f).includes(`<title data-cms-text="meta.title">${seed.collaborate.meta.title[lang]}</title>`), f);
  }
});

test('a /collaborate doc saved before v1.2.7 still renders: tiers only, the Service falls back', () => {
  const old = clone(seed.collaborate);
  delete old.sections.consulting.prose;
  delete old.sections.consulting.note;
  const html = renderers.collabConsulting(old, 'ru');
  assert.match(html, /^<div class="v4-products">/);
  assert.doesNotMatch(html, /v4-tagline|v4-terms/);
  const svc = JSON.parse(renderPageJsonLd(old, 'en', 'collaborate'))['@graph'].find((n) => n['@type'] === 'Service');
  assert.equal(svc.description, PHRASE.en);
});

test('JSON-LD: consulting Service in the phrase, no angel or advisor claims', () => {
  for (const lang of ['ru', 'en']) {
    const ld = renderPageJsonLd(seed.collaborate, lang, 'collaborate');
    const svc = JSON.parse(ld)['@graph'].find((n) => n['@type'] === 'Service');
    assert.equal(svc.description, PHRASE[lang]);
    assert.deepEqual(svc.areaServed, ['Uzbekistan', 'Kyrgyzstan', 'Russia']);
    assert.deepEqual(svc.serviceType, ['Product consulting', 'Strategic consulting']);
    assert.doesNotMatch(ld, /angel|ангел|advis|эдвайз/i, lang);
    const home = renderJsonLd(seed.home, lang);
    assert.doesNotMatch(home, /angel|ангел|advis|эдвайз/i, lang);
    const person = JSON.parse(home)['@graph'].find((n) => n['@type'] === 'Person');
    for (const k of ['E-grocery', 'Dark stores', 'BNPL']) assert.ok(person.knowsAbout.includes(k), k);
  }
});

test('llms.txt: the phrase, e-mail second, no angel or advisor claims, one Publications, talks and press', () => {
  const t = read('llms.txt');
  assert.ok(t.includes(PHRASE.en));
  assert.doesNotMatch(t, /angel|advis/i);
  assert.equal((t.match(/^## Publications$/gm) || []).length, 1);
  const talks = t.split('## Talks and press\n')[1].split('\n## ')[0];
  assert.match(talks, /\(https:\/\/youtu\.be\/BthlUR9eO1M\) — talk at Click Data MeetUp/);
  for (const url of ['inmerge.az/inmerge-tashkent-2026', 'spot.uz/ru/2025/12/10/fuckup-talks', 'spot.uz/ru/2026/02/06/semyon-books', 'spot.uz/ru/2026/03/02/wolt-opinion', 'it-park.uz/ru/itpark/news/itogi-hakatona-president-tech-award-2024']) {
    assert.ok(talks.includes(url), url);
  }
  assert.ok(t.includes('writing since 2022') && !t.includes('1–2 posts'));
});

test('copy: no «two tools», the channel since 2022, the Korzinka Go video is a Click Data MeetUp talk', () => {
  // «Обо мне» names no count since v1.2.6 (the stats strip carries it).
  const about = seed.home.sections.about.prose;
  assert.doesNotMatch(about.ru + about.en, /два инструмента|two tools/);
  for (const f of ['index.html', 'en/index.html']) assert.doesNotMatch(read(f), /два инструмента|two tools/, f);
  const ch = seed.notes.channel.prose;
  assert.match(ch.ru, /Пишу с 2022 года\.$/);
  assert.match(ch.en, /Writing since 2022\.$/);
  assert.doesNotMatch(ch.ru + ch.en, /1–2/);
  const talk = seed.notes.external.find((x) => x.href === 'https://youtu.be/BthlUR9eO1M');
  assert.equal(talk.tag, undefined);
  assert.match(feedItemHtml({ kind: 'external', item: talk }, 'ru'), /<p class="v4-note-meta">Click Data MeetUp \/ Product Edition · YouTube · 3 600\+ просмотров<\/p>/);
});

// What a visitor reads as an offer of angel money or advisory. «crowd-investing
// platform brainbox.vc» (a video title in the feed) is a subject, not an offer.
const PROMISE = /angel|ангел|advis|эдвайз|инвестор|investor|вкладыва|invest capital|#angel/i;

test('pages promise no angel investing or advisory (v1.2.8)', () => {
  for (const f of ['collaborate.html', 'en/collaborate.html', 'index.html', 'en/index.html', 'uses.html', 'en/uses.html', 'about.html', 'en/about.html', 'llms.txt']) {
    // «CHANGELOG» (the build mark's address) holds the letters «angel».
    assert.doesNotMatch(read(f).replace(/crowd-invest\w*|крауд-инвест\w*|CHANGELOG/gi, ''), PROMISE, f);
  }
  assert.doesNotMatch(JSON.stringify(seed.collaborate), PROMISE);
  assert.doesNotMatch(JSON.stringify(seed.home), PROMISE);
});

test('/collaborate without #angel: sections in page order and unnumbered, menu points at real sections', () => {
  assert.deepEqual(Object.keys(seed.collaborate.sections), ['about', 'consulting', 'strategy', 'work', 'partnerships', 'contact']);
  for (const f of ['collaborate.html', 'en/collaborate.html']) {
    const page = read(f);
    const ids = [...page.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(ids, ['about', 'consulting', 'strategy', 'work', 'partnerships', 'contact'], f);
    for (const [, id] of page.matchAll(/<a href="#([^"]+)"/g)) assert.ok(id === 'main' || ids.includes(id), `${f}: #${id}`);
    assert.doesNotMatch(page, /v4-section-num/, f);
  }
});

test('/collaborate meta and share card: the phrase without the FinTech tail, the share title is the page title', () => {
  const c = seed.collaborate;
  for (const lang of ['ru', 'en']) {
    const desc = PHRASE[lang].replace(/; (финтех — вне Узбекистана|FinTech outside Uzbekistan)\.$/, '.');
    assert.equal(c.meta.description[lang], desc);
    assert.equal(c.share.description[lang], desc);
    assert.equal(c.share.title[lang], c.meta.title[lang]);
    assert.doesNotMatch(desc, /fintech|финтех/i);
  }
  assert.equal(c.hero.eyebrow.ru, 'Консалтинг · Стратегия');
  assert.equal(c.hero.eyebrow.en, 'Consulting · Strategy');
  for (const f of ['collaborate.html', 'en/collaborate.html']) {
    const lang = f.startsWith('en/') ? 'en' : 'ru';
    const page = read(f);
    for (const [k, v] of [['meta.description', c.meta.description], ['share.title', c.share.title], ['share.description', c.share.description]]) {
      for (const m of page.matchAll(new RegExp(`data-cms-content="${k.replace('.', '\\.')}" content="([^"]*)"`, 'g'))) assert.equal(m[1], v[lang], `${f} ${k}`);
    }
  }
});
