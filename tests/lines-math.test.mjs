import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LINE_LEAGUES, lineRecord, behind, staysAhead, specRange, lineStatus, gapText, gapInGames } from '../js/lines-math.js';

const nfl = LINE_LEAGUES.nfl, epl = LINE_LEAGUES.epl, nhl = LINE_LEAGUES.nhl, cfb = LINE_LEAGUES.cfb;
const team = (name, row) => ({ name, record: lineRecord(row) });

test('lineRecord counts ties as half a win and half a loss', () => {
  assert.deepEqual(lineRecord({ wins: 5, losses: 3, ties: 1 }), { w: 5.5, l: 3.5, pts: 0, gp: 9 });
  assert.equal(lineRecord({ wins: 10, losses: 5, otLosses: 3, points: 23 }).gp, 18);
  assert.equal(lineRecord({ wins: 3, draws: 2, losses: 1, points: 11, gamesPlayed: 6 }).gp, 6);
});

test('behind is games behind for record leagues and points for EPL/NHL', () => {
  const a = lineRecord({ wins: 6, losses: 4 }), b = lineRecord({ wins: 7, losses: 2 });
  assert.equal(behind(a, b, nfl), 1.5);
  assert.equal(behind(b, a, nfl), -1.5);
  assert.equal(behind(lineRecord({ points: 40 }), lineRecord({ points: 44 }), epl), 4);
});

test('staysAhead needs a known season length and ignores tiebreakers', () => {
  const lead = lineRecord({ wins: 13, losses: 2 }), chase = lineRecord({ wins: 10, losses: 5 });
  assert.equal(staysAhead(lead, chase, nfl), true);       // 10 + 2 left = 12 < 13
  assert.equal(staysAhead(lineRecord({ wins: 12, losses: 3 }), chase, nfl), false);  // 12 = 12: a tie isn't enough
  assert.equal(staysAhead(lead, chase, cfb), false);
  assert.equal(staysAhead(lineRecord({ points: 80, gamesPlayed: 36 }), lineRecord({ points: 73, gamesPlayed: 36 }), epl), true);
});

test('specRange covers exact, top and bottom rules', () => {
  assert.deepEqual(specRange({ rank: 1 }, 4), [0, 0]);
  assert.deepEqual(specRange({ rank: 3 }, 20), [2, 2]);
  assert.deepEqual(specRange({ top: 2 }, 12), [0, 1]);
  assert.deepEqual(specRange({ bottom: 3 }, 20), [17, 19]);
  assert.deepEqual(specRange({ bottom: 1 }, 4), [3, 3]);
});

const division = [
  team('Lions', { wins: 7, losses: 2 }),
  team('Packers', { wins: 6, losses: 4 }),
  team('Vikings', { wins: 5, losses: 5 }),
  team('Bears', { wins: 2, losses: 8 })
];

test('a division leader holds the line by its cushion over 2nd', () => {
  const s = lineStatus(division, 0, { scope: 'division', rank: 1 }, nfl);
  assert.equal(s.status, 'holds');
  assert.equal(s.gap, 1.5);
  assert.equal(s.rival.name, 'Packers');
});

test('a chaser is measured against the team holding the line', () => {
  const s = lineStatus(division, 2, { scope: 'division', rank: 1 }, nfl);
  assert.equal(s.status, 'chasing');
  assert.equal(s.gap, 2.5);
  assert.equal(s.rival.name, 'Lions');
});

test('last place is at risk until it can no longer climb out', () => {
  const s = lineStatus(division, 3, { scope: 'division', bottom: 1 }, nfl);
  assert.equal(s.status, 'risk');
  assert.equal(s.gap, 3);
  assert.equal(s.rival.name, 'Vikings');
  const above = lineStatus(division, 2, { scope: 'division', bottom: 1 }, nfl);
  assert.equal(above.status, 'clear');
  assert.equal(above.gap, 3);
});

test('late in a season the math turns into clinched, out, stuck and safe', () => {
  const late = [
    team('A', { wins: 14, losses: 2 }),
    team('B', { wins: 10, losses: 6 }),
    team('C', { wins: 8, losses: 8 }),
    team('D', { wins: 3, losses: 13 })
  ];
  assert.equal(lineStatus(late, 0, { rank: 1 }, nfl).status, 'clinched');
  assert.equal(lineStatus(late, 1, { rank: 1 }, nfl).status, 'out');
  assert.equal(lineStatus(late, 3, { bottom: 1 }, nfl).status, 'stuck');
  assert.equal(lineStatus(late, 2, { bottom: 1 }, nfl).status, 'safe');
});

test('an exact placement only applies from below it', () => {
  const table = [team('Arsenal', { points: 30 }), team('City', { points: 28 }), team('Spurs', { points: 25 }), team('Villa', { points: 24 })];
  assert.equal(lineStatus(table, 0, { rank: 2 }, epl), null);
  const s = lineStatus(table, 2, { rank: 2 }, epl);
  assert.equal(s.status, 'chasing');
  assert.equal(s.gap, 3);
  const top = lineStatus(table, 3, { top: 2 }, epl);
  assert.equal(top.rival.name, 'City');
});

test('gapText reads like a standings page', () => {
  assert.equal(gapText(1.5, nfl), '1½ games');
  assert.equal(gapText(0.5, nfl), '½ game');
  assert.equal(gapText(1, nfl), '1 game');
  assert.equal(gapText(0, nfl), '0 games');
  assert.equal(gapText(3, nfl), '3 games');
  assert.equal(gapText(1, nhl), '1 pt');
  assert.equal(gapText(4, epl), '4 pts');
  assert.equal(gapInGames(6, epl), 2);
});
