/* ============================================================
   Real-time group chat — client for worker/chat-room.js's Durable
   Object (see that file's header for the wire protocol and why it
   isn't built on KV like the rest of the worker's stores).

   The chat screen (#chat-screen in index.html) is an overlay opened
   from the header icon on every view, in the same family as the
   identity sheet — not a tab and not a `.view`, so switchView, the
   ?view= URL param, and whichever tab is underneath are all left
   completely alone; closing it puts you exactly where you were.

   The socket opens at boot (not on first open of the screen) so the
   header's unread badge is live everywhere. Who "you" are comes from
   js/identity.js — same no-auth trust tier as favorites.
   ============================================================ */
import { DRAFT_TEAMS } from './data.js';
import { DASHBOARD_WORKER_BASE } from './api.js';
import { currentProfileId } from './identity.js';
import { lockBodyScroll, unlockBodyScroll } from './utils.js';

const CACHE_KEY = 'teamDashboardChatMessages';
const SEEN_KEY = 'teamDashboardChatSeenId';
const MAX_MESSAGES_KEPT = 300;
const MAX_TEXT_LENGTH = 1000;
const GROUP_GAP_MS = 5 * 60 * 1000;   // same sender within this window shares one name/time header
const PING_INTERVAL_MS = 20000;
const DEAD_AFTER_MS = 50000;          // no frame (pong included) this long -> socket is half-dead, reconnect
const RECONNECT_MAX_MS = 15000;
const STICK_TO_BOTTOM_PX = 120;

// On a local preview the dashboard talks to `wrangler dev` (port 8787)
// instead of the deployed worker, so poking at chat locally never posts
// into the group's real room.
function chatSocketUrl(after){
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const base = isLocal ? 'ws://localhost:8787' : DASHBOARD_WORKER_BASE.replace(/^http/, 'ws');
  return `${base}/chat/ws${after ? `?after=${after}` : ''}`;
}

let messages = loadCachedMessages();
let seenId = loadSeenId();
let socket = null;
let status = 'connecting';   // 'connecting' | 'open' | 'offline'
let reconnectDelay = 1000;
let reconnectTimer = null;
let lastHeard = 0;
let open = false;

function loadCachedMessages(){
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY));
    return Array.isArray(parsed) ? parsed : [];
  } catch (e){
    return [];
  }
}

function saveCachedMessages(){
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(messages)); } catch (e){}
}

// null = never opened chat on this device (see mergeMessages: the first
// history a device ever sees shouldn't all count as unread).
function loadSeenId(){
  try {
    const n = parseInt(localStorage.getItem(SEEN_KEY), 10);
    return Number.isFinite(n) ? n : null;
  } catch (e){
    return null;
  }
}

function saveSeenId(){
  try { localStorage.setItem(SEEN_KEY, String(seenId)); } catch (e){}
}

function lastId(){
  return messages.length ? messages[messages.length - 1].id : 0;
}

function esc(s){
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function drafterName(id){
  const d = DRAFT_TEAMS.find(t => t.id === id);
  return d ? d.name : id;
}

// ---- Connection ----

function connect(){
  if(!DASHBOARD_WORKER_BASE) return;
  if(socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  clearTimeout(reconnectTimer);
  setStatus('connecting');

  let ws;
  try {
    ws = new WebSocket(chatSocketUrl(lastId()));
  } catch (e){
    scheduleReconnect();
    return;
  }
  socket = ws;

  ws.addEventListener('open', () => {
    if(socket !== ws) return;
    reconnectDelay = 1000;
    lastHeard = Date.now();
    setStatus('open');
  });
  ws.addEventListener('message', event => {
    if(socket !== ws) return;
    lastHeard = Date.now();
    handleFrame(event.data);
  });
  ws.addEventListener('close', () => {
    if(socket !== ws) return;
    socket = null;
    setStatus('offline');
    scheduleReconnect();
  });
  // A failed connect fires 'error' and then 'close' — reconnect is
  // handled once, in 'close' above.
  ws.addEventListener('error', () => {});
}

function scheduleReconnect(){
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
}

// iOS suspends a backgrounded PWA's sockets without telling the page,
// so a "connected" socket after coming back can be dead. The ping loop
// below catches that within a tick; this just skips the wait when the
// socket is already known-closed.
function reconnectNow(){
  reconnectDelay = 1000;
  connect();
}

function handleFrame(raw){
  if(raw === 'pong') return;
  let frame;
  try { frame = JSON.parse(raw); } catch (e){ return; }

  if(frame.type === 'history' && Array.isArray(frame.messages)){
    mergeMessages(frame.messages);
  } else if(frame.type === 'message' && frame.message){
    mergeMessages([frame.message]);
  }
}

function mergeMessages(incoming){
  const byId = new Map(messages.map(m => [m.id, m]));
  incoming.forEach(m => byId.set(m.id, m));
  messages = [...byId.values()].sort((a, b) => a.id - b.id).slice(-MAX_MESSAGES_KEPT);
  saveCachedMessages();

  // First history this device has ever seen: everything already in the
  // room is backlog, not "new" — start the unread count from now.
  if(seenId === null){
    seenId = lastId();
    saveSeenId();
  }
  if(open) markSeen();
  paintBadges();
  if(open) renderList(incoming.some(m => m.from === currentProfileId));
}

// Ping loop: keeps the connection warm through idle-timeouts and
// notices a socket that died silently (see reconnectNow).
setInterval(() => {
  if(!socket || socket.readyState !== WebSocket.OPEN) return;
  if(Date.now() - lastHeard > DEAD_AFTER_MS){
    socket.close();
    return;
  }
  try { socket.send('ping'); } catch (e){}
}, PING_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && (!socket || socket.readyState !== WebSocket.OPEN)) reconnectNow();
});
window.addEventListener('online', reconnectNow);

