#!/usr/bin/env node
/* ============================================================
   Dress rehearsal for the draft room: runs a whole 210-pick draft
   against a real worker, with every drafter as its own WebSocket
   client (so the per-drafter path is exercised, not just a commissioner
   shortcut), deliberate chaos in the middle, and an invariant check at
   the end. Draft day can't be redone — run this first, and again after
   any change to the room.

     node tools/rehearse-draft.mjs                       # local `wrangler dev`, moderate chaos
     node tools/rehearse-draft.mjs --chaos 2             # everything, including reconnects
     node tools/rehearse-draft.mjs --chaos 0             # a clean run
     node tools/rehearse-draft.mjs --human josh          # bots skip Josh: open the printed URL and pick yourself
     node tools/rehearse-draft.mjs --base https://<worker> --origin https://<site> --password <admin>

   Options
     --base <url>       the worker (default http://localhost:8787, i.e. `cd worker && npx wrangler dev --var ADMIN_PASSWORD:testpw`)
     --origin <url>     Origin header to send; must be one the worker allows (default http://localhost:8934)
     --password <pw>    ADMIN_PASSWORD (default: $ADMIN_PASSWORD, or "testpw" against localhost)
     --room <name>      throwaway room to use (default rehearsal-<timestamp>); never use "main"
     --chaos 0|1|2      how much to go wrong (default 1)
     --human <drafter>  leave that drafter's picks to a human at the printed URL
     --delay <ms>       think time per bot pick (default 10)
     --seed <n>         make the run repeatable
     --no-export        skip the export dry-run at the end
     --preflight        only run the smoke checks (connect, auth, result endpoint), then exit

   Exits non-zero if any check fails. Rooms are throwaway; the run
   leaves its room behind so you can inspect it (?view=draft&room=<name>).
   ============================================================ */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { onTheClock } from '../js/draft-engine.js';
