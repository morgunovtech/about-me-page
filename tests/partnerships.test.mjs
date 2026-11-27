// /collaborate «Партнёрства и медиа». v1.7.0 — the section; v2.0.0 — the page;
// v4.7.0–v4.8.0 — the owner's first brief; v4.9.0 — the brief v2 of
// 2026-11-27: the page of an interesting person brands want to meet, not of
// one looking for advertisers. Six parts, short copy, a portrait, cards of
// real use and real work, the audience compact with its demography folded,
// two ways to write. What the tests keep: that order and its limits (no
// prices, no inbound brief, no long formats), the figures with their sources,
// the counts from the homepage's counters, the bars on a 0–100% scale, the
// selected work taken from the publications feed, the old anchors alive.
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

test('v4.9.0: six parts — the hero, interests, formats, selected work, audience, contact — and no other section', () => {
  assert.deepEqual(Object.keys(S), ['interests', 'partnerships', 'examples', 'audience', 'contact']);
  for (const [f] of PAGES) {
    const page = read(f);
    assert.deepEqual((page.match(/<section id="[a-z]+"/g) || []).map((m) => m.slice(13, -1)), Object.keys(S), f);
    assert.equal((page.match(/<h1 /g) || []).length, 1, `${f}: one h1`);
    assert.doesNotMatch(page, /v4-onpage/, `${f}: no on-page line`);
    assert.doesNotMatch(page, /v4-pricing|\$\s?\d/, `${f}: prices live on /consulting`);
    // The old anchors land somewhere: the editorial terms and the way to consulting.
    for (const id of ['principles', 'consulting']) assert.match(section(page, 'contact'), new RegExp(`id="${id}"`), `${f} #${id}`);
  }
  assert.equal(c.heroStats, undefined, 'no figures in the hero');
});

test('the hero: who he is in two short paragraphs, a real portrait, «Связаться со мной →» and «Чем я пользуюсь →»', () => {
  assert.match(c.hero.tagline.ru, /^Руковожу финтехом в Yandex Uzbekistan, разрабатываю open source сервисы/);
  assert.match(c.hero.tagline.en, /^I lead fintech at Yandex Uzbekistan, build open source services/);
  for (const [f, lang] of PAGES) {
    const hero = read(f).split('<section class="v4-hero')[1].split('</section>')[0];
    const buttons = hero.match(/<a class="v4-btn[^"]*"[^>]*>[^<]*<\/a>/g) || [];
    assert.deepEqual(buttons, lang === 'en'
      ? ['<a class="v4-btn v4-btn-primary" href="#contact">Get in touch →</a>', '<a class="v4-btn" href="/en/uses">What I use →</a>']
      : ['<a class="v4-btn v4-btn-primary" href="#contact">Связаться со мной →</a>', '<a class="v4-btn" href="/uses">Чем я пользуюсь →</a>'], f);
    assert.match(hero, /<img class="v4-portrait"[^>]*src="\/images\/Hero_Photo_640\.webp"[^>]*alt="(Портрет Семёна Моргунова|Portrait of Semyon Morgunov)"[^>]*loading="eager"/, f);
    assert.doesNotMatch(hero, /v4-stat/, `${f}: no figures on the first screen`);
  }
});

