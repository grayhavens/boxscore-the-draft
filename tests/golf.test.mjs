// Run with: node --test tests/*.test.mjs
// Fixtures are real ESPN responses (2026 season), trimmed to a few
// competitors each and shuffled, since ESPN doesn't send them in order.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCalendar, fedexSeasonEvents, condenseLeaderboard, parseLeaderboard, parseGolferRecord,
  finishPosition, isMissedCut, golferResults, fedexTable, isTourChampionship, golferAwardCounts, fedexSeasonDone,
  finishAwards, parseLeagueLogo, pickWeekEvent, weekEventsToCheck, majorWindow, activeMajor, majorPoints, majorGolfers, majorLeaders, isOut
} from '../js/golf.js';
import { PGA_SCORING } from '../js/seasons/pga.js';
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

test('a golfer\'s rule counts come off the finished events', () => {
  const ev = (id, finish, extra = {}) => ({ id, name: id, status: 'post', major: false, tourChampionship: false, results: { 1: [finish, 0] }, ...extra });
  const events = [
    ev('a', '1'),                                  // win
    ev('b', 'CUT'),                                // missed cut
    ev('c', '1', { major: true }),                 // major win: only the major win
    ev('d', 'T15', { major: true }),               // top 20
    ev('e', 'T7', { major: true }),                // top 10, not also top 20
    ev('f', 'CUT', { major: true }),               // major missed cut
    ev('g', 'WD'),                                 // not a missed cut
    ev('h', '1', { tourChampionship: true }),      // TOUR Championship win: field + FedEx Cup + win
    ev('i', '1', { status: 'in' })                 // still being played
  ];
  assert.deepEqual(golferAwardCounts(events, '1'), {
    win: 2, majorWin: 1, majorTop10: 1, majorTop20: 1, majorMissedCut: 1, missedCut: 1, tourChampionship: 1, fedexCup: 1
  });
  assert.equal(golferAwardCounts(events, '999').win, 0);
  assert.equal(fedexSeasonDone(events), true);
  assert.equal(fedexSeasonDone(events.slice(0, 3)), false);
});

// ---- Majors on Home (docs/golf-majors-plan.md) ----

const day = iso => Date.parse(iso);
const OPEN_BOARD = parseLeaderboard(OPEN);   // The Open, 2026: Thu Jul 16 – Sun Jul 19
const OPEN_EVENT = { id: OPEN_BOARD.id, name: OPEN_BOARD.name, start: OPEN_BOARD.start, end: OPEN_BOARD.end };
const RULES = PGA_SCORING.rules;
// The Open still being played: round 3, with the cut made.
const OPEN_LIVE = { ...OPEN_BOARD, status: 'in', round: 3 };

test('finishAwards: one finish, the same tiers as the season counts', () => {
  assert.deepEqual(finishAwards({ finish: '1', major: true }), ['majorWin']);
  assert.deepEqual(finishAwards({ finish: '1' }), ['win']);
  assert.deepEqual(finishAwards({ finish: 'T10', major: true }), ['majorTop10']);
  assert.deepEqual(finishAwards({ finish: 'T11', major: true }), ['majorTop20']);
  assert.deepEqual(finishAwards({ finish: '21', major: true }), []);
  assert.deepEqual(finishAwards({ finish: 'CUT', major: true }), ['majorMissedCut']);
  assert.deepEqual(finishAwards({ finish: 'WD', major: true }), []);
  assert.deepEqual(finishAwards({ finish: '1', tourChampionship: true }), ['tourChampionship', 'fedexCup', 'win']);
});

test('a week with two events: the major, whichever ESPN lists first', () => {
  const week = fixture('scoreboard-open-week').events.map(e => ({ id: e.id, name: e.name }));
  const [open, corales] = week;
  assert.equal(corales.name, 'Corales Puntacana Championship');
  const flags = { [open.id]: { major: true, primary: true }, [corales.id]: { major: false, primary: false } };
  assert.equal(pickWeekEvent(week, flags).id, open.id);
  assert.equal(pickWeekEvent([corales, open], flags).id, open.id);
  // Only the opposite-field event checked: the other one is the main event.
  assert.equal(pickWeekEvent([corales, open], { [corales.id]: flags[corales.id] }).id, open.id);
  // Nothing checked yet: ESPN's first, and both need a look.
  assert.equal(pickWeekEvent([corales, open]).id, corales.id);
  assert.deepEqual(weekEventsToCheck(week), [open.id, corales.id]);
  assert.deepEqual(weekEventsToCheck(week, flags), []);
  assert.deepEqual(weekEventsToCheck([open]), [], 'a one-event week needs no look');
  assert.equal(pickWeekEvent([]), null);
});

test('the leaderboard says whether an event is the week\'s main one', () => {
  assert.equal(OPEN_BOARD.primary, true, 'missing means primary');
  const side = structuredClone(OPEN);
  side.events[0].primary = false;
  assert.equal(parseLeaderboard(side).primary, false);
  assert.equal(condenseLeaderboard(side).primary, false);
});

