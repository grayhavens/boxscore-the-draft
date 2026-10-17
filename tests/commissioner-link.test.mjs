// The commissioner link from the system admin page (#commissioner=<token>),
// read at boot by js/utils.js now that the console (js/admin.js) loads only
// when opened (docs/lazy-load-plan.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { commissionerTokenFrom } from '../js/utils.js';

test('a commissioner link gives its token', () => {
  assert.equal(commissionerTokenFrom('#commissioner=eyJ0.abc-123_x'), 'eyJ0.abc-123_x');
});

test('anything else gives none', () => {
  assert.equal(commissionerTokenFrom(''), null);
  assert.equal(commissionerTokenFrom(undefined), null);
  assert.equal(commissionerTokenFrom('#commissioner='), null);
  assert.equal(commissionerTokenFrom('#me=abc'), null);
  assert.equal(commissionerTokenFrom('#commissioner=abc&x=1'), null);
});
