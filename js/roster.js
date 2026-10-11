/* ============================================================
   Confirmed spots in the browser: a group that still has `open: true`
   spots in js/groups.js gets their real names from the worker's /roster
   (worker/roster.js), written onto the GROUPS drafter objects in place,
   so DRAFT_TEAMS (js/data.js) and everything else just see real names.

   Boot can't wait on the network every launch, so: the last roster seen
   is kept in localStorage and applied at once, with a fresh copy fetched
   behind it (a change shows from the next render on). Only a device that
   has never seen the roster waits for it, briefly, since that's the new
   member opening the app for the first time and looking for their name.

   The group's drafter count (the same response's `size`, worker/roster.js)
   trims open spots off the end of the same array in place, so
   DRAFT_TEAMS (js/data.js) and the draft board, standings and Points
   table all see the smaller group. A device on an older worker just
   doesn't get a size and keeps every spot.
   ============================================================ */
import { GROUPS, applyRoster, applySize } from './groups.js';
import { chatWorkerBase } from './worker-base.js';

const FIRST_LOAD_WAIT_MS = 1500;
const cacheKey = groupId => `bx-roster@${groupId}`;

// The js/groups.js values, kept aside the first time so a released spot
// (Undo on the admin page) goes back to its placeholder, and so are all of
// the group's spots, for a count raised again.
const placeholders = new Map();
const allSpots = new Map();

function apply(groupId, assigned, size){
  const group = GROUPS[groupId];
  if(!allSpots.has(groupId)) allSpots.set(groupId, group.drafters.slice());
  const all = allSpots.get(groupId);
  all.forEach(d => {
    if(!placeholders.has(d)) placeholders.set(d, { name: d.name, open: d.open });
    const base = placeholders.get(d);
    const [next] = applyRoster([{ id: d.id, ...base }], assigned);
    d.name = next.name;
    if(next.open) d.open = true;
    else delete d.open;
  });
  group.drafters.splice(0, group.drafters.length, ...applySize(all, size));
}

// { assigned, size }; the cache once held the assigned map alone.
function readCache(groupId){
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(groupId)) || 'null');
    if(!v || typeof v !== 'object') return null;
    return v.assigned && typeof v.assigned === 'object' ? v : { assigned: v, size: null };
  } catch (e){ return null; }
}

async function fetchRoster(groupId){
  const res = await fetch(`${chatWorkerBase()}/roster?group=${encodeURIComponent(groupId)}`, { cache: 'no-store' });
  if(!res.ok) throw new Error(`roster ${res.status}`);
  const data = await res.json();
  return {
    assigned: data && data.assigned && typeof data.assigned === 'object' ? data.assigned : {},
    size: data && Number.isInteger(data.size) ? data.size : null
  };
}

export async function loadRoster(groupId, { fresh: waitFresh = false } = {}){
  const group = GROUPS[groupId];
  // Checked against the js/groups.js values: a spot already filled here
  // is still one this has to keep applying.
  if(!group || !(allSpots.get(groupId) || group.drafters).some(d => (placeholders.get(d) || d).open)) return;

  const cached = readCache(groupId);
  if(cached) apply(groupId, cached.assigned, cached.size);

  const fresh = fetchRoster(groupId).then(roster => {
    apply(groupId, roster.assigned, roster.size);
    try { localStorage.setItem(cacheKey(groupId), JSON.stringify(roster)); } catch (e){}
  }).catch(() => {});

  if(!cached || waitFresh) await Promise.race([fresh, new Promise(r => setTimeout(r, FIRST_LOAD_WAIT_MS))]);
}
