// v0.30: one escaping contract, revocable sessions, edge cache, overlay hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderInline, renderProse } from '../functions/_lib/markdown.js';
import { htmlToInline, migrateUses, MIGRATION } from '../functions/_lib/migrations.js';
import { renderers } from '../functions/_lib/render.js';
import { createSession, verifySession, NOT_BEFORE_KEY } from '../functions/_lib/auth.js';
import { cached, purge, cacheKey, PAGE_PATHS, articlePaths, VERSION_KEY } from '../functions/_lib/cache.js';
import { migrateCollaborate } from '../functions/_lib/migrations.js';
import { renderPageJsonLd } from '../functions/_lib/jsonld.js';

// --- markdown subset: inline code + bold, escaped ---
test('renderInline: `code` and **bold** render, HTML in text is escaped', () => {
  assert.equal(renderInline('promo `SEMYON5076` and **Dark Web**'), 'promo <code>SEMYON5076</code> and <strong>Dark Web</strong>');
  assert.equal(renderInline('<img src=x onerror=alert(1)> `**not bold**`'), '&lt;img src=x onerror=alert(1)&gt; <code>**not bold**</code>');
  assert.equal(renderInline('$2 000 / **MONTH**'), '$2 000 / <strong>MONTH</strong>');
});

// --- HTML fragment → markdown subset (seed + KV migration share it) ---
test('htmlToInline converts the legacy uses/collaborate fragments', () => {
  assert.equal(htmlToInline('$2&nbsp;000 / <strong>MONTH</strong>'), '$2 000 / **MONTH**');
  assert.equal(htmlToInline('Промокод <code>SEMYON5076</code> &amp; <b>bold</b>'), 'Промокод `SEMYON5076` & **bold**');
  assert.equal(htmlToInline('plain text'), 'plain text');
  assert.equal(htmlToInline(42), 42);
});

test('migrateUses converts every text leaf once and keeps hrefs/images/alt raw', () => {
  const doc = { sections: { software: { intro: { ru: 'a&nbsp;b', en: 'c' }, cards: [{ name: '<b>X</b>', price: { ru: '$5&nbsp;/&nbsp;mo' }, cta: { href: 'https://x?a=1&amp;b=2', label: { ru: 'go' } }, image: '/i.webp?v=1&amp;x' }] } } };
  migrateUses(doc);
  assert.equal(doc.migration, MIGRATION);
  assert.equal(doc.sections.software.intro.ru, 'a b');
  assert.equal(doc.sections.software.cards[0].name, '**X**');
  assert.equal(doc.sections.software.cards[0].price.ru, '$5 / mo');
  assert.equal(doc.sections.software.cards[0].cta.href, 'https://x?a=1&amp;b=2'); // untouched
  assert.equal(doc.sections.software.cards[0].image, '/i.webp?v=1&amp;x');
  const again = JSON.stringify(doc); migrateUses(doc); assert.equal(JSON.stringify(doc), again);
});

test('/uses and /collaborate renderers escape a hostile leaf and keep markdown emphasis', () => {
  const uses = { sections: { software: { intro: { ru: 'i', en: 'i' }, cards: [{ name: 'N <script>x</script>', tag: { ru: 't', en: 't' }, price: { ru: '$5 / **mo**', en: '$5 / **mo**' }, desc: { ru: 'code `Z`', en: 'code `Z`' }, cta: { href: 'https://a.example', label: { ru: 'go', en: 'go' } } }] } } };
  const html = renderers.usesProducts(uses, 'ru');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /N &lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /\$5 \/ <strong>mo<\/strong>/);
  assert.match(html, /<code>Z<\/code>/);
  const collab = { sections: { consulting: { tiers: [{ tag: { ru: 'РАЗОВО' }, price: { ru: '$250 / **SESSION**' }, name: { ru: 'Разовая', en: 'Single' }, features: [{ ru: '75 **минут**' }], cta: { href: 'https://book.example', label: { ru: 'Забронировать →' } } }] } } };
  const tiers = renderers.collabConsulting(collab, 'ru');
  assert.match(tiers, /<span class="v4-pricing">\$250 \/ <strong>SESSION<\/strong><\/span>/);
  assert.match(tiers, /<li>75 <strong>минут<\/strong><\/li>/);
  assert.match(tiers, /class="v4-btn" href="https:\/\/book.example" target="_blank" rel="noopener noreferrer">Забронировать →<\/a>/);
});

