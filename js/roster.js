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
   ============================================================ */
import { GROUPS, applyRoster } from './groups.js';
import { chatWorkerBase } from './worker-base.js';

const FIRST_LOAD_WAIT_MS = 1500;
const cacheKey = groupId => `bx-roster@${groupId}`;

// The js/groups.js values, kept aside the first time so a released spot
// (Undo on the admin page) goes back to its placeholder.
const placeholders = new Map();

function apply(groupId, assigned){
  GROUPS[groupId].drafters.forEach(d => {
    if(!placeholders.has(d)) placeholders.set(d, { name: d.name, open: d.open });
    const base = placeholders.get(d);
    const [next] = applyRoster([{ id: d.id, ...base }], assigned);
    d.name = next.name;
    if(next.open) d.open = true;
    else delete d.open;
  });
}

function readCache(groupId){
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(groupId)) || 'null');
    return v && typeof v === 'object' ? v : null;
  } catch (e){ return null; }
}

async function fetchAssigned(groupId){
  const res = await fetch(`${chatWorkerBase()}/roster?group=${encodeURIComponent(groupId)}`, { cache: 'no-store' });
  if(!res.ok) throw new Error(`roster ${res.status}`);
  const data = await res.json();
  return data && data.assigned && typeof data.assigned === 'object' ? data.assigned : {};
}

export async function loadRoster(groupId){
  const group = GROUPS[groupId];
  // Checked against the js/groups.js values: a spot already filled here
  // is still one this has to keep applying.
  if(!group || !group.drafters.some(d => (placeholders.get(d) || d).open)) return;

  const cached = readCache(groupId);
  if(cached) apply(groupId, cached);

  const fresh = fetchAssigned(groupId).then(assigned => {
    apply(groupId, assigned);
    try { localStorage.setItem(cacheKey(groupId), JSON.stringify(assigned)); } catch (e){}
  }).catch(() => {});

  if(!cached) await Promise.race([fresh, new Promise(r => setTimeout(r, FIRST_LOAD_WAIT_MS))]);
}
