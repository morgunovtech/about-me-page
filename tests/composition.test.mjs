// Composition rules (v1.5.0; the eighth, «one voice», came with the type redesign).
// Each of them was first a remark of the owner's on the live site; written as prose
// they would be forgotten, so they are checks. The design system keeps the same list
// in guidelines/COMPOSITION.md, the layer in ds/v1/USAGE.md («Composition rules»).
//
//   1. One state — one sign (and never colour alone).
//   2. A number marks a sequence, nothing else.
//   3. A «more» link names what is behind it; the glyph is the renderer's.
//   4. A publication row says when and where; there is no free-text tag.
//   5. One button in a block; the second channel is a line of text.
//   6. The build mark is the version, a link to the changelog on GitHub.
//   7. The only round shape is the live dot (and its two relatives).
//   8. One voice: one scale of sizes, one caption style, mono for data, no italics.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderers, feedSource, feedMonth, plainLabel, privacyRepos } from '../functions/_lib/render.js';
import { NE_ARROW, outMark } from '../functions/_lib/i18n.js';
import { buildFeed, feedListHtml, channelHtml, liveTopics, topicNavHtml } from '../functions/_lib/notes-feed.js';
import { articleShell, notesIndexHtml } from '../functions/_lib/article-template.js';
import { VERSION, CHANGELOG_URL } from '../functions/_lib/site.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const PAGES = ['index.html', 'en/index.html', 'collaborate.html', 'en/collaborate.html', 'consulting.html', 'en/consulting.html', 'uses.html', 'en/uses.html', 'privacy.html', 'en/privacy.html', '404.html'];
// Every page a visitor can open as a file: the CMS pages, the 404 and the static /thanks.
const STATIC = [...PAGES, 'thanks.html', 'en/thanks.html'];
const HOME = ['index.html', 'en/index.html'];
const LANGS = ['ru', 'en'];
const COMPONENTS = read('ds/v1/components.css');
const STYLES = read('styles.css');
const NEW_TAB_NOTE = { ru: ' (откроется в новой вкладке)', en: ' (opens in a new tab)' };
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const rules = (css) => [...noComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim().replace(/\s+/g, ' '), m[2]]);
const section = (page, id) => {
  const from = page.indexOf(`id="${id}"`);
  assert.ok(from > 0, `#${id}`);
  return page.slice(from, page.indexOf('</section>', from));
};
// The whole element that starts with the start tag `open`: its end tag is found by counting the
// nested elements of the same name.
const element = (html, open) => {
  const from = html.indexOf(open);
  assert.ok(from >= 0, open);
  const re = new RegExp(`<(/?)${/^<(\w+)/.exec(open)[1]}\\b[^>]*>`, 'g');
  re.lastIndex = from;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(from, re.lastIndex);
  }
  return assert.fail(`${open} is never closed`);
};

// What the renderers emit for the seed: every list slot the page templates name — the edge
// render of a page and, with `edit`, the /admin preview — with an own note in the feeds.
const NOTE = { slug: 'own', date: '2026-10-01', status: 'published', tags: ['privacy'], title: { ru: 'Своя заметка', en: 'Own note' }, excerpt: { ru: 'Кратко', en: 'Short' } };
const TEMPLATES = { home: 'index.html', consulting: 'consulting.html', collaborate: 'collaborate.html', uses: 'uses.html', privacy: 'privacy.html' };
function rendered(lang, edit = false) {
  const out = [];
  for (const [key, file] of Object.entries(TEMPLATES)) {
    const doc = structuredClone(seed[key]);
    doc._feed = buildFeed([NOTE], seed.notes, lang).slice(0, 3);
    doc._privacyRepos = privacyRepos(seed.privacy);
    doc._articles = [NOTE];
    for (const [, slot] of read(file).matchAll(/data-cms-list="(\w+)"/g)) out.push(renderers[slot](doc, lang, edit));
  }
  return out.join('\n');
}
// …and the pages built without a template: /notes with its topic line, channel block and feed,
// and the shell of a note.
function notesPages(lang) {
  const feed = buildFeed([NOTE], seed.notes, lang);
  const topics = topicNavHtml(liveTopics([NOTE], seed.notes, lang), lang, undefined, feed.length);
  return notesIndexHtml(lang, feedListHtml(feed, lang), '{}', 'abc1234', { intro: 'x', channel: channelHtml(seed.notes, seed.home, lang), topics, count: feed.length }) + articleShell(lang);
}