test('renderProse: paragraphs and lists from block markdown', () => {
  assert.equal(renderProse('one\n\n- a\n- b'), '<p>one</p><ul class="v4-list"><li>a</li><li>b</li></ul>');
});

// --- sessions: logout voids every token issued before ---
const fakeKv = () => { const m = new Map(); return { get: async (k) => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, String(v)); } }; };
test('verifySession rejects tokens issued before session:not-before', async () => {
  const env = { CONTENT: fakeKv() };
  const token = await createSession('secret');
  assert.ok(await verifySession('secret', token, env));
  await env.CONTENT.put(NOT_BEFORE_KEY, String(Math.floor(Date.now() / 1000) + 5)); // logout «in the future» → older token dead
  assert.equal(await verifySession('secret', token, env), null);
  assert.ok(await verifySession('secret', token)); // no env → signature/exp only (legacy callers)
  assert.equal(await verifySession('secret', token + 'x', env), null);
});

// --- edge cache: hit / miss / purge on a fake caches.default ---
test('cached() stores GET 200s, serves hits, purge() clears them', async () => {
  const store = new Map();
  globalThis.caches = { default: {
    match: async (req) => store.get(req.url) ? store.get(req.url).clone() : undefined,
    put: async (req, res) => { store.set(req.url, res); },
    delete: async (req) => store.delete(req.url),
  } };
  const ctx = { request: new Request('https://s.morgunov.tech/notes?utm=1'), waitUntil: (p) => p };
  let renders = 0;
  const render = async () => { renders++; return new Response('<html>' + renders, { status: 200, headers: { 'content-type': 'text/html' } }); };
  const a = await cached(ctx, render); assert.equal(await a.text(), '<html>1'); assert.equal(a.headers.get('x-edge-cache'), 'MISS');
  assert.match(a.headers.get('cache-control'), /s-maxage=300/);
  const b = await cached(ctx, render); assert.equal(b.headers.get('x-edge-cache'), 'HIT'); assert.equal(await b.text(), '<html>1'); assert.equal(renders, 1);
  assert.ok([...store.keys()][0].endsWith('/notes')); // query stripped from the key
  await purge(ctx.request, ['/notes']);
  const c = await cached(ctx, render); assert.equal(await c.text(), '<html>2');
  const head = await cached({ request: new Request('https://s.morgunov.tech/notes', { method: 'HEAD' }) }, render);
  assert.equal(renders, 3); assert.equal(head.headers.get('x-edge-cache'), null);
  assert.deepEqual(PAGE_PATHS.home, ['/', '/en/', '/llms.txt', '/sitemap.xml']);
  // duplicate slashes collapse into the canonical key; a KV content version becomes part of it
  assert.equal(cacheKey(new Request('https://x.test///uses?q=1')).url, 'https://x.test/uses');
  assert.equal(cacheKey(new Request('https://x.test/uses'), null, '42').url, 'https://x.test/uses?cv=42');
  const kv = fakeKv(); await kv.put(VERSION_KEY, '7');
  const vctx = { request: new Request('https://x.test/uses'), env: { CONTENT: kv } };
  await cached(vctx, render); assert.ok([...store.keys()].some((k) => k.endsWith('/uses?cv=7')));
  await purge(vctx.request, ['/uses'], vctx.env); assert.notEqual(await kv.get(VERSION_KEY), '7'); // bumped → every colo re-renders
  assert.ok(articlePaths('x').includes('/en/notes/x') && articlePaths('x').includes('/sitemap.xml'));
  delete globalThis.caches;
});

