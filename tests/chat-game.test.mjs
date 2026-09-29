// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGame, gameText } from '../worker/chat-game.js';

const live = () => ({
  league: 'nfl', event: '401772943', state: 'in', status: '4:12 - 3rd', start: 1790000000000,
  away: { team: 'erichylok_cowboys', name: 'Cowboys', abbr: 'DAL', score: 17 },
  home: { team: 'isaac_eagles', name: 'Eagles', abbr: 'PHI', score: 21 }
});

test('a live game passes through unchanged', () => {
  assert.deepEqual(parseGame(live()), live());
});

test('a scheduled game has no scores', () => {
  const game = { ...live(), state: 'pre', status: '8:20 PM EDT', away: { name: 'Cowboys', abbr: 'DAL', score: null }, home: { name: 'Eagles', abbr: 'PHI' } };
  const parsed = parseGame(game);
  assert.equal(parsed.away.score, null);
  assert.equal(parsed.home.score, null);
  assert.equal(parsed.home.team, undefined);
  assert.equal(parseGame({ ...game, away: { ...game.away, score: 3 } }), null);
});

test('rejects a bad league, event, state or score', () => {
  assert.equal(parseGame({ ...live(), league: 'xfl' }), null);
  assert.equal(parseGame({ ...live(), event: '12a' }), null);
  assert.equal(parseGame({ ...live(), event: 401772943 }), null);
  assert.equal(parseGame({ ...live(), state: 'halftime' }), null);
  assert.equal(parseGame({ ...live(), away: { ...live().away, score: -1 } }), null);
  assert.equal(parseGame({ ...live(), away: { ...live().away, score: 1.5 } }), null);
  assert.equal(parseGame({ ...live(), away: { ...live().away, score: null } }), null);
  assert.equal(parseGame({ ...live(), start: 'soon' }), null);
  assert.equal(parseGame(null), null);
});

test('rejects markup, oversized strings and odd team keys', () => {
  assert.equal(parseGame({ ...live(), status: '<img src=x>' }), null);
  assert.equal(parseGame({ ...live(), home: { ...live().home, name: 'x'.repeat(41) } }), null);
  assert.equal(parseGame({ ...live(), home: { ...live().home, team: '../eagles' } }), null);
  assert.equal(parseGame({ ...live(), home: { ...live().home, abbr: '' } }), null);
});

test('drops fields it does not know', () => {
  const parsed = parseGame({ ...live(), extra: 'x', away: { ...live().away, logo: 'https://evil.example/x.png' } });
  assert.equal(parsed.extra, undefined);
  assert.equal(parsed.away.logo, undefined);
});

test('text reads like a scoreboard line', () => {
  assert.equal(gameText(parseGame(live())), '🏈 Cowboys 17 – 21 Eagles · 4:12 - 3rd');
  const pre = parseGame({ ...live(), league: 'mlb', state: 'pre', status: '7:05 PM EDT', away: { name: 'Mets', abbr: 'NYM', score: null }, home: { name: 'Phillies', abbr: 'PHI', score: null } });
  assert.equal(gameText(pre), '⚾ Mets at Phillies · 7:05 PM EDT');
  assert.equal(gameText({ ...parseGame(live()), status: '' }), '🏈 Cowboys 17 – 21 Eagles');
});
