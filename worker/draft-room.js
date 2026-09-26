/* ============================================================
   DRAFT ROOM (Durable Object)

   The authoritative copy of one live draft. Every drafter's browser
   connects here over a WebSocket; every action is run through the
   shared pure reducer (js/draft-engine.js — the same file the draft UI
   imports, so client and server can't disagree about the rules) and the
   resulting state is persisted, then broadcast to everyone. The pick
   clock is a set of timestamps inside the state (see js/draft-rules.js),
   so the real room never ticks: its clock is soft and nothing
   auto-picks.

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
   The room learns its own name from the WebSocket URL on first connect
   (kv 'room'); a Durable Object isn't told the name it was created by.

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

   GET .../result returns the finished board as JSON — what
   tools/export-draft.mjs turns into the next season's data file.
   GET .../status is a few bytes of "is it live, whose pick" for the
   in-progress banner on the app's other pages (js/draft-live.js).
   ============================================================ */
import { DurableObject } from 'cloudflare:workers';
import { reduce, createState, publicState, onTheClock } from '../js/draft-engine.js';
import { totalPicks, teamById, isMockRoom, clockElapsedMs, autoPickTeam } from '../js/draft-rules.js';

// Mirrors KNOWN_DRAFT_TEAM_IDS in rundown-proxy.js / DRAFT_TEAMS in
// js/data.js. Only the default for a brand-new room: the commissioner can
// change the roster of drafters from the lobby (setConfig).
const DRAFTER_IDS = ['josh', 'isaac', 'drew', 'douglas', 'collin', 'erichylok', 'patrick', 'peter', 'ericprister', 'donny'];

const MAX_QUEUE = 100;
const MAX_TEAM_ID_LENGTH = 60;
const KEEP_EVENTS = 2000;
const RATE_WINDOW_MS = 10000;
const RATE_MAX_FRAMES = 30;
const MAX_AUTH_FAILURES = 5;

function randomUnit(){
  return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
}

// Avoids leaking how many leading characters of the password matched.
function safeEqual(a, b){
  if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
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
      this.state = row ? JSON.parse(row.v) : createState(DRAFTER_IDS);
      const room = this.sql.exec("SELECT v FROM kv WHERE k = 'room'").toArray()[0];
      this.room = room ? room.v : null;
    });
  }

  async fetch(request){
    if(request.headers.get('Upgrade') === 'websocket'){
      if(this.room === null){
        this.room = new URL(request.url).searchParams.get('room') || 'main';
        this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES ('room', ?)", this.room);
      }
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
    if(new URL(request.url).pathname.endsWith('/status')){
      return new Response(JSON.stringify(this.status()), { headers: { 'Content-Type': 'application/json' } });
    }
    return new Response('Expected a WebSocket upgrade', { status: 426 });
  }

  // Just enough for a page outside the draft room to say the draft is on
  // and whose pick it is.
  status(){
    const { state } = this;
    const clock = onTheClock(state);
    return {
      phase: state.phase,
      running: state.phase === 'draft' && !!state.clock.running,
      slot: clock ? clock.slot : null,
      owner: clock ? clock.owner : null,
      drafters: state.config.drafters.length,
      total: totalPicks(state.config)
    };
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

  handleAuth(ws, attachment, msg){
    // Everyone's already commissioner in a mock room, whatever password
    // (a stale saved one, say) comes in.
    if(isMockRoom(this.room)) return this.send(ws, { type: 'authed', ok: true });
    if(attachment.authFailures >= MAX_AUTH_FAILURES){
      this.send(ws, { type: 'error', reason: 'rate' });
      return;
    }
    const ok = !!this.env.ADMIN_PASSWORD && safeEqual(msg.password, this.env.ADMIN_PASSWORD);
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
  // re-arms the mock room's auto-pick for whoever is now on the clock.
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
  }

  // ---- Mock-room auto-pick ----

  // When the pick on the clock is due to be made for its owner, or null
  // when nothing should auto-pick (the real room, paused, lobby, done).
  autoPickDue(){
    if(!isMockRoom(this.room)) return null;
    const { state } = this;
    const clock = onTheClock(state);
    if(!clock || !state.clock.running) return null;
    const { config } = state;
    const limitMs = ((config.bots || []).includes(clock.owner) ? config.botSeconds : config.clockSeconds) * 1000;
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
