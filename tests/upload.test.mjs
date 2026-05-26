// Magic-byte sniffing for uploads (functions/admin/api/upload.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sniffType } from '../functions/admin/api/upload.js';

const bytes = (...a) => new Uint8Array(a).buffer;
const text = (s) => new TextEncoder().encode(s).buffer;

test('sniffType detects real image formats', () => {
  assert.equal(sniffType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a)), 'image/png');
  assert.equal(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(sniffType(text('GIF89a...')), 'image/gif');
  // RIFF....WEBP
  const webp = new Uint8Array(16);
  webp.set(new TextEncoder().encode('RIFF'), 0);
  webp.set(new TextEncoder().encode('WEBP'), 8);
  assert.equal(sniffType(webp.buffer), 'image/webp');
  assert.equal(sniffType(text('<svg xmlns="...">')), 'image/svg+xml');
});

test('sniffType rejects non-image / mislabeled content', () => {
  assert.equal(sniffType(text('<!DOCTYPE html><script>alert(1)</script>')), null);
  assert.equal(sniffType(text('just some text')), null);
  assert.equal(sniffType(bytes(0x00, 0x01, 0x02, 0x03)), null);
});
