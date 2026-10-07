// The postseason ladder's bracket and scoring math (js/postseason-math.js),
// against the real 2025-26 NFL playoffs and CFP as ESPN reported them
// (tests/fixtures/postseason-2025.json).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBracket, snapshot, latestStage, milestonesFor, parseScoreboardEvent, postseasonStarted, ladderLayout, topRung, matchups
} from '../js/postseason-math.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/postseason-2025.json'), 'utf8'));

const NFL_RULES = [
  { label: 'Make the playoffs', pts: 1, rankAuto: { clinched: true } },
  { label: 'Make conference championship', pts: 2 },
  { label: 'Make Super Bowl', pts: 3 },
  { label: 'Win Super Bowl', pts: 5 }
];
const CFB_RULES = [
  { label: 'Make a bowl game', pts: 1 },
  { label: 'Make the CFP', pts: 2 },
  { label: 'Make the CFP semifinal', pts: 2 },
  { label: 'Make National Championship', pts: 3 },
  { label: 'Win National Championship', pts: 5 }
];
const NFL_OWNERS = { DEN: 'peter', NE: 'isaac', SEA: 'collin', PIT: 'josh', LAR: 'ericprister' };
const DRAFTERS = ['josh', 'isaac', 'peter', 'collin', 'ericprister', 'drew'].map(id => ({ id, name: id }));
const opts = (rules, owners) => ({ rules, drafters: DRAFTERS, me: 'josh', ownerOf: t => owners[t.abbr] ? { teamKey: t.abbr.toLowerCase(), owner: owners[t.abbr] } : null });

const nfl = () => buildBracket('nfl', FIX.nfl.events, FIX.nfl.seeds);
const cfb = () => buildBracket('cfb', FIX.cfb.events);
const abbrs = list => list.map(t => t.abbr).sort();

test('milestones come from the rules by label, skipping automatic ones', () => {
  assert.deepEqual(milestonesFor('nfl', NFL_RULES).map(m => [m.pts, m.reach ?? 'win']), [[2, 3], [3, 4], [5, 'win']]);
  assert.deepEqual(milestonesFor('cfb', CFB_RULES).map(m => [m.label, m.reach ?? 'win']), [
    ['Make the CFP', 0], ['Make the CFP semifinal', 3], ['Make National Championship', 4], ['Win National Championship', 'win']
  ]);
});

test('NFL bracket: 14 teams, the 1 seeds on a bye, every round over', () => {
  const b = nfl();
  assert.equal(Object.keys(b.teams).length, 14);
  assert.deepEqual(b.byes.map(id => b.teams[id].abbr).sort(), ['DEN', 'SEA']);
  assert.equal(b.games.length, 13);
  assert.equal(latestStage(b), 4);
  assert.ok(postseasonStarted(b));
  const sb = b.games.find(g => g.round === 4);
  assert.equal(b.teams[sb.winner].abbr, 'SEA');
  assert.ok(b.games.find(g => g.round === 2 && b.teams[g.a].abbr === 'DEN').ot);
});

test('NFL after Divisional: four left, Broncos locked +2 with +8 in play', () => {
  const S = snapshot(nfl(), 2, opts(NFL_RULES, NFL_OWNERS));
  assert.equal(S.stageLabel, 'After Divisional');
  assert.deepEqual(abbrs(S.teams.filter(t => t.alive)), ['DEN', 'LAR', 'NE', 'SEA']);
  const den = S.teams.find(t => t.abbr === 'DEN');
  assert.equal(den.banked, 2);
  assert.equal(den.inPlay, 8);
  assert.equal(den.rung, 2);
  assert.equal(den.next.opp.abbr, 'NE');
  assert.deepEqual(den.path.map(g => g.round), [2, 3]);
  const pit = S.teams.find(t => t.abbr === 'PIT');
  assert.equal(pit.outRound, 1);
  assert.equal(pit.rung, 0);
  assert.equal(pit.status, 'Out · WC');
  assert.equal(pit.milestones.every(m => m.state === 'Missed'), true);
});

test('NFL field set: byes sit a rung up, and nothing is decided yet', () => {
  const S = snapshot(nfl(), 0, opts(NFL_RULES, NFL_OWNERS));
  assert.equal(S.stageLabel, 'Field set');
  assert.equal(S.teams.filter(t => t.alive).length, 14);
  const sea = S.teams.find(t => t.abbr === 'SEA');
  assert.equal(sea.bye, true);
  assert.equal(sea.rung, 1);
  assert.equal(sea.status, 'Bye');
  // Its Divisional opponent isn't known at the field set.
  assert.equal(sea.next.opp, null);
});

