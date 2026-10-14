/* ============================================================
   Shows a group its new teams the moment its draft ends, with no export
   or deploy. Each answer about the live room ("main") — the
   /draft/status poll in js/draft-live.js, or the draft room's own socket
   state — comes through checkLiveClass. When it says a board is
   finished, this fetches it (/draft/result), builds the class on this
   device with the same builder tools/export-draft.mjs uses
   (js/draft-class.js), stores it (js/live-class-store.js) and reloads,
   so js/seasons/index.js boots with it as the newest class.

   Which classes (liveClassesToBuild): the board the room is showing once
   it's done, named for the year of its last pick (finishedAt), since a
   class is named for the fall it was drafted; plus every finished board
   the room archived (status `boards`, worker/draft-room.js), so a new
   phone still gets last year's class after the room was reset for this
   year's draft. Only years newer than every committed class: a year
   with a committed file is already in the app. The current board is
   rebuilt when the room's seq moves (a pick edited after the draft).
   Oldest first, each built on the class before it.

   ESPN fills in teams no earlier class had (its team lists, through the
   worker's /espn/teams). If a league's list doesn't load, nothing is
   stored and a later status answer tries again; a team ESPN can't place
   gets a plain entry from its pool record (fallbackToPool), so nothing
   is ever left off a roster. Every device builds the same class from
   the same board, so team keys (and the points and favorites saved
   against them) agree.

   A reload is the only way a new class reaches modules that read
   SEASONS at boot. It happens once per build: a sessionStorage marker
   stops a loop if the record somehow doesn't take.
   ============================================================ */
import { ACTIVE_GROUP_ID, IS_LEGACY_GROUP, withGroupQuery } from './group.js';
import { groupCaps } from './groups.js';
import { chatWorkerBase, DASHBOARD_WORKER_BASE } from './worker-base.js';
import { LATEST_COMMITTED_YEAR, LIVE_CLASS_BASE } from './seasons/index.js';
import { PGA_SCORING } from './seasons/pga.js';
import { buildSeason, fetchEspnTeams, liveClassesToBuild, liveClassChain } from './draft-class.js';
import { readLiveClasses, saveLiveClass } from './live-class-store.js';

const LIVE_ROOM = 'main';
const RELOAD_MARK = 'liveDraftClassReload';
// After a failed build, the same status isn't tried again for this long.
const RETRY_MS = 60 * 1000;

let building = null;
let lastFailure = { key: null, at: 0 };

// `status`: the live room's { phase, finishedAt, seq, boards }. Safe to
// call on every status answer; it does nothing almost every time.
export function checkLiveClass(status){
  if(building) return;
  const todo = liveClassesToBuild(status, LATEST_COMMITTED_YEAR, readLiveClasses(ACTIVE_GROUP_ID));
  if(!todo.length) return;
  const key = `${status.seq}:${todo.map(t => t.year).join(',')}`;
  if(lastFailure.key === key && Date.now() - lastFailure.at < RETRY_MS) return;
  building = buildAll(todo)
    .then(() => reloadOnce(`${ACTIVE_GROUP_ID}:${key}`))
    .catch(e => {
      lastFailure = { key, at: Date.now() };
      console.warn('[live-class]', e.message);
    })
    .finally(() => { building = null; });
}

// Builds each class in turn. A failure stops there (a later class needs
// the one before it); anything already stored shows after a reload.
async function buildAll(todo){
  let stored = 0;
  try {
    for(const { year, current } of todo){
      await buildOne(year, current);
      stored += 1;
    }
  } catch (e){
    if(stored) reloadOnce(`${ACTIVE_GROUP_ID}:partial:${todo.slice(0, stored).map(t => t.year).join(',')}`);
    throw e;
  }
}

// The class a new one for `year` builds on: the newest live class before
// it, else the newest committed one (or The Draft's, for a first draft).
function baseFor(year){
  const before = readLiveClasses(ACTIVE_GROUP_ID).filter(r => Number(r.year) < year);
  const chain = liveClassChain(before, LIVE_CLASS_BASE, LATEST_COMMITTED_YEAR, PGA_SCORING);
  return chain.length ? chain[chain.length - 1] : LIVE_CLASS_BASE;
}

async function buildOne(year, current){
  const res = await fetch(withGroupQuery(`${chatWorkerBase()}/draft/result?room=${LIVE_ROOM}${current ? '' : `&year=${year}`}`), { cache: 'no-store' });
  if(!res.ok) throw new Error(`draft result ${year}: HTTP ${res.status}`);
  const result = await res.json();
  if(!result.complete || !Number.isFinite(result.finishedAt) || new Date(result.finishedAt).getUTCFullYear() !== year){
    throw new Error(`draft result ${year} changed while loading`);
  }
  const built = await buildSeason({
    result,
    prev: baseFor(year),
    year,
    drafterIds: result.config.drafters,
    // ESPN's team lists send no CORS headers, so they come through the
    // worker (/espn/teams, cached a day).
    espn: league => fetchEspnTeams(league, () => fetch(`${DASHBOARD_WORKER_BASE}/espn/teams?league=${encodeURIComponent(league)}`)),
    onlyDrafted: !IS_LEGACY_GROUP && !!groupCaps(ACTIVE_GROUP_ID),
    fallbackToPool: true
  });
  if(built.espnFailed.length) throw new Error(`ESPN didn't load: ${built.espnFailed.join(', ')}`);
  if(!Object.keys(built.meta).length) throw new Error(`no teams on the ${year} board`);

  const meta = {};
  Object.entries(built.meta).forEach(([key, { __generated, ...entry }]) => { meta[key] = entry; });
  const saved = saveLiveClass(ACTIVE_GROUP_ID, {
    year,
    seq: result.seq,
    finishedAt: result.finishedAt,
    meta,
    leagues: built.leagues,
    priorSeasonLeagues: built.priorSeasonLeagues,
    builtAt: Date.now()
  });
  if(!saved) throw new Error('could not store the class');
}

function reloadOnce(mark){
  let seen = null;
  try { seen = sessionStorage.getItem(RELOAD_MARK); } catch (e){}
  if(seen === mark) return;
  try { sessionStorage.setItem(RELOAD_MARK, mark); } catch (e){}
  location.reload();
}
