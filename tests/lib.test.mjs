// Unit tests for the CMS's pure functions. Run via `node --test` (built-in
// runner, no dependencies). These lock the security-critical behaviour:
// HTML/attribute escaping, JSON-LD validity, localization resolution, and the
// auth crypto round-trip. Fix-specific assertions are added alongside each fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, renderInline, safeHref } from '../functions/_lib/markdown.js';
import { isLocalized, pick, resolvePath } from '../functions/_lib/i18n.js';
import { renderJsonLd, renderArticleJsonLd } from '../functions/_lib/jsonld.js';
import { noindexOnTechnicalHost, sameOrigin } from '../functions/_lib/http.js';
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
  // A trailing newline (a hash piped into `wrangler secret put`) still verifies.
  assert.equal(await verifyPassword('secret', stored + '\n'), true);
  // Above the Workers ceiling, or malformed: a failed login, never an exception (2026-11-25: a
  // 600 000-iteration hash threw «Pbkdf2 failed …» and the owner saw Error 1101).
  const [, , , s, h] = stored.split('$');
  assert.equal(await verifyPassword('secret', `pbkdf2$sha256$600000$${s}$${h}`), false);
  assert.equal(await verifyPassword('secret', `pbkdf2$sha256$1000$${s}$${h}x`), false);
  assert.equal(await verifyPassword('secret', 'pbkdf2$sha256$abc$00$00'), false);

  const secret = 'test-secret';
  const token = await createSession(secret);
  assert.ok(await verifySession(secret, token));
  assert.equal(await verifySession('other-secret', token), null);
  assert.equal(await verifySession(secret, 'garbage'), null);
  // Malformed cookie must fail closed, not throw (b64 decode of '@@@' would throw).
  assert.equal(await verifySession(secret, 'a.@@@'), null);
  assert.equal(await verifySession(secret, '@@@.@@@'), null);
});

// --- Subscriber counters: one source for the stats strip AND the channel panel ---
import { counters, renderers, channelItem } from '../functions/_lib/render.js';

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
  sections: {},
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

// The channel panel on /notes (seed: notes.channel) goes through channelItem: what the channel
// is, how many read it — the same counter as the stats strip — and one small button.
const CHANNEL = {
  title: { ru: 'Канал', en: 'Channel' },
  prose: { ru: 'О чём канал.', en: 'What it is about.' },
  since: { ru: 'пишу с 2022 года', en: 'writing since 2022' },
  cta: { label: { ru: 'Подписаться', en: 'Subscribe' }, href: 'https://t.me/raschet7' },
  more: { label: { ru: 'Избранные посты', en: 'Selected posts' }, href: 'https://t.me/raschet7/261' },
};
// The first fact of the panel's meta line: how many read the channel.
const readers = (doc, lang = 'ru') => /<p class="v4-channel-meta">([^·<]*)/.exec(channelItem(CHANNEL, lang, doc))[1].trim();

test('channel panel and stats strip render the same Telegram number', () => {
  const doc = homeDocFor({ telegram: 1200, linkedin: 5000, youtube: 130 });
  const panel = channelItem(CHANNEL, 'ru', doc);
  const stats = renderers.stats(doc, 'ru', false);
  const tg = counters(doc, 'ru').telegram;
  assert.equal(tg, '1\u00a0200');
  assert.ok(panel.includes(`<p class="v4-channel-meta">${tg}&nbsp;подписчиков · `), panel);
  assert.ok(stats.includes(`Telegram:</span>&nbsp;${tg}`), stats);
  // Channels are abbreviations, never icons.
  assert.match(stats, /<span aria-hidden="true">TG<\/span>/);
  assert.doesNotMatch(stats, /<svg/);
  // No placeholder is left for a reader: the number is rendered, not substituted into a template.
  assert.doesNotMatch(panel + stats, /\{(telegram|linkedin|youtube|total)\}/);
  // With the stat off auto both show the doc's own number.
  const off = homeDocFor({ telegram: 9, linkedin: 9, youtube: 9 });
  off.stats[1].auto = false;
  assert.equal(readers(off), '1\u00a0141&nbsp;подписчик');
  assert.ok(renderers.stats(off, 'ru', false).includes('Telegram:</span>&nbsp;1\u00a0141'));
});

