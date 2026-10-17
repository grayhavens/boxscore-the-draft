// The NBA on the postseason ladder (js/postseason-math.js), against the
// real playoffs as ESPN reported them (tests/fixtures/postseason-nba.json):
// the whole 2025 and 2026 Play-Ins and playoffs (fetched 2026-10-16). The
// Play-In first (single games, seeds 7-10 per conference), then sixteen
// teams, eight per conference split East / West, four best-of-7 rounds
// (seriesEvents).

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
  // Round 1 is the Play-In, so the conference finals are round 4.
  assert.deepEqual(milestonesFor('nba', RULES).map(m => [m.label, m.reach ?? 'win']), [
    ['Make conference finals', 4], ['Make Finals', 5], ['Win Finals', 'win']
  ]);
  assert.equal(finalRound('nba'), 5);
  assert.deepEqual(POSTSEASON_LEAGUES.nba.sides, ['East', 'West']);
  assert.deepEqual(POSTSEASON_LEAGUES.nba.stops, ['Play-In', 'Field', 'CSF', 'CF', 'F', 'Champ']);
});

test('NBA games: the Play-In as single games, every series folded into one event', () => {
  const ev = seriesEvents('nba', FIX[2025].events);
  // 6 Play-In games, then 8 + 4 + 2 + 1 series.
  assert.equal(ev.length, 21);
  assert.deepEqual([1, 2, 3, 4, 5].map(r => ev.filter(e => POSTSEASON_LEAGUES.nba.roundOf(e) === r).length), [6, 8, 4, 2, 1]);
  assert.ok(ev.filter(e => POSTSEASON_LEAGUES.nba.roundOf(e) > 1).every(e => e.state === 'post' && e.need === 4));
  const pi = ev.filter(e => POSTSEASON_LEAGUES.nba.roundOf(e) === 1);
  assert.ok(pi.every(e => !e.need && /^NBA Play-In - (East|West) - /.test(e.headline)));
});

