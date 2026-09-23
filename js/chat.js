/* ============================================================
   Real-time group chat — client for worker/chat-room.js's Durable
   Object (see that file's header for the wire protocol and why it
   isn't built on KV like the rest of the worker's stores).

   The chat screen (#view-chat in index.html) is the Chat tab — a real
   view that js/board.js's switchView shows/hides like any other, calling
   setChatActive here on every switch. Unlike the other views it's fixed
   to the visual viewport (see syncViewport) so the keyboard can't cover
   the composer.

   The socket opens at boot (not on first open of the screen) so the
   tab bar's unread badge is live everywhere. Who "you" are comes from
   js/identity.js — same no-auth trust tier as favorites.
   ============================================================ */
import { DRAFT_TEAMS } from './data.js';
import { DASHBOARD_WORKER_BASE, chatWorkerBase } from './api.js';
import { currentProfileId } from './identity.js';
import { lockBodyScroll, unlockBodyScroll } from './utils.js';
import { loadGifKey, reportGifShare } from './gifs.js';
import { initGifPicker, closeGifPicker, toggleGifPicker } from './gif-picker.js';

const CACHE_KEY = 'teamDashboardChatMessages';
const SEEN_KEY = 'teamDashboardChatSeenId';
const MAX_MESSAGES_KEPT = 300;
const MAX_TEXT_LENGTH = 1000;
const GROUP_GAP_MS = 5 * 60 * 1000;   // same sender within this window shares one name/time header
const PING_INTERVAL_MS = 20000;
const DEAD_AFTER_MS = 50000;          // no frame (pong included) this long -> socket is half-dead, reconnect
const RECONNECT_MAX_MS = 15000;
const STICK_TO_BOTTOM_PX = 120;

// Mirrors REACTION_EMOJI in worker/chat-room.js (which rejects anything
// else). Also the order the picker and a message's pills are shown in.
const REACTION_EMOJI = ['👍', '👎', '😂', '😮', '😢', '🔥', '😎'];

function chatSocketUrl(after){
  return `${chatWorkerBase().replace(/^http/, 'ws')}/chat/ws${after ? `?after=${after}` : ''}`;
}

let messages = loadCachedMessages();
let seenId = loadSeenId();
let socket = null;
let status = 'connecting';   // 'connecting' | 'open' | 'offline'
let reconnectDelay = 1000;
let reconnectTimer = null;
let lastHeard = 0;
let open = false;
let pickerId = null;         // id of the message whose reaction picker is showing, if any

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
    mergeMessages(frame.messages, frame.reactions);
  } else if(frame.type === 'message' && frame.message){
    mergeMessages([frame.message]);
  } else if(frame.type === 'reactions' && frame.reactions){
    applyReactions(frame.messageId, frame.reactions);
  }
}

