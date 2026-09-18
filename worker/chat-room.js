/* ============================================================
   CHAT ROOM (Durable Object)

   One room for the whole friend group — every browser connects to the
   same singleton instance (see handleChatSocket in
   rundown-proxy.js), which is what makes messages real-time: the
   room holds every open WebSocket and fans each new message out to
   all of them. Workers KV (which the rest of this worker uses) can't
   do this — it's eventually consistent (a write can take up to a
   minute to show up elsewhere) and has no push mechanism, so it would
   mean polling.

   Uses the WebSocket Hibernation API: the room's in-memory state is
   discarded whenever it's idle and revived on the next message, so
   idle connections cost nothing. Which is why nothing important lives
   on `this` — history is in the room's SQLite storage, and per-socket
   state (the rate-limit window) is stashed on the socket itself via
   serializeAttachment, both of which survive hibernation.

   Trust model matches favorites (see the FAVORITES STORE note in
   rundown-proxy.js): no auth, the sender is whichever drafter the
   client says it is. Validation here is just "is this a real drafter
   id, a sane message, and not a flood" — not identity verification.

   Wire protocol (JSON text frames):
     client -> server  { type: 'send', from: '<drafterId>', text: '...' }
                       'ping' (bare string; answered with 'pong' by the
                       runtime's auto-response, without waking the room)
     server -> client  { type: 'history', messages: [...] }   on connect
                       { type: 'message', message: {...} }    new message
                       { type: 'error', reason: '...' }       rejected send
     message = { id, from, text, ts } — id is the SQLite autoincrement
     key, so it's a total order the client can dedupe/resume against
     (connect with ?after=<lastSeenId> to only get what it missed).
   ============================================================ */
import { DurableObject } from 'cloudflare:workers';

// Mirrors KNOWN_DRAFT_TEAM_IDS in rundown-proxy.js / DRAFT_TEAMS in
// js/data.js — bounds who can post to real drafters.
const DRAFTER_IDS = ['josh', 'isaac', 'drew', 'douglas', 'collin', 'erichylok', 'patrick', 'peter', 'ericprister', 'donny'];

const MAX_TEXT_LENGTH = 1000;
const HISTORY_ON_FRESH_CONNECT = 100;
const MAX_CATCHUP_MESSAGES = 500;
const KEEP_MESSAGES = 1000;
const RATE_WINDOW_MS = 10000;
const RATE_MAX_MESSAGES = 10;

export class ChatRoom extends DurableObject {
  constructor(ctx, env){
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender TEXT NOT NULL,
        text TEXT NOT NULL,
        ts INTEGER NOT NULL
      )
    `);
    // Client keepalive: answered by the runtime itself, so a ping never
    // wakes a hibernating room or counts as compute.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request){
    if(request.headers.get('Upgrade') !== 'websocket'){
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const after = parseInt(new URL(request.url).searchParams.get('after'), 10);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ sent: [] });
    server.send(JSON.stringify({ type: 'history', messages: this.messagesAfter(after) }));

    return new Response(null, { status: 101, webSocket: client });
  }

  // A valid `after` resumes from there (a reconnect that only wants what
  // it missed); anything else is a fresh client and gets the latest page.
  messagesAfter(after){
    const rows = Number.isFinite(after) && after >= 0
      ? this.sql.exec('SELECT id, sender, text, ts FROM messages WHERE id > ? ORDER BY id ASC LIMIT ?', after, MAX_CATCHUP_MESSAGES).toArray()
      : this.sql.exec('SELECT * FROM (SELECT id, sender, text, ts FROM messages ORDER BY id DESC LIMIT ?) ORDER BY id ASC', HISTORY_ON_FRESH_CONNECT).toArray();
    return rows.map(r => ({ id: r.id, from: r.sender, text: r.text, ts: r.ts }));
  }

  async webSocketMessage(ws, raw){
    if(typeof raw !== 'string') return;

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e){
      return;
    }
    if(!msg || msg.type !== 'send') return;

    const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, MAX_TEXT_LENGTH) : '';
    if(!DRAFTER_IDS.includes(msg.from) || !text){
      ws.send(JSON.stringify({ type: 'error', reason: 'invalid' }));
      return;
    }

    const now = Date.now();
    const attachment = ws.deserializeAttachment() || { sent: [] };
    const recent = attachment.sent.filter(t => now - t < RATE_WINDOW_MS);
    if(recent.length >= RATE_MAX_MESSAGES){
      ws.send(JSON.stringify({ type: 'error', reason: 'rate' }));
      return;
    }
    recent.push(now);
    ws.serializeAttachment({ sent: recent });

    const { id } = this.sql.exec('INSERT INTO messages (sender, text, ts) VALUES (?, ?, ?) RETURNING id', msg.from, text, now).one();
    this.sql.exec('DELETE FROM messages WHERE id <= ?', id - KEEP_MESSAGES);

    const frame = JSON.stringify({ type: 'message', message: { id, from: msg.from, text, ts: now } });
    for(const socket of this.ctx.getWebSockets()){
      try { socket.send(frame); } catch (e){}
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
