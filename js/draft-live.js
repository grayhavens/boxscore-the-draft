/* ============================================================
   "The draft is live" banner on every page except the draft room
   itself, so someone who tabs away mid-draft always has a one-tap way
   back (the draft room isn't in the tab bar). Shown only while the room
   is in its 'draft' phase — nothing before the start or after the last
   pick.

   Outside the draft room there's no socket, so this polls the worker's
   GET /draft/status (a few bytes, edge-cached a few seconds): often
   while a draft is live, rarely otherwise, never while the tab is
   hidden. While the draft room's own socket is open (js/draft-client.js)
   its state is fresher, so that wins — and it seeds the banner the
   moment you leave the room.

   Two slots: the top of .board (every in-page view, team pages
   included) and under the Chat header, since Chat is a fixed-position
   screen outside .board.
   ============================================================ */
import { DRAFT_TEAMS } from './data.js';
import { chatWorkerBase } from './api.js';
import { withGroupQuery } from './group.js';
import { currentProfileId } from './identity.js';
import { onTheClock } from './draft-engine.js';
import { totalPicks } from './draft-rules.js';
import { draftStore, subscribeDraft } from './draft-client.js';
import { fetchLiveRoomStatus } from './draft-schedule.js';
import { escapeHtml as esc } from './utils.js';

const POLL_LIVE_MS = 20000;
const POLL_IDLE_MS = 90000;
const LIVE_ROOM = 'main';
// An answer this recent (Home's card asked at the same moment) is reused.
const POLL_GAP_MS = 5000;

let status = null;      // { phase, running, slot, owner, drafters, total } or null
let pollTimer = null;

const drafterName = id => (DRAFT_TEAMS.find(d => d.id === id) || { name: id }).name;
const isLive = () => !!status && status.phase === 'draft';

// Same shape as the worker's DraftRoom.status(), from the draft room's socket.
function statusFromStore(){
  const s = draftStore.state;
  if(!s) return null;
  const clock = onTheClock(s);
  return {
    phase: s.phase,
    running: s.phase === 'draft' && !!s.clock.running,
    slot: clock ? clock.slot : null,
    owner: clock ? clock.owner : null,
    drafters: s.config.drafters.length,
    total: totalPicks(s.config)
  };
}

function bannerHtml(){
  const round = status.slot === null ? null : Math.floor(status.slot / status.drafters) + 1;
  const where = round ? `Round ${round} · Pick ${status.slot + 1} of ${status.total}` : '';
  let kind = 'live', title = 'Draft is live', detail = where, cta = 'Go to draft';
  if(!status.running){
    kind = 'paused'; title = 'Draft paused';
  } else if(status.owner && status.owner === currentProfileId){
    kind = 'mine'; title = "You're on the clock"; cta = 'Pick now';
  } else if(status.owner){
    detail = `${esc(drafterName(status.owner))} is up${round ? ` · Round ${round}` : ''}`;
  }
  return `<button type="button" class="draft-live" data-kind="${kind}" onclick="switchView('draft')">
    <span class="draft-live-dot" aria-hidden="true"></span>
    <span class="draft-live-text"><b>${title}</b>${detail ? `<span>${detail}</span>` : ''}</span>
    <span class="draft-live-cta">${cta}<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2.5 8 6l-3.5 3.5"/></svg></span>
  </button>`;
}

function paint(){
  const html = isLive() ? bannerHtml() : '';
  document.querySelectorAll('.draft-live-slot').forEach(slot => {
    if(slot.dataset.html === html) return;
    slot.dataset.html = html;
    slot.innerHTML = html;
    slot.hidden = !html;
  });
}

function schedule(){
  clearTimeout(pollTimer);
  pollTimer = setTimeout(poll, isLive() ? POLL_LIVE_MS : POLL_IDLE_MS);
}

async function poll(){
  clearTimeout(pollTimer);
  if(document.visibilityState !== 'visible') return;   // resumes on visibilitychange
  if(draftStore.status !== 'open'){
    // The live room's status is the same request Home's draft card reads
    // (js/draft-schedule.js), so it goes through there and is sent once.
    // A worker without this route (404) means there's no live draft to
    // show; offline keeps the last answer for the next tick.
    let answer = { ok: false, status: 0, data: null };
    if(draftStore.room === LIVE_ROOM) answer = await fetchLiveRoomStatus(POLL_GAP_MS);
    else {
      try {
        const res = await fetch(withGroupQuery(`${chatWorkerBase()}/draft/status?room=${encodeURIComponent(draftStore.room)}`), { cache: 'no-store' });
        answer = { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
      } catch (e){}
    }
    if(answer.ok) status = answer.data;
    else if(answer.status === 404) status = null;
  }
  paint();
  schedule();
}

export function initDraftLive(){
  const board = document.querySelector('.board');
  if(board && !document.getElementById('draft-live-board')){
    board.insertAdjacentHTML('afterbegin', '<div class="draft-live-slot" id="draft-live-board" hidden></div>');
  }
  const chatHeader = document.querySelector('.chat-head .page-header');
  if(chatHeader && !document.getElementById('draft-live-chat')){
    chatHeader.insertAdjacentHTML('afterend', '<div class="draft-live-slot" id="draft-live-chat" hidden></div>');
  }

  subscribeDraft(() => {
    const fromStore = statusFromStore();
    if(fromStore && (draftStore.status === 'open' || draftStore.status === 'idle')) status = fromStore;
    // No poll here on leaving the room: the socket's state is fresher than an
    // edge-cached /draft/status, and the poll loop never stopped.
    paint();
  });
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') poll(); });
  poll();
}