import { availableTeams, ownerOf, totalPicks, pickLabel } from '../js/draft-rules.js';
import { buildDraftPool } from '../js/draft-pool.js';
import { DRAFT_TEAMS } from '../js/data.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ---- args ----
const argv = process.argv.slice(2);
const opt = {};
const flags = new Set();
for(let i = 0; i < argv.length; i++){
  if(!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  if(['no-export', 'preflight'].includes(k)) flags.add(k); else opt[k] = argv[++i];
}
const BASE = (opt.base || 'http://localhost:8787').replace(/\/$/, '');
const isLocal = /localhost|127\.0\.0\.1/.test(BASE);
const ORIGIN = opt.origin || 'http://localhost:8934';
const PASSWORD = opt.password || process.env.ADMIN_PASSWORD || (isLocal ? 'testpw' : null);
const ROOM = opt.room || 'rehearsal-' + Date.now().toString(36);
const CHAOS = Number(opt.chaos ?? 1);
const HUMAN = opt.human || null;
const DELAY = Number(opt.delay ?? 10);
if(!PASSWORD){ console.error('An admin password is required for a non-local worker (--password or $ADMIN_PASSWORD).'); process.exit(2); }
if(ROOM === 'main'){ console.error('Refusing to rehearse in the real room "main".'); process.exit(2); }
if(!/^[a-z0-9-]{1,32}$/.test(ROOM)){ console.error('Room names are a-z, 0-9 and dashes, up to 32 characters.'); process.exit(2); }

let seed = Number(opt.seed ?? Date.now() % 1e9);
const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pickOne = arr => arr[Math.floor(rand() * arr.length)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- reporting ----
const checks = [];
const log = [];
function check(name, ok, detail = ''){
  checks.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
}
const tally = {};                       // benign/unexpected reply counts, by code
const bump = (k) => { tally[k] = (tally[k] || 0) + 1; };

// ---- a room client ----
class Client {
  constructor(label){
    this.label = label;
    this.state = null;
    this.pool = [];
    this.seq = 0;
    this.commissioner = false;
    this.nextId = 1;
    this.pending = new Map();
    this.onState = null;
    this.authWaiter = null;
  }
  wsUrl(){ return `${BASE.replace(/^http/, 'ws')}/draft/ws?room=${ROOM}`; }
  connect(){
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl(), { headers: { Origin: ORIGIN } });
      this.ws = ws;
      let opened = false;
      ws.addEventListener('error', () => { if(!opened) reject(new Error(`${this.label}: could not connect to ${this.wsUrl()}`)); });
      ws.addEventListener('close', () => { for(const p of this.pending.values()) p({ ok: false, error: 'offline' }); this.pending.clear(); });
      ws.addEventListener('message', ev => {
        const f = JSON.parse(ev.data);
        if(f.type === 'hello'){ opened = true; this.state = f.state; this.pool = f.pool; this.seq = f.state.seq; resolve(this); }
        else if(f.type === 'state'){ this.state = f.state; this.seq = f.state.seq; if(this.onState) this.onState(); }
        else if(f.type === 'pool'){ this.pool = f.pool; }
        else if(f.type === 'authed'){ this.commissioner = f.ok; if(this.authWaiter){ this.authWaiter(f.ok); this.authWaiter = null; } }
        else if(f.type === 'ok' || f.type === 'rejected'){
          const done = this.pending.get(f.id);
          if(done){ this.pending.delete(f.id); done(f.type === 'ok' ? { ok: true } : { ok: false, error: f.error, detail: f.detail }); }
        } else if(f.type === 'error'){ bump('frame-error:' + f.reason); }
      });
    });
  }
  auth(){
    return new Promise(resolve => { this.authWaiter = resolve; this.ws.send(JSON.stringify({ type: 'auth', password: PASSWORD })); });
  }
  act(from, action){
    return new Promise(resolve => {
      const id = this.nextId++;
      const timer = setTimeout(() => { this.pending.delete(id); resolve({ ok: false, error: 'timeout' }); }, 8000);
      this.pending.set(id, r => { clearTimeout(timer); resolve(r); });
      try { this.ws.send(JSON.stringify({ type: 'action', id, from, action })); }
      catch (e){ this.pending.delete(id); clearTimeout(timer); resolve({ ok: false, error: 'offline' }); }
    });
  }
  full(){ return this.state ? { ...this.state, pool: this.pool } : null; }
  close(){ try { this.ws.close(); } catch (e){} }
}

async function untilSettled(client, pred, ms = 5000){
  const start = Date.now();
  while(Date.now() - start < ms){ if(pred(client.full())) return true; await sleep(20); }
  return false;
}

// ---- 0. preflight: the smoke test worth running on draft morning ----
async function preflight(){
  console.log(`\nWorker ${BASE}   room ${ROOM}   origin ${ORIGIN}\n`);
  const bad = await fetch(`${BASE}/draft/result?room=BAD%20ROOM`).then(r => r.status).catch(() => 0);
  check('worker reachable, rejects a malformed room name', bad === 400, `HTTP ${bad}`);
  const boss = await new Client('preflight').connect();
  check('WebSocket connects and the room says hello', !!boss.state);
  const denied = await new Promise(resolve => { boss.authWaiter = resolve; boss.ws.send(JSON.stringify({ type: 'auth', password: PASSWORD + '-wrong' })); });
  check('a wrong admin password is refused', denied === false);
  const ok = await boss.auth();
  check('the admin password is accepted (ADMIN_PASSWORD is set)', ok === true);
  const res = await fetch(`${BASE}/draft/result?room=${ROOM}`, { headers: { Origin: ORIGIN } });
  check('/draft/result answers', res.ok, `HTTP ${res.status}`);
  boss.close();
  return checks.every(c => c.ok);
}

