// The NHL on the postseason ladder (js/postseason-math.js), against the
// real playoffs as ESPN reported them (tests/fixtures/postseason-nhl.json):
// the whole 2025 and 2026 playoffs (fetched 2026-10-16). Sixteen teams,
// eight per conference split East / West, no byes, four best-of-7 rounds
// (seriesEvents). The bracket pairs by division (1-3 per division and two
// wild cards); the ladder only follows the pairings ESPN reports, and the
// seeds are ESPN's 1-8 per conference.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  seriesEvents, buildBracket, snapshot, latestStage, milestonesFor, finalRound, currentRoundName, postseasonStarted, topRung, seriesResults, seriesResultLine, ladderGhosts, matchups, ladderLayout, POSTSEASON_LEAGUES
} from '../js/postseason-math.js';
import { playoffReach, teamsEarning } from '../js/playoff-series-math.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/postseason-nhl.json'), 'utf8'));

// The Draft's NHL rules (js/seasons/2026.js).
const RULES = [
  { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
  { label: 'Division title', pts: 2, rankAuto: { scope: 'division', rank: 1 } },
  { label: 'Best record in conference', pts: 3, rankAuto: { scope: 'conference', rank: 1 } },
  { label: 'Make conference finals', pts: 2 },
  { label: 'Make Stanley Cup Finals', pts: 3 },
  { label: 'Win Stanley Cup Finals', pts: 5 },
  { label: 'Last place in division', pts: -2, rankAuto: { scope: 'division', bottom: 1 } },
  { label: 'Worst record in conference', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
];
const upTo = (year, day) => FIX[year].events.filter(e => e.date.slice(0, 10) <= day);
const bracket = (year, day = '9999') => buildBracket('nhl', seriesEvents('nhl', upTo(year, day)), FIX[year].seeds);
const earned = (S, label) => S.teams.filter(t => t.milestones.find(m => m.label === label).got).map(t => t.abbr).sort();

test('NHL milestones: the conference finals, the Cup Final and winning it, by label', () => {
  assert.deepEqual(milestonesFor('nhl', RULES).map(m => [m.label, m.reach ?? 'win']), [
    ['Make conference finals', 3], ['Make Stanley Cup Finals', 4], ['Win Stanley Cup Finals', 'win']
  ]);
  assert.equal(finalRound('nhl'), 4);
  assert.deepEqual(POSTSEASON_LEAGUES.nhl.sides, ['East', 'West']);
});

test('NHL games fold into one event per series, every round from its real headline', () => {
  for(const year of [2025, 2026]){
    const ev = seriesEvents('nhl', FIX[year].events);
    assert.equal(ev.length, 15);
    assert.deepEqual([1, 2, 3, 4].map(r => ev.filter(e => POSTSEASON_LEAGUES.nhl.roundOf(e) === r).length), [8, 4, 2, 1]);
    assert.ok(ev.every(e => e.state === 'post' && e.need === 4));
  }
});

test('NHL 2025: sixteen seeded teams, East and West, and the Panthers crowned', () => {
  const b = bracket(2025);
  assert.equal(Object.keys(b.teams).length, 16);
  assert.deepEqual(b.byes, []);
  assert.equal(latestStage(b), 4);
  assert.equal(currentRoundName(b), 'Champion');
  const S = snapshot(b, 4, { rules: RULES });
  assert.equal(S.champ.abbr, 'FLA');
  assert.equal(S.stageLabel, 'Champion: Panthers');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.FLA.banked, 10);
  assert.equal(by.EDM.banked, 5);
  assert.equal(by.EDM.status, 'Out · SCF');
  assert.equal(by.CAR.status, 'Out · CF');
  assert.equal(by.WSH.status, 'Out · R2');
  assert.equal(by.STL.status, 'Out · R1');
  assert.equal(by.WSH.seed, 1);
  assert.equal(by.FLA.seed, 5);
  assert.ok(S.teams.every(t => t.conf === 'East' || t.conf === 'West'));
});

test('NHL 2026: the Hurricanes win the Cup', () => {
  const b = bracket(2026);
  const S = snapshot(b, latestStage(b), { rules: RULES });
  assert.equal(S.champ.abbr, 'CAR');
  assert.equal(S.stageLabel, 'Champion: Hurricanes');
  assert.deepEqual(earned(S, 'Make conference finals'), ['CAR', 'COL', 'MTL', 'VGK']);
  assert.deepEqual(earned(S, 'Make Stanley Cup Finals'), ['CAR', 'VGK']);
  assert.deepEqual(earned(S, 'Win Stanley Cup Finals'), ['CAR']);
  assert.ok(!S.milestones.some(m => /Division|record/.test(m.label)));
});

test('NHL: the bracket pairs by division, not 1 v 8', () => {
  const b = bracket(2025);
  const S = snapshot(b, 0);
  const firsts = S.games.filter(g => g.round === 1).map(g => [g.top.team, g.bot.team].map(t => `${t.conf[0]}${t.seed}`).sort().join('-')).sort();
  // Toronto (2) played Ottawa (6), Tampa Bay (3) played Florida (5).
  assert.ok(firsts.includes('E2-E6') && firsts.includes('E3-E5'));
});

test('NHL replay: everyone starts on the first rung', () => {
  const S = snapshot(bracket(2026), 0, { rules: RULES });
  assert.ok(S.teams.every(t => t.rung === 0 && t.status === 'Alive'));
  assert.equal(topRung(S.teams), 0);
  assert.equal(S.stageLabel, 'Field set');
});

test('NHL 2026: the second round under way', () => {
  const b = bracket(2026, '2026-05-08');
  assert.equal(latestStage(b), 1);
  assert.equal(postseasonStarted(b), true);
  assert.equal(currentRoundName(b), 'Second Round');
  const S = snapshot(b, 1, { rules: RULES });
  assert.equal(S.stageLabel, 'Second Round under way');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.CAR.rung, 1);
  assert.equal(by.OTT.status, 'Out · R1');
  assert.deepEqual(earned(S, 'Make conference finals'), []);
});

