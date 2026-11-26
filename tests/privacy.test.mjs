// v1.6.0 — /privacy: the owner's privacy tools and «Джентльменский набор».
// The page recommends software to strangers, so its promises are checks:
// every app of the kit is open source AND has a published independent audit,
// each proof is a link to a primary source, the «Сайт» line is the official
// site, and nothing on the page is a referral link. (The kit was cards with a
// spec table and a button; it is rows now — an app a row.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderers, plainLabel } from '../functions/_lib/render.js';
import { renderInline, escapeAttr } from '../functions/_lib/markdown.js';
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

test('the on-page line points at real sections; the language menu at the twin page', () => {
  for (const [f, lang] of [['privacy.html', 'ru'], ['en/privacy.html', 'en']]) {
    const page = read(f);
    const nav = /<nav class="v4-onpage"[^>]*>([\s\S]*?)<\/nav>/.exec(page)[1];
    for (const [, id] of nav.matchAll(/href="#([a-z]+)"/g)) assert.match(page, new RegExp(`<section id="${id}" class="v4-section">`), `${f} #${id}`);
    assert.match(page, /<a class="v4-menu-item v4-lang-link" role="menuitemradio" aria-checked="(true|false)" href="\/privacy" hreflang="ru"/, f);
    assert.match(page, /href="\/en\/privacy" hreflang="en"/, f);
    assert.match(page, new RegExp(`<link rel="canonical" href="https://s\\.morgunov\\.tech${lang === 'en' ? '/en' : ''}/privacy" />`), f);
    assert.doesNotMatch(page.replace(/<header class="v4-bar"[\s\S]*?<\/header>/, ''), /collaborate/, `${f}: nothing left of the page it was cut from (the site menu aside)`);
  }
});

