// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseInterest, handleInterest, loadInterest, dismissInterest, interestAlertMessage,
  INTEREST_KEY, MAX_PENDING_INTEREST, INTEREST_PER_IP_PER_HOUR, PLATFORM_ADMIN_LINK
} from '../worker/interest.js';

function fakeEnv(){
  const store = new Map();
  return {
    store,
    LEAGUE_FACTS: {
      async get(key, type){ const v = store.get(key); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
      async put(key, value){ store.set(key, value); },
      async delete(key){ store.delete(key); }
    }
  };
}

const deps = {
  isAllowedOrigin: o => o === 'https://boxscore.space',
  json: (data, status) => new Response(JSON.stringify(data), { status })
};

function interestRequest(body, { origin = 'https://boxscore.space', ip = '1.2.3.4', method = 'POST' } = {}){
  return new Request('https://worker/interest', {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
}

test('parseInterest needs a name and an email; kind defaults to start', () => {
  assert.deepEqual(parseInterest(null), { error: 'name' });
  assert.deepEqual(parseInterest({ name: ' ', email: 'a@b.co' }), { error: 'name' });
  assert.deepEqual(parseInterest({ name: 'Sam', email: 'nope' }), { error: 'email' });
  assert.deepEqual(parseInterest({ name: ' Sam\tLee ', email: ' sam@example.com ' }),
    { interest: { name: 'Sam Lee', email: 'sam@example.com', kind: 'start', note: '' } });
  assert.equal(parseInterest({ name: 'Sam', email: 'a@b.co', kind: 'join' }).interest.kind, 'join');
  assert.equal(parseInterest({ name: 'Sam', email: 'a@b.co', kind: 'admin' }).interest.kind, 'start');
  assert.equal(parseInterest({ name: 'x'.repeat(100), email: 'a@b.co' }).interest.name.length, 40);
});

test('a note keeps its line breaks, trimmed and capped', () => {
  const { note } = parseInterest({ name: 'Sam', email: 'a@b.co', note: '  Six of us\r\n\n\n\nNFL and   NBA\u0007 mostly  ' }).interest;
  assert.equal(note, 'Six of us\n\nNFL and NBA mostly');
  assert.equal(parseInterest({ name: 'Sam', email: 'a@b.co', note: 'y'.repeat(900) }).interest.note.length, 500);
  assert.equal(parseInterest({ name: 'Sam', email: 'a@b.co', note: 42 }).interest.note, '');
});

test('interest is stored newest first, and can be dismissed', async () => {
  const env = fakeEnv();
  let res = await handleInterest(interestRequest({ name: 'Sam', email: 'sam@example.com', kind: 'start', note: 'Six friends' }), env, {}, deps);
  assert.equal(res.status, 200);
  res = await handleInterest(interestRequest({ name: 'Alex', email: 'alex@example.com', kind: 'join' }, { ip: '5.6.7.8' }), env, {}, deps);
  assert.equal(res.status, 200);
  const list = await loadInterest(env);
  assert.deepEqual(list.map(e => [e.name, e.kind]), [['Alex', 'join'], ['Sam', 'start']]);
  assert.equal(list[1].note, 'Six friends');
  assert.equal(typeof list[0].id, 'string');

  const gone = await dismissInterest(env, list[0].id);
  assert.equal(gone.name, 'Alex');
  assert.equal(await dismissInterest(env, 'nope'), null);
  await dismissInterest(env, list[1].id);
  assert.equal(env.store.has(INTEREST_KEY), false);
});

test('interest is refused off our origins, without a name or email, and when not a POST', async () => {
  const env = fakeEnv();
  assert.equal((await handleInterest(interestRequest({ name: 'Sam', email: 'a@b.co' }, { origin: 'https://evil.example' }), env, {}, deps)).status, 403);
  assert.equal((await handleInterest(interestRequest({ name: '', email: 'a@b.co' }), env, {}, deps)).status, 400);
  assert.equal((await handleInterest(interestRequest({ name: 'Sam' }), env, {}, deps)).status, 400);
  assert.equal((await handleInterest(interestRequest(null, { method: 'GET' }), env, {}, deps)).status, 405);
  assert.deepEqual(await loadInterest(env), []);
});

test('interest is rate limited per IP and capped while it waits', async () => {
  const env = fakeEnv();
  for(let i = 0; i < INTEREST_PER_IP_PER_HOUR; i++){
    assert.equal((await handleInterest(interestRequest({ name: `P${i}`, email: 'a@b.co' }), env, {}, deps)).status, 200);
  }
  assert.equal((await handleInterest(interestRequest({ name: 'One more', email: 'a@b.co' }), env, {}, deps)).status, 429);

  const full = fakeEnv();
  full.store.set(INTEREST_KEY, JSON.stringify(Array.from({ length: MAX_PENDING_INTEREST }, (_, i) => ({ id: String(i), name: 'x', email: 'a@b.co' }))));
  assert.equal((await handleInterest(interestRequest({ name: 'Sam', email: 'a@b.co' }, { ip: '9.9.9.9' }), full, {}, deps)).status, 429);
});

test('the alert names the person, what they want and their note, and links to the Platform view', () => {
  const msg = interestAlertMessage({ name: 'Sam <b>', email: 'sam@example.com', kind: 'join', note: 'Line one\nLine two' }, { to: 'me@example.com', pending: 3 });
  assert.equal(msg.subject, 'Sam <b> is interested in Boxscore');
  assert.equal(msg.reply_to, 'sam@example.com');
  assert.deepEqual(msg.to, ['me@example.com']);
  assert.match(msg.text, /wants to join a group/);
  assert.match(msg.text, /3 people on the list/);
  assert.match(msg.text, /Line one\nLine two/);
  assert.match(msg.html, /Sam &lt;b&gt;/);
  assert.match(msg.html, /Line one<br>Line two/);
  assert.ok(msg.text.includes(PLATFORM_ADMIN_LINK));
  assert.match(interestAlertMessage({ name: 'A', email: 'a@b.co', kind: 'start', note: '' }, { to: 'x@y.co', pending: 1 }).text, /1 person on the list/);
});