// --- overlay handlers through a minimal HTMLRewriter stub ---
class StubEl {
  constructor(tag, attrs, inner) { this.tag = tag; this.attrs = attrs; this.inner = inner; this.removed = false; }
  getAttribute(n) { return this.attrs[n] ?? null; }
  setAttribute(n, v) { this.attrs[n] = v; }
  removeAttribute(n) { delete this.attrs[n]; }
  setInnerContent(html, { html: raw } = {}) { this.inner = raw ? html : html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  remove() { this.removed = true; }
}
class StubRewriter {
  constructor() { this.hs = []; }
  on(sel, h) { this.hs.push([sel.match(/^\[([^\]]+)\]$/)[1], h]); return this; }
  transform(res) {
    const hs = this.hs;
    return { text: async () => {
      const html = await res.text();
      return html.replace(/<(\w+)([^>]*?)(\/?)>(?:([^<]*)<\/\1>)?/g, (m, tag, attrStr, selfClose, inner) => {
        const attrs = {}; for (const [, k, v] of attrStr.matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[k] = v ?? '';
        if (!Object.keys(attrs).some((k) => k.startsWith('data-cms-'))) return m;
        const el = new StubEl(tag, attrs, inner ?? '');
        for (const [attr, h] of hs) if (attr in el.attrs) h.element(el);
        if (el.removed) return '';
        const a = Object.entries(el.attrs).map(([k, v]) => (v === '' ? k : `${k}="${v}"`)).join(' ');
        return inner == null ? `<${tag} ${a}${selfClose}>` : `<${tag} ${a}>${el.inner}</${tag}>`;
      });
    } };
  }
}
test('overlay: text is escaped, {build} resolves, omit removes, jsonld regenerates, a throwing handler keeps the template', async () => {
  globalThis.HTMLRewriter = StubRewriter;
  const { overlay } = await import('../functions/_lib/overlay.js');
  const doc = { t: { ru: '<b>x</b>' }, body: { ru: 'Build <code>{build}</code>' }, _build: 'abc1234', _noEn: true, href: 'javascript:alert(1)', jsonld: 1 };
  const tpl = '<p data-cms-text="t">old</p><div data-cms-html="body">old</div><link data-cms-omit="_noEn" /><a data-cms-href="href">l</a><script data-cms-jsonld></script><span data-cms-text="missing.path">keep</span>';
  const out = await overlay(new Response(tpl), doc, 'ru', false, () => '{"ok":true}').text();
  assert.match(out, /<p data-cms-text="t">&lt;b&gt;x&lt;\/b&gt;<\/p>/);
  assert.match(out, /Build <code>abc1234<\/code>/);
  assert.doesNotMatch(out, /data-cms-omit/);
  assert.match(out, /href="#"/);
  assert.match(out, /<script data-cms-jsonld>{"ok":true}<\/script>/);
  assert.match(out, /keep<\/span>/);
  const broken = await overlay(new Response('<p data-cms-text="t">old</p>'), doc, 'ru', false, () => { throw new Error('x'); }).text();
  assert.match(broken, /old|x/); // guard(): a throwing handler never truncates the page
  delete globalThis.HTMLRewriter;
});

test('migrateCollaborate puts the primary CTA first in legacy hero.ctas', () => {
  const doc = { sections: {}, hero: { ctas: { ru: '<a class="v4-btn" href="/">← На главную</a>\n            <a class="v4-btn v4-btn-primary" href="https://t.me/x">Telegram</a>', en: '<a class="v4-btn v4-btn-primary" href="https://t.me/x">Telegram</a>\n<a class="v4-btn" href="/en/">← Home</a>' } } };
  migrateCollaborate(doc);
  assert.equal(doc.hero.ctas.ru, '<a class="v4-btn v4-btn-primary" href="https://t.me/x">Telegram</a>\n<a class="v4-btn" href="/">← На главную</a>');
  assert.equal(doc.hero.ctas.en, '<a class="v4-btn v4-btn-primary" href="https://t.me/x">Telegram</a>\n<a class="v4-btn" href="/en/">← Home</a>');
});

test('renderPageJsonLd strips markdown from Offer names/descriptions', () => {
  const doc = { dateModified: '2026-09-11', meta: { title: { ru: 'Сотрудничество — Семён Моргунов', en: 'Collaborate' } }, hero: { name: { ru: 'x', en: 'x' } },
    sections: { consulting: { tiers: [{ name: { ru: '**Разовая** `консультация`', en: 'Single' }, price: { ru: '$2\u00a0000 / **MONTH**', en: '$2,000' }, features: [{ ru: 'см. [сайт](https://x.test) и `код`', en: 'f' }] }] } } };
  const offer = JSON.parse(renderPageJsonLd(doc, 'ru', 'collaborate'))['@graph'][1].hasOfferCatalog.itemListElement[0];
  assert.equal(offer.name, 'Разовая консультация'); assert.equal(offer.price, '2000'); assert.equal(offer.description, 'см. сайт и код');
});
