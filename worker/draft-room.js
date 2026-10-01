/* ============================================================
   DRAFT ROOM (Durable Object)

   The authoritative copy of one live draft. Every drafter's browser
   connects here over a WebSocket; every action is run through the
   shared pure reducer (js/draft-engine.js — the same file the draft UI
   imports, so client and server can't disagree about the rules) and the
   resulting state is persisted, then broadcast to everyone. The pick
   clock is a set of timestamps inside the state (see js/draft-rules.js),
   so the real room never ticks: its clock is soft, and the only
   auto-pick there is auto-draft (below).

   One instance per room name (`?room=`, default "main"), so throwaway
   mock drafts run on their own rooms before the real one. See
   docs/draft-room-plan.md.

   Mock rooms (isMockRoom: mock, mock-1, …) differ in two ways:
   - Self-serve: every socket is treated as commissioner (sent an
     `authed` ok on connect), so anyone can set it up and run it.
   - Auto-picks: a Durable Object alarm is kept set for whoever is on
     the clock — a bot (config.bots) after config.botSeconds, anyone
     else once config.clockSeconds runs out — and picks from their queue,
     else the best-ranked team that fits (autoPickTeam).
   Auto-draft (state.autoDraft, the setAutoDraft action) works in every
   room, the real one included: a drafter who turns it on is picked for
   the same way, AUTO_DRAFT_SECONDS after going on the clock, and gets no
   "You're on the clock" alert. autoPickLimitMs (js/draft-rules.js)
   decides the delay for both kinds of room.
   The room learns its own name and group (js/groups.js) from the
   WebSocket URL on first connect (kv 'room' / 'group'); a Durable Object
   isn't told the name it was created by. The group picks the default
   drafters of a brand-new room (the commissioner can change them from the
   lobby, setConfig) and which commissioner password it accepts.

   Trust model: the same no-auth tier as chat and favorites for
   drafters — an action's `from` is whichever drafter the client says it
   is (the reducer still checks that drafter owns the slot on the
   clock). Commissioner actions additionally need the socket to have
   authenticated with ADMIN_PASSWORD (`auth` frame — a browser
   WebSocket can't send the X-Admin-Password header the REST routes
   use), and that flag lives in the socket's attachment so it survives
   hibernation.

   Wire protocol (JSON text frames):
     client -> server
       { type: 'auth', password }                    become commissioner
       { type: 'action', id, from, action }          run a reducer action
            (`id` is echoed back so the client can match the reply;
             `from` is a drafter id, or omitted for a commissioner acting
             as no one in particular)
       { type: 'getQueue', from } / { type: 'queue', from, teams: [id] }
            a drafter's private ranked shortlist, stored server-side so it
            follows them across devices. Only ever sent back to sockets
            that ask for it.
       'ping' (bare string; answered 'pong' by the runtime's auto-response)
     server -> client
       { type: 'hello', now, state, pool }           on connect
       { type: 'state', now, state }                 after every accepted action
       { type: 'pool', pool }                        only when the pool changed
       { type: 'ok', id }  /  { type: 'rejected', id, error, detail? }
       { type: 'authed', ok }                        (also sent unasked on
                                                     connect in a mock room)
       { type: 'queue', teams }
       { type: 'error', reason }                     malformed frame / rate limit
     `now` is the server's clock; clients use it to correct their own
     before rendering the countdown from the state's clock timestamps.

   Push: in a real (non-mock) room, whoever goes on the clock gets a
   "You're on the clock" alert on their phone (worker/web-push.js), so
   nobody has to sit watching the room between picks. Mock rooms never
   push: a rehearsal would otherwise buzz every drafter in the group.

   GET .../result returns the finished board as JSON — what
   tools/export-draft.mjs turns into the next season's data file.
   GET .../status is a few bytes of "is it live, whose pick" for the
   in-progress banner on the app's other pages (js/draft-live.js), plus
   the scheduled start the commissioner set (PUT .../schedule, already
   password-checked by the worker), which Home counts down to
   (js/draft-schedule.js). Setting or moving it alerts the whole group
   (worker/draft-time-alert.js). The schedule is kept outside the draft state,
   so a lobby reset doesn't clear it. So is the draft time poll
   (js/draft-poll.js), which rides along on the status: the commissioner's
   candidate times (PUT .../poll, password-checked by the worker) and each
   drafter's answer (PUT .../vote, no-auth like a pick).

   Sports: a room in the lobby takes its group's drafted sports as its
   caps (worker/sports.js), read on every connect, and PUT .../caps hands
   a Commissioner page save straight to an open lobby.
   ============================================================ */
