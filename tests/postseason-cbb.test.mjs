// The NCAA Tournament on the postseason ladder (js/postseason-math.js),
// against the real 2026 men's tournament as ESPN reported it
// (tests/fixtures/postseason-cbb-2026.json): the First Four, a rung per
// round, the miss rule, and a first rung that grows rows to fit.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBracket, snapshot, latestStage, milestonesFor, isMissRule, finalRound, ladderGeometry, ladderLayout, topRung, matchups,
  currentRoundName, titleGameDate
} from '../js/postseason-math.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/postseason-cbb-2026.json'), 'utf8'));

const RULES = [
  { label: 'Make NCAA Tournament', pts: 1 },
  { label: 'Win conference tournament', pts: 2 },
  { label: 'Win conference regular season', pts: 3, rankAuto: { scope: 'conference', rank: 1 } },
  { label: 'Make Elite Eight', pts: 2 },
  { label: 'Make National Championship game', pts: 3 },
  { label: 'Win National Championship', pts: 5 },
  { label: 'Don’t make NCAA tournament', pts: -2 },
  { label: 'Finish last in conference', pts: -3, rankAuto: { scope: 'conference', bottom: 1 } }
];
const OWNERS = { MICH: 'drew', DUKE: 'douglas', TEX: 'douglas', HOU: 'josh', PUR: 'josh', ARIZ: 'collin', FLA: 'donny', NCSU: 'isaac' };
const DRAFTERS = ['josh', 'drew', 'douglas', 'collin', 'donny', 'isaac'].map(id => ({ id, name: id }));
const opts = { rules: RULES, drafters: DRAFTERS, me: 'josh', ownerOf: t => OWNERS[t.abbr] ? { teamKey: t.abbr.toLowerCase(), owner: OWNERS[t.abbr] } : null };
const bracket = () => buildBracket('mcbb', FIX.mcbb.events);

test('NCAA milestones: the four tournament rules, by label', () => {
  assert.deepEqual(milestonesFor('mcbb', RULES).map(m => [m.label, m.reach ?? 'win']), [
    ['Make NCAA Tournament', 0], ['Make Elite Eight', 4], ['Make National Championship game', 6], ['Win National Championship', 'win']
  ]);
  assert.equal(isMissRule('mcbb', RULES[6]), true);
  assert.equal(isMissRule('mcbb', RULES[0]), false);
  assert.equal(isMissRule('cfb', RULES[6]), false);
});

test('NCAA bracket: 68 teams with seeds and regions, the First Four, no byes', () => {
  const b = bracket();
  assert.equal(finalRound('mcbb'), 6);
  assert.equal(Object.keys(b.teams).length, 68);
  assert.equal(b.byes.length, 0);
  assert.equal(b.games.length, 67);
  assert.equal(b.games.filter(g => g.playIn).length, 4);
  assert.equal(latestStage(b), 6);
  assert.ok(Object.values(b.teams).every(t => t.seed >= 1 && t.seed <= 16));
  assert.deepEqual([...new Set(Object.values(b.teams).map(t => t.conf))].sort(), ['East', 'Midwest', 'South', 'West']);
});

test('NCAA field set: everyone on the Tournament rung, its point locked', () => {
  const S = snapshot(bracket(), 0, opts);
  assert.equal(S.stageLabel, 'Field set');
  assert.equal(S.teams.filter(t => t.alive).length, 68);
  assert.ok(S.teams.every(t => t.rung === 0));
  const hou = S.teams.find(t => t.abbr === 'HOU');
  assert.equal(hou.banked, 1);
  assert.equal(hou.inPlay, 10);
  assert.equal(topRung(S.teams), 0);
});

test('a First Four loser made the field: Out · FF on the first rung, +1 kept', () => {
  const S = snapshot(bracket(), 1, opts);
  const ncsu = S.teams.find(t => t.abbr === 'NCSU');
  assert.equal(ncsu.alive, false);
  assert.equal(ncsu.status, 'Out · FF');
  assert.equal(ncsu.rung, 0);
  assert.equal(ncsu.banked, 1);
  assert.deepEqual(ncsu.path.map(g => g.roundName), ['First Four']);
  // Its First Four win only got Texas into the Round of 64.
  const tex = S.teams.find(t => t.abbr === 'TEX');
  assert.equal(tex.rung, 1);
  assert.deepEqual(tex.path.map(g => g.roundName), ['First Four', 'Round of 64', 'Round of 32']);
});

test('NCAA champion: Michigan on the Champion rung with every rule locked', () => {
  const S = snapshot(bracket(), 6, opts);
  assert.equal(S.stageLabel, 'Champion: Michigan');
  assert.equal(S.champ.abbr, 'MICH');
  assert.equal(S.champ.rung, 6);
  assert.equal(S.champ.banked, 11);
  assert.equal(topRung(S.teams), 6);
  const ari = S.teams.find(t => t.abbr === 'ARIZ');
  assert.ok(ari.milestones.find(m => m.label === 'Make Elite Eight').got);
});

test('only the First Four played: that is what is under way', () => {
  const events = FIX.mcbb.events.map(e => /first four/i.test(e.headline) ? e
    : { ...e, state: 'pre', sides: e.sides.map(s => ({ ...s, score: null, winner: false })) });
  const S = snapshot(buildBracket('mcbb', events), 0, opts);
  assert.equal(S.stageLabel, 'First Four under way');
  assert.equal(S.teams.filter(t => !t.alive).length, 4);
});

test('a crowded first rung wraps into rows of up to six and grows', () => {
  const S = snapshot(bracket(), 0, opts);
  const teams = S.teams.slice(0, 20);
  const geo = ladderGeometry(teams, { top: 0, games: S.games, rungs: 7 });
  assert.equal(geo.rows[0].length, 4);
  assert.ok(geo.rows[0].every(r => r.length <= 6));
  assert.equal(geo.heights[0], 8 + 4 * 40);
  assert.equal(geo.height, geo.heights[0]);
  const pos = ladderLayout(teams, { top: 0, games: S.games, champRung: 6 });
  assert.deepEqual([...new Set(Object.values(pos).map(p => p.y))].sort((a, b) => a - b), [4, 44, 84, 124]);
});

test('drafted opponents pair up only when both are on the ladder', () => {
  const S = snapshot(bracket(), 0, opts);
  const drafted = S.teams.filter(t => t.owner);
  // Every visible pair is two drafted teams; NC State v Texas (First Four) is one.
  const pairs = matchups(drafted, S.games);
  assert.ok(pairs.some(p => p.map(t => t.abbr).sort().join() === 'NCSU,TEX'));
  assert.ok(pairs.every(p => p.every(t => t.owner)));
});

test('the Home banner names the round being played or up next', () => {
  const ev = FIX.mcbb.events;
  const unplay = e => ({ ...e, state: 'pre', sides: e.sides.map(x => ({ ...x, score: null, winner: false })) });
  const upTo = (keep) => buildBracket('mcbb', ev.map(e => keep(e) ? e : unplay(e)));
  assert.equal(currentRoundName(upTo(() => false)), null);
  assert.equal(currentRoundName(upTo(e => /first four/i.test(e.headline) && e === ev.find(x => /first four/i.test(x.headline)))), 'First Four');
  assert.equal(currentRoundName(upTo(e => /first four/i.test(e.headline))), 'Round of 64');
  assert.equal(currentRoundName(upTo(e => /first four|1st round|2nd round/i.test(e.headline))), 'Sweet 16');
  assert.equal(currentRoundName(bracket()), 'Champion');
  assert.equal(titleGameDate(bracket()).getUTCMonth(), 3);
});
