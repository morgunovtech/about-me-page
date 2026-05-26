// Telegram archive parser (functions/_lib/dist/tg-import.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entitiesToHtml, parseArchive } from '../functions/_lib/dist/tg-import.js';

test('entitiesToHtml maps text_entities to blog HTML', () => {
  const html = entitiesToHtml([
    { type: 'plain', text: 'Привет ' },
    { type: 'bold', text: 'мир' },
    { type: 'plain', text: '\n\nВторой абзац со ' },
    { type: 'text_link', text: 'ссылкой', href: 'https://e.com' },
    { type: 'plain', text: '.' },
  ]);
  assert.match(html, /<p>Привет <strong>мир<\/strong><\/p>/);
  assert.match(html, /<p>Второй абзац со <a href="https:\/\/e\.com">ссылкой<\/a>\.<\/p>/);
});

test('entitiesToHtml escapes HTML in entity text', () => {
  assert.match(entitiesToHtml([{ type: 'plain', text: '<script>x' }]), /<p>&lt;script&gt;x<\/p>/);
});

test('entitiesToHtml handles a plain string and string-array', () => {
  assert.equal(entitiesToHtml('одна строка'), '<p>одна строка</p>');
  assert.match(entitiesToHtml(['a ', { type: 'italic', text: 'b' }]), /<p>a <em>b<\/em><\/p>/);
});

test('parseArchive normalizes messages, skips service + empty', () => {
  const exp = {
    name: 'channel',
    messages: [
      { id: 1, type: 'service', action: 'pin_message' },
      { id: 2, type: 'message', date: '2024-03-01T10:00:00', text_entities: [{ type: 'plain', text: 'Заголовок поста\n\nтело' }] },
      { id: 3, type: 'message', date: '2024-03-02T10:00:00', text_entities: [], photo: 'photos/photo_3@01.jpg' },
      { id: 4, type: 'message', date: '2024-03-03T10:00:00', text_entities: [] }, // empty, no photo → skip
    ],
  };
  const posts = parseArchive(exp);
  assert.equal(posts.length, 2);
  assert.equal(posts[0].messageId, 2);
  assert.equal(posts[0].title, 'Заголовок поста');
  assert.equal(posts[0].date, '2024-03-01');
  assert.match(posts[0].html, /<p>Заголовок поста<\/p><p>тело<\/p>/);
  assert.equal(posts[1].messageId, 3);
  assert.equal(posts[1].photo, 'photos/photo_3@01.jpg');
});

test('parseArchive accepts a bare messages array too', () => {
  const posts = parseArchive([{ id: 9, type: 'message', date: '2024-01-01T00:00:00', text_entities: [{ type: 'plain', text: 'hi' }] }]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].messageId, 9);
});
