// The family chrome: ds/v1/chrome.js is script.js without the site-only parts,
// and the snippet in ds/v1/USAGE.md carries every part a service must repeat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildChrome } from '../scripts/build-chrome.mjs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('ds/v1/chrome.js is the twin of script.js, without the site-only code', () => {
  const chrome = read('ds/v1/chrome.js');
  assert.equal(chrome, buildChrome(read('script.js')));
  assert.doesNotMatch(chrome, /data-i18n|site-only|console\.log/);
  for (const part of ["setAttribute('data-js'", 'theme-preference', '.v4-dropdown', '.v4-theme-btn', '.v4-bar-mid a[href^="#"]']) {
    assert.ok(chrome.includes(part), 'chrome.js keeps ' + part);
  }
});

test('buildChrome refuses a script.js that lost its markers', () => {
  assert.throws(() => buildChrome('(() => {})();\n'), /no site-only region/);
  assert.throws(() => buildChrome('/* site-only:start */\nx\n'), /without a matching/);
});

test('the service chrome snippet in USAGE.md has every required part, in order', () => {
  const usage = read('ds/v1/USAGE.md');
  const m = /<!-- chrome:snippet:start -->\n```html\n([\s\S]*?)\n```\n<!-- chrome:snippet:end -->/.exec(usage);
  assert.ok(m, 'the snippet is fenced by the chrome:snippet markers');
  const html = m[1];
  const order = ['class="skip-link"', 'class="v4-root"', 'class="v4-bar"', 'class="v4-service"', 'class="v4-nav v4-dropdown"',
    'class="v4-dropdown v4-lang"', 'class="v4-dropdown v4-theme"', '<main id="main">', 'class="v4-foot"', '/ds/v1/chrome.js?v='];
  let at = -1;
  for (const part of order) {
    const i = html.indexOf(part);
    assert.ok(i > at, part + ' is present and in its place');
    at = i;
  }
  // Four themes, always in this order.
  assert.deepEqual([...html.matchAll(/data-theme-value="([a-z-]+)"/g)].map((x) => x[1]), ['light', 'dark', 'auto', 'high-contrast']);
  // Every toggle names the panel it opens, and that panel exists.
  for (const [, id] of html.matchAll(/aria-controls="([a-z-]+)"/g)) assert.ok(html.includes('id="' + id + '"'), 'panel #' + id);
  assert.match(usage, /## Service chrome \(required for a family service\)/);
  assert.doesNotMatch(usage, /optional chrome/);
});
