// NBA / NHL / MLB playoff rounds (js/playoff-series-math.js) against the real
// 2026 ESPN scoreboards in tests/fixtures/espn-playoffs-*.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSeriesEvent, playoffReach, teamsEarning, seriesMilestones, playoffDates, seriesRound, finalFollowUps } from '../js/playoff-series-math.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');
// The fixtures keep one trimmed competition per event; put it back in ESPN's shape.
function games(lg, every = 1, off = 0){
  const days = Object.keys(JSON.parse(fs.readFileSync(path.join(dir, `espn-playoffs-${lg}.json`), 'utf8')).days).sort();
  const data = JSON.parse(fs.readFileSync(path.join(dir, `espn-playoffs-${lg}.json`), 'utf8')).days;
  return days.filter((_, i) => i % every === off).flatMap(d => data[d]).map(e => parseSeriesEvent({
    id: e.id, season: e.season, date: e.date,
    competitions: [{ notes: e.competition.notes, series: e.competition.series, competitors: e.competition.competitors.map(c => ({ id: c.id, team: { id: c.id, displayName: c.displayName } })) }]
  })).filter(Boolean);
}
const RULES = {
  nba: [{ label: 'Make conference finals', pts: 2 }, { label: 'Make Finals', pts: 3 }, { label: 'Win Finals', pts: 5 }, { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } }],
  nhl: [{ label: 'Make conference finals', pts: 2 }, { label: 'Make Stanley Cup Finals', pts: 3 }, { label: 'Win Stanley Cup Finals', pts: 5 }],
  mlb: [{ label: 'Make LCS', pts: 2 }, { label: 'Make World Series', pts: 3 }, { label: 'Win World Series', pts: 5 }]
};
const names = (lg, reach, label) => teamsEarning(lg, RULES[lg], label, reach).map(id => reach[id].name).sort();

test('rules map to rungs by label, skipping automatic ones', () => {
  assert.deepEqual(seriesMilestones('nba', RULES.nba).map(m => m.win ? 'win' : m.reach), [1, 2, 'win']);
  assert.deepEqual(seriesMilestones('mlb', RULES.mlb).map(m => m.win ? 'win' : m.reach), [1, 2, 'win']);
});

test('headlines give the round; the NBA play-in and earlier rounds give none', () => {
  assert.equal(seriesRound('nba', 'East Finals - Game 3'), 1);
  assert.equal(seriesRound('nba', 'East Semifinals - Game 3'), 0);
  assert.equal(seriesRound('nba', 'NBA Finals - Game 1'), 2);
  assert.equal(seriesRound('nhl', 'West Final - Game 2'), 1);
  assert.equal(seriesRound('nhl', 'West 2nd Round - Game 2'), 0);
  assert.equal(seriesRound('nhl', 'Stanley Cup Final - Game 6'), 2);
  assert.equal(seriesRound('mlb', 'NLCS - Game 1'), 1);
  assert.equal(seriesRound('mlb', 'World Series - Game 1'), 2);
  assert.equal(seriesRound('mlb', 'ALDS - Game 1'), 0);
});

for(const lg of ['nba', 'nhl']){
  test(`${lg}: four teams in the conference finals, two in the final, one champion`, () => {
    const reach = playoffReach(lg, games(lg));
    assert.equal(names(lg, reach, 'Make conference finals').length, 4);
    assert.equal(names(lg, reach, RULES[lg][1].label).length, 2);
    assert.equal(names(lg, reach, RULES[lg][2].label).length, 1);
  });
  test(`${lg}: a three-day sample plus the follow-up days finds every team and the champion`, () => {
    const all = games(lg);
    const far = new Date(Date.UTC(2027, 0, 1));
    for(let off = 0; off < 3; off++){
      const sample = games(lg, 3, off);
      const extra = new Set(finalFollowUps(lg, sample, far));
      const reach = playoffReach(lg, [...sample, ...all.filter(g => extra.has(g.day) && !sample.some(x => x.id === g.id))]);
      assert.equal(names(lg, reach, RULES[lg][1].label).length, 2, `offset ${off}`);
      assert.equal(names(lg, reach, RULES[lg][2].label).length, 1, `offset ${off}`);
    }
  });
}

test('NBA 2026: the champion is the Finals winner', () => {
  const reach = playoffReach('nba', games('nba'));
  assert.equal(Object.values(reach).filter(t => t.champion).length, 1);
  assert.ok(Object.values(reach).find(t => t.champion).round === 2);
});

test('MLB 2026 through the LCS: the real "NLCS" / "ALCS" / "World Series" headlines', () => {
  const reach = playoffReach('mlb', games('mlb'));
  assert.deepEqual(names('mlb', reach, 'Make LCS').filter(n => n !== 'Rays/Guardians'), ['Cleveland Guardians', 'Los Angeles Dodgers', 'Milwaukee Brewers', 'Tampa Bay Rays']);
  // Milwaukee swept the NLCS; World Series Game 1 is listed ahead against a
  // placeholder for the ALCS winner, which no drafted team can match.
  assert.deepEqual(names('mlb', reach, 'Make World Series'), ['Milwaukee Brewers', 'Rays/Guardians']);
  assert.deepEqual(teamsEarning('mlb', RULES.mlb, 'Win World Series', reach), []);
  // A rained-out game keeps its round ("ALCS - Game 4 Rain - Makeup on Oct 18").
  assert.equal(seriesRound('mlb', 'ALCS - Game 4 Rain - Makeup on Oct 18'), 1);
  assert.equal(seriesRound('mlb', 'World Series - Game 5 If Necessary'), 2);
});

test('playoff dates step by three days up to today', () => {
  const d = playoffDates('nba', 2027, new Date(Date.UTC(2027, 4, 10)));
  assert.equal(d[0], '20270501');
  assert.equal(d[1], '20270504');
  assert.equal(d.at(-1), '20270510');
  assert.deepEqual(playoffDates('nba', 2027, new Date(Date.UTC(2026, 9, 4))), []);
});

test('no follow-up days once the final has a champion, or before it starts', () => {
  const far = new Date(Date.UTC(2027, 0, 1));
  assert.deepEqual(finalFollowUps('nba', games('nba'), far), []);
  // MLB: a World Series game is listed and nobody has won it, so the days
  // after the last one seen are asked about, one by one.
  assert.deepEqual(finalFollowUps('mlb', games('mlb'), far).slice(0, 2), ['20261025', '20261026']);
  assert.deepEqual(finalFollowUps('mlb', games('mlb'), new Date(Date.UTC(2026, 9, 16))), []);
});

test('a game keeps each side’s nickname, which drafted teams are found by exactly', () => {
  const g = parseSeriesEvent({
    id: '1', season: { slug: 'post-season' }, date: '2027-05-20T00:00Z',
    competitions: [{ notes: [{ headline: 'East Finals - Game 1' }], competitors: [
      { id: '30', team: { id: '30', displayName: 'Charlotte Hornets', name: 'Hornets' } },
      { id: '17', team: { id: '17', displayName: 'Brooklyn Nets', name: 'Nets' } }
    ] }]
  });
  const reach = playoffReach('nba', [g]);
  assert.deepEqual([reach['30'].nick, reach['17'].nick], ['Hornets', 'Nets']);
});
