import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleChampions, championAlert, championsKey } from '../worker/champions.js';

// A KV stand-in and the route's dependencies, as worker/rundown-proxy.js passes them.
function setup(){
  const store = new Map();
  const env = { LEAGUE_FACTS: {
    get: async (k, type) => (store.has(k) ? (type === 'json' ? JSON.parse(store.get(k)) : store.get(k)) : null),
    put: async (k, v) => { store.set(k, v); }
  } };
  const pushed = [], logged = [];
  const deps = {
    json: (data, status, headers) => new Response(JSON.stringify(data), { status, headers }),
    isAuthorized: async request => request.headers.get('X-Admin-Password') === 'testpw',
    drafterIds: ['josh', 'sam', 'alex'],
    prefix: 'champions',
    push: p => pushed.push(p),
    log: t => logged.push(t)
  };
  const call = (method, { body, query = '', password = 'testpw' } = {}) => {
    const url = new URL(`http://localhost/champions${query}`);
    const request = new Request(url, { method, headers: { 'X-Admin-Password': password, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return handleChampions(request, url, env, 'thedraft', {}, deps);
  };
  return { store, call, pushed, logged };
}

const appSeason = { id: '2026', label: '2026 Draft', source: 'app', standings: [{ id: 'sam', name: 'Sam', pts: 38 }, { id: 'josh', name: 'Josh', pts: 31 }] };

test('anyone can read, only the commissioner can write', async () => {
  const { call } = setup();
  assert.deepEqual(await (await call('GET')).json(), { seasons: [] });
  assert.equal((await call('PUT', { body: { season: appSeason }, password: 'nope' })).status, 401);
  assert.equal((await call('DELETE', { query: '?id=2026', password: 'nope' })).status, 401);
});

test('recording the app season stores it, logs it and alerts the group once', async () => {
  const { call, store, pushed, logged } = setup();
  const res = await call('PUT', { body: { season: appSeason } });
  assert.equal(res.status, 200);
  const { seasons } = await res.json();
  assert.equal(seasons[0].id, '2026');
  assert.ok(seasons[0].at > 0);
  assert.ok(store.has(championsKey('champions')));
  assert.equal(pushed.length, 1);
  assert.equal(pushed[0].title, 'Sam wins the 2026 Draft');
  assert.equal(logged[0], 'History: recorded the 2026 Draft (Sam 1st)');
  // Updating it again doesn't alert again.
  await call('PUT', { body: { season: appSeason } });
  assert.equal(pushed.length, 1);
  assert.equal(logged[1], 'History: updated the 2026 Draft (Sam 1st)');
});

test('a typed-in season is kept in year order and never alerts', async () => {
  const { call, pushed } = setup();
  await call('PUT', { body: { season: appSeason } });
  const res = await call('PUT', { body: { season: { id: '2025', source: 'manual', standings: [{ id: 'josh', name: 'Josh' }] } } });
  const { seasons } = await res.json();
  assert.deepEqual(seasons.map(s => s.id), ['2026', '2025']);
  assert.equal(pushed.length, 1);
});

test('bad seasons are refused and removal works', async () => {
  const { call } = setup();
  assert.equal((await call('PUT', { body: { season: { id: 'abc', standings: [] } } })).status, 400);
  await call('PUT', { body: { season: appSeason } });
  assert.equal((await call('DELETE', { query: '?id=nope' })).status, 400);
  const { seasons } = await (await call('DELETE', { query: '?id=2026' })).json();
  assert.deepEqual(seasons, []);
});

test('co-champions share the title in the alert', () => {
  const alert = championAlert({ ...appSeason, standings: [{ id: 'sam', name: 'Sam', pts: 30 }, { id: 'josh', name: 'Josh', pts: 30 }] });
  assert.equal(alert.title, 'Sam and Josh share the 2026 Draft');
  assert.equal(alert.url, './?view=overall&seg=history');
  assert.equal(championAlert({ ...appSeason, source: 'manual' }), null);
});