test('a major shows from the Monday of its week until a week after', () => {
  const w = majorWindow(OPEN_EVENT.start, OPEN_EVENT.end);
  assert.equal(new Date(w.from).toISOString(), '2026-07-13T04:00:00.000Z');
  assert.equal(new Date(w.to).toISOString(), '2026-07-27T04:00:00.000Z');
  assert.equal(majorWindow(null, OPEN_EVENT.end), null);

  const pre = { event: OPEN_EVENT, board: { ...OPEN_BOARD, status: 'pre', round: null } };
  assert.equal(activeMajor({ current: pre, now: day('2026-07-12T12:00Z') }), null, 'Sunday before: not yet');
  assert.equal(activeMajor({ current: pre, now: day('2026-07-13T12:00Z') }).status, 'pre', 'Monday');
  // Not a major: nothing, whatever the week.
  const regular = { event: OPEN_EVENT, board: { ...OPEN_BOARD, major: false } };
  assert.equal(activeMajor({ current: regular, now: day('2026-07-17T12:00Z') }), null);
  // Still being played on Monday (weather, a playoff): still on.
  const late = { event: OPEN_EVENT, board: OPEN_LIVE };
  assert.equal(activeMajor({ current: late, now: day('2026-08-20T12:00Z') }).status, 'in');
});

test('the week after: the finished major from the season, the scoreboard having moved on', () => {
  const condensed = condenseLeaderboard(OPEN);
  const next = { event: { id: 'x', name: '3M Open', start: '2026-07-23T04:00Z', end: '2026-07-26T04:00Z' }, board: null };
  const m = activeMajor({ current: next, events: [condensed], now: day('2026-07-24T12:00Z') });
  assert.equal(m.id, condensed.id);
  assert.equal(m.status, 'post');
  assert.equal(m.finishes['4251'], '1');
  assert.equal(activeMajor({ current: next, events: [condensed], now: day('2026-07-27T12:00Z') }), null, 'a week on: gone');
  assert.equal(activeMajor({ events: [{ ...condensed, major: false }], now: day('2026-07-24T12:00Z') }), null);
});

test('major points under a group\'s rules, in play while it\'s being played', () => {
  assert.equal(majorPoints('1', RULES), 5);
  assert.equal(majorPoints('T6', RULES), 2);
  assert.equal(majorPoints('T14', RULES), 1);
  assert.equal(majorPoints('T21', RULES), 0);
  assert.equal(majorPoints('CUT', RULES), -2);
  assert.equal(majorPoints('WD', RULES), 0);
  assert.equal(majorPoints('1', [{ label: 'Win a major', pts: 8, golfAuto: { each: 'majorWin' } }]), 8, 'a group\'s own numbers');
  assert.ok(isOut('CUT') && isOut('WD') && isOut('DQ') && !isOut('T4') && !isOut(null));
});

test('a drafter\'s golfers in a major: best first, points, who\'s still playing', () => {
  const live = activeMajor({ current: { event: OPEN_EVENT, board: OPEN_LIVE }, now: day('2026-07-18T12:00Z') });
  assert.equal(live.cutDone, true);
  const mine = majorGolfers(live, ['9131', '10046', '4251', '4683800', '999999'], RULES);
  assert.deepEqual(mine.rows.map(r => [r.id, r.finish, r.pts, r.playing]), [
    ['4251', '1', 5, true],
    ['10046', 'T14', 1, true],
    ['9131', 'CUT', -2, false],
    ['4683800', 'WD', 0, false]
  ], 'not in the field: left out');
  assert.equal(mine.total, 4);
  assert.equal(mine.playing, 2);

  const final = activeMajor({ events: [condenseLeaderboard(OPEN)], now: day('2026-07-20T12:00Z') });
  assert.equal(majorGolfers(final, ['4251'], RULES).playing, 0, 'over: nobody playing');
});

test('the leader, with a score to par from the live leaderboard', () => {
  const live = activeMajor({ current: { event: OPEN_EVENT, board: OPEN_LIVE }, now: day('2026-07-18T12:00Z') });
  assert.deepEqual(majorLeaders(live), { ids: ['4251'], toPar: '-10' });
  const final = activeMajor({ events: [condenseLeaderboard(OPEN)], now: day('2026-07-20T12:00Z') });
  assert.deepEqual(majorLeaders(final), { ids: ['4251'], toPar: null });
  const tied = { ...live, finishes: { a: 'T1', b: 'T1', c: '3' }, toPar: { a: '-9', b: '-9' } };
  assert.deepEqual(majorLeaders(tied), { ids: ['a', 'b'], toPar: '-9' });
});

test('the PGA Tour logo, one per theme', () => {
  const logo = parseLeagueLogo(fixture('scoreboard-open-week'));
  assert.match(logo.light, /leagues\/500\/pgatour\.png/);
  assert.match(logo.dark, /500-dark\/pgatour\.png/);
  assert.equal(parseLeagueLogo({ leagues: [{}] }), null);
});