// ---- Unread badge ----

function unreadCount(){
  if(seenId === null) return 0;
  return messages.filter(m => m.id > seenId && m.from !== currentProfileId).length;
}

// Header icon badge (one per view header — see index.html). Called from
// js/board.js too, whenever the active profile changes, since "unread"
// excludes your own messages.
export function paintBadges(){
  const n = unreadCount();
  document.querySelectorAll('.chat-badge').forEach(el => {
    el.textContent = n > 9 ? '9+' : String(n);
    el.classList.toggle('show', n > 0);
  });
  document.querySelectorAll('.chat-hit').forEach(el => {
    el.setAttribute('aria-label', n > 0 ? `Open chat, ${n} unread` : 'Open chat');
  });
}

function markSeen(){
  const id = lastId();
  if(seenId !== null && id <= seenId) return;
  seenId = id;
  saveSeenId();
}

// ---- Screen ----

const screenEl = () => document.getElementById('chat-screen');
const listEl = () => document.getElementById('chat-list');
const inputEl = () => document.getElementById('chat-input');

function setStatus(next){
  status = next;
  const el = document.getElementById('chat-status');
  if(!el) return;
  el.textContent = next === 'open' ? 'Live' : (next === 'connecting' ? 'Connecting…' : 'Reconnecting…');
  el.dataset.state = next;
}

function dayLabel(ts){
  const d = new Date(ts);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if(d.toDateString() === today.toDateString()) return 'Today';
  if(d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function timeLabel(ts){
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function renderList(forceScroll){
  const el = listEl();
  if(!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;

  if(!messages.length){
    el.innerHTML = `<div class="chat-empty">No messages yet.<br>Say something to the group.</div>`;
    return;
  }

  let html = '';
  let prev = null;
  messages.forEach(m => {
    const mine = m.from === currentProfileId;
    const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
    if(newDay) html += `<div class="chat-day">${esc(dayLabel(m.ts))}</div>`;
    const startsGroup = newDay || prev.from !== m.from || m.ts - prev.ts > GROUP_GAP_MS;
    if(startsGroup){
      html += `<div class="chat-meta ${mine ? 'mine' : ''}">${mine ? '' : `<span class="chat-name">${esc(drafterName(m.from))}</span>`}<span class="chat-time">${esc(timeLabel(m.ts))}</span></div>`;
    }
    html += `<div class="chat-bubble ${mine ? 'mine' : ''}">${esc(m.text)}</div>`;
    prev = m;
  });
  el.innerHTML = html;

  if(forceScroll || nearBottom) el.scrollTop = el.scrollHeight;
}

// The chat screen tracks the visual viewport, not the layout viewport:
// on iOS the on-screen keyboard shrinks only the former, so sizing the
// fixed screen to it is what keeps the composer above the keyboard
// instead of hidden behind it.
function syncViewport(){
  const el = screenEl();
  const vv = window.visualViewport;
  if(!el || !vv) return;
  el.style.height = `${vv.height}px`;
  el.style.top = `${vv.offsetTop}px`;
  // env(safe-area-inset-bottom) (the home-indicator gap) is still
  // reported with the keyboard up but the keyboard covers it, which
  // would leave a dead strip above the keys — the CSS drops it while
  // this class is set.
  el.classList.toggle('kb-open', window.innerHeight - vv.height > 120);
  const list = listEl();
  if(list && open) list.scrollTop = list.scrollHeight;
}

export function openChat(){
  const el = screenEl();
  if(!el || open) return;
  open = true;
  lockBodyScroll();
  el.classList.add('open');
  el.classList.remove('view-push-in');
  void el.offsetWidth;
  el.classList.add('view-push-in');
  setStatus(status);
  markSeen();
  paintBadges();
  renderList(true);
  syncViewport();
  if(!socket || socket.readyState !== WebSocket.OPEN) reconnectNow();
}
window.openChat = openChat;

export function closeChat(){
  const el = screenEl();
  if(!el || !open) return;
  open = false;
  el.classList.remove('open');
  inputEl().blur();
  unlockBodyScroll();
  paintBadges();
}
window.closeChat = closeChat;

function autoGrow(){
  const input = inputEl();
  input.style.height = 'auto';
  input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
}

function sendMessage(){
  const input = inputEl();
  const text = input.value.trim().slice(0, MAX_TEXT_LENGTH);
  if(!text) return;
  if(!socket || socket.readyState !== WebSocket.OPEN){
    // Keep what they typed — it's sendable as soon as the reconnect lands.
    reconnectNow();
    return;
  }
  socket.send(JSON.stringify({ type: 'send', from: currentProfileId, text }));
  input.value = '';
  autoGrow();
  input.focus();
}
window.sendChatMessage = sendMessage;

// ---- Boot ----

export function initChat(){
  const input = inputEl();
  if(input){
    input.addEventListener('input', autoGrow);
    // Enter sends on desktop; on a touch keyboard Enter stays a newline
    // (the send button is right there) — matching how phone chat apps behave.
    input.addEventListener('keydown', event => {
      if(event.key === 'Enter' && !event.shiftKey && window.matchMedia('(pointer: fine)').matches){
        event.preventDefault();
        sendMessage();
      }
    });
  }
  document.addEventListener('keydown', event => {
    if(event.key === 'Escape' && open) closeChat();
  });
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  paintBadges();
  connect();
}
