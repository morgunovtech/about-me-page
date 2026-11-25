// v0.30: one escaping contract, revocable sessions, edge cache, overlay hooks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderInline, renderProse, typoText, typo } from '../functions/_lib/markdown.js';
import { renderers } from '../functions/_lib/render.js';
import { notesIndexHtml } from '../functions/_lib/article-template.js';
import { createSession, verifySession, NOT_BEFORE_KEY } from '../functions/_lib/auth.js';
import { cached, purge, cacheKey, PAGE_PATHS, articlePaths, VERSION_KEY } from '../functions/_lib/cache.js';
import { renderPageJsonLd } from '../functions/_lib/jsonld.js';

// --- markdown subset: inline code + bold, escaped ---
test('renderInline: `code` and **bold** render, HTML in text is escaped', () => {
  assert.equal(renderInline('promo `SEMYON5076` and **Dark Web**'), 'promo <code>SEMYON5076</code> and <strong>Dark Web</strong>');
  assert.equal(renderInline('<img src=x onerror=alert(1)> `**not bold**`'), '&lt;img src=x onerror=alert(1)&gt; <code>**not bold**</code>');
  assert.equal(renderInline('$2 000 / **MONTH**'), '$2 000 / <strong>MONTH</strong>');
});

// --- HTML fragment → markdown subset (seed + KV migration share it) ---


test('/uses and /consulting renderers escape a hostile leaf and keep markdown emphasis', () => {
  const uses = { sections: { software: { intro: { ru: 'i', en: 'i' }, cards: [{ name: 'N <script>x</script>', tag: { ru: 't', en: 't' }, price: { ru: '$5 / **mo**', en: '$5 / **mo**' }, desc: { ru: 'code `Z`', en: 'code `Z`' }, cta: { href: 'https://a.example', label: { ru: 'go', en: 'go' } } }] } } };
  const html = renderers.usesProducts(uses, 'ru');
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /N &lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, /\$5 \/ <strong>mo<\/strong>/);
  assert.match(html, /<code>Z<\/code>/);
  // v1.2.7: the tier buttons lead to Telegram (no calendar booking), the lead
  // phrase and the reply note are leaves like any other — escaped.
  const collab = { sections: { consulting: { prose: { ru: 'Lead <b>x</b> **y**' }, note: { ru: 'Reply <i>z</i>' }, tiers: [{ tag: { ru: 'РАЗОВО' }, price: { ru: '**$250** / сессия' }, name: { ru: 'Разовая', en: 'Single' }, features: [{ ru: '75 **минут**' }], cta: { href: 'https://t.me/s_mrgnv', label: { ru: 'Написать в Telegram' } } }] } } };
  const tiers = renderers.collabConsulting(collab, 'ru');
  // The head of a tier: the caption and the price — the amount in markdown bold, then the unit.
  assert.match(tiers, /<div class="v4-product-head">\s*<span class="v4-tag">РАЗОВО<\/span>\s*<span class="v4-pricing"><strong>\$250<\/strong> \/ сессия<\/span>\s*<\/div>/);
  assert.match(tiers, /<li>75 <strong>минут<\/strong><\/li>/);
  assert.match(tiers, /class="v4-btn" href="https:\/\/t\.me\/s_mrgnv" target="_blank" rel="noopener noreferrer">Написать в Telegram<\/a>/);
  assert.match(tiers, /^<p class="v4-tagline v4-tagline--compact">Lead &lt;b&gt;x&lt;\/b&gt; <strong>y<\/strong><\/p>/);
  assert.match(tiers, /<p class="v4-terms">Reply &lt;i&gt;z&lt;\/i&gt;<\/p>$/);
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
  // tagName as HTMLRewriter gives it: the element's name in lower case.
  constructor(tag, attrs, inner) { this.tag = tag; this.tagName = tag.toLowerCase(); this.attrs = attrs; this.inner = inner; this.removed = false; }
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

// --- typography: where a line must not break (markdown.js typoText / typo) ---
// The content stays plain; the pass runs on text on its way to a PUBLIC page.
const NB = '\u00a0'; // no-break space
const NBH = '\u2011'; // no-break hyphen
const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));

