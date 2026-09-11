// Unit tests for the CMS's pure functions. Run via `node --test` (built-in
// runner, no dependencies). These lock the security-critical behaviour:
// HTML/attribute escaping, JSON-LD validity, localization resolution, and the
// auth crypto round-trip. Fix-specific assertions are added alongside each fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, renderInline, safeHref } from '../functions/_lib/markdown.js';
import { isLocalized, pick, resolvePath } from '../functions/_lib/i18n.js';
import { renderJsonLd, renderArticleJsonLd } from '../functions/_lib/jsonld.js';
import { sameOrigin } from '../functions/_lib/http.js';
import { verifyPassword, createSession, verifySession } from '../functions/_lib/auth.js';

test('escapeHtml neutralizes angle brackets and ampersands', () => {
  assert.equal(escapeHtml('<script>&'), '&lt;script&gt;&amp;');
  assert.equal(escapeHtml(null), '');
});

test('renderInline escapes HTML in link labels and text', () => {
  assert.equal(renderInline('a <b> c'), 'a &lt;b&gt; c');
  const out = renderInline('[<x>](https://e.com)');
  assert.match(out, /&lt;x&gt;/);
  assert.match(out, /target="_blank" rel="noopener noreferrer"/);
});

test('renderInline keeps mailto/internal links without target/rel', () => {
  assert.match(renderInline('[m](mailto:a@b.com)'), /href="mailto:a@b.com"/);
  assert.doesNotMatch(renderInline('[m](mailto:a@b.com)'), /target=/);
  assert.match(renderInline('[anchor](#contact)'), /href="#contact"/);
});

test('renderInline blocks javascript: scheme in links', () => {
  const out = renderInline('[click](javascript:alert(1))');
  assert.doesNotMatch(out, /javascript:/i);
});

test('safeHref allowlists safe schemes and rejects the rest', () => {
  for (const ok of ['https://e.com', 'http://e.com', 'mailto:a@b.com', 'tel:+1', '#x', '/path', 'rel/path', '']) {
    assert.equal(safeHref(ok), ok, `should allow: ${ok}`);
  }
  for (const bad of ['javascript:alert(1)', 'JavaScript:x', ' javascript:x', 'data:text/html,x', 'vbscript:x']) {
    assert.equal(safeHref(bad), '#', `should reject: ${bad}`);
  }
  // Browsers ignore tabs/newlines when parsing the scheme — strip them first.
  assert.equal(safeHref('java\tscript:alert(1)'), '#');
});

test('isLocalized / pick / resolvePath', () => {
  assert.equal(isLocalized({ ru: 'a', en: 'b' }), true);
  assert.equal(isLocalized({ ru: 'a', x: 'b' }), false);
  assert.equal(isLocalized('plain'), false);
  assert.equal(pick({ ru: 'a', en: 'b' }, 'en'), 'b');
  assert.equal(pick({ ru: 'a' }, 'en'), 'a'); // fallback
  assert.equal(pick('plain', 'en'), 'plain');
  assert.equal(resolvePath({ a: { b: 1 } }, 'a.b'), 1);
  assert.equal(resolvePath({}, 'a.b'), undefined);
});

// Minimal doc shaped enough for renderJsonLd.
const docFor = (inject) => ({
  dateModified: '2026-05-26',
  hero: { name: { ru: 'Имя', en: 'Name' } },
  meta: { title: { ru: 'T', en: 'T' } },
  seo: {
    alternateName: { ru: 'Alt', en: 'Alt' },
    jobTitle: inject || 'Head',
    personDescription: { ru: 'd', en: 'd' },
    knowsAbout: ['x'],
    sameAs: ['https://e.com'],
    worksFor: { name: 'Org', url: 'https://e.com' },
    occupationStartDate: '2026-04',
    addressLocality: { ru: 'Город', en: 'City' },
  },
  sections: { products: { items: [] } },
});

test('renderJsonLd produces valid JSON', () => {
  const out = renderJsonLd(docFor(), 'ru');
  assert.doesNotThrow(() => JSON.parse(out));
});

