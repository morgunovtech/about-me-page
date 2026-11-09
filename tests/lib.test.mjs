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
import { counters, fillCounters, renderers, channelItem } from '../functions/_lib/render.js';

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

// The CHANNEL item renders on /notes (v0.31.0) through channelItem.
const channelOf = (doc) => channelItem(doc.sections.publications.items[0], 'ru', doc);

test('channel meta and stats strip render the same Telegram number', () => {
  const doc = homeDocFor({ telegram: 1200, linkedin: 5000, youtube: 130 });
  const pubs = channelOf(doc);
  const stats = renderers.stats(doc, 'ru', false);
  assert.match(pubs, /1 200 в Telegram/);
  assert.match(stats, /Telegram:<\/span>&nbsp;1 200/);
  // Channels are mono abbreviations, never icons.
  assert.match(stats, /<span aria-hidden="true">TG<\/span>/);
  assert.doesNotMatch(stats, /<svg/);
  assert.doesNotMatch(pubs, /\{telegram\}/);
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
import { migrateHome, migrateAbout, MIGRATION } from '../functions/_lib/migrations.js';
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

test('migrateHome: an old KV doc gains the Tofs card and the subscribers stat, idempotently', () => {
  const seedDoc = {
    stats: [{ kind: 'subscribers', channels: { telegram: { ru: '1 141', en: '1,141' } }, value: { ru: '6 069', en: '6,069' } }],
    sections: {
      products: { items: [{ name: 'Fingerprint' }, { name: 'FoundYou' }, { name: 'Tofs DevOps', schema: { type: 'SoftwareApplication' } }] },
    },
  };
  const kv = {
    stats: [{ value: { ru: '10' } }],
    sections: {
      products: { items: [{ name: 'Fingerprint' }, { name: 'FoundYou' }] },
    },
  };
  migrateHome(kv, seedDoc);
  assert.deepEqual(kv.sections.products.items.map((i) => i.name), ['Fingerprint', 'FoundYou', 'Tofs DevOps']);
  assert.equal(kv.sections.products.items[2].schema.type, 'SoftwareApplication');
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
  assert.equal(kv.migration, MIGRATION);
  assert.deepEqual(kv.sections.products.items.map((i) => i.name), ['Fingerprint', 'Tofs DevOps']);
  // editor renames + deletes, then the doc is read again (marker already set)
  kv.sections.products.items = [{ name: 'Fingerprint Check' }];
  migrateHome(kv, seedDoc);
  assert.deepEqual(kv.sections.products.items.map((i) => i.name), ['Fingerprint Check']);
  const about = { sections: { living: { body: { ru: 'Build <code>cc8781e</code> сменится', en: 'Build <code>cc8781e</code> will change' } } } };
  migrateAbout(about);
  assert.equal(about.sections.living.body.ru, 'Build <code>{build}</code> сменится');
  assert.equal(about.migration, MIGRATION);
});

/* --- v0.30.1 / v0.30.4: dead content is rewritten at read time --- */
import { fixStaleContent } from '../functions/_lib/migrations.js';

test('fixStaleContent rewrites stale content in hrefs, prose and arrays', () => {
  const doc = {
    migration: 30, // already at the marker: the numbered gate must not shield this
    hero: { ctas: { ru: '<a href="https://korzinka.uz/go">Korzinka</a>', en: null } },
    sections: {
      career: { items: [{ href: 'https://korzinka.uz/go' }] },
      prose: { ru: 'Среди клиентов Belissimo Pizza.' },
    },
    keep: 'https://korzinka.uz',
  };
  fixStaleContent(doc);
  assert.equal(doc.hero.ctas.ru, '<a href="https://korzinka.uz">Korzinka</a>');
  assert.equal(doc.sections.career.items[0].href, 'https://korzinka.uz');
  assert.equal(doc.sections.prose.ru, 'Среди клиентов Bellissimo Pizza.');
  assert.equal(doc.keep, 'https://korzinka.uz');
  assert.equal(doc.hero.ctas.en, null);
  assert.equal(doc.migration, 30, 'must not touch the migration marker');
});

test('fixStaleContent is idempotent and survives odd input', () => {
  const doc = { a: { b: 'Belissimo Belissimo' } };
  assert.deepEqual(fixStaleContent(fixStaleContent(doc)), { a: { b: 'Bellissimo Bellissimo' } });
  assert.equal(fixStaleContent(null), null);
  assert.equal(fixStaleContent('Belissimo'), 'Belissimo'); // scalars pass through
});

test('fixStaleContent swaps the dead links stored in KV', () => {
  const doc = {
    career: { company: { ru: '[Korzinka](https://korzinka.uz/go)', en: '[Korzinka](https://korzinka.uz/go)' } },
    prose: { ru: 'Среди клиентов [UMAI Group](https://www.umaigroup.kg/en/about), [Bellissimo](https://bellissimo.uz/ru/about/company)' },
    keep: 'https://korzinka.uz/good https://umaigroup.kg/en/about',
  };
  fixStaleContent(doc);
  assert.equal(doc.career.company.ru, '[Korzinka](https://korzinka.uz)');
  assert.equal(doc.career.company.en, '[Korzinka](https://korzinka.uz)');
  assert.equal(doc.prose.ru, 'Среди клиентов [UMAI Group](https://web.archive.org/web/20260123151317/https://www.umaigroup.kg/en/about), [Bellissimo](https://bellissimo.uz/ru/about/company)');
  assert.equal(doc.keep, 'https://korzinka.uz/good https://umaigroup.kg/en/about');
  // The snapshot URL ends with the old one: a second pass must not nest it.
  const once = JSON.stringify(doc);
  assert.equal(JSON.stringify(fixStaleContent(doc)), once);
});

test('fixStaleContent applies the v0.30.6 home copy fixes to a doc saved before them', () => {
  const doc = {
    about: {
      ru: 'С 2009 года запустил четыре бизнеса — один продали сотрудникам, три закрыли. Среди клиентов Belissimo Pizza.',
      en: "Since 2009 I've launched four businesses — one sold to employees, three closed. Clients include Belissimo Pizza.",
    },
    uz: { period: { ru: '2026 — сейчас', en: 'Apr 2026 — present' }, ctx: { ru: 'Строю и масштабирую продуктовую линейку. In progress.' } },
    korzinka: { role: { ru: 'Director of e-com', en: 'Director of e-commerce / CPO Korzinka Go' } },
    uslugi: {
      ru: 'Портфель 30+ продуктов в сегменте домашних услуг, ~6.5M пользователей в месяц.\n\n– GMV: ×2.2 за год – EBITDA: вывел в плюс за 10 месяцев – Pivot: Classified → End to End Model',
      en: 'Portfolio of 30+ products in home services, ~6.5M monthly users.\n\n- GMV: ×2.2 in a year\n- EBITDA: turned positive in 10 months',
    },
    apple: { role: { ru: 'Certified Sales Trainer (contractor)', en: 'Certified Sales Trainer' } },
  };
  fixStaleContent(doc);
  assert.equal(doc.about.ru, 'С 2009 года запустил четыре бизнеса — один продали сотрудникам, два закрыли, один на паузе. Среди клиентов Bellissimo Pizza.');
  assert.equal(doc.about.en, "Since 2009 I've launched four businesses — one sold to employees, two closed, one on pause. Clients include Bellissimo Pizza.");
  assert.equal(doc.uz.period.ru, '2026 — сейчас');
  assert.equal(doc.uz.period.en, '2026 — present');
  assert.equal(doc.uz.ctx.ru, 'BNPL, платежи, кредитные продукты. Строю и масштабирую продуктовую линейку.');
  assert.equal(doc.korzinka.role.ru, 'Director of e-commerce / CPO Korzinka Go');
  assert.equal(doc.korzinka.role.en, 'Director of e-commerce / CPO Korzinka Go');
  assert.match(doc.uslugi.ru, /\n\n- GMV: ×2,2 за год\n- EBITDA: вывел в плюс за 10 месяцев\n- Pivot: Classified → End to End Model$/);
  assert.match(doc.uslugi.en, /\n- EBITDA: turned positive in 10 months\n- Pivot: Classified → End to End Model$/);
  assert.equal(doc.apple.role.ru, 'Certified Sales Trainer (contractor)');
  assert.equal(doc.apple.role.en, 'Certified Sales Trainer (contractor)');
  // Several new texts contain the old ones: a second pass must change nothing.
  const once = JSON.stringify(doc);
  assert.equal(JSON.stringify(fixStaleContent(doc)), once);
});

test('fixStaleContent drops the «repo is open» promises on /about', () => {
  const doc = {
    ethics: {
      ru: '<li><strong>Transparency.</strong> Репозиторий открыт, build hash в футере кликабельный на коммит в GitHub. Каждый может увидеть, что и когда менялось. Аффилиатные ссылки на /uses помечены и раскрыты.</li>',
      en: '<li><strong>Transparency.</strong> Repo is open, the build hash in the footer links to the commit on GitHub. Anyone can see what changed and when. Affiliate links on /uses are marked and disclosed.</li>',
    },
    product: {
      ru: '- У сайта есть билд (<code>BUILD 3cd8687</code> в футере кликабельный GitHub)',
      en: 'a build (<code>BUILD&nbsp;3cd8687</code> in the footer, clickable through to the commit on GitHub), a backlog',
    },
    living: {
      ru: 'кнопкой «Нашли опечатку?» . Репозиторий открыт; если хотите завести issue или PR — добро пожаловать.',
      en: 'opens a direct channel. The repo is open; if you want to file an issue or a PR — welcome.',
    },
  };
  fixStaleContent(doc);
  assert.equal(doc.ethics.ru, '<li><strong>Transparency.</strong> Build hash в футере — коммит, который сейчас в продакшене. Аффилиатные ссылки на /uses помечены и раскрыты.</li>');
  assert.equal(doc.ethics.en, '<li><strong>Transparency.</strong> The build hash in the footer is the commit currently in production. Affiliate links on /uses are marked and disclosed.</li>');
  assert.equal(doc.product.ru, '- У сайта есть билд (<code>BUILD {build}</code> в футере)');
  assert.equal(doc.product.en, 'a build (<code>BUILD&nbsp;{build}</code> in the footer), a backlog');
  assert.equal(doc.living.ru, 'кнопкой «Нашли опечатку?» .');
  assert.equal(doc.living.en, 'opens a direct channel.');
});

test('fixStaleContent turns a literal BUILD hash into {build}, and only inside <code>BUILD …</code>', () => {
  const doc = {
    a: '<code>BUILD 3cd8687</code> · <code>BUILD&nbsp;abcdef0123</code>',
    keep: 'Build <code>3cd8687</code> and BUILD 3cd8687 in plain text',
  };
  fixStaleContent(doc);
  assert.equal(doc.a, '<code>BUILD {build}</code> · <code>BUILD&nbsp;{build}</code>');
  assert.equal(doc.keep, 'Build <code>3cd8687</code> and BUILD 3cd8687 in plain text');
  assert.equal(JSON.stringify(fixStaleContent(doc)), JSON.stringify(doc));
});

test('fixStaleContent applies the v0.31.3 proofreading fixes to the home doc saved before them', () => {
  const nb = ' ';
  const doc = {
    uslugi: 'Портфель 30+ продуктов в сегменте домашних услуг, ~6.5M пользователей в месяц.\n\n- GMV: ×2.2 за год',
    uslugiEn: 'Portfolio of 30+ products in home services, ~6.5M monthly users.\n\n- GMV: ×2.2 in a year',
    korzinka: { ru: '- Выручка: ×2 год к году при положительной EBITDA\n- CSAT: 4.2 → 4.5', en: '- Revenue: ×2 year-over-year at positive EBITDA\n- CSAT: 4.2 → 4.5' },
    apple: '- Мероприятия: 100+ событий, средняя оценка 4.9 из 5',
    skyeng: '- Активировал 7M+ пользователей',
    arc: 'Запустили → Выросли до 3-х точек → Закрыли',
    hvost: '[Ethical grooming salon «Hvost»](https://yandex.com/maps/-/CDF9VDo~)',
    clients: 'I consult companies in Russia, Uzbekistan, and Kyrgyzstan. Clients include UMAI Group, Bellissimo Pizza, Buildex, MediaPark, and others.',
    person: 'С 2009 года запустил четыре собственных проекта (один продан сотрудникам, два закрыли, один на паузе).',
  };
  fixStaleContent(doc);
  assert.equal(doc.uslugi, `Портфель 30+ продуктов в сегменте домашних услуг, ~6,5${nb}млн пользователей в месяц.\n\n- GMV: ×2,2 за год`);
  assert.equal(doc.uslugiEn, 'Portfolio of 30+ products in home services, ~6.5M monthly users.\n\n- GMV: ×2.2 in a year'); // EN keeps the point
  assert.equal(doc.korzinka.ru, '- Выручка: ×2 год к году при положительной EBITDA\n- CSAT: 4,2 → 4,5');
  assert.equal(doc.korzinka.en, '- Revenue: ×2 year-over-year at positive EBITDA\n- CSAT: 4.2 → 4.5');
  assert.equal(doc.apple, '- Мероприятия: 100+ событий, средняя оценка 4,9 из 5');
  assert.equal(doc.skyeng, `- Активировал 7${nb}млн+ пользователей`);
  assert.equal(doc.arc, 'Запустили → Выросли до 3 точек → Закрыли');
  assert.equal(doc.hvost, '[Ethical grooming salon “Hvost”](https://yandex.com/maps/-/CDF9VDo~)');
  assert.match(doc.clients, /Clients include \[UMAI Group\]\(https:\/\/web\.archive\.org\/web\/20260123151317\/https:\/\/www\.umaigroup\.kg\/en\/about\), \[Bellissimo Pizza\]\(https:\/\/bellissimo\.uz\/ru\/about\/company\), Buildex, \[MediaPark\]\(https:\/\/mediapark\.uz\/about\), and others\.$/);
  assert.equal(doc.person, 'С 2009 года запустил четыре бизнеса (один продан сотрудникам, два закрыли, один на паузе).');
  const once = JSON.stringify(doc);
  assert.equal(JSON.stringify(fixStaleContent(doc)), once);
});
