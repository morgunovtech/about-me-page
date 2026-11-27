// v0.31.2 — Telegram is the only contact, /about is hidden, no scroll chrome.
// v1.2.7 — e-mail is back as the second contact (owner's decision 2026-11-24),
// only where he put it: the home «Связаться» block, llms.txt, JSON-LD Person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { notesIndexHtml } from '../functions/_lib/article-template.js';
import { renderers } from '../functions/_lib/render.js';
import { renderJsonLd } from '../functions/_lib/jsonld.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const PAGES = ['index.html', 'en/index.html', 'collaborate.html', 'en/collaborate.html', 'consulting.html', 'en/consulting.html', 'uses.html', 'en/uses.html', 'privacy.html', 'en/privacy.html'];

test('e-mail only where the owner put it: home «Связаться», llms.txt, JSON-LD; Telegram stays first', () => {
  for (const f of ['collaborate.html', 'en/collaborate.html', 'consulting.html', 'en/consulting.html', 'uses.html', 'en/uses.html', 'privacy.html', 'en/privacy.html', '.well-known/security.txt']) {
    assert.doesNotMatch(read(f), /mailto:|s@morgunov\.tech/, f);
  }
  for (const f of ['index.html', 'en/index.html']) {
    // One mailto, in the contact panel, in a line under the Telegram button.
    const row = read(f).split('data-cms-list="contact"')[1].split('</section>')[0];
    assert.ok(row.indexOf('href="https://t.me/s_mrgnv"') < row.indexOf('href="mailto:s@morgunov.tech"'), f);
    assert.equal((read(f).match(/mailto:/g) || []).length, 1, f);
  }
  const llms = read('llms.txt');
  assert.ok(llms.indexOf('- Telegram (main): https://t.me/s_mrgnv') < llms.indexOf('- Email: s@morgunov.tech'));
  assert.match(read('.well-known/security.txt'), /^Contact: https:\/\/t\.me\/s_mrgnv$/m);
  for (const lang of ['ru', 'en']) {
    const person = JSON.parse(renderJsonLd(seed.home, lang))['@graph'].find((n) => n['@type'] === 'Person');
    assert.equal(person.email, 's@morgunov.tech');
  }
  // A doc without seo.email (an older KV doc) publishes no email at all.
  const old = JSON.parse(JSON.stringify(seed.home));
  delete old.seo.email;
  assert.doesNotMatch(renderJsonLd(old, 'en'), /"email"/);
});

test('footer (v3.0.0): one link of its own — «Сказать спасибо или сообщить об ошибке» → /thanks; no notes/about/uses links', () => {
  const footers = [...PAGES, 'thanks.html', 'en/thanks.html', 'social-tracker.html', 'en/social-tracker.html', 'tofsdevops.html', 'en/tofsdevops.html'].map((f) => read(f).match(/<footer class="v4-foot">[\s\S]*?<\/footer>/)[0]);
  footers.push(notesIndexHtml('ru', '', '{}', 'abc1234', { intro: 'x' }).match(/<footer class="v4-foot">[\s\S]*?<\/footer>/)[0]);
  for (const f of footers) {
    assert.doesNotMatch(f, /href="(\/en)?\/(notes|about|uses)"/);
    // Typeset: «об» stays with «ошибке» (an entity in a template, the character in the notes shell).
    assert.match(f, /<a href="(\/en)?\/thanks">(Сказать спасибо или сообщить об(?:&nbsp;|\s)ошибке|Say thanks or report a bug)<\/a><\/span>/);
    // …and no «·» of the line can start a row of its own.
    assert.doesNotMatch(f, /[ \t\n]·/, 'a separator stays with the word before it');
    assert.doesNotMatch(f, /t\.me\/s_mrgnv/, 'mistakes are reported from /thanks');
  }
});