test('typoText: a hyphen after a one-letter prefix does not break', () => {
  // «e-com» and «e-grocery» used to end a line with «e-».
  assert.equal(typoText('e-com and e-grocery', 'en'), `e${NBH}com and e${NBH}grocery`);
  assert.equal(typoText('E-com, an x-ray, a T-shirt (e-mail)', 'en'), `E${NBH}com, an x${NBH}ray, a T${NBH}shirt (e${NBH}mail)`);
  assert.equal(typoText('в-третьих', 'ru'), `в${NBH}третьих`);
  // A longer first part may break like any compound: only a single letter is left hanging.
  for (const s of ['юнит-экономика', 'Wi-Fi', 're-do', 'из-за', 'Telegram-канал', 'ИТ-компания']) assert.equal(typoText(s, 'ru'), s, s);
  // Not a word: a digit on either side of the hyphen.
  for (const s of ['2-х', 'e-2', '5-7']) assert.equal(typoText(s, 'ru'), s, s);
});

test('typoText: a «·» stays with the item before it, a «—» with the word before it', () => {
  // A line never starts with a separator or a dash; the space after it is the place to break.
  assert.equal(typoText('EdTech · E-com · FinTech', 'en'), `EdTech${NB}· E${NBH}com${NB}· FinTech`);
  assert.equal(typoText('2026 — сейчас', 'ru'), `2026${NB}— сейчас`);
  assert.equal(typoText('Notes — and talks', 'en'), `Notes${NB}— and talks`);
  assert.equal(typoText('a \t · b', 'en'), `a${NB}· b`);
  assert.equal(typoText('the last word —', 'en'), `the last word${NB}—`);
  // A dash glued to the next word is not a separator between two, and is left as typed.
  assert.equal(typoText('a —b', 'en'), 'a —b');
});

test('typoText, Russian: a one- or two-letter preposition, conjunction or «не» / «ни» stays with the word after it', () => {
  // No «и», «в», «на» hanging at the end of a line.
  const SHORT = ['в', 'к', 'с', 'у', 'о', 'и', 'а', 'я', 'не', 'ни', 'на', 'но', 'по', 'за', 'из', 'до', 'от', 'об', 'со', 'во', 'ко'];
  for (const w of SHORT) {
    assert.equal(typoText(`слово ${w} слово`, 'ru'), `слово ${w}${NB}слово`, w);
    // At the start of a sentence — capitalised — and after an opening bracket or quote.
    const W = w[0].toUpperCase() + w.slice(1);
    assert.equal(typoText(`${W} слово`, 'ru'), `${W}${NB}слово`, W);
    assert.equal(typoText(`(${w} слово) «${w} слово»`, 'ru'), `(${w}${NB}слово) «${w}${NB}слово»`, w);
  }
  // Several in a row: each keeps the next («и в этом» — the second starts where the first ended).
  assert.equal(typoText('и в этом доме', 'ru'), `и${NB}в${NB}этом доме`);
  assert.equal(typoText('а и в с этим', 'ru'), `а${NB}и${NB}в${NB}с${NB}этим`);
  assert.equal(typoText('я не из тех, кто у моря о погоде', 'ru'), `я${NB}не${NB}из${NB}тех, кто у${NB}моря о${NB}погоде`);
  // Before a number as before a word: «в 2 раза», «с 2009» (and the number keeps its own word).
  assert.equal(typoText('рост в 2 раза с 2009', 'ru'), `рост в${NB}2${NB}раза с${NB}2009`);
  // Not a short word: the tail of a longer one, a word of three letters, a word nothing follows.
  for (const s of ['кино вино', 'это для них', 'про это', 'кот и']) assert.equal(typoText(s, 'ru'), s, s);
  // The Latin look-alikes of «а», «с», «о» are not Russian words.
  assert.equal(typoText('plan a trip', 'ru'), 'plan a trip');
  // A page is Russian unless it says «en».
  assert.equal(typoText('в доме'), `в${NB}доме`);
});

