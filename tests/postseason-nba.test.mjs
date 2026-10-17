// The NBA on the postseason ladder (js/postseason-math.js), against the
// real playoffs as ESPN reported them (tests/fixtures/postseason-nba.json):
// the whole 2025 and 2026 playoffs (fetched 2026-10-16). Sixteen teams,
// eight per conference split East / West, no byes, four best-of-7 rounds
// (seriesEvents). The play-in is its own season type and never arrives.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  seriesEvents, buildBracket, snapshot, latestStage, milestonesFor, finalRound, currentRoundName, postseasonStarted, topRung, seriesResults, seriesResultLine, ladderGhosts, matchups, ladderLayout, POSTSEASON_LEAGUES
} from '../js/postseason-math.js';
import { playoffReach, teamsEarning } from '../js/playoff-series-math.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/postseason-nba.json'), 'utf8'));

// The Draft's NBA rules (js/seasons/2026.js).
const RULES = [
  { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
  { label: 'Division title', pts: 2, rankAuto: { scope: 'division', rank: 1 } },
  { label: 'Best record in conference', pts: 3, rankAuto: { scope: 'conference', rank: 1 } },
  { label: 'Make conference finals', pts: 2 },
  { label: 'Make Finals', pts: 3 },
  { label: 'Win Finals', pts: 5 },
  { label: 'Last place in division', pts: -2, rankAuto: { scope: 'division', bottom: 1 } },
  { label: 'Worst record in conference', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
];
const upTo = (year, day) => FIX[year].events.filter(e => e.date.slice(0, 10) <= day);
const bracket = (year, day = '9999') => buildBracket('nba', seriesEvents('nba', upTo(year, day)), FIX[year].seeds);
const earned = (S, label) => S.teams.filter(t => t.milestones.find(m => m.label === label).got).map(t => t.abbr).sort();

test('NBA milestones: the conference finals, the Finals and winning them, by label', () => {
  assert.deepEqual(milestonesFor('nba', RULES).map(m => [m.label, m.reach ?? 'win']), [
    ['Make conference finals', 3], ['Make Finals', 4], ['Win Finals', 'win']
  ]);
  assert.equal(finalRound('nba'), 4);
  assert.deepEqual(POSTSEASON_LEAGUES.nba.sides, ['East', 'West']);
});

test('NBA games fold into one event per series, every round from its real headline', () => {
  const ev = seriesEvents('nba', FIX[2025].events);
  // 8 + 4 + 2 + 1, every one best of 7 and over.
  assert.equal(ev.length, 15);
  assert.deepEqual([1, 2, 3, 4].map(r => ev.filter(e => POSTSEASON_LEAGUES.nba.roundOf(e) === r).length), [8, 4, 2, 1]);
  assert.ok(ev.every(e => e.state === 'post' && e.need === 4));
  // The play-in never reaches the ladder: no "Play-In" headline at all.
  assert.ok(!FIX[2025].events.some(e => /play-in/i.test(e.headline)));
});

test('NBA 2025: sixteen seeded teams, East and West, and the Thunder crowned', () => {
  const b = bracket(2025);
  assert.equal(Object.keys(b.teams).length, 16);
  assert.deepEqual(b.byes, []);
  assert.equal(latestStage(b), 4);
  assert.equal(currentRoundName(b), 'Champion');
  const S = snapshot(b, 4, { rules: RULES });
  assert.equal(S.champ.abbr, 'OKC');
  assert.equal(S.stageLabel, 'Champion: Thunder');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.OKC.banked, 10);
  assert.equal(by.IND.banked, 5);
  assert.equal(by.IND.status, 'Out · F');
  assert.equal(by.NY.status, 'Out · CF');
  assert.equal(by.CLE.status, 'Out · CSF');
  assert.equal(by.MEM.status, 'Out · R1');
  // Seeds 7 and 8 are the play-in's winners (Orlando, Miami; Golden State, Memphis).
  assert.deepEqual([by.ORL.seed, by.MIA.seed, by.GS.seed, by.MEM.seed], [7, 8, 7, 8]);
  assert.equal(by.CLE.conf, 'East');
  assert.equal(by.OKC.conf, 'West');
  assert.ok(S.teams.every(t => t.conf === 'East' || t.conf === 'West'));
});

test('NBA 2026: the Knicks win it after sweeping the conference finals', () => {
  const b = bracket(2026);
  const S = snapshot(b, latestStage(b), { rules: RULES });
  assert.equal(S.champ.abbr, 'NY');
  assert.deepEqual(earned(S, 'Make conference finals'), ['CLE', 'NY', 'OKC', 'SA']);
  assert.deepEqual(earned(S, 'Make Finals'), ['NY', 'SA']);
  assert.deepEqual(earned(S, 'Win Finals'), ['NY']);
  // Rules the bracket can't answer stay commissioner marks.
  assert.ok(!S.milestones.some(m => /Division|record/.test(m.label)));
});

test('NBA replay: everyone starts on the first rung, and the field is set before a game', () => {
  const S = snapshot(bracket(2025), 0, { rules: RULES });
  assert.ok(S.teams.every(t => t.rung === 0 && t.status === 'Alive'));
  assert.equal(topRung(S.teams), 0);
  assert.equal(S.stageLabel, 'Field set');
  // The day before the first round only the play-in has been played: no field yet.
  assert.equal(bracket(2025, '2025-04-18'), null);
});

test('NBA 2025: the conference finals under way', () => {
  const b = bracket(2025, '2025-05-23');
  assert.equal(latestStage(b), 2);
  assert.equal(postseasonStarted(b), true);
  assert.equal(currentRoundName(b), 'Conference Finals');
  const S = snapshot(b, 2, { rules: RULES });
  assert.equal(S.stageLabel, 'Conference Finals under way');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.OKC.rung, 2);
  assert.equal(by.DEN.status, 'Out · CSF');
  // Reaching the conference finals is locked as soon as the round is reached.
  assert.deepEqual(earned(S, 'Make conference finals'), ['IND', 'MIN', 'NY', 'OKC']);
});

