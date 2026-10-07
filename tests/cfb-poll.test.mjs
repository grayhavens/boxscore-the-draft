// Which college football poll shows (js/cfb-poll.js): the AP's until the
// CFP committee ranks, then the CFP's for the rest of that season. Real
// ESPN payloads, trimmed (tests/fixtures/espn-cfb-rankings.json).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickCfbPoll, keepCfpPoll, cfpPossible, teamIdFromRef, CFB_POLLS } from '../js/cfb-poll.js';

const FIX = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/espn-cfb-rankings.json'), 'utf8'));
const apOnly = FIX.siteApOnly;
// The site feed the week the committee first ranks: the CFP poll joins the AP's and the Coaches'.
const withCfp = { ...apOnly, rankings: [...apOnly.rankings, FIX.cfpWeek11] };
const locations = picked => picked.ranks.map(r => r.team.location);

test('before the CFP ranks: the AP Top 25, not the Coaches poll next to it', () => {
  const picked = pickCfbPoll(apOnly);
  assert.equal(picked.poll, 'ap');
  assert.equal(picked.season, 2026);
  assert.deepEqual(locations(picked), ['Texas', 'Georgia', 'Notre Dame']);
});

test('once the CFP has ranked, its poll wins wherever it sits in the feed', () => {
  assert.equal(pickCfbPoll(withCfp).poll, 'cfp');
  assert.deepEqual(locations(pickCfbPoll(withCfp)), ['Ohio State', 'Indiana', 'Texas A&M']);
  const cfpFirst = { ...apOnly, rankings: [FIX.cfpWeek11, ...apOnly.rankings] };
  assert.equal(pickCfbPoll(cfpFirst).poll, 'cfp');
});

test('an empty CFP entry falls back to the AP', () => {
  const empty = { ...apOnly, rankings: [...apOnly.rankings, { ...FIX.cfpWeek11, ranks: [] }] };
  assert.equal(pickCfbPoll(empty).poll, 'ap');
});

test('no usable feed is null', () => {
  assert.equal(pickCfbPoll(null), null);
  assert.equal(pickCfbPoll({}), null);
  assert.equal(pickCfbPoll({ latestSeason: { year: 2026 }, rankings: [] }), null);
});

test('a CFP poll held for this season outlasts the AP-only feed after its last ranking', () => {
  const cached = { poll: 'cfp', season: 2026, ranks: [{ rank: 1, location: 'Ohio State' }] };
  const fresh = { poll: 'ap', season: 2026, ranks: [{ rank: 1, location: 'Texas' }] };
  assert.equal(keepCfpPoll(fresh, cached), cached);
});

test('last season\'s CFP poll, an AP cache, or a fresh CFP poll never stick', () => {
  const fresh = { poll: 'ap', season: 2026, ranks: [{ rank: 1 }] };
  assert.equal(keepCfpPoll(fresh, { poll: 'cfp', season: 2025, ranks: [{ rank: 1 }] }), fresh);
  assert.equal(keepCfpPoll(fresh, { poll: 'ap', season: 2026, ranks: [{ rank: 1 }] }), fresh);
  // A cache saved before this change has no poll or season.
  assert.equal(keepCfpPoll(fresh, { ranks: [{ rank: 1 }] }), fresh);
  assert.equal(keepCfpPoll(fresh, { poll: 'cfp', season: 2026, ranks: [] }), fresh);
  const freshCfp = { poll: 'cfp', season: 2026, ranks: [{ rank: 2 }] };
  assert.equal(keepCfpPoll(freshCfp, { poll: 'cfp', season: 2026, ranks: [{ rank: 1 }] }), freshCfp);
  assert.equal(keepCfpPoll(null, { poll: 'cfp', season: 2026, ranks: [{ rank: 1 }] }), null);
});

test('the core API is only asked November through January', () => {
  assert.equal(cfpPossible(new Date(2026, 9, 31)), false);
  assert.equal(cfpPossible(new Date(2026, 10, 1)), true);
  assert.equal(cfpPossible(new Date(2026, 11, 20)), true);
  assert.equal(cfpPossible(new Date(2027, 0, 20)), true);
  assert.equal(cfpPossible(new Date(2027, 1, 1)), false);
});

test('the core API\'s CFP poll: its season, and team ids off bare $refs', () => {
  assert.equal(FIX.coreCfp.type, 'cfp');
  assert.equal(FIX.coreCfp.season.year, 2025);
  assert.deepEqual(FIX.coreCfp.ranks.map(r => teamIdFromRef(r.team.$ref)), ['194', '84', '245']);
  assert.equal(teamIdFromRef(''), null);
  assert.equal(teamIdFromRef(undefined), null);
});

test('labels', () => {
  assert.equal(CFB_POLLS.ap.label, 'AP Top 25');
  assert.equal(CFB_POLLS.cfp.label, 'CFP Top 25');
});
