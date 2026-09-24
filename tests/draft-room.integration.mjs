// Drives a running `wrangler dev --var ADMIN_PASSWORD:testpw` (port 8787):
//   node tests/draft-room.integration.mjs
// Not part of `node --test` (needs the worker running); it uses a fresh room name each run.
import assert from 'node:assert/strict';

const BASE = 'localhost:8787';
const ROOM = 'it-' + Date.now().toString(36);
const ORIGIN = 'http://localhost:8934';

function connect(label){
  const ws = new WebSocket(`ws://${BASE}/draft/ws?room=${ROOM}`, { headers: { Origin: ORIGIN } });
  const frames = [];
  const waiters = [];
  ws.addEventListener('message', ev => {
    const f = JSON.parse(ev.data);
    frames.push(f);
    waiters.slice().forEach(w => { if(w.pred(f)){ waiters.splice(waiters.indexOf(w), 1); w.resolve(f); } });
  });
  const opened = new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', () => rej(new Error(label + ' failed to connect'))); });
  const next = (pred, ms = 3000) => {
    const hit = frames.find(pred);
    if(hit) return Promise.resolve(hit);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      waiters.push(w);
      setTimeout(() => reject(new Error(label + ' timed out waiting; frames: ' + JSON.stringify(frames.slice(-3)))), ms);
    });
  };
  let n = 0;
  const act = async (from, action) => {
    const id = ++n;
    ws.send(JSON.stringify({ type: 'action', id, from, action }));
    const reply = await next(f => (f.type === 'ok' || f.type === 'rejected') && f.id === id);
    frames.splice(frames.indexOf(reply), 1);
    return reply;
  };
  return { ws, frames, opened, next, act, close: () => ws.close() };
}

const team = (id, league) => ({ id, name: 'Team ' + id, league, abbr: id.toUpperCase(), color: '112233' });
const pool = [...['e1', 'e2', 'e3', 'e4', 'e5'].map(i => team(i, 'epl')), ...['n1', 'n2', 'n3', 'n4', 'n5'].map(i => team(i, 'nfl'))];

// origin check
const bad = new WebSocket(`ws://${BASE}/draft/ws?room=${ROOM}`, { headers: { Origin: 'https://evil.example' } });
await new Promise(res => { bad.addEventListener('error', res); bad.addEventListener('close', res); });
console.log('ok  foreign origin refused');

const boss = connect('boss'), fan = connect('fan');
await Promise.all([boss.opened, fan.opened]);
const hello = await boss.next(f => f.type === 'hello');
assert.equal(hello.state.phase, 'lobby');
assert.deepEqual(hello.pool, []);
console.log('ok  hello: fresh room is an empty lobby');

// commissioner gating
let r = await boss.act(null, { type: 'runLottery' });
assert.equal(r.error, 'forbidden');
boss.ws.send(JSON.stringify({ type: 'auth', password: 'wrong' }));
assert.equal((await boss.next(f => f.type === 'authed')).ok, false);
boss.frames.length = 0;
boss.ws.send(JSON.stringify({ type: 'auth', password: 'testpw' }));
assert.equal((await boss.next(f => f.type === 'authed')).ok, true);
console.log('ok  wrong password refused, right password accepted');

const D = ['josh', 'isaac', 'drew', 'douglas'];
assert.ok((await boss.act(null, { type: 'setConfig', drafters: D, caps: { epl: 1, nfl: 1 } })).type === 'ok');
assert.ok((await boss.act(null, { type: 'setPool', teams: pool })).type === 'ok');
const poolFrame = await fan.next(f => f.type === 'pool' && f.pool.length === 10);
assert.equal(poolFrame.pool[0].color, '#112233');
console.log('ok  setup broadcast to a second client (pool normalized)');

assert.ok((await boss.act(null, { type: 'runLottery' })).type === 'ok');
assert.ok((await boss.act(null, { type: 'startDraft' })).type === 'ok');
let st = (await fan.next(f => f.type === 'state' && f.state.phase === 'draft')).state;
assert.equal(st.order.length, 4);
assert.ok(Math.abs(st.clock.startedAt - Date.now()) < 5000, 'clock uses server time');
console.log('ok  lottery + start, order:', st.order.join(','));

const drafters = { };
D.forEach(d => { drafters[d] = connect(d); });
await Promise.all(D.map(d => drafters[d].opened));