test('renderJsonLd escapes </script> so it cannot break out of the tag', () => {
  const out = renderJsonLd(docFor('Head</script><img src=x onerror=alert(1)>'), 'ru');
  assert.doesNotMatch(out, /<\/script>/i);
  assert.doesNotMatch(out, /<img/i);
  // Still parses and round-trips to the original value.
  const parsed = JSON.parse(out);
  const person = parsed['@graph'].find((n) => n['@type'] === 'Person');
  assert.match(person.jobTitle, /<\/script>/);
});

test('renderArticleJsonLd builds an Article linked to the Person', () => {
  const doc = {
    _url: 'https://s.morgunov.tech/notes/hello',
    date: '2026-05-26', dateModified: '2026-05-26',
    title: { ru: 'Привет', en: 'Hi' },
    excerpt: { ru: 'кратко', en: 'short' },
    cover: { src: { ru: '/assets/x.webp' } },
  };
  const out = renderArticleJsonLd(doc, 'en');
  assert.doesNotMatch(out, /<\/script>/i);
  const g = JSON.parse(out)['@graph'];
  const art = g.find((n) => n['@type'] === 'Article');
  assert.equal(art.headline, 'Hi');
  assert.equal(art.datePublished, '2026-05-26');
  assert.equal(art.author['@id'], 'https://s.morgunov.tech/#person');
  assert.ok(g.find((n) => n['@type'] === 'Person' && n['@id'] === 'https://s.morgunov.tech/#person'));
});

test('sameOrigin allows same origin and missing Origin, blocks cross', () => {
  const req = (headers, url = 'https://s.morgunov.tech/admin/api/save') => ({
    headers: { get: (h) => headers[h] ?? null },
    url,
  });
  assert.equal(sameOrigin(req({ Origin: 'https://s.morgunov.tech' })), true);
  assert.equal(sameOrigin(req({})), true); // no Origin, no Sec-Fetch-Site
  assert.equal(sameOrigin(req({ Origin: 'https://evil.com' })), false);
  // Sec-Fetch-Site gate: only same-origin passes. 'none' (direct navigation /
  // non-browser client) is rejected — a mutation API should never be hit that way.
  assert.equal(sameOrigin(req({ 'Sec-Fetch-Site': 'same-origin' })), true);
  assert.equal(sameOrigin(req({ 'Sec-Fetch-Site': 'none' })), false);
  assert.equal(sameOrigin(req({ 'Sec-Fetch-Site': 'cross-site' })), false);
  assert.equal(sameOrigin(req({ 'Sec-Fetch-Site': 'same-site' })), false);
});

test('auth: password verify + session round-trip', async () => {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const km = await crypto.subtle.importKey('raw', enc.encode('secret'), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 1000 }, km, 256);
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const stored = `pbkdf2$sha256$1000$${hex(salt)}$${hex(bits)}`;
  assert.equal(await verifyPassword('secret', stored), true);
  assert.equal(await verifyPassword('wrong', stored), false);

  const secret = 'test-secret';
  const token = await createSession(secret);
  assert.ok(await verifySession(secret, token));
  assert.equal(await verifySession('other-secret', token), null);
  assert.equal(await verifySession(secret, 'garbage'), null);
  // Malformed cookie must fail closed, not throw (b64 decode of '@@@' would throw).
  assert.equal(await verifySession(secret, 'a.@@@'), null);
  assert.equal(await verifySession(secret, '@@@.@@@'), null);
});

// --- Subscriber counters: one source for the stats strip AND the channel meta ---
import { counters, fillCounters, renderers } from '../functions/_lib/render.js';

const homeDocFor = (live) => ({
  _live: live ? { subscribers: live } : undefined,
  stats: [
    { value: { ru: '10', en: '10' }, unit: { ru: 'лет', en: 'yrs' }, aside: { ru: 'a', en: 'a' } },
    {
      kind: 'subscribers', auto: true,
      value: { ru: '6 069', en: '6,069' },
      unit: { ru: 'подписчика', en: 'followers' },
      channels: { telegram: { ru: '1 141', en: '1,141' }, linkedin: { ru: '4 800', en: '4,800' }, youtube: { ru: '128', en: '128' } },
    },
  ],
  sections: {
    publications: {
      items: [
        { kind: 'prose', tag: 'CHANNEL', meta: { ru: '{telegram} в Telegram', en: '{telegram} on Telegram' }, prose: { ru: 'p', en: 'p' } },
      ],
    },
  },
});