test('interests: four scenes of real use, a name and one line each; formats: six short lines', () => {
  assert.equal(S.interests.items.length, 4);
  for (const it of S.interests.items) {
    for (const lang of ['ru', 'en']) assert.ok(pick(it.text, lang).split(' ').length <= 9, `${lang}: one short line`);
  }
  assert.doesNotMatch(JSON.stringify(S.interests), /личное увлечение|personal interest/);
  assert.equal(S.partnerships.items.length, 6);
  for (const it of S.partnerships.items) for (const lang of ['ru', 'en']) assert.ok(it[lang].split(' ').length <= 12, `${lang}: ${it[lang]}`);
  assert.match(S.partnerships.items[0].ru, /^Тест-драйвы/);
  assert.match(S.partnerships.items[2].ru, /съёмки и пользовательские истории для медиа и брендов/, 'the brand\'s own content');
  for (const [f] of PAGES) assert.doesNotMatch(section(read(f), 'partnerships'), /class="v4-btn/, f);
  // Each scene shows the owner's own photo, with an alt that says what is in it (a photo that
  // says something is not decoration); a card without one would show no frame at all.
  const interests = section(read('collaborate.html'), 'interests');
  assert.equal((interests.match(/<div class="v4-card-photo"><img src="\/images\/collaborate\/[a-z]+\.webp" alt="[^"]+"/g) || []).length, 4);
  const bare = { ...c, sections: { ...S, interests: { ...S.interests, items: [{ title: { ru: 'x' }, text: { ru: 'y' } }] } } };
  assert.doesNotMatch(renderers.collabInterests(bare, 'ru'), /v4-card-photo/);
});

const pick = (v, lang) => (v && typeof v === 'object' ? v[lang] : v);

test('selected work: four cards picked from the publications feed by slug or address, a video with the owner in the frame among them', () => {
  assert.deepEqual(S.examples.items.map((x) => x.slug || x.href), ['yubikey', 'https://youtu.be/BthlUR9eO1M', 'airalo', 'icloud-pmf']);
  for (const x of S.examples.items) assert.equal(Object.keys(x).length, 1, 'a reference, not a copy');
  const talk = seed.notes.external.find((e) => e.href === 'https://youtu.be/BthlUR9eO1M');
  assert.equal(talk.cover.src, '/images/notes/clickdata-korzinka-go.webp', 'the talk\'s picture lives on the site');
  const note = (slug, cover) => ({ slug, date: '2025-12-07', title: { ru: slug, en: slug + ' EN' }, ...(cover ? { cover: { src: cover } } : {}) });
  const doc = { ...c, _articles: [note('yubikey', '/images/notes/yubikey-5c-nfc.webp'), note('airalo'), note('icloud-pmf')], _notes: seed.notes };
  const ru = renderers.collabExamples(doc, 'ru');
  assert.equal((ru.match(/<article class="v4-product v4-work">/g) || []).length, 4);
  assert.equal((ru.match(/class="v4-card-photo"/g) || []).length, 2, 'pictures where the material has one');
  assert.ok(ru.indexOf('/notes/yubikey') < ru.indexOf('BthlUR9eO1M') && ru.indexOf('BthlUR9eO1M') < ru.indexOf('/notes/airalo'), 'the doc\'s order');
  assert.match(ru, /<p class="v4-work-meta">Видео · <time datetime="2025-06-26">26 июня 2025<\/time><\/p>/);
  assert.match(ru, new RegExp(`3${nb}600\\+ просмотров`));
  // The talk's picture is a file of the site: no request to YouTube for it.
  assert.doesNotMatch(read('collaborate.html'), /ytimg|youtube\.com\/embed/);
  assert.deepEqual(S.examples.more.map((m) => m.href.ru), ['/notes', '/#projects']);
  assert.match(S.examples.prose.ru, /сертифицированным тренером Apple/);
});

test('the audience: the total of follows (live) and two shares; a row a platform, the name its profile; the demography folded, its bars on a 0–100% scale', () => {
  assert.deepEqual(Object.keys(S.audience.channels).sort(), ['instagram', 'linkedin', 'telegram', 'youtube']);
  assert.deepEqual(S.audience.platforms.map((p) => p.name), ['LinkedIn', 'Telegram', 'Instagram', 'YouTube', 'vc.ru', 'GitHub']);
  const live = { ...c, _live: { subscribers: { telegram: 1161, linkedin: 5022, youtube: 126, instagram: 181 } } };
  const ru = renderers.collabAudience(live, 'ru');
  assert.match(ru, new RegExp(`<div class="v4-stat-value">6${nb}490</div>\\s*<div class="v4-stat-unit">подписок на четырёх площадках</div>`));
  assert.match(ru, new RegExp(`<a class="v4-platform-name" href="https://www.linkedin.com/in/semyon-morgunov/" target="_blank" rel="noopener noreferrer">LinkedIn<span class="sr-only"> \\(откроется в новой вкладке\\)</span></a><span class="v4-platform-count">5${nb}022</span>`));
  // vc.ru and GitHub: no follows are claimed.
  assert.match(ru, /vc\.ru<span class="sr-only">[^<]*<\/span><\/a><span class="v4-platform-count"><\/span>/);
  // Folded, and the bars say the share itself: 26% is 26% of the width.
  assert.match(ru, /<details class="v4-aud-details">\s*<summary>Подробнее об аудитории<\/summary>/);
  assert.doesNotMatch(ru, /<details[^>]* open/);
  assert.match(ru, /<span class="v4-meter-label">Senior-специалисты<\/span><span class="v4-meter-value">26%<\/span><span class="v4-meter" aria-hidden="true"><span class="v4-meter-fill" style="width: 26%"><\/span>/);
  assert.match(ru, /<span class="v4-meter-label">Москва<\/span><span class="v4-meter-value">15%<\/span><span class="v4-meter" aria-hidden="true"><span class="v4-meter-fill" style="width: 15%">/);
  // The 71% is the sum of LinkedIn's levels but entry and training — every one of them shown.
  const levels = S.audience.details.groups[0].rows.map((r) => r.share);
  assert.equal(levels.reduce((a, b) => a + b, 0) - 15, 71);
  assert.match(S.audience.note.ru, /27 ноября 2026/);
  assert.match(S.audience.note.ru, /не равны числу уникальных людей/);
  // The total is the homepage's.
  const home = { ...seed.home, _live: { subscribers: { telegram: 1161, linkedin: 5022, youtube: 126, instagram: 181 } } };
  assert.equal(counters(home, 'ru').total, `6${nb}490`);
  assert.match(read('functions/api/ingest/subscribers.js'), /PAGE_PATHS\.collaborate/);
  assert.match(read('functions/_middleware.js'), /isHome \|\| isCollab \? loadSubscribers\(env\)/);
  assert.equal(renderers.collabAudience({ sections: {} }, 'ru'), '');
});

test('contact: «Давайте знакомиться» — e-mail and Telegram, the address and the handle to copy, the place, two short lines of terms; no brief asked of the partner', () => {
  for (const [f, lang] of PAGES) {
    const contact = section(read(f), 'contact');
    const buttons = contact.match(/<a class="v4-btn[^"]*"[^>]*>[^<]*<\/a>/g) || [];
    const subject = lang === 'en' ? 'Hello' : encodeURIComponent('Знакомство');
    assert.deepEqual(buttons, [
      `<a class="v4-btn v4-btn-primary" href="mailto:s@morgunov.tech?subject=${subject}">${lang === 'en' ? 'Email me' : 'Написать на почту'}</a>`,
      `<a class="v4-btn" href="https://t.me/s_mrgnv" target="_blank" rel="noopener noreferrer">${lang === 'en' ? 'Message me on Telegram' : 'Написать в Telegram'}</a>`,
    ], f);
    assert.match(contact, /<p class="v4-contact-alt"><a href="mailto:s@morgunov\.tech">s@morgunov\.tech<\/a> · <a href="https:\/\/t\.me\/s_mrgnv"/, f);
    assert.match(contact, /(Ташкент, Узбекистан|Tashkent, Uzbekistan) · RU \/ EN/, f);
    assert.doesNotMatch(contact, /<li>|Почему считаете|Why you think/, `${f}: no brief`);
    assert.match(contact, new RegExp(`id="consulting">[^<]*<a href="${lang === 'en' ? '/en' : ''}/consulting">`), f);
  }
  assert.match(S.contact.policy.ru, /не позицию работодателя/);
  assert.doesNotMatch(JSON.stringify(c), /не обсуждается|non-negotiable/, 'no defensive wording');
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

test('v2.0.0: /consulting holds what /collaborate held', () => {
  assert.deepEqual(Object.keys(seed.consulting.sections), ['about', 'consulting', 'work', 'contact']);
  for (const f of ['consulting.html', 'en/consulting.html']) {
    const page = read(f).replace(/<header class="v4-bar"[\s\S]*?<\/header>/, '');
    assert.doesNotMatch(page, /\/collaborate/, `${f}: its own URLs only`);
    assert.doesNotMatch(page, /id="partnerships"/, f);
    assert.match(page, /"@type": "Service"/, f);
  }
  for (const f of ['collaborate.html', 'en/collaborate.html']) {
    assert.doesNotMatch(read(f), /"@type": "Service"|OfferCatalog/, `${f}: the Service is consulting's`);
    assert.match(read(f), /"@type": "BreadcrumbList"/, f);
  }
  assert.match(read('functions/_middleware.js'), /'\/consulting': \{ page: 'consulting', lang: 'ru' \}/);
  assert.match(read('functions/_lib/render-notes.js'), /loc: '\/en\/consulting'/);
});