test('1. one state — one sign: the selected menu item; a toggle opened with the pointer shows no focus ring, and a shortcut does not bring it back', () => {
  const all = rules(COMPONENTS);
  // Selected: a round mark before the label, not orange text inside an orange frame.
  const checked = all.filter(([sel]) => sel.includes('.v4-menu-item[aria-checked="true"]'));
  assert.deepEqual(checked.map(([sel]) => sel), ['.v4-menu-item[aria-checked="true"]::before']);
  assert.match(checked[0][1], /background: var\(--v4-orange\)/);
  // The keyboard focus ring exists, and is not painted around a toggle the script focused
  // after a pointer click (script.js marks that focus; a key press removes the mark).
  assert.ok(all.some(([sel, body]) => sel === '.v4-page :focus-visible' && /outline: 2px solid var\(--v4-orange\)/.test(body)));
  assert.ok(all.some(([sel, body]) => sel === '.v4-dropdown > [data-pointer-focus]:focus-visible' && /outline: none/.test(body)));
  const script = read('script.js');
  assert.match(script, /setAttribute\('data-pointer-focus', ''\)/);
  // A key press — but not any: a modifier on its own, or a shortcut with ⌘ / Ctrl / Alt, is not
  // navigation. ⌘⇧4 for a screenshot used to paint the ring around a menu just opened with the
  // mouse. (tests/dropdown.test.mjs presses the keys; here the listener is kept whole.)
  assert.match(script, /document\.addEventListener\('keydown', \(event\) => \{\s+if \(event\.metaKey \|\| event\.ctrlKey \|\| event\.altKey \|\| MODIFIER_KEYS\.includes\(event\.key\)\) return;\s+byPointer = false;\s+dropdowns\.forEach\(\(d\) => d\.toggle\.removeAttribute\('data-pointer-focus'\)\);\s+\}, true\);/);
  const modifiers = /const MODIFIER_KEYS = \[([^\]]+)\];/.exec(script)[1].split(',').map((k) => k.trim().replace(/'/g, ''));
  for (const k of ['Shift', 'Control', 'Alt', 'Meta']) assert.ok(modifiers.includes(k), `${k} pressed on its own is not navigation`);
  assert.equal((script.match(/\.toggle\.focus\(/g) || []).length, 1, 'every scripted focus of a toggle goes through focusToggle()');
});

test('2. a number marks a sequence: sections and article headings carry none', () => {
  for (const f of PAGES) assert.doesNotMatch(read(f), /v4-section-num/, f);
  assert.doesNotMatch(COMPONENTS + STYLES, /v4-section-num|counter-increment|counter\(/);
  assert.doesNotMatch(JSON.stringify(seed), /"num":/);
});

test('3. a «more» link names what is behind it; «→» stays on the site, the same «→» turned 45° leaves it', () => {
  const VAGUE = /^(подробнее|ещё|еще|далее|смотреть|more|read more|see more|details)\b/i;
  let seen = 0;
  for (const f of HOME) {
    const page = read(f);
    const lang = f.startsWith('en/') ? 'en' : 'ru';
    for (const [, attrs, inner] of page.matchAll(/<div class="v4-more">\s*<a ([^>]*)>([\s\S]*?)<\/a>/g)) {
      seen++;
      // One «→» in an aria-hidden span after the label. For a link that leaves the site it sits
      // in .v4-ne, which turns it into «↗», and the new-tab note for a screen reader follows.
      const m = /^<span[^>]*>([^<]+)<\/span><span aria-hidden="true">&nbsp;(→|<span class="v4-ne">→<\/span>)<\/span>(?:<span class="sr-only">([^<]+)<\/span>)?$/.exec(inner.trim());
      assert.ok(m, `${f}: ${inner}`);
      const [, label, glyph, note] = m;
      assert.doesNotMatch(label, /[→↗←]/, `${f}: the label carries no glyph`);
      assert.doesNotMatch(label, VAGUE, `${f}: «${label}» does not say what is there`);
      const external = /target="_blank"/.test(attrs);
      assert.equal(glyph !== '→', external, `${f}: «${label}» — the turned arrow is for a link that leaves the site, and only for it`);
      assert.equal(note, external ? NEW_TAB_NOTE[lang] : undefined, `${f}: ${label}`);
      // A link that leaves the site ends with where it leads.
      // One name or two («GitHub Sponsors»).
      if (external) assert.match(label, / (на|on) [A-Z][A-Za-z]+( [A-Z][A-Za-z]+)?$/, `${f}: ${label}`);
    }
  }
  // v2.2.2: five — GitHub Sponsors left the page (owner); /privacy now introduces the privacy tools.
  assert.equal(seen, 10, 'five «more» links on each home page');
  // A glyph typed into a stored label is dropped. (The v1.4 labels stored in KV were renamed
  // at read time until the /admin Save of 2026-11-25, rev 34, stored the new ones.)
  assert.equal(plainLabel('→ Все публикации'), 'Все публикации');
  assert.equal(plainLabel('Все проекты на GitHub ↗'), 'Все проекты на GitHub');
});

test('3. the mark of a link that leaves the site is the line\'s own «→» turned 45°: the character «↗» is on no page and in no renderer output', () => {
  // The IBM Plex subsets carry no arrow but ↑ ↓, so a typed «↗» came from a system symbol font —
  // a hairline beside a 600 title. The mark is «→» in .v4-ne and CSS turns it; without CSS it
  // degrades to «→».
  assert.equal(NE_ARROW, '<span aria-hidden="true">&nbsp;<span class="v4-ne">→</span></span>');
  for (const lang of LANGS) assert.equal(outMark(lang), `${NE_ARROW}<span class="sr-only">${NEW_TAB_NOTE[lang]}</span>`);
  const ne = rules(COMPONENTS).find(([sel]) => sel === '.v4-ne');
  assert.ok(ne, '.v4-ne is a rule of the layer');
  assert.match(ne[1], /transform: rotate\(-45deg\)/);
  assert.match(ne[1], /display: inline-block/, 'a transform does not apply to an inline box');
  const outputs = [
    ...STATIC.map((f) => [f, read(f)]),
    ...LANGS.flatMap((lang) => [[`renderers, ${lang}`, rendered(lang)], [`renderers, ${lang}, edit`, rendered(lang, true)], [`notes pages, ${lang}`, notesPages(lang)]]),
  ];
  for (const [name, html] of outputs) {
    assert.ok(!html.includes('↗'), `${name}: «↗» typed as a character`);
    // The turned arrow never stands without the note that says what it means.
    const turned = (html.match(/class="v4-ne"/g) || []).length;
    assert.equal(html.split(`${NE_ARROW}<span class="sr-only">`).length - 1, turned, `${name}: every turned arrow is followed by the new-tab note`);
  }
  // The mark is in use: «more» links and feed rows that leave the site, the channel's «selected posts».
  for (const lang of LANGS) assert.ok(rendered(lang).includes(outMark(lang)) && notesPages(lang).includes(outMark(lang)), lang);
  assert.ok(!noComments(COMPONENTS + STYLES).includes('↗'), 'no stylesheet rule draws «↗» either');
});

test('4. a publication row says when and where; there is no free-text tag', () => {
  for (const f of HOME) {
    const notes = section(read(f), 'notes');
    assert.doesNotMatch(notes, /v4-tag/, f);
    const rows = notes.match(/<li class="v4-feed-row">/g) || [];
    assert.equal((notes.match(/<span class="v4-feed-meta"><time datetime="\d{4}-\d{2}-\d{2}">\d{2}\.\d{4}<\/time> · [^<]+<\/span>/g) || []).length, rows.length, f);
  }
  for (const x of seed.notes.external) assert.equal(x.tag, undefined);
  assert.equal(feedSource({ kind: 'external', item: { href: 'https://youtu.be/x' } }, 'ru'), 'YouTube');
  assert.equal(feedSource({ kind: 'external', item: { href: 'https://www.youtube.com/watch?v=x' } }, 'ru'), 'YouTube');
  assert.equal(feedSource({ kind: 'external', item: { href: 'https://vc.ru/life/1' } }, 'en'), 'vc.ru');
  assert.equal(feedSource({ kind: 'note', item: {} }, 'ru'), 'Заметка');
  assert.equal(feedSource({ kind: 'note', item: {} }, 'en'), 'Note');
  assert.equal(feedMonth('2025-06-26'), '06.2025');
});

test('5. one button in the contact block; the e-mail is a line of text under it, the link to read more comes after the panel', () => {
  for (const f of HOME) {
    const contact = section(read(f), 'contact');
    assert.equal((contact.match(/class="v4-btn/g) || []).length, 1, f);
    assert.match(contact, /class="v4-btn v4-btn-primary" href="https:\/\/t\.me\//, f);
    // One panel. Left — who should write. Right — the button and, under it, the lines that go
    // with it: the reply time and the second channel as a sentence, never a second button.
    const panel = element(contact, '<div class="v4-contact">');
    const act = element(panel, '<div class="v4-contact-act">');
    const note = panel.indexOf('<p class="v4-contact-note">');
    assert.ok(note > 0 && note < panel.indexOf(act), `${f}: the note, then what to do`);
    assert.match(act, /^<div class="v4-contact-act">\s*<div class="v4-cta-row">\s*<a class="v4-btn v4-btn-primary"[^>]*>[^<]+<\/a>\s*<\/div>\s*<p class="v4-contact-reply">[^<]+<\/p>\s*<p class="v4-contact-alt">(Или на почту|Or by e-mail): <a href="mailto:s@morgunov\.tech">s@morgunov\.tech<\/a><\/p>\s*<\/div>$/, f);
    // The link to read more first is not a way to write: it is outside the panel, last.
    assert.doesNotMatch(panel, /v4-more/, f);
    assert.ok(contact.indexOf('<div class="v4-contact-links">') >= contact.indexOf(panel) + panel.length, f);
  }
  // Every other page ends with the same panel: one line, one button, nothing under it.
  for (const f of ['consulting.html', 'en/consulting.html', 'collaborate.html', 'en/collaborate.html', 'privacy.html', 'en/privacy.html']) {
    const panel = element(section(read(f), 'contact'), '<div class="v4-contact">');
    assert.match(panel, /^<div class="v4-contact">\s*<p class="v4-contact-note">[\s\S]+?<\/p>\s*<div class="v4-contact-act">\s*<div class="v4-cta-row">\s*<a class="v4-btn v4-btn-primary"[^>]*>[^<]+<\/a>\s*<\/div>\s*<\/div>\s*<\/div>$/, f);
  }
  // A mailto: cta never becomes a button, whatever the stored doc says.
  const doc = structuredClone(seed.home);
  doc.sections.contact.ctas[1].primary = true;
  assert.equal((renderers.contact(doc, 'ru', false).match(/class="v4-btn/g) || []).length, 1);
});

test('6. the build mark is the version, a link to the changelog on GitHub; the footer is two spans, the privacy line a nameplate', () => {
  const top = /^- v(\d+\.\d+\.\d+) — /m.exec(read('CHANGELOG.md'))[1];
  assert.equal(VERSION, top, 'site.js VERSION is the top entry of CHANGELOG.md (run scripts/version-stamp.py)');
  assert.equal(CHANGELOG_URL, 'https://github.com/morgunovtech/about-me-page/blob/main/CHANGELOG.md');
  for (const f of PAGES) {
    const foot = /<footer class="v4-foot">[\s\S]*?<\/footer>/.exec(read(f))[0];
    assert.ok(foot.includes(`<a class="v4-build" href="${CHANGELOG_URL}" target="_blank" rel="noopener noreferrer">v${top}</a>`), f);
    assert.doesNotMatch(foot, /_build|<code/, f);
    // The footer is one module: the left span, the privacy line, nothing else. Its one slot is
    // «up to two links of the page's own» after the build mark (ds/v1/USAGE.md, «Footer»).
    const spans = foot.match(/<span[\s>]/g) || [];
    assert.equal(spans.length, 2, `${f}: the footer is two spans`);
    assert.match(foot, /<span class="v4-foot-privacy"[^>]*>[^<]+<\/span>\s*<\/footer>$/, f);
    const links = foot.match(/<a\s[^>]*>/g) || [];
    assert.ok(links[0].includes('class="v4-build"'), `${f}: the build mark is the first link`);
    assert.ok(links.length - 1 <= 2, `${f}: ${links.length - 1} own links in the footer, the slot holds two`);
    assert.doesNotMatch(foot, /<(button|svg|img|br|p|div|ul|nav)[\s>]/, f);
  }
  assert.ok(read('functions/_lib/article-template.js').includes('<a class="v4-build" href="${CHANGELOG_URL}" target="_blank" rel="noopener noreferrer">v${VERSION}</a>'));
  assert.match(read('functions/_middleware.js'), /headers\.set\('X-Build', doc\._build\)/);
  // The privacy line is a nameplate — caps in a thin frame, the way a maker's plate sits on the
  // back of a device. The markup did not change for it; it is the one text of a page set under
  // 12px (rule 8 keeps every other size on the scale).
  const plate = rules(COMPONENTS).find(([sel]) => sel === '.v4-foot-privacy')[1];
  assert.match(plate, /font-size: 11px/);
  assert.match(plate, /text-transform: uppercase/);
  assert.match(plate, /border: 1px solid var\(--v4-line\)/);
});

test('7. the only round shapes: the live dot, the busy mark, the selected-item mark (of a menu and of the site menu); this site shows no live dot', () => {
  const round = rules(COMPONENTS + STYLES).filter(([, body]) => /border-radius:\s*(?!0[;\s])\S/.test(body)).map(([sel]) => sel);
  // v3.0.0: the site menu marks the current page as a menu marks its choice — in the
  // «Work with me» group and in the phone's menu panel.
  assert.deepEqual(round.sort(), ['.v4-bar-mid a[aria-current="page"]::before', '.v4-btn.is-busy::before', '.v4-live-dot', '.v4-menu-item[aria-checked="true"]::before', '.v4-nav-sub .v4-menu-item[aria-current="page"]::before'].sort());
  // The live dot stays in the layer for the services of the family. Here it is on no page and
  // in no card: a dot beside every item of a list titled «Работает» told nothing — a product
  // says it by standing there — so the head of a card has no dot, no row for one and no
  // sr-only «Работает» / «Live».
  const DOT = /v4-live-dot|v4-product-tag-row|<span class="sr-only">(Работает|Live)<\/span>/;
  for (const f of STATIC) assert.doesNotMatch(read(f), DOT, f);
  assert.doesNotMatch(STYLES, /v4-live-dot|v4-product-tag-row/, 'the page stylesheet styles neither');
  for (const lang of LANGS) {
    assert.doesNotMatch(rendered(lang), DOT, lang);
    assert.doesNotMatch(rendered(lang, true), DOT, `${lang}, edit`);
    assert.doesNotMatch(notesPages(lang), DOT, `${lang}, notes`);
  }
  // A `live` flag left in a stored doc is not read.
  const flagged = structuredClone(seed.home);
  const plain = structuredClone(seed.home);
  flagged.sections.products.items.forEach((it) => { it.live = true; });
  plain.sections.products.items.forEach((it) => { delete it.live; });
  assert.equal(renderers.products(flagged, 'ru', false), renderers.products(plain, 'ru', false));
  for (const f of HOME) {
    const career = section(read(f), 'career');
    assert.doesNotMatch(career, /Текущая роль|Current role/, f);
    // «Now» is said by the period of the first row.
    assert.match(career, /<div class="period">\d{4} — (сейчас|now|present)<\/div>/, f);
  }
});

// --- 8. One voice ---
// A stylesheet as a flat list of rules: comments dropped, a rule inside @media keeps the query
// as its `media`, @keyframes and @font-face are skipped. A selector list is split at its
// top-level commas only (`:is(:focus-within, :hover)` stays whole).
function parseCss(css) {
  const out = [];
  const split = (list) => {
    const parts = [];
    let depth = 0;
    let cur = '';
    for (const ch of list) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    parts.push(cur.trim());
    return parts;
  };
  const walk = (text, media) => {
    let i = 0;
    for (let open = text.indexOf('{', i); open >= 0; open = text.indexOf('{', i)) {
      let depth = 1;
      let j = open + 1;
      for (; depth > 0 && j < text.length; j++) depth += text[j] === '{' ? 1 : text[j] === '}' ? -1 : 0;
      const prelude = text.slice(i, open).trim().replace(/\s+/g, ' ');
      const body = text.slice(open + 1, j - 1);
      if (/^@media\b/.test(prelude)) walk(body, prelude);
      else if (!prelude.startsWith('@')) {
        const decls = {};
        for (const d of body.split(';')) {
          const k = d.indexOf(':');
          if (k > 0) decls[d.slice(0, k).trim()] = d.slice(k + 1).trim().replace(/\s+/g, ' ');
        }
        out.push({ media, selectors: split(prelude), decls });
      }
      i = j;
    }
  };
  walk(noComments(css), '');
  return out;
}
const LAYER = ['ds/v1/base.css', 'ds/v1/components.css', 'styles.css'].flatMap((file) => parseCss(read(file)).map((r) => ({ ...r, file })));
const where = (r) => `${r.file}: ${r.selectors.join(', ')}${r.media ? ` (${r.media})` : ''}`;
// The value a selector gets for a property, outside @media or inside the given query.
const at = (selector, prop, media = '') => {
  const hits = LAYER.filter((r) => r.media === media && r.selectors.includes(selector) && prop in r.decls);
  return hits.length ? hits.at(-1).decls[prop] : undefined;
};
const FOLDED = '@media (max-width: 960px)';
const PHONE = '@media (max-width: 640px)';

test('8. one voice: every size is a step of one scale — 16px text on every device, and nothing under 12px but the footer\'s nameplate', () => {
  // Text — anything read as a sentence — is 16px in every theme and on every device. It was
  // 14px on a desktop and 16px on a phone and in high contrast: one rule sets it now.
  const body = LAYER.filter((r) => r.selectors.some((s) => /(^|\s)body\.v4-page$/.test(s)) && 'font-size' in r.decls);
  assert.deepEqual(body.map((r) => [r.file, r.media, r.decls['font-size']]), [['ds/v1/base.css', '', '16px']]);

  // 12 caption (the tokens) · 13 data · 14 secondary line · 16 text · 18 item title · 20 / 24
  // section title · 28 / 34 / 40 a note's title · 32 / 40 the figures of the stats strip;
  // 0.875em is inline code.
  const SCALE = ['var(--v4-label-size)', 'var(--v4-label-xs-size)', 'inherit', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '34px', '40px', '0.875em'];
  // A size that belongs to one rule alone: the page title follows the window, the nameplate is
  // the one text under 12px, and the button writes the caption's 12px as a literal.
  const ONLY = {
    'clamp(40px, 6.2vw, 56px)': '.v4-h1',
    'clamp(32px, 10.6vw, 40px)': '.v4-h1',
    '11px': '.v4-foot-privacy',
    '12px': '.v4-btn',
  };
  let sized = 0;
  for (const r of LAYER) {
    if ('font' in r.decls) assert.equal(r.decls.font, 'inherit', `${where(r)} { font: ${r.decls.font} } — a shorthand would carry a size past the scale`);
    const size = r.decls['font-size'];
    if (size === undefined) continue;
    sized++;
    if (SCALE.includes(size)) continue;
    assert.ok(size in ONLY, `${where(r)} { font-size: ${size} } is not a step of the scale`);
    assert.deepEqual(r.selectors, [ONLY[size]], `${where(r)} { font-size: ${size} } — that size is ${ONLY[size]}'s alone`);
  }
  assert.ok(sized > 40, 'the stylesheets were read');

  // The steps by role (ds/v1/USAGE.md, «Type, space and button states»).
  assert.equal(at('.v4-h1', 'font-size'), 'clamp(40px, 6.2vw, 56px)');
  assert.equal(at('.v4-h1', 'font-size', PHONE), 'clamp(32px, 10.6vw, 40px)');
  assert.deepEqual([at('.v4-h2', 'font-size'), at('.v4-h2', 'font-size', PHONE)], ['24px', '20px']);
  // A note's title is a sentence, so it is set a step under a page title.
  assert.deepEqual([at('.v4-article-title', 'font-size'), at('.v4-article-title', 'font-size', FOLDED), at('.v4-article-title', 'font-size', PHONE)], ['40px', '34px', '28px']);
  for (const sel of ['.v4-product-name', '.v4-use-name', '.v4-kit-name', '.v4-note-title', '.v4-channel-title']) {
    assert.deepEqual([at(sel, 'font-size'), at(sel, 'font-weight')], ['18px', '600'], `${sel}: an item's title`);
  }
  for (const sel of ['.v4-career-row .role', '.v4-venture .arc', '.v4-kit-kind', '.v4-note-meta', '.v4-channel-meta', '.v4-contact-reply', '.v4-contact-alt', '.v4-terms', '.v4-foot', '.v4-onpage']) {
    assert.equal(at(sel, 'font-size'), '14px', `${sel}: a secondary line`);
  }
});

test('8. one voice: ONE caption style — sans caps 12px / 0.08em / 500; mono is for data — 13px, never caps', () => {
  const tokens = noComments(read('ds/v1/tokens.css'));
  // `label-xs` holds the same values as `label`: there is no second, smaller caption.
  for (const decl of ['--v4-label-size: 12px;', '--v4-label-tracking: 0.08em;', '--v4-label-xs-size: 12px;', '--v4-label-xs-tracking: 0.08em;', '--v4-label-weight: 500;']) {
    assert.ok(tokens.includes(decl), decl);
  }
  // Whatever wears caps — the bar, a menu, a button, the label over a group, the tag of a card —
  // wears the same ones. (A page had two caption styles, sans caps and mono caps; side by side
  // they read as noise.)
  const caps = LAYER.filter((r) => r.decls['text-transform'] === 'uppercase');
  assert.ok(caps.length >= 8, 'the caption rules were found');
  for (const r of caps) {
    const d = r.decls;
    assert.ok(!('font-family' in d) || d['font-family'] === 'inherit', `${where(r)}: caps are never mono`);
    const plate = r.selectors.join() === '.v4-foot-privacy';
    assert.ok(['var(--v4-label-size)', 'var(--v4-label-xs-size)', plate ? '11px' : '12px'].includes(d['font-size']), `${where(r)} { font-size: ${d['font-size']} }`);
    assert.ok(['var(--v4-label-tracking)', 'var(--v4-label-xs-tracking)', '0.08em'].includes(d['letter-spacing']), `${where(r)} { letter-spacing: ${d['letter-spacing']} }`);
    if ('font-weight' in d) assert.ok(['var(--v4-label-weight)', '500'].includes(d['font-weight']), `${where(r)} { font-weight: ${d['font-weight']} }`);
  }
  // Mono is for data — a date, a period, a version, a count, the build mark: 13px, plain. Code is
  // the one other thing set in mono (0.875em in a line, 14px in a block).
  const mono = LAYER.filter((r) => /var\(--v4-mono\)/.test(r.decls['font-family'] || ''));
  assert.ok(mono.length >= 4, 'the mono rules were found');
  for (const r of mono) {
    assert.notEqual(r.decls['text-transform'], 'uppercase', `${where(r)}: mono is never caps`);
    if (r.selectors.every((s) => /(^|\s)(code|pre)$/.test(s))) assert.ok(['0.875em', '14px'].includes(r.decls['font-size']), where(r));
    else assert.equal(r.decls['font-size'], '13px', `${where(r)}: data in mono is 13px`);
  }
  // …and nothing is mono in one rule and caps in another.
  const monoSelectors = new Set(mono.flatMap((r) => r.selectors));
  for (const r of caps) for (const s of r.selectors) assert.ok(!monoSelectors.has(s), `${s} is mono in one rule and caps in another`);
  for (const sel of ['.v4-career-row .period', '.v4-venture .year', '.v4-feed-meta', '.v4-note-date', '.v4-version', '.v4-count']) {
    assert.equal(at(sel, 'font-family'), 'var(--v4-mono)', `${sel}: data`);
  }
  // The role under the company was a mono caps label; it is a secondary line now, in the case it
  // is written — the period beside it is the row's data.
  const role = LAYER.filter((r) => r.selectors.includes('.v4-career-row .role'));
  assert.equal(role.length, 1);
  assert.deepEqual([role[0].decls['font-size'], role[0].decls.color], ['14px', 'var(--v4-muted)']);
  for (const prop of ['font-family', 'text-transform', 'letter-spacing']) assert.ok(!(prop in role[0].decls), `.v4-career-row .role sets no ${prop}`);
  // The same for a price: its unit is written in the case it is shown («/ session», not CSS caps).
  assert.ok(!LAYER.some((r) => r.selectors.some((s) => s.startsWith('.v4-pricing')) && 'text-transform' in r.decls));
});

test('8. one voice: weight says the role — 600, 500, 400 — and nothing is set in italics', () => {
  // 600 a title or a name, 500 something to press, 400 text. IBM Plex ships these three: a 700
  // would be synthesized (smeared) by the browser.
  for (const r of LAYER) {
    if ('font-weight' in r.decls) assert.ok(['400', '500', '600', 'var(--v4-label-weight)'].includes(r.decls['font-weight']), `${where(r)} { font-weight: ${r.decls['font-weight']} }`);
  }
  // The family ships no italic either: a browser would slant the upright face itself.
  for (const r of LAYER) assert.ok(!/italic|oblique/.test(r.decls['font-style'] || ''), where(r));
  assert.doesNotMatch(noComments(read('ds/v1/fonts.css')), /font-style:\s*(italic|oblique)/, 'no italic face among the shipped fonts');
});

test('the bar: the menus hang from its rule, the group\'s items start under its toggle, the theme icon ends on the content\'s edge', () => {
  const px = (v) => {
    const m = /^(-?\d+)px\b/.exec(String(v));
    assert.ok(m, `a length in px: ${v}`);
    return Number(m[1]);
  };
  // top · right · bottom · left of a `padding` shorthand.
  const sides = (v) => {
    const p = String(v).split(/\s+/).map((x) => (x === '0' ? 0 : px(x)));
    return { top: p[0], right: p[1] ?? p[0], bottom: p[2] ?? p[0], left: p[3] ?? p[1] ?? p[0] };
  };
  // A panel hangs from the bar's rule: under a control it is lower by the bar's bottom padding
  // and the rule itself, and it has no top border of its own — the ink rule is its top edge.
  const rule = px(at('.v4-bar', 'border-bottom'));
  const pad = sides(at('.v4-bar', 'padding')).bottom;
  assert.equal(at('.v4-menu', 'top'), `calc(100% + ${pad + rule}px)`);
  assert.equal(at('.v4-menu', 'border-top'), '0');
  // The folded site menu («Меню», ≤960px) is the same panel.
  assert.equal(at('.v4-bar-mid', 'top', FOLDED), `calc(100% + ${pad + rule}px)`);
  assert.equal(at('.v4-bar-mid', 'border-top', FOLDED), '0');
  // A phone has a tighter bar: both panels follow it.
  const phonePad = px(at('.v4-bar', 'padding-bottom', PHONE));
  assert.notEqual(phonePad, pad);
  for (const panel of ['.v4-menu', '.v4-bar-mid']) assert.equal(at(panel, 'top', PHONE), `calc(100% + ${phonePad + rule}px)`, panel);

  // The group's items start where its toggle's label does: the panel is pulled left by its own
  // border and padding and by the room an item keeps for the selected-item mark.
  const inset = px(at('.v4-menu', 'border')) + sides(at('.v4-menu', 'padding')).left + sides(at('.v4-nav-sub .v4-menu-item', 'padding')).left;
  assert.equal(at('.v4-nav-sub', 'left'), `-${inset}px`);

  // The theme icon sits in the middle of its button; pulled out by the room beside it, the icon
  // itself ends on the content's right edge — where the bar's rule ends — and the menu keeps to it.
  const icon = px(at('.v4-icon-btn svg', 'width'));
  for (const media of ['', PHONE]) {
    const room = (px(at('.v4-icon-btn', 'width', media)) - icon) / 2;
    assert.equal(at('.v4-theme', 'margin-right', media), `-${room}px`, media || 'desktop');
    assert.equal(at('.v4-theme > .v4-menu', 'right', media), `${room}px`, media || 'desktop');
  }
});
