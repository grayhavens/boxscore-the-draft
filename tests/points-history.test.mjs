// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { historyDay, parseSample, mergeSample, recordSample, handlePointsHistory, HISTORY_MAX_DAYS } from '../worker/points-history.js';

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
const ids = ['a', 'b'];

test('historyDay uses Central time', () => {
  // 2026-09-30 03:00 UTC is still Sep 29 in Chicago.
  assert.equal(historyDay(Date.UTC(2026, 8, 30, 3)), '2026-09-29');
  assert.equal(historyDay(Date.UTC(2026, 8, 30, 6)), '2026-09-30');
});

test('parseSample needs every drafter in both totals, as integers', () => {
  const ok = { season: '2026', p: { a: 10, b: -2, x: 5 }, l: { a: 4, b: 0 } };
  assert.deepEqual(parseSample(ok, ids), { season: '2026', p: { a: 10, b: -2 }, l: { a: 4, b: 0 } });
  assert.equal(parseSample({ ...ok, l: { a: 4 } }, ids), null);
  assert.equal(parseSample({ ...ok, p: { a: 1.5, b: 0 } }, ids), null);
  assert.equal(parseSample({ ...ok, season: '26' }, ids), null);
  assert.equal(parseSample(null, ids), null);
});

test('mergeSample replaces the same day, keeps order and caps length', () => {
  const s = v => ({ p: { a: v }, l: { a: 0 } });
  let h = mergeSample(null, '2026-09-29', s(1));
  h = mergeSample(h, '2026-09-27', s(0));
  h = mergeSample(h, '2026-09-29', s(3));
  assert.deepEqual(h.days.map(x => [x.d, x.p.a]), [['2026-09-27', 0], ['2026-09-29', 3]]);
  const many = { days: Array.from({ length: HISTORY_MAX_DAYS }, (_, i) => ({ d: `2025-${String(i).padStart(4, '0')}`, ...s(i) })) };
  const capped = mergeSample(many, '2027-01-01', s(9));
  assert.equal(capped.days.length, HISTORY_MAX_DAYS);
  assert.equal(capped.days.at(-1).d, '2027-01-01');
});

test('recorded samples are served per group prefix and season', async () => {
  const env = fakeEnv();
  const sample = parseSample({ season: '2026', p: { a: 7, b: 3 }, l: { a: 2, b: 3 } }, ids);
  await recordSample(env, 'history@seasonticket', sample, Date.UTC(2026, 8, 29, 18));
  const get = async (prefix, qs) => (await handlePointsHistory(new Request('https://x/points/history' + qs), new URL('https://x/points/history' + qs), env, prefix, {}, { json })).json();
  assert.deepEqual(await get('history@seasonticket', ''), { days: [{ d: '2026-09-29', p: { a: 7, b: 3 }, l: { a: 2, b: 3 } }] });
  assert.deepEqual(await get('history@seasonticket', '?season=2027'), { days: [] });
  assert.deepEqual(await get('history', ''), { days: [] });
});
