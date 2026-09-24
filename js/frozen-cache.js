/* ============================================================
   Storage layer for the standings caches, with a "frozen" override.

   Every standings module (js/standings-*.js) mirrors its ESPN table
   into localStorage and skips the network while that copy is fresh.
   ESPN only ever serves the season being played NOW, so once a league
   has moved on, a draft class that is no longer the newest one (see
   js/seasons/index.js) can't rebuild that league's final standings
   from ESPN anymore. Each of those modules reads and writes through
   cacheGet/cacheSet below instead of localStorage directly:

   - Live (the normal case): a straight pass-through to localStorage,
     plus remembering which keys belong to which league so
     snapshotLeagueCaches can capture them when a league locks
     (js/season-lock.js stores that snapshot alongside the lock).
   - Frozen (only ever set by season-lock.js's primeFrozenSnapshots,
     and only for a non-newest class): reads return the snapshot
     instead of localStorage, stamped with a far-future fetchedAt so
     every module's own freshness check treats it as never-stale and
     never refetches, and writes are dropped so nothing can overwrite
     the shared live cache the newest class is using on this device.

   No imports on purpose: this sits under every standings module, and
   js/season-lock.js sits above them.
   ============================================================ */
const FAR_FUTURE_MS = 8.64e15; // the largest valid Date, in ms

const keysByLeague = {};   // leagueKey -> Set of storage keys seen
const frozenBlobs = {};    // storage key -> parsed cache blob
const frozenLeagues = new Set();

function register(leagueKey, key){
  (keysByLeague[leagueKey] || (keysByLeague[leagueKey] = new Set())).add(key);
}

export function cacheGet(leagueKey, key){
  register(leagueKey, key);
  if(frozenBlobs[key]) return JSON.stringify(frozenBlobs[key]);
  return localStorage.getItem(key);
}

export function cacheSet(leagueKey, key, value){
  register(leagueKey, key);
  if(frozenBlobs[key]) return;
  localStorage.setItem(key, value);
}

// Captures the league's current live cache blobs — { storageKey: blob }.
// Returns null unless at least one of them actually holds data, so a
// lock computed before any table loaded never freezes an empty snapshot.
export function snapshotLeagueCaches(leagueKey){
  const out = {};
  let any = false;
  (keysByLeague[leagueKey] || []).forEach(key => {
    try {
      const raw = localStorage.getItem(key);
      if(!raw) return;
      const blob = JSON.parse(raw);
      if(blob && typeof blob === 'object'){
        out[key] = blob;
        any = true;
      }
    } catch (e){}
  });
  return any ? out : null;
}

export function freezeLeagueCaches(leagueKey, snapshot){
  Object.keys(snapshot || {}).forEach(key => {
    frozenBlobs[key] = { ...snapshot[key], fetchedAt: FAR_FUTURE_MS, loading: false, error: false };
  });
  frozenLeagues.add(leagueKey);
}

export function isLeagueFrozen(leagueKey){
  return frozenLeagues.has(leagueKey);
}
