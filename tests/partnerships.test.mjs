// /collaborate «Партнёрства и медиа». v1.7.0 — the section and the one support
// link on the homepage; v2.0.0 — the section became the page, consulting moved
// to /consulting; v4.6.0–v4.6.2 — «Аудитория»; v4.7.0 — the owner's brief of
// 2026-11-27: an invitation to technology companies from a practitioner, not a
// rate card. What the tests keep: the page's order, one way to write (the
// e-mail button, Telegram as a line), no prices, the figures with their
// sources and dates, the subscriber counts from the homepage's counters, the
// selected work taken from the publications feed, consulting last and quiet.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderers, counters } from '../functions/_lib/render.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const c = seed.collaborate;
const S = c.sections;
const nb = String.fromCharCode(0xa0);
const PAGES = [['collaborate.html', 'ru'], ['en/collaborate.html', 'en']];
const section = (html, id) => html.split(`<section id="${id}"`)[1].split('</section>')[0];

test('v4.7.0: the page in the brief\'s order — interests, formats, selected work, audience, principles, contact, consulting', () => {
  assert.deepEqual(Object.keys(S), ['interests', 'partnerships', 'examples', 'audience', 'principles', 'contact', 'consulting']);
  for (const [f] of PAGES) {
    const page = read(f);
    assert.deepEqual((page.match(/<section id="[a-z]+"/g) || []).map((m) => m.slice(13, -1)), Object.keys(S), f);
    assert.equal((page.match(/<h1 /g) || []).length, 1, `${f}: one h1`);
    for (const id of Object.keys(S)) assert.equal((section(page, id).match(/<h2 /g) || []).length, 1, `${f} #${id}: one h2`);
    assert.doesNotMatch(page, /v4-pricing|\$\s?\d/, `${f}: prices live on /consulting`);
  }
  for (const leaf of [c.hero.tagline, c.hero.lead, ...Object.values(S).map((s) => s.title)]) {
    assert.ok(String(leaf.ru).trim() && String(leaf.en).trim());
    assert.match(leaf.ru, /[а-яё]/i);
  }
});

test('the hero: who the owner is and what he looks for, ONE button — to the page\'s contact — and three figures', () => {
  assert.equal(c.hero.name.ru, 'Партнёрства и медиа');
  // v4.8.0 (owner): no employer on the page of personal collaboration — «a large tech company».
  assert.match(c.hero.tagline.ru, /^Я руковожу финтехом в крупной технологической компании/);
  assert.match(c.hero.tagline.en, /^I lead FinTech at a large tech company/);
  for (const [f] of PAGES) assert.doesNotMatch(read(f).split('</main>')[0], /Yandex|Яндекс/, `${f}: no employer named`);
  for (const [f, lang] of PAGES) {
    const hero = read(f).split('<section class="v4-hero')[1].split('</section>')[0];
    const buttons = hero.match(/<a class="v4-btn[^"]*"[^>]*>[^<]*<\/a>/g) || [];
    assert.deepEqual(buttons, [`<a class="v4-btn v4-btn-primary" href="#contact">${lang === 'en' ? 'Get in touch' : 'Предложить сотрудничество'}</a>`], f);
    // The figures come after the text and the button — on a phone too.
    assert.ok(hero.indexOf('v4-cta-row') < hero.indexOf('v4-stats--three'), f);
    assert.equal((hero.match(/class="v4-stat"/g) || []).length, 3, f);
  }
  // One LinkedIn figure in the hero, not two (v4.8.0): the third is Telegram Premium.
  assert.deepEqual(c.heroStats.map((x) => (x.total ? 'total' : x.value.ru)), ['total', '71%', '46%']);
  assert.match(c.heroStats[2].unit.ru, /Telegram Premium/);
  // The first figure is the total of the follows — the homepage's counters, Instagram included
  // (v4.7.0: the owner's 6 476 = Telegram + LinkedIn + YouTube + Instagram).
  assert.equal(c.heroStats[0].total, true);
  const live = { ...c, _live: { subscribers: { telegram: 1157, linkedin: 5012, youtube: 126, instagram: 181 } } };
  assert.match(renderers.collabHeroStats(live, 'ru'), new RegExp(`<div class="v4-stat-value">6${nb}476</div>\\s*<div class="v4-stat-unit">подписок в моих соцсетях</div>`));
  assert.match(renderers.collabHeroStats(live, 'en'), /<div class="v4-stat-value">6,476<\/div>/);
  // A live record without Instagram (before the ingest stored it) counts the doc's own value.
  const noIg = { ...c, _live: { subscribers: { telegram: 1157, linkedin: 5012, youtube: 126 } } };
  assert.match(renderers.collabHeroStats(noIg, 'ru'), new RegExp(`6${nb}476`));
  // …the same total the homepage shows.
  const home = { ...seed.home, _live: noIg._live };
  assert.equal(counters(home, 'ru').total, `6${nb}476`);
});

