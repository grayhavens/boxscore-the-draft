// How often the open app refetches (js/refresh-cadence.js): as fast as
// before around live and imminent games, slow when nothing is on.
// docs/optimization-report.md, Phase 3 #2 and #3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreboardTtlMs, teamCycleMs, MINUTE } from '../js/refresh-cadence.js';

const NOW = Date.parse('2026-10-18T14:00:00Z');
const iso = ms => new Date(NOW + ms).toISOString();

test('scoreboard: a live game keeps the one-minute refresh', () => {
  assert.equal(scoreboardTtlMs([{ state: 'post', date: iso(-3 * 60 * MINUTE) }, { state: 'in', date: iso(-30 * MINUTE) }], NOW), MINUTE);
});

test('scoreboard: next start in 5 hours waits the 15-minute maximum', () => {
  assert.equal(scoreboardTtlMs([{ state: 'pre', date: iso(5 * 60 * MINUTE) }], NOW), 15 * MINUTE);
});

test('scoreboard: next start in 40 minutes waits until 30 minutes before it', () => {
  assert.equal(scoreboardTtlMs([{ state: 'pre', date: iso(40 * MINUTE) }], NOW), 10 * MINUTE);
});

test('scoreboard: within 30 minutes of a start, back to every minute', () => {
  assert.equal(scoreboardTtlMs([{ state: 'pre', date: iso(20 * MINUTE) }], NOW), MINUTE);
  assert.equal(scoreboardTtlMs([{ state: 'pre', date: iso(-5 * MINUTE) }], NOW), MINUTE);  // late start
});

test('scoreboard: all games over, or a day with none, waits 15 minutes', () => {
  assert.equal(scoreboardTtlMs([{ state: 'post', date: iso(-60 * MINUTE) }], NOW), 15 * MINUTE);
});

test('scoreboard: a failed fetch (no answer) keeps one minute, no guessing', () => {
  assert.equal(scoreboardTtlMs(null, NOW), MINUTE);
  assert.equal(scoreboardTtlMs(undefined, NOW), MINUTE);
});

test('scoreboard: a day with no games at all waits 15 minutes', () => {
  assert.equal(scoreboardTtlMs([], NOW), 15 * MINUTE);
});

test('scoreboard: the earliest upcoming start counts', () => {
  assert.equal(scoreboardTtlMs([{ state: 'pre', date: iso(5 * 60 * MINUTE) }, { state: 'pre', date: iso(35 * MINUTE) }], NOW), 5 * MINUTE);
});

const bundle = (upcoming, recent, isLive = false) => ({ espnSchedule: { upcoming, recent }, espnLive: isLive ? { isLive: true } : null });

test('team: live, starting within 3 hours, or started within 6 stays at 5 minutes', () => {
  assert.equal(teamCycleMs(bundle([], [], true), NOW), 5 * MINUTE);
  assert.equal(teamCycleMs(bundle([{ date: iso(2 * 60 * MINUTE) }], []), NOW), 5 * MINUTE);
  assert.equal(teamCycleMs(bundle([{ date: iso(4 * 24 * 60 * MINUTE) }], [{ date: iso(-5 * 60 * MINUTE) }]), NOW), 5 * MINUTE);
});

test('team: nothing near goes to 30 minutes', () => {
  assert.equal(teamCycleMs(bundle([{ date: iso(4 * 24 * 60 * MINUTE) }], [{ date: iso(-3 * 24 * 60 * MINUTE) }]), NOW), 30 * MINUTE);
  assert.equal(teamCycleMs(bundle([], []), NOW), 30 * MINUTE);
});

test('team: no ESPN schedule (fallback sources) keeps 5 minutes', () => {
  assert.equal(teamCycleMs({ espnSchedule: null }, NOW), 5 * MINUTE);
  assert.equal(teamCycleMs(undefined, NOW), 5 * MINUTE);
});
