#!/usr/bin/env node
// Announces every page of the live sitemap through IndexNow (Bing, Yandex and
// the other engines that share it) — the one-off push after a release that
// adds or moves pages, or when an engine has fallen behind the sitemap. A save
// in /admin announces its own pages by itself (functions/_lib/indexnow.js).
// Zero dependencies; needs no login: the key is public, served as
// https://s.morgunov.tech/<key>.txt.
//
//   node scripts/indexnow.mjs          # dry run: the URLs it would send
//   node scripts/indexnow.mjs --yes    # send them
//
// 200 or 202 means the engines took the list. 403 means the key file is not
// live yet (deploy first), 422 that a URL is not on this host.
import { ORIGIN } from '../functions/_lib/site.js';
import { INDEXNOW_KEY, INDEXNOW_ENDPOINT, indexNowBody } from '../functions/_lib/indexnow.js';

const send = process.argv.includes('--yes');

const sitemap = await (await fetch(`${ORIGIN}/sitemap.xml`)).text();
const urls = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim()))].filter((u) => u.startsWith(ORIGIN + '/'));
if (!urls.length) {
  console.error('No URLs in the live sitemap.');
  process.exit(1);
}

const key = await fetch(`${ORIGIN}/${INDEXNOW_KEY}.txt`);
const keyOk = key.ok && (await key.text()).trim() === INDEXNOW_KEY;
console.log(`${urls.length} URLs from ${ORIGIN}/sitemap.xml; key file ${keyOk ? 'live' : 'NOT live'}.`);

if (!send) {
  for (const u of urls) console.log('  ' + u);
  console.log('Dry run. Add --yes to send.');
  process.exit(0);
}
if (!keyOk) {
  console.error(`The key file ${ORIGIN}/${INDEXNOW_KEY}.txt does not answer with the key: deploy first.`);
  process.exit(1);
}

// The protocol takes up to 10 000 URLs a request.
const res = await fetch(INDEXNOW_ENDPOINT, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(indexNowBody(urls.slice(0, 10000))),
});
console.log(`IndexNow: ${res.status} ${res.statusText}`);
process.exit(res.status === 200 || res.status === 202 ? 0 : 1);
