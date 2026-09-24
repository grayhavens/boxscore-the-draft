// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { reduce, createState, publicState, onTheClock } from '../js/draft-engine.js';
import {
  naturalOwner, ownerOf, pickLabel, currentSlot, swapSlots, shuffled, totalPicks,
  clockElapsedMs, newClock, pauseClock, resumeClock, availableTeams, writeInAbbr
} from '../js/draft-rules.js';

const D = ['a', 'b', 'c', 'd'];
const CAPS = { epl: 1, nfl: 1 };          // 2 rounds x 4 drafters = 8 picks
const COMM = { isCommissioner: true, actor: null, now: 1000 };
const as = (actor, now = 1000) => ({ isCommissioner: false, actor, now });

function team(id, league){ return { id, name: id.toUpperCase(), league, abbr: id.toUpperCase(), color: '#112233' }; }
const POOL = [
  ...['e1', 'e2', 'e3', 'e4', 'e5'].map(id => team(id, 'epl')),
  ...['n1', 'n2', 'n3', 'n4', 'n5'].map(id => team(id, 'nfl'))
];

function ok(state, action, ctx){
  const r = reduce(state, action, ctx);
  assert.ok(r.state, `expected ok for ${JSON.stringify(action)}, got ${JSON.stringify(r)}`);
  return r.state;
}
function err(state, action, ctx, code){
  const r = reduce(state, action, ctx);
  assert.equal(r.error, code, JSON.stringify(r));
  assert.equal(r.state, undefined);
}

function lobby(){
  let s = createState(D, { caps: CAPS });
  s = ok(s, { type: 'setPool', teams: POOL }, COMM);
  s = ok(s, { type: 'runLottery' }, { ...COMM, rand: () => 0 });
  return s;
}
function live(){ return ok(lobby(), { type: 'startDraft' }, COMM); }
function ownerNow(s){ return onTheClock(s).owner; }
function draftOne(s, teamId, now = 2000){ return ok(s, { type: 'pick', team: teamId }, as(ownerNow(s), now)); }

test('snake order and labels', () => {
  const order = ['a', 'b', 'c', 'd'];
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(s => naturalOwner(s, order)), ['a', 'b', 'c', 'd', 'd', 'c', 'b', 'a']);
  assert.equal(pickLabel(0, 4), '1.01');
  assert.equal(pickLabel(6, 4), '2.03');
  assert.equal(ownerOf(1, order, { 1: 'd' }), 'd');
});

