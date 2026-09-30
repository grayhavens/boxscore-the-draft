// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePollOptions, parsePollVote, replacePollOptions, pollTally } from '../js/draft-poll.js';

const A = 1791000000000, B = 1791090000000, C = 1791180000000, D = 1791270000000;

test('parsePollOptions takes two or three real times, sorted and de-duplicated', () => {
  assert.deepEqual(parsePollOptions([B, A]), [A, B]);
  assert.deepEqual(parsePollOptions([C, A, B]), [A, B, C]);
  assert.deepEqual(parsePollOptions([A, B, A]), [A, B]);
  assert.equal(parsePollOptions([A]), null);
  assert.equal(parsePollOptions([A, A]), null);
  assert.equal(parsePollOptions([A, B, C, D]), null);
  assert.equal(parsePollOptions([A, 'soon']), null);
  assert.equal(parsePollOptions([A, -1]), null);
  assert.equal(parsePollOptions(null), null);
});

test('parsePollVote keeps only offered times, and an empty answer is valid', () => {
  const poll = { options: [A, B, C], votes: {} };
  assert.deepEqual(parsePollVote(poll, [C, A]), [A, C]);
  assert.deepEqual(parsePollVote(poll, [D]), []);
  assert.deepEqual(parsePollVote(poll, []), []);
  assert.equal(parsePollVote(poll, 'A'), null);
  assert.equal(parsePollVote(poll, [A, null]), null);
  assert.equal(parsePollVote(null, [A]), null);
});

test('replacePollOptions keeps an answer only while it still names an offered time', () => {
  const poll = { options: [A, B], votes: { ann: [A, B], bo: [A], cy: [] } };
  assert.deepEqual(replacePollOptions(poll, [B, C]), { options: [B, C], votes: { ann: [B] } });
  assert.deepEqual(replacePollOptions(null, [A, B]), { options: [A, B], votes: {} });
});

test('pollTally splits the roster into per-time voters, none, and waiting', () => {
  const poll = { options: [A, B], votes: { ann: [A, B], bo: [B], cy: [], gone: [A] } };
  assert.deepEqual(pollTally(poll, ['ann', 'bo', 'cy', 'di']), {
    options: [{ at: A, voters: ['ann'] }, { at: B, voters: ['ann', 'bo'] }],
    none: ['cy'],
    waiting: ['di']
  });
});
