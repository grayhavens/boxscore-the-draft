// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, applyRoster, applySize, minDrafters } from '../js/groups.js';
import { claimsKey, confirmClaim, cleanName, handleClaim, addPerson, editSpot } from '../worker/claims.js';
import { rosterKey, loadAssigned, releaseSpot, effectiveDrafters, handleRoster, saveSize, loadSize } from '../worker/roster.js';

function fakeEnv(){
  const store = new Map();
  return {
    store,
    LEAGUE_FACTS: {
      async get(key, type){ const v = store.get(key); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
      async put(key, value){ store.set(key, value); },
      async delete(key){ store.delete(key); }
    }
  };
}

const json = (data, status, headers) => new Response(JSON.stringify(data), { status, headers });
const withClaims = (env, claims) => env.store.set(claimsKey('seasonticket'), JSON.stringify(claims));
const firstOpen = () => GROUPS.seasonticket.drafters.find(d => d.open);

test('applyRoster fills only open spots, keeps ids, and copies', () => {
  const drafters = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Drafter 2', open: true }, { id: 'c', name: 'Drafter 3', open: true }];
  const out = applyRoster(drafters, { a: { name: 'Nope' }, b: { name: 'Sam' } });
  assert.deepEqual(out, [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'Sam' }, { id: 'c', name: 'Drafter 3', open: true }]);
  assert.equal(drafters[1].name, 'Drafter 2');
  assert.deepEqual(applyRoster(drafters, null), drafters);
});

test('cleanName trims, flattens and caps', () => {
  assert.equal(cleanName('  Sam\n Rivera '), 'Sam Rivera');
  assert.equal(cleanName(7), '');
  assert.equal(cleanName('x'.repeat(99)).length, 40);
});

test('confirming a claim fills the next open spot under the edited name and drops the claim', async () => {
  const env = fakeEnv();
  withClaims(env, [{ id: 'c1', name: 'sam', email: 'sam@example.com' }, { id: 'c2', name: 'Alex', email: 'a@example.com' }]);
  const spot = firstOpen();
  assert.deepEqual(await confirmClaim(env, 'seasonticket', 'c1', ' Sam R '), { drafter: spot.id, name: 'Sam R', email: 'sam@example.com' });
  const assigned = await loadAssigned(env, 'seasonticket');
  assert.equal(assigned[spot.id].name, 'Sam R');
  assert.equal(assigned[spot.id].email, 'sam@example.com');
  assert.deepEqual(JSON.parse(env.store.get(claimsKey('seasonticket'))).map(c => c.id), ['c2']);

  const drafters = await effectiveDrafters(env, 'seasonticket');
  assert.equal(drafters.find(d => d.id === spot.id).name, 'Sam R');
  assert.equal(drafters.find(d => d.id === spot.id).open, undefined);

  // The next confirm takes the following spot.
  const second = await confirmClaim(env, 'seasonticket', 'c2', 'Alex');
  assert.notEqual(second.drafter, spot.id);
  assert.equal(env.store.has(claimsKey('seasonticket')), false);
});

test('confirm refuses a blank name, a duplicate name, a gone claim and a full group', async () => {
  const env = fakeEnv();
  withClaims(env, [{ id: 'c1', name: 'Sam', email: 's@x.co' }]);
  assert.deepEqual(await confirmClaim(env, 'seasonticket', 'c1', '  '), { error: 'name' });
  assert.deepEqual(await confirmClaim(env, 'seasonticket', 'c1', 'josh'), { error: 'taken' });
  assert.deepEqual(await confirmClaim(env, 'seasonticket', 'nope', 'Sam'), { error: 'claim' });

  const full = {};
  GROUPS.seasonticket.drafters.filter(d => d.open).forEach((d, i) => { full[d.id] = { name: `P${i}` }; });
  env.store.set(rosterKey('seasonticket'), JSON.stringify(full));
  assert.deepEqual(await confirmClaim(env, 'seasonticket', 'c1', 'Sam'), { error: 'full' });
});

test('adding someone without a claim fills the next open spot, email optional', async () => {
  const env = fakeEnv();
  const spot = firstOpen();
  assert.deepEqual(await addPerson(env, 'seasonticket', ' Pat ', ''), { drafter: spot.id, name: 'Pat', email: '' });
  const second = await addPerson(env, 'seasonticket', 'Kim', ' kim@example.com ');
  assert.equal(second.email, 'kim@example.com');
  assert.notEqual(second.drafter, spot.id);
  assert.deepEqual(await addPerson(env, 'seasonticket', 'pat', ''), { error: 'taken' });
  assert.deepEqual(await addPerson(env, 'seasonticket', 'Lee', 'not-an-email'), { error: 'email' });
  assert.deepEqual(await addPerson(env, 'seasonticket', '  ', ''), { error: 'name' });
});

