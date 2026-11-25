// v1.6.0 — /privacy: the owner's privacy tools and «Джентльменский набор».
// The page recommends software to strangers, so its promises are checks:
// every card of the kit is open source AND has a published independent audit,
// each proof is a link to a primary source, the button is the official site,
// and nothing on the page is a referral link.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderers, privacyRepos } from '../functions/_lib/render.js';
import { fillFromSeed, SEED_FILL } from '../functions/_lib/migrations.js';
import { renderPageJsonLd } from '../functions/_lib/jsonld.js';
import { PAGE_PATHS } from '../functions/_lib/cache.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
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
  const unaudited = new Set(doc.sections.kit.groups.filter((g) => g.unaudited).flatMap((g) => g.items));
  for (const it of items) {
    const name = it.name;
    // Only a card in the marked group may come without an audit — and it must.
    if (unaudited.has(it)) assert.deepEqual(it.audits, [], `${name}: the unaudited group has no audits`);
    else assert.ok(it.audits && it.audits.length >= 1, `${name}: an audit`);
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

test('the homepage: the /privacy link introduces the privacy tools in «Работает», the GitHub link comes after (v2.2.2)', () => {
  for (const [f, lang] of [['index.html', 'ru'], ['en/index.html', 'en']]) {
    const projects = read(f).split('id="projects"')[1].split('</section>')[0];
    const href = lang === 'en' ? '/en/privacy' : '/privacy';
    const label = seed.home.sections.products.privacy.label[lang];
    const link = `<div class="v4-more"><a href="${href}"><span>${label}</span><span aria-hidden="true">&nbsp;→</span></a></div>`;
    assert.ok(projects.includes(link), f);
    const at = (s) => projects.indexOf(s);
    // Bots, then the link, then the two privacy tools in a grid of their own, then GitHub.
    assert.ok(at('>TofsDevOps<') < at(link) && at(link) < at('>Found You<') && at('>Found You<') < at('>Fingerprint<'), f);
    assert.ok(at('>Fingerprint<') < at('sections.products.more.href'), f);
    assert.equal((projects.match(/<div class="v4-products">/g) || []).length, 2, f);
    assert.equal(seed.home.sections.products.privacy.href[lang], href);
  }
  // Which products are privacy tools comes from the /privacy doc; without it, one grid and no link inside.
  assert.deepEqual(privacyRepos(seed.privacy), ['morgunovtech/Fingerprint', 'morgunovtech/FoundYou']);
  const one = renderers.products({ sections: { products: seed.home.sections.products } }, 'ru', false);
  assert.equal((one.match(/<div class="v4-products">/g) || []).length, 1);
  assert.doesNotMatch(one, /v4-more/);
  for (const f of ['functions/_middleware.js', 'functions/admin/api/preview.js', 'scripts/render-static.mjs']) {
    assert.match(read(f), /_privacyRepos = privacyRepos\(/, f);
  }
});

test('the one exception — an ad blocker without an audit — is marked, last, and says why', () => {
  const groups = doc.sections.kit.groups;
  const marked = groups.filter((g) => g.unaudited);
  assert.equal(marked.length, 1);
  assert.equal(groups.at(-1), marked[0], 'the exception comes after every audited group');
  for (const lang of LANGS) {
    assert.ok(String(marked[0].note[lang]).trim(), `${lang}: the group says why it is there`);
    assert.match(doc.sections.kit.prose[lang], lang === 'en' ? /One exception/ : /Одно исключение/, `${lang}: the intro names the exception`);
    const html = renderers.privacyKit(doc, lang);
    const tail = html.slice(html.lastIndexOf('<h3 class="v4-h3">'));
    assert.match(tail, /^<h3 class="v4-h3">[^<]+<\/h3>\s*<div class="v4-prose"><p>/, lang);
    assert.match(tail, lang === 'en' ? /<dt>Audit<\/dt><dd>none published<\/dd>/ : /<dt>Аудит<\/dt><dd>публичного нет<\/dd>/, lang);
    assert.equal((html.match(/публичного нет|none published/g) || []).length, marked[0].items.length, `${lang}: only the marked cards`);
  }
  // DNS made it into the audited part, and Mullvad's public DNS (shut down on 2 Nov 2026) did not.
  const audited = groups.filter((g) => !g.unaudited).flatMap((g) => g.items).map((it) => it.name);
  assert.ok(audited.includes('modDNS'));
  assert.doesNotMatch(JSON.stringify(doc), /dns\.mullvad\.net/);
});

test('/privacy has its own share card: the family template, 1200×630, per language', () => {
  for (const lang of LANGS) {
    const path = `/images/og-card-privacy-${lang}.png`;
    assert.equal(doc.share.image[lang], path);
    // A PNG's IHDR holds the size: the card is the Open Graph 1200×630.
    const png = readFileSync(new URL('..' + path, import.meta.url));
    assert.equal(png.subarray(1, 4).toString('latin1'), 'PNG');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], path);
    const page = read(lang === 'en' ? 'en/privacy.html' : 'privacy.html');
    for (const tag of ['property="og:image"', 'name="twitter:image"']) {
      assert.ok(page.includes(`<meta ${tag} data-cms-abs="share.image" content="https://s.morgunov.tech${path}" />`), `${lang}: ${tag}`);
    }
  }
  // The site's own cards stay on the other pages.
  assert.equal(seed.home.share.image.ru, '/images/og-card-ru.png');
});

