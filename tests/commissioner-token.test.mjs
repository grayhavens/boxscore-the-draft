// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCommissionerToken, checkCommissionerSecret } from '../worker/commissioner-token.js';

const NOW = Date.UTC(2026, 8, 28, 12);
const HOUR = 60 * 60 * 1000;

test('the group password still works', async () => {
  assert.equal(await checkCommissionerSecret('pw', 'pw', 'thedraft', NOW), true);
  assert.equal(await checkCommissionerSecret('nope', 'pw', 'thedraft', NOW), false);
});

test('a token works for its own group until it expires', async () => {
  const token = await makeCommissionerToken('pw', 'seasonticket', NOW + HOUR);
  assert.equal(await checkCommissionerSecret(token, 'pw', 'seasonticket', NOW), true);
  assert.equal(await checkCommissionerSecret(token, 'pw', 'seasonticket', NOW + 2 * HOUR), false);
});

test('a token is useless for another group or after the password changes', async () => {
  const token = await makeCommissionerToken('pw', 'seasonticket', NOW + HOUR);
  assert.equal(await checkCommissionerSecret(token, 'pw', 'thedraft', NOW), false);
  assert.equal(await checkCommissionerSecret(token, 'new-pw', 'seasonticket', NOW), false);
});

test('a tampered expiry or signature fails', async () => {
  const token = await makeCommissionerToken('pw', 'seasonticket', NOW + HOUR);
  const [p, g, , sig] = token.split('.');
  assert.equal(await checkCommissionerSecret(`${p}.${g}.${NOW + 100 * HOUR}.${sig}`, 'pw', 'seasonticket', NOW), false);
  assert.equal(await checkCommissionerSecret(`${token.slice(0, -2)}xx`, 'pw', 'seasonticket', NOW), false);
});

test('nothing authorizes when the group has no password', async () => {
  assert.equal(await checkCommissionerSecret('', undefined, 'seasonticket', NOW), false);
  assert.equal(await checkCommissionerSecret('anything', undefined, 'seasonticket', NOW), false);
});
