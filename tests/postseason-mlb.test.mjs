// MLB on the postseason ladder (js/postseason-math.js), against the real
// postseasons as ESPN reported them (tests/fixtures/postseason-mlb.json):
// the whole 2025 postseason, and 2026 with the Division Series under way.
// ESPN's games fold into series (seriesEvents), seeds 1-2 get byes, and a
// series between games still reads as under way.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  seriesEvents, buildBracket, snapshot, latestStage, milestonesFor, finalRound, currentRoundName, postseasonStarted, topRung,
  matchups, seriesLine, ladderGeometry, ladderLayout, POSTSEASON_LEAGUES
} from '../js/postseason-math.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/postseason-mlb.json'), 'utf8'));

const RULES = [
  { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
  { label: 'Division title', pts: 2, rankAuto: { scope: 'division', rank: 1 } },
  { label: 'Make LCS', pts: 2 },
  { label: 'Make World Series', pts: 3 },
  { label: 'Win World Series', pts: 5 },
  { label: 'Last place in division', pts: -2, rankAuto: { scope: 'division', bottom: 1 } }
];
const bracket = year => buildBracket('mlb', seriesEvents('mlb', FIX[year].events), FIX[year].seeds);
const abbrs = (b, ids) => ids.map(id => b.teams[id].abbr).sort();

test('MLB milestones: the LCS, the World Series and winning it, by label', () => {
  assert.deepEqual(milestonesFor('mlb', RULES).map(m => [m.label, m.reach ?? 'win']), [
    ['Make LCS', 3], ['Make World Series', 4], ['Win World Series', 'win']
  ]);
  assert.equal(finalRound('mlb'), 4);
});

test('MLB games fold into one event per series, scored in series wins', () => {
  const ev = seriesEvents('mlb', FIX[2025].events);
  assert.equal(ev.length, 11);
  const ws = ev.find(e => e.headline === 'World Series');
  assert.equal(ws.state, 'post');
  const won = ws.sides.find(s => s.winner);
  assert.equal(won.abbr, 'LAD');
  assert.deepEqual(ws.sides.map(s => s.score).sort(), [3, 4]);
  // The Wild Card is best of three: a 2-0 sweep is over.
  const cin = ev.find(e => e.headline === 'NLWC' && e.sides.some(s => s.abbr === 'CIN'));
  assert.equal(cin.state, 'post');
  assert.deepEqual(cin.sides.map(s => s.score).sort(), [0, 2]);
});

test('MLB 2025: the field, byes for seeds 1-2, and the Dodgers crowned', () => {
  const b = bracket(2025);
  assert.equal(Object.keys(b.teams).length, 12);
  assert.deepEqual(abbrs(b, b.byes), ['MIL', 'PHI', 'SEA', 'TOR']);
  assert.equal(latestStage(b), 4);
  assert.equal(currentRoundName(b), 'Champion');
  const S = snapshot(b, 4, { rules: RULES });
  assert.equal(S.champ.abbr, 'LAD');
  assert.equal(S.stageLabel, 'Champion: Dodgers');
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.LAD.banked, 10);
  assert.equal(by.TOR.banked, 5);
  assert.equal(by.TOR.status, 'Out · WS');
  assert.equal(by.SEA.banked, 2);
  assert.equal(by.NYY.status, 'Out · DS');
  assert.equal(by.CIN.status, 'Out · WC');
  assert.equal(by.TOR.seed, 1);
  assert.equal(by.TOR.conf, 'AL');
});

test('MLB 2025 replay: a bye team starts on the Division Series rung', () => {
  const S = snapshot(bracket(2025), 0, { rules: RULES });
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.MIL.rung, 1);
  assert.equal(by.MIL.status, 'Bye');
  assert.equal(by.LAD.rung, 0);
  assert.equal(topRung(S.teams), 1);
  assert.equal(S.stageLabel, 'Field set');
});

test('MLB 2026: a series between games is under way, not over', () => {
  const b = bracket(2026);
  assert.equal(latestStage(b), 1);
  assert.equal(postseasonStarted(b), true);
  assert.equal(currentRoundName(b), 'Division Series');
  const S = snapshot(b, 1, { rules: RULES });
  assert.equal(S.stageLabel, 'Division Series under way');
  const ds = S.games.filter(g => g.round === 2);
  assert.equal(ds.length, 4);
  assert.ok(ds.every(g => g.begun && !g.final));
  const by = Object.fromEntries(S.teams.map(t => [t.abbr, t]));
  assert.equal(by.HOU.status, 'Out · WC');
  assert.equal(by.CHW.alive, true);
  assert.equal(by.CHW.rung, 1);
});

test('A postseason that doesn’t count: no rules, so nothing banked or in play', () => {
  const S = snapshot(bracket(2026), 1, { rules: [] });
  assert.equal(S.milestones.length, 0);
  assert.ok(S.teams.every(t => t.banked === 0 && t.inPlay === 0));
});

test('MLB 2026: each Division Series pair carries its tally, written under it', () => {
  const S = snapshot(bracket(2026), 1, { rules: RULES });
  const lines = matchups(S.teams, S.games).map(p => seriesLine(p.game)).sort();
  assert.deepEqual(lines, ['CHW leads 1\u20130', 'LAD leads 1\u20130', 'MIL leads 1\u20130', 'TB leads 1\u20130']);
  // Before the first win it's the length; level is "Tied".
  const g = S.games.find(x => x.round === 2);
  assert.equal(seriesLine({ ...g, series: { need: 3, top: 0, bot: 0 } }), 'Best of 5');
  assert.equal(seriesLine({ ...g, series: { need: 4, top: 2, bot: 2 } }), 'Tied 2\u20132');
  // A game that isn't a series has no line.
  assert.equal(seriesLine({ ...g, series: null }), null);
});

test('MLB 2026: the tally costs the ladder no room', () => {
  const S = snapshot(bracket(2026), 1, { rules: RULES });
  const geo = ladderGeometry(S.teams, { top: 1, games: S.games });
  assert.equal(geo.heights[1], 84);
  const tb = S.games.find(g => g.series && g.series.wins[S.teams.find(t => t.abbr === 'TB').id] !== undefined);
  assert.deepEqual(Object.values(tb.series.wins).sort(), [0, 1]);
});

test('A replayed stage and a finished series show no tally', () => {
  const S0 = snapshot(bracket(2026), 0, { rules: RULES });
  assert.ok(S0.games.every(g => g.series === null));
  const S = snapshot(bracket(2025), 4, { rules: RULES });
  assert.ok(S.games.every(g => g.series === null));
});

test('MLB ladder: AL on the left half, NL on the right, the World Series in the middle', () => {
  const sides = POSTSEASON_LEAGUES.mlb.sides;
  const S = snapshot(bracket(2026), 1, { rules: RULES });
  const pos = ladderLayout(S.teams, { top: 1, games: S.games, sides });
  S.teams.forEach(t => assert.ok(t.conf === 'AL' ? pos[t.id].fx < 0.5 : pos[t.id].fx > 0.5, t.abbr));
  // The Division Series rung: one pair per half on each of two rows.
  const geo = ladderGeometry(S.teams, { top: 1, games: S.games, sides });
  assert.deepEqual(geo.rows[1].map(r => r.length), [4, 4]);
  const W = snapshot(bracket(2025), 3, { rules: RULES });
  const wpos = ladderLayout(W.teams, { top: 3, games: W.games, sides });
  const ws = matchups(W.teams, W.games).find(p => p.game.round === 4);
  assert.deepEqual(ws.map(t => wpos[t.id].fx).sort(), [0.25, 0.75]);
});