test('v4.0.0: /about is a section of /uses — the pages are gone, the old URLs redirect, every page is indexable', () => {
  for (const f of ['about.html', 'en/about.html']) assert.throws(() => read(f), f);
  for (const f of ['index.html', 'collaborate.html', 'consulting.html', 'privacy.html', 'uses.html', 'en/uses.html', 'thanks.html', 'en/thanks.html', 'social-tracker.html', 'en/social-tracker.html', 'tofsdevops.html', 'en/tofsdevops.html']) assert.doesNotMatch(read(f), /name="robots" content="noindex"/, f);
  const mw = read('functions/_middleware.js');
  assert.match(mw, /'\/about': '\/uses#principles'/);
  assert.match(mw, /'\/en\/about': '\/en\/uses#principles'/);
  // The old address redirects in any spelling a link may carry — /about, /about/ and
  // /about.html (the page was a file, so old links name the file too): the table is looked up
  // as asked and then without the «.html» or the slash at the end.
  assert.match(mw, /const moved = MOVED\[pathname\] \|\| MOVED\[pathname\.replace\(\/\(\?:\\\.html\|\\\/\)\$\/, ''\)\];\s+if \(moved\) \{\s+return withSecurityHeaders\(Response\.redirect\(new URL\(moved, request\.url\)\.toString\(\), 301\)\);\s+\}/);
  // The same lookup, run: the table and the expression are read from the source.
  const MOVED = Object.fromEntries([.../export const MOVED = \{([\s\S]*?)\};/.exec(mw)[1].matchAll(/'([^']+)': '([^']+)'/g)].map((m) => [m[1], m[2]]));
  assert.deepEqual(MOVED, { '/about': '/uses#principles', '/en/about': '/en/uses#principles' });
  const tail = new RegExp(/MOVED\[pathname\.replace\(\/(.+?)\/, ''\)\]/.exec(mw)[1]);
  const moved = (pathname) => MOVED[pathname] || MOVED[pathname.replace(tail, '')];
  for (const [prefix, to] of [['', '/uses#principles'], ['/en', '/en/uses#principles']]) {
    for (const spelling of ['/about', '/about/', '/about.html']) assert.equal(moved(prefix + spelling), to, prefix + spelling);
  }
  // Nothing else is caught: a longer path, another page, the root.
  for (const path of ['/', '/en/', '/uses', '/uses/', '/aboutus', '/about/team', '/about.htm', '/notes/about', '/en/about/x.html']) {
    assert.equal(moved(path), undefined, path);
  }
  assert.doesNotMatch(mw, /page: 'about'/);
  assert.doesNotMatch(read('llms.txt'), /s\.morgunov\.tech\/(en\/)?about\b/);
  assert.match(read('llms.txt'), /s\.morgunov\.tech\/uses/);
});

