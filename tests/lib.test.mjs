// Unit tests for the CMS's pure functions. Run via `node --test` (built-in
// runner, no dependencies). These lock the security-critical behaviour:
// HTML/attribute escaping, JSON-LD validity, localization resolution, and the
// auth crypto round-trip. Fix-specific assertions are added alongside each fix.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, renderInline, safeHref } from '../functions/_lib/markdown.js';
import { isLocalized, pick, resolvePath } from '../functions/_lib/i18n.js';
import { renderJsonLd } from '../functions/_lib/jsonld.js';
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

test('sameOrigin allows same origin and missing Origin, blocks cross', () => {
  const req = (headers, url = 'https://s.morgunov.tech/admin/api/save') => ({
    headers: { get: (h) => headers[h] ?? null },
    url,
  });
  assert.equal(sameOrigin(req({ Origin: 'https://s.morgunov.tech' })), true);
  assert.equal(sameOrigin(req({})), true); // no Origin, no Sec-Fetch-Site
  assert.equal(sameOrigin(req({ Origin: 'https://evil.com' })), false);
  // Sec-Fetch-Site gate
  assert.equal(sameOrigin(req({ 'Sec-Fetch-Site': 'same-origin' })), true);
  assert.equal(sameOrigin(req({ 'Sec-Fetch-Site': 'none' })), true);
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
});
