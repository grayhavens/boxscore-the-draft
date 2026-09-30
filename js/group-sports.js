/* ============================================================
   A group's sports in the browser: what the Commissioner page set
   (js/sports.js, the worker's GET /sports) written onto the GROUPS entry
   in place, as its `caps` (drafted) and `shown` (scores only), so
   groupCaps / groupShown (js/groups.js) and the draft classes built from
   them (js/seasons/index.js) just see it.

   Same boot pattern as js/roster.js: the last copy seen is kept in
   localStorage and applied at once, with a fresh one fetched behind it
   (a change shows from the next launch). Only a device that has never
   seen it waits, briefly.
   ============================================================ */
import { GROUPS } from './groups.js';
import { sportsCaps, sportsShown } from './sports.js';
import { chatWorkerBase } from './worker-base.js';

const FIRST_LOAD_WAIT_MS = 1500;
const cacheKey = groupId => `bx-sports@${groupId}`;

// The js/groups.js values, kept aside so a group can go back to them.
const defaults = new Map();

// `sports` is the saved record's, or null for js/groups.js's own.
function apply(groupId, sports){
  const group = GROUPS[groupId];
  if(!defaults.has(groupId)) defaults.set(groupId, { caps: group.caps, shown: group.shown });
  const base = defaults.get(groupId);
  group.caps = sports ? sportsCaps(sports) : base.caps;
  group.shown = sports ? sportsShown(sports) : base.shown;
  if(!group.caps) delete group.caps;
  if(!group.shown) delete group.shown;
}

function readCache(groupId){
  try {
    const v = JSON.parse(localStorage.getItem(cacheKey(groupId)) || 'null');
    return v && typeof v === 'object' && 'sports' in v ? v : null;
  } catch (e){ return null; }
}

// The saved sports, or null when the group has none.
async function fetchSports(groupId){
  const res = await fetch(`${chatWorkerBase()}/sports?group=${encodeURIComponent(groupId)}`, { cache: 'no-store' });
  if(!res.ok) throw new Error(`sports ${res.status}`);
  const data = await res.json();
  return data && data.sports && typeof data.sports === 'object' ? data.sports : null;
}

// `wait`: whether a device with no copy yet holds up for one (the app,
// whose tabs come from it) or goes on without it (the landing page).
export async function loadSports(groupId, { wait = true } = {}){
  if(!GROUPS[groupId]) return;
  const cached = readCache(groupId);
  if(cached) apply(groupId, cached.sports);

  const fresh = fetchSports(groupId).then(sports => {
    try { localStorage.setItem(cacheKey(groupId), JSON.stringify({ sports })); } catch (e){}
    return sports;
  });
  if(cached || !wait){
    fresh.catch(() => {});
    return;
  }
  const sports = await Promise.race([fresh.catch(() => undefined), new Promise(r => setTimeout(r, FIRST_LOAD_WAIT_MS))]);
  if(sports !== undefined) apply(groupId, sports);
}

// A save on the Commissioner page: this device shows it from its next
// launch without waiting on the fetch.
export function rememberSports(groupId, sports){
  try { localStorage.setItem(cacheKey(groupId), JSON.stringify({ sports })); } catch (e){}
}