import { DurableObject } from 'cloudflare:workers';
import { reduce, createState, publicState, onTheClock, syncCaps } from '../js/draft-engine.js';
import { totalPicks, teamById, isMockRoom, clockElapsedMs, autoPickTeam, autoPickLimitMs } from '../js/draft-rules.js';
import { parsePollOptions, parsePollVote, replacePollOptions } from '../js/draft-poll.js';

import { LEGACY_GROUP_ID, isKnownGroup, drafterIdsFor, adminSecretName, groupCaps } from '../js/groups.js';
import { effectiveDrafters } from './roster.js';
import { liveGroupCaps } from './sports.js';
import { pushToDrafters } from './web-push.js';
import { draftTimeAlert } from './draft-time-alert.js';
import { checkCommissionerSecret } from './commissioner-token.js';

const MAX_QUEUE = 100;
const MAX_TEAM_ID_LENGTH = 60;
const KEEP_EVENTS = 2000;
const RATE_WINDOW_MS = 10000;
const RATE_MAX_FRAMES = 30;
const MAX_AUTH_FAILURES = 5;

// A fresh room's state: the group's drafters, and its own sports and
// pick counts when js/groups.js gives it some. A Commissioner page
// change (worker/sports.js) follows on the first connect.
function newRoomState(group){
  const caps = groupCaps(group);
  return createState(drafterIdsFor(group), caps ? { caps: { ...caps } } : {});
}