// wrong turn is rejected, right turn accepted
const first = st.order[0], second = st.order[1];
r = await drafters[second].act(second, { type: 'pick', team: 'e1' });
assert.equal(r.error, 'not_your_turn');
r = await drafters[first].act(first, { type: 'pick', team: 'e1' });
assert.equal(r.type, 'ok');
st = (await fan.next(f => f.type === 'state' && Object.keys(f.state.picks).length === 1)).state;
assert.equal(st.picks[0].team, 'e1');
r = await drafters[second].act(second, { type: 'pick', team: 'e1' });
assert.equal(r.error, 'taken');
console.log('ok  turn enforcement + broadcast + taken');

// write-in isn't offered for pro leagues; queue round trip
r = await drafters[first].act(first, { type: 'addWriteIn', league: 'nfl', name: 'Toledo' });
assert.equal(r.error, 'bad_input');
drafters[first].ws.send(JSON.stringify({ type: 'queue', from: first, teams: ['n3', 'e4', 'n3'] }));
drafters[first].ws.send(JSON.stringify({ type: 'getQueue', from: first }));
assert.deepEqual((await drafters[first].next(f => f.type === 'queue')).teams, ['n3', 'e4']);
drafters[second].ws.send(JSON.stringify({ type: 'getQueue', from: second }));
assert.deepEqual((await drafters[second].next(f => f.type === 'queue')).teams, []);
console.log('ok  queues are per drafter and deduped');

// pause / undo by commissioner
assert.ok((await boss.act(null, { type: 'pause' })).type === 'ok');
r = await drafters[second].act(second, { type: 'pick', team: 'n1' });
assert.equal(r.error, 'paused');
assert.ok((await boss.act(null, { type: 'resume' })).type === 'ok');
const seqBeforeUndo = fan.frames.filter(f => f.type === 'state').pop().state.seq;
assert.ok((await boss.act(null, { type: 'undo' })).type === 'ok');
st = (await fan.next(f => f.type === 'state' && f.state.seq > seqBeforeUndo + 0 && Object.keys(f.state.picks).length === 0 && f.state.clock.running)).state;
console.log('ok  pause blocks picks, undo removes the last one');

// finish the draft; each step waits for a state newer (by seq) than the last one seen
let cur = fan.frames.filter(f => f.type === 'state').pop().state;
for(let i = 0; i < 8; i++){
  const picks = Object.keys(cur.picks).length;
  const n = 4, round = Math.floor(picks / n), pos = picks % n;
  const owner = cur.order[round % 2 === 0 ? pos : n - 1 - pos];
  const taken = new Set(Object.values(cur.picks).map(p => p.team));
  const mine = new Set(Object.values(cur.picks).filter(p => p.by === owner).map(p => pool.find(t => t.id === p.team).league));
  const pick = pool.find(t => !taken.has(t.id) && !mine.has(t.league));
  r = await drafters[owner].act(owner, { type: 'pick', team: pick.id });
  assert.equal(r.type, 'ok', JSON.stringify(r));
  const seq = cur.seq;
  cur = (await fan.next(f => f.type === 'state' && f.state.seq > seq)).state;
}
st = fan.frames.filter(f => f.type === 'state').pop().state;
assert.equal(st.phase, 'done');
const res = await (await fetch(`http://${BASE}/draft/result?room=${ROOM}`, { headers: { Origin: ORIGIN } })).json();
assert.equal(res.complete, true);
assert.equal(res.picks.length, 8);
assert.equal(res.picks[0].round, 1);
assert.equal(res.picks[7].round, 2);
assert.ok(res.picks.every(p => p.team && p.team.name.startsWith('Team ')));
console.log('ok  full draft completes; /draft/result returns 8 picks with team records');

// persistence: a brand-new connection sees the finished state
const late = connect('late'); await late.opened;
const h2 = await late.next(f => f.type === 'hello');
assert.equal(h2.state.phase, 'done');
assert.equal(Object.keys(h2.state.picks).length, 8);
assert.equal(h2.pool.length, 10);
console.log('ok  late joiner gets full persisted state');

const badRoom = await fetch(`http://${BASE}/draft/result?room=BAD%20ROOM`);
assert.equal(badRoom.status, 400);
console.log('ok  bad room name rejected');

[boss, fan, late, ...Object.values(drafters)].forEach(c => c.close());
console.log('\nALL PASSED (room ' + ROOM + ')');
process.exit(0);