// ---- the drafters ----
function makeBot(id, boss){
  const bot = new Client(id);
  bot.thinking = false;
  const act = async () => {
    const s = bot.full();
    if(!s || s.phase !== 'draft' || !s.clock.running || bot.thinking || bot.paused) return;
    const cur = onTheClock(s);
    if(!cur || cur.owner !== id) return;
    bot.thinking = true;
    await sleep(DELAY + rand() * DELAY);
    const fresh = bot.full();
    const now = fresh && onTheClock(fresh);
    bot.thinking = false;
    if(!now || now.owner !== id || !fresh.clock.running) return;
    const options = availableTeams(fresh, id);
    if(!options.length){ check(`${id} always has a legal pick`, false, `stuck at slot ${now.slot}`); return; }
    const team = options[Math.floor(rand() * Math.min(options.length, 6))];
    const r = await bot.act(id, { type: 'pick', team: team.id, slot: now.slot });
    if(!r.ok){
      // Races with chaos (a pause, an undo, a trade) are expected; anything else is a finding.
      if(['stale', 'paused', 'not_your_turn', 'taken', 'not_live', 'offline'].includes(r.error)) bump('benign:' + r.error);
      else { bump('UNEXPECTED:' + r.error); console.log(`  ! ${id} pick rejected: ${r.error} ${JSON.stringify(r.detail || '')}`); }
    } else bump('picks-ok');
    setTimeout(act, 0);
  };
  bot.onState = act;
  bot.kick = act;
  return bot;
}

// ---- chaos ----
const chaosLog = [];
function record(name, ok, detail = ''){ chaosLog.push({ name, ok, detail }); check('chaos: ' + name, ok, detail); }

