/* ============================================================
   Shows a group its new teams the moment its draft ends, with no export
   or deploy. Each answer about the live room ("main") — the
   /draft/status poll in js/draft-live.js, or the draft room's own socket
   state — comes through checkLiveClass. When it says a board is
   finished, this fetches it (/draft/result), builds the class on this
   device with the same builder tools/export-draft.mjs uses
   (js/draft-class.js) and stores it (js/live-class-store.js), so
   js/seasons/index.js boots with it as the newest class. Moving into it
   is js/season-entry.js's job: its "building your season" screen follows
   the progress reported here (subscribeLiveClass) and reloads into Home
   when the drafter taps Enter.

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

   State (liveClassState): { phase, year, done, total, mine, teams }
     phase   'idle' | 'building' | 'ready' | 'failed' ('failed' retries on
             a later status answer, and goes back to 'building')
     year    the class being built (the newest, when there are several)
     done / total   picks placed so far, of the board's
     mine    the signed-in drafter's picks on that board, in draft order:
             { slot, entry }, entry being the TEAM_META entry the build
             gave it (null until it's placed)
     teams   how many teams the finished class has
   ============================================================ */
import { ACTIVE_GROUP_ID, IS_LEGACY_GROUP, withGroupQuery } from './group.js';
import { groupCaps } from './groups.js';
import { chatWorkerBase, DASHBOARD_WORKER_BASE } from './worker-base.js';
import { LATEST_COMMITTED_YEAR, LIVE_CLASS_BASE } from './seasons/index.js';
import { PGA_SCORING } from './seasons/pga.js';
import { buildSeason, fetchEspnTeams, liveClassesToBuild, liveClassChain } from './draft-class.js';
import { readLiveClasses, saveLiveClass } from './live-class-store.js';
import { currentProfileId } from './identity.js';

const LIVE_ROOM = 'main';
// After a failed build, the same status isn't tried again for this long.
const RETRY_MS = 60 * 1000;

let building = null;
let lastFailure = { key: null, at: 0 };
let state = { phase: 'idle', year: null, done: 0, total: 0, mine: [], teams: 0 };
const listeners = new Set();

export function liveClassState(){ return state; }

// fn(state) on every change; returns an unsubscribe.
export function subscribeLiveClass(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(patch){
  state = { ...state, ...patch };
  listeners.forEach(fn => { try { fn(state); } catch (e){ console.warn('[live-class]', e); } });
}

// `status`: the live room's { phase, finishedAt, seq, boards }. Safe to
// call on every status answer; it does nothing almost every time.
export function checkLiveClass(status){
  if(building) return;
  const todo = liveClassesToBuild(status, LATEST_COMMITTED_YEAR, readLiveClasses(ACTIVE_GROUP_ID));
  if(!todo.length) return;
  const key = `${status.seq}:${todo.map(t => t.year).join(',')}`;
  if(lastFailure.key === key && Date.now() - lastFailure.at < RETRY_MS) return;
  setState({ phase: 'building', year: todo[todo.length - 1].year, done: 0, total: 0 });
  building = buildAll(todo)
    .then(teams => setState({ phase: 'ready', teams }))
    .catch(e => {
      lastFailure = { key, at: Date.now() };
      console.warn('[live-class]', e.message);
      setState({ phase: 'failed' });
    })
    .finally(() => { building = null; });
}

// Builds each class in turn, oldest first; a failure stops there (a
// later class needs the one before it). Resolves to the newest class's
// team count.
async function buildAll(todo){
  let teams = 0;
  for(const { year, current } of todo) teams = await buildOne(year, current);
  return teams;
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
  setState({
    year,
    done: 0,
    total: result.picks.length,
    mine: result.picks.filter(p => p.drafter === currentProfileId && p.team).map(p => ({ slot: p.slot, entry: null }))
  });
  const built = await buildSeason({
    result,
    onProgress: (done, total, pick, entry) => {
      const mine = entry && pick.drafter === currentProfileId
        ? state.mine.map(m => (m.slot === pick.slot ? { slot: m.slot, entry } : m))
        : state.mine;
      setState({ done, mine });
    },
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
  return Object.keys(meta).length;
}
