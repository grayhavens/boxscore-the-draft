// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSports, sportsCaps, sportsShown, sportsOf, sportsRounds, MAX_SPORT_ROUNDS } from '../js/sports.js';
import { sportsKey, loadSports, liveGroupCaps, handleSports } from '../worker/sports.js';

function fakeEnv(){
  const store = new Map();
  return {
    store,
    LEAGUE_FACTS: {
      async get(key, type){ const v = store.get(key); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
      async put(key, value){ store.set(key, value); }
    }
  };
}

const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers });

test('parseSports keeps known sports with 0..5 picks and at least one drafted', () => {
  assert.deepEqual(parseSports({ nfl: 3, pga: 0 }), { nfl: 3, pga: 0 });
  assert.equal(parseSports({ pga: 0 }), null, 'nothing drafted');
  assert.equal(parseSports({ nfl: 6 }), null, 'too many picks');
  assert.equal(parseSports({ nfl: 1.5 }), null);
  assert.equal(parseSports({ nfl: -1 }), null);
  assert.equal(parseSports({ curling: 2 }), null, 'unknown sport');
  assert.equal(parseSports([3]), null);
  assert.equal(parseSports(null), null);
});

test('parseSports holds the draft to the room\'s rounds ceiling', () => {
  const all = { epl: 5, nfl: 5, nba: 5, nhl: 5, mlb: 5, wnba: 5, cfb: 5, mcbb: 5, pga: 5 };
  assert.ok(sportsRounds(all) > MAX_SPORT_ROUNDS);
  assert.equal(parseSports(all), null);
});

test('drafted sports become caps in draft room order; 0 is scores only', () => {
  const sports = { pga: 0, nfl: 3, epl: 2, wnba: 0 };
  assert.deepEqual(Object.entries(sportsCaps(sports)), [['epl', 2], ['nfl', 3]]);
  assert.deepEqual(sportsShown(sports), ['wnba', 'pga']);
  assert.equal(sportsCaps({ pga: 0 }), null);
});

test('sportsOf turns caps and a shown list back into the record shape', () => {
  assert.deepEqual(sportsOf({ nfl: 3 }, ['pga', 'nfl']), { nfl: 3, pga: 0 });
});

test('GET /sports answers null until a commissioner saves one', async () => {
  const env = fakeEnv();
  const res = await handleSports(new Request('https://w/sports'), new URL('https://w/sports'), env, 'thedraft', {}, { json });
  assert.deepEqual(await res.json(), { sports: null });
});

test('PUT /sports needs the password, saves, and hands the caps to the synced rooms', async () => {
  const env = fakeEnv();
  const pushed = [];
  const draftRoomStub = url => ({ async fetch(req){ pushed.push([url.searchParams.get('room'), await req.json()]); return new Response('{}'); } });
  const deps = { json, draftRoomStub, isAuthorized: req => req.headers.get('X-Admin-Password') === 'pw' };
  const put = (body, pw) => handleSports(
    new Request('https://w/sports?group=seasonticket', { method: 'PUT', body: JSON.stringify(body), headers: pw ? { 'X-Admin-Password': pw } : {} }),
    new URL('https://w/sports?group=seasonticket'), env, 'seasonticket', {}, deps);
  globalThis.caches = { default: { async delete(){ return true; } } };

  assert.equal((await put({ sports: { nfl: 3 } })).status, 401);
  assert.equal((await put({ sports: { pga: 0 } }, 'pw')).status, 400);

  const res = await put({ sports: { nfl: 3, pga: 0 } }, 'pw');
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.deepEqual(saved.sports, { nfl: 3, pga: 0 });
  assert.deepEqual(JSON.parse(env.store.get(sportsKey('seasonticket'))).sports, { nfl: 3, pga: 0 });
  assert.deepEqual(pushed.map(([room]) => room).sort(), ['main', 'mock-1']);
  assert.deepEqual(pushed[0][1], { caps: { nfl: 3 }, at: saved.at });
  assert.deepEqual(await liveGroupCaps(env, 'seasonticket'), { caps: { nfl: 3 }, at: saved.at });
});

test('without a record, rooms fall back to js/groups.js caps', async () => {
  const env = fakeEnv();
  assert.equal(await loadSports(env, 'thedraft'), null);
  assert.deepEqual(await liveGroupCaps(env, 'thedraft'), { caps: null, at: 0 });
  const st = await liveGroupCaps(env, 'seasonticket');
  assert.equal(st.at, 0);
  assert.equal(st.caps.pga, 3);
});
