// Whether an Activity run has anything to write (js/activity-snapshot.js):
// a snapshot equal to the server's in all but dataAt is skipped, saving
// two KV writes per foreground visit against a 1,000-a-day free limit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { snapshotUnchanged } from '../js/activity-snapshot.js';

const snap = (over = {}) => ({
  v: 2, dataAt: 1000,
  holders: { 'epl:Win League': 'liverpool' }, bonus: { epl: ['liverpool'] },
  totals: { josh: 12, drew: 9 }, lockedTotals: { josh: 4, drew: 6 }, ranks: { josh: 1, drew: 2 },
  live: { nfl: { josh: 3 } }, locked: { epl: false, nfl: false },
  ...over
});

test('only dataAt moved: unchanged', () => {
  assert.equal(snapshotUnchanged(snap(), snap({ dataAt: 99999 })), true);
});

test('key order does not matter (one side came back from the server)', () => {
  const a = snap();
  const b = JSON.parse(JSON.stringify({ locked: a.locked, live: a.live, ranks: a.ranks, lockedTotals: a.lockedTotals, totals: { drew: 9, josh: 12 }, bonus: a.bonus, holders: a.holders, dataAt: 5, v: 2 }));
  assert.equal(snapshotUnchanged(a, b), true);
});

test('any real change is a change', () => {
  assert.equal(snapshotUnchanged(snap(), snap({ totals: { josh: 13, drew: 9 } })), false);
  assert.equal(snapshotUnchanged(snap(), snap({ ranks: { josh: 2, drew: 1 } })), false);
  assert.equal(snapshotUnchanged(snap(), snap({ locked: { epl: true, nfl: false } })), false);
  assert.equal(snapshotUnchanged(snap(), snap({ live: {} })), false);
  assert.equal(snapshotUnchanged(snap(), snap({ holders: {} })), false);
  assert.equal(snapshotUnchanged(snap(), snap({ v: 3 })), false);
});

test('no server snapshot yet: always write', () => {
  assert.equal(snapshotUnchanged(null, snap()), false);
  assert.equal(snapshotUnchanged(snap(), null), false);
});
