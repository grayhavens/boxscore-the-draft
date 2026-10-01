import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSeason, rankStandings, placeLabel, upsertSeason, championsOf, namesText, allTimeTable } from '../js/champions.js';

const ids = ['josh', 'sam', 'alex', 'drew'];

test('an app season keeps every drafter with points, in order', () => {
  const s = parseSeason({ id: '2026', label: '2026 Draft', source: 'app', at: 5, standings: [
    { id: 'sam', name: 'Sam', pts: 38 }, { id: 'josh', name: 'Josh', pts: 31 }, { id: 'alex', name: 'Alex', pts: 31 }
  ] }, ids);
  assert.equal(s.source, 'app');
  assert.deepEqual(s.standings.map(x => x.id), ['sam', 'josh', 'alex']);
});

test('parseSeason rejects bad ids, missing points, duplicates and out-of-order points', () => {
  const ok = { id: '2025', standings: [{ id: 'josh', name: 'Josh' }] };
  assert.ok(parseSeason(ok, ids));
  assert.equal(parseSeason({ ...ok, id: '25' }, ids), null);
  assert.equal(parseSeason({ ...ok, source: 'app' }, ids), null);
  assert.equal(parseSeason({ id: '2025', standings: [{ id: 'josh', name: 'Josh' }, { id: 'josh', name: 'Josh' }] }, ids), null);
  assert.equal(parseSeason({ id: '2025', standings: [{ name: 'A', pts: 3 }, { name: 'B', pts: 9 }] }, ids), null);
  assert.equal(parseSeason({ id: '2025', standings: [] }, ids), null);
});

test('a manual season keeps people who left by name, and cleans text', () => {
  const s = parseSeason({ id: '2024', standings: [{ id: 'ghost', name: '  Old <b>Pal</b> ' }, { id: 'josh', name: 'Josh' }] }, ids);
  assert.equal(s.label, '2024 Draft');
  assert.deepEqual(s.standings[0], { id: '', name: 'Old b Pal /b', pts: null });
});

test('rankStandings shares a place on equal points only', () => {
  const r = rankStandings([{ name: 'A', pts: 10 }, { name: 'B', pts: 8 }, { name: 'C', pts: 8 }, { name: 'D', pts: 2 }]);
  assert.deepEqual(r.map(x => x.rank), [1, 2, 2, 4]);
  assert.equal(placeLabel(r[1], r), 'T2');
  assert.equal(placeLabel(r[3], r), '4');
  assert.deepEqual(rankStandings([{ name: 'A', pts: null }, { name: 'B', pts: null }]).map(x => x.rank), [1, 2]);
});

test('upsertSeason replaces by id and keeps newest first', () => {
  const a = { id: '2024', standings: [] }, b = { id: '2026', standings: [] }, c = { id: '2025', standings: [] };
  const list = upsertSeason(upsertSeason(upsertSeason([], a), b), c);
  assert.deepEqual(list.map(s => s.id), ['2026', '2025', '2024']);
  assert.equal(upsertSeason(list, { ...a, label: 'x' }).find(s => s.id === '2024').label, 'x');
});

test('co-champions and their names', () => {
  const season = { standings: [{ id: 'sam', name: 'Sam', pts: 30 }, { id: 'josh', name: 'Josh', pts: 30 }, { id: 'alex', name: 'Alex', pts: 4 }] };
  assert.deepEqual(championsOf(season).map(s => s.name), ['Sam', 'Josh']);
  assert.equal(namesText(['Sam', 'Josh']), 'Sam and Josh');
  assert.equal(namesText(['A', 'B', 'C']), 'A, B and C');
});

test('the all-time table follows drafters by id and ranks titles, podiums, then average', () => {
  const seasons = [
    { id: '2026', standings: [{ id: 'sam', name: 'Sammy', pts: 40 }, { id: 'josh', name: 'Josh', pts: 30 }, { id: 'alex', name: 'Alex', pts: 20 }, { id: 'drew', name: 'Drew', pts: 10 }] },
    { id: '2025', standings: [{ id: 'josh', name: 'Josh', pts: null }, { id: 'sam', name: 'Sam', pts: null }, { id: '', name: 'Old Pal', pts: null }] }
  ];
  const table = allTimeTable(seasons, { sam: 'Sam' });
  // Josh and Sam tie on titles, podiums and average, so it's by name.
  assert.deepEqual(table.map(r => r.name), ['Josh', 'Sam', 'Alex', 'Old Pal', 'Drew']);
  const sam = table.find(r => r.id === 'sam');
  assert.equal(sam.titles, 1);
  assert.equal(sam.podiums, 2);
  assert.equal(sam.avg, 1.5);
  assert.deepEqual(sam.titleYears, ['2026']);
  assert.equal(table.find(r => r.name === 'Old Pal').best, 3);
});