test('NHL: each series over keeps its count, by the team that lost it', () => {
  const b = bracket(2026);
  const all = seriesResults(snapshot(b, latestStage(b)));
  assert.equal(all.length, 15);
  assert.equal(seriesResultLine(all.find(r => r.game.round === 4)), 'CAR won 4–2');
  assert.ok(all.every(r => r.won === 4 && r.lost < 4));
});

test('NHL ladder: East and West halves, each series kept as a pair on its round', () => {
  const b = bracket(2026);
  const S = snapshot(b, latestStage(b));
  const placed = S.teams.concat(ladderGhosts(S.teams, S));
  const pairs = matchups(placed, S.games);
  assert.equal(pairs.length, 15);
  const pos = ladderLayout(placed, { games: S.games, top: 4, champRung: 4, sides: POSTSEASON_LEAGUES.nhl.sides });
  assert.ok(pairs.every(p => pos[p[0].id].y === pos[p[1].id].y));
  const half = t => pos[t.id].fx < 0.5 ? 'East' : 'West';
  assert.ok(pairs.filter(p => p.game.round < 4).every(p => p.every(t => half(t) === t.conf)));
});

test('NHL: the ladder and the late-round scoring (js/playoff-series-math.js) agree', () => {
  for(const year of [2025, 2026]){
    const games = FIX[year].events.map(e => ({
      headline: e.headline, needed: e.series ? e.series.need : 4, seriesDone: !!(e.series && e.series.done),
      wins: e.series ? Object.entries(e.series.wins).map(([id, wins]) => ({ id, wins })) : [],
      sides: e.sides.map(s => ({ id: s.id, name: s.displayName }))
    }));
    const reach = playoffReach('nhl', games);
    const b = bracket(year);
    const S = snapshot(b, latestStage(b), { rules: RULES });
    for(const label of ['Make conference finals', 'Make Stanley Cup Finals', 'Win Stanley Cup Finals']){
      const ids = teamsEarning('nhl', RULES, label, reach).sort();
      assert.deepEqual(S.teams.filter(t => t.milestones.find(m => m.label === label).got).map(t => t.id).sort(), ids, `${year} ${label}`);
    }
  }
});
