// v1.7.0 — «Партнёрства и медиа» and the one support link on the homepage;
// v2.0.0 — the section is the /collaborate page itself, consulting moved to
// /consulting. The support link stays on
// the homepage. What the tests keep: the owner's wording, the limits he set
// (no prices, no audience numbers, no employer, nothing promised), the page's
// own contact, and that the support link reads as voluntary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderers } from '../functions/_lib/render.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const s = seed.collaborate.sections.partnerships;
const SPONSORS = 'https://github.com/sponsors/morgunovtech';

test('«Partnerships & Media»: the owner\'s text verbatim in English, a full Russian twin', () => {
  assert.equal(s.title.en, 'Partnerships & Media');
  assert.equal(s.prose.en, 'I welcome relevant opportunities to test products, provide independent feedback, visit manufacturing facilities and contribute to technology education. Editorial independence is non-negotiable; I do not accept guaranteed positive reviews or recurring posting quotas.');
  assert.deepEqual(s.items.map((i) => i.en), ['Independent product feedback', 'Review units', 'Beta programs', 'Press invitations', 'Open-source sponsorship']);
  for (const leaf of [s.title, s.prose, s.cta.label, ...s.items]) {
    assert.ok(String(leaf.ru).trim() && String(leaf.en).trim());
    assert.match(leaf.ru, /[а-яё]/i);
  }
  assert.match(s.prose.ru, /независимость/i);
});

test('the section is the page: no consulting blocks left, it sits before the contact block, under one h2, with one button to the page\'s contact', () => {
  for (const [f, lang] of [['collaborate.html', 'ru'], ['en/collaborate.html', 'en']]) {
    const page = read(f);
    const sec = page.split('<section id="partnerships"')[1].split('</section>')[0];
    assert.deepEqual((page.match(/<section id="[a-z]+"/g) || []).map((m) => m.slice(13, -1)), ['partnerships', 'contact'], f);
    assert.doesNotMatch(page, /v4-pricing|\$\s?\d/, `${f}: prices live on /consulting`);
    assert.equal((sec.match(/<h2 /g) || []).length, 1, f);
    assert.doesNotMatch(sec, /<h[13456]/, f);
    const links = sec.match(/<a\s[^>]*>/g) || [];
    assert.equal(links.length, 1, `${f}: one button in a block`);
    // The contact route of the page: Telegram, like every other button on it.
    assert.equal(links[0], '<a class="v4-btn" href="https://t.me/s_mrgnv" target="_blank" rel="noopener noreferrer">', f);
    assert.equal((sec.match(/<li>/g) || []).length, s.items.length, f);
    assert.ok(sec.includes(renderers.collabPartnerships(seed.collaborate, lang).split('<div class="v4-prose">')[1].split('</p>')[0].trim()), `${f}: the template is the seed's twin`);
  }
});

test('no rate card, no audience numbers, no employer, no promise of coverage', () => {
  const text = JSON.stringify(s);
  assert.doesNotMatch(text, /\d/, 'no prices, no audience figures');
  assert.doesNotMatch(text, /[$€₽]|usd|руб/i);
  assert.doesNotMatch(text, /yandex|яндекс|korzinka|корзинк/i);
  assert.doesNotMatch(text, /подписчик|followers|subscribers|охват|reach/i);
  // A doc saved before v1.7.0 has no such section: the slot renders empty, it does not throw.
  assert.equal(renderers.collabPartnerships({ sections: {} }, 'ru'), '');
});

test('no support link on the pages (v2.2.2, owner): GitHub Sponsors stays in llms.txt only', () => {
  assert.equal(seed.home.sections.products.support, undefined);
  for (const f of ['index.html', 'en/index.html', 'collaborate.html', 'en/collaborate.html', 'consulting.html', 'en/consulting.html', 'uses.html', 'en/uses.html', 'privacy.html', 'en/privacy.html', 'about.html', 'en/about.html', '404.html']) {
    assert.doesNotMatch(read(f), /github\.com\/sponsors|sections\.products\.support/, f);
  }
  const llms = read('llms.txt');
  assert.match(llms, /\[Partnerships & media\]\(https:\/\/s\.morgunov\.tech\/en\/collaborate#partnerships\)/);
  assert.match(llms, /\[GitHub Sponsors\]\(https:\/\/github\.com\/sponsors\/morgunovtech\) — voluntary/);
});

test('v2.0.0: /consulting holds what /collaborate held; /collaborate ends with one button to it', () => {
  assert.deepEqual(Object.keys(seed.collaborate.sections), ['partnerships', 'contact']);
  assert.deepEqual(Object.keys(seed.consulting.sections), ['about', 'consulting', 'strategy', 'work', 'contact']);
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
