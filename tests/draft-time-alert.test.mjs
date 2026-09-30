// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { draftTimeAlert } from '../worker/draft-time-alert.js';

const NOW = 1790000000000, A = NOW + 86400000, B = A + 86400000;

test('a first draft time alerts as set, carrying the time for the phone to format', () => {
  const alert = draftTimeAlert(null, A, NOW);
  assert.equal(alert.title, 'Draft time set');
  assert.equal(alert.kind, 'draft-time');
  assert.equal(alert.at, A);
  assert.equal(alert.url, './');
  assert.ok(alert.body);
});

test('moving the draft time alerts as changed', () => {
  assert.equal(draftTimeAlert(A, B, NOW).title, 'Draft time changed');
});

test('clearing, re-saving the same time, or a past time alerts nobody', () => {
  assert.equal(draftTimeAlert(A, null, NOW), null);
  assert.equal(draftTimeAlert(A, A, NOW), null);
  assert.equal(draftTimeAlert(null, NOW - 1, NOW), null);
});
