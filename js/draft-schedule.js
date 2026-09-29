/* ============================================================
   When the live draft starts: the commissioner sets it on the
   Commissioner page (js/admin.js, PUT /draft/schedule) and the live
   room hands it back on GET /draft/status as scheduledAt (epoch ms, or
   null when unset). Home shows it on its draft card (renderDraftHome in
   js/board.js) until the draft goes live, when js/draft-live.js's banner
   takes over.

   Always reads the live room ('main'), whatever ?room= the page was
   opened on: a mock room has no schedule. Fetched at boot, when the app
   comes back to the foreground, and every few minutes; the card's
   "in 3 days" line is re-rendered every minute without refetching.
   ============================================================ */
import { chatWorkerBase } from './api.js';
import { withGroupQuery } from './group.js';

const LIVE_ROOM = 'main';
const POLL_MS = 5 * 60 * 1000;
const TICK_MS = 60 * 1000;
// A draft that hasn't gone live by then was probably moved without the
// date being updated; stop counting down to it.
const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

let schedule = { scheduledAt: null, phase: null };
let lastFetch = 0;
const listeners = new Set();

function notify(){
  listeners.forEach(fn => { try { fn(schedule); } catch (e){} });
}

export function getDraftSchedule(){
  return schedule;
}

export function onDraftSchedule(fn){
  listeners.add(fn);
}

// The Commissioner page just saved a new time: show it right away
// rather than waiting for the next poll.
export function setKnownDraftStatus(status){
  if(!status) return;
  schedule = { scheduledAt: status.scheduledAt ?? null, phase: status.phase || null };
  notify();
}

// Whether a scheduled live draft is still ahead (or just about to start).
// Not once it's live (the draft-live banner covers that) or finished.
export function isDraftUpcoming(s = schedule, now = Date.now()){
  if(!s.scheduledAt || s.phase === 'draft') return false;
  if(s.phase === 'done' && now >= s.scheduledAt) return false;
  return now < s.scheduledAt + STALE_AFTER_MS;
}

async function refresh(){
  if(document.visibilityState !== 'visible') return;
  lastFetch = Date.now();
  try {
    const res = await fetch(withGroupQuery(`${chatWorkerBase()}/draft/status?room=${LIVE_ROOM}`), { cache: 'no-store' });
    if(!res.ok) return;
    const data = await res.json();
    // An older worker has no scheduledAt; treat it as unset.
    setKnownDraftStatus(data);
  } catch (e){
    // Offline: keep what we had.
  }
}

export function initDraftSchedule(){
  refresh();
  setInterval(refresh, POLL_MS);
  setInterval(() => { if(schedule.scheduledAt) notify(); }, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible' && Date.now() - lastFetch > TICK_MS) refresh();
  });
}

// ---- Formatting, shared with the Commissioner page ----

// "Saturday, October 10"
export function scheduleDateLabel(at){
  return new Date(at).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

// "7:00 PM EDT"
export function scheduleTimeLabel(at){
  return new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
}

// "Today", "Tomorrow", "In 12 days", "In 40 min", "Starting soon"
export function scheduleRelativeLabel(at, now = Date.now()){
  const ms = at - now;
  if(ms <= 0) return 'Starting soon';
  if(ms < 60 * 60 * 1000) return `In ${Math.max(1, Math.round(ms / 60000))} min`;
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date(at)) - startOfDay(new Date(now))) / 86400000);
  if(days === 0) return 'Today';
  if(days === 1) return 'Tomorrow';
  return `In ${days} days`;
}

// For an <input type="datetime-local">: the time in the viewer's own zone.
export function toLocalInputValue(at){
  const d = new Date(at);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
