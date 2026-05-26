// Core distribution transform: blog HTML → Telegram HTML + message plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTgHtml } from '../functions/_lib/dist/tg-html.js';
import { buildPlan } from '../functions/_lib/dist/plan.js';
import { makeSourcePost } from '../functions/_lib/dist/source-post.js';

test('renderTgHtml maps inline + block tags to Telegram HTML', () => {
  const { html, images } = renderTgHtml(
    '<p>Текст <b>жирный</b> <i>курсив</i> <a href="https://x.com">ссылка</a>.</p>' +
    '<h2>Заголовок</h2><blockquote>Цитата</blockquote><ul><li>раз</li><li>два</li></ul><hr><p>Конец.</p>'
  );
  assert.match(html, /Текст <b>жирный<\/b> <i>курсив<\/i> <a href="https:\/\/x\.com">ссылка<\/a>\./);
  assert.match(html, /<b>Заголовок<\/b>/); // heading → bold line
  assert.match(html, /<blockquote>Цитата<\/blockquote>/);
  assert.match(html, /• раз\n• два/); // ul → bullets
  assert.match(html, /···/); // hr separator
  assert.equal(images.length, 0);
  // blocks separated by blank lines
  assert.match(html, /\.\n\n<b>Заголовок<\/b>/);
});

test('renderTgHtml collects images and never inlines them', () => {
  const { html, images } = renderTgHtml('<p>До</p><figure><img src="/assets/a.webp" alt="x"><figcaption>Подпись</figcaption></figure><p>После</p>');
  assert.deepEqual(images, ['/assets/a.webp']);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /<i>Подпись<\/i>/);
});

test('renderTgHtml maps ol to numbered list', () => {
  const { html } = renderTgHtml('<ol><li>первый</li><li>второй</li></ol>');
  assert.match(html, /1\. первый\n2\. второй/);
});

const longHtml = '<p>' + 'слово '.repeat(1200) + '</p>'; // > 4000 chars

test('plan: short native post → one text message', () => {
  const p = makeSourcePost({ lang: 'ru', html: '<p>Короткий пост.</p>', url: 'https://s.morgunov.tech/notes/x', excerpt: 'тизер' });
  const plan = buildPlan(p);
  assert.equal(plan.mode, 'native');
  assert.equal(plan.messages.length, 1);
  assert.equal(plan.messages[0].kind, 'text');
});

test('plan: long post → teaser + link by default', () => {
  const p = makeSourcePost({ lang: 'ru', html: longHtml, url: 'https://s.morgunov.tech/notes/x', excerpt: 'Тизер поста.' });
  const plan = buildPlan(p);
  assert.equal(plan.mode, 'teaser');
  assert.equal(plan.messages.length, 1);
  assert.match(plan.messages[0].text, /Тизер поста\.\n\nhttps:\/\/s\.morgunov\.tech\/notes\/x/);
});

test('plan: short post + 1 image → sendPhoto with caption', () => {
  const p = makeSourcePost({ lang: 'ru', html: '<p>С картинкой.</p>', images: ['https://s.morgunov.tech/assets/a.webp'], url: 'u' });
  const plan = buildPlan(p);
  assert.equal(plan.messages[0].kind, 'photo');
  assert.equal(plan.messages[0].photoUrl, 'https://s.morgunov.tech/assets/a.webp');
  assert.match(plan.messages[0].caption, /С картинкой\./);
});

test('plan: 3 images → album, caption on first', () => {
  const p = makeSourcePost({ lang: 'ru', html: '<p>Альбом.</p>', images: ['a', 'b', 'c'], url: 'u' });
  const plan = buildPlan(p);
  assert.equal(plan.messages[0].kind, 'album');
  assert.equal(plan.messages[0].items.length, 3);
  assert.match(plan.messages[0].items[0].caption, /Альбом\./);
  assert.equal(plan.messages[0].items[1].caption, undefined);
});

test('plan: split strategy numbers a long post into a series', () => {
  const html = Array.from({ length: 6 }, (_, i) => `<p>${'абзац '.repeat(200)}${i}</p>`).join('');
  const plan = buildPlan(makeSourcePost({ lang: 'ru', html, url: 'u' }), { strategy: 'split' });
  assert.equal(plan.mode, 'split');
  assert.ok(plan.messages.length >= 2);
  assert.match(plan.messages[0].text, /\(1\/\d+\)$/);
});
