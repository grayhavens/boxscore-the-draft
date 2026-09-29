// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { openSpots } from '../js/groups.js';
import { parseClaim, handleClaim, loadClaims, dismissClaim, claimsKey, MAX_PENDING_CLAIMS, CLAIMS_PER_IP_PER_HOUR } from '../worker/claims.js';

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

test('parseClaim needs a name and flattens and caps the text', () => {
  assert.equal(parseClaim(null), null);
  assert.equal(parseClaim({ name: '   ' }), null);
  assert.equal(parseClaim({ name: 42 }), null);
  assert.deepEqual(parseClaim({ name: '  Sam\n\tLee ', contact: 5 }), { name: 'Sam Lee', contact: '' });
  assert.equal(parseClaim({ name: 'x'.repeat(100) }).name.length, 40);
  assert.equal(parseClaim({ name: 'A', contact: 'y'.repeat(200) }).contact.length, 80);
});

test('a claim is stored newest first', async () => {
  const env = fakeEnv();
  let res = await handleClaim(claimRequest({ name: 'Sam', contact: 'sam@example.com' }), env, 'seasonticket', {}, deps);
  assert.equal(res.status, 200);
  res = await handleClaim(claimRequest({ name: 'Alex' }, { ip: '5.6.7.8' }), env, 'seasonticket', {}, deps);
  assert.equal(res.status, 200);
  const claims = await loadClaims(env, 'seasonticket');
  assert.deepEqual(claims.map(c => c.name), ['Alex', 'Sam']);
  assert.equal(claims[1].contact, 'sam@example.com');
  assert.equal(typeof claims[0].id, 'string');
});

test('claims are refused from other origins, full groups, bad bodies and GETs', async () => {
  const env = fakeEnv();
  assert.equal((await handleClaim(claimRequest({ name: 'Sam' }, { origin: 'https://evil.example' }), env, 'seasonticket', {}, deps)).status, 403);
  assert.equal((await handleClaim(claimRequest({ name: 'Sam' }), env, 'thedraft', {}, deps)).status, 409);
  assert.equal((await handleClaim(claimRequest({ name: '' }), env, 'seasonticket', {}, deps)).status, 400);
  assert.equal((await handleClaim(claimRequest(null, { method: 'GET' }), env, 'seasonticket', {}, deps)).status, 405);
  assert.equal(env.store.has(claimsKey('seasonticket')), false);
});

test('one IP gets a few claims an hour', async () => {
  const env = fakeEnv();
  for(let i = 0; i < CLAIMS_PER_IP_PER_HOUR; i++){
    assert.equal((await handleClaim(claimRequest({ name: `P${i}` }), env, 'seasonticket', {}, deps)).status, 200);
  }
  assert.equal((await handleClaim(claimRequest({ name: 'One more' }), env, 'seasonticket', {}, deps)).status, 429);
});

test('the pending list is capped', async () => {
  const env = fakeEnv();
  env.store.set(claimsKey('seasonticket'), JSON.stringify(Array.from({ length: MAX_PENDING_CLAIMS }, (_, i) => ({ id: String(i), name: 'x', at: 0 }))));
  assert.equal((await handleClaim(claimRequest({ name: 'Sam' }), env, 'seasonticket', {}, deps)).status, 429);
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
