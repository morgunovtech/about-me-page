// v1.6.0 — /privacy: the owner's privacy tools and «Джентльменский набор».
// The page recommends software to strangers, so its promises are checks:
// every card of the kit is open source AND has a published independent audit,
// each proof is a link to a primary source, the button is the official site,
// and nothing on the page is a referral link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderers } from '../functions/_lib/render.js';
import { renderPageJsonLd } from '../functions/_lib/jsonld.js';
import { PAGE_PATHS } from '../functions/_lib/cache.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const doc = seed.privacy;
const kitItems = () => doc.sections.kit.groups.flatMap((g) => g.items);
const LANGS = ['ru', 'en'];
// Query parameters that pay someone for a click.
const REFERRAL = /[?&](ref|referral|aff|affiliate|utm_[a-z]+|coupon|promo|via|partner)=/i;

test('/privacy is a managed page like /collaborate: route, KV doc, cache, sitemap, admin, checks', () => {
  // content.js imports the seed without an import attribute (the Functions bundler's form), so read it.
  assert.match(read('functions/_lib/content.js'), /PAGES = new Set\(\[[^\]]*'privacy'/);
  assert.deepEqual(PAGE_PATHS.privacy, ['/privacy', '/en/privacy', '/sitemap.xml']);
  const mw = read('functions/_middleware.js');
  assert.match(mw, /'\/privacy': \{ page: 'privacy', lang: 'ru' \}/);
  assert.match(mw, /'\/en\/privacy': \{ page: 'privacy', lang: 'en' \}/);
  assert.match(read('functions/_lib/render-notes.js'), /loc: '\/en\/privacy'/);
  assert.match(read('functions/admin/api/preview.js'), /privacy: \{ ru: '\/privacy\.html', en: '\/en\/privacy\.html' \}/);
  assert.match(read('functions/admin/index.js'), /<option value="privacy">privacy<\/option>/);
  for (const s of ['scripts/check-sync.py', 'scripts/check-critical.py', 'scripts/render-static.mjs', 'scripts/version-stamp.py']) {
    assert.match(read(s), /en\/privacy\.html/, s);
  }
  assert.match(read('scripts/kv-push.mjs'), /'privacy'/);
});

test('the bar points at real sections; the language menu at the twin page', () => {
  for (const [f, lang] of [['privacy.html', 'ru'], ['en/privacy.html', 'en']]) {
    const page = read(f);
    const nav = /<div class="v4-bar-mid" id="site-nav">([\s\S]*?)<\/div>/.exec(page)[1];
    for (const [, id] of nav.matchAll(/href="#([a-z]+)"/g)) assert.match(page, new RegExp(`<section id="${id}" class="v4-section">`), `${f} #${id}`);
    assert.match(page, /<a class="v4-menu-item v4-lang-link" role="menuitemradio" aria-checked="(true|false)" href="\/privacy" hreflang="ru"/, f);
    assert.match(page, /href="\/en\/privacy" hreflang="en"/, f);
    assert.match(page, new RegExp(`<link rel="canonical" href="https://s\\.morgunov\\.tech${lang === 'en' ? '/en' : ''}/privacy" />`), f);
    assert.doesNotMatch(page, /collaborate/, `${f}: nothing left of the page it was cut from`);
  }
});

test('«Мои инструменты»: the live tools read as on the homepage; Good Pass is a pale card with no way in', () => {
  const tools = doc.sections.tools.items;
  const home = Object.fromEntries(seed.home.sections.products.items.map((it) => [it.repo, it]));
  const live = tools.filter((it) => !it.soon);
  assert.deepEqual(live.map((it) => it.name), ['Fingerprint', 'Found You']);
  for (const it of live) {
    // sync-products.mjs writes both; a hand edit on one page only is a drift.
    assert.equal(it.version, home[it.repo].version, it.name);
    assert.deepEqual(it.desc, home[it.repo].desc, it.name);
    assert.deepEqual(it.cta, home[it.repo].cta, it.name);
  }
  const soon = tools.filter((it) => it.soon);
  assert.deepEqual(soon.map((it) => it.name), ['Good Pass']);
  assert.equal(soon[0].repo, undefined, 'no repo: the sync and the subbotnik leave the soon card alone');
  for (const lang of LANGS) {
    const html = renderers.privacyTools(doc, lang);
    const card = html.slice(html.indexOf('v4-product--soon'));
    assert.match(card, lang === 'en' ? /<span>Soon<\/span>/ : /<span>Скоро<\/span>/);
    assert.doesNotMatch(card, /<a |v4-btn|good-pass|v4-live-dot/, `${lang}: the soon card has no link, no button, no live dot`);
    assert.equal((html.match(/v4-live-dot/g) || []).length, 2, lang);
  }
});

test('«Джентльменский набор»: open source, a published independent audit, the official site — every card', () => {
  const items = kitItems();
  assert.ok(items.length >= 10, `${items.length} cards`);
  const https = (h) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(String(h));
  for (const it of items) {
    const name = it.name;
    assert.ok(it.audits && it.audits.length >= 1, `${name}: an audit`);
    for (const a of it.audits) {
      assert.ok(https(a.href), `${name}: audit link ${a.href}`);
      // «Cure53, 2025»: who audited and when, in both languages.
      for (const l of LANGS) assert.match(typeof a.label === 'string' ? a.label : a.label[l], /\b20\d\d\b/, `${name}: the audit says its year`);
    }
    assert.ok(it.source && https(it.source.href), `${name}: source code`);
    assert.ok(it.cta && https(it.cta.href), `${name}: official site`);
    // The button names the domain it leads to, so a reader sees where it goes.
    const host = new URL(it.cta.href).hostname.replace(/^www\./, '');
    for (const l of LANGS) assert.equal(it.cta.label[l], `${host} →`, `${name}: the button reads its domain`);
    for (const l of LANGS) {
      for (const k of ['tag', 'price', 'desc', 'platforms']) assert.ok(String(it[k] && it[k][l]).trim(), `${name}: ${k}.${l}`);
    }
    for (const alt of it.alternatives || []) assert.ok(https(alt.href), `${name}: alternative ${alt.href}`);
  }
  // One product, one card.
  assert.equal(new Set(items.map((it) => it.name)).size, items.length);
  assert.doesNotMatch(JSON.stringify(doc), REFERRAL, 'no referral links on /privacy');
});

test('kit cards render the proof as off-site links with «↗» and one button', () => {
  for (const lang of LANGS) {
    const html = renderers.privacyKit(doc, lang);
    const cards = html.split('<article class="v4-product"').slice(1);
    assert.equal(cards.length, kitItems().length, lang);
    for (const c of cards) {
      assert.equal((c.match(/class="v4-btn/g) || []).length, 1, 'one button in a card');
      assert.match(c, /<dl class="v4-spec v4-spec--card"><dt>(Аудит|Audit)<\/dt>/);
      const dd = (c.match(/<dd>[\s\S]*?<\/dd>/g) || []).join('');
      for (const [a] of dd.matchAll(/<a [^>]*>/g)) assert.match(a, /target="_blank" rel="noopener noreferrer"/);
      assert.equal((dd.match(/<a /g) || []).length, (dd.match(/&nbsp;↗<\/span><span class="sr-only">/g) || []).length, 'every off-site link says so');
    }
    assert.match(html, /<p class="v4-terms">/, 'the date the list was checked');
  }
});

test('JSON-LD: the page, a breadcrumb and the kit as an ItemList of the official sites', () => {
  for (const lang of LANGS) {
    const g = JSON.parse(renderPageJsonLd(doc, lang, 'privacy'))['@graph'];
    const page = g.find((n) => n['@type'] === 'WebPage');
    assert.equal(page.url, `https://s.morgunov.tech${lang === 'en' ? '/en' : ''}/privacy`);
    assert.ok(g.find((n) => n['@type'] === 'BreadcrumbList'));
    const list = g.find((n) => n['@type'] === 'ItemList');
    assert.equal(page.mainEntity['@id'], list['@id']);
    assert.deepEqual(list.itemListElement.map((e) => e.item.url), kitItems().map((it) => it.cta.href));
  }
  for (const f of ['privacy.html', 'en/privacy.html']) assert.match(read(f), /"@type": "ItemList"/, f);
});

test('the page is in llms.txt and the sitemap, and is indexable', () => {
  const llms = read('llms.txt');
  assert.match(llms, /- Privacy \(RU\): https:\/\/s\.morgunov\.tech\/privacy$/m);
  assert.match(llms, /- Privacy \(EN\): https:\/\/s\.morgunov\.tech\/en\/privacy$/m);
  for (const f of ['privacy.html', 'en/privacy.html']) assert.doesNotMatch(read(f), /name="robots" content="noindex"/, f);
});

test('Sonar counts no copy-paste in the page templates, and its settings are not served', () => {
  // Every page repeats the head, the bar and the footer by design (no build step);
  // check-sync and the composition tests keep those twins, not Sonar.
  assert.match(read('.sonarcloud.properties'), /^sonar\.cpd\.exclusions=\*\*\/\*\.html$/m);
  assert.match(read('functions/_middleware.js'), /'\/\.sonarcloud\.properties',/);
});
