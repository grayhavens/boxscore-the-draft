// The WNBA on the postseason ladder (js/postseason-math.js), against the
// real playoffs as ESPN reported them (tests/fixtures/postseason-wnba.json):
// the whole 2025 playoffs, and 2026 with the semifinals under way. Eight
// teams seeded league-wide, no byes, every round a series (seriesEvents).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  seriesEvents, buildBracket, snapshot, latestStage, milestonesFor, finalRound, currentRoundName, postseasonStarted, topRung
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
  const b = bracket(2026);
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

test('A WNBA postseason that doesn’t count: no rules, so nothing banked or in play', () => {
  const S = snapshot(bracket(2026), 1, { rules: [] });
  assert.equal(S.milestones.length, 0);
  assert.ok(S.teams.every(t => t.banked === 0 && t.inPlay === 0));
});