test('NFL champion: Seahawks bank 10, the drafted table puts the living first', () => {
  const S = snapshot(nfl(), 4, opts(NFL_RULES, NFL_OWNERS));
  assert.equal(S.champ.abbr, 'SEA');
  assert.equal(S.stageLabel, 'Champion: Seahawks');
  assert.equal(S.champ.banked, 10);
  assert.equal(S.champ.rung, 4);
  assert.equal(S.drafters[0].id, 'collin');
  assert.equal(S.drafters.find(d => d.id === 'isaac').banked, 5); // NE: conference +2, Super Bowl +3
  assert.equal(S.drafters.find(d => d.id === 'drew').inField, false);
});

test('a stage past the latest is clamped, and a round under way counts game by game', () => {
  const b = nfl();
  // Only the first three Wild Card games are over.
  const wc = b.games.filter(g => g.round === 1).slice(3).map(g => g.id);
  const partial = { ...b, games: b.games.filter(g => g.round === 1).map(g => wc.includes(g.id) ? { ...g, final: false, winner: null } : g) };
  assert.equal(latestStage(partial), 0);
  const S = snapshot(partial, 3, opts(NFL_RULES, NFL_OWNERS));
  assert.equal(S.stage, 0);
  assert.match(S.stageLabel, /Wild Card under way/);
  const done = partial.games.filter(g => g.final);
  done.forEach(g => {
    const loser = g.winner === g.a ? g.b : g.a;
    assert.equal(S.byId[loser].alive, false);
    assert.equal(S.byId[loser].justOut, true);
    assert.equal(S.byId[g.winner].rung, 1);
  });
});

test('CFB: 12-team field, four byes, Indiana champion', () => {
  const b = cfb();
  assert.equal(Object.keys(b.teams).length, 12);
  assert.deepEqual(b.byes.map(id => b.teams[id].abbr).sort(), ['IU', 'OSU', 'TTU', 'UGA']);
  const owners = { IU: 'peter', MIA: 'isaac', ORE: 'josh' };
  const S = snapshot(b, 4, opts(CFB_RULES, owners));
  assert.equal(S.champ.abbr, 'IU');
  assert.equal(S.stageLabel, 'Champion: Indiana');
  assert.equal(S.champ.banked, 12); // CFP +2, semifinal +2, final +3, title +5
  const ore = S.teams.find(t => t.abbr === 'ORE');
  assert.equal(ore.banked, 4);      // CFP +2, semifinal +2
  assert.equal(ore.outRound, 3);
  const q = S.games.find(g => g.round === 2 && g.note === 'Rose Bowl');
  assert.ok(q);
  const S0 = snapshot(b, 0, opts(CFB_RULES, owners));
  assert.equal(S0.teams.find(t => t.abbr === 'ORE').banked, 2);
  assert.equal(S0.teams.find(t => t.abbr === 'IU').seed, 1);
});

test('ladder layout: two rows past six chips, one row otherwise', () => {
  const S = snapshot(nfl(), 0, opts(NFL_RULES, NFL_OWNERS));
  const pos = ladderLayout(S.teams);
  const wc = S.teams.filter(t => t.rung === 0);
  assert.equal(wc.length, 12);
  const ys = new Set(wc.map(t => pos[t.id].y));
  assert.deepEqual([...ys].sort((a, b) => a - b), [4 * 84 + 4, 4 * 84 + 44]);
  const div = S.teams.filter(t => t.rung === 1);
  assert.ok(div.every(t => pos[t.id].y === 3 * 84 + 26));
});

test('a TBD side has no id, and no first-round matchup means no bracket', () => {
  const evt = parseScoreboardEvent({
    id: '1', date: '2027-01-09T21:30Z', week: { number: 1 },
    competitions: [{ status: { type: { state: 'pre' } }, notes: [{ headline: 'AFC Wild Card Playoffs' }],
      competitors: [{ team: { id: '-1', abbreviation: 'TBD' } }, { team: { id: '-2', abbreviation: 'TBD' } }] }]
  });
  assert.equal(evt.sides[0].id, null);
  assert.equal(buildBracket('nfl', [evt], {}), null);
});

test('the ladder only grows to the highest rung anyone has reached', () => {
  const b = nfl();
  // Field set: the byes already sit on Divisional.
  assert.equal(topRung(snapshot(b, 0, opts(NFL_RULES, NFL_OWNERS)).teams), 1);
  assert.equal(topRung(snapshot(b, 2, opts(NFL_RULES, NFL_OWNERS)).teams), 2);
  assert.equal(topRung(snapshot(b, 3, opts(NFL_RULES, NFL_OWNERS)).teams), 3);
  assert.equal(topRung(snapshot(b, 4, opts(NFL_RULES, NFL_OWNERS)).teams), 4);
  // The layout counts down from that top rung: Divisional is the top row at the field set.
  const S0 = snapshot(b, 0, opts(NFL_RULES, NFL_OWNERS));
  const pos = ladderLayout(S0.teams, { top: 1 });
  assert.ok(S0.teams.filter(t => t.rung === 1).every(t => pos[t.id].y === 26));
});

// Chips in one row, left to right.
const rowOf = (pos, teams, y) => teams.filter(t => pos[t.id].y === y).sort((a, b) => pos[a.id].fx - pos[b.id].fx).map(t => t.abbr);

