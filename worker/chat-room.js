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
                       or, for a GIF (text may then be empty):
                       { type: 'send', from, gif: { slug, url, w, h } }
                       or, for a game shared from Game Details (the text
                       is then written here — see worker/chat-game.js):
                       { type: 'send', from, game: {...} }
                       any send may add `mentions: ['<drafterId>', ...]`,
                       the drafters its text tags (js/chat-mentions.js);
                       'everyone' tags the whole group and also needs
                       `auth`, the commissioner password or token
                       { type: 'react', from, messageId, emoji } — toggles
                       that drafter's reaction on a message (send it again
                       to take it back); emoji must be in REACTION_EMOJI
                       { type: 'presence', from, visible } — which drafter
                       this socket is and whether the app is on screen, so
                       a new message isn't pushed (worker/web-push.js) to
                       someone already looking at it
                       'ping' (bare string; answered with 'pong' by the
                       runtime's auto-response, without waking the room)
     server -> client  { type: 'history', messages: [...], reactions: {...},
                         deleted: [id, ...] }                 on connect
                       { type: 'deleted', messageId }         the admin
                                                              deleted it
                       { type: 'message', message: {...} }    new message
                       { type: 'reactions', messageId, reactions }
                                                              a message's
                                                              reactions changed
                       { type: 'error', reason: '...' }       rejected send
     message = { id, from, text, ts, gif?, game?, mentions? } — id is the SQLite autoincrement
     key, so it's a total order the client can dedupe/resume against
     (connect with ?after=<lastSeenId> to only get what it missed).
     reactions = { '<emoji>': ['<drafterId>', ...] }, and only emoji with
     at least one reactor are present. Reactions are their own table
     rather than a message field because they change after the message
     is sent — which also means a resumed connection (?after=) can't
     learn about a reaction added to an old message from the messages
     it fetches, so `history` always carries a snapshot of every
     retained message's reactions, keyed by message id.
   ============================================================ */
import { DurableObject } from 'cloudflare:workers';
import { LEGACY_GROUP_ID, isKnownGroup, drafterIdsFor, adminSecretName } from '../js/groups.js';
import { effectiveDrafters } from './roster.js';
import { pushToDrafters } from './web-push.js';
import { parseGame, gameText } from './chat-game.js';
import { checkCommissionerSecret } from './commissioner-token.js';
import { EVERYONE, parseMentions, splitRecipients } from '../js/chat-mentions.js';

// Each group (js/groups.js) has its own room (the worker picks it by
// ?group=), and only that group's drafters can post in it. The group rides
// on each socket's attachment, read from the URL it connected with.
function socketGroup(ws){
  const attachment = ws.deserializeAttachment() || {};
  return isKnownGroup(attachment.group) ? attachment.group : LEGACY_GROUP_ID;
}

function socketDrafterIds(ws){
  return drafterIdsFor(socketGroup(ws));
}

const PUSH_PREVIEW_LENGTH = 140;

const MAX_TEXT_LENGTH = 1000;
const HISTORY_ON_FRESH_CONNECT = 100;
const MAX_CATCHUP_MESSAGES = 500;
const KEEP_MESSAGES = 1000;
const RATE_WINDOW_MS = 10000;
const RATE_MAX_MESSAGES = 10;
const ADMIN_RECENT_MESSAGES = 40;
// Wrong commissioner passwords a socket can send with "@everyone" before
// it stops being checked (the message still posts, untagged).
const MAX_AUTH_FAILURES = 5;

// Mirrors REACTION_EMOJI in js/chat.js — the picker's order is also the
// order reaction pills are shown in.
const REACTION_EMOJI = ['👍', '👎', '😂', '😮', '😢', '🔥', '😎'];

// GIFs come from KLIPY (js/gifs.js), which requires the browser to load
// its media straight from its own CDN — so a GIF message stores the URL
// KLIPY gave the sender, unmodified. That makes this the one place a
// client-supplied URL gets rendered as an <img> for every other drafter,
// so it's pinned to KLIPY's media hosts over https rather than trusted.
const KLIPY_MEDIA_HOST = /^static\d*\.klipy\.com$/;
const MAX_GIF_URL_LENGTH = 500;
const MAX_GIF_DIMENSION = 2000;

function parseGif(gif){
  if(!gif || typeof gif !== 'object') return null;
  const { slug, url, w, h } = gif;
  if(typeof slug !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(slug)) return null;
  if(typeof url !== 'string' || url.length > MAX_GIF_URL_LENGTH) return null;
  let parsed;
  try { parsed = new URL(url); } catch (e){ return null; }
  if(parsed.protocol !== 'https:' || !KLIPY_MEDIA_HOST.test(parsed.hostname)) return null;
  const okDim = n => Number.isInteger(n) && n > 0 && n <= MAX_GIF_DIMENSION;
  if(!okDim(w) || !okDim(h)) return null;
  return { slug, url, w, h };
}

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
    // One row per (message, drafter, emoji): a drafter can leave several
    // different reactions on a message, but each only once, so toggling is
    // "delete the row if it's there, else insert it".
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS reactions (
        message_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        emoji TEXT NOT NULL,
        PRIMARY KEY (message_id, sender, emoji)
      )
    `);
    // `gif` (JSON text, null for plain messages) was added after the table
    // already existed in production, and CREATE TABLE IF NOT EXISTS won't
    // alter an existing table — so add the column once, if it's missing.
    const hasGifColumn = this.sql.exec('PRAGMA table_info(messages)').toArray().some(c => c.name === 'gif');
    if(!hasGifColumn) this.sql.exec('ALTER TABLE messages ADD COLUMN gif TEXT');
    // Same for `game`, a shared game's snapshot (JSON text, else null).
    const hasGameColumn = this.sql.exec('PRAGMA table_info(messages)').toArray().some(c => c.name === 'game');
    if(!hasGameColumn) this.sql.exec('ALTER TABLE messages ADD COLUMN game TEXT');
    // And `mentions`, the drafter ids a message tags (JSON array, else null).
    const hasMentionsColumn = this.sql.exec('PRAGMA table_info(messages)').toArray().some(c => c.name === 'mentions');
    if(!hasMentionsColumn) this.sql.exec('ALTER TABLE messages ADD COLUMN mentions TEXT');
    // Messages the admin deleted (worker/system-admin.js), by id, so a
    // device that was offline at the time drops its cached copy: the
    // history frame carries the list. Pruned with the messages.
    this.sql.exec('CREATE TABLE IF NOT EXISTS deleted (id INTEGER PRIMARY KEY)');
    // Client keepalive: answered by the runtime itself, so a ping never
    // wakes a hibernating room or counts as compute.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  async fetch(request){
    if(request.headers.get('Upgrade') !== 'websocket'){
      const path = new URL(request.url).pathname;
      const reply = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
      if(path.endsWith('/summary')) return reply(this.summary());
      if(path.endsWith('/recent')) return reply({ messages: this.recent() });
      if(path.endsWith('/delete') && request.method === 'POST'){
        let body;
        try { body = await request.json(); } catch (e){ body = null; }
        return reply(this.deleteMessage(body && body.id));
      }
      return new Response('Expected a WebSocket upgrade', { status: 426 });
    }

    const after = parseInt(new URL(request.url).searchParams.get('after'), 10);
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const group = new URL(request.url).searchParams.get('group') || LEGACY_GROUP_ID;
    server.serializeAttachment({ sent: [], group });
    server.send(JSON.stringify({ type: 'history', messages: this.messagesAfter(after), reactions: this.reactionSnapshot(), deleted: this.deletedIds() }));

    return new Response(null, { status: 101, webSocket: client });
  }

  // For the system admin page (worker/system-admin.js): how busy the room
  // is, without opening a socket.
  summary(){
    const last = this.sql.exec('SELECT sender, ts FROM messages ORDER BY id DESC LIMIT 1').toArray()[0];
    const watching = new Set();
    const sockets = this.ctx.getWebSockets();
    for(const socket of sockets){
      const a = socket.deserializeAttachment() || {};
      if(a.visible && a.who) watching.add(a.who);
    }
    return {
      messages: this.sql.exec('SELECT COUNT(*) AS n FROM messages').one().n,
      last: last ? { from: last.sender, ts: last.ts } : null,
      connected: sockets.length,
      watching: [...watching]
    };
  }

  // For the admin page's chat moderation: the latest messages, newest
  // first, with a GIF or shared game flagged rather than sent whole.
  recent(){
    return this.sql.exec('SELECT id, sender, text, ts, gif, game FROM messages ORDER BY id DESC LIMIT ?', ADMIN_RECENT_MESSAGES).toArray()
      .map(r => ({ id: r.id, from: r.sender, text: r.text, ts: r.ts, gif: !!r.gif, game: !!r.game }));
  }

  // The admin deletes a message: gone from history, its reactions too,
  // and every open socket is told. { ok, message } or { ok: false }.
  deleteMessage(id){
    if(!Number.isInteger(id)) return { ok: false };
    const row = this.sql.exec('DELETE FROM messages WHERE id = ? RETURNING id, sender, text, ts', id).toArray()[0];
    if(!row) return { ok: false };
    this.sql.exec('DELETE FROM reactions WHERE message_id = ?', id);
    this.sql.exec('INSERT OR IGNORE INTO deleted (id) VALUES (?)', id);
    this.broadcast({ type: 'deleted', messageId: id });
    return { ok: true, message: { id: row.id, from: row.sender, text: row.text, ts: row.ts } };
  }

  deletedIds(){
    return this.sql.exec('SELECT id FROM deleted ORDER BY id').toArray().map(r => r.id);
  }

  // A valid `after` resumes from there (a reconnect that only wants what
  // it missed); anything else is a fresh client and gets the latest page.
  messagesAfter(after){
    const rows = Number.isFinite(after) && after >= 0
      ? this.sql.exec('SELECT id, sender, text, ts, gif, game, mentions FROM messages WHERE id > ? ORDER BY id ASC LIMIT ?', after, MAX_CATCHUP_MESSAGES).toArray()
      : this.sql.exec('SELECT * FROM (SELECT id, sender, text, ts, gif, game, mentions FROM messages ORDER BY id DESC LIMIT ?) ORDER BY id ASC', HISTORY_ON_FRESH_CONNECT).toArray();
    return rows.map(r => {
      const message = { id: r.id, from: r.sender, text: r.text, ts: r.ts };
      if(r.gif) message.gif = JSON.parse(r.gif);
      if(r.game) message.game = JSON.parse(r.game);
      if(r.mentions) message.mentions = JSON.parse(r.mentions);
      return message;
    });
  }

  // Every retained message's reactions, { messageId: { emoji: [sender] } }.
  // Bounded by KEEP_MESSAGES x (emoji x drafters), so it's cheap to send
  // whole on every (re)connect.
  reactionSnapshot(){
    const byMessage = {};
    this.sql.exec('SELECT message_id, emoji, sender FROM reactions ORDER BY rowid').toArray().forEach(r => {
      const forMessage = byMessage[r.message_id] || (byMessage[r.message_id] = {});
      (forMessage[r.emoji] || (forMessage[r.emoji] = [])).push(r.sender);
    });
    return byMessage;
  }

  reactionsFor(messageId){
    const reactions = {};
    this.sql.exec('SELECT emoji, sender FROM reactions WHERE message_id = ? ORDER BY rowid', messageId).toArray().forEach(r => {
      (reactions[r.emoji] || (reactions[r.emoji] = [])).push(r.sender);
    });
    return reactions;
  }

  // Sliding-window flood limit, shared by messages and reactions. The
  // window lives on the socket (see the header) so it survives hibernation.
  // Returns false (after telling the client why) when over the limit.
  allowFrom(ws){
    const now = Date.now();
    const attachment = ws.deserializeAttachment() || { sent: [] };
    const recent = attachment.sent.filter(t => now - t < RATE_WINDOW_MS);
    if(recent.length >= RATE_MAX_MESSAGES){
      ws.send(JSON.stringify({ type: 'error', reason: 'rate' }));
      return false;
    }
    recent.push(now);
    ws.serializeAttachment({ ...attachment, sent: recent });
    return true;
  }

  broadcast(payload){
    const frame = JSON.stringify(payload);
    for(const socket of this.ctx.getWebSockets()){
      try { socket.send(frame); } catch (e){}
    }
  }

  handleReact(ws, msg){
    const exists = Number.isInteger(msg.messageId) && this.sql.exec('SELECT 1 FROM messages WHERE id = ?', msg.messageId).toArray().length > 0;
    if(!socketDrafterIds(ws).includes(msg.from) || !REACTION_EMOJI.includes(msg.emoji) || !exists){
      ws.send(JSON.stringify({ type: 'error', reason: 'invalid' }));
      return;
    }
    if(!this.allowFrom(ws)) return;

    const removed = this.sql.exec('DELETE FROM reactions WHERE message_id = ? AND sender = ? AND emoji = ? RETURNING message_id', msg.messageId, msg.from, msg.emoji).toArray().length;
    if(!removed) this.sql.exec('INSERT INTO reactions (message_id, sender, emoji) VALUES (?, ?, ?)', msg.messageId, msg.from, msg.emoji);

    this.broadcast({ type: 'reactions', messageId: msg.messageId, reactions: this.reactionsFor(msg.messageId) });
  }

  async webSocketMessage(ws, raw){
    if(typeof raw !== 'string') return;

    let msg;
    try {
      msg = JSON.parse(raw);
    } catch (e){
      return;
    }
    if(!msg) return;
    if(msg.type === 'react') return this.handleReact(ws, msg);
    if(msg.type === 'presence') return this.handlePresence(ws, msg);
    if(msg.type !== 'send') return;

    // A GIF or game field that's present but malformed is rejected
    // outright, not quietly downgraded to a text-only message.
    const gif = msg.gif === undefined ? null : parseGif(msg.gif);
    const game = msg.game === undefined ? null : parseGame(msg.game);
    // A game's text is always written here, from the validated snapshot:
    // it's what older app versions show instead of the card, and the
    // alert's body.
    const text = game ? gameText(game) : (typeof msg.text === 'string' ? msg.text.trim().slice(0, MAX_TEXT_LENGTH) : '');
    if(!socketDrafterIds(ws).includes(msg.from) || (msg.gif !== undefined && !gif) || (msg.game !== undefined && !game) || (gif && game) || (!text && !gif)){
      ws.send(JSON.stringify({ type: 'error', reason: 'invalid' }));
      return;
    }

    if(!this.allowFrom(ws)) return;
    const mentions = await this.allowedMentions(ws, msg);

    const now = Date.now();
    const { id } = this.sql.exec('INSERT INTO messages (sender, text, ts, gif, game, mentions) VALUES (?, ?, ?, ?, ?, ?) RETURNING id', msg.from, text, now, gif ? JSON.stringify(gif) : null, game ? JSON.stringify(game) : null, mentions.length ? JSON.stringify(mentions) : null).one();
    this.sql.exec('DELETE FROM messages WHERE id <= ?', id - KEEP_MESSAGES);
    this.sql.exec('DELETE FROM reactions WHERE message_id <= ?', id - KEEP_MESSAGES);
    this.sql.exec('DELETE FROM deleted WHERE id <= ?', id - KEEP_MESSAGES);

    const message = { id, from: msg.from, text, ts: now };
    if(gif) message.gif = gif;
    if(game) message.game = game;
    if(mentions.length) message.mentions = mentions;
    this.broadcast({ type: 'message', message });
    // Awaited after the broadcast, so everyone connected already has the
    // message; it just keeps the room awake until the pushes are out.
    await this.pushMessage(socketGroup(ws), message);
  }

  // The drafters a message may tag. "@everyone" is the commissioner's
  // only: it needs the password (or an admin page token) on the send,
  // and is dropped, not refused, without it, so the message still posts.
  async allowedMentions(ws, msg){
    const mentions = parseMentions(msg.mentions, socketDrafterIds(ws), msg.from);
    if(!mentions.includes(EVERYONE)) return mentions;
    const attachment = ws.deserializeAttachment() || { sent: [] };
    const group = socketGroup(ws);
    let ok = false;
    if((attachment.authFailures || 0) < MAX_AUTH_FAILURES){
      ok = await checkCommissionerSecret(msg.auth, this.env[adminSecretName(group)], group);
      if(!ok) ws.serializeAttachment({ ...(ws.deserializeAttachment() || attachment), authFailures: (attachment.authFailures || 0) + 1 });
    }
    return ok ? mentions : mentions.filter(id => id !== EVERYONE);
  }

  // Presence is per socket (a drafter can have the app open on two
  // devices) and lives on the socket's attachment, so it survives
  // hibernation and disappears with the socket.
  handlePresence(ws, msg){
    if(!socketDrafterIds(ws).includes(msg.from)) return;
    const attachment = ws.deserializeAttachment() || { sent: [] };
    ws.serializeAttachment({ ...attachment, who: msg.from, visible: !!msg.visible });
  }

  // Alerts everyone in the group but the sender and anyone with the app
  // on screen right now. The phone collapses a run of these into one
  // notification (see sw.js), and the Topic does the same for a phone
  // that's offline. Anyone the message tags gets a mention alert instead,
  // which stands on its own ("Josh mentioned you") and has its own switch.
  async pushMessage(group, message){
    const watching = new Set();
    for(const socket of this.ctx.getWebSockets()){
      const a = socket.deserializeAttachment() || {};
      if(a.visible && a.who) watching.add(a.who);
    }
    const recipients = drafterIdsFor(group).filter(id => id !== message.from && !watching.has(id));
    const text = message.text.length > PUSH_PREVIEW_LENGTH ? `${message.text.slice(0, PUSH_PREVIEW_LENGTH - 1)}…` : message.text;
    // Confirmed spots (worker/roster.js) carry their real name, not the placeholder.
    const sender = (await effectiveDrafters(this.env, group)).find(d => d.id === message.from);
    const { tagged, others } = splitRecipients(recipients, message.mentions);
    const name = sender ? sender.name : 'Someone';
    await Promise.all([
      pushToDrafters(this.env, group, others, 'chat', {
        kind: 'chat',
        title: sender ? sender.name : 'Chat',
        body: text || 'Sent a GIF',
        url: './?view=chat',
        tag: 'chat',
        id: message.id
      }, { ttl: 6 * 60 * 60, urgency: 'normal', topic: 'chat' }),
      pushToDrafters(this.env, group, tagged, 'mention', {
        kind: 'mention',
        title: (message.mentions || []).includes(EVERYONE) ? `${name} mentioned everyone` : `${name} mentioned you`,
        body: text || 'Sent a GIF',
        url: './?view=chat',
        tag: 'mention',
        id: message.id
      }, { ttl: 24 * 60 * 60, urgency: 'high', topic: 'mention' })
    ]);
  }

  async webSocketClose(ws, code){
    // 1005/1006 are reserved "no status" codes and throw if passed to close().
    try { ws.close(code >= 1000 && code < 1005 ? code : 1000); } catch (e){}
  }

  async webSocketError(ws){
    try { ws.close(1011); } catch (e){}
  }
}