test('editing a confirmed spot changes its name and email, keeps the rest, and only for confirmed spots', async () => {
  const env = fakeEnv();
  const spot = firstOpen();
  env.store.set(rosterKey('seasonticket'), JSON.stringify({ [spot.id]: { name: 'Sam', email: 'sam@example.com', at: 5 } }));
  assert.deepEqual(await editSpot(env, 'seasonticket', spot.id, 'Sam R', 'samr@example.com'),
    { drafter: spot.id, name: 'Sam R', email: 'samr@example.com', was: { name: 'Sam', email: 'sam@example.com' } });
  assert.deepEqual((await loadAssigned(env, 'seasonticket'))[spot.id], { name: 'Sam R', email: 'samr@example.com', at: 5 });
  // Its own name (another case) is fine; someone else's isn't.
  assert.equal((await editSpot(env, 'seasonticket', spot.id, 'sam r', '')).name, 'sam r');
  assert.deepEqual(await editSpot(env, 'seasonticket', spot.id, 'Josh', ''), { error: 'taken' });
  assert.deepEqual(await editSpot(env, 'seasonticket', spot.id, 'Sam', 'nope'), { error: 'email' });
  assert.deepEqual(await editSpot(env, 'seasonticket', 'josh', 'Joshua', ''), { error: 'spot' });
});

test('undo frees a confirmed spot, and only a confirmed one', async () => {
  const env = fakeEnv();
  const spot = firstOpen();
  env.store.set(rosterKey('seasonticket'), JSON.stringify({ [spot.id]: { name: 'Sam' } }));
  assert.equal(await releaseSpot(env, 'seasonticket', 'josh'), false);
  assert.equal(await releaseSpot(env, 'seasonticket', spot.id), true);
  assert.equal(env.store.has(rosterKey('seasonticket')), false);
  assert.equal((await effectiveDrafters(env, 'seasonticket')).find(d => d.id === spot.id).name, spot.name);
});

test('a group with no open spots never reads the roster', async () => {
  const env = fakeEnv();
  env.LEAGUE_FACTS.get = async () => { throw new Error('should not read'); };
  assert.equal(await effectiveDrafters(env, 'thedraft'), GROUPS.thedraft.drafters);
});

test('/roster serves names only, never emails', async () => {
  const env = fakeEnv();
  const spot = firstOpen();
  env.store.set(rosterKey('seasonticket'), JSON.stringify({ [spot.id]: { name: 'Sam', email: 'sam@example.com', at: 1 } }));
  const res = await handleRoster(new Request('https://w/roster?group=seasonticket'), env, 'seasonticket', {}, { json });
  assert.deepEqual(await res.json(), { assigned: { [spot.id]: { name: 'Sam' } }, size: null });
});

test('confirmed spots count as filled when a new claim arrives', async () => {
  const env = fakeEnv();
  const full = {};
  GROUPS.seasonticket.drafters.filter(d => d.open).forEach((d, i) => { full[d.id] = { name: `P${i}` }; });
  env.store.set(rosterKey('seasonticket'), JSON.stringify(full));
  const req = new Request('https://w/claim?group=seasonticket', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://boxscore.space' },
    body: JSON.stringify({ name: 'Late', email: 'late@example.com' })
  });
  const res = await handleClaim(req, env, 'seasonticket', {}, { isAllowedOrigin: () => true, json });
  assert.equal(res.status, 409);
});

test('applySize drops open spots off the end only, never a taken one', () => {
  const spots = [{ id: 'a', name: 'Ann' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C', open: true }, { id: 'd', name: 'D', open: true }];
  assert.deepEqual(applySize(spots, 3).map(d => d.id), ['a', 'b', 'c']);
  assert.deepEqual(applySize(spots, 2).map(d => d.id), ['a', 'b']);
  // b is taken, so 1 can't go below 2.
  assert.deepEqual(applySize(spots, 1).map(d => d.id), ['a', 'b']);
  assert.equal(minDrafters(spots), 2);
  // Bigger, missing or junk sizes change nothing.
  for(const size of [4, 9, null, undefined, 'x', 2.5]) assert.equal(applySize(spots, size), spots);
  // A taken spot at the end holds the whole list.
  const full = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B', open: true }, { id: 'c', name: 'C' }];
  assert.equal(applySize(full, 2).length, 3);
});

test('a saved size trims the roster the worker uses, claims included', async () => {
  const env = fakeEnv();
  const all = GROUPS.seasonticket.drafters.length;
  await saveSize(env, 'seasonticket', all - 1, 5);
  assert.deepEqual(await loadSize(env, 'seasonticket'), { size: all - 1, at: 5 });
  const drafters = await effectiveDrafters(env, 'seasonticket');
  assert.equal(drafters.length, all - 1);
  assert.equal(drafters.some(d => d.id === GROUPS.seasonticket.drafters[all - 1].id), false);

  // Fill every remaining open spot; the dropped one is never handed out.
  const open = drafters.filter(d => d.open).length;
  withClaims(env, Array.from({ length: open + 1 }, (_, i) => ({ id: `c${i}`, name: `Person ${i}`, email: `p${i}@x.co` })));
  for(let i = 0; i < open; i++) assert.ok(!(await confirmClaim(env, 'seasonticket', `c${i}`, `Person ${i}`)).error);
  assert.equal((await confirmClaim(env, 'seasonticket', `c${open}`, 'One too many')).error, 'full');

  const res = await handleRoster(new Request('https://w/roster?group=seasonticket'), env, 'seasonticket', {}, { json });
  assert.equal((await res.json()).size, all - 1);
  const none = await handleRoster(new Request('https://w/roster?group=thedraft'), fakeEnv(), 'thedraft', {}, { json });
  assert.equal((await none.json()).size, null);
});
