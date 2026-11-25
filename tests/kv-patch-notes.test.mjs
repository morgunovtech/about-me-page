// scripts/kv-patch-notes.mjs — corrections to notes that live only in KV. The
// script writes production, so its rule is: a correction lands exactly where
// the patch names it, or the note is not written at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPatch, indexRow } from '../scripts/kv-patch-notes.mjs';
import { indexEntry } from '../functions/_lib/articles.js';

const note = () => ({
  slug: 'casio-f91w',
  status: 'published',
  date: '2023-06-06',
  rev: 4,
  title: { ru: 'Casio F91 — как создать продукт вне времени', en: 'Casio F91: how to make a timeless product' },
  excerpt: { ru: 'Часы Casio F91W: что в них такого.', en: 'The Casio F91W watch.' },
  body: { ru: '<p>Выросла до 20 000 точек. И ещё раз до 20 000 точек.</p><p>Опечатка тут: превет.</p>', en: '<p>Hello.</p>' },
  meta: { title: { ru: 'Casio F91 — как создать продукт вне времени', en: '' }, description: { ru: 'Своё описание', en: '' } },
  share: { title: { ru: 'Другой заголовок для карточки', en: '' }, description: { ru: '', en: '' }, image: { ru: '', en: '' } },
  tags: ['tech-history', 'Tech-History', 'not a slug'],
  cover: { src: '/assets/articles/x.jpg', alt: { ru: '', en: '' } },
  updatedAt: '2026-11-01T00:00:00.000Z',
});

test('a correction lands in the named field; a title is repeated in the copies that still hold it', () => {
  const src = note();
  const { doc, log, ok } = applyPatch(src, [
    { field: 'title.ru', from: 'Casio F91 —', to: 'Casio F91W —' },
    { field: 'body.ru', from: 'превет', to: 'привет' },
  ]);
  assert.ok(ok);
  assert.deepEqual(log.map((x) => x.status), ['applied', 'applied']);
  assert.equal(doc.title.ru, 'Casio F91W — как создать продукт вне времени');
  assert.equal(doc.meta.title.ru, 'Casio F91W — как создать продукт вне времени', 'meta.title held the old title');
  assert.equal(doc.share.title.ru, 'Другой заголовок для карточки', 'a share title of its own is left alone');
  assert.match(doc.body.ru, /привет\./);
  assert.equal(src.title.ru, 'Casio F91 — как создать продукт вне времени', 'the input doc is not mutated');
});

test('a quote that is missing or occurs twice stops the whole note', () => {
  const twice = applyPatch(note(), [{ field: 'body.ru', from: '20 000 точек', to: '20 000 точек' }]);
  assert.equal(twice.ok, false);
  assert.deepEqual([twice.log[0].status, twice.log[0].found], ['ambiguous', 2]);
  // Said on purpose: both places.
  const both = applyPatch(note(), [{ field: 'body.ru', from: '20 000 точек', to: '20 000 точек', count: 2 }]);
  assert.ok(both.ok);
  assert.equal(both.doc.body.ru.split('20 000').length - 1, 2);

  const missing = applyPatch(note(), [{ field: 'body.ru', from: 'нет такого текста', to: 'x' }]);
  assert.equal(missing.ok, false);
  assert.equal(missing.log[0].status, 'not-found');
  assert.equal(applyPatch(note(), [{ field: 'tags.ru', from: 'a', to: 'b' }]).log[0].status, 'bad-field');
  assert.equal(applyPatch(note(), [{ field: 'body.en', from: 'Hello', to: 'Hi' }]).ok, true);
});

test('an entry that could not be applied exactly once is refused: an empty «to», a «to» that holds its «from»', () => {
  // A second run must change nothing. «b» → «bc» would be applied again on every run; a deletion
  // («to» empty) could not be told from a quote that never stood in the note.
  for (const e of [
    { field: 'body.ru', from: 'превет', to: 'превет!' },
    { field: 'body.ru', from: ' Опечатка тут: превет.', to: '' },
    { field: 'body.ru', from: '', to: 'x' },
    { field: 'body.ru', from: 'превет' },
  ]) {
    const r = applyPatch(note(), [e]);
    assert.equal(r.ok, false, JSON.stringify(e));
    assert.equal(r.log[0].status, 'bad-entry');
    assert.deepEqual(r.doc, note(), 'nothing is changed');
  }
  // A deletion is written with a word of context kept on a side.
  const cut = applyPatch(note(), [{ field: 'body.ru', from: 'точек. И ещё раз до 20 000 точек.', to: 'точек.' }]);
  assert.ok(cut.ok);
  assert.equal(cut.doc.body.ru, '<p>Выросла до 20 000 точек.</p><p>Опечатка тут: превет.</p>');
  assert.equal(applyPatch(cut.doc, [{ field: 'body.ru', from: 'точек. И ещё раз до 20 000 точек.', to: 'точек.' }]).log[0].status, 'already');
});

test('a second run changes nothing', () => {
  const entries = [{ field: 'body.ru', from: 'превет', to: 'привет' }];
  const first = applyPatch(note(), entries);
  const second = applyPatch(first.doc, entries);
  assert.ok(second.ok);
  assert.equal(second.log[0].status, 'already');
  assert.deepEqual(second.doc, first.doc);
});

test('the index row is the one an /admin Save writes', () => {
  const doc = note();
  assert.deepEqual(indexRow(doc), indexEntry(doc));
  assert.deepEqual(indexRow(doc).tags, ['tech-history']);
});