async function chaos(boss, bots, atPick){
  const s = boss.full();
  const n = s.config.drafters.length;
  const total = totalPicks(s.config);
  const cur = onTheClock(s);
  if(!cur) return;
  const others = s.config.drafters.filter(d => d !== cur.owner);

  switch(atPick.event){
    case 'pause': {
      const r1 = await boss.act(null, { type: 'pause' });
      if(!r1.ok && r1.error !== 'unchanged') return record('pause', false, JSON.stringify(r1));
      await sleep(300);
      const s2 = boss.full();
      const owner = onTheClock(s2) && onTheClock(s2).owner;
      const bot = bots[owner];
      const blocked = bot && bot.ws && await bot.act(owner, { type: 'pick', team: availableTeams(s2, owner)[0].id });
      record('a pick is refused while paused', !!blocked && blocked.error === 'paused', blocked ? blocked.error : 'no bot');
      await sleep(600);
      const r2 = await boss.act(null, { type: 'resume' });
      record('resume works', r2.ok, r2.error || '');
      Object.values(bots).forEach(b => b.kick && b.kick());
      return;
    }
    case 'undo': {
      const before = Object.keys(boss.full().picks).length;
      const r = await boss.act(null, { type: 'undo' });
      record('undo the latest pick', r.ok, r.error || `had ${before} picks`);
      return;
    }
    case 'removePick': {
      const filled = Object.keys(s.picks).map(Number);
      if(filled.length < 4) return;
      const slot = pickOne(filled.slice(0, filled.length - 1));
      const r = await boss.act(null, { type: 'removePick', slot });
      record(`remove pick ${pickLabel(slot, n)} (make-up pick follows)`, r.ok || r.error === 'empty_slot', r.error || '');
      return;
    }
    case 'trade': {
      const open = [];
      for(let slot = 0; slot < total; slot++) if(!s.picks[slot]) open.push(slot);
      const a = open[Math.min(open.length - 1, 5)];
      const b = open.find(x => ownerOf(x, s.order, s.overrides) !== ownerOf(a, s.order, s.overrides) && x > a + 3);
      if(a === undefined || b === undefined) return;
      const before = [ownerOf(a, s.order, s.overrides), ownerOf(b, s.order, s.overrides)];
      const r = await boss.act(null, { type: 'trade', a, b });
      if(r.ok){
        await untilSettled(boss, f => f.overrides[a] !== undefined || f.overrides[b] !== undefined || f.picks[a] || f.picks[b]);
        const f = boss.full();
        const swapped = f.picks[a] || f.picks[b] || (ownerOf(a, f.order, f.overrides) === before[1] && ownerOf(b, f.order, f.overrides) === before[0]);
        record(`trade ${pickLabel(a, n)} <-> ${pickLabel(b, n)}`, !!swapped, before.join('/'));
      } else record(`trade ${pickLabel(a, n)} <-> ${pickLabel(b, n)}`, ['bad_slot'].includes(r.error), r.error);
      return;
    }
    case 'wrongTurn': {
      const intruder = pickOne(others);
      const bot = bots[intruder];
      if(!bot) return;
      const maxN = Math.max(0, ...Object.values(boss.full().picks).map(p => p.n));
      const r = await bot.act(intruder, { type: 'pick', team: availableTeams(boss.full(), intruder)[0].id });
      if(!r.ok) return record('a pick out of turn is refused', true, r.error);
      // Accepted: legitimate only if the clock had just moved to them, in which case it is an
      // ordinary pick. A non-commissioner picking for someone else would be recorded with the
      // `proxy` flag — that is the bug this probe exists to catch.
      await sleep(200);
      const newer = Object.values(boss.full().picks).filter(p => p.n > maxN);
      const smuggled = newer.some(p => p.proxy);
      bump('out-of-turn-accepted (clock had moved)');
      return record('a pick out of turn is refused', !smuggled, smuggled ? 'accepted as a proxy pick by a non-commissioner!' : 'the clock had moved to them');
    }
    case 'doubleSubmit': {
      const owner = cur.owner;
      const bot = bots[owner];
      if(!bot) return;
      bot.paused = true;
      const team = availableTeams(boss.full(), owner)[0];
      const slot = cur.slot;
      const [r1, r2] = await Promise.all([
        bot.act(owner, { type: 'pick', team: team.id, slot }),
        bot.act(owner, { type: 'pick', team: team.id, slot })
      ]);
      bot.paused = false;
      record('a double-tapped pick lands exactly once', [r1, r2].filter(r => r.ok).length <= 1, `${r1.ok ? 'ok' : r1.error} / ${r2.ok ? 'ok' : r2.error}`);
      Object.values(bots).forEach(b => b.kick && b.kick());
      return;
    }
    case 'proxy': {
      // Hold the on-the-clock bot so nothing else moves, then draft for them as the commissioner.
      const owner = cur.owner;
      const bot = bots[owner];
      if(bot) bot.paused = true;
      await sleep(80);
      const f = boss.full();
      const now = onTheClock(f);
      let r = { ok: false, error: 'not_live' };
      if(now && f.clock.running){
        const team = availableTeams(f, now.owner)[0];
        r = await boss.act(null, { type: 'pick', team: team.id, slot: now.slot });
        if(r.ok){ bump('proxy-picks-sent'); await untilSettled(boss, g => g.picks[now.slot]); }
      }
      if(bot){ bot.paused = false; }
      Object.values(bots).forEach(b => b.kick && b.kick());
      const landed = r.ok && boss.full().picks[now.slot];
      record('commissioner pick-for-someone lands on the owner, flagged as a proxy', r.ok && !!landed && landed.proxy === true && landed.by === now.owner, r.error || '');
      return;
    }
    case 'writeIn': {
      const owner = cur.owner;
      const name = pickOne(['Western Kentucky', 'Kent State', 'Sam Houston', 'Liberty', 'Toledo']) + ' ' + Math.floor(rand() * 90 + 10);
      const league = pickOne(['cfb', 'mcbb']);
      const r = await boss.act(owner, { type: 'addWriteIn', league, name });
      record(`write-in "${name}" (${league})`, r.ok, r.error || '');
      return;
    }
    case 'lateSetPool': {
      const r = await boss.act(null, { type: 'setPool', teams: [] });
      record('the pool can\'t be replaced mid-draft', r.error === 'bad_phase', r.error || 'accepted!');
      return;
    }
    case 'reconnect': {
      const victims = others.slice(0, 2);
      for(const id of victims){
        const old = bots[id];
        const lastSeq = old.seq;
        old.ws.close();
        old.paused = true;
      }
      await sleep(1200);
      for(const id of victims){
        const fresh = makeBot(id, boss);
        await fresh.connect();
        record(`${id} reconnects and gets the current state`, fresh.state.seq >= bots[id].seq && !!fresh.state.order, `seq ${fresh.state.seq}`);
        bots[id] = fresh;
        fresh.kick();
      }
      return;
    }
    default:
  }
}