test('interests and formats: each item opens with its point in bold; no button in the formats — the page has one way to write', () => {
  assert.equal(S.interests.items.length, 6);
  assert.equal(S.partnerships.items.length, 7);
  for (const it of [...S.interests.items, ...S.partnerships.items]) {
    for (const lang of ['ru', 'en']) assert.match(it[lang], /^\*\*[^*]+\.\*\* \S/, `${lang}: ${it[lang].slice(0, 40)}`);
  }
  assert.match(S.interests.items[4].ru, /конфликт интересов/, 'FinTech says the conflict of interest');
  assert.match(S.interests.items[5].ru, /личное увлечение/, 'Outdoor is a personal interest');
  for (const [f, lang] of PAGES) {
    const page = read(f);
    assert.doesNotMatch(section(page, 'partnerships'), /class="v4-btn/, f);
    assert.match(section(page, 'interests'), new RegExp(`<div class="v4-more"><a href="${lang === 'en' ? '/en' : ''}/uses">`), `${f}: the stack`);
  }
  // No promise of coverage or of a positive review anywhere in the offer.
  assert.doesNotMatch(JSON.stringify(S.partnerships), /гарантир|guarantee/i);
});

test('selected work comes from the publications feed — notes by slug, external materials by address — never typed twice', () => {
  assert.deepEqual(S.examples.items.map((x) => x.slug || x.href), ['yubikey', 'airalo', 'https://youtu.be/OJXtFmWNZMM', 'https://youtu.be/BthlUR9eO1M', 'https://www.spot.uz/ru/2026/03/02/wolt-opinion/']);
  for (const x of S.examples.items) assert.deepEqual(Object.keys(x).length, 1, 'a reference, not a copy');
  const ext = seed.notes.external.map((e) => e.href);
  for (const x of S.examples.items.filter((i) => i.href)) assert.ok(ext.includes(x.href), x.href);
  const note = (slug, title) => ({ slug, date: '2025-12-07', title: { ru: title, en: title + ' EN' }, excerpt: { ru: 'x', en: 'x' } });
  const doc = { ...c, _articles: [note('yubikey', 'YubiKey'), note('airalo', 'Airalo')], _notes: seed.notes };
  const ru = renderers.collabExamples(doc, 'ru');
  assert.equal((ru.match(/<h3 class="v4-note-title">/g) || []).length, 5, 'five rows, titles under the section\'s h2');
  assert.ok(ru.indexOf('/notes/yubikey') < ru.indexOf('/notes/airalo') && ru.indexOf('/notes/airalo') < ru.indexOf('OJXtFmWNZMM'), 'the doc\'s order');
  // The static twin has no notes (KV): it shows the external materials it names.
  assert.equal((section(read('collaborate.html'), 'examples').match(/class="v4-note-item"/g) || []).length, 3);
  // A note without an English title stays off /en/.
  const untranslated = { ...doc, _articles: [{ ...note('yubikey', 'YubiKey'), title: { ru: 'YubiKey' } }] };
  assert.doesNotMatch(renderers.collabExamples(untranslated, 'en'), /yubikey/);
  // Under the rows: all the publications and the projects.
  assert.deepEqual(S.examples.more.map((m) => m.href.ru), ['/notes', '/#projects']);
});

test('the audience (v4.8.0): an infographic at a glance — where people follow (live), seniority, industries, cities (LinkedIn\'s, said so) — the reach in a line, the profiles to click through', () => {
  assert.deepEqual(Object.keys(S.audience.channels).sort(), ['instagram', 'linkedin', 'telegram', 'youtube']);
  assert.deepEqual(S.audience.groups.map((g) => g.kind || g.title.en), ['channels', 'Seniority · LinkedIn', 'Industries · LinkedIn', 'Cities · LinkedIn']);
  for (const g of S.audience.groups.slice(1)) assert.match(g.title.ru, /LinkedIn$/, 'a LinkedIn share says it is LinkedIn\'s');
  assert.match(S.audience.note.ru, /27 ноября 2026/);
  for (const src of ['LinkedIn', 'Telegram', 'TGStat', 'vc.ru', 'YouTube']) assert.ok(S.audience.note.ru.includes(src), src);
  const live = { ...c, _live: { subscribers: { telegram: 1161, linkedin: 5022, youtube: 126, instagram: 181 } } };
  const ru = renderers.collabAudience(live, 'ru');
  // Where people follow: the live counts, the bar of each the share of the largest.
  assert.match(ru, new RegExp(`<li class="v4-meter-row"><span class="v4-meter-label">LinkedIn</span><span class="v4-meter-value">5${nb}022</span><span class="v4-meter" aria-hidden="true"><span class="v4-meter-fill" style="width: 100%"></span></span></li>`));
  assert.match(ru, new RegExp(`<span class="v4-meter-label">Telegram</span><span class="v4-meter-value">1${nb}161</span><span class="v4-meter" aria-hidden="true"><span class="v4-meter-fill" style="width: 23%"></span>`));
  // A LinkedIn share: its figure beside its label, the bar scaled to the group's largest.
  assert.match(ru, /<span class="v4-meter-label">Москва<\/span><span class="v4-meter-value">15%<\/span><span class="v4-meter" aria-hidden="true"><span class="v4-meter-fill" style="width: 100%">/);
  assert.match(ru, /<span class="v4-meter-label">Ташкент<\/span><span class="v4-meter-value">14%<\/span><span class="v4-meter" aria-hidden="true"><span class="v4-meter-fill" style="width: 93%">/);
  // The profiles: every network the page counts, and vc.ru and GitHub — each opens in a new tab.
  const profiles = S.audience.profiles.map((p) => p.href);
  for (const host of ['linkedin.com/in/semyon-morgunov', 't.me/raschet7', 'instagram.com/semyon.morgunov', 'youtube.com/@semyon_morgunov', 'vc.ru/id679509', 'github.com/morgunovtech']) {
    assert.ok(profiles.some((h) => h.includes(host)), host);
  }
  for (const [f] of PAGES) {
    const links = section(read(f), 'audience').match(/<a\s[^>]*>/g) || [];
    assert.equal(links.length, S.audience.profiles.length, `${f}: the profiles are the section's only links`);
    for (const a of links) assert.match(a, /target="_blank" rel="noopener noreferrer"/, f);
  }
  // The page that shows the counts loads them and is purged when they arrive.
  assert.match(read('functions/api/ingest/subscribers.js'), /PAGE_PATHS\.collaborate/);
  assert.match(read('functions/_middleware.js'), /isHome \|\| isCollab \? loadSubscribers\(env\)/);
  assert.equal(renderers.collabAudience({ sections: {} }, 'ru'), '');
});

test('principles: disclosure, no guaranteed coverage, personal views — not the employer\'s; the conflict of interest', () => {
  assert.match(S.principles.prose.ru, /обозначаю/);
  assert.match(S.principles.prose.ru, /не гарантирует публикацию или положительный отзыв/);
  assert.match(S.principles.prose.ru, /не позицию работодателя/);
  assert.match(S.principles.prose.en, /not those of my employer/);
});

test('contact: ONE button — the e-mail with its subject; the address and Telegram as text to copy; where he lives and the languages', () => {
  for (const [f, lang] of PAGES) {
    const contact = section(read(f), 'contact');
    const buttons = contact.match(/class="v4-btn[^"]*"/g) || [];
    assert.equal(buttons.length, 1, f);
    const subject = lang === 'en' ? 'Partnership%20proposal' : encodeURIComponent('Предложение о сотрудничестве');
    assert.ok(contact.includes(`<a class="v4-btn v4-btn-primary" href="mailto:s@morgunov.tech?subject=${subject}">`), f);
    assert.match(contact, /<p class="v4-contact-alt"><a href="mailto:s@morgunov\.tech">s@morgunov\.tech<\/a> · [^<]*<a href="https:\/\/t\.me\/s_mrgnv"/, f);
    assert.match(contact, /<p class="v4-contact-reply">[^<]*(Ташкент|Tashkent)/, f);
    assert.equal((contact.match(/<li>/g) || []).length, 3, `${f}: the brief`);
  }
});

test('consulting: last, and quieter than the page\'s own contact — a line and a «more» link', () => {
  for (const [f, lang] of PAGES) {
    const sec = section(read(f), 'consulting');
    assert.doesNotMatch(sec, /class="v4-btn/, f);
    assert.match(sec, new RegExp(`<div class="v4-more"><a href="${lang === 'en' ? '/en' : ''}/consulting">`), f);
  }
});

test('no support link on the pages (v2.2.2, owner): GitHub Sponsors stays in llms.txt only', () => {
  assert.equal(seed.home.sections.products.support, undefined);
  for (const f of ['index.html', 'en/index.html', 'collaborate.html', 'en/collaborate.html', 'consulting.html', 'en/consulting.html', 'uses.html', 'en/uses.html', 'privacy.html', 'en/privacy.html', '404.html']) {
    assert.doesNotMatch(read(f), /github\.com\/sponsors|sections\.products\.support/, f);
  }
  const llms = read('llms.txt');
  assert.match(llms, /\[Partnerships & media\]\(https:\/\/s\.morgunov\.tech\/en\/collaborate#partnerships\)/);
  assert.match(llms, /\[GitHub Sponsors\]\(https:\/\/github\.com\/sponsors\/morgunovtech\) — voluntary/);
});

test('v2.0.0: /consulting holds what /collaborate held; /collaborate points to it last', () => {
  assert.deepEqual(Object.keys(seed.consulting.sections), ['about', 'consulting', 'work', 'contact']);
  for (const f of ['consulting.html', 'en/consulting.html']) {
    // The site menu (v3.0.0) links every page; the page itself keeps to its own URLs.
    const page = read(f).replace(/<header class="v4-bar"[\s\S]*?<\/header>/, '');
    assert.doesNotMatch(page, /\/collaborate/, `${f}: its own URLs only`);
    assert.doesNotMatch(page, /id="partnerships"/, f);
    assert.match(page, /"@type": "Service"/, f);
  }
  for (const f of ['collaborate.html', 'en/collaborate.html']) {
    assert.doesNotMatch(read(f), /"@type": "Service"|OfferCatalog/, `${f}: the Service is consulting's`);
    assert.match(read(f), /"@type": "BreadcrumbList"/, f);
  }
  // The route, the sitemap and the stored homepage link follow the move.
  assert.match(read('functions/_middleware.js'), /'\/consulting': \{ page: 'consulting', lang: 'ru' \}/);
  assert.match(read('functions/_lib/render-notes.js'), /loc: '\/en\/consulting'/);
  assert.equal(seed.home.sections.contact ? JSON.stringify(seed.home).includes('/collaborate#consulting') : false, false);
});
