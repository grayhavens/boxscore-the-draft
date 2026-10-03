import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointsAlerts, POINTS_ALERT_URL, POINTS_ALERT_MAX_AGE_MS } from '../worker/points-alert.js';

const NOW = 1_800_000_000_000;
const ids = ['josh', 'sam', 'alex'];
const rule = (title, deltas, ts = NOW) => ({ id: title, type: 'rule', ts, title, deltas, moves: [] });

test('one event: its title, and what it did for you', () => {
  const out = pointsAlerts([rule('Lions take the NFC North lead', [{ id: 'josh', pts: 2, prov: true }, { id: 'sam', pts: -2, prov: true }])], ids, NOW);
  assert.equal(out.length, 2);
  const josh = out.find(a => a.drafterId === 'josh').payload;
  assert.deepEqual(josh, { kind: 'points', title: 'Lions take the NFC North lead', body: '+2 live points for you.', url: POINTS_ALERT_URL, tag: 'points' });
  assert.equal(out.find(a => a.drafterId === 'sam').payload.body, '−2 live points for you.');
});

test('several events become one alert per drafter with the net change', () => {
  const out = pointsAlerts([
    rule('Lions take the NFC North lead', [{ id: 'josh', pts: 2, prov: true }]),
    rule('Saints fall into last place in the NFC South', [{ id: 'josh', pts: -2, prov: true }]),
    rule('Chiefs take the AFC West lead', [{ id: 'josh', pts: 2, prov: true }])
  ], ids, NOW);
  assert.equal(out.length, 1);
  assert.equal(out[0].payload.title, '3 changes to your points');
  assert.equal(out[0].payload.body, '+2 live. Lions take the NFC North lead, and 2 more.');
});

test('a lock says the points are locked in', () => {
  const lock = { id: 'l', type: 'lock', ts: NOW, title: 'NFL regular season ends: points locked', deltas: [{ id: 'alex', pts: 5, prov: false }], moves: [] };
  const [alert] = pointsAlerts([lock], ids, NOW);
  assert.equal(alert.drafterId, 'alex');
  assert.equal(alert.payload.body, '+5 locked in for you.');
});

test('rank moves only alert the headline drafter, and only for 1st place', () => {
  const into1st = { id: 'r1', type: 'rank', ts: NOW, title: 'Sam moves into 1st projected', drafterId: 'sam', deltas: [], moves: [{ id: 'sam', from: 2, to: 1 }, { id: 'josh', from: 1, to: 2 }] };
  const out = pointsAlerts([into1st], ids, NOW);
  assert.deepEqual(out.map(a => a.drafterId), ['sam']);
  const shuffle = { ...into1st, title: 'Sam moves up to 3rd projected', moves: [{ id: 'sam', from: 6, to: 3 }] };
  assert.deepEqual(pointsAlerts([shuffle], ids, NOW), []);
});

test('zero deltas, strangers and stale events never alert', () => {
  assert.deepEqual(pointsAlerts([rule('x', [{ id: 'josh', pts: 0, prov: true }])], ids, NOW), []);
  assert.deepEqual(pointsAlerts([rule('x', [{ id: 'nobody', pts: 2, prov: true }])], ids, NOW), []);
  assert.deepEqual(pointsAlerts([rule('x', [{ id: 'josh', pts: 2, prov: true }], NOW - POINTS_ALERT_MAX_AGE_MS - 1)], ids, NOW), []);
});

test('a rank move alerts a drafter at most once a day', () => {
  const into1st = (id, ts) => ({ id, type: 'rank', ts, title: 'Sam moves into 1st projected', drafterId: 'sam', deltas: [], moves: [{ id: 'sam', from: 2, to: 1 }] });
  const earlier = [into1st('r0', NOW - 60 * 1000)];
  assert.deepEqual(pointsAlerts([into1st('r1', NOW)], ids, NOW, earlier), []);
  // Two in one batch: still one.
  const [alert] = pointsAlerts([into1st('r1', NOW), into1st('r2', NOW)], ids, NOW);
  assert.equal(alert.payload.title, 'Sam moves into 1st projected');
  // Yesterday's doesn't count against today.
  assert.equal(pointsAlerts([into1st('r1', NOW)], ids, NOW, [into1st('r0', NOW - 26 * 60 * 60 * 1000)]).length, 1);
  // Rule changes still alert alongside.
  const rl = rule('Lions take the NFC North lead', [{ id: 'sam', pts: 2, prov: true }]);
  assert.equal(pointsAlerts([into1st('r1', NOW), rl], ids, NOW, earlier)[0].payload.title, 'Lions take the NFC North lead');
});