test('typoText: a number stays with its word, a group of thousands with its number; a range and an arrow do not break off', () => {
  const WJ = String.fromCharCode(0x2060); // word joiner
  // «4 / работают» and «1 / продан» broke in the stats strip of a phone.
  assert.equal(typoText('10 лет в IT', 'ru'), `10${NB}лет в${NB}IT`);
  assert.equal(typoText('с 2009 · 1 продан · 4 работают', 'ru'), `с${NB}2009${NB}· 1${NB}продан${NB}· 4${NB}работают`);
  assert.equal(typoText('15+ years, 100% cotton, 75 minutes', 'en'), `15+${NB}years, 100%${NB}cotton, 75${NB}minutes`);
  assert.equal(typoText('выросла до 20 000 точек, 3 000 000 сумов', 'ru'), `выросла до${NB}20${NB}000${NB}точек, 3${NB}000${NB}000${NB}сумов`);
  // A range: an en dash allows a break after it — «3–» ended a line on /uses.
  assert.equal(typoText('3–4 часа в день', 'ru'), `3–${WJ}4${NB}часа в${NB}день`);
  // An arrow stays with the word it follows («Гайд по использованию / →» in a button) or leads.
  assert.equal(typoText('Гайд по использованию →', 'ru'), `Гайд по${NB}использованию${NB}→`);
  assert.equal(typoText('← Все публикации', 'ru'), `←${NB}Все публикации`);
  assert.equal(typoText('e-com → FinTech', 'en'), `e${NBH}com${NB}→ FinTech`);
  // Not a number with its word: a digit before punctuation, a price before its slash, a version.
  for (const s of ['1. Потеря', '$300 / сессия', 'v3.13', '5–7%']) {
    assert.equal(typoText(s, 'ru').split(WJ).join(''), s, s);
  }
  // Only a number that stands on its own counts something: the tail of an address, of a model
  // name or of a version does not. («…/raschet7/76 и t.me/…» tied three links of a note into
  // one string wider than a phone.)
  assert.equal(typoText('t.me/raschet7/76 и t.me/raschet7/77', 'ru'), `t.me/raschet7/76 и${NB}t.me/raschet7/77`);
  assert.equal(typoText('RG405V играет в PSP', 'ru'), `RG405V играет в${NB}PSP`);
  // …and a function word after a number is not counted by it.
  assert.equal(typoText('iPhone 15 и iPad', 'ru'), `iPhone 15 и${NB}iPad`);
  assert.equal(typoText('с 2009 по 2012 год', 'ru'), `с${NB}2009 по${NB}2012${NB}год`);
  assert.equal(typoText('in 2007 the phone had 4 GB', 'en'), `in 2007 the phone had 4${NB}GB`);
});

test('typo: an inline tag does not hide a rule from its neighbours; a block does', () => {
  // A space that stands alone between two inline elements.
  assert.equal(typo('<a href="/x">Школа</a> <span>· Founder</span>', 'en'), `<a href="/x">Школа</a>${NB}<span>· Founder</span>`);
  // A number and its word on the two sides of a tag.
  assert.equal(typo('<strong>5</strong> лет', 'ru'), `<strong>5</strong>${NB}лет`);
  // Two elements side by side are not one phrase: the count that ends one link is not the
  // number of the next link's word. (That rule tied every topic of /notes to the next one — the
  // line of topics became one unbreakable string and ran off a phone's screen.)
  const topics = '<nav><span aria-current="page">Все<span class="v4-count">&nbsp;52</span></span> <a href="/t/a">Менеджмент команды<span class="v4-count">&nbsp;8</span></a> <a href="/t/b">Личная эффективность<span class="v4-count">&nbsp;9</span></a></nav>';
  assert.equal(typo(topics, 'ru'), topics);
  assert.equal(typo('<strong>5</strong> <em>лет</em>', 'ru'), '<strong>5</strong> <em>лет</em>');
  assert.equal(typo('<a href="/a">в</a> <a href="/b">доме</a>', 'ru'), '<a href="/a">в</a> <a href="/b">доме</a>');
  // A block is a boundary: nothing is glued across it.
  assert.equal(typo('<p>слово и</p> <p>слово</p>', 'ru'), '<p>слово и</p> <p>слово</p>');
  assert.equal(typo('<li>слово в</li> <li>доме</li>', 'ru'), '<li>слово в</li> <li>доме</li>');
  // A «>» inside a quoted attribute does not end the tag (the rest of the attribute was typeset).
  assert.equal(typo('<img alt="рост > в 2 раза"> в доме', 'ru'), `<img alt="рост > в 2 раза"> в${NB}доме`);
  assert.equal(typo("<a title='a > и в'>и в</a>", 'ru'), `<a title='a > и в'>и${NB}в</a>`);
});

