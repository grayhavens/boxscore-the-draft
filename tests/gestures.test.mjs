import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockAxis, releaseDirection, velocity } from '../js/gestures.js';

test('lockAxis waits out the slop, then picks the longer axis', () => {
  assert.equal(lockAxis(3, 4, 8), null);
  assert.equal(lockAxis(7, 2, 8), null);
  assert.equal(lockAxis(9, 2, 8), 'x');
  assert.equal(lockAxis(-9, 3, 8), 'x');
  assert.equal(lockAxis(2, 9, 8), 'y');
  assert.equal(lockAxis(1, -12, 8), 'y');
  // A perfect diagonal counts as vertical, so the page keeps scrolling.
  assert.equal(lockAxis(8, 8, 8), 'y');
});

test('releaseDirection commits past the distance, in the drag direction', () => {
  assert.equal(releaseDirection(71, 0, { commit: 70 }), 1);
  assert.equal(releaseDirection(-70, 0, { commit: 70 }), -1);
  assert.equal(releaseDirection(69, 0, { commit: 70 }), 0);
  assert.equal(releaseDirection(0, 2, { commit: 70 }), 0);
});

test('releaseDirection commits a fling only when it agrees with the drag', () => {
  assert.equal(releaseDirection(30, 0.7, { commit: 90, fling: 0.6 }), 1);
  assert.equal(releaseDirection(-30, -0.6, { commit: 90, fling: 0.6 }), -1);
  assert.equal(releaseDirection(30, -0.9, { commit: 90, fling: 0.6 }), 0);
  assert.equal(releaseDirection(30, 0.5, { commit: 90, fling: 0.6 }), 0);
  // Without a fling threshold, speed alone never commits.
  assert.equal(releaseDirection(30, 5, { commit: 70 }), 0);
});

test('velocity reads the last stretch of samples', () => {
  const samples = [
    { t: 0, x: 0, y: 0 }, { t: 50, x: 5, y: 0 }, { t: 100, x: 10, y: 0 },
    { t: 150, x: 40, y: 0 }, { t: 200, x: 80, y: 0 }
  ];
  assert.equal(velocity(samples, 'x'), 0.7);
  assert.equal(velocity(samples, 'y'), 0);
  assert.equal(velocity([{ t: 0, x: 0, y: 0 }], 'x'), 0);
});