test('counters: live SocialBot numbers win and are formatted per language', () => {
  const doc = homeDocFor({ telegram: 1200, linkedin: 5000, youtube: 130 });
  assert.deepEqual(counters(doc, 'ru'), { telegram: '1 200', linkedin: '5 000', youtube: '130', total: '6 330' });
  assert.deepEqual(counters(doc, 'en'), { telegram: '1,200', linkedin: '5,000', youtube: '130', total: '6,330' });
});

test('counters: falls back to the doc channels when no live data (or auto=false)', () => {
  assert.equal(counters(homeDocFor(null), 'en').telegram, '1,141');
  const off = homeDocFor({ telegram: 9, linkedin: 9, youtube: 9 });
  off.stats[1].auto = false;
  assert.equal(counters(off, 'ru').total, '6 069');
});

test('channel meta and stats strip render the same Telegram number', () => {
  const doc = homeDocFor({ telegram: 1200, linkedin: 5000, youtube: 130 });
  const pubs = renderers.publications(doc, 'ru', false);
  const stats = renderers.stats(doc, 'ru', false);
  assert.match(pubs, /1 200 в Telegram/);
  assert.match(stats, /Telegram:<\/span>1 200/);
  assert.doesNotMatch(pubs, /\{telegram\}/);
  // Edit mode keeps the template placeholder so the editor never snapshots a number.
  assert.match(renderers.publications(doc, 'ru', true), /\{telegram\} в Telegram/);
});

test('fillCounters escapes HTML and leaves unknown placeholders alone', () => {
  const doc = homeDocFor(null);
  assert.equal(fillCounters('<b>{telegram}</b> {nope}', doc, 'en'), '&lt;b&gt;1,141&lt;/b&gt; {nope}');
});

test('renderJsonLd: product schema overrides (type/category/license)', () => {
  const doc = docFor();
  doc.sections.products.items = [
    { name: 'Web', desc: { ru: 'd', en: 'd' }, cta: { href: 'https://a.example' } },
    { name: 'Bot', desc: { ru: 'd', en: 'd' }, cta: { href: 'https://b.example' },
      schema: { type: 'SoftwareApplication', category: 'DeveloperApplication', os: 'Linux, Docker', license: 'https://opensource.org/licenses/MIT' } },
  ];
  const list = JSON.parse(renderJsonLd(doc, 'en'))['@graph'].find((n) => n['@type'] === 'ItemList');
  const [web, bot] = list.itemListElement.map((e) => e.item);
  assert.equal(web['@type'], 'WebApplication');
  assert.equal(web.applicationCategory, 'PrivacyApplication');
  assert.equal(web.license, undefined);
  assert.equal(bot['@type'], 'SoftwareApplication');
  assert.equal(bot.applicationCategory, 'DeveloperApplication');
  assert.equal(bot.operatingSystem, 'Linux, Docker');
  assert.equal(bot.license, 'https://opensource.org/licenses/MIT');
  assert.equal(bot.isAccessibleForFree, true);
});

// --- v0.29: RU plural of the live total, KV migrations, sub-page JSON-LD ---
import { pluralRu, unitFor } from '../functions/_lib/render.js';
import { migrateHome, migrateAbout } from '../functions/_lib/content.js';
import { renderPageJsonLd } from '../functions/_lib/jsonld.js';

test('pluralRu / unitFor decline «подписчик» by the live total', () => {
  assert.equal(pluralRu(1, ['подписчик', 'подписчика', 'подписчиков']), 'подписчик');
  assert.equal(pluralRu(5772, ['подписчик', 'подписчика', 'подписчиков']), 'подписчика');
  assert.equal(pluralRu(6069, ['подписчик', 'подписчика', 'подписчиков']), 'подписчиков');
  assert.equal(pluralRu(111, ['подписчик', 'подписчика', 'подписчиков']), 'подписчиков');
  assert.equal(unitFor('подписчика', 'ru', '6 069'), 'подписчиков');
  assert.equal(unitFor('followers', 'en', '6,069'), 'followers');
  assert.equal(unitFor('лет в IT', 'ru', '10'), 'лет в IT'); // unknown noun passes through
});

