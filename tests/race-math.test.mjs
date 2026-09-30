// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dayNumber, isoOfDay, fmtDay, buildSeries, standingsAt, interp, monthsOf, monthWindow, followWindow,
  monthIndexAt, dayAtFraction, yDomain, gridValues, xTicks, spreadLabels, MIN_WINDOW, withToday, simulatedHistory
} from '../js/race-math.js';
import { assignRank } from '../js/rank.js';

const drafters = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Bob' }, { id: 'c', name: 'Cy' }];
const day = (d, p, l) => ({ d, p, l });

test('day numbers round-trip and format', () => {
  const n = dayNumber('2026-09-29');
  assert.equal(isoOfDay(n), '2026-09-29');
  assert.equal(dayNumber('2026-10-01') - n, 2);
  assert.equal(fmtDay(n), 'Sep 29');
  assert.equal(dayNumber('2027-03-15') - dayNumber('2027-03-14'), 1);   // across DST
});

test('assignRank: competition rank, T prefix, name tie-break', () => {
  const rows = [{ name: 'Cy', v: 5 }, { name: 'Ann', v: 7 }, { name: 'Bob', v: 5 }, { name: 'Dee', v: 1 }];
  const out = assignRank(rows, 'v', 'r');
  assert.deepEqual(out.map(r => [r.name, r.rLabel]), [['Ann', '1'], ['Bob', 'T2'], ['Cy', 'T2'], ['Dee', '4']]);
});

test('buildSeries holds gaps flat, runs to today and ranks each day', () => {
  const s = buildSeries([
    day('2026-10-01', { a: 5, b: 9, c: 1 }, { a: 0, b: 0, c: 0 }),
    day('2026-09-29', { a: 3, b: 1, c: 1 }, { a: 0, b: 0, c: 0 })
  ], drafters, '2026-10-03');
  assert.equal(s.origin, dayNumber('2026-09-29'));
  assert.equal(s.today, 4);
  assert.deepEqual(s.proj.a, [3, 3, 5, 5, 5]);
  assert.deepEqual(s.rank.a, ['1', '1', '2', '2', '2']);
  assert.deepEqual(s.rank.b.slice(0, 2), ['T2', 'T2']);
  assert.deepEqual(s.pos.c.slice(0, 1), [2]);        // tied with Bob, after him by name
  assert.equal(buildSeries([], drafters, '2026-10-03'), null);
});

test('buildSeries never ends before the last sample (clock skew)', () => {
  const s = buildSeries([day('2026-10-05', { a: 1, b: 1, c: 1 }, { a: 0, b: 0, c: 0 })], drafters, '2026-10-04');
  assert.equal(s.today, 0);
});

test('standingsAt matches the Points table row shape', () => {
  const s = buildSeries([day('2026-09-29', { a: 10, b: 12, c: 12 }, { a: 10, b: 2, c: 4 })], drafters, '2026-09-29');
  const rows = standingsAt(s, 0);
  assert.deepEqual(rows.map(r => [r.id, r.rankLabel, r.lockedRankLabel, r.provisionalTotal]),
    [['b', 'T1', '3', 10], ['c', 'T1', '2', 8], ['a', '3', '1', 0]]);
});

test('interp clamps and blends', () => {
  assert.equal(interp([0, 10, 20], 0.5), 5);
  assert.equal(interp([0, 10, 20], -3), 0);
  assert.equal(interp([0, 10, 20], 9), 20);
});

test('months run from the first sample to today, repeat labels get the year', () => {
  const s = buildSeries([day('2026-09-29', { a: 0, b: 0, c: 0 }, { a: 0, b: 0, c: 0 })], drafters, '2027-10-02');
  const months = monthsOf(s);
  assert.equal(months.length, 14);
  assert.equal(months[0].label, "Sep '26");
  assert.equal(months[1].label, "Oct '26");
  assert.equal(months[4].label, 'Jan');
  assert.equal(months.at(-1).label, "Oct '27");
  assert.equal(months[0].start, -28);
  assert.equal(months[1].start, 2);
});

test('a short first month still gets a MIN_WINDOW window; a full month is padded', () => {
  const s = buildSeries([day('2026-09-29', { a: 0, b: 0, c: 0 }, { a: 0, b: 0, c: 0 })], drafters, '2026-11-10');
  const [sep, oct] = monthsOf(s);
  const [a, b] = monthWindow(sep);
  assert.equal(b - a, MIN_WINDOW);
  assert.equal(b, 1 + 2);
  assert.deepEqual(monthWindow(oct), [0, 34]);
});