test('channel panel declines «подписчик» by the number it shows; no number — no count', () => {
  const live = (telegram) => homeDocFor({ telegram, linkedin: 0, youtube: 0 });
  // The number is live, so the noun has to agree with whatever arrives.
  for (const [n, text] of [[1, '1&nbsp;подписчик'], [2, '2&nbsp;подписчика'], [5, '5&nbsp;подписчиков'], [11, '11&nbsp;подписчиков'], [21, '21&nbsp;подписчик'], [1157, '1\u00a0157&nbsp;подписчиков'], [1234, '1\u00a0234&nbsp;подписчика']]) {
    assert.equal(readers(live(n)), text);
  }
  assert.equal(readers(live(1), 'en'), '1&nbsp;subscriber');
  assert.equal(readers(live(1234), 'en'), '1,234&nbsp;subscribers');
  // Nothing to count: the line starts with the next fact, never «0 подписчиков» or a bare noun.
  assert.equal(readers(live(0)), 'пишу с 2022 года');
  assert.equal(readers({ stats: [], sections: {} }), 'пишу с 2022 года');
  assert.equal(readers({ stats: [], sections: {} }, 'en'), 'writing since 2022');
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

test('renderPageJsonLd: consulting offers follow the doc, about gets a breadcrumb', () => {
  const collab = {
    dateModified: '2026-09-03',
    meta: { title: { ru: 'Сотрудничество — Семён Моргунов | morgunov.tech', en: 'Collaborate — Semyon Morgunov | morgunov.tech' } },
    hero: { name: { ru: 'Сотрудничество', en: 'Collaborate' } },
    sections: { consulting: { tiers: [
      { name: { ru: 'Разовая консультация', en: 'Single consultation' }, price: { ru: '$250 / <strong>SESSION</strong>', en: '$250 / <strong>SESSION</strong>' }, features: [{ ru: '75 минут', en: '75 minutes' }] },
      { name: { ru: 'Цикл', en: 'Cycle' }, price: { ru: '$2&nbsp;000 / <strong>MONTH</strong>', en: '$2,000 / <strong>MONTH</strong>' }, features: [{ ru: '5 сессий', en: '5 sessions' }] },
    ] } },
  };
  const g = JSON.parse(renderPageJsonLd(collab, 'en', 'consulting'))['@graph'];
  const page = g.find((n) => n['@type'] === 'WebPage');
  assert.equal(page.name, 'Collaborate — Semyon Morgunov');
  assert.equal(page.url, 'https://s.morgunov.tech/en/consulting');
  assert.equal(page.dateModified, '2026-09-03');
  const offers = g.find((n) => n['@type'] === 'Service').hasOfferCatalog.itemListElement;
  assert.deepEqual(offers.map((o) => [o.name, o.price, o.description]), [['Single consultation', '250', '75 minutes'], ['Cycle', '2000', '5 sessions']]);
  const uses = { dateModified: '2026-11-25', meta: { title: { ru: 'Стек и принципы — Семён Моргунов', en: 'Uses and principles — Semyon Morgunov' } }, hero: { name: { ru: 'Стек и принципы', en: 'Uses and principles' } }, sections: {} };
  const ga = JSON.parse(renderPageJsonLd(uses, 'ru', 'uses'))['@graph'];
  const bc = ga.find((n) => n['@type'] === 'BreadcrumbList');
  assert.deepEqual(bc.itemListElement.map((i) => i.name), ['Главная', 'Стек и принципы']);
  assert.equal(ga.find((n) => n['@type'] === 'WebPage').breadcrumb['@id'], 'https://s.morgunov.tech/uses#breadcrumb');
});

test('home JSON-LD: ProfilePage + mainEntity, Person url stable across languages, product free/version', () => {
  const doc = docFor();
  doc.sections.products.items = [{ name: 'X', version: 'v2.5', desc: { ru: 'd', en: 'd' }, cta: { href: 'https://x.example' } }];
  for (const lang of ['ru', 'en']) {
    const g = JSON.parse(renderJsonLd(doc, lang))['@graph'];
    const page = g.find((n) => Array.isArray(n['@type']) && n['@type'].includes('ProfilePage'));
    assert.equal(page.mainEntity['@id'], 'https://s.morgunov.tech/#person');
    // Search Console rejects a bare date here: both must be full date-times with an offset.
    const dateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
    assert.match(page.dateCreated, dateTime);
    assert.equal(page.dateModified, '2026-05-26T00:00:00Z');
    assert.equal(JSON.parse(renderJsonLd({ ...doc, updatedAt: '2026-11-25T09:30:00.000Z' }, lang))['@graph'][1].dateModified, '2026-11-25T09:30:00.000Z');
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


/* --- v0.30.1 / v0.30.4: dead content is rewritten at read time --- */
import { fixStaleContent } from '../functions/_lib/migrations.js';

test('fixStaleContent: a doc without stale text comes back untouched', () => {
  const doc = { a: { b: 'Belissimo' }, list: ['x', { y: 'https://korzinka.uz/go' }] };
  const before = JSON.stringify(doc);
  assert.equal(fixStaleContent(doc), doc);
  assert.equal(JSON.stringify(doc), before);
  assert.equal(fixStaleContent(null), null);
  assert.equal(fixStaleContent('text'), 'text');
});

test('fixStaleContent v4.10.1: TofsDevOps opens with what it is, and the table holds no invisible character itself', async () => {
  const nb = String.fromCharCode(0xa0);
  const doc = { desc: { ru: 'Сам себе DevOps в' + nb + 'Telegram. Если сайт перестал открываться', en: 'Your personal DevOps in Telegram. If your site goes down' } };
  fixStaleContent(doc);
  assert.equal(doc.desc.ru, 'Мониторинг сайтов для тех, кто не знает, что такое DNS и ошибка 502. Если сайт перестал открываться');
  assert.equal(doc.desc.en, 'Website monitoring for people who have never heard of DNS or a 502. If your site goes down');
  const once = JSON.stringify(doc);
  fixStaleContent(doc);
  assert.equal(JSON.stringify(doc), once);
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../functions/_lib/migrations.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /[\u00a0\u2011\u2060]/, 'escapes, never the characters (CLAUDE.md, «Typography pass»)');
});

test('fixStaleContent v4.9.2: 7 working days, no «или e-com» — with plain or no-break spaces, and only once', () => {
  const nb = String.fromCharCode(0xa0);
  const doc = {
    reply: { ru: 'Обычно отвечаю в течение 10 рабочих дней.', en: 'I usually reply within 10' + nb + 'business days.' },
    note: { ru: 'Пишите, если нужен взгляд со стороны на продукт или e-com или хотите обсудить пост.', en: 'Write if you need an outside view on a product or e-com, or want to discuss a post.' },
    other: ['за 110 рабочих дней', 'В 2010 году'],
  };
  fixStaleContent(doc);
  assert.equal(doc.reply.ru, 'Обычно отвечаю в течение 7 рабочих дней.');
  assert.equal(doc.reply.en, 'I usually reply within 7' + nb + 'business days.');
  // v4.10.3 also turns «пост» into «публикацию» in the same pass.
  assert.equal(doc.note.ru, 'Пишите, если нужен взгляд со стороны на продукт или хотите обсудить публикацию.');
  assert.equal(doc.note.en, 'Write if you need an outside view on a product, or want to discuss a publication.');
  assert.deepEqual(doc.other, ['за 110 рабочих дней', 'В 2010 году'], 'a 10 inside another number stays');
  const once = JSON.stringify(doc);
  fixStaleContent(doc);
  assert.equal(JSON.stringify(doc), once, 'a second pass changes nothing');
});

test('fixStaleContent v4.10.3: the homepage pass reaches a KV doc — plain or no-break spaces, whole fields only where anchored, once', () => {
  const nb = String.fromCharCode(0xa0);
  const EBRD = 'https://www.ebrd.com/home/news-and-events/news/2025/ebrd-welcomes-major-investment-in-uzbek-food-retailer-.html';
  const doc = {
    tagline: { ru: 'Строю продукты на растущих рынках, делаю инструменты про' + nb + 'приватность и пишу о том, что понял по дороге.', en: 'I build products in growing markets, make privacy tools, and write about what I\'ve learned along the way.' },
    stats: [{ unit: { en: 'yrs in tech' } }, { unit: { ru: 'подписчиков', en: 'followers' } }],
    korzinka: { ru: 'Строил продукт, затем отвечал за P&L' + nb + 'в крупнейшем e-grocery Узбекистана.\n\n- Заказы в день: ×23 за 3 года, пик — 10' + nb + '000 (ATH)' },
    yandex: { ru: '[Yandex Uslugi](https://uslugi.yandex.ru/)', prose: 'Управлял P&L в **Yandex Uslugi** (GMV ×2,2)' },
    skyeng: { ru: 'Крупнейшая EdTech-компания Восточной Европы.\n\n- Активировал 7' + nb + 'млн+ пользователей' },
    about: { ru: 'одновременно.\n\nС 2009 года запустил четыре бизнеса — один продали сотрудникам, два закрыли, один на паузе. Сейчас делаю сервисы для бизнеса и авторов — мониторинг сайтов, безопасность аккаунтов, приватность; все бесплатные и с открытым' + nb + 'кодом. Веду [Telegram-канал](https://t.me/raschet7).' },
    title: { ru: 'Собственные проекты' },
    untouched: ['подписчиков в LinkedIn — senior-специалисты', 'Собственные проекты на GitHub', 'followers on Telegram', 'Я делаю инструменты про приватность и не могу при этом следить за читателями.'],
  };
  fixStaleContent(doc);
  assert.equal(doc.tagline.ru, 'Строю продукты на растущих рынках, разрабатываю open source сервисы и пишу о том, что понял по дороге.');
  assert.equal(doc.tagline.en, 'I build products in growing markets, develop open source services, and write about what I\'ve learned along the way.');
  assert.deepEqual(doc.stats, [{ unit: { en: 'years in tech' } }, { unit: { ru: 'подписок', en: 'follows' } }]);
  assert.equal(doc.korzinka.ru, 'Строил продукт, затем отвечал за P&L' + nb + 'онлайн-супермаркета [ведущей продуктовой сети Узбекистана](' + EBRD + ').\n\n- Заказы в день: ×23 за 3 года, пик — 10' + nb + '000');
  assert.deepEqual(doc.yandex, { ru: '[Яндекс Услуги](https://uslugi.yandex.ru/)', prose: 'Управлял P&L в **Яндекс Услугах** (GMV ×2,2)' });
  assert.match(doc.skyeng.ru, /^\[Одна из трёх крупнейших EdTech-компаний России\]\(https:\/\/skillbox\.ru\/[^)]+\) по выручке\.\n\n- Активация: 7\u00a0млн\+ пользователей$/);
  assert.equal(doc.about.ru, 'одновременно.\n\nВеду [Telegram-канал](https://t.me/raschet7).');
  assert.equal(doc.title.ru, 'Свои проекты');
  assert.deepEqual(doc.untouched, ['подписчиков в LinkedIn — senior-специалисты', 'Собственные проекты на GitHub', 'followers on Telegram', 'Я делаю инструменты про приватность и не могу при этом следить за читателями.']);
  const once = JSON.stringify(doc);
  fixStaleContent(doc);
  assert.equal(JSON.stringify(doc), once, 'a second pass changes nothing');
});

test('fixStaleContent: the seed already holds every swap — the table changes nothing in it', async () => {
  const { readFileSync } = await import('node:fs');
  const seed = JSON.parse(readFileSync(new URL('../content.seed.json', import.meta.url), 'utf8'));
  const before = JSON.stringify(seed);
  for (const page of Object.keys(seed)) fixStaleContent(seed[page]);
  assert.equal(JSON.stringify(seed), before);
});

test('noindexOnTechnicalHost marks pages.dev hosts only, replacing any earlier value', () => {
  const res = () => new Response('x', { headers: { 'X-Robots-Tag': 'index, follow' } });
  for (const host of ['about-me-page-cr2.pages.dev', 'abc123.about-me-page-cr2.pages.dev']) {
    assert.equal(noindexOnTechnicalHost(res(), `https://${host}/notes`).headers.get('x-robots-tag'), 'noindex');
  }
  const own = res();
  assert.equal(noindexOnTechnicalHost(own, 'https://s.morgunov.tech/notes'), own);
  assert.equal(own.headers.get('x-robots-tag'), 'index, follow');
  const moved = noindexOnTechnicalHost(Response.redirect('https://about-me-page-cr2.pages.dev/x', 308), 'https://about-me-page-cr2.pages.dev//x');
  assert.equal(moved.status, 308);
  assert.equal(moved.headers.get('x-robots-tag'), 'noindex');
});

test('scripts/hash-password.mjs makes hashes the site can verify (Workers: at most 100 000 PBKDF2 iterations)', async () => {
  const { execFileSync } = await import('node:child_process');
  const { MAX_PBKDF2_ITERATIONS } = await import('../functions/_lib/auth.js');
  const script = new URL('../scripts/hash-password.mjs', import.meta.url).pathname;
  const out = execFileSync(process.execPath, [script, 'pw'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  assert.doesNotMatch(out, /\n$/, 'no newline when piped');
  const iterations = Number(out.split('$')[2]);
  assert.ok(iterations <= MAX_PBKDF2_ITERATIONS, `${iterations} iterations`);
  assert.equal(await verifyPassword('pw', out), true);
});
