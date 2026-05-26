// Pure parsing helpers for the t.me import (functions/admin/api/import.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, extractText, tgToHtml } from '../functions/admin/api/import.js';

test('slugify transliterates Russian and strips junk', () => {
  assert.equal(slugify('Привет, мир!'), 'privet-mir');
  assert.equal(slugify('Hello World 2026'), 'hello-world-2026');
  assert.equal(slugify('—'), '');
});

test('extractText pulls the message text block from embed HTML', () => {
  const html = `<div class="tgme_widget_message_bubble">
    <div class="tgme_widget_message_text js-message_text" dir="auto">Привет <b>мир</b><br/>Вторая строка</div>
    <div class="tgme_widget_message_footer compact">…</div>`;
  const t = extractText(html);
  assert.match(t, /Привет <b>мир<\/b>/);
  assert.match(t, /Вторая строка/);
});

test('tgToHtml turns <br> runs into paragraphs, keeps inline tags', () => {
  const out = tgToHtml('Первый абзац<br/>с переносом<br/><br/>Второй <b>абзац</b>');
  assert.equal(out, '<p>Первый абзац<br>с переносом</p><p>Второй <b>абзац</b></p>');
});