test('typoText: English has no preposition rule; a second pass changes nothing; no text — an empty string', () => {
  assert.equal(typoText('in a house, at a table', 'en'), 'in a house, at a table');
  // Russian words on an English page (a quoted title) are not typeset as Russian.
  assert.equal(typoText('и в этом', 'en'), 'и в этом');
  // The public render may meet text that is already typeset — a fragment a renderer typeset
  // inside a page that is typeset again, or a no-break space the owner typed into the content.
  const SAMPLES = ['e-com и e-grocery', 'EdTech · E-com · FinTech', '2026 — сейчас', 'а и в с этим — и не только', 'я не из тех, кто у моря о погоде', 'с 2009 · 1 продан · 4 работают', 'Head of e-com — in a few words · more', `6${NB}069 подписчиков в${NB}Telegram`, `Telegram${NBH}канал — о продукте`];
  for (const lang of ['ru', 'en']) {
    for (const s of SAMPLES) {
      const once = typoText(s, lang);
      assert.equal(typoText(once, lang), once, `${lang}: ${s}`);
    }
  }
  assert.equal(typoText(null, 'ru'), '');
  assert.equal(typoText(undefined, 'en'), '');
});

test('typo: the same for a fragment of HTML — its text only, never a tag or an attribute, and nothing inside code', () => {
  assert.equal(typo('<a href="/e-x" title="и в e-x">и в e-x</a>', 'ru'), `<a href="/e-x" title="и в e-x">и${NB}в${NB}e${NBH}x</a>`);
  assert.equal(typo('<img src="/a-b.png" alt="e-com и в"> текст — и в e-x', 'ru'), `<img src="/a-b.png" alt="e-com и в"> текст${NB}— и${NB}в${NB}e${NBH}x`);
  // An entity is text like any other; a comment is not text.
  assert.equal(typo('1&nbsp;157&nbsp;подписчиков · пишу с 2022 года', 'ru'), `1&nbsp;157&nbsp;подписчиков${NB}· пишу с${NB}2022${NB}года`);
  assert.equal(typo('<!-- и в e-x --><p>и в e-x</p>', 'ru'), `<!-- и в e-x --><p>и${NB}в${NB}e${NBH}x</p>`);
  // Code is what a reader copies: a no-break hyphen in a command breaks the paste. The same for
  // the other elements whose text is not prose — and the pass picks up again after them.
  for (const tag of ['code', 'pre', 'script', 'style', 'textarea', 'CODE', 'Pre']) {
    const inside = `<${tag}>и в e-x — a</${tag}>`;
    assert.equal(typo(`${inside}<p>и в e-x</p>`, 'ru'), `${inside}<p>и${NB}в${NB}e${NBH}x</p>`, tag);
  }
  assert.equal(typo('<p>Команда <code>e-com и в</code>, а в тексте e-com</p>', 'ru'), `<p>Команда <code>e-com и в</code>, а${NB}в${NB}тексте e${NBH}com</p>`);
  assert.equal(typo('<pre><code>и в e-x</code> и в e-x</pre> и в e-x', 'ru'), `<pre><code>и в e-x</code> и в e-x</pre> и${NB}в${NB}e${NBH}x`);
  // English: the hyphen and the dash, no preposition rule.
  assert.equal(typo('<p>A note on e-com — in a few words</p>', 'en'), `<p>A note on e${NBH}com${NB}— in a few words</p>`);
  // A second pass changes nothing.
  for (const html of ['<p>e-com и <code>e-com</code>, а в тексте — e-com · и не только</p>', renderers.stats(seed.home, 'ru', false), renderers.career(seed.home, 'ru', false)]) {
    const once = typo(html, 'ru');
    assert.notEqual(once, html);
    assert.equal(typo(once, 'ru'), once);
  }
  assert.equal(typo(null, 'ru'), '');
  // What a renderer wrote into a tag survives the pass byte for byte.
  const career = renderers.career(seed.home, 'ru', false);
  assert.deepEqual(typo(career, 'ru').match(/<[^>]*>/g), career.match(/<[^>]*>/g));
});

