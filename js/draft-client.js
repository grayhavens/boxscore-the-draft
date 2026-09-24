/* ============================================================
   Draft room connection: one WebSocket to the DraftRoom Durable
   Object (worker/draft-room.js), kept alive and mirrored into a small
   store the draft UI (js/draft.js) subscribes to. Nothing here knows
   about rendering, and nothing here decides what's legal — the server
   runs every action through js/draft-engine.js and answers ok/rejected;
   the client only sends actions and shows whatever state comes back.

   Same connect/backoff/dead-socket handling as chat (js/chat.js), and
   like chat it talks to `wrangler dev` on localhost so rehearsing
   locally can't touch the real room. The room name comes from `?room=`
   (default "main") so the commissioner can rehearse on throwaway rooms
   (e.g. ?view=draft&room=mock-1).

   The server's clock is authoritative for the pick clock: every state
   frame carries the server's `now`, the store keeps the offset from the
   local clock, and serverNow() applies it — so a phone with a wrong
   clock still counts down correctly.
   ============================================================ */
import { chatWorkerBase } from './api.js';
import { loadAdminPassword, saveAdminPassword } from './utils.js';
import { currentProfileId } from './identity.js';

const RECONNECT_MAX_MS = 15000;
const PING_EVERY_MS = 25000;
const DEAD_AFTER_MS = 50000;
const ACK_TIMEOUT_MS = 8000;

function roomName(){
  try {
    const room = new URLSearchParams(window.location.search).get('room');
    if(room && /^[a-z0-9-]{1,32}$/.test(room)) return room;
  } catch (e){}
  return 'main';
}

export const draftStore = {
  room: roomName(),
  status: 'idle',        // 'idle' | 'connecting' | 'open' | 'offline'
  state: null,           // the server's public state (no pool), null until hello
  pool: [],
  queue: [],             // this drafter's ranked shortlist of team ids
  commissioner: false,   // this socket has authenticated as commissioner
  authFailed: false,
  clockOffset: 0         // serverNow() = Date.now() + clockOffset
};

const listeners = new Set();
export function subscribeDraft(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function notify(){
  listeners.forEach(fn => { try { fn(draftStore); } catch (e){ console.error('[Draft]', e); } });
}

export function serverNow(){
  return Date.now() + draftStore.clockOffset;
}

let socket = null;
let wanted = false;              // the draft view is open, so stay connected
let reconnectDelay = 1000;
let reconnectTimer = null;
let pingTimer = null;
let lastHeard = 0;
let nextId = 1;
const pending = new Map();       // action id -> { resolve, timer }
let authResolve = null;
let wantsCommissioner = false;   // re-authenticate on every reconnect

function socketUrl(){
  return `${chatWorkerBase().replace(/^http/, 'ws')}/draft/ws?room=${draftStore.room}`;
}

function setStatus(status){
  if(draftStore.status === status) return;
  draftStore.status = status;
  notify();
}

function failPending(error){
  pending.forEach(p => { clearTimeout(p.timer); p.resolve({ ok: false, error }); });
  pending.clear();
}

function sendFrame(frame){
  if(!socket || socket.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(frame));
  return true;
}

export function requestDraftQueue(){
  sendFrame({ type: 'getQueue', from: currentProfileId });
}

function onFrame(frame){
  lastHeard = Date.now();
  switch(frame.type){
    case 'hello':
      draftStore.state = frame.state;
      draftStore.pool = frame.pool || [];
      draftStore.clockOffset = frame.now - Date.now();
      requestDraftQueue();
      if(wantsCommissioner){
        const password = loadAdminPassword();
        if(password) sendFrame({ type: 'auth', password });
      }
      break;
    case 'state':
      draftStore.state = frame.state;
      draftStore.clockOffset = frame.now - Date.now();
      break;
    case 'pool':
      draftStore.pool = frame.pool || [];
      break;
    case 'queue':
      draftStore.queue = frame.teams || [];
      break;
    case 'authed':
      draftStore.commissioner = !!frame.ok;
      draftStore.authFailed = !frame.ok;
      if(authResolve){ authResolve(!!frame.ok); authResolve = null; }
      break;
    case 'ok':
    case 'rejected': {
      const p = pending.get(frame.id);
      if(p){
        pending.delete(frame.id);
        clearTimeout(p.timer);
        p.resolve(frame.type === 'ok' ? { ok: true } : { ok: false, error: frame.error, detail: frame.detail });
      }
      return; // no state change to announce
    }
    default:
      return;
  }
  notify();
}

function connect(){
  if(!wanted) return;
  if(socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(reconnectTimer);
  setStatus(draftStore.state ? 'offline' : 'connecting');

  let ws;
  try {
    ws = new WebSocket(socketUrl());
  } catch (e){
    scheduleReconnect();
    return;
  }
  socket = ws;
  ws.addEventListener('open', () => {
    reconnectDelay = 1000;
    lastHeard = Date.now();
    setStatus('open');
    clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if(Date.now() - lastHeard > DEAD_AFTER_MS){ try { ws.close(); } catch (e){} return; }
      try { ws.send('ping'); } catch (e){}
    }, PING_EVERY_MS);
  });
  ws.addEventListener('message', ev => {
    if(ev.data === 'pong'){ lastHeard = Date.now(); return; }
    try { onFrame(JSON.parse(ev.data)); } catch (e){ console.error('[Draft] bad frame', e); }
  });
  ws.addEventListener('close', () => {
    if(socket !== ws) return;
    clearInterval(pingTimer);
    draftStore.commissioner = false;
    failPending('offline');
    if(authResolve){ authResolve(false); authResolve = null; }
    setStatus(wanted ? 'offline' : 'idle');
    scheduleReconnect();
  });
  ws.addEventListener('error', () => {});
}

