// What Scores says about where its games came from (js/scores-status.js):
// a day where a league failed to load is never called empty, and a kept
// copy says how old it is.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoresStatus, scoresSubNote, STALE_AFTER_MS } from '../js/scores-status.js';

const NOW = Date.parse('2026-10-18T14:00:00Z');
const ok = { loaded: true, fetchedAt: NOW - 30 * 1000, failed: false };
const failedNothingKept = { loaded: false, fetchedAt: NOW, failed: true };
const keptOld = { loaded: true, fetchedAt: NOW - 10 * 60 * 1000, failed: true };
const keptRecent = { loaded: true, fetchedAt: NOW - 60 * 1000, failed: true };
const time = t => new Date(t).toISOString().slice(11, 16);

test('everything loaded: nothing to say', () => {
  const s = scoresStatus([ok, ok], NOW);
  assert.deepEqual(s, { unreachable: false, missing: 0, staleAt: null });
  assert.equal(scoresSubNote(s, time), '');
});

test('every league failed with nothing kept: unreachable, not "nothing scheduled"', () => {
  const s = scoresStatus([failedNothingKept, failedNothingKept], NOW);
  assert.equal(s.unreachable, true);
  assert.equal(s.missing, 2);
});

test('one league failed: still unreachable for an empty day, and the line says so', () => {
  const s = scoresStatus([ok, failedNothingKept], NOW);
  assert.equal(s.unreachable, true);
  assert.equal(scoresSubNote(s, time), ' · Some leagues didn\'t load');
});

test('a kept copy past two minutes says when it was fetched', () => {
  const s = scoresStatus([ok, keptOld], NOW);
  assert.equal(s.unreachable, false);
  assert.equal(s.staleAt, keptOld.fetchedAt);
  assert.equal(scoresSubNote(s, time), ' · Updated 13:50');
});

test('a kept copy younger than two minutes reads as current', () => {
  assert.equal(scoresStatus([ok, keptRecent], NOW).staleAt, null);
  assert.ok(NOW - keptRecent.fetchedAt < STALE_AFTER_MS);
});

test('the oldest kept copy is the one named', () => {
  const older = { ...keptOld, fetchedAt: NOW - 30 * 60 * 1000 };
  assert.equal(scoresStatus([keptOld, older], NOW).staleAt, older.fetchedAt);
});

test('an old copy that refreshed fine is not "kept"', () => {
  assert.equal(scoresStatus([{ loaded: true, fetchedAt: NOW - 10 * 60 * 1000, failed: false }], NOW).staleAt, null);
});
