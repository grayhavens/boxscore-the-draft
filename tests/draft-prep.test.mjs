import test from 'node:test';
import assert from 'node:assert/strict';
import { commissionerChecklist, ownerChecklist, seasonalDue, outlookSummary } from '../js/draft-prep.js';

const DAY = 86400000;
const NOW = new Date(2027, 7, 20, 12).getTime();   // Aug 20, 2027
const base = {
  status: { phase: 'lobby', poolSize: 0, ordered: false, scheduledAt: null, poll: null, drafters: 9, total: 216 },
  rehearsal: null,
  sports: { drafted: 8, scoresOnly: 1 },
  leagues: [{ key: 'nfl', label: 'NFL', locked: true }, { key: 'mlb', label: 'MLB', locked: false }],
  check: null,
  nextLabel: '2027/2028',
  now: NOW
};
const byKey = rows => Object.fromEntries(rows.map(r => [r.key, r]));

test('commissioner: a lobby weeks out asks for the time, and nothing is urgent yet', () => {
  const r = byKey(commissionerChecklist(base));
  assert.equal(r.sports.state, 'ok');
  assert.match(r.sports.detail, /8 sports drafted, 1 scores only/);
  assert.equal(r.room.state, 'mute');
  assert.match(r.room.detail, /load the team pool and run the lottery/);
  assert.equal(r.time.state, 'warn');
  assert.equal(r.rehearsal.state, 'mute');
  assert.equal(r.locks.state, 'mute');
  assert.equal(r.locks.action.kind, 'league:mlb');
  assert.equal(r.check.state, 'mute');
});

test('commissioner: in the draft week the lobby, rehearsal, locks and check turn urgent', () => {
  const status = { ...base.status, scheduledAt: NOW + 3 * DAY };
  const r = byKey(commissionerChecklist({ ...base, status }));
  assert.equal(r.time.state, 'ok');
  for(const k of ['room', 'rehearsal', 'locks', 'check']) assert.equal(r[k].state, 'warn', k);
});

test('commissioner: last season\'s finished board points to the room\'s reset', () => {
  const r = byKey(commissionerChecklist({ ...base, status: { ...base.status, phase: 'done', poolSize: 337, ordered: true } }));
  assert.equal(r.room.state, 'warn');
  assert.match(r.room.detail, /Reset it from the draft room/);
  assert.equal(r.room.action.kind, 'room');
  assert.equal(r.time.state, 'mute');
});

test('commissioner: a finished rehearsal, all locks and a passed check are done', () => {
  const r = byKey(commissionerChecklist({
    ...base,
    rehearsal: { phase: 'done' },
    leagues: [{ key: 'nfl', label: 'NFL', locked: true }],
    check: { ok: true, at: NOW, detail: 'Checked' }
  }));
  assert.equal(r.rehearsal.state, 'ok');
  assert.equal(r.locks.state, 'ok');
  assert.equal(r.locks.action, null);
  assert.equal(r.check.state, 'ok');
  assert.equal(r.check.action.label, 'Check again');
});

test('commissioner: a failed check and a passed draft time need attention', () => {
  const status = { ...base.status, scheduledAt: NOW - DAY };
  const r = byKey(commissionerChecklist({ ...base, status, check: { ok: false, at: NOW, detail: 'nope' } }));
  assert.equal(r.check.state, 'warn');
  assert.equal(r.time.state, 'warn');
  assert.match(r.time.detail, /has passed/);
});

test('seasonalDue: only August through October, when not done since July', () => {
  assert.equal(seasonalDue('2027-06-30', NOW), true);
  assert.equal(seasonalDue('2027-07-02', NOW), false);
  assert.equal(seasonalDue(null, NOW), true);
  assert.equal(seasonalDue('2026-10-13', new Date(2027, 2, 1).getTime()), false);   // March: never due
  assert.equal(seasonalDue('2026-10-13', new Date(2027, 10, 2).getTime()), false);  // November: season over
});

test('owner: last year\'s lists, rankings and outlooks are due in August', () => {
  const rows = byKey(ownerChecklist({
    espnFetched: '2026-10-13', ranksChanged: '2026-10-04',
    outlooks: outlookSummary({ 2026: { a: { at: '2026-10-11' }, b: { at: '2026-10-09' } } }),
    golferSeason: 2026, golfers: false, now: NOW
  }));
  assert.equal(rows.espn.state, 'warn');
  assert.equal(rows.espn.command, 'node tools/espn-teams.mjs');
  assert.equal(rows.ranks.state, 'warn');
  assert.equal(rows.outlooks.state, 'warn');
  assert.equal(rows.golfers.state, 'mute');
});

test('owner: done this summer is fine, and golfers only matter when a group drafts them', () => {
  const rows = byKey(ownerChecklist({
    espnFetched: '2027-08-10', ranksChanged: '2027-08-11',
    outlooks: { 2027: { count: 300, latest: '2027-08-15' } },
    golferSeason: 2026, golfers: true, now: NOW
  }));
  assert.equal(rows.espn.state, 'ok');
  assert.equal(rows.ranks.state, 'ok');
  assert.equal(rows.outlooks.state, 'ok');
  assert.match(rows.outlooks.detail, /300 teams written for 2027/);
  assert.equal(rows.golfers.state, 'warn');
});

test('outlookSummary counts each class and finds its newest date', () => {
  assert.deepEqual(outlookSummary({ 2026: { a: { at: '2026-10-01' }, b: { at: '2026-10-11' } }, 2027: {} }),
    { 2026: { count: 2, latest: '2026-10-11' }, 2027: { count: 0, latest: null } });
});

test('commissioner: a finished room\'s old draft time doesn\'t count as set', () => {
  const done = { ...base.status, phase: 'done', poolSize: 337, ordered: true, scheduledAt: NOW - 30 * DAY };
  assert.equal(byKey(commissionerChecklist({ ...base, status: done })).time.state, 'mute');
  assert.equal(byKey(commissionerChecklist({ ...base, status: { ...done, scheduledAt: NOW + 30 * DAY } })).time.state, 'ok');
  assert.equal(byKey(commissionerChecklist({ ...base, status: { ...done, poll: { options: [1, 2] } } })).time.state, 'warn');
});

test('commissioner: last season still being played comes first, then asks to be recorded', () => {
  const playing = commissionerChecklist({ ...base, previous: { id: '2026', label: '2026/27', open: ['MLB', 'WNBA'] } });
  assert.equal(playing[0].key, 'previous');
  assert.equal(playing[0].state, 'mute');
  assert.match(playing[0].detail, /Still playing: MLB, WNBA/);
  assert.deepEqual(playing[0].action, { kind: 'season:2026', label: 'Open 2026/27' });
  const unknown = commissionerChecklist({ ...base, previous: { id: '2026', label: '2026/27', open: null } });
  assert.equal(unknown[0].state, 'mute');
  const done = commissionerChecklist({ ...base, previous: { id: '2026', label: '2026/27', open: [] } });
  assert.equal(done[0].state, 'warn');
  assert.equal(done[0].title, 'Record 2026/27’s final standings');
  assert.deepEqual(done[0].action, { kind: 'record:2026', label: 'Open History' });
  assert.equal(commissionerChecklist(base)[0].key, 'sports');
});