// A message's reactions live on the message itself (`m.reactions`, same
// shape as the wire: { emoji: [drafterId] }) so they're cached to
// localStorage with it. `snapshot` is the history frame's reactions for
// every message the room still holds — the only way a reconnect learns
// about a reaction added to an older message while it was away — and it's
// authoritative for the messages it covers, so a message missing from it
// has none.
function mergeMessages(incoming, snapshot){
  const byId = new Map(messages.map(m => [m.id, m]));
  incoming.forEach(m => byId.set(m.id, m));
  messages = [...byId.values()].sort((a, b) => a.id - b.id).slice(-MAX_MESSAGES_KEPT);
  if(snapshot){
    messages.forEach(m => {
      if(snapshot[m.id]) m.reactions = snapshot[m.id];
      else delete m.reactions;
    });
  }
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

function applyReactions(messageId, reactions){
  const m = messages.find(x => x.id === messageId);
  if(!m) return;
  if(Object.keys(reactions).length) m.reactions = reactions;
  else delete m.reactions;
  saveCachedMessages();
  if(open) renderList(false);
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

// Tab bar Chat button badge (see index.html). Called from
// js/board.js too, whenever the active profile changes, since "unread"
// excludes your own messages.
export function paintBadges(){
  const n = unreadCount();
  document.querySelectorAll('.chat-badge').forEach(el => {
    el.textContent = n > 9 ? '9+' : String(n);
    el.classList.toggle('show', n > 0);
  });
  document.querySelectorAll('.chat-hit').forEach(el => {
    el.setAttribute('aria-label', n > 0 ? `Chat, ${n} unread` : 'Chat');
  });
}

function markSeen(){
  const id = lastId();
  if(seenId !== null && id <= seenId) return;
  seenId = id;
  saveSeenId();
}

// ---- Screen ----

const screenEl = () => document.getElementById('view-chat');
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

// A GIF message. width/height + aspect-ratio reserve the image's space
// before it loads, so the list doesn't jump (or lose its stick-to-bottom
// position) as each one arrives. The URL is used exactly as KLIPY gave it
// — the worker only ever stores hosts it recognizes (worker/chat-room.js).
function gifBubbleHtml(m, mine){
  return `<div class="chat-gif ${mine ? 'mine' : ''}" data-msg="${m.id}" style="aspect-ratio:${m.gif.w} / ${m.gif.h}"><img src="${esc(m.gif.url)}" width="${m.gif.w}" height="${m.gif.h}" alt="GIF" loading="lazy" decoding="async"></div>`;
}

// Tapping a message toggles its picker (an in-flow row of the six emoji,
// with the ones you've already used highlighted); tapping an emoji there,
// or a pill under the message, toggles that reaction for you. Both carry
// data-react/data-mid and are handled by one delegated listener (see
// onListClick) since renderList rebuilds the list's innerHTML.
function reactionButtonHtml(cls, m, emoji, inner, label, extraAttrs = ''){
  return `<button type="button" class="${cls}" data-react="${emoji}" data-mid="${m.id}" aria-label="${esc(label)}"${extraAttrs}>${inner}</button>`;
}

function reactionsHtml(m, mine){
  const reactions = m.reactions || {};
  const pills = REACTION_EMOJI.filter(e => reactions[e] && reactions[e].length).map(e => {
    const who = reactions[e];
    const on = who.includes(currentProfileId);
    const names = who.map(drafterName).join(', ');
    return reactionButtonHtml(`chat-react-pill${on ? ' on' : ''}`, m, e, `${e}<span>${who.length}</span>`, `${e} ${names}`, ` title="${esc(names)}" aria-pressed="${on}"`);
  }).join('');
  return pills ? `<div class="chat-reactions ${mine ? 'mine' : ''}">${pills}</div>` : '';
}

function pickerHtml(m, mine){
  const reactions = m.reactions || {};
  const buttons = REACTION_EMOJI.map(e => {
    const on = (reactions[e] || []).includes(currentProfileId);
    return reactionButtonHtml(`chat-react-opt${on ? ' on' : ''}`, m, e, e, `React ${e}`);
  }).join('');
  return `<div class="chat-react-bar ${mine ? 'mine' : ''}">${buttons}</div>`;
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
    if(m.gif) html += gifBubbleHtml(m, mine);
    // A GIF's text is an optional caption (the picker never sends one, but
    // the worker accepts one) — shown under it rather than silently dropped.
    if(m.text) html += `<div class="chat-bubble ${mine ? 'mine' : ''}" data-msg="${m.id}">${esc(m.text)}</div>`;
    if(pickerId === m.id) html += pickerHtml(m, mine);
    html += reactionsHtml(m, mine);
    prev = m;
  });
  el.innerHTML = html;

  if(forceScroll || nearBottom) el.scrollTop = el.scrollHeight;
}

function toggleReaction(messageId, emoji){
  if(!socket || socket.readyState !== WebSocket.OPEN){
    reconnectNow();
    return;
  }
  socket.send(JSON.stringify({ type: 'react', from: currentProfileId, messageId, emoji }));
  // The new state arrives back over the socket like everyone else's
  // (the room broadcasts to the sender too) — nothing to apply here.
  if(pickerId !== null){
    pickerId = null;
    renderList(false);
  }
}

function onListClick(event){
  const target = event.target;
  const button = target.closest('[data-react]');
  if(button){
    toggleReaction(Number(button.dataset.mid), button.dataset.react);
    return;
  }
  if(target.closest('.chat-react-bar')) return;
  // Finishing a text selection (long-press, drag) ends in a click too.
  if(window.getSelection().toString()) return;

  const message = target.closest('[data-msg]');
  const next = message && Number(message.dataset.msg) !== pickerId ? Number(message.dataset.msg) : null;
  if(next === pickerId) return;
  pickerId = next;
  renderList(false);
}

