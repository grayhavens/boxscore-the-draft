// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCode, generateCode, accessDecision, loadAccess, changeAccess, gateRequest } from '../worker/access-code.js';
import { buildMessages } from '../worker/welcome-email.js';

function fakeEnv(initial = {}){
  const data = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  return { data, LEAGUE_FACTS: {
    get: async (k, type) => (data.has(k) ? (type === 'json' ? JSON.parse(data.get(k)) : data.get(k)) : null),
    put: async (k, v) => { data.set(k, v); },
    delete: async k => { data.delete(k); }
  } };
}

test('normalizeCode makes typed codes comparable', () => {
  assert.equal(normalizeCode('  Maple River 42 '), 'maple-river-42');
  assert.equal(normalizeCode('maple_river--42!'), 'maple-river-42');
  assert.equal(normalizeCode(null), '');
});

test('generateCode is two different words and a number', () => {
  for(let i = 0; i < 50; i++) assert.match(generateCode(), /^[a-z]+-[a-z]+-\d\d$/);
  const [a, b] = generateCode(() => 0).split('-');
  assert.notEqual(a, b);
});

test('no code means open; soft mode lets everyone through; enforcing needs the code', () => {
  assert.deepEqual(accessDecision(null, ''), { required: false, ok: true, allowed: true });
  assert.deepEqual(accessDecision({ code: 'a-b-11', enforce: false }, 'nope'), { required: false, ok: false, allowed: true });
  assert.deepEqual(accessDecision({ code: 'a-b-11', enforce: true }, 'nope'), { required: true, ok: false, allowed: false });
  assert.deepEqual(accessDecision({ code: 'a-b-11', enforce: true }, ' A B 11 '), { required: true, ok: true, allowed: true });
  assert.equal(accessDecision({ code: 'a-b-11', enforce: true }, undefined).allowed, false);
});

test('a new code starts soft, enforcing is its own step, and it needs a code first', async () => {
  const env = fakeEnv();
  assert.deepEqual(await changeAccess(env, 'g1', 'enforce'), { error: 'no_code' });
  const { access } = await changeAccess(env, 'g1', 'rotate');
  assert.equal(access.enforce, false);
  assert.equal((await changeAccess(env, 'g1', 'enforce')).access.enforce, true);
  // Rotating goes back to soft mode.
  assert.equal((await changeAccess(env, 'g1', 'rotate')).access.enforce, false);
  assert.equal((await changeAccess(env, 'g1', 'clear')).access, null);
  assert.equal(env.data.has('access@g1'), false);
  assert.deepEqual(await changeAccess(env, 'g1', 'bogus'), { error: 'bad_action' });
});

test('the gate turns away only enforced groups without the code', async () => {
  const env = fakeEnv({ 'access@g2': { code: 'maple-river-42', enforce: true } });
  const call = q => gateRequest(env, 'g2', new URL(`https://w/activity${q}`), {});
  assert.equal((await call('')).status, 401);
  assert.equal((await call('?gc=wrong')).status, 401);
  assert.equal(await call('?gc=maple-river-42'), null);
  assert.equal(await gateRequest(fakeEnv(), 'other', new URL('https://w/activity'), {}), null);
});

test('records are cached briefly, then re-read', async () => {
  const env = fakeEnv({ 'access@g3': { code: 'a-b-11', enforce: true } });
  assert.equal((await loadAccess(env, 'g3', 1000)).code, 'a-b-11');
  env.data.set('access@g3', JSON.stringify({ code: 'c-d-22', enforce: true }));
  assert.equal((await loadAccess(env, 'g3', 2000)).code, 'a-b-11');
  assert.equal((await loadAccess(env, 'g3', 40000)).code, 'c-d-22');
});

test('the welcome email link carries the code, and {code} spells it out', () => {
  const [m] = buildMessages('thedraft', [{ name: 'Sam', email: 's@x.com' }], { subject: 'Hi', body: 'Code {code}\n{link}', code: 'maple-river-42' });
  assert.match(m.text, /Code maple-river-42/);
  assert.match(m.text, /https:\/\/thedraft\.boxscore\.space\/#code=maple-river-42/);
  const [plain] = buildMessages('thedraft', [{ name: 'Sam', email: 's@x.com' }], { subject: 'Hi', body: '{link}' });
  assert.doesNotMatch(plain.text, /#code=/);
});