test('NBA 2025: twenty teams, seeds 1-6 waiting out the Play-In, and the Thunder crowned', () => {
  const b = bracket(2025);
  assert.equal(Object.keys(b.teams).length, 20);
  assert.equal(b.byes.length, 12);
  assert.ok(b.byes.every(id => b.teams[id].seed <= 6));
  assert.equal(latestStage(b), 5);
  assert.equal(currentRoundName(b), 'Champion');
  const S = snapshot(b, 5, { rules: RULES });
  assert.equal(S.champ.abbr, 'OKC');
  assert.equal(S.stageLabel, 'Champion: Thunder');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.OKC.banked, 10);
  assert.equal(by.IND.banked, 5);
  assert.equal(by.IND.status, 'Out · F');
  assert.equal(by.NY.status, 'Out · CF');
  assert.equal(by.CLE.status, 'Out · CSF');
  assert.equal(by.MEM.status, 'Out · R1');
  // The Play-In's losers stay on its rung.
  assert.deepEqual(['ATL', 'CHI', 'SAC', 'DAL'].map(a => [by[a].status, by[a].rung]), Array(4).fill(['Out · PI', 0]));
  // Seeds 7 and 8 are the Play-In's winners (Orlando, Miami; Golden State, Memphis).
  assert.deepEqual([by.ORL.seed, by.MIA.seed, by.GS.seed, by.MEM.seed], [7, 8, 7, 8]);
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

test('NBA replay: the Play-In first, its four per conference on its rung, the top six waiting', () => {
  const b = bracket(2025);
  const S = snapshot(b, 0, { rules: RULES });
  assert.equal(S.stageLabel, 'Play-In');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.deepEqual(S.teams.filter(t => t.rung === 0).map(t => t.seed).sort((x, y) => x - y), [7, 7, 8, 8, 9, 9, 10, 10]);
  assert.ok(S.teams.filter(t => t.seed <= 6).every(t => t.rung === 1 && t.status === 'Bye'));
  assert.equal(by.ATL.status, 'Alive');
  assert.equal(topRung(S.teams), 1);
  // The Play-In's first games pair up; the 8th Seed Games wait for them.
  const pi = matchups(S.teams, S.games).filter(p => p.game.round === 1).map(p => p.map(t => t.seed).join('v')).sort();
  assert.deepEqual(pi, ['7v8', '7v8', '9v10', '9v10']);
  // Seeds there are where each team finished: Atlanta was 8th, then lost
  // twice and is the 9 seed in the final standings; Miami was 10th and won the 8.
  assert.deepEqual([by.ATL.seed, by.MIA.seed], [8, 10]);
  const end = Object.fromEntries(snapshot(b, latestStage(b)).teams.map(t => [t.abbr, t]));
  assert.deepEqual([end.ATL.seed, end.MIA.seed], [9, 8]);
  const S26 = snapshot(bracket(2026), 0);
  assert.deepEqual(matchups(S26.teams, S26.games).filter(p => p.game.round === 1).map(p => p.map(t => t.seed).join('v')).sort(), ['7v8', '7v8', '9v10', '9v10']);
  // Stage 1: the field, sixteen teams on the First Round rung.
  const F = snapshot(b, 1);
  assert.equal(F.stageLabel, 'Field set');
  assert.equal(F.teams.filter(t => t.rung === 1 && t.alive).length, 16);
});

test('NBA 2025 Play-In: the 7 v 8 loser plays again, the 9 v 10 winner waits for it', () => {
  // After both 7 v 8 and 9 v 10 games, the 8th Seed Games still to play.
  const events = FIX[2025].events.filter(e => e.date.slice(0, 10) <= '2025-04-17')
    .concat(FIX[2025].events.filter(e => /8th Seed Game/.test(e.headline)).map(e => ({ ...e, state: 'pre', sides: e.sides.map(s => ({ ...s, score: null, winner: false })) })));
  const b = buildBracket('nba', seriesEvents('nba', events), FIX[2025].seeds);
  assert.equal(latestStage(b), 0);
  assert.equal(currentRoundName(b), 'Play-In');
  const S = snapshot(b, 0);
  assert.equal(S.stageLabel, 'Play-In under way');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  // Orlando won 7 v 8 and is the 7 seed; Atlanta lost it and is still alive.
  assert.equal(by.ORL.rung, 1);
  assert.deepEqual([by.ATL.alive, by.ATL.rung], [true, 0]);
  // Miami won 9 v 10 but stays on the Play-In rung; Chicago is out.
  assert.deepEqual([by.MIA.alive, by.MIA.rung], [true, 0]);
  assert.equal(by.CHI.status, 'Out · PI');
  // Atlanta's next game is the 8th Seed Game, against Miami.
  assert.equal(by.ATL.next.round, 'Play-In');
  assert.equal(by.ATL.next.opp.abbr, 'MIA');
  // Before the field is set the game shows as a pair on the Play-In rung.
  const pairs = matchups(S.teams, S.games);
  assert.ok(pairs.some(p => p.map(t => t.abbr).sort().join() === 'ATL,MIA'));
  assert.deepEqual(seriesResults(S), []);
});

test('NBA 2025: the conference finals under way', () => {
  const b = bracket(2025, '2025-05-23');
  assert.equal(latestStage(b), 3);
  assert.equal(postseasonStarted(b), true);
  assert.equal(currentRoundName(b), 'Conference Finals');
  const S = snapshot(b, 3, { rules: RULES });
  assert.equal(S.stageLabel, 'Conference Finals under way');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.OKC.rung, 3);
  assert.equal(by.DEN.status, 'Out · CSF');
  // Reaching the conference finals is locked as soon as the round is reached.
  assert.deepEqual(earned(S, 'Make conference finals'), ['IND', 'MIN', 'NY', 'OKC']);
});

test('NBA: each series over keeps its count, by the team that lost it', () => {
  const b = bracket(2025);
  const all = seriesResults(snapshot(b, latestStage(b)));
  assert.equal(all.length, 15);
  assert.equal(seriesResultLine(all.find(r => r.game.round === 5)), 'OKC won 4–3');
  assert.ok(all.every(r => r.won === 4 && r.lost < 4));
  assert.equal(seriesResults(snapshot(b, 2)).length, 8);
  assert.equal(seriesResults(snapshot(b, 1)).length, 0);
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
  const pos = ladderLayout(placed, { games: S.games, top: 5, champRung: 5, sides: POSTSEASON_LEAGUES.nba.sides });
  // Both sides of each pair share a row; a conference's pairs keep to its half.
  assert.ok(pairs.every(p => pos[p[0].id].y === pos[p[1].id].y));
  const half = t => pos[t.id].fx < 0.5 ? 'East' : 'West';
  assert.ok(pairs.filter(p => p.game.round < 5).every(p => p.every(t => half(t) === t.conf)));
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
