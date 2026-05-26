// Telegram target publish(): Bot API calls, message-url derivation, 429 retry,
// mock mode. fetch + sleep are injected so no network is touched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telegram } from '../functions/_lib/dist/targets/telegram.js';
import { getTarget } from '../functions/_lib/dist/targets/index.js';

const noSleep = () => Promise.resolve();
const okFetch = (calls, results) => async (url, init) => {
  calls.push({ url, body: JSON.parse(init.body) });
  const r = results.shift() || { ok: true, result: { message_id: 1 } };
  return { json: async () => r };
};

test('registry resolves telegram and linkedin', () => {
  assert.equal(getTarget('telegram').id, 'telegram');
  assert.equal(getTarget('linkedin').id, 'linkedin');
  assert.equal(getTarget('nope'), null);
});

test('publish sends a text message and derives the public URL', async () => {
  const calls = [];
  const plan = { messages: [{ kind: 'text', text: 'hi', parseMode: 'HTML', linkPreview: true }] };
  const res = await telegram.publish(plan, { token: 'T', channel: '@raschet7', fetch: okFetch(calls, [{ ok: true, result: { message_id: 42 } }]), sleep: noSleep });
  assert.equal(res.ok, true);
  assert.equal(res.refs[0].messageId, 42);
  assert.equal(res.refs[0].url, 'https://t.me/raschet7/42');
  assert.match(calls[0].url, /\/botT\/sendMessage$/);
  assert.equal(calls[0].body.parse_mode, 'HTML');
  assert.equal(calls[0].body.link_preview_options.is_disabled, false);
});

test('publish honors 429 retry_after then succeeds', async () => {
  const calls = [];
  const results = [{ ok: false, error_code: 429, parameters: { retry_after: 1 } }, { ok: true, result: { message_id: 7 } }];
  const res = await telegram.publish({ messages: [{ kind: 'text', text: 'x' }] }, { token: 'T', channel: '@c', fetch: okFetch(calls, results), sleep: noSleep });
  assert.equal(res.ok, true);
  assert.equal(calls.length, 2); // retried once
  assert.equal(res.refs[0].messageId, 7);
});

test('publish album sends sendMediaGroup with caption on first item', async () => {
  const calls = [];
  const plan = { messages: [{ kind: 'album', parseMode: 'HTML', items: [{ photoUrl: 'a', caption: 'cap' }, { photoUrl: 'b' }] }] };
  const res = await telegram.publish(plan, { token: 'T', channel: '@c', fetch: okFetch(calls, [{ ok: true, result: [{ message_id: 5 }, { message_id: 6 }] }]), sleep: noSleep });
  assert.match(calls[0].url, /sendMediaGroup$/);
  assert.equal(calls[0].body.media[0].caption, 'cap');
  assert.equal(calls[0].body.media[1].caption, undefined);
  assert.equal(res.refs[0].messageId, 5); // first message of the group
});

test('publish mock mode touches no network', async () => {
  let touched = false;
  const res = await telegram.publish({ messages: [{ kind: 'text', text: 'x' }, { kind: 'text', text: 'y' }] }, { token: 'T', channel: '@c', mock: true, fetch: () => { touched = true; } });
  assert.equal(touched, false);
  assert.equal(res.mock, true);
  assert.equal(res.refs.length, 2);
});

test('publish without token fails cleanly', async () => {
  const res = await telegram.publish({ messages: [] }, {});
  assert.equal(res.ok, false);
  assert.match(res.error, /TELEGRAM/);
});