test('«Статьи»: the notes the doc names, in its order; English only once translated; a note change refreshes /privacy', async () => {
  const { NOTES_PATHS } = await import('../functions/_lib/cache.js');
  assert.ok(NOTES_PATHS.includes('/privacy') && NOTES_PATHS.includes('/en/privacy'));
  assert.match(read('functions/_middleware.js'), /route\.page === 'privacy' \? loadPublishedArticles\(env\) : null/);
  assert.match(read('functions/admin/api/preview.js'), /if \(page === 'privacy'\) doc\._articles = await loadPublishedArticles\(env\);/);
  // v2.2.0: the section follows a topic — every published note tagged with it, newest first.
  assert.equal(doc.sections.articles.topic, 'privacy');
  assert.equal(doc.sections.articles.items, undefined);
  const d = structuredClone(doc);
  d._articles = [
    { slug: 'second', date: '2025-07-15', title: { ru: 'Вторая', en: '' }, status: 'published', tags: ['privacy'] },
    { slug: 'other', date: '2025-07-01', title: { ru: 'Другая', en: 'Other' }, status: 'published', tags: ['management'] },
    { slug: 'first', date: '2025-06-01', title: { ru: 'Первая', en: 'First' }, status: 'published', tags: ['privacy', 'tools'] },
  ];
  const ru = renderers.privacyArticles(d, 'ru');
  assert.deepEqual([...ru.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ['/notes/second', '/notes/first', '/notes'], 'the topic’s notes, newest first, then the link to all');
  // A doc saved before v2.2.0 still lists its slugs in its own order.
  const old = structuredClone(d);
  delete old.sections.articles.topic;
  old.sections.articles.items = ['first', 'missing', 'second'];
  assert.deepEqual([...renderers.privacyArticles(old, 'ru').matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ['/notes/first', '/notes/second', '/notes']);
  assert.match(ru, /<span class="v4-feed-meta"><time datetime="2025-07-15">07\.2025<\/time> · Заметка<\/span><a class="v4-feed-title" href="\/notes\/second">Вторая<\/a>/);
  const en = renderers.privacyArticles(d, 'en');
  assert.deepEqual([...en.matchAll(/href="([^"]+)"/g)].map((m) => m[1]), ['/en/notes/first', '/en/notes'], 'an untranslated note stays off the English page');
  // With no notes yet (the static twin) the section is the lead and the link.
  d._articles = [];
  assert.doesNotMatch(renderers.privacyArticles(d, 'ru'), /v4-feed/);
});

test('v2.2.3: a home doc saved before the /privacy link moved into the renderer gets the link from the seed', () => {
  // The live home doc (KV rev 33) has products.items and .more, no .privacy.
  const kv = { page: 'home', sections: { products: { items: clone(seed.home.sections.products.items), more: { label: { ru: 'Все проекты на GitHub', en: 'All projects on GitHub' }, href: 'https://github.com/morgunovtech' } } } };
  fillFromSeed(kv, 'home', seed);
  assert.deepEqual(kv.sections.products.privacy, seed.home.sections.products.privacy);
  assert.notEqual(kv.sections.products.privacy, seed.home.sections.products.privacy, 'a copy, not the seed object');
  // The rendered page has the link above the privacy tools again.
  const html = renderers.products({ ...kv, _privacyRepos: privacyRepos(seed.privacy) }, 'ru', false);
  assert.match(html, /<div class="v4-more"><a href="\/privacy">/);
  // What the owner saved wins; other pages and the seed itself are left alone.
  const own = { sections: { products: { items: [], privacy: { label: { ru: 'Своё', en: 'Own' }, href: { ru: '/privacy', en: '/en/privacy' } } } } };
  assert.equal(fillFromSeed(own, 'home', seed).sections.products.privacy.label.ru, 'Своё');
  assert.equal(fillFromSeed(seed.home, 'home', seed), seed.home);
  assert.deepEqual(Object.keys(SEED_FILL), ['home']);
  assert.equal(fillFromSeed(null, 'home', seed), null);
  assert.match(read('functions/_lib/content.js'), /fixStaleContent\(fillFromSeed\(await loadDocRaw\(env, page\), page, seed\)\)/);
});