test('typo: a separator that opens an element stays with the word before it (a venture\'s «· Founder»)', () => {
  // typo() used to work a text node at a time: the space before `<span class="role-aside">· …</span>`
  // stayed a plain one, and on a narrow screen a venture's role started a line with «·».
  const html = typo(renderers.ventures(seed.home, 'ru', false), 'ru');
  const names = [...html.matchAll(/<div class="name">([\s\S]*?)<\/div>/g)].map((m) => m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, NB));
  assert.equal(names.length, seed.home.sections.ventures.items.length);
  // Read as text, no «·» has a breakable space before it.
  for (const text of names) assert.doesNotMatch(text, /[ \t\n][·—]/, text);
});

test('typo: a short Russian word stays with the word after it when that word is a link or set in bold', () => {
  // «в <strong>Yandex Uzbekistan</strong>» kept a plain space: on /consulting four prepositions
  // before a company in bold (and one before a link on /uses) could hang at the end of a line.
  assert.equal(typo('в <strong>Яндексе</strong> и <a href="/x">на сайте</a>', 'ru'), `в${NB}<strong>Яндексе</strong> и${NB}<a href="/x">на${NB}сайте</a>`);
  // On the page: read as text, the typeset «Чем занимаюсь» of /consulting has nothing left to typeset.
  const text = typo(renderers.collabAbout(seed.consulting, 'ru'), 'ru').replace(/<[^>]*>/g, '');
  assert.equal(typoText(text, 'ru'), text);
});

test('overlay: the public page gets the typography pass; the editor and <title> get the text as stored', async () => {
  globalThis.HTMLRewriter = StubRewriter;
  const { overlay } = await import('../functions/_lib/overlay.js');
  const doc = {
    meta: { title: { ru: 'Заметки о e-com и продукте — Семён Моргунов' } },
    lead: { ru: 'Пишу о e-com и в целом — о продукте', en: 'A note on e-com — in a few words' },
    prose: { ru: 'Строю **e-grocery** в Ташкенте и не только' },
    raw: { ru: '<p>Команда <code>e-com и в</code>, а в тексте e-com</p>' },
    sections: { contact: { note: { ru: 'Пишите в Telegram — отвечу и по e-com' }, ctas: [{ href: 'https://t.me/e-x', label: { ru: 'Написать в Telegram' } }] } },
  };
  const tpl = '<title data-cms-text="meta.title">t</title><p data-cms-text="lead">t</p><div data-cms-md="prose">t</div><div data-cms-html="raw">t</div><div data-cms-list="collabContact">t</div><meta data-cms-content="lead" content="" />';
  const render = (lang, edit) => overlay(new Response(tpl), doc, lang, edit, () => '{}').text();

  const pub = await render('ru', false);
  // Every kind of content leaf is typeset: a text leaf, markdown, a stored HTML block, a list slot.
  assert.ok(pub.includes(`<p data-cms-text="lead">Пишу о${NB}e${NBH}com и${NB}в${NB}целом${NB}— о${NB}продукте</p>`), pub);
  assert.ok(pub.includes(`<div data-cms-md="prose"><p>Строю <strong>e${NBH}grocery</strong> в${NB}Ташкенте и${NB}не${NB}только</p></div>`), pub);
  assert.ok(pub.includes(`<div data-cms-html="raw"><p>Команда <code>e-com и в</code>, а${NB}в${NB}тексте e${NBH}com</p></div>`), pub);
  assert.ok(pub.includes(`<p class="v4-contact-note">Пишите в${NB}Telegram${NB}— отвечу и${NB}по${NB}e${NBH}com</p>`), pub);
  assert.ok(pub.includes(`href="https://t.me/e-x" target="_blank" rel="noopener noreferrer">Написать в${NB}Telegram</a>`), pub);
  // <title> stays plain — the browser's chrome, a search result and a share card read it — and
  // so does every attribute.
  assert.ok(pub.includes('<title data-cms-text="meta.title">Заметки о e-com и продукте — Семён Моргунов</title>'), pub);
  assert.ok(pub.includes('content="Пишу о e-com и в целом — о продукте"'), pub);

  // The editor: there the text on the page is the text of the doc — a typeset character would
  // be saved back into the content with the next edit.
  const edit = await render('ru', true);
  assert.doesNotMatch(edit, /[\u00a0\u2011]/);
  assert.ok(edit.includes('<p data-cms-text="lead">Пишу о e-com и в целом — о продукте</p>'), edit);
  assert.ok(edit.includes('<div data-cms-md="prose"><p>Строю <strong>e-grocery</strong> в Ташкенте и не только</p></div>'), edit);
  assert.ok(edit.includes(`<div data-cms-html="raw">${doc.raw.ru}</div>`), edit);
  assert.ok(edit.includes('<p class="v4-contact-note">Пишите в Telegram — отвечу и по e-com</p>'), edit);

  // An English page: the hyphen and the dash, no Russian rule.
  const en = await overlay(new Response('<p data-cms-text="lead">t</p>'), doc, 'en', false, () => '{}').text();
  assert.equal(en, `<p data-cms-text="lead">A note on e${NBH}com${NB}— in a few words</p>`);
  delete globalThis.HTMLRewriter;
});