test('the real config is 210 picks', () => {
  const s = createState(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  assert.equal(totalPicks(s.config), 210);
});

test('shuffle is a permutation and deterministic for a fixed rand', () => {
  const out = shuffled(D, () => 0);
  assert.deepEqual(out.slice().sort(), D);
  assert.deepEqual(shuffled(D, () => 0), out);
});

test('lobby validation', () => {
  const s = createState(D, { caps: CAPS });
  err(s, { type: 'setPool', teams: POOL }, as('a'), 'forbidden');
  err(s, { type: 'setPool', teams: [team('e1', 'zzz')] }, COMM, 'bad_input');
  err(s, { type: 'setPool', teams: [team('e1', 'epl'), team('e1', 'epl')] }, COMM, 'bad_input');
  err(s, { type: 'startDraft' }, COMM, 'no_order');
  const withPool = ok(s, { type: 'setPool', teams: POOL.slice(0, 6) }, COMM);
  const drawn = ok(withPool, { type: 'runLottery' }, COMM);
  const r = reduce(drawn, { type: 'startDraft' }, COMM);
  assert.equal(r.error, 'pool_short');           // only 5 epl / 1 nfl for 4 drafters
  assert.equal(r.detail.league, 'nfl');
  assert.equal(reduce(s, { type: 'nope' }, COMM).error, 'bad_input');
  assert.equal(reduce(s, { type: 'pick', team: 'e1' }, as('stranger')).error, 'forbidden');
});

test('changing structure clears the lottery and stale-league teams', () => {
  let s = lobby();
  s = ok(s, { type: 'setConfig', caps: { epl: 1 } }, COMM);
  assert.equal(s.order, null);
  assert.ok(s.pool.every(t => t.league === 'epl'));
  s = ok(s, { type: 'setConfig', clockSeconds: 45 }, COMM);
  assert.equal(s.config.clockSeconds, 45);
  err(s, { type: 'setConfig', clockSeconds: 5 }, COMM, 'bad_input');
});

test('start, pick, and turn enforcement', () => {
  let s = live();
  assert.equal(s.phase, 'draft');
  assert.equal(currentSlot(s.picks, 8), 0);
  const first = ownerNow(s);
  const other = D.find(d => d !== first);
  err(s, { type: 'pick', team: 'e1' }, as(other), 'not_your_turn');
  err(s, { type: 'pick', team: 'nope' }, as(first), 'unknown_team');
  err(s, { type: 'pick', team: 'e1', slot: 3 }, as(first), 'stale');
  s = draftOne(s, 'e1');
  assert.equal(s.picks[0].team, 'e1');
  assert.equal(s.picks[0].by, first);
  assert.equal(s.clock.startedAt, 2000);          // clock restarted for the next pick
  err(s, { type: 'pick', team: 'e1' }, as(ownerNow(s)), 'taken');
});

test('league caps are enforced per drafter', () => {
  let s = live();
  const first = ownerNow(s);
  s = draftOne(s, 'e1');                             // slot 0: first takes an EPL team
  for(let i = 0; i < 6; i++) s = draftOne(s, availableTeams(s, ownerNow(s))[0].id);
  // slot 7 is the snake's turn-around: first picks again, and EPL is now full for them
  assert.equal(ownerNow(s), first);
  err(s, { type: 'pick', team: 'e5' }, as(first), 'league_full');
  s = draftOne(s, 'n5');
  assert.equal(s.phase, 'done');
  assert.equal(s.clock.running, false);
  assert.equal(onTheClock(s), null);
  err(s, { type: 'pick', team: 'n4' }, as(first), 'not_live');
});

test('a full draft leaves every roster exactly at its caps', () => {
  let s = live();
  const epl = ['e1', 'e2', 'e3', 'e4'], nfl = ['n1', 'n2', 'n3', 'n4'];
  while(s.phase === 'draft'){
    const owner = ownerNow(s);
    const avail = availableTeams(s, owner);
    s = draftOne(s, avail[0].id);
  }
  assert.equal(Object.keys(s.picks).length, 8);
  D.forEach(d => {
    const mine = Object.entries(s.picks).filter(([, p]) => p.by === d).map(([, p]) => s.pool.find(t => t.id === p.team).league).sort();
    assert.deepEqual(mine, ['epl', 'nfl']);
  });
});

test('commissioner proxy pick is recorded against the slot owner', () => {
  let s = live();
  const owner = ownerNow(s);
  s = ok(s, { type: 'pick', team: 'e1' }, { ...COMM, now: 1500 });
  assert.equal(s.picks[0].by, owner);
  assert.equal(s.picks[0].proxy, true);
});

test('pause stops picks and keeps elapsed time; resume continues it', () => {
  let s = live();                                   // clock started at 1000
  s = ok(s, { type: 'pause' }, { ...COMM, now: 4000 });
  assert.equal(clockElapsedMs(s.clock, 9999), 3000);
  err(s, { type: 'pick', team: 'e1' }, as(ownerNow(s), 5000), 'paused');
  err(s, { type: 'pause' }, COMM, 'unchanged');
  s = ok(s, { type: 'resume' }, { ...COMM, now: 6000 });
  assert.equal(clockElapsedMs(s.clock, 7000), 4000);
  err(s, { type: 'resume' }, COMM, 'unchanged');
});

test('undo removes the most recent pick and reopens the draft', () => {
  let s = live();
  err(s, { type: 'undo' }, COMM, 'nothing_to_undo');
  s = draftOne(s, 'e1'); s = draftOne(s, 'n1');
  s = ok(s, { type: 'undo' }, { ...COMM, now: 5000 });
  assert.equal(Object.keys(s.picks).length, 1);
  assert.equal(currentSlot(s.picks, 8), 1);
  assert.equal(s.clock.startedAt, 5000);
  err(s, { type: 'undo' }, as('a'), 'forbidden');
});

test('undo after completion goes back to live', () => {
  let s = live();
  while(s.phase === 'draft') s = draftOne(s, availableTeams(s, ownerNow(s))[0].id);
  assert.equal(s.phase, 'done');
  s = ok(s, { type: 'undo' }, COMM);
  assert.equal(s.phase, 'draft');
  assert.equal(s.clock.running, true);
});

test('removing an earlier pick creates a make-up slot, then the draft continues', () => {
  let s = live();
  s = draftOne(s, 'e1'); s = draftOne(s, 'e2'); s = draftOne(s, 'e3');
  const owner1 = s.picks[1].by;
  s = ok(s, { type: 'removePick', slot: 1 }, COMM);
  assert.equal(currentSlot(s.picks, 8), 1);
  assert.equal(onTheClock(s).owner, owner1);
  s = draftOne(s, 'n1');                            // make-up pick
  assert.equal(currentSlot(s.picks, 8), 3);         // back to where it was
  err(s, { type: 'removePick', slot: 6 }, COMM, 'empty_slot');
  err(s, { type: 'removePick', slot: 99 }, COMM, 'bad_slot');
});

test('removing a pick while paused stays paused', () => {
  let s = live();
  s = draftOne(s, 'e1');
  s = ok(s, { type: 'pause' }, COMM);
  s = ok(s, { type: 'removePick', slot: 0 }, COMM);
  assert.equal(s.clock.running, false);
});

test('editPick swaps the team, re-checking taken and caps', () => {
  let s = live();
  s = draftOne(s, 'e1'); s = draftOne(s, 'n1'); s = draftOne(s, 'e2');
  err(s, { type: 'editPick', slot: 0, team: 'e1' }, COMM, 'unchanged');
  err(s, { type: 'editPick', slot: 0, team: 'e2' }, COMM, 'taken');
  err(s, { type: 'editPick', slot: 0, team: 'zz' }, COMM, 'unknown_team');
  err(s, { type: 'editPick', slot: 5, team: 'e5' }, COMM, 'empty_slot');
  const r = ok(s, { type: 'editPick', slot: 0, team: 'e5' }, COMM);
  assert.equal(r.picks[0].team, 'e5');
  assert.equal(r.picks[0].edited, true);
  // the replaced team is free again
  const back = draftOne(r, 'e1');
  assert.ok(back);
});

test('editPick respects the owner cap (excluding the pick being replaced)', () => {
  let s = live();
  s = draftOne(s, 'e1'); s = draftOne(s, 'e2'); s = draftOne(s, 'e3'); s = draftOne(s, 'e4');
  // slot 0 owner has epl; swapping to another epl is fine (replaces itself)
  ok(s, { type: 'editPick', slot: 0, team: 'e5' }, COMM);
  // swapping to nfl is fine too
  ok(s, { type: 'editPick', slot: 0, team: 'n1' }, COMM);
});

test('trades swap future slots and the new owner is who may pick', () => {
  let s = lobby();
  s = ok(s, { type: 'trade', a: 0, b: 5 }, COMM);
  const o0 = naturalOwner(0, s.order), o5 = naturalOwner(5, s.order);
  assert.equal(ownerOf(0, s.order, s.overrides), o5);
  assert.equal(ownerOf(5, s.order, s.overrides), o0);
  s = ok(s, { type: 'startDraft' }, COMM);
  assert.equal(onTheClock(s).owner, o5);
  err(s, { type: 'pick', team: 'e1' }, as(o0), 'not_your_turn');
  s = ok(s, { type: 'pick', team: 'e1' }, as(o5));
  err(s, { type: 'trade', a: 0, b: 6 }, COMM, 'bad_slot');   // slot 0 already picked
  err(s, { type: 'trade', a: 2, b: 2 }, COMM, 'bad_slot');
});

test('a swap and its reversal leave no overrides', () => {
  const order = ['a', 'b', 'c', 'd'];
  const once = swapSlots(order, {}, 1, 6);
  assert.deepEqual(swapSlots(order, once, 1, 6), {});
});

test('a traded slot counts toward the new owner’s caps', () => {
  let s = lobby();
  // hand slot 0 to whoever owns slot 4 (their round-2 pick): they now hold two picks
  // in a row-ish and share the same roster cap across both.
  s = ok(s, { type: 'trade', a: 0, b: 4 }, COMM);
  const buyer = ownerOf(0, s.order, s.overrides);
  assert.equal(buyer, naturalOwner(4, s.order));
  assert.equal(ownerOf(4, s.order, s.overrides), naturalOwner(0, s.order));
  s = ok(s, { type: 'startDraft' }, COMM);
  s = ok(s, { type: 'pick', team: 'e1' }, as(buyer));
  for(let slot = 1; slot < 4; slot++) s = draftOne(s, availableTeams(s, ownerNow(s))[0].id);
  // slot 4 is now the original slot-0 owner's; the buyer's next slot is later
  assert.notEqual(ownerNow(s), buyer);
});

test('write-ins: only college leagues, validated, deduped', () => {
  const caps = { cfb: 1, nfl: 1 };
  let s = createState(D, { caps });
  const pool = [
    ...['c1', 'c2', 'c3', 'c4'].map(id => ({ ...team(id, 'cfb'), name: 'Ohio State ' + id })),
    ...['n1', 'n2', 'n3', 'n4'].map(id => team(id, 'nfl'))
  ];
  s = ok(s, { type: 'setPool', teams: pool }, COMM);
  s = ok(s, { type: 'runLottery' }, COMM);
  err(s, { type: 'addWriteIn', league: 'cfb', name: 'Toledo' }, as('a'), 'bad_phase');   // lobby
  s = ok(s, { type: 'startDraft' }, COMM);
  err(s, { type: 'addWriteIn', league: 'nfl', name: 'Toledo' }, as('a'), 'bad_input');
  err(s, { type: 'addWriteIn', league: 'cfb', name: 'ab' }, as('a'), 'bad_input');
  err(s, { type: 'addWriteIn', league: 'cfb', name: '<b>x</b>' }, as('a'), 'bad_input');
  s = ok(s, { type: 'addWriteIn', league: 'cfb', name: '  Western   Michigan ' }, as('a'));
  const wi = s.pool.find(t => t.custom);
  assert.equal(wi.id, 'cfb_wi_western_michigan');
  assert.equal(wi.name, 'Western Michigan');
  assert.equal(wi.abbr, 'WM');
  assert.equal(wi.color, '#3A3B42');
  const dup = reduce(s, { type: 'addWriteIn', league: 'cfb', name: 'western michigan' }, as('b'));
  assert.equal(dup.error, 'exists');
  assert.equal(dup.detail, 'cfb_wi_western_michigan');
  const dupPool = reduce(s, { type: 'addWriteIn', league: 'cfb', name: 'ohio state c1' }, as('b'));
  assert.equal(dupPool.error, 'exists');
  // it drafts like any team and counts toward the cap
  const owner = ownerNow(s);
  s = ok(s, { type: 'pick', team: wi.id }, as(owner));
  s = ok(s, { type: 'reset' }, COMM);
  assert.equal(s.pool.some(t => t.custom), false);
  assert.equal(s.phase, 'lobby');
  assert.equal(s.order, null);
  assert.deepEqual(s.picks, {});
});

test('write-in abbreviations', () => {
  assert.equal(writeInAbbr('Western Michigan'), 'WM');
  assert.equal(writeInAbbr('Toledo'), 'TOLE');
  assert.equal(writeInAbbr('North Dakota State Bison Team'), 'NDSB');
});

test('reduce never mutates its input and publicState omits the pool', () => {
  const s = live();
  const before = JSON.stringify(s);
  reduce(s, { type: 'pick', team: 'e1' }, as(ownerNow(s)));
  reduce(s, { type: 'pick', team: 'nope' }, as(ownerNow(s)));
  assert.equal(JSON.stringify(s), before);
  const pub = publicState(s);
  assert.equal(pub.pool, undefined);
  assert.equal(pub.poolSize, POOL.length);
});

test('clock math', () => {
  const c = newClock(100);
  assert.equal(clockElapsedMs(c, 350), 250);
  const p = pauseClock(c, 350);
  assert.equal(clockElapsedMs(p, 99999), 250);
  assert.equal(clockElapsedMs(resumeClock(p, 1000), 1100), 350);
});

test('30 random full-size drafts always finish with exact rosters (no drafter is ever stuck)', () => {
  const drafters = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const supply = { epl: 20, nfl: 32, nba: 30, nhl: 32, mlb: 30, wnba: 15, cfb: 40, mcbb: 40 };   // real pool sizes; epl/nba/mlb are exactly 2/3/3 x 10
  const pool = Object.entries(supply).flatMap(([lg, n]) => Array.from({ length: n }, (_, i) => team(`${lg}${i}`, lg)));
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for(let run = 0; run < 30; run++){
    let s = createState(drafters);
    s = ok(s, { type: 'setPool', teams: pool }, COMM);
    s = ok(s, { type: 'runLottery' }, { ...COMM, rand });
    s = ok(s, { type: 'startDraft' }, COMM);
    while(s.phase === 'draft'){
      const owner = onTheClock(s).owner;
      const avail = availableTeams(s, owner);
      assert.ok(avail.length > 0, `drafter ${owner} stuck at slot ${onTheClock(s).slot} in run ${run}`);
      s = ok(s, { type: 'pick', team: avail[Math.floor(rand() * avail.length)].id }, as(owner));
    }
    assert.equal(Object.keys(s.picks).length, 210);
    drafters.forEach(d => {
      const counts = {};
      Object.values(s.picks).filter(p => p.by === d).forEach(p => { const lg = s.pool.find(t => t.id === p.team).league; counts[lg] = (counts[lg] || 0) + 1; });
      assert.deepEqual(counts, { epl: 2, nfl: 3, nba: 3, nhl: 3, mlb: 3, wnba: 1, cfb: 3, mcbb: 3 });
    });
  }
});

test('setPool keeps a team\'s rank (the UI orders the list by it)', () => {
  let s = createState(D, { caps: CAPS });
  s = ok(s, { type: 'setPool', teams: [{ ...team('e1', 'epl'), rank: 3 }, { ...team('e2', 'epl'), rank: 0 }, { ...team('e3', 'epl'), rank: 'x' }] }, COMM);
  assert.deepEqual(s.pool.map(t => t.rank), [3, undefined, undefined]);
});
