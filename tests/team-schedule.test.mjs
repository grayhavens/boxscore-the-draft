// A team's schedule from ESPN's answers (js/team-schedule.js): a failed
// call means "don't know" (null), never "no games", so a few seconds
// offline can't overwrite a good cached schedule with an empty one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitTeamSchedule } from '../js/team-schedule.js';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const ev = (id, date, completed) => ({ id, date, completed });
const normalize = e => e;
const played = { events: [ev('1', '2026-10-04T14:00:00Z', true), ev('2', '2026-10-11T14:00:00Z', true)] };
const fixtures = { events: [ev('3', '2026-10-25T14:00:00Z', false), ev('4', '2026-11-01T15:00:00Z', false)] };

test('both answers: results newest-first, fixtures soonest-first', () => {
  const s = splitTeamSchedule([played, fixtures], normalize, NOW);
  assert.deepEqual(s.recent.map(e => e.id), ['2', '1']);
  assert.deepEqual(s.upcoming.map(e => e.id), ['3', '4']);
});

test('every call failed: null, not an empty schedule', () => {
  assert.equal(splitTeamSchedule([null, null], normalize, NOW), null);
});

test('one call failed: null, since for EPL each call holds half the season', () => {
  assert.equal(splitTeamSchedule([played, null], normalize, NOW), null);
  assert.equal(splitTeamSchedule([null, fixtures], normalize, NOW), null);
});

test('the preseason call failing counts too', () => {
  assert.equal(splitTeamSchedule([played, fixtures, null], normalize, NOW), null);
});

test('answers with no events: a real, empty schedule', () => {
  assert.deepEqual(splitTeamSchedule([{ events: [] }, {}], normalize, NOW), { recent: [], upcoming: [] });
});

test('the same game in both answers is listed once', () => {
  const s = splitTeamSchedule([fixtures, fixtures], normalize, NOW);
  assert.deepEqual(s.upcoming.map(e => e.id), ['3', '4']);
});

test('a postponed game dated in the past is not "upcoming"', () => {
  const postponed = { events: [ev('9', '2026-06-01T18:00:00Z', false)] };
  const s = splitTeamSchedule([postponed, fixtures], normalize, NOW);
  assert.deepEqual(s.upcoming.map(e => e.id), ['3', '4']);
  assert.deepEqual(s.recent, []);
});

test('events normalize() drops are skipped', () => {
  const s = splitTeamSchedule([played, fixtures], e => (e.id === '1' ? null : e), NOW);
  assert.deepEqual(s.recent.map(e => e.id), ['2']);
});