test('/consulting: the contact goes to Telegram — the homepage\'s panel with one button and nothing under it', () => {
  const c = seed.consulting;
  // The angel section with its «Отправить питч →» is gone since v1.2.8.
  assert.equal(c.sections.angel, undefined);
  // Strategic consulting is the third tier since v4.6.0; its button is a tier's.
  assert.equal(c.sections.strategy, undefined);
  assert.equal(c.sections.consulting.tiers.find((t) => t.id === 'strategy').cta.href, 'https://t.me/s_mrgnv');
  const html = renderers.collabContact(c, 'ru');
  assert.equal((html.match(/class="v4-btn/g) || []).length, 1);
  // One panel for every page: the line on the left, the button on the right. The reply time
  // and the e-mail line are the homepage's own.
  assert.match(html, /^<div class="v4-contact">\s*<p class="v4-contact-note">[^<]+<\/p>\s*<div class="v4-contact-act">\s*<div class="v4-cta-row">\s*<a class="v4-btn v4-btn-primary" href="https:\/\/t\.me\/s_mrgnv" target="_blank" rel="noopener noreferrer">Написать в Telegram<\/a>\s*<\/div>\s*<\/div>\s*<\/div>$/);
  assert.doesNotMatch(html, /v4-contact-reply|v4-contact-alt|v4-contact-links|mailto:/);
});

test('ONE label for one action: every button that opens the Telegram chat reads «Написать в Telegram» / “Message me on Telegram”', () => {
  // The same button read «Telegram» in a hero, «Написать →» in a contact block, «Написать в
  // Telegram →» on a tier and «Get in touch →» under a list. It is one action — one label, and
  // no arrow: a plain contact button carries none (the CTA convention).
  const LABEL = { ru: 'Написать в Telegram', en: 'Message me on Telegram' };
  const CHAT = 'https://t.me/s_mrgnv';
  const off = [];
  // On the pages: the hero buttons of the homepage and /consulting, both tiers, the strategy
  // button, the partnerships button, the contact panels, «Сообщить об ошибке» on /thanks. A
  // template's hero.ctas block is not a list slot — render-static.mjs does not regenerate it —
  // so the pages are read as well as the seed.
  let seen = 0;
  for (const f of [...PAGES, 'thanks.html', 'en/thanks.html', 'social-tracker.html', 'en/social-tracker.html', 'tofsdevops.html', 'en/tofsdevops.html', '404.html']) {
    const lang = f.startsWith('en/') ? 'en' : 'ru';
    for (const [, attrs, label] of read(f).matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)) {
      if (!/class="v4-btn[ "]/.test(attrs) || !attrs.includes(`href="${CHAT}"`)) continue;
      seen++;
      // A static page is typeset in the file (scripts/typo-static.mjs): the label is the same words.
      if (label.replace(/&nbsp;/g, ' ') !== LABEL[lang]) off.push(`${f}: «${label}»`);
    }
  }
  assert.ok(seen >= 12, `${seen} Telegram chat buttons on the pages`);
  // In the seed: every button { href, label } that leads to the chat, and the hero buttons a
  // page stores as markup (hero.ctas).
  let stored = 0;
  const walk = (v, path) => {
    if (typeof v === 'string') {
      const lang = path.endsWith('.en') ? 'en' : 'ru';
      for (const [, attrs, label] of v.matchAll(/<a ([^>]*)>([^<]*)<\/a>/g)) {
        if (!attrs.includes('class="v4-btn') || !attrs.includes(`href="${CHAT}"`)) continue;
        stored++;
        if (label !== LABEL[lang]) off.push(`seed ${path}: «${label}»`);
      }
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}.${i}`));
    else if (v && typeof v === 'object') {
      if (v.href === CHAT && v.label && typeof v.label === 'object') {
        stored++;
        for (const lang of ['ru', 'en']) if (v.label[lang] !== LABEL[lang]) off.push(`seed ${path}.label.${lang}: «${v.label[lang]}»`);
      }
      for (const k of Object.keys(v)) walk(v[k], path ? `${path}.${k}` : k);
    }
  };
  walk(seed, '');
  assert.ok(stored >= 8, `${stored} Telegram chat buttons in the seed`);
  assert.deepEqual(off, [], 'a Telegram chat button with a label of its own');
  // A button that leads elsewhere keeps its own words and, where it starts a flow, its arrow.
  assert.equal(seed.collaborate.sections.contact.ctas[0].label.ru, 'Консалтинг →');
});

test('/uses names its referral links and promises no bonus without one', () => {
  const sw = seed.uses.sections.software;
  // Since v1.5.2 three cards carry the owner's referral links again; the intro says which.
  assert.match(sw.intro.ru, /ссылки реферальные/);
  assert.match(sw.intro.en, /referral links/);
  assert.doesNotMatch(sw.intro.ru, /не партнёрские/);
  const referral = /dashlane\.com\/en\/im\/|go\.setapp\.com\/invite\/|airalo\.go\.link\//;
  const named = sw.cards.filter((c) => referral.test(c.cta.href)).map((c) => c.name);
  assert.deepEqual(named, ['Dashlane', 'Setapp', 'Airalo']);
  for (const name of named) assert.ok(sw.intro.ru.includes(name) && sw.intro.en.includes(name), name);
  // A card without a referral link does not promise a bonus.
  for (const c of sw.cards.filter((c) => !named.includes(c.name))) {
    assert.doesNotMatch(c.cta.label.ru, /бесплатно|скидк|месяц/i, c.name);
  }
  assert.ok(!sw.cards.some((c) => c.name === 'Arc Browser'));
});

test('/uses: the facts of three devices as checked against the devices', () => {
  const cards = Object.fromEntries(seed.uses.sections.hardware.groups.flatMap((g) => g.cards).map((c) => [typeof c.name === 'string' ? c.name : c.name.en, c.desc]));
  const nb = '\u00a0';
  // Duoqin F22 Pro: a 3.54″ IPS screen and Android 12 (the card said 2.8″ OLED and Android 11).
  assert.ok(cards['Duoqin F22 Pro'].ru.includes(`3,54″ IPS, T9, Android${nb}12`));
  assert.ok(cards['Duoqin F22 Pro'].en.includes(`3.54″ IPS, T9 keypad, Android${nb}12`));
  // Shargeek 170: 24 000 mAh and 140 W (it said 25 600 mAh and 100 W).
  assert.match(cards['Shargeek 170'].ru, new RegExp(`24${nb}000${nb}mAh .+ до 140${nb}W`));
  assert.match(cards['Shargeek 170'].en, new RegExp(`24,000${nb}mAh .+ up to 140${nb}W`));
  // Anbernic RG405V: an IPS screen (it said OLED).
  assert.ok(cards['Anbernic RG405V'].ru.includes('4-дюймовый IPS') && cards['Anbernic RG405V'].en.includes('4-inch IPS'));
  for (const name of ['Duoqin F22 Pro', 'Shargeek 170', 'Anbernic RG405V']) {
    assert.doesNotMatch(cards[name].ru + cards[name].en, /OLED|2[,.]8″|Android\s11|25[\s,]600|100\sW/, name);
  }
  // Oura Ring: «не боится воды» — a ring is not «worn into water».
  assert.ok(cards['Oura Ring Gen3'].ru.includes('Не боится воды'));
});

test('no side column, back-to-top or progress bar left in markup, CSS or JS', () => {
  for (const f of [...PAGES, 'script.js', 'ds/v1/components.css', 'styles.css', 'functions/_lib/article-template.js']) {
    assert.doesNotMatch(read(f), /v4-section-nav|v4-scroll-top|v4-scroll-progress/, f);
  }
  assert.doesNotMatch(read('script.js'), /addEventListener\('scroll'/);
});

// v0.31.4 — the owner's answers to the proofreading questions.

test('home copy: Korzinka ×23, one channel line, a kiosk chain (seed = the saved KV doc)', () => {
  const h = JSON.stringify(seed.home);
  assert.ok(!h.includes('400 → 10'));
  assert.match(h, /×23 за 3 года, пик/);
  assert.ok(!h.includes('about what I learn at work'));
  assert.ok(h.includes('Snack kiosk chain') && !h.includes('Snack vending'));
  assert.match(JSON.stringify(seed.consulting), /×23/);
});

test('RU pages speak Russian: /consulting units, /uses headings, tags and prices', () => {
  const tiers = seed.consulting.sections.consulting.tiers;
  assert.deepEqual(tiers.map((t) => t.price.ru), ['**$300** / сессия', '**$2 000** / месяц', 'по договорённости']);
  // The emphasis of a price is the amount — «**$300** / сессия» — and the unit is a plain word
  // after it, in the case it is shown. «SESSION» / «MONTH» were a style typed into the content:
  // the stylesheet set the <strong> of a price in caps, and the doc followed.
  assert.deepEqual(tiers.map((t) => t.price.en), ['**$300** / session', '**$2,000** / month', 'by agreement']);
  // A priced tier: the amount in bold, then its unit; the unpriced one (strategic consulting,
  // v4.6.0) says how the price is set, in plain words.
  for (const t of tiers.filter((x) => x.id !== 'strategy')) for (const l of ['ru', 'en']) assert.match(t.price[l], /^\*\*\$\d[\d,\u00a0]*\*\* \/ [a-zа-яё]+$/, `${l}: ${t.price[l]}`);
  assert.ok(renderers.collabConsulting(seed.consulting, 'en').includes('<span class="v4-pricing"><strong>$300</strong> / session</span>'));
  assert.ok(renderers.collabConsulting(seed.consulting, 'ru').includes('<span class="v4-pricing"><strong>$2\u00a0000</strong> / месяц</span>'));
  assert.doesNotMatch(read('styles.css').replace(/\/\*[\s\S]*?\*\//g, ''), /\.v4-pricing[^{}]*\{[^}]*text-transform/, 'the stylesheet no longer sets a price in caps');
  const u = seed.uses.sections;
  const ruLabels = [
    ...u.hardware.groups.flatMap((g) => [g.heading.ru, ...g.cards.map((c) => c.tag.ru)]),
    ...u.software.cards.flatMap((c) => [c.tag.ru, c.price.ru]),
  ];
  const english = ruLabels.filter((s) => /[A-Za-z]/.test(s) && !/[А-Яа-яЁё]/.test(s) && s !== 'eSIM');
  assert.deepEqual(english, []);
  // A period is a word, not an abbreviation: «$100 / месяц», as «$45 / год» beside it.
  for (const c of u.software.cards) assert.doesNotMatch(c.price.ru, /мес\.|\bг\./, c.name);
  // The English headings are English words for the same things («Рабочее место» — a workspace).
  assert.equal(u.hardware.groups[0].heading.en, 'Workspace');
});

test('/consulting v0.31.5: two-business-day async reply, the FinTech conflict-of-interest line', () => {
  const c = seed.consulting.sections;
  const asyncLine = c.consulting.tiers[1].features.find((f) => f.ru.startsWith('Async'));
  assert.equal(asyncLine.ru, 'Async-поддержка между сессиями (ответ в течение двух рабочих дней)');
  assert.equal(asyncLine.en, 'Async support between sessions (reply within two business days)');
  const not = c.work.blocks[2].items.at(-1);
  assert.match(not.ru, /^Не консультирую прямых конкурентов Яндекса и FinTech-проекты в Узбекистане/);
  assert.equal(not.en, 'While I work at Yandex Uzbekistan, I don’t consult for Yandex’s direct competitors or for FinTech projects that operate in Uzbekistan or plan to enter it.');
  assert.match(renderers.collabWork(seed.consulting, 'ru'), /пока работаю в Yandex Uzbekistan/);
  // «How I work» in English is three sentences that say who does it («I run…», «I go…», «I
  // help…») — they were participles without a subject («Conducting field audits; …»).
  const how = c.work.blocks[0].items.map((i) => i.en);
  assert.equal(how.length, 3);
  for (const line of how) assert.match(line, /^I [a-z]+ .+\.$/, line);
  assert.doesNotMatch(how.join(' '), /^(Conducting|Going|Helping)\b/m);
});

test('sections are rendered as written: no deferred rendering, so nothing a section paints past its box is cut', () => {
  // components.css used to defer the sections below the fold (content-visibility: auto). The
  // containment it turns on clipped the focus ring of every link and button on a section's edge
  // (17 cut rings on /privacy), once the underline of a «more» link, and a jump to an anchor
  // landed by an estimate of the heights. The pages are a dozen short sections: the rule is gone,
  // and with it the editor's override (which once named `.section` — a class no page has).
  const app = read('admin-app.js');
  for (const css of [read('ds/v1/components.css'), read('styles.css'), app]) {
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /content-visibility|contain-intrinsic-size/);
  }
  assert.doesNotMatch(app, /(^|[^-\w])\.section\{/m);
  let sections = 0;
  for (const f of [...PAGES, 'thanks.html', 'en/thanks.html', 'social-tracker.html', 'en/social-tracker.html', 'tofsdevops.html', 'en/tofsdevops.html']) {
    for (const [, cls] of read(f).matchAll(/<section id="[a-z]+" class="([^"]+)"/g)) {
      sections++;
      assert.equal(cls, 'v4-section', f);
    }
  }
  assert.ok(sections > 30);
});

test('/uses software: the card grid every list of cards uses, set off from the line above it', () => {
  // The software cards had a grid of their own (.v4-softs, three a row) for the same card as
  // the homepage's products: one card — one grid.
  for (const lang of ['ru', 'en']) {
    const html = renderers.usesProducts(seed.uses, lang);
    assert.match(html, /^<div class="v4-prose">\s*<p>[\s\S]+?<\/p>\s*<\/div>\s*<div class="v4-products v4-products--after">\s*<article class="v4-product">/, lang);
    assert.equal((html.match(/<article class="v4-product">/g) || []).length, seed.uses.sections.software.cards.length, lang);
  }
  for (const f of ['uses.html', 'en/uses.html']) assert.match(read(f), /<div class="v4-products v4-products--after">/, f);
  for (const f of ['uses.html', 'en/uses.html', 'styles.css', 'ds/v1/components.css', 'functions/_lib/render.js', 'admin-app.js', 'admin-app.css']) {
    assert.doesNotMatch(read(f), /v4-softs/, f);
  }
  assert.match(read('styles.css'), /\.v4-products--after \{\s*margin-top: 24px;\s*\}/);
});
