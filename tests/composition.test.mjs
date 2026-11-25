// Composition rules (v1.5.0). Each of them was first a remark of the owner's on
// the live site; written as prose they would be forgotten, so they are checks.
// The design system keeps the same list in guidelines/COMPOSITION.md.
//
//   1. One state — one sign (and never colour alone).
//   2. A number marks a sequence, nothing else.
//   3. A «more» link names what is behind it; the glyph is the renderer's.
//   4. A publication row says when and where; there is no free-text tag.
//   5. One button in a block; the second channel is a line of text.
//   6. The build mark is the version, a link to the changelog on GitHub.
//   7. The only round shape is the live dot (and its two relatives).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderers, feedSource, feedMonth, plainLabel } from '../functions/_lib/render.js';
import { fixStaleContent } from '../functions/_lib/migrations.js';
import { VERSION, CHANGELOG_URL } from '../functions/_lib/site.js';

const read = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const seed = JSON.parse(read('content.seed.json'));
const PAGES = ['index.html', 'en/index.html', 'collaborate.html', 'en/collaborate.html', 'consulting.html', 'en/consulting.html', 'uses.html', 'en/uses.html', 'about.html', 'en/about.html', 'privacy.html', 'en/privacy.html', '404.html'];
const HOME = ['index.html', 'en/index.html'];
const COMPONENTS = read('ds/v1/components.css');
const STYLES = read('styles.css');
const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim().replace(/\s+/g, ' '), m[2]]);
const section = (page, id) => {
  const from = page.indexOf(`id="${id}"`);
  assert.ok(from > 0, `#${id}`);
  return page.slice(from, page.indexOf('</section>', from));
};

