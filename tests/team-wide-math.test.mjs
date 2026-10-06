import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MARGIN_CAPS, barHeight, gameByGame, gameByGameSub, luminance, glowColor } from '../js/team-wide-math.js';

const game = (own, opp, extra = {}) => ({ id: `${own}-${opp}`, date: '2026-09-01T19:00Z', isHome: true, opponentAbbr: 'ARS', ownScore: own, oppScore: opp, ...extra });

test('barHeight scales the margin to the league cap with a 4% floor', () => {
  assert.equal(barHeight(1, 3), 19.3);
  assert.equal(barHeight(3, 3), 50);
  assert.equal(barHeight(-3, 3), 50);
  assert.equal(barHeight(9, 3), 50);            // past the cap: drawn at the cap
  assert.equal(barHeight(0.0001, 20) >= 4, true);
});

test('gameByGame puts the oldest game first and keeps the last 20', () => {
  const recent = Array.from({ length: 25 }, (_, i) => game(i, 0, { id: String(i) }));  // newest first
  const { games, total } = gameByGame(recent, 'nba');
  assert.equal(games.length, 20);
  assert.equal(total, 25);
  assert.equal(games[0].id, '19');
  assert.equal(games[19].id, '0');
});

test('gameByGame reads results, margins and clamping per league', () => {
  const { games, w, l, d } = gameByGame([game(5, 0), game(1, 2), game(1, 1)], 'epl');
  assert.deepEqual(games.map(g => g.result), ['d', 'l', 'w']);
  assert.deepEqual([w, l, d], [1, 1, 1]);
  assert.equal(games[0].height, 0);
  assert.equal(games[2].clamped, true);         // 5 goals > EPL cap of 3
  assert.equal(games[1].clamped, false);
  assert.equal(games[2].score, '5–0');
  assert.equal(MARGIN_CAPS.nfl, 24);
});

test('gameByGame drops preseason and unscored games', () => {
  const { games } = gameByGame([game(3, 1), game(2, 1, { seasonType: 1 }), game(null, null)], 'nhl');
  assert.equal(games.length, 1);
});

test('gameByGameSub shows draws only for the EPL', () => {
  const g = gameByGame([game(2, 0), game(0, 0), game(0, 1)], 'epl');
  assert.equal(gameByGameSub(g, 'epl'), '1–1–1 · last 3');
  assert.equal(gameByGameSub(gameByGame([game(20, 10)], 'nfl'), 'nfl'), '1–0 · last 1');
});

test('glowColor falls back to the secondary color for very dark teams', () => {
  assert.equal(luminance('#000000'), 0);
  assert.equal(luminance('#FFFFFF'), 1);
  assert.equal(luminance('nope'), null);
  assert.equal(glowColor('#C8102E', '#F6EB61'), '#C8102E');   // Liverpool red shows
  assert.equal(glowColor('#241F20', '#FFFFFF'), '#FFFFFF');   // Newcastle black doesn't
  assert.equal(glowColor('#241F20', '#101010'), '#241F20');   // both dark: keep the primary
});
