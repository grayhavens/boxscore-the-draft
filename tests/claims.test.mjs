// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openSpots } from '../js/groups.js';
import { parseClaim, handleClaim, claimAlertMessage, claimAlertEnabled, adminLink, loadClaims, dismissClaim, claimsKey, MAX_PENDING_CLAIMS, CLAIMS_PER_IP_PER_HOUR } from '../worker/claims.js';

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

function claimRequest(body, { origin = 'https://boxscore.space', ip = '1.2.3.4', method = 'POST' } = {}){
  return new Request('https://worker/claim?group=seasonticket', {
    method,
    headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
}

test('only groups with open spots take claims', () => {
  assert.equal(openSpots('seasonticket').length > 0, true);
  assert.deepEqual(openSpots('thedraft'), []);
  assert.deepEqual(openSpots('nope'), []);
});

test('parseClaim needs a name and an email, and flattens and caps the text', () => {
  assert.deepEqual(parseClaim(null), { error: 'name' });
  assert.deepEqual(parseClaim({ name: '   ', email: 'a@b.co' }), { error: 'name' });
  assert.deepEqual(parseClaim({ name: 42, email: 'a@b.co' }), { error: 'name' });
  assert.deepEqual(parseClaim({ name: 'Sam' }), { error: 'email' });
  assert.deepEqual(parseClaim({ name: 'Sam', email: 'not an email' }), { error: 'email' });
  assert.deepEqual(parseClaim({ name: 'Sam', email: 'sam@example' }), { error: 'email' });
  assert.deepEqual(parseClaim({ name: '  Sam\n\tLee ', email: ' sam@example.com ' }), { claim: { name: 'Sam Lee', email: 'sam@example.com' } });
  assert.equal(parseClaim({ name: 'x'.repeat(100), email: 'a@b.co' }).claim.name.length, 40);
  assert.deepEqual(parseClaim({ name: 'A', email: 'y'.repeat(200) + '@b.co' }), { error: 'email' });
});

test('a claim is stored newest first', async () => {
  const env = fakeEnv();
  let res = await handleClaim(claimRequest({ name: 'Sam', email: 'sam@example.com' }), env, 'seasonticket', {}, deps);
  assert.equal(res.status, 200);
  res = await handleClaim(claimRequest({ name: 'Alex', email: 'alex@example.com' }, { ip: '5.6.7.8' }), env, 'seasonticket', {}, deps);
  assert.equal(res.status, 200);
  const claims = await loadClaims(env, 'seasonticket');
  assert.deepEqual(claims.map(c => c.name), ['Alex', 'Sam']);
  assert.equal(claims[1].email, 'sam@example.com');
  assert.equal(typeof claims[0].id, 'string');
});

test('claims are refused from other origins, full groups, bad bodies and GETs', async () => {
  const env = fakeEnv();
  assert.equal((await handleClaim(claimRequest({ name: 'Sam', email: 'sam@example.com' }, { origin: 'https://evil.example' }), env, 'seasonticket', {}, deps)).status, 403);
  assert.equal((await handleClaim(claimRequest({ name: 'Sam', email: 'sam@example.com' }), env, 'thedraft', {}, deps)).status, 409);
  assert.equal((await handleClaim(claimRequest({ name: '', email: 'a@b.co' }), env, 'seasonticket', {}, deps)).status, 400);
  assert.equal((await handleClaim(claimRequest({ name: 'Sam' }), env, 'seasonticket', {}, deps)).status, 400);
  assert.equal((await handleClaim(claimRequest(null, { method: 'GET' }), env, 'seasonticket', {}, deps)).status, 405);
  assert.equal(env.store.has(claimsKey('seasonticket')), false);
});

test('one IP gets a few claims an hour', async () => {
  const env = fakeEnv();
  for(let i = 0; i < CLAIMS_PER_IP_PER_HOUR; i++){
    assert.equal((await handleClaim(claimRequest({ name: `P${i}`, email: 'p@example.com' }), env, 'seasonticket', {}, deps)).status, 200);
  }
  assert.equal((await handleClaim(claimRequest({ name: 'One more', email: 'o@example.com' }), env, 'seasonticket', {}, deps)).status, 429);
});

test('the pending list is capped', async () => {
  const env = fakeEnv();
  env.store.set(claimsKey('seasonticket'), JSON.stringify(Array.from({ length: MAX_PENDING_CLAIMS }, (_, i) => ({ id: String(i), name: 'x', at: 0 }))));
  assert.equal((await handleClaim(claimRequest({ name: 'Sam', email: 'sam@example.com' }), env, 'seasonticket', {}, deps)).status, 429);
});

test('dismissing removes one claim, and the key once the last is gone', async () => {
  const env = fakeEnv();
  env.store.set(claimsKey('seasonticket'), JSON.stringify([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]));
  assert.equal(await dismissClaim(env, 'seasonticket', 'zzz'), false);
  assert.equal(await dismissClaim(env, 'seasonticket', 'a'), true);
  assert.deepEqual((await loadClaims(env, 'seasonticket')).map(c => c.id), ['b']);
  await dismissClaim(env, 'seasonticket', 'b');
  assert.equal(env.store.has(claimsKey('seasonticket')), false);
});

test('claim alert email names the person and links to the admin page for that group', () => {
  const msg = claimAlertMessage('seasonticket', { name: 'Sam <b>', email: 'sam@example.com' }, { to: 'admin@example.com', pending: 2, open: 3 });
  assert.deepEqual(msg.to, ['admin@example.com']);
  assert.equal(msg.reply_to, 'sam@example.com');
  assert.match(msg.subject, /^Sam <b> claimed a spot in /);
  assert.equal(adminLink('seasonticket'), 'https://boxscore.space/admin?group=seasonticket');
  assert.ok(msg.text.includes(adminLink('seasonticket')));
  assert.ok(msg.html.includes('Sam &lt;b&gt;') && !msg.html.includes('Sam <b>'));
  assert.match(msg.text, /2 claims waiting · 3 spots open/);
});

test('claim alert sends only with both secrets set, and runs after a saved claim', async () => {
  assert.equal(claimAlertEnabled({}), false);
  assert.equal(claimAlertEnabled({ RESEND_API_KEY: 'k' }), false);
  assert.equal(claimAlertEnabled({ RESEND_API_KEY: 'k', CLAIM_ALERT_EMAIL: 'admin@example.com' }), true);

  const env = { ...fakeEnv(), RESEND_API_KEY: 'k', CLAIM_ALERT_EMAIL: 'admin@example.com' };
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return new Response('{}'); };
  try {
    const pending = [];
    const res = await handleClaim(claimRequest({ name: 'Sam', email: 'sam@example.com' }), env, 'seasonticket', {}, { ...deps, waitUntil: p => pending.push(p) });
    assert.equal(res.status, 200);
    await Promise.all(pending);
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://api.resend.com/emails');
    assert.equal(sent[0].body.subject.startsWith('Sam claimed a spot'), true);

    globalThis.fetch = async () => { throw new Error('down'); };
    const res2 = await handleClaim(claimRequest({ name: 'Alex', email: 'alex@example.com' }, { ip: '9.9.9.9' }), env, 'seasonticket', {}, deps);
    assert.equal(res2.status, 200);
    assert.equal((await loadClaims(env, 'seasonticket')).length, 2);
  } finally {
    globalThis.fetch = realFetch;
  }
});
