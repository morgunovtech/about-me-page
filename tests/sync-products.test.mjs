// v1.1.0 — scripts/sync-products.mjs: the pure text helpers (the GitHub calls
// themselves need `gh` and run only when the script is executed).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { plain, ruFromReadme } from '../scripts/sync-products.mjs';

test('plain() drops emoji and markdown — the site has neither', () => {
  assert.equal(plain('🛠️ Your **personal** DevOps in `Telegram`'), 'Your personal DevOps in Telegram');
  assert.equal(plain('see [the docs](https://x.y/z) 🇺🇿'), 'see the docs');
  assert.equal(plain(null), '');
});

test('ruFromReadme(): the H1 after «—» leads, then the first paragraph', () => {
  const md = '# TofsDevOps — сам себе DevOps в Telegram\n\n> Мониторит сайты, **чинит** что может,\n> и молчит.\n\n## Установка\n\nтекст';
  assert.equal(ruFromReadme(md), 'Сам себе DevOps в Telegram. Мониторит сайты, чинит что может, и молчит.');
  // No «—» in the H1: the paragraph alone.
  assert.equal(ruFromReadme('# FoundYou\n\nПоказывает, что выдаёт фото'), 'Показывает, что выдаёт фото.');
  // Badges/images only, or no H1 → nothing to sync.
  assert.equal(ruFromReadme('# X\n\n## Next'), null);
  assert.equal(ruFromReadme('no heading here'), null);
});
