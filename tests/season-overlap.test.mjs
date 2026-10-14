import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seasonLabel, previousSeasonInPlay, classLeagueYear, liveTableYear, rolledPastClassSeason, priorSeasonLeagues } from '../js/season-overlap.js';

const OCT_2027 = Date.UTC(2027, 9, 15);

test('a season is named for both years it spans', () => {
  assert.equal(seasonLabel('2026'), '2026/27');
  assert.equal(seasonLabel('2099'), '2099/00');
});

test('last season is in play after the next draft until it is recorded', () => {
  assert.equal(previousSeasonInPlay({ ids: ['2026', '2027'], now: OCT_2027 }), '2026');
  assert.equal(previousSeasonInPlay({ ids: ['2026', '2027'], recorded: ['2026'], now: OCT_2027 }), null);
});

test('only one season, before a first draft, or after the new year: nothing in play', () => {
  assert.equal(previousSeasonInPlay({ ids: ['2026'], now: OCT_2027 }), null);
  assert.equal(previousSeasonInPlay({ ids: ['2026', '2027'], preDraft: true, now: OCT_2027 }), null);
  assert.equal(previousSeasonInPlay({ ids: ['2026', '2027'], now: Date.UTC(2028, 0, 1) }), null);
});

test('only the season just before the newest can be in play', () => {
  assert.equal(previousSeasonInPlay({ ids: ['2026', '2027', '2028'], recorded: ['2027'], now: Date.UTC(2028, 9, 1) }), null);
  assert.equal(previousSeasonInPlay({ ids: ['2026', '2027', '2028'], recorded: ['2026'], now: Date.UTC(2028, 9, 1) }), '2027');
});

test('a league label names the ESPN season it ends in', () => {
  assert.equal(classLeagueYear("'26 Season"), 2026);
  assert.equal(classLeagueYear("'26/'27 Season"), 2027);
  assert.equal(classLeagueYear(''), null);
});

const MLB_2027 = { year: 2027, regularStart: '2027-03-24T07:00Z' };

test('the live table holds ESPN’s season only once its regular season starts', () => {
  // October 2026: ESPN says 2027, the table is still the 2026 season.
  assert.equal(liveTableYear(MLB_2027, Date.UTC(2026, 9, 14)), 2026);
  assert.equal(liveTableYear(MLB_2027, Date.UTC(2027, 3, 1)), 2027);
  assert.equal(liveTableYear({ year: 2027 }, Date.UTC(2027, 3, 1)), 2026);
  assert.equal(liveTableYear(null), null);
});

test('a season ESPN has rolled past is over while its table still shows', () => {
  assert.equal(rolledPastClassSeason(MLB_2027, 2026, Date.UTC(2026, 9, 14)), true);
  assert.equal(rolledPastClassSeason(MLB_2027, 2026, Date.UTC(2027, 3, 1)), false);
  assert.equal(rolledPastClassSeason(MLB_2027, 2027, Date.UTC(2026, 9, 14)), false);
});

const LEAGUES = [{ key: 'nfl', season: "'26 Season" }, { key: 'mlb', season: "'27 Season" }, { key: 'wnba', season: "'27 Season" }];

test('MLB and the WNBA stay last season until the class season begins', () => {
  // ESPN already says 2027 the week after the 2026 World Series.
  assert.deepEqual(priorSeasonLeagues(['mlb', 'wnba'], LEAGUES, { mlb: MLB_2027, wnba: { year: 2026 } }, Date.UTC(2026, 10, 1)), ['mlb', 'wnba']);
  assert.deepEqual(priorSeasonLeagues(['mlb', 'wnba'], LEAGUES, { mlb: MLB_2027, wnba: { year: 2026 } }, Date.UTC(2027, 2, 25)), ['wnba']);
  assert.deepEqual(priorSeasonLeagues(['mlb', 'wnba'], LEAGUES, { mlb: { year: 2028 }, wnba: { year: 2028 } }, Date.UTC(2027, 10, 1)), []);
});

test('no saved ESPN season keeps the class list; other listed leagues are left alone', () => {
  assert.deepEqual(priorSeasonLeagues(['mlb', 'wnba'], LEAGUES, {}), ['mlb', 'wnba']);
  assert.deepEqual(priorSeasonLeagues(['mlb', 'wnba'], LEAGUES, { mlb: { year: 2027 } }, Date.UTC(2027, 5, 1)), ['mlb', 'wnba']);
  assert.deepEqual(priorSeasonLeagues(['mlb', 'pga'], LEAGUES, { mlb: MLB_2027 }, Date.UTC(2027, 5, 1)), ['pga']);
});
