// The WNBA on the postseason ladder (js/postseason-math.js), against the
// real playoffs as ESPN reported them (tests/fixtures/postseason-wnba.json):
// the whole 2025 playoffs, and 2026 through the semifinals with the Finals
// listed ahead (fetched 2026-10-16). Eight
// teams seeded league-wide, no byes, every round a series (seriesEvents).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  seriesEvents, buildBracket, snapshot, latestStage, milestonesFor, finalRound, currentRoundName, postseasonStarted, topRung, roundSeriesLine, seriesResults, seriesResultLine, ladderGhosts, matchups, ladderLayout, ladderGeometry
} from '../js/postseason-math.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/postseason-wnba.json'), 'utf8'));

const RULES = [
  { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
  { label: 'Top-two regular-season record', pts: 2, rankAuto: { top: 2 } },
  { label: 'Reach Commissioner’s Cup Final', pts: 1 },
  { label: 'Win Commissioner’s Cup', pts: 2 },
  { label: 'Reach the semifinals', pts: 2 },
  { label: 'Reach the Finals', pts: 3 },
  { label: 'Win the Finals', pts: 5 },
  { label: 'Missing the playoffs', pts: -3, rankAuto: { eliminated: true } }
];
const bracket = year => buildBracket('wnba', seriesEvents('wnba', FIX[year].events), FIX[year].seeds);
// 2026 as it stood on 2026-10-05, each semifinal one game in: the same games cut at that date.
const early = () => buildBracket('wnba', seriesEvents('wnba', FIX[2026].events.filter(e => e.date <= '2026-10-05T12:00Z')), FIX[2026].seeds);
const earned = (S, label) => S.teams.filter(t => t.milestones.find(m => m.label === label).got).map(t => t.abbr).sort();


test('WNBA milestones: the semifinals, the Finals and winning them, by label', () => {
  assert.deepEqual(milestonesFor('wnba', RULES).map(m => [m.label, m.reach ?? 'win']), [
    ['Reach the semifinals', 2], ['Reach the Finals', 3], ['Win the Finals', 'win']
  ]);
  assert.equal(finalRound('wnba'), 3);
});

test('WNBA games fold into one event per series, whatever ESPN calls the round', () => {
  const ev = seriesEvents('wnba', FIX[2025].events);
  // 4 first-round series, 2 semifinals, the Finals ("WNBA FINALS" for Game 3).
  assert.equal(ev.length, 7);
  const finals = ev.filter(e => /finals/i.test(e.headline) && !/semi/i.test(e.headline));
  assert.equal(finals.length, 1);
  assert.equal(finals[0].state, 'post');
  assert.deepEqual(finals[0].sides.map(s => s.score).sort(), [0, 4]);
  // Best of three: a 2-0 sweep is over.
  const min = ev.find(e => /first round/i.test(e.headline) && e.sides.some(s => s.abbr === 'MIN'));
  assert.equal(min.state, 'post');
  assert.deepEqual(min.sides.map(s => s.score).sort(), [0, 2]);
});

test('WNBA 2025: eight seeded teams, no byes, and the Aces crowned', () => {
  const b = bracket(2025);
  assert.equal(Object.keys(b.teams).length, 8);
  assert.deepEqual(b.byes, []);
  assert.equal(latestStage(b), 3);
  assert.equal(currentRoundName(b), 'Champion');
  const S = snapshot(b, 3, { rules: RULES });
  assert.equal(S.champ.abbr, 'LV');
  assert.equal(S.stageLabel, 'Champion: Aces');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.LV.banked, 10);
  assert.equal(by.PHX.banked, 5);
  assert.equal(by.PHX.status, 'Out · F');
  assert.equal(by.MIN.status, 'Out · SF');
  assert.equal(by.MIN.banked, 2);
  assert.equal(by.GS.status, 'Out · R1');
  assert.equal(by.MIN.seed, 1);
  assert.equal(by.GS.seed, 8);
});

test('WNBA 2025 replay: everyone starts on the first rung', () => {
  const S = snapshot(bracket(2025), 0, { rules: RULES });
  assert.ok(S.teams.every(t => t.rung === 0 && t.status === 'Alive'));
  assert.equal(topRung(S.teams), 0);
  assert.equal(S.stageLabel, 'Field set');
});

test('WNBA 2026: the semifinals are under way after one game each', () => {
  const b = early();
  assert.equal(latestStage(b), 1);
  assert.equal(postseasonStarted(b), true);
  assert.equal(currentRoundName(b), 'Semifinals');
  const S = snapshot(b, 1, { rules: RULES });
  assert.equal(S.stageLabel, 'Semifinals under way');
  const sf = S.games.filter(g => g.round === 2);
  assert.equal(sf.length, 2);
  assert.ok(sf.every(g => g.begun && !g.final));
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.MIN.status, 'Out · R1');
  assert.equal(by.NY.alive, true);
  assert.equal(by.NY.rung, 1);
});

