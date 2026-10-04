// College football bowls and conference titles (js/cfb-bowls-math.js)
// against the real 2025-26 scoreboards (tests/fixtures/espn-cfb-bowls-2025.json).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBowlEvent, bowlReach, bowlTeamsEarning, bowlDates } from '../js/cfb-bowls-math.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/espn-cfb-bowls-2025.json'), 'utf8'));
// The fixture keeps one trimmed competition per event; put it back in ESPN's shape.
const games = Object.values(FIX.days).flat().map(e => parseBowlEvent({
  id: e.id, season: e.season, status: { type: { completed: e.status.completed } },
  competitions: [{ notes: e.competition.notes, competitors: e.competition.competitors.map(c => ({ id: c.id, winner: c.winner, team: { id: c.id, location: c.location } })) }]
})).filter(Boolean);
const reach = bowlReach(games);
const locs = label => bowlTeamsEarning(label, reach).map(id => reach[id].location).sort();

test('35 bowls and 9 conference title games; the CFP, Army-Navy and the FCS playoff are neither', () => {
  assert.equal(games.filter(g => g.kind === 'bowl').length, 35);
  assert.equal(games.filter(g => g.kind === 'title').length, 9);
  assert.equal(games.length, 44);
});

test('70 teams played in a bowl, and 35 won one', () => {
  assert.equal(locs('Make a bowl game').length, 70);
  assert.equal(locs('Win a bowl game').length, 35);
});

test('conference titles: each champion once', () => {
  const champs = locs('Win conference');
  assert.equal(champs.length, 9);
  assert.ok(champs.includes('Indiana') && champs.includes('Ohio State') === false);
});

test('CFP teams are not bowl teams, and "Don\'t make a bowl" is not read', () => {
  assert.ok(!locs('Make a bowl game').includes('Indiana'));
  assert.ok(locs('Make a bowl game').includes('Washington'));
  assert.equal(bowlTeamsEarning('Don’t make a bowl', reach), null);
  assert.equal(bowlTeamsEarning('Make the CFP', reach), null);
});

test('bowl dates run December 1 to January 3, daily, up to today', () => {
  const d = bowlDates(2026, new Date(Date.UTC(2027, 1, 1)));
  assert.equal(d[0], '20261201');
  assert.equal(d.at(-1), '20270103');
  assert.equal(d.length, 34);
  assert.deepEqual(bowlDates(2026, new Date(Date.UTC(2026, 9, 4))), []);
});
