import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isAwayLongEnough, awayLabel, signedPts, nameList, upsetOf, gameCard, seriesCard, summaryCard, buildCards, MAX_CARDS
} from '../js/since-math.js';

const H = 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 2, 13);

test('away long enough, and how long', () => {
  assert.equal(isAwayLongEnough(NOW - 9 * H, NOW), true);
  assert.equal(isAwayLongEnough(NOW - 7 * H, NOW), false);
  assert.equal(isAwayLongEnough(0, NOW), false);
  assert.equal(awayLabel(14 * H), '14 hours');
  assert.equal(awayLabel(9 * 24 * H), '9 days');
});

test('signedPts and nameList', () => {
  assert.equal(signedPts(12), '+12');
  assert.equal(signedPts(-7), '−7');
  assert.equal(signedPts(0), '0');
  assert.equal(nameList(['Jordan', 'Priya']), 'Jordan and Priya');
  assert.equal(nameList(['A', 'B', 'C', 'D']), '4 drafters');
});

let n = 0;
const game = (o = {}) => ({
  id: String(++n), teamKey: 'bos', league: 'nba', leagueLabel: 'NBA', teamName: 'Celtics',
  own: 112, opp: 104, oppName: 'the Knicks', oppShort: 'Knicks', oppDrafter: null, oppDrafterName: '',
  isHome: true, detail: 'Final', at: NOW - 12 * H, postseason: false, ownRank: null, oppRank: null, ...o
});

test('upsets need a ranking', () => {
  assert.equal(upsetOf(game({ oppRank: 8 })), 'win');
  assert.equal(upsetOf(game({ ownRank: 12, oppRank: 8 })), 'win');
  assert.equal(upsetOf(game({ ownRank: 3, oppRank: 8 })), null);
  assert.equal(upsetOf(game({ own: 90, ownRank: 3 })), 'loss');
  assert.equal(upsetOf(game({ own: 90 })), null);
});

test('gameCard: plain, against a drafter, upset, postseason', () => {
  assert.equal(gameCard(game()).body, 'Beat the Knicks at home.');
  const vs = gameCard(game({ oppDrafter: 'drew', oppDrafterName: 'Drew', isHome: false, own: 99 }));
  assert.equal(vs.title, 'Celtics lost 99–104');
  assert.equal(vs.body, 'Lost to Drew’s Knicks away.');
  const up = gameCard(game({ teamName: 'Arizona', oppShort: 'Texas', oppRank: 8, own: 27, opp: 24 }));
  assert.equal(up.title, 'Arizona upset No. 8 Texas');
  assert.ok(up.weight > vs.weight);
  const post = gameCard(game({ postseason: true }));
  assert.equal(post.weight, up.weight);
  assert.deepEqual(post.meta, ['NBA', 'Postseason', 'Final']);
});

test('seriesCard tallies one drafter’s games', () => {
  const g = o => game({ oppDrafter: 'drew', oppDrafterName: 'Drew', ...o });
  const c = seriesCard('drew', 'Drew', [
    g({ own: 1, opp: 3, teamName: 'Kings', oppShort: 'Rangers', at: NOW - 2 * H }),
    g({ own: 99, at: NOW - 3 * H }),
    g({ own: 120, at: NOW - 30 * H }),
    g({ own: 10, opp: 20, at: NOW - 40 * H })
  ]);
  assert.equal(c.title, 'Drew beat you 3–1');
  assert.equal(c.body, 'Rangers over Kings 3–1, Knicks over Celtics 104–99, and 2 more.');
  assert.equal(c.count, 4);
});

const rows = [
  { id: 'sam', name: 'Sam', rank: 1, total: 48, locked: 20 },
  { id: 'me', name: 'Me', rank: 2, total: 42, locked: 18 },
  { id: 'jordan', name: 'Jordan', rank: 3, total: 40, locked: 10 },
  { id: 'priya', name: 'Priya', rank: 4, total: 39, locked: 12 }
];
const rec = { W: 14, L: 9, D: 0 };

test('summaryCard: a rank move with the three stats', () => {
  const c = summaryCard({ me: 'me', rows, record: rec, awayMs: 9 * 24 * H, at: NOW,
    prev: { ranks: { sam: 1, jordan: 2, priya: 3, me: 4 }, totals: { me: 30 }, lockedTotals: { me: 10 } } });
  assert.equal(c.title, 'You’re up to 2nd');
  assert.equal(c.body, 'Away 9 days. Passed Jordan and Priya. 6 behind Sam.');
  assert.equal(c.corner, '▲2');
  assert.deepEqual(c.stats.map(s => s.value), ['+12', '+8', '14–9']);
  assert.equal(c.moved, true);
});

test('summaryCard: same rank says how the gap moved', () => {
  const c = summaryCard({ me: 'me', rows, record: rec, awayMs: 14 * H, at: NOW,
    prev: { ranks: { sam: 1, me: 2 }, totals: { sam: 45, me: 36 }, lockedTotals: { me: 18 } } });
  assert.equal(c.title, 'Still 2nd, 3 closer');
  assert.equal(c.moved, false);
  const noRows = summaryCard({ me: 'me', rows: null, record: rec, awayMs: 14 * H, at: NOW, prev: null });
  assert.equal(noRows.title, 'Your teams went 14–9');
  assert.equal(noRows.body, 'Away 14 hours.');
});

test('buildCards: order, series grouping, the cut, and when to prompt', () => {
  const vs = (d, o) => game({ oppDrafter: d, oppDrafterName: d, ...o });
  const games = [
    vs('drew', { own: 99 }), vs('drew', { own: 98 }), vs('drew', { own: 97 }),
    vs('peter', { own: 120 }), vs('peter', { own: 90 }),
    vs('isaac', {}),
    game({ postseason: true, at: NOW - 5 * H }),
    game({ teamName: 'Dodgers' })
  ];
  const locks = [{ league: 'epl', leagueLabel: 'EPL', leagueName: 'EPL', pts: 8, best: null, at: NOW }];
  const summary = { me: 'me', rows, awayMs: 3 * 24 * H, at: NOW, prev: { ranks: { me: 2, sam: 1 }, totals: { me: 40 }, lockedTotals: { me: 18 } } };
  const { cards, total, prompt } = buildCards({ games, locks, summary, drafterName: d => d });
  assert.equal(cards.length, MAX_CARDS);
  assert.equal(total, 7);
  assert.deepEqual(cards.map(c => c.kind), ['summary', 'lock', 'game', 'series', 'series']);
  assert.equal(cards[3].title, 'drew beat you 3–0');    // three games outranks two
  assert.equal(cards[4].title, 'You and peter split 1–1');
  assert.equal(prompt, true);
});

test('buildCards stays quiet after a night of single games', () => {
  const summary = { me: 'me', rows, awayMs: 10 * H, at: NOW, prev: { ranks: { me: 2, sam: 1 }, totals: { me: 42 }, lockedTotals: { me: 18 } } };
  const quiet = buildCards({ games: [game({ oppDrafter: 'drew', oppDrafterName: 'Drew' }), game()], summary });
  assert.equal(quiet.prompt, false);
  assert.equal(quiet.cards.length, 3);
  const nothing = buildCards({ games: [], summary });
  assert.equal(nothing.cards.length, 0);
});
