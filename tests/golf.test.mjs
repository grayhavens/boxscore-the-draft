// Run with: node --test tests/*.test.mjs
// Fixtures are real ESPN responses (2026 season), trimmed to a few
// competitors each and shuffled, since ESPN doesn't send them in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCalendar, fedexSeasonEvents, condenseLeaderboard, parseLeaderboard, parseGolferRecord,
  finishPosition, isMissedCut, golferResults, fedexTable, isTourChampionship
} from '../js/golf.js';
import { updateSeason } from '../worker/golf.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./fixtures/golf/${name}.json`, import.meta.url)));
const OPEN = fixture('leaderboard-open');
const ZURICH = fixture('leaderboard-zurich');
const TOUR_CHAMP = fixture('leaderboard-tour-championship');
const SENTRY = fixture('leaderboard-sentry-canceled');
const CALENDAR = parseCalendar(fixture('scoreboard-2026'));

test('the FedEx season ends with the TOUR Championship', () => {
  assert.equal(CALENDAR.length, 49);
  const season = fedexSeasonEvents(CALENDAR);
  assert.equal(season.length, 38);
  assert.equal(season[0].name, 'The Sentry');
  assert.equal(season[season.length - 1].name, 'TOUR Championship');
  assert.ok(!season.some(e => /Presidents Cup|RSM|Biltmore/.test(e.name)), 'fall events and team cups are out');
  // Not announced yet: everything counts.
  assert.equal(fedexSeasonEvents(CALENDAR.filter(e => !isTourChampionship(e.name))).length, 48);
});

test('finish labels', () => {
  assert.equal(finishPosition('1'), 1);
  assert.equal(finishPosition('T14'), 14);
  assert.equal(finishPosition('CUT'), null);
  assert.equal(finishPosition('WD'), null);
  assert.ok(isMissedCut('CUT'));
  assert.ok(!isMissedCut('WD') && !isMissedCut('DQ') && !isMissedCut('T70'));
});

test('a major: finishes, missed cuts and withdrawals', () => {
  const e = condenseLeaderboard(OPEN);
  assert.equal(e.name, 'The Open');
  assert.equal(e.major, true);
  assert.equal(e.status, 'post');
  assert.equal(e.team, false);
  assert.deepEqual(e.results['10046'], ['T14', 0]); // DeChambeau: LIV, so no FedEx points
  assert.deepEqual(e.golfers['10046'], ['Bryson DeChambeau', 'usa']);
  const labels = Object.values(e.results).map(r => r[0]);
  assert.ok(labels.includes('1'));
  assert.ok(labels.includes('CUT'));
  assert.ok(labels.includes('WD'));
  const winner = Object.entries(e.results).find(([, r]) => r[0] === '1');
  assert.ok(winner[1][1] > 0, 'the winner earns FedEx points');
});

test('the live view is in leaderboard order, with rounds and today', () => {
  const lb = parseLeaderboard(OPEN);
  assert.equal(lb.players[0].position, 1);
  const positions = lb.players.map(p => p.position).filter(p => p !== null);
  assert.deepEqual(positions, positions.slice().sort((a, b) => a - b));
  const bryson = lb.players.find(p => p.id === '10046');
  assert.equal(bryson.name, 'Bryson DeChambeau');
  assert.equal(bryson.toPar, '-4');
  assert.equal(bryson.today, '+2');
  assert.deepEqual(bryson.rounds, [67, 68, 69, 72]);
  assert.match(bryson.headshot, /headshots\/golf\/players\/full\/10046\.png$/);
  assert.equal(lb.major, true);
  assert.equal(lb.cutRound, 2);
  const cut = lb.players.find(p => p.finish === 'CUT');
  assert.equal(cut.position, null);
});

test('a team event credits both players', () => {
  const e = condenseLeaderboard(ZURICH);
  assert.equal(e.team, true);
  assert.deepEqual(e.results['9037'], ['1', 400]);      // Matt Fitzpatrick: winners get the full 400, ESPN's row says 200
  assert.deepEqual(e.results['4364865'], ['1', 400]);   // Alex Fitzpatrick
  const lb = parseLeaderboard(ZURICH);
  assert.equal(lb.players[0].team, 'M. Fitzpatrick / A. Fitzpatrick');
  assert.equal(lb.players[1].team, 'M. Fitzpatrick / A. Fitzpatrick');
});

