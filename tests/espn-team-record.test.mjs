// NDSU's season record (js/espn.js's parseEspnScheduleRecord). NDSU is FCS,
// so it isn't in ESPN's FBS standings; its record comes from its team
// schedule instead, the per-team ESPN path that still sends CORS headers
// (the /teams/{id}?enable=record one stopped, 2026-10-18). Real payload,
// trimmed (tests/fixtures/espn-cfb-team-schedule-ndsu.json): 6-1 after
// seven games, five still to play.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEspnScheduleRecord } from '../js/espn.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/espn-cfb-team-schedule-ndsu.json'), 'utf8'));

test('reads the record off the schedule\'s team block', () => {
  assert.deepEqual(parseEspnScheduleRecord(FIX), {
    id: '2449',
    location: 'North Dakota State',
    teamName: 'North Dakota State Bison',
    wins: 6,
    losses: 1
  });
});

test('without recordSummary: counts finished games, skips the ones still to play', () => {
  const { recordSummary, ...team } = FIX.team;
  const row = parseEspnScheduleRecord({ ...FIX, team });
  assert.equal(row.wins, 6);
  assert.equal(row.losses, 1);
});

test('nothing usable: null, so the TheRundown fallback still runs', () => {
  assert.equal(parseEspnScheduleRecord(null), null);
  assert.equal(parseEspnScheduleRecord({}), null);
  const { recordSummary, ...team } = FIX.team;
  assert.equal(parseEspnScheduleRecord({ team }), null);
  assert.equal(parseEspnScheduleRecord({ team, events: [] }), null);
});
