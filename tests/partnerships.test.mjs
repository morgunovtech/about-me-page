// v1.7.0 — «Партнёрства и медиа» and the one support link on the homepage;
// v2.0.0 — the section is the /collaborate page itself, consulting moved to
// /consulting; v4.6.0 — the first outside reader did not see what the page was
// about: it says whom it is for, the formats open with their point in bold, and
// a section «Аудитория» gives who reads, in figures (owner, 2026-11-27). What
// the tests keep: the owner's independence terms verbatim, the limits he set
// for the offer (no prices, no employer, nothing promised), the figures in
// their own section with the counts live, the page's own contact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderers } from '../functions/_lib/render.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const s = seed.collaborate.sections.partnerships;
const a = seed.collaborate.sections.audience;
const SPONSORS = 'https://github.com/sponsors/morgunovtech';

test('«What we can do together»: whom the page is for, the formats with their point in bold, the owner\'s independence terms verbatim', () => {
  assert.equal(s.title.en, 'What we can do together');
  assert.equal(s.outro.en, 'Editorial independence is non-negotiable; I do not accept guaranteed positive reviews or recurring posting quotas.');
  assert.match(s.outro.ru, /независимость не обсуждается/i);
  assert.match(seed.collaborate.hero.tagline.ru, /^Для компаний, PR-команд и организаторов событий/);
  for (const it of s.items) {
    for (const lang of ['ru', 'en']) assert.match(it[lang], /^\*\*[^*]+\.\*\* \S/, `${lang}: the point first, in bold`);
  }
  for (const leaf of [s.title, s.prose, s.outro, s.cta.label, ...s.items]) {
    assert.ok(String(leaf.ru).trim() && String(leaf.en).trim());
    assert.match(leaf.ru, /[а-яё]/i);
  }
});

test('the page: the offer, then the audience, then the contact — one h2 each, one button in the offer', () => {
  for (const [f, lang] of [['collaborate.html', 'ru'], ['en/collaborate.html', 'en']]) {
    const page = read(f);
    const sec = page.split('<section id="partnerships"')[1].split('</section>')[0];
    assert.deepEqual((page.match(/<section id="[a-z]+"/g) || []).map((m) => m.slice(13, -1)), ['partnerships', 'audience', 'contact'], f);
    assert.doesNotMatch(page, /v4-pricing|\$\s?\d/, `${f}: prices live on /consulting`);
    assert.equal((sec.match(/<h2 /g) || []).length, 1, f);
    assert.doesNotMatch(sec, /<h[13456]/, f);
    const links = sec.match(/<a\s[^>]*>/g) || [];
    assert.equal(links.length, 1, `${f}: one button in a block`);
    // The contact route of the page: Telegram, like every other button on it.
    assert.equal(links[0], '<a class="v4-btn" href="https://t.me/s_mrgnv" target="_blank" rel="noopener noreferrer">', f);
    // …and the only one: the hero has no button of its own. The same button stood there too,
    // twice within one screen.
    const hero = page.split('<section class="v4-hero')[1].split('</section>')[0];
    assert.doesNotMatch(hero, /class="v4-btn/, `${f}: no button in the hero`);
    assert.equal(seed.collaborate.hero.ctas[lang], '', `${f}: no stored hero button`);
    assert.equal((sec.match(/<li>/g) || []).length, s.items.length, f);
    assert.ok(sec.includes(renderers.collabPartnerships(seed.collaborate, lang).split('<div class="v4-prose">')[1].split('</p>')[0].trim()), `${f}: the template is the seed's twin`);
    const aud = page.split('<section id="audience"')[1].split('</section>')[0];
    // Figures, not links — but for one «more» link to the publications feed (v4.6.2), where
    // every article and talk the «Публикации» item counts can be checked.
    assert.deepEqual(aud.match(/<a\s[^>]*>/g), [`<a href="${lang === 'en' ? '/en' : ''}/notes">`], `${f}: one link, to the feed`);
    assert.equal((aud.match(/class="v4-stat"/g) || []).length, a.figures.length, f);
  }
});

test('the offer has no rate card, no audience figures, no employer, no promise of coverage', () => {
  const text = JSON.stringify(s);
  assert.doesNotMatch(text, /\d/, 'no prices, no figures: they are «Аудитория»\'s');
  assert.doesNotMatch(text, /[$€₽]|usd|руб/i);
  assert.doesNotMatch(text, /yandex|яндекс|korzinka|корзинк/i);
  assert.doesNotMatch(text, /подписчик|followers|subscribers|охват|reach/i);
  // A doc saved before v1.7.0 has no such section: the slot renders empty, it does not throw.
  assert.equal(renderers.collabPartnerships({ sections: {} }, 'ru'), '');
});

test('«Аудитория» (v4.6.0): the counts are live from the same counters as the homepage, the rest says where it comes from and when', () => {
  assert.doesNotMatch(JSON.stringify(a), /yandex|яндекс|korzinka|корзинк/i, 'no employer, past or present');
  assert.match(a.note.ru, /LinkedIn/);
  assert.match(a.note.ru, /TGStat/);
  assert.match(a.note.ru, /2026/);
  assert.deepEqual(a.figures.filter((f) => f.channel).map((f) => f.channel), ['telegram', 'linkedin']);
  // Live numbers win over the doc's own, and the Russian noun follows the number.
  const live = { ...seed.collaborate, _live: { subscribers: { telegram: 1161, linkedin: 5022, youtube: 126 } } };
  const ru = renderers.collabAudience(live, 'ru');
  assert.match(ru, /<div class="v4-stat-value">1\u00a0161<\/div>\s*<div class="v4-stat-unit">подписчик в Telegram<\/div>/);
  assert.match(ru, /<div class="v4-stat-value">5\u00a0022<\/div>\s*<div class="v4-stat-unit">подписчика в LinkedIn<\/div>/);
  const en = renderers.collabAudience(live, 'en');
  assert.match(en, /<div class="v4-stat-value">1,161<\/div>\s*<div class="v4-stat-unit">Telegram subscribers<\/div>/);
  // Without KV the doc's own counts render (the static twin).
  assert.match(renderers.collabAudience(seed.collaborate, 'ru'), /<div class="v4-stat-value">1\u00a0158<\/div>/);
  // The page that shows them is purged when the counts arrive, and loads them.
  assert.match(read('functions/api/ingest/subscribers.js'), /PAGE_PATHS\.collaborate/);
  assert.match(read('functions/_middleware.js'), /route\.page === 'collaborate' \? loadSubscribers\(env\)/);
  assert.equal(renderers.collabAudience({ sections: {} }, 'ru'), '');
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

test('v2.0.0: /consulting holds what /collaborate held; /collaborate ends with one button to it', () => {
  assert.deepEqual(Object.keys(seed.collaborate.sections), ['partnerships', 'audience', 'contact']);
  assert.deepEqual(Object.keys(seed.consulting.sections), ['about', 'consulting', 'work', 'contact']);
  const c = seed.collaborate.sections.contact;
  assert.deepEqual(c.ctas.map((x) => x.href), [{ ru: '/consulting', en: '/en/consulting' }]);
  for (const [lang, href] of [['ru', '/consulting'], ['en', '/en/consulting']]) {
    const html = renderers.collabContact(seed.collaborate, lang);
    assert.ok(html.includes(`<a class="v4-btn v4-btn-primary" href="${href}">`), lang);
    assert.doesNotMatch(html, /target="_blank"/, 'a page of this site opens in place');
  }
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