function scheduleReconnect(){
  if(!wanted) return;
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

function reconnectNow(){
  if(!wanted) return;
  reconnectDelay = 1000;
  connect();
}

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && wanted && (!socket || socket.readyState !== WebSocket.OPEN)) reconnectNow();
});
window.addEventListener('online', reconnectNow);

// The draft view is on screen: connect (and stay connected).
export function openDraftConnection(){
  wanted = true;
  connect();
}

// The draft view was left: drop the socket so an idle tab doesn't hold
// the room awake. Keeps the last state so reopening paints instantly.
export function closeDraftConnection(){
  wanted = false;
  clearTimeout(reconnectTimer);
  clearInterval(pingTimer);
  if(socket){ try { socket.close(); } catch (e){} }
  socket = null;
  failPending('offline');
  draftStore.commissioner = false;
  setStatus('idle');
}

// Sends a reducer action as `from` (a drafter id, or null for a
// commissioner acting as no one). Resolves { ok: true } or
// { ok: false, error, detail } — including error 'offline' if the socket
// isn't up or the room doesn't answer.
export function sendDraftAction(from, action){
  return new Promise(resolve => {
    const id = nextId++;
    const timer = setTimeout(() => { pending.delete(id); resolve({ ok: false, error: 'offline' }); }, ACK_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    if(!sendFrame({ type: 'action', id, from, action })){
      pending.delete(id);
      clearTimeout(timer);
      resolve({ ok: false, error: 'offline' });
    }
  });
}

// Authenticates this socket as commissioner with the admin password (the
// same one the Manage Scoring page uses), remembered on this device on
// success. Resolves true/false.
export function signInCommissioner(password){
  return new Promise(resolve => {
    wantsCommissioner = true;
    authResolve = ok => {
      if(ok) saveAdminPassword(password);
      else wantsCommissioner = false;
      resolve(ok);
    };
    if(!sendFrame({ type: 'auth', password })){ authResolve = null; wantsCommissioner = false; resolve(false); }
  });
}

// Reconnects as commissioner using the password saved on this device, if any.
export function resumeCommissioner(){
  if(!loadAdminPassword()) return false;
  wantsCommissioner = true;
  const password = loadAdminPassword();
  return sendFrame({ type: 'auth', password });
}

export function saveDraftQueue(teams){
  draftStore.queue = teams;
  sendFrame({ type: 'queue', from: currentProfileId, teams });
  notify();
}
