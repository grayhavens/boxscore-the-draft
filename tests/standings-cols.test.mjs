import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pctText, gbText, streakText, standingsColsHtml, standingsHeadHtml, STANDINGS_COLS } from '../js/standings-cols.js';

test('pctText uses ESPN’s percent, or works it out from the record', () => {
  assert.equal(pctText({ winPercent: 0.75 }), '.750');
  assert.equal(pctText({ winPercent: 1 }), '1.000');
  assert.equal(pctText({ wins: 2, losses: 1, ties: 1 }), '.625');
  assert.equal(pctText({ wins: 0, losses: 0 }), '—');
});

test('gbText and streakText read ESPN’s numbers', () => {
  assert.equal(gbText(0), '—');
  assert.equal(gbText(1.5), '1.5');
  assert.equal(gbText(3), '3');
  assert.equal(streakText(4), 'W4');
  assert.equal(streakText(-2), 'L2');
  assert.equal(streakText(null), '—');
});

test('standingsColsHtml writes one cell per column, marking the ones that give way', () => {
  const html = standingsColsHtml('nfl', { wins: 3, losses: 1, ties: 0, winPercent: 0.75, pointsFor: 100, pointsAgainst: 80, streak: -1 });
  const cells = [...html.matchAll(/<span class="st-c(?: (narrow|tiny))?">([^<]*)<\/span>/g)].map(m => [m[2], m[1] || null]);
  assert.equal(cells.length, STANDINGS_COLS.nfl.length);
  assert.deepEqual(cells.map(c => c[0]), ['3', '1', '0', '.750', '100', '80', '+20', 'L1']);
  assert.deepEqual(cells.filter(c => c[1] === 'narrow').map(c => c[0]), ['100', '80']);
  assert.deepEqual(cells.filter(c => c[1] === 'tiny').map(c => c[0]), ['0', 'L1']);
});

test('EPL goal difference is signed with a real minus; unknown leagues get nothing', () => {
  assert.match(standingsColsHtml('epl', { gamesPlayed: 6, wins: 1, draws: 2, losses: 3, goalsFor: 4, goalsAgainst: 9, goalDifference: -5, points: 5 }), />−5</);
  assert.equal(standingsColsHtml('cfb', { wins: 5 }), '');
  assert.equal(standingsHeadHtml('cfb'), '');
  assert.match(standingsHeadHtml('nhl'), />OTL</);
});

import { leagueLeaders, overviewRows } from '../js/standings-cols.js';

test('leagueLeaders sorts both conferences together', () => {
  const rows = [{ teamName: 'B', winPercent: 0.5, wins: 2 }, { teamName: 'A', winPercent: 0.75, wins: 3 }, { teamName: 'C', winPercent: 0.5, wins: 3 }];
  assert.deepEqual(leagueLeaders(rows, 'nfl').map(r => r.teamName), ['A', 'C', 'B']);
  const nhl = [{ teamName: 'X', points: 10 }, { teamName: 'Y', points: 14 }];
  assert.deepEqual(leagueLeaders(nhl, 'nhl').map(r => r.teamName), ['Y', 'X']);
});

test('overviewRows keeps the top n plus your teams, marking the jumps', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: i }));
  const mine = r => r.id === 7 || r.id === 8 || r.id === 11;
  const out = overviewRows(rows, mine, 5);
  assert.deepEqual(out.map(x => x.rank), [1, 2, 3, 4, 5, 8, 9, 12]);
  assert.deepEqual(out.filter(x => x.gap).map(x => x.rank), [8, 12]);
  assert.equal(overviewRows(rows.slice(0, 3), () => false, 5).length, 3);
});