test('the TOUR Championship is flagged, and a cancelled event has no results', () => {
  const tc = condenseLeaderboard(TOUR_CHAMP);
  assert.equal(tc.tourChampionship, true);
  assert.equal(tc.major, false);
  const sentry = condenseLeaderboard(SENTRY);
  assert.equal(sentry.status, 'canceled');
  assert.deepEqual(sentry.results, {});
});

test('a golfer\'s official season record', () => {
  const r = parseGolferRecord(fixture('record-9037'));
  assert.deepEqual({ cupPoints: r.cupPoints, wins: r.wins, topTens: r.topTens, cutsMade: r.cutsMade, events: r.events },
    { cupPoints: 3463, wins: 3, topTens: 8, cutsMade: 19, events: 21 });
});

test('golferResults and fedexTable read the condensed season', () => {
  const events = [condenseLeaderboard(ZURICH), condenseLeaderboard(OPEN)];
  const fitz = golferResults(events, '9037');
  assert.equal(fitz[0].finish, '1');
  const table = fedexTable(events);
  assert.ok(table[0].points >= table[1].points);
  assert.equal(table[0].rank, 1);
  const tied = table.filter(r => r.points === table[1].points);
  assert.ok(tied.every(r => r.rank === tied[0].rank));
});

// ---- worker/golf.js ----

const LEADERBOARDS = { '401811927': SENTRY, '401811943': ZURICH, '401811957': OPEN, '401811964': TOUR_CHAMP };
const at = iso => Date.parse(iso);

test('updateSeason fills finished events a few at a time, oldest first', async () => {
  const fetched = [];
  const fetchLeaderboard = async id => {
    fetched.push(id);
    if(!LEADERBOARDS[id]) throw new Error('no fixture');
    return LEADERBOARDS[id];
  };
  // Only fixtures for four events, so the rest "fail" and stay unfilled.
  const calendar = CALENDAR.filter(e => LEADERBOARDS[e.id]);
  const now = at('2026-09-29T12:00Z');
  const first = await updateSeason({ calendar, stored: {}, now, fetchLeaderboard, maxFetch: 2 });
  assert.deepEqual(fetched, ['401811927', '401811943']);
  assert.equal(first.changed, true);
  assert.equal(first.complete, false);
  assert.deepEqual(Object.keys(first.stored).sort(), ['401811927', '401811943']);
  assert.equal(first.events.length, 4);
  assert.equal(first.events[2].status, 'pre', 'not filled yet: a stub');

  const second = await updateSeason({ calendar, stored: first.stored, now, fetchLeaderboard, maxFetch: 2 });
  assert.equal(second.complete, true);
  assert.equal(second.golfers['9037'][0], 'Matt Fitzpatrick', 'names for the whole season, once');
  assert.ok(second.events.every(e => !e.golfers), 'not repeated per event');
  assert.equal(second.events[3].tourChampionship, true);

  fetched.length = 0;
  const third = await updateSeason({ calendar, stored: second.stored, now, fetchLeaderboard });
  assert.deepEqual(fetched, [], 'finished events are never fetched again');
  assert.equal(third.changed, false);
});

test('updateSeason: an event in progress is returned but not stored; future ones are stubs', async () => {
  const live = structuredClone(OPEN);
  live.events[0].status.type = { name: 'STATUS_IN_PROGRESS', state: 'in', completed: false };
  const calendar = CALENDAR.filter(e => e.id === '401811957' || e.id === '401811964');
  const now = at('2026-07-18T15:00Z');
  const r = await updateSeason({ calendar, stored: {}, now, fetchLeaderboard: async () => live });
  assert.equal(r.changed, false);
  assert.equal(r.complete, true);
  assert.equal(r.events[0].status, 'in');
  assert.ok(Object.keys(r.events[0].results).length > 0);
  assert.equal(r.events[1].status, 'pre');
  assert.equal(r.events[1].results, undefined);
});
