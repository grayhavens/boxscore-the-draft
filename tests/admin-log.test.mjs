// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { addEntry, logAdminAction, loadAdminLog, ADMIN_LOG_MAX, ADMIN_LOG_KEY } from '../worker/admin-log.js';
import { deviceId, pushService } from '../worker/web-push.js';

test('addEntry puts the newest first, caps the log and the text', () => {
  const log = addEntry([{ ts: 1, text: 'old' }], { who: 'me', group: 'g', action: 'x', text: 'y'.repeat(999) }, 5);
  assert.equal(log[0].ts, 5);
  assert.equal(log[0].text.length, 300);
  assert.equal(log[1].text, 'old');
  const full = Array.from({ length: ADMIN_LOG_MAX }, (_, i) => ({ ts: i }));
  assert.equal(addEntry(full, { text: 'new' }).length, ADMIN_LOG_MAX);
});

test('logAdminAction appends, and never throws on a KV failure', async () => {
  const store = new Map();
  const env = { LEAGUE_FACTS: {
    async get(key, type){ const v = store.get(key); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
    async put(key, value){ store.set(key, value); }
  } };
  await logAdminAction(env, { who: 'me', group: 'seasonticket', action: 'dismiss', text: 'Dismissed Sam' });
  await logAdminAction(env, { who: 'me', group: 'seasonticket', action: 'access', text: 'Enforced' });
  assert.deepEqual((await loadAdminLog(env)).map(l => l.text), ['Enforced', 'Dismissed Sam']);
  assert.ok(store.has(ADMIN_LOG_KEY));
  env.LEAGUE_FACTS.put = async () => { throw new Error('down'); };
  await logAdminAction(env, { text: 'lost' });
});

test('devices get a stable short id and a readable push service', async () => {
  const endpoint = 'https://web.push.apple.com/abc';
  assert.match(await deviceId(endpoint), /^[0-9a-f]{12}$/);
  assert.equal(await deviceId(endpoint), await deviceId(endpoint));
  assert.notEqual(await deviceId(endpoint), await deviceId(`${endpoint}d`));
  assert.equal(pushService(endpoint), 'Apple');
  assert.equal(pushService('https://fcm.googleapis.com/fcm/send/x'), 'Chrome');
  assert.equal(pushService('https://updates.push.services.mozilla.com/wpush/v2/x'), 'Firefox');
  assert.equal(pushService('https://push.example.org/x'), 'push.example.org');
});