test('stats strip declines the unit for the live number (not in edit mode)', () => {
  const doc = homeDocFor({ telegram: 1000, linkedin: 4644, youtube: 128 }); // 5 772 → «подписчика»
  assert.match(renderers.stats(doc, 'ru', false), /5\u00a0772<\/div>\s*<div class="v4-stat-unit">подписчика</);
  assert.match(renderers.stats(doc, 'ru', true), />подписчика</); // editor sees the stored unit
});

test('fillCounters drops a known counter that has no value instead of leaking braces', () => {
  const doc = { stats: [], sections: {} };
  assert.equal(fillCounters('{telegram} в Telegram', doc, 'ru'), 'в Telegram');
});

test('migrateHome: an old KV doc gains the Tofs card, the placeholder meta and keeps idempotent', () => {
  const seedDoc = {
    stats: [{ kind: 'subscribers', channels: { telegram: { ru: '1 141', en: '1,141' } }, value: { ru: '6 069', en: '6,069' } }],
    sections: {
      products: { items: [{ name: 'Fingerprint' }, { name: 'FoundYou' }, { name: 'Tofs DevOps', schema: { type: 'SoftwareApplication' } }] },
      publications: { items: [] },
    },
  };
  const kv = {
    stats: [{ value: { ru: '10' } }],
    sections: {
      products: { items: [{ name: 'Fingerprint' }, { name: 'FoundYou' }] },
      publications: { items: [{ tag: 'CHANNEL', meta: { ru: '1 139 в Telegram', en: '1,139 on Telegram' } }, { tag: 'ARTICLE', meta: { ru: '82 600 просмотров', en: '82,600 views' } }] },
    },
  };
  migrateHome(kv, seedDoc);
  assert.deepEqual(kv.sections.products.items.map((i) => i.name), ['Fingerprint', 'FoundYou', 'Tofs DevOps']);
  assert.equal(kv.sections.products.items[2].schema.type, 'SoftwareApplication');
  assert.equal(kv.sections.publications.items[0].meta.ru, '{telegram} в Telegram');
  assert.equal(kv.sections.publications.items[0].meta.en, '{telegram} on Telegram');
  assert.equal(kv.sections.publications.items[1].meta.ru, '82 600 просмотров'); // untouched
  assert.equal(kv.stats.filter((s) => s.kind === 'subscribers').length, 1);
  const again = JSON.stringify(kv);
  migrateHome(kv, seedDoc);
  assert.equal(JSON.stringify(kv), again);
});

test('migrateAbout refreshes the subscriber snapshot in the layers block', () => {
  const doc = { sections: { layers: { body: { ru: '<code>5&nbsp;831 подписчик</code>, 5&nbsp;831 — <code>1&nbsp;139</code> и <code>4&nbsp;564</code>; <code>5,831</code>', en: '<code>5,831 followers</code> 1,139 4,564 <code>5&nbsp;831</code>' } } } };
  migrateAbout(doc);
  assert.equal(doc.sections.layers.body.ru, '<code>6&nbsp;069 подписчиков</code>, 6&nbsp;069 — <code>1&nbsp;141</code> и <code>4&nbsp;800</code>; <code>6,069</code>');
  assert.equal(doc.sections.layers.body.en, '<code>6,069 followers</code> 1,141 4,800 <code>6&nbsp;069</code>');
});

