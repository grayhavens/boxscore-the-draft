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

   Mentions (js/chat-mentions.js): typing "@" opens a list of the group
   above the composer, and a sent message carries the ids its text tags.
   A message that tags you is outlined in gold, and while one is unread
   the tab bar's badge reads "@". The commissioner (a device with the
   password saved) can also tag @everyone, sent with the password so the
   worker can check it.
   ============================================================ */
import { DRAFT_TEAMS } from './data.js';
import { DASHBOARD_WORKER_BASE, chatWorkerBase } from './api.js';
import { withGroupQuery } from './group.js';
import { currentProfileId } from './identity.js';
import { getSettings } from './settings.js';
import { loadGifKey, reportGifShare } from './gifs.js';
import { initGifPicker, closeGifPicker, toggleGifPicker } from './gif-picker.js';
import { escapeHtml as esc, loadAdminPassword } from './utils.js';
import { EVERYONE, EVERYONE_NAME, findMentions, mentionSegments, mentionsMe, activeMentionQuery, mentionOptions } from './chat-mentions.js';
import { mentionHtml, mentionListHtml } from './ui.js';
import { clearAlerts } from './push.js';
import { gameCardHtml, openSharedGame, refreshGameLines } from './game-card.js';
import { fxOn, play, pop, burst } from './motion-fx.js';
import { EASE_SPRING } from './utils.js';

const CACHE_KEY = 'teamDashboardChatMessages';
const SEEN_KEY = 'teamDashboardChatSeenId';
const MAX_MESSAGES_KEPT = 300;
const MAX_TEXT_LENGTH = 1000;
const GROUP_GAP_MS = 5 * 60 * 1000;   // same sender within this window shares one name/time header
const PING_INTERVAL_MS = 20000;
const DEAD_AFTER_MS = 50000;          // no frame (pong included) this long -> socket is half-dead, reconnect
const RECONNECT_MAX_MS = 15000;
const STICK_TO_BOTTOM_PX = 120;
const GAME_LINE_TICK_MS = 20000;      // how often open chat checks its shared games (each game is still looked up at most once a minute)
const LONG_PRESS_MS = 450;

// Mirrors REACTION_EMOJI in worker/chat-room.js (which rejects anything
// else). Also the order the picker and a message's pills are shown in.
const REACTION_EMOJI = ['👍', '👎', '😂', '😮', '😢', '🔥', '😎'];

function chatSocketUrl(after){
  return withGroupQuery(`${chatWorkerBase().replace(/^http/, 'ws')}/chat/ws${after ? `?after=${after}` : ''}`);
}

let messages = loadCachedMessages();
let seenId = loadSeenId();
let socket = null;
let status = 'connecting';   // 'connecting' | 'open' | 'offline'
let reconnectDelay = 1000;
let reconnectTimer = null;
let lastHeard = 0;
let open = false;
let sentPresence = null;
let pickerId = null;         // id of the message whose reaction picker is showing, if any
let pendingGame = null;      // a shared game waiting for the socket to (re)connect

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


function drafterName(id){
  const d = DRAFT_TEAMS.find(t => t.id === id);
  return d ? d.name : id;
}

// Everyone a message can tag, for highlighting: the group's spots (an
// open one keeps its placeholder name) and @everyone.
function mentionCandidates(){
  return [...DRAFT_TEAMS.map(d => ({ id: d.id, name: d.name })), { id: EVERYONE, name: EVERYONE_NAME }];
}

// Who you can tag from the composer: filled spots but your own, and
// @everyone only on the commissioner's devices.
function composerCandidates(){
  const people = DRAFT_TEAMS.filter(d => !d.open && d.id !== currentProfileId).map(d => ({ id: d.id, name: d.name }));
  return loadAdminPassword() ? [...people, { id: EVERYONE, name: EVERYONE_NAME, sub: 'Alerts the whole group' }] : people;
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
    sentPresence = null;
    setStatus('open');
    sendPresence();
    if(pendingGame){
      ws.send(JSON.stringify({ type: 'send', from: currentProfileId, game: pendingGame }));
      pendingGame = null;
    }
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
    if(Array.isArray(frame.deleted)) dropMessages(frame.deleted, false);
    mergeMessages(frame.messages, frame.reactions);
  } else if(frame.type === 'message' && frame.message){
    mergeMessages([frame.message]);
  } else if(frame.type === 'reactions' && frame.reactions){
    applyReactions(frame.messageId, frame.reactions);
  } else if(frame.type === 'deleted'){
    dropMessages([frame.messageId], true);
  }
}