// The chat screen tracks the visual viewport, not the layout viewport:
// on iOS the on-screen keyboard shrinks only the former, so sizing the
// fixed screen to it is what keeps the composer above the keyboard
// instead of hidden behind it. With the keyboard down the screen stops
// at the tab bar; with it up the tab bar is hidden (html.chat-kb) and
// the composer sits directly on the keys, the way phone chat apps do.
function syncViewport(){
  const el = screenEl();
  const vv = window.visualViewport;
  if(!el || !vv || !open) return;
  const kbOpen = window.innerHeight - vv.height > 120;
  document.documentElement.classList.toggle('chat-kb', kbOpen);
  const tabBar = document.querySelector('.tab-bar');
  const barH = kbOpen || !tabBar ? 0 : tabBar.offsetHeight;
  el.style.height = `${vv.height - barH}px`;
  el.style.top = `${vv.offsetTop}px`;
  // The composer never pads for the home indicator: with the keyboard
  // down the tab bar owns that gap, with it up the keyboard covers it.
  el.classList.toggle('kb-open', kbOpen);
  const list = listEl();
  if(list && open) list.scrollTop = list.scrollHeight;
}

// lockBodyScroll (position: fixed on <body>) isn't enough on iOS: a swipe
// that starts on the header/composer, or that overshoots the end of the
// message list, still pans the page behind the overlay (older iOS ignores
// `overscroll-behavior` entirely, and even new versions only honor it on
// the scroller itself). So take those gestures away explicitly: nothing
// outside the message list (and the composer's own textarea) scrolls,
// and a swipe in the list that would scroll past its top/bottom is
// cancelled instead of chaining out to the page. Needs a non-passive
// listener, since passive ones can't preventDefault.
function guardTouchScroll(screen){
  let lastY = 0;
  screen.addEventListener('touchstart', event => {
    lastY = event.touches[0].clientY;
  }, { passive: true });

  screen.addEventListener('touchmove', event => {
    const y = event.touches[0].clientY;
    const dy = y - lastY;
    lastY = y;

    const target = event.target;
    if(target.closest && target.closest('#chat-input, #gif-search')) return;

    // The message list and (while open) the GIF picker's grid are the
    // only things that scroll; each is guarded at its own edges.
    const list = target.closest && target.closest('#chat-list, #gif-grid');
    if(!list){
      event.preventDefault();
      return;
    }

    const atTop = list.scrollTop <= 0;
    const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
    if((atTop && dy > 0) || (atBottom && dy < 0)) event.preventDefault();
  }, { passive: false });
}

// Called by js/board.js's switchView on every tab switch, so this runs
// on the way out of the Chat tab too.
export function setChatActive(active){
  const el = screenEl();
  if(!el || active === open) return;
  open = active;
  if(active){
    lockBodyScroll();
    document.documentElement.classList.add('chat-open');
    setStatus(status);
    markSeen();
    paintBadges();
    renderList(true);
    syncViewport();
    if(!socket || socket.readyState !== WebSocket.OPEN) reconnectNow();
    if(!gifsReady) setUpGifs();
  } else {
    closeGifPicker();
    pickerId = null;
    inputEl().blur();
    document.documentElement.classList.remove('chat-open', 'chat-kb');
    unlockBodyScroll();
    paintBadges();
  }
}

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

// Picking a GIF sends it right away (no caption step), the way phone chat
// apps do. Only the fields the worker stores are sent — see parseGif in
// worker/chat-room.js. If the socket isn't up, the picker stays open so
// the pick isn't lost.
function sendGif(item, query){
  if(!socket || socket.readyState !== WebSocket.OPEN){
    reconnectNow();
    return;
  }
  socket.send(JSON.stringify({ type: 'send', from: currentProfileId, gif: { slug: item.slug, url: item.url, w: item.w, h: item.h } }));
  reportGifShare(item.slug, query);
  closeGifPicker();
}

// The panel takes its height out of the message list's, so re-pin the
// list to the bottom afterwards — otherwise the latest message ends up
// hidden behind the panel.
function pinListToBottom(){
  const list = listEl();
  if(list) list.scrollTop = list.scrollHeight;
}
window.toggleGifPicker = () => { toggleGifPicker(); pinListToBottom(); };
window.closeGifPicker = () => { closeGifPicker(); pinListToBottom(); };

// ---- Boot ----

// Reveals the GIF button once the KLIPY key is available (see
// js/gifs.js's loadGifKey). Safe to call repeatedly: it's a no-op once
// set up, and a failed lookup at boot gets another try each time chat is
// opened, rather than leaving GIFs off until the next reload.
let gifsReady = false;
async function setUpGifs(){
  if(gifsReady || !(await loadGifKey()) || gifsReady) return;
  gifsReady = true;
  document.getElementById('chat-gif-btn').hidden = false;
  initGifPicker({ onPick: sendGif });
}

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
  if(screenEl()) guardTouchScroll(screenEl());
  if(listEl()) listEl().addEventListener('click', onListClick);
  setUpGifs();
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  paintBadges();
  connect();
}