test('1. one state — one sign: the selected menu item, the toggle of an open menu', () => {
  const all = rules(COMPONENTS);
  // Selected: a round mark before the label, not orange text inside an orange frame.
  const checked = all.filter(([sel]) => sel.includes('.v4-menu-item[aria-checked="true"]'));
  assert.deepEqual(checked.map(([sel]) => sel), ['.v4-menu-item[aria-checked="true"]::before']);
  assert.match(checked[0][1], /background: var\(--v4-orange\)/);
  // The keyboard focus ring exists, and is not painted around a toggle the script focused
  // after a pointer click (script.js marks that focus; any key press removes the mark).
  assert.ok(all.some(([sel, body]) => sel === '.v4-page :focus-visible' && /outline: 2px solid var\(--v4-orange\)/.test(body)));
  assert.ok(all.some(([sel, body]) => sel === '.v4-dropdown > [data-pointer-focus]:focus-visible' && /outline: none/.test(body)));
  const script = read('script.js');
  assert.match(script, /setAttribute\('data-pointer-focus', ''\)/);
  assert.match(script, /document\.addEventListener\('keydown', \(\) => \{\s+byPointer = false;\s+dropdowns\.forEach\(\(d\) => d\.toggle\.removeAttribute\('data-pointer-focus'\)\);/);
  assert.equal((script.match(/\.toggle\.focus\(/g) || []).length, 1, 'every scripted focus of a toggle goes through focusToggle()');
});

test('2. a number marks a sequence: sections and article headings carry none', () => {
  for (const f of PAGES) assert.doesNotMatch(read(f), /v4-section-num/, f);
  assert.doesNotMatch(COMPONENTS + STYLES, /v4-section-num|counter-increment|counter\(/);
  assert.doesNotMatch(JSON.stringify(seed), /"num":/);
});

test('3. a «more» link names what is behind it; «→» stays on the site, «↗» leaves it', () => {
  const VAGUE = /^(подробнее|ещё|еще|далее|смотреть|more|read more|see more|details)\b/i;
  let seen = 0;
  for (const f of HOME) {
    const page = read(f);
    for (const [, attrs, inner] of page.matchAll(/<div class="v4-more">\s*<a ([^>]*)>([\s\S]*?)<\/a>/g)) {
      seen++;
      const m = /^<span[^>]*>([^<]+)<\/span><span aria-hidden="true">&nbsp;(→|↗)<\/span>(<span class="sr-only">[^<]+<\/span>)?$/.exec(inner.trim());
      assert.ok(m, `${f}: ${inner}`);
      const [, label, glyph, newTab] = m;
      assert.doesNotMatch(label, /[→↗←]/, `${f}: the label carries no glyph`);
      assert.doesNotMatch(label, VAGUE, `${f}: «${label}» does not say what is there`);
      const external = /target="_blank"/.test(attrs);
      assert.equal(glyph, external ? '↗' : '→', `${f}: ${label}`);
      assert.equal(Boolean(newTab), external, `${f}: ${label}`);
      // A link that leaves the site ends with where it leads.
      // One name or two («GitHub Sponsors»).
      if (external) assert.match(label, / (на|on) [A-Z][A-Za-z]+( [A-Z][A-Za-z]+)?$/, `${f}: ${label}`);
    }
  }
  // v2.2.2: five — GitHub Sponsors left the page (owner); /privacy now introduces the privacy tools.
  assert.equal(seen, 10, 'five «more» links on each home page');
  // A glyph typed into a stored label is dropped; the stored labels of v1.4 are renamed.
  assert.equal(plainLabel('→ Все публикации'), 'Все публикации');
  assert.equal(plainLabel('Все проекты на GitHub ↗'), 'Все проекты на GitHub');
  const stored = fixStaleContent({ a: '→ Подробнее на LinkedIn', b: '→ More projects on GitHub', c: '→ Все публикации', d: '← Все публикации' });
  assert.deepEqual(stored, { a: 'Вся карьера на LinkedIn', b: 'All projects on GitHub', c: 'Все публикации', d: '← Все публикации' });
  assert.deepEqual(fixStaleContent(structuredClone(stored)), stored, 'a second pass changes nothing');
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

test('5. one button in the contact block; the e-mail is a line of text, the link comes last', () => {
  for (const f of HOME) {
    const contact = section(read(f), 'contact');
    assert.equal((contact.match(/class="v4-btn/g) || []).length, 1, f);
    assert.match(contact, /class="v4-btn v4-btn-primary" href="https:\/\/t\.me\//, f);
    assert.match(contact, /<p class="v4-contact-alt">[^<]+<a href="mailto:s@morgunov\.tech">s@morgunov\.tech<\/a><\/p>/, f);
    assert.ok(contact.indexOf('v4-cta-row') < contact.indexOf('v4-contact-alt') && contact.indexOf('v4-contact-alt') < contact.indexOf('v4-contact-links'), f);
  }
  // A mailto: cta never becomes a button, whatever the stored doc says.
  const doc = structuredClone(seed.home);
  doc.sections.contact.ctas[1].primary = true;
  assert.equal((renderers.contact(doc, 'ru', false).match(/class="v4-btn/g) || []).length, 1);
});

test('6. the build mark is the version, a link to the changelog on GitHub', () => {
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
});

test('7. the only round shapes: the live dot, the busy mark, the selected-item mark; none in the career', () => {
  const round = rules(COMPONENTS + STYLES).filter(([, body]) => /border-radius:\s*(?!0[;\s])\S/.test(body)).map(([sel]) => sel);
  assert.deepEqual(round.sort(), ['.v4-btn.is-busy::before', '.v4-live-dot', '.v4-menu-item[aria-checked="true"]::before']);
  for (const f of HOME) {
    const career = section(read(f), 'career');
    assert.doesNotMatch(career, /v4-live-dot|Текущая роль|Current role/, f);
    // «Now» is said by the period of the first row.
    assert.match(career, /<div class="period">\d{4} — (сейчас|now|present)<\/div>/, f);
  }
  // The role is a label of data: mono caps, like the period.
  const role = rules(STYLES).find(([sel]) => sel === '.v4-career-row .role')[1];
  assert.match(role, /font-family: var\(--v4-mono\)/);
  assert.match(role, /text-transform: uppercase/);
});