test('monthIndexAt and followWindow', () => {
  const s = buildSeries([day('2026-09-29', { a: 0, b: 0, c: 0 }, { a: 0, b: 0, c: 0 })], drafters, '2026-11-10');
  const months = monthsOf(s);
  assert.equal(monthIndexAt(months, 0), 0);
  assert.equal(monthIndexAt(months, 5), 1);
  assert.equal(monthIndexAt(months, 999), 2);
  const [a, b] = followWindow(40);
  assert.ok(a < 40 && b > 40);
});

test('dayAtFraction snaps inside the window and never past today', () => {
  assert.equal(dayAtFraction(0.5, [0, 30], 40), 15);
  assert.equal(dayAtFraction(1, [0, 30], 20), 20);
  assert.equal(dayAtFraction(0, [-5, 10], 20), 0);
});

test('yDomain zooms to the window and widens to the season', () => {
  const p = i => ({ a: 50 + i, b: 40, c: 45 });
  const days = Array.from({ length: 200 }, (_, i) => day(isoOfDay(dayNumber('2026-09-01') + i), p(i), { a: 0, b: 0, c: 0 }));
  const s = buildSeries(days, drafters, isoOfDay(dayNumber('2026-09-01') + 199));
  const season = [0, 400];
  const month = yDomain(s, [0, 30], season);
  assert.ok(month.lo > 20 && month.lo < 40, 'month view zooms in: ' + month.lo);
  assert.ok(month.hi < 100);
  const all = yDomain(s, season, season);
  assert.equal(all.lo, 0);
  assert.ok(all.hi >= 249 * 1.05 - 1e-9);
  assert.ok(gridValues(all).length <= 7);
  assert.ok((all.hi - all.lo) / all.step <= 6);
});

test('yDomain goes below 0 only when someone is negative', () => {
  const s = buildSeries([day('2026-09-29', { a: -8, b: 3, c: 1 }, { a: 0, b: 0, c: 0 })], drafters, '2026-09-29');
  const d = yDomain(s, [-2, 8], [-30, 400]);
  assert.ok(d.lo < -8 && d.lo >= -8 - 6 - 1e-9);
  const pos = buildSeries([day('2026-09-29', { a: 2, b: 3, c: 1 }, { a: 0, b: 0, c: 0 })], drafters, '2026-09-29');
  assert.equal(yDomain(pos, [-2, 8], [-30, 400]).lo, 0);
});

test('xTicks: weekly in a month, month starts across the season', () => {
  const s = buildSeries([day('2026-09-29', { a: 0, b: 0, c: 0 }, { a: 0, b: 0, c: 0 })], drafters, '2026-11-10');
  const oct = monthWindow(monthsOf(s)[1]);
  assert.deepEqual(xTicks(s, oct).map(x => x.label), ['Oct 1', 'Oct 8', 'Oct 15', 'Oct 22', 'Oct 29']);
  const season = xTicks(s, [-29, 370]);
  assert.equal(season[0].label, 'Sep');   // window opens Aug 31
  assert.ok(season.length <= 7);
});

test('spreadLabels keeps a gap and stays in bounds', () => {
  const labs = spreadLabels([{ y: 100 }, { y: 102 }, { y: 199 }], 12, 10, 200);
  assert.deepEqual(labs.map(l => l.y), [100, 112, 199]);
  const low = spreadLabels([{ y: 198 }, { y: 199 }, { y: 200 }], 12, 10, 200);
  assert.deepEqual(low.map(l => l.y), [176, 188, 200]);
});

test('withToday swaps in the on-screen totals for today', () => {
  const rows = [{ id: 'a', total: 9, confirmedTotal: 2 }];
  const out = withToday([{ d: '2026-09-29', p: { a: 1 }, l: { a: 0 } }, { d: '2026-09-30', p: { a: 3 }, l: { a: 0 } }], '2026-09-30', rows);
  assert.deepEqual(out, [{ d: '2026-09-29', p: { a: 1 }, l: { a: 0 } }, { d: '2026-09-30', p: { a: 9 }, l: { a: 2 } }]);
});

test('simulatedHistory is seeded, starts near 0 and lands on today', () => {
  const rows = [{ id: 'a', name: 'Ann', total: 40, confirmedTotal: 10 }, { id: 'b', name: 'Bob', total: -3, confirmedTotal: 0 }];
  const h = simulatedHistory(rows, '2026-08-31', '2026-12-01');
  assert.deepEqual(h, simulatedHistory(rows, '2026-08-31', '2026-12-01'));
  assert.equal(h[0].d, '2026-08-31');
  assert.equal(h[0].p.a, 0);
  assert.deepEqual(h.at(-1), { d: '2026-12-01', p: { a: 40, b: -3 }, l: { a: 10, b: 0 } });
  assert.ok(h.every(x => x.l.a <= Math.max(x.p.a, x.l.a)));
});