test('opponents sit side by side: NFL Wild Card and Divisional', () => {
  const S0 = snapshot(nfl(), 0, opts(NFL_RULES, NFL_OWNERS));
  const pos0 = ladderLayout(S0.teams, { top: 1, games: S0.games });
  const wc = S0.teams.filter(t => t.rung === 0);
  // AFC games on the first row (2v7, 3v6, 4v5), the NFC's on the second.
  assert.deepEqual(rowOf(pos0, wc, 84 + 4), ['NE', 'LAC', 'JAX', 'BUF', 'PIT', 'HOU']);
  assert.deepEqual(rowOf(pos0, wc, 84 + 44), ['CHI', 'GB', 'PHI', 'SF', 'CAR', 'LAR']);
  assert.equal(matchups(S0.teams, S0.games).length, 6);

  const S1 = snapshot(nfl(), 1, opts(NFL_RULES, NFL_OWNERS));
  const pos1 = ladderLayout(S1.teams, { top: 1, games: S1.games });
  const div = S1.teams.filter(t => t.rung === 1);
  assert.deepEqual(rowOf(pos1, div, 4), ['DEN', 'BUF', 'NE', 'HOU']);
  assert.deepEqual(rowOf(pos1, div, 44), ['SEA', 'SF', 'CHI', 'LAR']);
});

// The wide ladder's sizes (js/postseason.js DIMS.wide).
const WIDE = { rungH: 108, rowH: 52, oneRowY: 28, perRow: 8, pairGap: 36 };

test('wide ladder: a game is one unit, its chips pairGap either side of its two shares', () => {
  const S0 = snapshot(nfl(), 0, opts(NFL_RULES, NFL_OWNERS));
  const pos = ladderLayout(S0.teams, { ...WIDE, top: 1, games: S0.games });
  matchups(S0.teams, S0.games).forEach(([a, b]) => {
    assert.equal(pos[a.id].fx, pos[b.id].fx);
    assert.deepEqual([pos[a.id].dx, pos[b.id].dx], [-36, 36]);
  });
  // Twelve Wild Card chips still split into two rows of three games, on the taller rows.
  const wc = S0.teams.filter(t => t.rung === 0);
  assert.deepEqual([...new Set(wc.map(t => pos[t.id].y))].sort((x, y) => x - y), [108 + 4, 108 + 56]);
  assert.deepEqual([...new Set(wc.map(t => pos[t.id].fx))].sort(), [1 / 6, 3 / 6, 5 / 6]);
  // The byes sit alone on Divisional, on its one row, with no offset.
  const byes = S0.teams.filter(t => t.rung === 1);
  assert.ok(byes.every(t => pos[t.id].y === 28 && pos[t.id].dx === 0));
});

test('phone ladder positions carry no offset', () => {
  const S0 = snapshot(nfl(), 0, opts(NFL_RULES, NFL_OWNERS));
  const pos = ladderLayout(S0.teams, { top: 1, games: S0.games });
  assert.ok(Object.values(pos).every(p => !('dx' in p)));
});

test('opponents sit side by side: CFP first round and quarterfinals', () => {
  const S0 = snapshot(cfb(), 0, opts(CFB_RULES, {}));
  const pos0 = ladderLayout(S0.teams, { top: 1, games: S0.games });
  const r1 = S0.teams.filter(t => t.rung === 0);
  const rows = [...new Set(r1.map(t => pos0[t.id].y))].sort((a, b) => a - b).map(y => rowOf(pos0, r1, y));
  assert.deepEqual(rows, [['ORE', 'JMU', 'MISS', 'TULN'], ['TA&M', 'MIA', 'OU', 'ALA']]);

  const S1 = snapshot(cfb(), 1, opts(CFB_RULES, {}));
  const pos1 = ladderLayout(S1.teams, { top: 1, games: S1.games });
  const qf = S1.teams.filter(t => t.rung === 1);
  const qrows = [...new Set(qf.map(t => pos1[t.id].y))].sort((a, b) => a - b).map(y => rowOf(pos1, qf, y));
  assert.deepEqual(qrows, [['IU', 'ALA', 'OSU', 'MIA'], ['UGA', 'MISS', 'TTU', 'ORE']]);
});

test('a team has earned a postseason rule exactly when its milestone is got', () => {
  const s = snapshot(nfl(), latestStage(nfl()), opts(NFL_RULES, NFL_OWNERS));
  const earned = label => s.teams.filter(t => t.teamKey && t.milestones.find(m => m.label === label).got).map(t => t.abbr).sort();
  assert.deepEqual(earned('Win Super Bowl'), ['SEA']);
  assert.deepEqual(earned('Make Super Bowl'), ['NE', 'SEA']);
  assert.deepEqual(earned('Make conference championship'), ['DEN', 'LAR', 'NE', 'SEA']);
});