const PLAN = [
  { at: 12, event: 'lateSetPool', level: 1 },
  { at: 20, event: 'pause', level: 1 },
  { at: 34, event: 'doubleSubmit', level: 1 },
  { at: 48, event: 'undo', level: 1 },
  { at: 62, event: 'removePick', level: 2 },
  { at: 75, event: 'trade', level: 2 },
  { at: 88, event: 'reconnect', level: 2 },
  { at: 100, event: 'proxy', level: 2 },
  { at: 112, event: 'wrongTurn', level: 1 },
  { at: 125, event: 'writeIn', level: 2 },
  { at: 140, event: 'pause', level: 2 },
  { at: 155, event: 'undo', level: 2 },
  { at: 170, event: 'trade', level: 2 },
  { at: 185, event: 'doubleSubmit', level: 2 },
  { at: 198, event: 'removePick', level: 2 }
];

// ---- the run ----
async function main(){
  const smokeOk = await preflight();
  if(!smokeOk){ console.log('\nPreflight failed — not starting the rehearsal.'); process.exit(1); }
  if(flags.has('preflight')){ console.log('\nPreflight passed.'); process.exit(0); }

  const boss = await new Client('commissioner').connect();
  await boss.auth();
  const t0 = Date.now();

  console.log('\nSetting up the room…');
  const pool = buildDraftPool();
  const drafters = DRAFT_TEAMS.map(d => d.id);
  let r = await boss.act(null, { type: 'setConfig', drafters });
  check('configure the ten drafters', r.ok, r.error || '');
  r = await boss.act(null, { type: 'setPool', teams: pool });
  check(`load the team pool (${pool.length} teams)`, r.ok, r.error || '');
  r = await boss.act(null, { type: 'runLottery' });
  check('run the lottery', r.ok, r.error || '');
  await untilSettled(boss, f => f.order);
  r = await boss.act(null, { type: 'startDraft' });
  check('start the draft (the pool covers every roster cap)', r.ok, r.error ? `${r.error} ${JSON.stringify(r.detail || '')}` : '');
  if(!r.ok) process.exit(1);
  await untilSettled(boss, f => f.phase === 'draft');
  const order = boss.full().order;
  console.log('Draft order: ' + order.join(', '));

  const bots = {};
  for(const id of drafters){
    if(id === HUMAN) continue;
    bots[id] = makeBot(id, boss);
    await bots[id].connect();
  }
  if(HUMAN){
    console.log(`\nYou are ${HUMAN}. Open: ${ORIGIN}/index.html?view=draft&room=${ROOM}   (profile: ${HUMAN})\nThe bots wait for you on your turn.\n`);
  }
  Object.values(bots).forEach(b => b.kick());

  // Chaos runs on its own loop, triggered as the pick count passes each mark.
  const plan = PLAN.filter(p => p.level <= CHAOS).sort((a, b) => a.at - b.at);
  let planIdx = 0;
  const total = totalPicks(boss.full().config);
  let lastCount = -1, stuckSince = Date.now();
  while(true){
    const s = boss.full();
    const count = Object.keys(s.picks).length;
    if(s.phase === 'done') break;
    if(count !== lastCount){ lastCount = count; stuckSince = Date.now(); }
    const idleLimit = HUMAN ? 10 * 60 * 1000 : 20000;
    if(Date.now() - stuckSince > idleLimit && s.clock.running){
      check('the draft keeps moving', false, `no progress for ${Math.round((Date.now() - stuckSince) / 1000)}s at pick ${count + 1}`);
      break;
    }
    if(planIdx < plan.length && count >= plan[planIdx].at){
      const step = plan[planIdx++];
      await chaos(boss, bots, step);
    }
    await sleep(25);
    if(count % 30 === 0 && count) process.stdout.write(`  … ${count}/${total}\r`);
  }
  await sleep(600);

  // ---- invariants ----
  console.log('\nChecking the finished draft…');
  const final = boss.full();
  check('the draft finished', final.phase === 'done', final.phase);
  check(`all ${total} picks were made`, Object.keys(final.picks).length === total, `${Object.keys(final.picks).length}`);

  const caps = final.config.caps;
  let rosterOk = true, rosterDetail = '';
  for(const d of drafters){
    const counts = {};
    Object.values(final.picks).filter(p => p.by === d).forEach(p => { const t = final.pool.find(x => x.id === p.team); counts[t.league] = (counts[t.league] || 0) + 1; });
    for(const lg of Object.keys(caps)) if((counts[lg] || 0) !== caps[lg]){ rosterOk = false; rosterDetail = `${d} ${lg}: ${counts[lg] || 0}/${caps[lg]}`; }
  }
  check('every roster is exactly at its league caps', rosterOk, rosterDetail);
  const teamIds = Object.values(final.picks).map(p => p.team);
  check('no team was drafted twice', new Set(teamIds).size === teamIds.length);
  const wrongOwner = Object.keys(final.picks).filter(k => final.picks[k].by !== ownerOf(Number(k), final.order, final.overrides));
  check('every pick landed on its slot owner', wrongOwner.length === 0, wrongOwner.join(','));
  const proxies = Object.values(final.picks).filter(p => p.proxy).length;
  check('only the commissioner made pick-for-someone picks', proxies <= (tally['proxy-picks-sent'] || 0), `${proxies} in the result, ${tally['proxy-picks-sent'] || 0} sent`);
  check('no unexpected rejections', !Object.keys(tally).some(k => k.startsWith('UNEXPECTED')), Object.keys(tally).filter(k => k.startsWith('UNEXPECTED')).join(', '));

  const result = await (await fetch(`${BASE}/draft/result?room=${ROOM}`, { headers: { Origin: ORIGIN } })).json();
  check('/draft/result reports a complete draft', result.complete && result.picks.length === total, `${result.picks.length} picks`);
  const resultMatches = result.picks.every(p => final.picks[p.slot] && final.picks[p.slot].team === p.team.id && final.picks[p.slot].by === p.drafter);
  check('/draft/result matches what every client saw', resultMatches);
  const seqs = Object.values(bots).map(b => b.seq);
  check('every connected drafter ended on the same state', seqs.every(x => x === boss.seq), `commissioner seq ${boss.seq}, drafters ${[...new Set(seqs)].join('/')}`);

  if(!flags.has('no-export')){
    console.log('\nExport dry-run against this room…');
    const run = spawnSync('node', ['tools/export-draft.mjs', '--result', `${BASE}/draft/result?room=${ROOM}`, '--dry-run'], { cwd: root, encoding: 'utf8' });
    const out = (run.stdout || '') + (run.stderr || '');
    const summary = out.split('\n').find(l => /team entries/.test(l)) || '';
    check('the export accepts this draft', run.status === 0, run.status === 0 ? summary.trim() : out.split('\n').filter(l => /^\s*- /.test(l)).slice(0, 3).join(' | ') || out.trim().slice(-200));
  }

  // ---- report ----
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const failed = checks.filter(c => !c.ok);
  console.log(`\nReplies of note: ${Object.entries(tally).map(([k, v]) => `${k}=${v}`).join('  ') || 'none'}`);
  console.log(`Chaos events: ${chaosLog.length} (${chaosLog.filter(c => c.ok).length} as expected)`);
  console.log(`${checks.length - failed.length}/${checks.length} checks passed in ${secs}s. Room: ${ROOM} (seed ${opt.seed ?? 'random'})`);
  if(failed.length){ console.log('\nFAILED:'); failed.forEach(f => console.log(`  - ${f.name} ${f.detail}`)); }
  [boss, ...Object.values(bots)].forEach(c => c.close());
  process.exit(failed.length ? 1 : 0);
}

main().catch(e => { console.error('\nRehearsal crashed:', e.message); process.exit(1); });