test('renderPageJsonLd: collaborate offers follow the doc, about gets a breadcrumb', () => {
  const collab = {
    dateModified: '2026-09-03',
    meta: { title: { ru: 'Сотрудничество — Семён Моргунов | morgunov.tech', en: 'Collaborate — Semyon Morgunov | morgunov.tech' } },
    hero: { name: { ru: 'Сотрудничество', en: 'Collaborate' } },
    sections: { consulting: { tiers: [
      { name: { ru: 'Разовая консультация', en: 'Single consultation' }, price: { ru: '$250 / <strong>SESSION</strong>', en: '$250 / <strong>SESSION</strong>' }, features: [{ ru: '75 минут', en: '75 minutes' }] },
      { name: { ru: 'Цикл', en: 'Cycle' }, price: { ru: '$2&nbsp;000 / <strong>MONTH</strong>', en: '$2,000 / <strong>MONTH</strong>' }, features: [{ ru: '5 сессий', en: '5 sessions' }] },
    ] } },
  };
  const g = JSON.parse(renderPageJsonLd(collab, 'en', 'collaborate'))['@graph'];
  const page = g.find((n) => n['@type'] === 'WebPage');
  assert.equal(page.name, 'Collaborate — Semyon Morgunov');
  assert.equal(page.url, 'https://s.morgunov.tech/en/collaborate');
  assert.equal(page.dateModified, '2026-09-03');
  const offers = g.find((n) => n['@type'] === 'Service').hasOfferCatalog.itemListElement;
  assert.deepEqual(offers.map((o) => [o.name, o.price, o.description]), [['Single consultation', '250', '75 minutes'], ['Cycle', '2000', '5 sessions']]);
  const about = { dateModified: '2026-05-11', meta: { title: { ru: 'Принципы — Семён Моргунов', en: 'Principles — Semyon Morgunov' } }, hero: { name: { ru: 'Принципы', en: 'Principles' } }, sections: {} };
  const ga = JSON.parse(renderPageJsonLd(about, 'ru', 'about'))['@graph'];
  const bc = ga.find((n) => n['@type'] === 'BreadcrumbList');
  assert.deepEqual(bc.itemListElement.map((i) => i.name), ['Главная', 'Принципы']);
  assert.equal(ga.find((n) => n['@type'] === 'WebPage').breadcrumb['@id'], 'https://s.morgunov.tech/about#breadcrumb');
});

test('home JSON-LD: ProfilePage + mainEntity, Person url stable across languages, product free/version', () => {
  const doc = docFor();
  doc.sections.products.items = [{ name: 'X', version: 'v2.5', desc: { ru: 'd', en: 'd' }, cta: { href: 'https://x.example' } }];
  for (const lang of ['ru', 'en']) {
    const g = JSON.parse(renderJsonLd(doc, lang))['@graph'];
    const page = g.find((n) => Array.isArray(n['@type']) && n['@type'].includes('ProfilePage'));
    assert.equal(page.mainEntity['@id'], 'https://s.morgunov.tech/#person');
    assert.equal(g.find((n) => n['@type'] === 'Person').url, 'https://s.morgunov.tech/');
    const item = g.find((n) => n['@type'] === 'ItemList').itemListElement[0].item;
    assert.equal(item.softwareVersion, '2.5');
    assert.equal(item.isAccessibleForFree, true);
  }
});

// --- v0.29 round 2: protocol-relative links, migration marker ---
test('safeHref / isExternal treat protocol-relative //host as an external https link', () => {
  assert.equal(safeHref('//evil.example/x'), 'https://evil.example/x');
  assert.match(renderInline('[l](//evil.example/x)'), /target="_blank" rel="noopener noreferrer"/);
});

test('migrations run once: a renamed or deleted card is not resurrected after the marker', () => {
  const seedDoc = { stats: [], sections: { products: { items: [{ name: 'Fingerprint' }, { name: 'Tofs DevOps', schema: {} }] }, publications: { items: [] } } };
  const kv = { sections: { products: { items: [{ name: 'Fingerprint' }] }, publications: { items: [] } }, stats: [] };
  migrateHome(kv, seedDoc);
  assert.equal(kv.migration, 29);
  assert.deepEqual(kv.sections.products.items.map((i) => i.name), ['Fingerprint', 'Tofs DevOps']);
  // editor renames + deletes, then the doc is read again (marker already set)
  kv.sections.products.items = [{ name: 'Fingerprint Check' }];
  migrateHome(kv, seedDoc);
  assert.deepEqual(kv.sections.products.items.map((i) => i.name), ['Fingerprint Check']);
  const about = { sections: { living: { body: { ru: 'Build <code>cc8781e</code> сменится', en: 'Build <code>cc8781e</code> will change' } } } };
  migrateAbout(about);
  assert.equal(about.sections.living.body.ru, 'Build <code>{build}</code> сменится');
  assert.equal(about.migration, 29);
});