test('the pages built without the overlay are typeset where they are built: the /notes intro, feed, channel panel and topic line', () => {
  const page = notesIndexHtml('ru', '', '{}', 'abc', { intro: 'Заметки и статьи — в одном месте' });
  assert.ok(page.includes(`<p class="v4-tagline">Заметки и${NB}статьи${NB}— в${NB}одном месте</p>`));
  // The same sentence in <head> — the description, the share card — stays as written, and so
  // does the title.
  assert.ok(page.includes('<meta name="description" content="Заметки и статьи — в одном месте" />'));
  assert.ok(page.includes('<meta property="og:description" content="Заметки и статьи — в одном месте" />'));
  assert.doesNotMatch(page.slice(0, page.indexOf('</head>')), /[\u00a0\u2011]/);
  // render-notes.js cannot be loaded here (it imports the seed the Functions bundler's way);
  // what it puts into the shell is typeset in its text.
  const rn = read('functions/_lib/render-notes.js');
  assert.match(rn, /const listHtml = typo\(feedListHtml\(feed, l\), l\);/);
  assert.match(rn, /channel: topic \? '' : typo\(channelHtml\(notesDoc, homeDoc, l\), l\),/);
  assert.match(rn, /topics: typo\(topicNavHtml\(topics, l, topic && topic\.key, total\), l\),/);
  // …and what is not a page stays plain: the feed for readers, the list for search engines.
  assert.doesNotMatch(rn.slice(rn.indexOf('export async function renderFeed')), /typo\(/);
  assert.doesNotMatch(rn.slice(rn.indexOf('export async function renderSitemap'), rn.indexOf('export async function renderFeed')), /typo\(/);
});


test('renderPageJsonLd strips markdown from Offer names/descriptions', () => {
  const doc = { dateModified: '2026-09-11', meta: { title: { ru: 'Сотрудничество — Семён Моргунов', en: 'Collaborate' } }, hero: { name: { ru: 'x', en: 'x' } },
    sections: { consulting: { tiers: [{ name: { ru: '**Разовая** `консультация`', en: 'Single' }, price: { ru: '$2\u00a0000 / **MONTH**', en: '$2,000' }, features: [{ ru: 'см. [сайт](https://x.test) и `код`', en: 'f' }] }] } } };
  const offer = JSON.parse(renderPageJsonLd(doc, 'ru', 'consulting'))['@graph'][1].hasOfferCatalog.itemListElement[0];
  assert.equal(offer.name, 'Разовая консультация'); assert.equal(offer.price, '2000'); assert.equal(offer.description, 'см. сайт и код');
});
