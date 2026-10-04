// EPL cup finals and European spots (js/epl-cups-math.js) against the real
// 2025-26 ESPN data (tests/fixtures/espn-epl-cups-2025.json).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eplCupRule, finalDays, cupWinner, leaguePhaseClubs } from '../js/epl-cups-math.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/espn-epl-cups-2025.json'), 'utf8')).competitions;
// The fixture keeps trimmed events; put one back in ESPN's shape.
const raw = e => ({
  id: e.id, season: e.season, status: { type: { completed: /FINAL|FULL/.test(e.status.name) } },
  competitions: [{ competitors: e.competitors.map(c => ({ winner: c.winner, team: { displayName: c.displayName } })) }]
});
const winnerOf = slug => cupWinner(FIX[slug].events.map(raw));

test('rules map to a competition by label', () => {
  assert.equal(eplCupRule('Win League Cup').slug, 'eng.league_cup');
  assert.equal(eplCupRule('Win FA Cup').slug, 'eng.fa');
  assert.equal(eplCupRule('Make Champions League (any stage)').slug, 'uefa.champions');
  assert.equal(eplCupRule('Make Europa League').slug, 'uefa.europa');
  assert.equal(eplCupRule('Win EPL'), null);
});

test('the final day is read off the calendar text, and the day after', () => {
  assert.deepEqual(finalDays(FIX['eng.league_cup'].calendar), ['20260322', '20260323']);
  assert.deepEqual(finalDays(FIX['eng.fa'].calendar), ['20260516', '20260517']);
  assert.deepEqual(finalDays([{ label: 'Final', detail: 'TBD' }]), []);
  assert.deepEqual(finalDays([]), []);
});

test('cup winners come from the final', () => {
  assert.equal(winnerOf('eng.league_cup'), 'Manchester City');
  assert.equal(winnerOf('eng.fa'), 'Manchester City');
  assert.equal(winnerOf('uefa.champions'), 'Paris Saint-Germain');
});

test('no winner before the final is over', () => {
  const e = { season: { slug: 'final' }, status: { type: { completed: false } }, competitions: [{ competitors: [{ winner: false, team: { displayName: 'A' } }] }] };
  assert.equal(cupWinner([e]), null);
  assert.equal(cupWinner([]), null);
});

test('league-phase tables list the clubs in each competition', () => {
  const payload = slug => ({ children: [{ standings: { entries: FIX[slug].leaguePhaseStandings.map(r => ({ team: { displayName: r.displayName } })) } }] });
  const cl = leaguePhaseClubs(payload('uefa.champions'));
  assert.equal(cl.length, 36);
  for(const club of ['Arsenal', 'Liverpool', 'Tottenham Hotspur', 'Chelsea', 'Manchester City', 'Newcastle United']) assert.ok(cl.includes(club), club);
  assert.ok(!cl.includes('Manchester United'));
  assert.deepEqual(leaguePhaseClubs(payload('uefa.europa')).filter(n => ['Aston Villa', 'Nottingham Forest', 'Arsenal'].includes(n)).sort(), ['Aston Villa', 'Nottingham Forest']);
  assert.deepEqual(leaguePhaseClubs(null), []);
});
