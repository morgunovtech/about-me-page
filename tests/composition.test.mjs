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
//   8. One voice: one scale of sizes, one caption style, mono for data, no italics in the
//      chrome (the italic faces are for the author's emphasis in a note).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { renderers, feedSource, feedMonth, plainLabel } from '../functions/_lib/render.js';
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
      // One «→» in an aria-hidden span after the label. For a link that leaves the site it is
      // the renderer's mark (NE_ARROW: .v4-ne turns the arrow into «↗»), and the new-tab note
      // for a screen reader follows.
      const m = /^<span[^>]*>([^<]+)<\/span>(<span aria-hidden="true">&nbsp;→<\/span>|<span class="v4-out" aria-hidden="true">&#8288;<span class="v4-ne">→<\/span><\/span>)(?:<span class="sr-only">([^<]+)<\/span>)?$/.exec(inner.trim());
      assert.ok(m, `${f}: ${inner}`);
      const [, label, mark, note] = m;
      const glyph = mark === NE_ARROW ? 'turned' : '→';
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
  // degrades to «→». The arrow is a box, and a line may break before a box even after a
  // no-break space: .v4-out is a no-wrap span that opens with a word joiner, so the arrow never
  // starts a line alone; the gap is the arrow's margin, so a link's underline stops at its
  // last word.
  assert.equal(NE_ARROW, '<span class="v4-out" aria-hidden="true">&#8288;<span class="v4-ne">→</span></span>');
  for (const lang of LANGS) assert.equal(outMark(lang), `${NE_ARROW}<span class="sr-only">${NEW_TAB_NOTE[lang]}</span>`);
  const ne = rules(COMPONENTS).find(([sel]) => sel === '.v4-ne');
  assert.ok(ne, '.v4-ne is a rule of the layer');
  assert.match(ne[1], /transform: rotate\(-45deg\)/);
  assert.match(ne[1], /display: inline-block/, 'a transform does not apply to an inline box');
  assert.match(ne[1], /margin-left: 0\.25em/, 'the gap before the arrow is a margin: no underline under it');
  const out = rules(COMPONENTS).find(([sel]) => sel === '.v4-out');
  assert.ok(out && /white-space: nowrap/.test(out[1]), '.v4-out does not wrap: the arrow stays with the last word');
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

test('5. one button in the contact block; the e-mail is a line of text under it, the pages to read first under the sentence', () => {
  for (const f of HOME) {
    const contact = section(read(f), 'contact');
    assert.equal((contact.match(/class="v4-btn/g) || []).length, 1, f);
    assert.match(contact, /class="v4-btn v4-btn-primary" href="https:\/\/t\.me\//, f);
    // One panel (v4.2.0). Left — who should write, and under it the pages to read first.
    // Right — the button; under it the second channel as a sentence, never a second button;
    // last the reply time.
    const panel = element(contact, '<div class="v4-contact">');
    const text = element(panel, '<div class="v4-contact-text">');
    const act = element(panel, '<div class="v4-contact-act">');
    assert.ok(panel.indexOf(text) < panel.indexOf(act), `${f}: the sentence, then what to do`);
    assert.match(text, /^<div class="v4-contact-text">\s*<p class="v4-contact-note">[^<]+<\/p>\s*<div class="v4-contact-links">\s*<div class="v4-more"><a href="(\/en)?\/consulting#consulting">[\s\S]+?<\/div>\s*<div class="v4-more"><a href="(\/en)?\/collaborate">[\s\S]+?<\/div>\s*<\/div>\s*<\/div>$/, f);
    assert.match(act, /^<div class="v4-contact-act">\s*<div class="v4-cta-row">\s*<a class="v4-btn v4-btn-primary"[^>]*>[^<]+<\/a>\s*<\/div>\s*<p class="v4-contact-alt">(Или на почту|Or by e-mail): <a href="mailto:s@morgunov\.tech">s@morgunov\.tech<\/a><\/p>\s*<p class="v4-contact-reply">[^<]+<\/p>\s*<\/div>$/, f);
    assert.equal((contact.match(/v4-contact-links/g) || []).length, 1, `${f}: the links only inside the panel`);
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
  // /uses says what orange marks here: the current page and the chosen theme — no longer «a
  // service that is running», which was the dot.
  const look = JSON.stringify(seed.uses.sections.principles);
  assert.ok(look.includes('— текущая страница и выбранная тема.') && look.includes('— the current page and the chosen theme.'));
  assert.doesNotMatch(look, /работающий сервис|service that’s running/);
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
  // …so the doc keeps no flag for it either (`current` asked for a dot beside the company).
  for (const it of seed.home.sections.career.items) assert.equal(it.current, undefined, it.period.ru);
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
  const SCALE = ['var(--v4-label-size)', 'var(--v4-label-xs-size)', 'inherit', '13px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '34px', '40px'];
  // A size that belongs to one rule alone: the page title follows the window, and the nameplate
  // is the one text under 12px.
  const ONLY = {
    'clamp(40px, 6.2vw, 56px)': '.v4-h1',
    'clamp(32px, 10.6vw, 40px)': '.v4-h1',
    '11px': '.v4-foot-privacy',
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
  // Mono is the label column of a table — a period, a year, a date (with its source on the
  // homepage's feed): 13px, plain. Code is the one other thing set in mono: a step under its
  // text — 14px in a line of 16px text and in a block, 16px in a note's 18px (13px in a footer).
  const mono = LAYER.filter((r) => /var\(--v4-mono\)/.test(r.decls['font-family'] || ''));
  assert.ok(mono.length >= 4, 'the mono rules were found');
  for (const r of mono) {
    assert.notEqual(r.decls['text-transform'], 'uppercase', `${where(r)}: mono is never caps`);
    if (r.selectors.every((s) => /(^|\s)(code|pre)$/.test(s))) assert.ok(['13px', '14px', '16px'].includes(r.decls['font-size']), where(r));
    else assert.equal(r.decls['font-size'], '13px', `${where(r)}: a table's label in mono is 13px`);
  }
  // …and nothing is mono in one rule and caps in another.
  const monoSelectors = new Set(mono.flatMap((r) => r.selectors));
  for (const r of caps) for (const s of r.selectors) assert.ok(!monoSelectors.has(s), `${s} is mono in one rule and caps in another`);
  for (const sel of ['.v4-career-row .period', '.v4-venture .year', '.v4-feed-meta', '.v4-note-date']) {
    assert.equal(at(sel, 'font-family'), 'var(--v4-mono)', `${sel}: the label column of a table`);
  }
  // A number inside a line of text is set in the line's own face: a version in the head of a
  // card, a count after a topic, the build mark in the footer. (They were mono — a second face
  // in the middle of a sans line, and the build mark a mono link.)
  for (const sel of ['.v4-version', '.v4-count', '.v4-foot .v4-build', '.v4-h1-count', '.v4-pricing']) {
    assert.ok(!LAYER.some((r) => r.selectors.includes(sel) && 'font-family' in r.decls), `${sel}: no face of its own`);
  }
  // Inline code is one idiom: the same quiet ground in a page's text and in a note.
  for (const sel of ['.v4-prose code', '.v4-article-body code']) {
    const r = LAYER.find((x) => x.selectors.includes(sel) && 'font-family' in x.decls);
    assert.ok(r && /^1px solid var\(--v4-line-soft\)$/.test(r.decls.border) && /^var\(--v4-(bg|paper)\)$/.test(r.decls.background), `${sel}: a ground and a hairline`);
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

test('8. one voice: weight says the role — 600, 500, 400 — and the chrome sets nothing in italics', () => {
  // 600 a title or a name, 500 something to press, 400 text. IBM Plex ships these three: a 700
  // would be synthesized (smeared) by the browser.
  for (const r of LAYER) {
    if ('font-weight' in r.decls) assert.ok(['400', '500', '600', 'var(--v4-label-weight)'].includes(r.decls['font-weight']), `${where(r)} { font-weight: ${r.decls['font-weight']} }`);
  }
  // No rule of the layer asks for italics: a page's own text is upright. Italics are the
  // author's emphasis inside a note (<em>), and the two closing lines of a note stay upright.
  for (const r of LAYER) assert.ok(!/italic|oblique/.test(r.decls['font-style'] || ''), where(r));
  assert.equal(at('.v4-article-body > hr + p:last-child em', 'font-style'), 'normal');
});

test('a note ends with two quiet lines — where it was first published and the thanks line — whether or not an update stands between the rule and the first', () => {
  // The «first published» line is the note's own last paragraph: right under its last rule, or
  // after one paragraph of update under that rule. Both shapes get the secondary style of the
  // thanks line; in five notes with an update the line used to be body text in italics.
  const SHAPES = ['.v4-article-body > hr + p:last-child', '.v4-article-body > hr + p + p:last-child'];
  const quiet = LAYER.find((r) => r.media === '' && r.selectors.includes('.v4-article-thanks') && 'font-size' in r.decls);
  assert.deepEqual([quiet.decls['font-size'], quiet.decls['line-height'], quiet.decls.color, quiet.decls['max-width']], ['14px', '1.5', 'var(--v4-muted)', '62ch']);
  for (const shape of SHAPES) {
    assert.ok(quiet.selectors.includes(shape), `${shape}: the secondary style of the thanks line`);
    assert.equal(at(shape, 'margin'), '0', shape);
    assert.equal(at(shape + ' em', 'font-style'), 'normal', `${shape}: upright`);
    assert.equal(at(shape, 'margin-bottom', PHONE), '0', `${shape}: no paragraph gap on a phone either`);
  }
});

// What fonts.css declares: one entry per @font-face.
const FACES = [...noComments(read('ds/v1/fonts.css')).matchAll(/@font-face\s*\{([^}]*)\}/g)].map(([, body]) => {
  const get = (prop) => (new RegExp(`${prop}:\\s*([^;]+);`).exec(body) || [])[1];
  return {
    family: get('font-family').replace(/"/g, ''),
    style: get('font-style'),
    weight: get('font-weight'),
    display: get('font-display'),
    file: (/url\("\/fonts\/([^"]+)"\) format\("woff2"\)/.exec(get('src')) || [])[1],
    range: get('unicode-range').split(',').map((x) => x.trim()),
  };
});

test('the fonts: every face names a file that ships and every file is a face', () => {
  assert.equal(FACES.length, 14);
  for (const f of FACES) {
    // The name of a file says what is in it: family, subset, weight, slant.
    const m = /^plex-(sans|mono)-(latin|cyr)-(400|500|600)(-italic)?\.woff2$/.exec(f.file || '');
    assert.ok(m, `a face of fonts.css names its file: ${f.file}`);
    assert.equal(f.family, m[1] === 'sans' ? 'IBM Plex Sans' : 'IBM Plex Mono', f.file);
    assert.equal(f.weight, m[3], f.file);
    assert.equal(f.style, m[4] ? 'italic' : 'normal', f.file);
    assert.equal(f.display, 'swap', f.file);
    assert.equal(readFileSync(new URL('../fonts/' + f.file, import.meta.url)).toString('latin1', 0, 4), 'wOF2', `${f.file} is a woff2 file`);
    // A subset is told by its range: Cyrillic starts at U+0400, Latin at U+0000.
    assert.equal(f.range.some((x) => x.startsWith('U+0400')), m[2] === 'cyr', f.file);
  }
  assert.equal(new Set(FACES.map((f) => f.file)).size, FACES.length, 'no file is declared twice');
  // …and nothing ships that no face uses (a file nobody asks for is a tail).
  assert.deepEqual(readdirSync(new URL('../fonts/', import.meta.url)).filter((f) => f.endsWith('.woff2')).sort(), FACES.map((f) => f.file).sort());
});

test('the fonts: the italics are IBM Plex Sans 400 and 600 in both subsets — the author\'s emphasis in a note, and nothing else', () => {
  // A note sets <em> in its text (400) and, in a few places, <em> inside <strong> (600). Without
  // the faces a browser slants the upright one itself — letters of the wrong shape. There is no
  // 500 italic (nothing pressed is in italics) and no mono italic (code is upright).
  const italic = FACES.filter((f) => f.style !== 'normal');
  assert.deepEqual(italic.map((f) => f.file).sort(), ['plex-sans-cyr-400-italic.woff2', 'plex-sans-cyr-600-italic.woff2', 'plex-sans-latin-400-italic.woff2', 'plex-sans-latin-600-italic.woff2']);
  for (const f of italic) {
    // A character is looked for in the same subset whatever the slant: the italic face covers
    // nothing its upright twin does not, and both weights of a subset cover the same.
    const upright = FACES.find((u) => u.file === f.file.replace('-italic', ''));
    assert.ok(upright, `${f.file}: its upright twin ships too`);
    for (const x of f.range) assert.ok(upright.range.includes(x), `${f.file}: ${x} is in the upright range`);
    const otherWeight = italic.find((o) => o !== f && o.file.includes('-cyr-') === f.file.includes('-cyr-'));
    assert.deepEqual(f.range, otherWeight.range, `${f.file}: one range for both weights`);
  }
  // No page preloads an italic face: it is fetched where a note uses it and nowhere else. The
  // static pages are read as files; the shells of a note and of /notes are read as they are
  // rendered — their preload names are put together from parts, so the source of the template
  // never holds the name of a file.
  for (const file of STATIC) assert.doesNotMatch(read(file), /italic/, file);
  for (const lang of LANGS) {
    const shells = notesPages(lang);
    assert.match(shells, /rel="preload" as="font"[^>]*href="\/fonts\/plex-sans-latin-400\.woff2"/, 'the shells do preload fonts');
    assert.doesNotMatch(shells, /italic\.woff2/, `the note shell and the /notes page (${lang})`);
  }
});

// The tables a woff2 file carries, from its directory (which is not compressed).
function woff2Tables(file) {
  const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp',
    'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
    'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx',
    'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];
  const b = readFileSync(new URL('../fonts/' + file, import.meta.url));
  let i = 48;
  const skipBase128 = () => { while (b[i++] & 0x80); };
  const tags = [];
  for (let n = b.readUInt16BE(12); n > 0; n--) {
    const flags = b[i++];
    let tag = KNOWN[flags & 0x3f];
    if ((flags & 0x3f) === 63) { tag = b.toString('latin1', i, i + 4); i += 4; }
    skipBase128();
    // glyf and loca are stored transformed at version 0, hmtx at version 1: a second length follows.
    if (((tag === 'glyf' || tag === 'loca') && flags >> 6 === 0) || (tag === 'hmtx' && flags >> 6 === 1)) skipBase128();
    tags.push(tag);
  }
  return tags;
}

test('the fonts: every file is the same build — a static instance with its hinting', () => {
  // Google Fonts answers a macOS browser with files that have no hinting and a Windows one with
  // hinted files, and a request for two weights at once with one variable file. The italics were
  // first fetched the first way: on Windows a small <em> would have been drawn by other rules
  // than the upright text around it. Every file here is the static, hinted instance.
  for (const f of FACES) {
    const tags = woff2Tables(f.file);
    for (const t of ['cmap', 'glyf', 'name', 'cvt ', 'fpgm', 'prep']) assert.ok(tags.includes(t), `${f.file} has no ${t.trim()} table`);
    for (const t of ['fvar', 'gvar']) assert.ok(!tags.includes(t), `${f.file} is a variable font (${t})`);
  }
});

test('a note\'s pictures stand in one frame — the portrait\'s: the place is known before the picture loads, the cover fills it, a picture in the text is shown whole', () => {
  // The sanitizer leaves a picture of a note only its address and its text: no width, no height.
  // Its place on the page is therefore the stylesheet's — one frame for every picture, or the
  // text jumps as each one arrives and a tall photo takes a whole screen.
  const frame = LAYER.find((r) => r.media === '' && r.selectors.includes('.v4-article-cover img') && r.selectors.includes('.v4-article-body img'));
  assert.ok(frame, 'one rule frames the cover and the pictures in the text');
  assert.deepEqual([frame.decls.display, frame.decls.width, frame.decls.height, frame.decls['aspect-ratio']], ['block', '100%', 'auto', '4 / 3']);
  // The frame of the portrait on the homepage: the paper ground, a hairline, 12px of air.
  for (const prop of ['padding', 'background', 'border', 'transition']) assert.equal(frame.decls[prop], at('.v4-portrait-wrap', prop), prop);
  assert.deepEqual([frame.decls.padding, frame.decls.background, frame.decls.border], ['12px', 'var(--v4-paper)', '1px solid var(--v4-line)']);
  // The cover is a photo: it fills the frame. A picture in the text is evidence — a screenshot,
  // a scheme: it is fitted whole and never enlarged past its own size.
  assert.equal(at('.v4-article-cover img', 'object-fit'), 'cover');
  assert.equal(at('.v4-article-body img', 'object-fit'), 'scale-down');
  // A phone: a square. A picture taller than it is wide is fitted by its height, and a square
  // leaves it larger than 4:3 would (a 3:4 screenshot takes three quarters of the column).
  const phone = LAYER.find((r) => r.media === PHONE && r.selectors.includes('.v4-article-cover img') && r.selectors.includes('.v4-article-body img'));
  assert.deepEqual(phone && phone.decls, { 'aspect-ratio': '1 / 1' });
  // No other rule gives a note's picture a size of its own.
  for (const r of LAYER) {
    if (r === frame || r === phone || !r.selectors.some((s) => /^\.v4-article-(cover|body)\b.*\bimg$/.test(s))) continue;
    for (const prop of ['width', 'height', 'max-width', 'max-height', 'aspect-ratio', 'padding', 'border', 'background']) assert.ok(!(prop in r.decls), `${where(r)} sets ${prop}`);
  }
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
  // border and padding, by the item's border and by the room an item keeps for the
  // selected-item mark. (The item's 1px border was forgotten: the labels stood 1px off.) The
  // rule outweighs `.v4-menu { right: 0 }`, which stands below it.
  const inset = px(at('.v4-menu', 'border')) + sides(at('.v4-menu', 'padding')).left
    + px(at('.v4-menu-item', 'border')) + sides(at('.v4-nav-sub .v4-menu-item', 'padding')).left;
  assert.equal(at('.v4-nav-group > .v4-nav-sub', 'left'), `-${inset}px`);
  assert.equal(at('.v4-nav-group > .v4-nav-sub', 'right'), 'auto');
  // A panel is as wide as its longest label («Партнёрства и медиа» ran 13px past the border).
  assert.equal(at('.v4-menu', 'width'), 'max-content');

  // The theme icon sits in the middle of its button; pulled out by the room beside it, the icon
  // itself ends on the content's right edge — where the bar's rule ends.
  const icon = px(at('.v4-icon-btn svg', 'width'));
  for (const media of ['', PHONE]) {
    const room = (px(at('.v4-icon-btn', 'width', media)) - icon) / 2;
    assert.equal(at('.v4-theme', 'margin-right', media), `-${room}px`, media || 'desktop');
  }
  // The language and the theme panels share that corner: both are placed against the bar's
  // right group and end on the content's edge. (The language panel ended 38px inside it.)
  assert.equal(at('.v4-bar-right', 'position'), 'relative');
  assert.equal(at('.v4-bar-right > .v4-dropdown', 'position'), 'static');
  assert.equal(at('.v4-menu', 'right'), '0');
  assert.ok(!LAYER.some((r) => r.selectors.includes('.v4-theme > .v4-menu')), 'no offset of its own for the theme panel');
});