test('WNBA 2026: the real "WNBA Semifinals" and "WNBA Finals" headlines score both rounds', () => {
  const b = bracket(2026);
  assert.equal(currentRoundName(b), 'Finals');
  const S = snapshot(b, latestStage(b), { rules: RULES });
  // Atlanta and Golden State swept their semifinals; the Finals are listed, not yet played.
  assert.deepEqual(earned(S, 'Reach the semifinals'), ['ATL', 'GS', 'LV', 'NY']);
  assert.deepEqual(earned(S, 'Reach the Finals'), ['ATL', 'GS']);
  assert.deepEqual(earned(S, 'Win the Finals'), []);
  // The Commissioner's Cup isn't a playoff round: a commissioner mark.
  assert.ok(!S.milestones.some(m => /Commissioner/.test(m.label)));
});

test('A WNBA postseason that doesn’t count: no rules, so nothing banked or in play', () => {
  const S = snapshot(bracket(2026), 1, { rules: [] });
  assert.equal(S.milestones.length, 0);
  assert.ok(S.teams.every(t => t.banked === 0 && t.inPlay === 0));
});

test('WNBA: Home’s card says where the round’s series stand', () => {
  const at = (year, day) => {
    const b = buildBracket('wnba', seriesEvents('wnba', FIX[year].events.filter(e => e.date.slice(0, 10) <= day)), FIX[year].seeds);
    return roundSeriesLine(snapshot(b, latestStage(b)));
  };
  // First round: the series still on, a tie naming both teams.
  assert.equal(at(2026, '2026-10-01'), 'LV and IND tied 1\u20131 \u00b7 GS and DAL tied 1\u20131');
  // Semifinals: two series, so the one already won stays.
  assert.equal(at(2026, '2026-10-09'), 'ATL won 3\u20130 \u00b7 GS leads 2\u20130');
  // Between rounds there's nothing to say.
  assert.equal(at(2026, '2026-10-10'), null);
  // The Finals, Game 1 scheduled: the length.
  assert.equal(at(2026, '2026-10-17'), 'Best of 7');
  // 2025's Finals, one series: as the ladder words it.
  assert.equal(at(2025, '2025-10-05'), 'LV leads 2\u20130');
  // An earlier stage has no line.
  const b = bracket(2025);
  assert.equal(roundSeriesLine(snapshot(b, 1)), null);
});

test('WNBA: each series over keeps its count, by the team that lost it', () => {
  const b = bracket(2025);
  const at = stage => seriesResults(snapshot(b, stage)).map(r => `${r.loser.abbr} ${r.lost}-${r.won}`).sort();
  // Before a game: nothing. After the first round: its four series.
  assert.deepEqual(at(0), []);
  assert.equal(at(1).length, 4);
  // The whole postseason: 4 + 2 + 1, the Finals a sweep.
  const all = seriesResults(snapshot(b, latestStage(b)));
  assert.equal(all.length, 7);
  const finals = all.find(r => r.game.round === 3);
  assert.equal(seriesResultLine(finals), 'LV won 4\u20130');
  assert.ok(all.every(r => r.won === r.game.need && r.lost < r.won));
});

test('WNBA ladder: each series over keeps its pair, the winner’s ghost beside the team it beat', () => {
  const b = bracket(2025);
  const S = snapshot(b, latestStage(b));
  const ghosts = ladderGhosts(S.teams, S);
  // One per series over (4 + 2 + 1), on the round it was won, out of play.
  assert.equal(ghosts.length, 7);
  assert.ok(ghosts.every(g => g.rung === g.ghostRound - 1 && !g.alive && S.teams.some(t => t.id === g.ghostOf)));
  const placed = S.teams.concat(ghosts);
  const pairs = matchups(placed, S.games);
  // Every series pairs up on its own round: ghost and the team it beat.
  assert.equal(pairs.length, 7);
  assert.ok(pairs.every(p => p.game.final && p.filter(t => t.ghostOf).length === 1 && p[0].rung === p.game.round - 1));
  // Without the ghosts a series over never pairs (the winner moved up).
  assert.equal(matchups(S.teams, S.games).length, 0);
  // Both sides of each pair share a row, so the count sits between them,
  // and eight chips on the first round still fit its rung (two rows).
  const pos = ladderLayout(placed, { games: S.games, top: 3, champRung: 3 });
  assert.ok(pairs.every(p => pos[p[0].id].y === pos[p[1].id].y));
  const geo = ladderGeometry(placed, { games: S.games, top: 3, rungs: 4 });
  assert.equal(geo.rows[0].length, 2);
  assert.equal(geo.heights[0], 84);
  // Before a game, no ghosts.
  assert.equal(ladderGhosts(S.teams, snapshot(b, 0)).length, 0);
});