test('the page goes tools → articles → kit → contact, and the on-page line lists the sections in that order', () => {
  // The articles come before the kit: the kit is the long part of the page, and what stood
  // under it was not found.
  const ORDER = [['tools', 'privacyTools'], ['articles', 'privacyArticles'], ['kit', 'privacyKit'], ['contact', 'collabContact']];
  for (const f of ['privacy.html', 'en/privacy.html']) {
    const page = read(f);
    const sections = [...page.matchAll(/<section id="([a-z]+)" class="v4-section">[\s\S]*?data-cms-list="(\w+)"/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(sections, ORDER, `${f}: the sections, each with its own slot`);
    assert.equal((page.match(/<section id="/g) || []).length, ORDER.length, f);
    const nav = /<nav class="v4-onpage"[^>]*>([\s\S]*?)<\/nav>/.exec(page)[1];
    assert.deepEqual([...nav.matchAll(/href="#([a-z]+)"/g)].map((m) => m[1]), ORDER.map(([id]) => id), `${f}: the on-page line`);
  }
});

test('«Мои инструменты»: the live tools read as on the homepage — the same card, with no live dot; Good Pass is a pale card with no way in', () => {
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
  // The flag that asked for a pulsing dot is gone from the seed with the dot.
  for (const it of tools) assert.equal(it.live, undefined, it.name);
  for (const lang of LANGS) {
    const html = renderers.privacyTools(doc, lang);
    // The head of a card (v4.2.0): the name, then quietly what it is and one fact — the version
    // of a live tool, «скоро» for the one that is not ready. A live name links out; no button.
    const heads = [...html.matchAll(/<div class="v4-product-head">\s*<h3 class="v4-product-name">(<a [^>]+>)?([^<]+)[\s\S]*?<\/h3>\s*<span class="v4-product-meta">([\s\S]*?)<\/span>\s*<\/div>/g)]
      .map((m) => [m[2], Boolean(m[1]), m[3].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')]);
    const web = lang === 'en' ? 'Web' : 'Веб';
    assert.deepEqual(heads, [...live.map((it) => [it.name, true, `${web} · ${it.version}`]), [soon[0].name, false, `${web} · ${lang === 'en' ? 'soon' : 'скоро'}`]], lang);
    assert.doesNotMatch(html, /v4-btn/, `${lang}: no buttons — the name is the way in`);
    const card = html.slice(html.indexOf('v4-product--soon'));
    assert.doesNotMatch(card, /<a |v4-btn|good-pass/, `${lang}: the soon card has no link and no button`);
    // No card says «running» with a dot — the two live ones had one each: a tool under «Мои
    // инструменты» with a version and a button says it by itself.
    assert.doesNotMatch(html, /v4-live-dot|v4-product-tag-row|<span class="sr-only">(Работает|Live)<\/span>/, lang);
  }
});

test('«Джентльменский набор»: open source, a published independent audit, the official site — every app', () => {
  const items = kitItems();
  assert.ok(items.length >= 10, `${items.length} apps`);
  const https = (h) => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(String(h));
  const unaudited = new Set(doc.sections.kit.groups.filter((g) => g.unaudited).flatMap((g) => g.items));
  for (const it of items) {
    const name = it.name;
    // Only an app in the marked group may come without an audit — and it must.
    if (unaudited.has(it)) assert.deepEqual(it.audits, [], `${name}: the unaudited group has no audits`);
    else assert.ok(it.audits && it.audits.length >= 1, `${name}: an audit`);
    for (const a of it.audits) {
      assert.ok(https(a.href), `${name}: audit link ${a.href}`);
      // «Cure53, 2025»: who audited and when, in both languages.
      for (const l of LANGS) assert.match(typeof a.label === 'string' ? a.label : a.label[l], /\b20\d\d\b/, `${name}: the audit says its year`);
    }
    assert.ok(it.source && https(it.source.href), `${name}: source code`);
    assert.ok(it.cta && https(it.cta.href), `${name}: official site`);
    // The «Сайт» line of a row reads the domain it leads to, so a reader sees the address to
    // download from. (A stored label may still end with the «→» of the button it was: a typed
    // glyph is the renderer's to drop.)
    const host = new URL(it.cta.href).hostname.replace(/^www\./, '');
    for (const l of LANGS) assert.equal(plainLabel(it.cta.label[l]), host, `${name}: the site line reads its domain`);
    for (const l of LANGS) {
      for (const k of ['tag', 'price', 'desc', 'platforms']) assert.ok(String(it[k] && it[k][l]).trim(), `${name}: ${k}.${l}`);
    }
    for (const alt of it.alternatives || []) assert.ok(https(alt.href), `${name}: alternative ${alt.href}`);
  }
  // One product, one row.
  assert.equal(new Set(items.map((it) => it.name)).size, items.length);
  assert.doesNotMatch(JSON.stringify(doc), REFERRAL, 'no referral links on /privacy');
});

test('the kit is rows — an app a row: its name and kind, why this one, and the proof as plain off-site links; no button, no arrows', () => {
  const TERMS = {
    ru: { site: 'Сайт', audit: 'Аудит', none: 'публичного нет', code: 'Код', os: 'Где работает', alt: 'Ещё' },
    en: { site: 'Site', audit: 'Audit', none: 'none published', code: 'Code', os: 'Runs on', alt: 'Also' },
  };
  const NEW_TAB = { ru: ' (откроется в новой вкладке)', en: ' (opens in a new tab)' };
  const items = kitItems();
  for (const lang of LANGS) {
    const t = TERMS[lang];
    // Every link of a row leaves the site: a new tab, and the note that says so to a screen reader.
    const link = (href, label) => `<a href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${renderInline(label)}<span class="sr-only">${NEW_TAB[lang]}</span></a>`;
    const html = renderers.privacyKit(doc, lang);
    // A group of rows per task, a row per app.
    assert.equal((html.match(/<div class="v4-kit">/g) || []).length, doc.sections.kit.groups.length, lang);
    const rows = html.split('<article class="v4-kit-row">').slice(1).map((r) => r.slice(0, r.indexOf('</article>')));
    assert.equal(rows.length, items.length, lang);
    rows.forEach((row, i) => {
      const it = items[i];
      const where = `${lang}: ${it.name}`;
      // Left: the name — a link to the official site — and under it what the app is and what it costs.
      assert.match(row, /^\s*<div class="v4-kit-id">\s*<h4 class="v4-kit-name">[\s\S]*?<\/h4>\s*<p class="v4-kit-kind">[^<]*<\/p>\s*<\/div>\s*<p class="v4-kit-desc">[\s\S]*?<\/p>\s*<dl class="v4-kit-facts">[\s\S]*<\/dl>\s*$/, where);
      assert.ok(row.includes(`<h4 class="v4-kit-name">${link(it.cta.href, it.name)}</h4>`), where);
      assert.ok(row.includes(`<p class="v4-kit-kind">${renderInline(it.tag[lang])} · ${renderInline(it.price[lang])}</p>`), where);
      // Middle: why this one.
      assert.ok(row.includes(`<p class="v4-kit-desc">${renderInline(it.desc[lang])}</p>`), where);
      // Right: the proof, a fact a line — the official site by its domain, so a reader sees the
      // address to download from; the independent audits; the source code; where it runs; what else.
      const host = new URL(it.cta.href).hostname.replace(/^www\./, '');
      const facts = [...row.matchAll(/<div><dt>([^<]+)<\/dt> <dd>([\s\S]*?)<\/dd><\/div>/g)].map((m) => [m[1], m[2]]);
      assert.deepEqual(facts, [
        [t.site, link(it.cta.href, host)],
        [t.audit, it.audits.length ? it.audits.map((a) => link(a.href, a.label[lang])).join('; ') : t.none],
        [t.code, link(it.source.href, it.source.label[lang])],
        [t.os, renderInline(it.platforms[lang])],
        ...((it.alternatives || []).length ? [[t.alt, it.alternatives.map((a) => link(a.href, a.label[lang])).join(', ')]] : []),
      ], where);
      assert.match(row, /<dl class="v4-kit-facts">(?:<div><dt>[^<]+<\/dt> <dd>[\s\S]*?<\/dd><\/div>)+<\/dl>\s*$/, `${where}: nothing in the list but its facts`);
      // No button — the name and the «Сайт» line lead to the site — and no arrow after a link:
      // every link of the row leaves the site, so an arrow at each said nothing.
      assert.doesNotMatch(row, /v4-btn|v4-ne|[→↗]/, where);
      for (const [a] of row.matchAll(/<a [^>]*>/g)) assert.match(a, /^<a href="https:\/\/[^"]+" target="_blank" rel="noopener noreferrer">$/, where);
      assert.equal((row.match(/<a /g) || []).length, (row.match(/<span class="sr-only">/g) || []).length, `${where}: every link says it opens a new tab`);
    });
    assert.doesNotMatch(html, /v4-btn|v4-product|v4-spec/, `${lang}: rows, not cards with a spec table and a button`);
    assert.match(html, /<p class="v4-terms">/, 'the date the list was checked');
    // The text above the rows points at them in the page's own words: where the report is, and
    // which line holds the address — named as the row names it.
    const prose = doc.sections.kit.prose[lang];
    assert.match(prose, lang === 'en' ? /The link to the report is in the app’s row\./ : /Ссылка на отчёт — в строке приложения\./, lang);
    assert.ok(prose.includes(lang === 'en' ? `its address is in the “${t.site}” line.` : `его адрес указан в строке «${t.site}».`), lang);
    assert.doesNotMatch(prose, /карточк|кнопк|\bcard\b|\bbutton\b/i, `${lang}: no card and no button to point at`);
  }
  // The committed pages are the twins of that render: as many rows, no button among them.
  for (const f of ['privacy.html', 'en/privacy.html']) {
    const kit = read(f).split('<section id="kit"')[1].split('</section>')[0];
    assert.equal((kit.match(/<article class="v4-kit-row">/g) || []).length, items.length, f);
    assert.doesNotMatch(kit, /v4-btn|v4-product|v4-ne|↗/, f);
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

test('Sonar counts no copy-paste in the page templates and the chrome.js twin, and its settings are not served', () => {
  // Every page repeats the head, the bar and the footer by design (no build step);
  // check-sync and the composition tests keep those twins, not Sonar. ds/v1/chrome.js
  // is generated from script.js (v4.0.0): build-chrome --check keeps that twin.
  // Nothing else is excluded.
  assert.match(read('.sonarcloud.properties'), /^sonar\.cpd\.exclusions=\*\*\/\*\.html,ds\/v1\/chrome\.js$/m);
  assert.match(read('functions/_middleware.js'), /'\/\.sonarcloud\.properties',/);
});

test('the homepage (v4.2.0): the four products in one grid — no /privacy link inside it, no «Работает»; the GitHub link comes after', () => {
  for (const [f, lang] of [['index.html', 'ru'], ['en/index.html', 'en']]) {
    const projects = read(f).split('id="projects"')[1].split('</section>')[0];
    const at = (x) => projects.indexOf(x);
    assert.equal((projects.match(/<div class="v4-products">/g) || []).length, 1, f);
    assert.doesNotMatch(projects, /href="(\/en)?\/privacy"/, f);
    assert.doesNotMatch(projects, /sections\.projects\.live|>(Работает|Live)</, f);
    assert.ok(at('>TofsDevOps') < at('>Social Tracker') && at('>Social Tracker') < at('>Found You') && at('>Found You') < at('>Fingerprint'), f);
    assert.ok(at('>Fingerprint') < at('sections.products.more.href'), f);
  }
  assert.equal(seed.home.sections.products.privacy, undefined, 'the link left the doc');
  assert.equal(seed.home.sections.projects.live, undefined, 'the caption left the doc');
  for (const f of ['functions/_middleware.js', 'functions/admin/api/preview.js', 'scripts/render-static.mjs', 'functions/_lib/render.js']) {
    assert.doesNotMatch(read(f), /privacyRepos/, f);
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
    // The why is the group's note: a secondary line under the caption — then the rule and the
    // rows, like every group (it was a paragraph of the page's text between the caption and
    // the rule, and the group read as another component).
    assert.match(tail, /^<h3 class="v4-h3">[^<]+<\/h3>\s*<p class="v4-kit-note">[^<]+<\/p>\s*<div class="v4-kit">/, lang);
    // The row says it where every other row links its audit — in the «Аудит» line, in words.
    assert.match(tail, lang === 'en' ? /<div><dt>Audit<\/dt> <dd>none published<\/dd><\/div>/ : /<div><dt>Аудит<\/dt> <dd>публичного нет<\/dd><\/div>/, lang);
    assert.equal((html.match(/публичного нет|none published/g) || []).length, marked[0].items.length, `${lang}: only the marked rows`);
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

test('fillFromSeed: a field the renderer starts reading is filled from the seed, only when missing (v2.2.3; the table is empty since v4.0.1)', () => {
  // The example (v2.2.3 filled sections.products.privacy, gone since v4.2.0): a doc without .more.
  const TABLE = { home: ['sections.products.more'] };
  const kv = { page: 'home', sections: { products: { items: clone(seed.home.sections.products.items) } } };
  fillFromSeed(kv, 'home', seed, TABLE);
  assert.deepEqual(kv.sections.products.more, seed.home.sections.products.more);
  assert.notEqual(kv.sections.products.more, seed.home.sections.products.more, 'a copy, not the seed object');
  // What the owner saved wins; other pages and the seed itself are left alone.
  const own = { sections: { products: { items: [], more: { label: { ru: 'Своё', en: 'Own' }, href: 'https://github.com/morgunovtech' } } } };
  assert.equal(fillFromSeed(own, 'home', seed, TABLE).sections.products.more.label.ru, 'Своё');
  assert.equal(fillFromSeed(seed.home, 'home', seed, TABLE), seed.home);
  assert.equal(fillFromSeed(null, 'home', seed, TABLE), null);
  // The rev 34 Save (2026-11-25) stored the link: nothing is filled any more.
  assert.deepEqual(SEED_FILL, {});
  // No read-time migration is left either, so nothing reads the marker the gated ones wrote:
  // `migration` is gone from every doc of the seed.
  for (const page of ['home', 'uses', 'consulting', 'collaborate', 'privacy', 'notes']) assert.equal(seed[page].migration, undefined, page);
  const bare = { sections: { products: { items: [] } } };
  assert.equal(fillFromSeed(bare, 'home', seed).sections.products.more, undefined);
  assert.match(read('functions/_lib/content.js'), /fixStaleContent\(fillFromSeed\(await loadDocRaw\(env, page\), page, seed\)\)/);
});