test('NBA: each series over keeps its count, by the team that lost it', () => {
  const b = bracket(2025);
  const all = seriesResults(snapshot(b, latestStage(b)));
  assert.equal(all.length, 15);
  assert.equal(seriesResultLine(all.find(r => r.game.round === 4)), 'OKC won 4–3');
  assert.ok(all.every(r => r.won === 4 && r.lost < 4));
  assert.equal(seriesResults(snapshot(b, 1)).length, 8);
  assert.equal(seriesResults(snapshot(b, 0)).length, 0);
});

test('NBA ladder: East and West halves, each series kept as a pair on its round', () => {
  const b = bracket(2025);
  const S = snapshot(b, latestStage(b));
  const ghosts = ladderGhosts(S.teams, S);
  assert.equal(ghosts.length, 15);
  const placed = S.teams.concat(ghosts);
  const pairs = matchups(placed, S.games);
  assert.equal(pairs.length, 15);
  const pos = ladderLayout(placed, { games: S.games, top: 4, champRung: 4, sides: POSTSEASON_LEAGUES.nba.sides });
  // Both sides of each pair share a row; a conference's pairs keep to its half.
  assert.ok(pairs.every(p => pos[p[0].id].y === pos[p[1].id].y));
  const half = t => pos[t.id].fx < 0.5 ? 'East' : 'West';
  assert.ok(pairs.filter(p => p.game.round < 4).every(p => p.every(t => half(t) === t.conf)));
});

test('NBA: the ladder and the late-round scoring (js/playoff-series-math.js) agree', () => {
  for(const year of [2025, 2026]){
    // The same games in parseSeriesEvent's shape.
    const games = FIX[year].events.map(e => ({
      headline: e.headline, needed: e.series ? e.series.need : 4, seriesDone: !!(e.series && e.series.done),
      wins: e.series ? Object.entries(e.series.wins).map(([id, wins]) => ({ id, wins })) : [],
      sides: e.sides.map(s => ({ id: s.id, name: s.displayName }))
    }));
    const reach = playoffReach('nba', games);
    const b = bracket(year);
    const S = snapshot(b, latestStage(b), { rules: RULES });
    for(const label of ['Make conference finals', 'Make Finals', 'Win Finals']){
      const ids = teamsEarning('nba', RULES, label, reach).sort();
      assert.deepEqual(S.teams.filter(t => t.milestones.find(m => m.label === label).got).map(t => t.id).sort(), ids, `${year} ${label}`);
    }
  }
});
