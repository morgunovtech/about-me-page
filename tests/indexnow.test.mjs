// v4.3.0 — search engines: IndexNow for Bing and Yandex, robots.txt in one
// group, the RSS feeds kept out of the index.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { INDEXNOW_KEY, INDEXNOW_ENDPOINT, indexNowUrls, indexNowBody, pingIndexNow, announce } from '../functions/_lib/indexnow.js';
import { PAGE_PATHS, articlePaths } from '../functions/_lib/cache.js';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('the IndexNow key is served from the site root as itself, past Functions', () => {
  assert.match(INDEXNOW_KEY, /^[A-Za-z0-9-]{8,128}$/); // the protocol's alphabet and length
  assert.equal(read(`${INDEXNOW_KEY}.txt`), INDEXNOW_KEY);
  assert.ok(JSON.parse(read('_routes.json')).exclude.includes(`/${INDEXNOW_KEY}.txt`));
});

test('indexNowUrls: pages only, absolute, once each', () => {
  assert.deepEqual(indexNowUrls(PAGE_PATHS.home), ['https://s.morgunov.tech/', 'https://s.morgunov.tech/en/']);
  const note = indexNowUrls(articlePaths('yubikey'));
  assert.ok(note.includes('https://s.morgunov.tech/notes/yubikey') && note.includes('https://s.morgunov.tech/en/notes/yubikey'));
  assert.ok(note.every((u) => !/\.(xml|txt)$/.test(u)), 'no sitemap, feeds or llms.txt');
  assert.equal(new Set(note).size, note.length);
  assert.deepEqual(indexNowUrls(['/', '/', 'https://evil.example/', null]), ['https://s.morgunov.tech/']);
});

test('indexNowBody names the host and where the key lives', () => {
  assert.deepEqual(indexNowBody(['https://s.morgunov.tech/']), {
    host: 's.morgunov.tech',
    key: INDEXNOW_KEY,
    keyLocation: `https://s.morgunov.tech/${INDEXNOW_KEY}.txt`,
    urlList: ['https://s.morgunov.tech/'],
  });
});

test('announce posts from production only, after the response', async () => {
  const calls = [];
  const fake = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(null, { status: 202 });
  };
  const waited = [];
  const job = announce({ request: new Request('https://s.morgunov.tech/admin/api/save', { method: 'POST' }), waitUntil: (p) => waited.push(p) }, PAGE_PATHS.uses, fake);
  assert.equal(waited.length, 1);
  assert.equal(await job, true);
  assert.equal(calls[0].url, INDEXNOW_ENDPOINT);
  assert.deepEqual(calls[0].body.urlList, ['https://s.morgunov.tech/uses', 'https://s.morgunov.tech/en/uses']);

  for (const host of ['about-me-page-cr2.pages.dev', 'abc123.about-me-page-cr2.pages.dev', 'localhost:8788']) {
    assert.equal(announce({ request: new Request(`http://${host}/admin/api/save`), waitUntil: () => assert.fail('no announcement') }, PAGE_PATHS.uses, fake), null);
  }
  assert.equal(calls.length, 1);
});

test('pingIndexNow never throws and sends nothing for an empty list', async () => {
  assert.equal(await pingIndexNow([], () => assert.fail('no request')), false);
  assert.equal(await pingIndexNow(['https://s.morgunov.tech/'], async () => { throw new Error('offline'); }), false);
});

test('robots.txt: one group for every crawler, one Content-Signal line (Yandex flags each one as unknown)', () => {
  const robots = read('robots.txt');
  const directives = robots.split('\n').filter((l) => l && !l.startsWith('#'));
  assert.equal(directives.filter((l) => /^Content-Signal:/i.test(l)).length, 1);
  assert.match(robots, /^Content-Signal: search=yes, ai-input=yes, ai-train=yes$/m);
  // One group: the User-agent lines come first and together, then the rules.
  const agents = directives.filter((l) => /^User-agent:/i.test(l)).map((l) => l.split(':')[1].trim());
  assert.deepEqual(directives.slice(0, agents.length).map((l) => l.split(':')[1].trim()), agents);
  assert.equal(agents[0], '*');
  for (const bot of ['GPTBot', 'OAI-SearchBot', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended']) assert.ok(agents.includes(bot), bot);
  assert.doesNotMatch(robots, /^Disallow:/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/s\.morgunov\.tech\/sitemap\.xml$/m);
});

test('the RSS feeds stay out of the index', () => {
  // render-notes.js pulls in the seed through content.js (a JSON import only the
  // Workers bundler takes), so the header is checked in the source, as v030 does.
  const rn = read('functions/_lib/render-notes.js');
  const feed = rn.slice(rn.indexOf('export async function renderFeed'));
  assert.match(feed.slice(0, feed.indexOf('\n}\n')), /'X-Robots-Tag': 'noindex'/);
});
