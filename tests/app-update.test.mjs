// The rules for updating an app that stays open (js/app-update.js): when
// to ask for a new service worker, and when a reload loses nothing.
// docs/optimization-report.md, Phase 4 #2 and #3.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UPDATE_CHECK_AWAY_MS, shouldCheckForUpdate, isSafeToReload } from '../js/app-update.js';

test('checks for an update only after 30+ minutes away', () => {
  const now = 10 * UPDATE_CHECK_AWAY_MS;
  assert.equal(UPDATE_CHECK_AWAY_MS, 30 * 60 * 1000);
  assert.equal(shouldCheckForUpdate(now - UPDATE_CHECK_AWAY_MS, now), true);
  assert.equal(shouldCheckForUpdate(now - UPDATE_CHECK_AWAY_MS + 1, now), false);
  assert.equal(shouldCheckForUpdate(now - 60 * 1000, now), false);
});

test('never checks before the app was ever hidden', () => {
  assert.equal(shouldCheckForUpdate(NaN, Date.now()), false);
  assert.equal(shouldCheckForUpdate(undefined, Date.now()), false);
});

test('reloads on Home, Scores, Standings and Points with nothing open', () => {
  for(const view of ['view-board', 'view-live-now', 'view-standings', 'view-overall']){
    assert.equal(isSafeToReload({ view, sheetOpen: false, typing: false }), true, view);
  }
});

test('never reloads in the draft room, chat, a team page, settings or the console', () => {
  for(const view of ['view-draft', 'view-chat', 'view-team-page', 'view-settings', 'view-admin', '']){
    assert.equal(isSafeToReload({ view, sheetOpen: false, typing: false }), false, view);
  }
});

test('never reloads under an open sheet or while typing', () => {
  assert.equal(isSafeToReload({ view: 'view-board', sheetOpen: true, typing: false }), false);
  assert.equal(isSafeToReload({ view: 'view-board', sheetOpen: false, typing: true }), false);
});