function randomUnit(){
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

export class DraftRoom extends DurableObject {
  constructor(ctx, env){
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    // Append-only audit trail of accepted actions: who did what, in order.
    // Not read by the app; it is what to look at if a pick is ever disputed.
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        actor TEXT,
        commissioner INTEGER NOT NULL,
        action TEXT NOT NULL
      )
    `);
    this.sql.exec('CREATE TABLE IF NOT EXISTS queues (drafter TEXT PRIMARY KEY, teams TEXT NOT NULL)');
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));

    // Hibernation discards `this`, so the state is re-read from SQLite on
    // wake; concurrent events are held until it's loaded.
    ctx.blockConcurrencyWhile(async () => {
      const row = this.sql.exec("SELECT v FROM kv WHERE k = 'state'").toArray()[0];
      const group = this.sql.exec("SELECT v FROM kv WHERE k = 'group'").toArray()[0];
      this.group = group ? group.v : null;
      this.state = row ? JSON.parse(row.v) : newRoomState(this.group || LEGACY_GROUP_ID);
      const room = this.sql.exec("SELECT v FROM kv WHERE k = 'room'").toArray()[0];
      this.room = room ? room.v : null;
      const scheduled = this.sql.exec("SELECT v FROM kv WHERE k = 'scheduledAt'").toArray()[0];
      this.scheduledAt = scheduled ? Number(scheduled.v) : null;
      const poll = this.sql.exec("SELECT v FROM kv WHERE k = 'poll'").toArray()[0];
      this.poll = poll ? JSON.parse(poll.v) : null;
      const capsAt = this.sql.exec("SELECT v FROM kv WHERE k = 'capsAt'").toArray()[0];
      this.capsAt = capsAt ? Number(capsAt.v) : 0;
    });
  }

  async fetch(request){
    if(request.headers.get('Upgrade') === 'websocket'){
      if(this.room === null){
        this.room = new URL(request.url).searchParams.get('room') || 'main';
        this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('room', ?)", this.room);
      }
      if(this.group === null){
        // A room made before groups existed never saw ?group=, and is The
        // Draft's; the worker has already rejected an unknown group.
        const group = new URL(request.url).searchParams.get('group');
        this.group = isKnownGroup(group) ? group : LEGACY_GROUP_ID;
        this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('group', ?)", this.group);
        // Nothing saved yet: start from this group's drafters, not the
        // default the constructor had to guess.
        const saved = this.sql.exec("SELECT v FROM kv WHERE k = 'state'").toArray()[0];
        if(!saved) this.state = newRoomState(this.group);
      }
      await this.syncGroupCaps();
      const mock = isMockRoom(this.room);
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({ commissioner: mock, authFailures: 0, sent: [] });
      server.send(JSON.stringify({ type: 'hello', now: Date.now(), state: publicState(this.state), pool: this.state.pool }));
      if(mock) server.send(JSON.stringify({ type: 'authed', ok: true }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if(new URL(request.url).pathname.endsWith('/result')){
      return new Response(JSON.stringify(this.result()), { headers: { 'Content-Type': 'application/json' } });
    }
    if(new URL(request.url).pathname.endsWith('/schedule') && request.method === 'PUT'){
      return this.setSchedule(request);
    }
    if(new URL(request.url).pathname.endsWith('/poll') && request.method === 'PUT'){
      return this.setPoll(request);
    }
    if(new URL(request.url).pathname.endsWith('/vote') && request.method === 'PUT'){
      return this.votePoll(request);
    }
    if(new URL(request.url).pathname.endsWith('/caps') && request.method === 'PUT'){
      return this.pushCaps(request);
    }
    if(new URL(request.url).pathname.endsWith('/status')){
      return new Response(JSON.stringify(this.status()), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Expected a WebSocket upgrade', { status: 426 });
  }

  // Just enough for a page outside the draft room to say the draft is on
  // and whose pick it is — plus the lobby's setup progress (lottery drawn,
  // team pool loaded) for the Commissioner page (js/admin.js).
  status(){
    const { state } = this;
    const clock = onTheClock(state);
    return {
      phase: state.phase,
      running: state.phase === 'draft' && !!state.clock.running,
      slot: clock ? clock.slot : null,
      owner: clock ? clock.owner : null,
      drafters: state.config.drafters.length,
      total: totalPicks(state.config),
      ordered: !!state.order,
      poolSize: state.pool.length,
      scheduledAt: this.scheduledAt,
      poll: this.poll
    };
  }

  // { scheduledAt: epoch ms } sets the start time, { scheduledAt: null }
  // clears it. The caller (the worker's /draft/schedule) has already
  // checked the commissioner password.
  async setSchedule(request){
    let body;
    try { body = await request.json(); } catch (e){ body = null; }
    const at = body ? body.scheduledAt : undefined;
    if(at !== null && !(Number.isSafeInteger(at) && at > 0)){
      return new Response('Expected { scheduledAt: epoch ms | null }', { status: 400 });
    }
    const alert = draftTimeAlert(this.scheduledAt, at, Date.now());
    this.scheduledAt = at;
    if(at === null) this.sql.exec("DELETE FROM kv WHERE k = 'scheduledAt'");
    else this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('scheduledAt', ?)", String(at));
    if(alert) this.ctx.waitUntil(this.pushDraftTime(alert, new URL(request.url).searchParams));
    return new Response(JSON.stringify(this.status()), { headers: { 'Content-Type': 'application/json' } });
  }

  // Tells everyone in the group the draft has a time. A room nobody has
  // opened a socket to yet doesn't know its own name or group, so they're
  // read off the request (the worker has already checked both).
  async pushDraftTime(alert, params){
    if(isMockRoom(this.room || params.get('room') || 'main')) return;
    const asked = params.get('group');
    const group = this.group || (isKnownGroup(asked) ? asked : LEGACY_GROUP_ID);
    await pushToDrafters(this.env, group, drafterIdsFor(group), null, alert, { ttl: 24 * 60 * 60, topic: 'draft-time' });
  }

  savePoll(poll){
    this.poll = poll;
    if(poll === null) this.sql.exec("DELETE FROM kv WHERE k = 'poll'");
    else this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('poll', ?)", JSON.stringify(poll));
    return new Response(JSON.stringify(this.status()), { headers: { 'Content-Type': 'application/json' } });
  }

  // { options: [epoch ms, ...] } opens the draft time poll or changes its
  // times, { options: null } removes it along with every answer. The
  // caller (the worker's /draft/poll) has already checked the commissioner
  // password.
  async setPoll(request){
    let body;
    try { body = await request.json(); } catch (e){ body = null; }
    if(body && body.options === null) return this.savePoll(null);
    const options = parsePollOptions(body && body.options);
    if(!options) return new Response('Expected { options: [2-3 epoch ms] | null }', { status: 400 });
    return this.savePoll(replacePollOptions(this.poll, options));
  }

  // { drafter, options: [epoch ms, ...] } is that drafter's answer (an
  // empty list: none of them work), { drafter, options: null } takes it
  // back. The worker's /draft/vote has already checked the drafter is in
  // this group.
  async votePoll(request){
    let body;
    try { body = await request.json(); } catch (e){ body = null; }
    if(!this.poll) return new Response('No poll', { status: 409 });
    if(!body || typeof body.drafter !== 'string') return new Response('Expected { drafter, options }', { status: 400 });
    const votes = { ...this.poll.votes };
    if(body.options === null){
      delete votes[body.drafter];
    } else {
      const picks = parsePollVote(this.poll, body.options);
      if(!picks) return new Response('Expected { drafter, options }', { status: 400 });
      votes[body.drafter] = picks;
    }
    return this.savePoll({ ...this.poll, votes });
  }

  // The board in the order it was drafted, each pick carrying the full
  // team record — everything an export needs without the pool.
  result(){
    const { state } = this;
    const n = state.config.drafters.length;
    const picks = Object.keys(state.picks).map(Number).sort((a, b) => a - b).map(slot => {
      const p = state.picks[slot];
      return {
        slot,
        round: Math.floor(slot / n) + 1,
        pick: (slot % n) + 1,
        drafter: p.by,
        team: teamById(state.pool, p.team),
        ...(p.proxy ? { proxy: true } : {}),
        ...(p.auto ? { auto: true } : {}),
        ...(p.edited ? { edited: true } : {})
      };
    });
    return {
      phase: state.phase,
      complete: state.phase === 'done',
      totalPicks: state.order ? totalPicks(state.config) : null,
      config: state.config,
      order: state.order,
      picks
    };
  }

  // A group's sports or pick counts changed since this room was made (on
  // the Commissioner page, or in js/groups.js): apply them while it's
  // still in the lobby. `pushed` is a save handed over by the worker;
  // otherwise they're read from KV, which can lag a save, so a record
  // older than the last one applied here is ignored.
  async syncGroupCaps(pushed){
    const live = pushed || await liveGroupCaps(this.env, this.group);
    if(live.at < this.capsAt) return;
    if(live.at > this.capsAt){
      this.capsAt = live.at;
      this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('capsAt', ?)", String(live.at));
    }
    const next = live.caps && syncCaps(this.state, live.caps);
    if(!next) return;
    this.state = next;
    this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('state', ?)", JSON.stringify(this.state));
    this.broadcast({ type: 'pool', pool: this.state.pool });
    this.broadcast({ type: 'state', now: Date.now(), state: publicState(this.state) });
  }

  // { caps, at } from the worker's PUT /sports, which has already checked
  // the commissioner password. A room nobody has opened yet learns its
  // group from the request, as pushDraftTime does.
  async pushCaps(request){
    let body;
    try { body = await request.json(); } catch (e){ body = null; }
    const caps = body && body.caps;
    if(!caps || typeof caps !== 'object' || !Number.isSafeInteger(body.at)) return new Response('Expected { caps, at }', { status: 400 });
    const params = new URL(request.url).searchParams;
    if(this.room === null){
      this.room = params.get('room') || 'main';
      this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('room', ?)", this.room);
    }
    if(this.group === null){
      const asked = params.get('group');
      this.group = isKnownGroup(asked) ? asked : LEGACY_GROUP_ID;
      this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('group', ?)", this.group);
      const saved = this.sql.exec("SELECT v FROM kv WHERE k = 'state'").toArray()[0];
      if(!saved) this.state = newRoomState(this.group);
    }
    await this.syncGroupCaps({ caps, at: body.at });
    return new Response(JSON.stringify(this.status()), { headers: { 'Content-Type': 'application/json' } });
  }

  send(ws, payload){
    try { ws.send(JSON.stringify(payload)); } catch (e){}
  }

  broadcast(payload){
    const frame = JSON.stringify(payload);
    for(const socket of this.ctx.getWebSockets()){
      try { socket.send(frame); } catch (e){}
    }
  }

  // Sliding-window flood limit, kept on the socket so it survives hibernation.
  allowFrom(ws, attachment){
    const now = Date.now();
    const recent = attachment.sent.filter(t => now - t < RATE_WINDOW_MS);
    if(recent.length >= RATE_MAX_FRAMES){
      this.send(ws, { type: 'error', reason: 'rate' });
      return false;
    }
    recent.push(now);
    attachment.sent = recent;
    ws.serializeAttachment(attachment);
    return true;
  }

  async handleAuth(ws, attachment, msg){
    // Everyone's already commissioner in a mock room, whatever password
    // (a stale saved one, say) comes in.
    if(isMockRoom(this.room)) return this.send(ws, { type: 'authed', ok: true });
    if(attachment.authFailures >= MAX_AUTH_FAILURES){
      this.send(ws, { type: 'error', reason: 'rate' });
      return;
    }
    const group = this.group || LEGACY_GROUP_ID;
    const ok = await checkCommissionerSecret(msg.password, this.env[adminSecretName(group)], group);
    if(ok){
      attachment.commissioner = true;
    } else {
      attachment.authFailures += 1;
    }
    ws.serializeAttachment(attachment);
    this.send(ws, { type: 'authed', ok });
  }

  async handleAction(ws, attachment, msg){
    const from = typeof msg.from === 'string' ? msg.from : null;
    if(msg.id !== undefined && !(typeof msg.id === 'number' || (typeof msg.id === 'string' && msg.id.length <= 40))) return;
    // Drafters are checked by the reducer against the current config;
    // this just bounds the string that ends up in the audit log.
    if(from !== null && from.length > 40) return this.send(ws, { type: 'rejected', id: msg.id, error: 'bad_input' });

    const before = this.state;
    const result = reduce(before, msg.action, {
      now: Date.now(),
      actor: from,
      isCommissioner: attachment.commissioner,
      rand: randomUnit
    });
    if(!result.state){
      return this.send(ws, { type: 'rejected', id: msg.id, error: result.error, detail: result.detail });
    }
    this.send(ws, { type: 'ok', id: msg.id });
    await this.commit(before, result.state, from, attachment.commissioner, msg.action);
  }

  // Persists an accepted state, logs the action, tells everyone, and
  // re-arms the auto-pick for whoever is now on the clock.
  async commit(before, state, actor, commissioner, action){
    this.state = state;
    this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('state', ?)", JSON.stringify(this.state));
    const { id: eventId } = this.sql.exec(
      'INSERT INTO events (ts, actor, commissioner, action) VALUES (?, ?, ?, ?) RETURNING id',
      Date.now(), actor, commissioner ? 1 : 0, JSON.stringify(action)
    ).one();
    this.sql.exec('DELETE FROM events WHERE id <= ?', eventId - KEEP_EVENTS);

    if(this.state.pool.length !== before.pool.length || action.type === 'setPool'){
      this.broadcast({ type: 'pool', pool: this.state.pool });
    }
    this.broadcast({ type: 'state', now: Date.now(), state: publicState(this.state) });
    await this.armAutoPick();
    await this.pushOnTheClock(before);
  }

  // A new drafter (or the same one again, at the snake's turn) is on the
  // clock: tell them, with the pick that was just made for context.
  // Pausing, resuming and queue edits don't move the clock, so they don't alert.
  async pushOnTheClock(before){
    if(isMockRoom(this.room)) return;
    const was = onTheClock(before);
    const now = onTheClock(this.state);
    if(!now || (was && was.slot === now.slot && was.owner === now.owner)) return;
    // Auto-draft is about to pick for them; nothing for them to do.
    if((this.state.autoDraft || []).includes(now.owner)) return;
    const group = this.group || LEGACY_GROUP_ID;
    const roster = await effectiveDrafters(this.env, group); // confirmed spots' real names (worker/roster.js)
    const nameOf = id => (roster.find(d => d.id === id) || { name: id }).name;
    const n = this.state.config.drafters.length;
    const parts = [`Round ${Math.floor(now.slot / n) + 1}, pick ${(now.slot % n) + 1}.`];
    const last = was && this.state.picks[was.slot];
    const lastTeam = last && teamById(this.state.pool, last.team);
    if(lastTeam) parts.push(`${nameOf(last.by)} took ${lastTeam.name}.`);
    await pushToDrafters(this.env, group, [now.owner], 'draft', {
      kind: 'draft',
      title: "You're on the clock",
      body: parts.join(' '),
      url: this.room === 'main' ? './?view=draft' : `./?view=draft&room=${this.room}`,
      tag: 'draft-clock'
    }, { ttl: 10 * 60, urgency: 'high', topic: 'draft-clock' });
  }

  // ---- Auto-pick (auto-draft, and mock rooms' bots and timeouts) ----

  // When the pick on the clock is due to be made for its owner, or null
  // when nothing should auto-pick (the real room for anyone not on
  // auto-draft, paused, lobby, done).
  autoPickDue(){
    const { state } = this;
    const clock = onTheClock(state);
    if(!clock || !state.clock.running) return null;
    const limitMs = autoPickLimitMs(state, clock.owner, isMockRoom(this.room));
    if(limitMs === null) return null;
    return Date.now() + Math.max(0, limitMs - clockElapsedMs(state.clock, Date.now()));
  }

  async armAutoPick(){
    const due = this.autoPickDue();
    if(due === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(due);
  }

  async alarm(){
    const due = this.autoPickDue();
    if(due === null) return;
    // Woken early (the clock was paused and resumed, a pick was undone…):
    // just re-arm for the real deadline.
    if(due > Date.now() + 250) return this.armAutoPick();
    const clock = onTheClock(this.state);
    const row = this.sql.exec('SELECT teams FROM queues WHERE drafter = ?', clock.owner).toArray()[0];
    const team = autoPickTeam(this.state, clock.owner, row ? JSON.parse(row.teams) : [], randomUnit);
    if(!team) return;
    const action = { type: 'pick', slot: clock.slot, team, auto: true };
    const before = this.state;
    const result = reduce(before, action, { now: Date.now(), actor: null, isCommissioner: true, rand: randomUnit });
    if(!result.state) return;
    await this.commit(before, result.state, 'auto', true, action);
  }

  validQueueOwner(from){
    return typeof from === 'string' && this.state.config.drafters.includes(from);
  }

  handleGetQueue(ws, msg){
    if(!this.validQueueOwner(msg.from)) return this.send(ws, { type: 'error', reason: 'invalid' });
    const row = this.sql.exec('SELECT teams FROM queues WHERE drafter = ?', msg.from).toArray()[0];
    this.send(ws, { type: 'queue', teams: row ? JSON.parse(row.teams) : [] });
  }

  handleSetQueue(ws, msg){
    const teams = msg.teams;
    if(!this.validQueueOwner(msg.from) || !Array.isArray(teams) || teams.length > MAX_QUEUE
      || !teams.every(t => typeof t === 'string' && t.length > 0 && t.length <= MAX_TEAM_ID_LENGTH)){
      return this.send(ws, { type: 'error', reason: 'invalid' });
    }
    this.sql.exec('INSERT OR REPLACE INTO queues (drafter, teams) VALUES (?, ?)', msg.from, JSON.stringify([...new Set(teams)]));
  }

  async webSocketMessage(ws, raw){
    if(typeof raw !== 'string') return;
    let msg;
    try { msg = JSON.parse(raw); } catch (e){ return; }
    if(!msg || typeof msg !== 'object') return;

    const attachment = ws.deserializeAttachment() || { commissioner: false, authFailures: 0, sent: [] };
    if(!this.allowFrom(ws, attachment)) return;

    switch(msg.type){
      case 'auth': return this.handleAuth(ws, attachment, msg);
      case 'action': return this.handleAction(ws, attachment, msg);
      case 'getQueue': return this.handleGetQueue(ws, msg);
      case 'queue': return this.handleSetQueue(ws, msg);
      default: return;
    }
  }

  async webSocketClose(ws, code){
    // 1005/1006 are reserved "no status" codes and throw if passed to close().
    try { ws.close(code >= 1000 && code < 1005 ? code : 1000); } catch (e){}
  }

  async webSocketError(ws){
    try { ws.close(1011); } catch (e){}
  }
}
