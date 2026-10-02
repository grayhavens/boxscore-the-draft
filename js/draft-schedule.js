/* ============================================================
   When the live draft starts: the commissioner sets it on the
   Commissioner page (js/admin.js, PUT /draft/schedule) and the live
   room hands it back on GET /draft/status as scheduledAt (epoch ms, or
   null when unset). Home shows it on its draft card (renderDraftHome in
   js/board.js) until the draft goes live, when js/draft-live.js's banner
   takes over.

   Before a time is set, the same status carries the draft time poll
   (js/draft-poll.js): the commissioner's candidate times and everyone's
   answers. Home's card shows it in place of "Date to be set", and
   voteDraftPoll below sends this device's answer.

   Always reads the live room ('main'), whatever ?room= the page was
   opened on: a mock room has no schedule. Fetched at boot, when the app
   comes back to the foreground, and every few minutes (one request shared
   with js/draft-live.js's banner, see fetchLiveRoomStatus); the card's
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

let schedule = { scheduledAt: null, phase: null, poll: null };
let lastFetch = 0;
// The poll as the worker last sent it (what a failed vote falls back to),
// how many votes are still on their way, and a counter that moves
// whenever a vote is sent or answered, so a status fetched around one
// can tell its poll is out of date.
let confirmedPoll = null;
let votesInFlight = 0;
let voteEpoch = 0;
let voteChain = Promise.resolve();
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
  // An older worker has no poll either.
  confirmedPoll = status.poll || null;
  setSchedule({ scheduledAt: status.scheduledAt ?? null, phase: status.phase || null, poll: confirmedPoll });
}

// Repaints Home's card only when something it shows changed: the status
// is re-read every 20s while a draft is live.
function setSchedule(next){
  if(JSON.stringify(next) === JSON.stringify(schedule)) return;
  schedule = next;
  notify();
}

// Whether a scheduled live draft is still ahead (or just about to start).
// Not once it's live (the draft-live banner covers that) or finished.
export function isDraftUpcoming(s = schedule, now = Date.now()){
  if(!s.scheduledAt || s.phase === 'draft') return false;
  if(s.phase === 'done' && now >= s.scheduledAt) return false;
  return now < s.scheduledAt + STALE_AFTER_MS;
}

// Whether Home should be asking for votes: there's a poll, no time has
// been set yet, and the draft isn't under way. Setting a time closes the
// poll; its answers stay on the Commissioner page.
export function isDraftPollOpen(s = schedule){
  return !!s.poll && !s.scheduledAt && s.phase !== 'draft';
}

// This drafter's answer: the offered times they can make, [] for "none
// of these work", null to take the answer back. Shown right away, then
// sent; taps queue up so answers reach the room in order.
export function voteDraftPoll(drafter, picks){
  if(!schedule.poll) return;
  const votes = { ...schedule.poll.votes };
  if(picks === null) delete votes[drafter];
  else votes[drafter] = picks;
  schedule = { ...schedule, poll: { ...schedule.poll, votes } };
  votesInFlight++;
  voteEpoch++;
  notify();
  voteChain = voteChain.then(async () => {
    let data = null;
    try {
      const res = await fetch(withGroupQuery(`${chatWorkerBase()}/draft/vote?room=${LIVE_ROOM}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drafter, options: picks })
      });
      if(res.ok) data = await res.json();
    } catch (e){}
    votesInFlight--;
    voteEpoch++;
    // Only the last answer in the queue settles what's shown; an earlier
    // one would undo the taps after it.
    if(votesInFlight) return;
    if(data) setKnownDraftStatus(data);
    else {
      schedule = { ...schedule, poll: confirmedPoll };
      notify();
      // A status already in the air was asked for before this vote;
      // read the room again once it's back.
      if(inFlight) inFlight.then(() => refresh());
      else refresh();
    }
  });
}

// The live room's GET /draft/status, shared with js/draft-live.js's banner
// so the two don't each poll it: callers arriving while one is in the air
// share it, and `maxAgeMs` lets a caller take an answer that recent.
// Resolves { ok, status, data } (status 0 when offline).
let inFlight = null;
let lastAnswer = null;
export function fetchLiveRoomStatus(maxAgeMs = 0){
  if(lastAnswer && Date.now() - lastFetch < maxAgeMs) return Promise.resolve(lastAnswer);
  if(inFlight) return inFlight;
  lastFetch = Date.now();
  const epoch = voteEpoch;
  inFlight = (async () => {
    let answer = { ok: false, status: 0, data: null };
    try {
      const res = await fetch(withGroupQuery(`${chatWorkerBase()}/draft/status?room=${LIVE_ROOM}`), { cache: 'no-store' });
      answer = { ok: res.ok, status: res.status, data: res.ok ? await res.json() : null };
    } catch (e){
      // Offline: keep what we had.
    }
    if(answer.ok) applyStatus(answer.data, epoch);
    lastAnswer = answer;
    return answer;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

function applyStatus(data, epoch){
  // Fetched while a vote was in the air: its poll may predate the vote,
  // so take everything but the poll.
  if(epoch !== voteEpoch){
    setSchedule({ ...schedule, scheduledAt: data.scheduledAt ?? null, phase: data.phase || null });
    return;
  }
  // An older worker has no scheduledAt; treat it as unset.
  setKnownDraftStatus(data);
}

// The banner re-reads the status every 20-90s whenever it's on the live
// room, so this one's own poll usually finds a fresh answer and sends nothing.
function refresh(maxAgeMs = 0){
  if(document.visibilityState !== 'visible') return;
  fetchLiveRoomStatus(maxAgeMs);
}

export function initDraftSchedule(){
  refresh();
  setInterval(() => refresh(POLL_MS / 2), POLL_MS);
  setInterval(() => { if(schedule.scheduledAt) notify(); }, TICK_MS);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') refresh(TICK_MS);
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