// Messages the admin deleted (worker/chat-room.js): live as it happens,
// and from the history frame's list for a device that was away, whose
// cache still has them. The history frame repaints right after, so it
// skips its own.
function dropMessages(ids, repaint){
  const gone = new Set(ids);
  if(!messages.some(m => gone.has(m.id))) return;
  messages = messages.filter(m => !gone.has(m.id));
  saveCachedMessages();
  if(repaint){
    paintBadges();
    if(open) renderList('follow');
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
  incoming.forEach(m => {
    // A shared game's live line (js/game-card.js) is this device's own
    // lookup, not part of the message, so it survives a re-sent copy.
    const old = byId.get(m.id);
    if(old && old.gameNow && m.game) m.gameNow = old.gameNow;
    byId.set(m.id, m);
  });
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
  if(open) renderList('follow', incoming.some(m => m.from === currentProfileId));
}

function applyReactions(messageId, reactions){
  const m = messages.find(x => x.id === messageId);
  if(!m) return;
  if(Object.keys(reactions).length) m.reactions = reactions;
  else delete m.reactions;
  saveCachedMessages();
  if(open){
    renderList('follow');
    playPendingBurst();
  }
}

// Ping loop: keeps the connection warm through idle-timeouts and
// notices a socket that died silently (see reconnectNow).
setInterval(() => {
  if(!socket || socket.readyState !== WebSocket.OPEN) return;
  if(Date.now() - lastHeard > DEAD_AFTER_MS){
    // A dead socket's close handshake can itself hang (its 'close' event
    // is what would normally reconnect), so drop it and reconnect now.
    const dead = socket;
    socket = null;
    try { dead.close(); } catch (e){}
    setStatus('offline');
    reconnectNow();
    return;
  }
  try { socket.send('ping'); } catch (e){}
}, PING_INTERVAL_MS);

document.addEventListener('visibilitychange', () => {
  sendPresence();
  if(document.visibilityState === 'visible' && (!socket || socket.readyState !== WebSocket.OPEN)) reconnectNow();
});

// Tells the room who this is and whether the app is on screen, so the
// worker doesn't push a message alert to someone already looking at the
// app (see pushMessage in worker/chat-room.js). Only sent when it changes.
function sendPresence(){
  if(!socket || socket.readyState !== WebSocket.OPEN) return;
  const visible = document.visibilityState === 'visible';
  const key = `${currentProfileId}|${visible}`;
  if(key === sentPresence) return;
  sentPresence = key;
  try { socket.send(JSON.stringify({ type: 'presence', from: currentProfileId, visible })); } catch (e){}
}
window.addEventListener('online', reconnectNow);

// ---- Unread badge ----

window.addEventListener('boxscore:settings', e => { if(e.detail.key === 'chatBadge') paintBadges(); });

function unreadMessages(){
  if(seenId === null) return [];
  return messages.filter(m => m.id > seenId && m.from !== currentProfileId);
}

// Tab bar Chat button badge (see index.html), mirrored onto the Home
// Screen icon where the platform supports it. Called from js/board.js
// too, whenever the active profile changes, since "unread" excludes your
// own messages (and presence names the drafter, so it's re-sent then).
export function paintBadges(){
  sendPresence();
  const unread = getSettings().chatBadge ? unreadMessages() : [];
  const n = unread.length;
  // An unread message that tags you turns the badge into "@".
  const tagged = unread.some(m => mentionsMe(m.mentions, currentProfileId));
  if('setAppBadge' in navigator){
    (n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge()).catch(() => {});
  }
  document.querySelectorAll('.chat-badge').forEach(el => {
    el.textContent = tagged ? '@' : (n > 9 ? '9+' : String(n));
    el.classList.toggle('show', n > 0);
  });
  document.querySelectorAll('.chat-hit').forEach(el => {
    el.setAttribute('aria-label', n > 0 ? `Chat, ${n} unread${tagged ? ', you were mentioned' : ''}` : 'Chat');
  });
}

function markSeen(){
  clearAlerts('chat');
  clearAlerts('mention');
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
  return `<div class="chat-gif ${mine ? 'mine' : ''}" data-msg="${m.id}" style="aspect-ratio:${m.gif.w} / ${m.gif.h}"><img src="${esc(m.gif.url)}" width="${m.gif.w}" height="${m.gif.h}" alt="GIF" loading="lazy" decoding="async" draggable="false"></div>`;
}

// A text message, its mentions as tags. One that tags you (and isn't
// yours) is outlined in gold.
function textBubbleHtml(m, mine){
  const body = mentionSegments(m.text, m.mentions, mentionCandidates())
    .map(seg => seg.id ? mentionHtml({ label: seg.text, me: seg.id === currentProfileId || seg.id === EVERYONE }) : esc(seg.text))
    .join('');
  const tagsMe = !mine && mentionsMe(m.mentions, currentProfileId);
  return `<div class="chat-bubble${mine ? ' mine' : ''}${tagsMe ? ' tags-me' : ''}" data-msg="${m.id}">${body}</div>`;
}

// Pressing and holding a message opens its picker (an in-flow row of the
// emoji, with the ones you've already used highlighted), like iOS Messages;
// a tap elsewhere closes it. Tapping an emoji there, or a pill under the
// message, toggles that reaction for you. A tap on a text bubble copies it.
// Both carry
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

// The list's rows as [key, html] pairs, in order. Keys are stable per
// message (and per day divider), so renderList can tell which rows are
// unchanged and leave them alone.
function listRows(){
  const rows = [];
  let prev = null;
  messages.forEach(m => {
    const mine = m.from === currentProfileId;
    const newDay = !prev || new Date(prev.ts).toDateString() !== new Date(m.ts).toDateString();
    if(newDay) rows.push([`day-${m.id}`, `<div class="chat-day">${esc(dayLabel(m.ts))}</div>`]);
    const startsGroup = newDay || prev.from !== m.from || m.ts - prev.ts > GROUP_GAP_MS;
    if(startsGroup){
      rows.push([`meta-${m.id}`, `<div class="chat-meta ${mine ? 'mine' : ''}">${mine ? '' : `<span class="chat-name">${esc(drafterName(m.from))}</span>`}<span class="chat-time">${esc(timeLabel(m.ts))}</span></div>`]);
    }
    if(m.gif) rows.push([`gif-${m.id}`, gifBubbleHtml(m, mine)]);
    // A shared game's text is only the fallback for app versions without
    // the card (the worker writes it), so it isn't shown alongside it.
    if(m.game) rows.push([`game-${m.id}`, gameCardHtml(m, mine, timeLabel(m.ts))]);
    // A GIF's text is an optional caption (the picker never sends one, but
    // the worker accepts one) — shown under it rather than silently dropped.
    if(m.text && !m.game) rows.push([`text-${m.id}`, textBubbleHtml(m, mine)]);
    if(pickerId === m.id) rows.push([`picker-${m.id}`, pickerHtml(m, mine)]);
    const reactions = reactionsHtml(m, mine);
    if(reactions) rows.push([`react-${m.id}`, reactions]);
    prev = m;
  });
  return rows;
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Patches the list in place rather than replacing its innerHTML: a row
// whose markup hasn't changed keeps its DOM node. Rebuilding everything
// on each message or reaction restarted every GIF in the conversation
// from its first frame (and could flash one while it re-decoded), and
// left nothing for new messages to animate in from.
//
// `scroll`: 'instant' jumps to the bottom (opening the tab), 'follow'
// glides there if you were already near it or sent the message yourself
// (forceFollow), and anything else keeps your place.
function renderList(scroll, forceFollow = false){
  const el = listEl();
  if(!el) return;
  const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_PX;

  if(!messages.length){
    el.innerHTML = `<div class="chat-empty">No messages yet.<br>Say something to the group.</div>`;
    return;
  }

  const existing = new Map();
  [...el.children].forEach(node => { if(node.dataset.key) existing.set(node.dataset.key, node); });
  // Only a list that was already showing rows animates what's new — not
  // the first paint, or opening the tab onto history.
  const animateNew = existing.size > 0 && scroll !== 'instant' && !prefersReducedMotion();
  const tpl = document.createElement('template');

  const wanted = listRows().map(([key, html]) => {
    const old = existing.get(key);
    if(old && old._html === html) return old;
    tpl.innerHTML = html;
    const node = tpl.content.firstElementChild;
    node.dataset.key = key;
    node._html = html;
    if(animateNew && ((!old && !key.startsWith('day-')) || key.startsWith('picker-'))){
      node.classList.add('chat-in');
      node.addEventListener('animationend', () => node.classList.remove('chat-in'), { once: true });
    }
    return node;
  });
  // Drop what's gone (deleted, aged out of the kept window, a row that
  // was re-rendered, the "No messages yet" placeholder), then lay the
  // wanted rows in order, moving only the ones out of place.
  const keep = new Set(wanted);
  [...el.children].forEach(node => { if(!keep.has(node)) node.remove(); });
  let cursor = el.firstElementChild;
  wanted.forEach(node => {
    if(node === cursor) cursor = cursor.nextElementSibling;
    else el.insertBefore(node, cursor);
  });

  if(scroll === 'instant') el.scrollTop = el.scrollHeight;
  else if(scroll === 'follow' && (forceFollow || nearBottom)){
    el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }
}

function toggleReaction(messageId, emoji){
  if(!socket || socket.readyState !== WebSocket.OPEN){
    reconnectNow();
    return;
  }
  socket.send(JSON.stringify({ type: 'react', from: currentProfileId, messageId, emoji }));
  // The new state arrives back over the socket like everyone else's
  // (the room broadcasts to the sender too) — nothing to apply here,
  // except noting a reaction you added so it bursts when it lands.
  const m = messages.find(x => x.id === messageId);
  const adding = !(m && m.reactions && (m.reactions[emoji] || []).includes(currentProfileId));
  pendingBurst = adding ? { messageId, emoji, at: Date.now() } : null;
  if(pickerId !== null){
    pickerId = null;
    renderList('follow');
  }
}

// ---- Reaction motion (docs/motion-plan.md, Phase 5) ----
// Your own reaction only: the emoji swells in the picker before it closes,
// then, once the room sends the new state back, its pill pops and six dots
// burst out of it.
let pendingBurst = null;  // { messageId, emoji, at } for a reaction you just added
function playPendingBurst(){
  if(!pendingBurst) return;
  const { messageId, emoji, at } = pendingBurst;
  if(Date.now() - at > 4000){ pendingBurst = null; return; }
  const pill = [...document.querySelectorAll(`.chat-react-pill.on[data-mid="${messageId}"]`)].find(p => p.dataset.react === emoji);
  if(!pill) return;
  pendingBurst = null;
  pop(pill, { scale: 1.25, duration: 420 });
  burst(pill);
}

// A tap on a text bubble copies it (selecting a bubble's text is off: the
// long press is the picker's). A "Copied" note rises off the bubble.
function copyBubble(bubble){
  const m = messages.find(x => x.id === Number(bubble.dataset.msg));
  if(!m || !m.text) return;
  const note = () => {
    const el = document.createElement('span');
    el.className = 'chat-copied';
    el.setAttribute('role', 'status');
    el.textContent = 'Copied';
    bubble.classList.add('fx-host');
    bubble.appendChild(el);
    const anim = play(el, [
      { opacity: 0, transform: 'translate(-50%, 4px)' },
      { opacity: 1, transform: 'translate(-50%, -4px)', offset: 0.2 },
      { opacity: 1, transform: 'translate(-50%, -4px)', offset: 0.75 },
      { opacity: 0, transform: 'translate(-50%, -10px)' }
    ], { duration: 1200, fill: 'both' });
    const end = () => { el.remove(); bubble.classList.remove('fx-host'); };
    if(anim) anim.finished.then(end, end); else setTimeout(end, 1200);
  };
  const fallback = () => {
    const area = document.createElement('textarea');
    area.value = m.text;
    area.setAttribute('readonly', '');
    area.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e){}
    area.remove();
    if(ok) note();
  };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(m.text).then(note, fallback);
  else fallback();
}

function onListClick(event){
  const target = event.target;
  const button = target.closest('[data-react]');
  if(button){
    const mid = Number(button.dataset.mid), emoji = button.dataset.react;
    // From the picker: the emoji swells, then the picker closes.
    if(button.classList.contains('chat-react-opt') && fxOn()){
      play(button, [{ transform: 'scale(1)' }, { transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 360, easing: EASE_SPRING });
      setTimeout(() => toggleReaction(mid, emoji), 180);
    } else {
      toggleReaction(mid, emoji);
    }
    return;
  }
  if(target.closest('.chat-react-bar')) return;
  // The long press that just opened a picker ends in a click too.
  if(longPressed){
    longPressed = false;
    return;
  }
  // With a picker open, a tap anywhere else just closes it.
  if(pickerId !== null){
    pickerId = null;
    renderList('follow');
    return;
  }
  // A shared game opens its box score; a text bubble copies.
  if(openSharedGame(target)) return;
  const bubble = target.closest('.chat-bubble[data-msg]');
  if(bubble) copyBubble(bubble);
}

// Reactions are a press and hold on any message (bubble, GIF, shared game),
// or a right-click with a mouse. While the finger is down the message eases
// in a little (.pressing); moving it (a scroll) cancels.
let longPressed = false;
function openPickerFor(msg){
  const id = Number(msg.dataset.msg);
  if(pickerId === id) return;
  pickerId = id;
  renderList('follow');
  if(navigator.vibrate) navigator.vibrate(10);
  play(msg, [{ transform: 'scale(0.97)' }, { transform: 'scale(1)' }], { duration: 260, easing: EASE_SPRING });
}

function watchLongPress(list){
  let timer = null, pressed = null;
  let startX = 0, startY = 0;
  const cancel = () => {
    clearTimeout(timer);
    timer = null;
    if(pressed){ pressed.classList.remove('pressing'); pressed = null; }
  };
  list.addEventListener('pointerdown', event => {
    longPressed = false;
    if(event.pointerType === 'mouse' && event.button !== 0) return;
    const msg = event.target.closest && event.target.closest('[data-msg]');
    if(!msg || !event.isPrimary) return;
    cancel();
    startX = event.clientX;
    startY = event.clientY;
    pressed = msg;
    msg.classList.add('pressing');
    timer = setTimeout(() => {
      timer = null;
      longPressed = true;
      msg.classList.remove('pressing');
      pressed = null;
      openPickerFor(msg);
    }, LONG_PRESS_MS);
  });
  list.addEventListener('pointermove', event => {
    if(timer && (Math.abs(event.clientX - startX) > 10 || Math.abs(event.clientY - startY) > 10)) cancel();
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => list.addEventListener(type, cancel));
  list.addEventListener('contextmenu', event => {
    const msg = event.target.closest('[data-msg]');
    if(!msg) return;
    event.preventDefault();
    if(!longPressed) openPickerFor(msg);
  });
}

// ---- Shared games ----

let gameLineTimer = null;
function refreshGames(){
  refreshGameLines(messages).then(changed => {
    if(!changed) return;
    saveCachedMessages();
    if(open) renderList('follow');
  });
}

// Game Details' "Share to chat" (js/live-data.js) posts right away and
// brings you here. If the socket is down, the share waits for the
// reconnect rather than being dropped.
function sendGame(game){
  if(!socket || socket.readyState !== WebSocket.OPEN){
    pendingGame = game;
    reconnectNow();
    return;
  }
  socket.send(JSON.stringify({ type: 'send', from: currentProfileId, game }));
}
window.addEventListener('boxscore:share-game', event => sendGame(event.detail));

// With the keyboard down the chat screen is laid out by CSS alone (top
// of the screen down to the tab bar). While it's up, the screen tracks
// the visual viewport instead: on iOS the keyboard shrinks only that, so
// sizing the fixed screen to it keeps the composer above the keys. The
// tab bar is hidden meanwhile (html.chat-kb) so the composer sits right
// on the keyboard, the way phone chat apps do.
//
// "Is the keyboard up" can't be read off the viewport alone: the
// installed iOS PWA shrinks the layout viewport along with the visual one,
// so innerHeight - visualViewport.height stays ~0 and the tab bar would
// stay put, padded for a home indicator the keyboard now covers. On a
// touch device the keyboard is up exactly when one of chat's text fields
// has focus, so that's the primary signal; the height gap is kept as a
// fallback for browsers that raise it without a focus change.
const CHAT_TEXT_FIELDS = '#chat-input, #gif-search';
function keyboardUp(vv){
  const active = document.activeElement;
  const typing = active && active.matches && active.matches(CHAT_TEXT_FIELDS);
  if(typing && window.matchMedia('(pointer: coarse)').matches) return true;
  return window.innerHeight - vv.height > 120;
}

let kbWasOpen = false;
function syncViewport(){
  const el = screenEl();
  const vv = window.visualViewport;
  if(!el || !vv || !open) return;
  const kbOpen = keyboardUp(vv);
  document.documentElement.classList.toggle('chat-kb', kbOpen);
  el.classList.toggle('kb-open', kbOpen);
  if(kbOpen){
    el.style.top = `${vv.offsetTop}px`;
    el.style.bottom = 'auto';
    el.style.height = `${vv.height}px`;
  } else {
    el.style.top = el.style.bottom = el.style.height = '';
    // iOS scrolls the window to reveal a focused input and can leave it
    // scrolled after the keyboard goes away — even with the body locked —
    // which floats every fixed element (the tab bar included) up off the
    // bottom of the screen.
    if(kbWasOpen && (window.scrollY || vv.offsetTop)) window.scrollTo(0, 0);
  }
  kbWasOpen = kbOpen;
  const list = listEl();
  if(list && open) list.scrollTop = list.scrollHeight;
}

// The Chat tab deliberately doesn't lock the page's scroll the way the
// sheets do (lockBodyScroll / overflow:hidden on <html>): in the installed
// iOS PWA that shrinks the layout viewport by about the status-bar height,
// which floats the fixed tab bar up off the bottom of the screen. Instead
// the page is left exactly as it is on every other tab, and gestures that
// would pan it are taken away here (older iOS ignores `overscroll-behavior`
// entirely, and even new versions only honor it on the scroller
// itself). Nothing
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

    // The message list and (while open) the GIF picker's grid and the
    // mention list are the only things that scroll; each is guarded at its own edges.
    const list = target.closest && target.closest('#chat-list, #gif-grid, #chat-mention-list');
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
// `beside`: showing next to the page at wide widths (js/wide.js's docked
// column or slide-over) rather than as the whole screen.
export function setChatActive(active, { beside = false } = {}){
  const el = screenEl();
  if(!el || active === open) return;
  open = active;
  if(active){
    // As the whole screen nothing else is showing, so the page has nowhere
    // to scroll — this just drops whatever offset the previous tab was
    // scrolled to. Beside the page, the page keeps its place.
    if(!beside) window.scrollTo(0, 0);
    setStatus(status);
    markSeen();
    paintBadges();
    renderList('instant');
    syncViewport();
    if(!socket || socket.readyState !== WebSocket.OPEN) reconnectNow();
    if(!gifsReady) setUpGifs();
    refreshGames();
    gameLineTimer = setInterval(refreshGames, GAME_LINE_TICK_MS);
  } else {
    clearInterval(gameLineTimer);
    gameLineTimer = null;
    closeGifPicker();
    pickerId = null;
    closeMentionList();
    inputEl().blur();
    document.documentElement.classList.remove('chat-kb');
    el.classList.remove('kb-open');
    el.style.top = el.style.bottom = el.style.height = '';
    kbWasOpen = false;
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
  const frame = { type: 'send', from: currentProfileId, text };
  // Tags are whatever "@Name" the text still holds when it's sent, picked
  // from the list or typed out.
  const mentions = findMentions(text, composerCandidates());
  if(mentions.length) frame.mentions = mentions;
  if(mentions.includes(EVERYONE)) frame.auth = loadAdminPassword();
  socket.send(JSON.stringify(frame));
  input.value = '';
  autoGrow();
  closeMentionList();
  input.focus();
}

// ---- Mention list ----
// Shown above the composer while an "@" is being typed, filtered by
// what follows it. Tapping a name (or Enter/Tab on the highlighted one)
// writes "@Name " in place of what was typed.
const mentionListEl = () => document.getElementById('chat-mention-list');
let mentionState = null;   // { start, end, options, active } while the list is showing

function updateMentionList(){
  const input = inputEl(), list = mentionListEl();
  if(!input || !list) return;
  const caret = input.selectionStart;
  const found = input.selectionStart === input.selectionEnd ? activeMentionQuery(input.value, caret) : null;
  const options = found ? mentionOptions(found.query, composerCandidates()) : [];
  if(!options.length){
    closeMentionList();
    return;
  }
  const keep = mentionState && mentionState.start === found.start ? Math.min(mentionState.active, options.length - 1) : 0;
  mentionState = { start: found.start, end: caret, options, active: keep };
  list.innerHTML = mentionListHtml({ options, active: keep });
  list.hidden = false;
}

function closeMentionList(){
  mentionState = null;
  const list = mentionListEl();
  if(list){
    list.hidden = true;
    list.innerHTML = '';
  }
}

function pickMention(id){
  const input = inputEl();
  const option = mentionState && mentionState.options.find(o => o.id === id);
  if(!input || !option) return;
  const { start, end } = mentionState;
  const insert = `@${option.name} `;
  input.value = input.value.slice(0, start) + insert + input.value.slice(end).replace(/^ /, '');
  const caret = start + insert.length;
  input.setSelectionRange(caret, caret);
  closeMentionList();
  autoGrow();
  input.focus();
}

// Arrow keys move the highlight, Enter or Tab picks it, Escape closes.
// Returns true when the key was the list's.
function mentionKey(event){
  if(!mentionState) return false;
  const n = mentionState.options.length;
  if(event.key === 'ArrowDown' || event.key === 'ArrowUp'){
    mentionState.active = (mentionState.active + (event.key === 'ArrowDown' ? 1 : n - 1)) % n;
    mentionListEl().innerHTML = mentionListHtml({ options: mentionState.options, active: mentionState.active });
  } else if(event.key === 'Enter' || event.key === 'Tab'){
    pickMention(mentionState.options[mentionState.active].id);
  } else if(event.key === 'Escape'){
    closeMentionList();
  } else {
    return false;
  }
  event.preventDefault();
  return true;
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
    input.addEventListener('input', () => { autoGrow(); updateMentionList(); });
    // Moving the caret (a tap, arrow keys) can land in or out of an "@".
    input.addEventListener('click', updateMentionList);
    input.addEventListener('keyup', event => { if(event.key === 'ArrowLeft' || event.key === 'ArrowRight') updateMentionList(); });
    input.addEventListener('blur', () => setTimeout(() => { if(document.activeElement !== input) closeMentionList(); }, 150));
    // Enter sends on desktop; on a touch keyboard Enter stays a newline
    // (the send button is right there) — matching how phone chat apps behave.
    input.addEventListener('keydown', event => {
      if(mentionKey(event)) return;
      if(event.key === 'Enter' && !event.shiftKey && window.matchMedia('(pointer: fine)').matches){
        event.preventDefault();
        sendMessage();
      }
    });
  }
  if(screenEl()){
    guardTouchScroll(screenEl());
    // Focus is the keyboard signal (see keyboardUp). Blur is deferred a
    // beat so hopping from the message box to the GIF search doesn't
    // flash the tab bar back in between.
    screenEl().addEventListener('focusin', syncViewport);
    screenEl().addEventListener('focusout', () => setTimeout(syncViewport, 60));
  }
  const mentionList = mentionListEl();
  if(mentionList){
    // Keep the keyboard up: the tap mustn't take focus from the textarea.
    mentionList.addEventListener('pointerdown', event => event.preventDefault());
    mentionList.addEventListener('mousedown', event => event.preventDefault());
    mentionList.addEventListener('click', event => {
      const opt = event.target.closest('[data-mention]');
      if(opt) pickMention(opt.dataset.mention);
    });
  }
  if(listEl()){
    listEl().addEventListener('click', onListClick);
    watchLongPress(listEl());
  }
  setUpGifs();
  if(window.visualViewport){
    window.visualViewport.addEventListener('resize', syncViewport);
    window.visualViewport.addEventListener('scroll', syncViewport);
  }
  paintBadges();
  connect();
}
