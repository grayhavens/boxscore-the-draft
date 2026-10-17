// ESPN as the worker sees it (worker/espn-probe.js): the daily cron's one
// request, and when its answer last changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextProbe, runEspnProbe, ESPN_PROBE_KEY } from '../worker/espn-probe.js';

test('the first check starts the clock; the same answer keeps it; a change restarts it', () => {
  const first = nextProbe(null, { ok: false, status: 403, at: 100 });
  assert.deepEqual(first, { ok: false, status: 403, at: 100, since: 100 });
  const same = nextProbe(first, { ok: false, status: 403, at: 200 });
  assert.deepEqual(same, { ok: false, status: 403, at: 200, since: 100 });
  const back = nextProbe(same, { ok: true, status: 200, at: 300 });
  assert.deepEqual(back, { ok: true, status: 200, at: 300, since: 300 });
});

test('a run stores the answer, and a failed request reads as status 0', async () => {
  const kv = new Map();
  const env = { LEAGUE_FACTS: {
    get: async (k, type) => (kv.has(k) ? (type === 'json' ? JSON.parse(kv.get(k)) : kv.get(k)) : null),
    put: async (k, v) => { kv.set(k, v); }
  } };
  const blocked = await runEspnProbe(env, async () => ({ ok: false, status: 403 }));
  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 403);
  assert.deepEqual(JSON.parse(kv.get(ESPN_PROBE_KEY)), blocked);
  const failed = await runEspnProbe(env, async () => { throw new Error('network'); });
  assert.equal(failed.status, 0);
  assert.equal(failed.since, blocked.since);
});
