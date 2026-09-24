/* ============================================================
   Regular-season point locking.

   LEAGUE_SCORING's rankAuto placement rules (division/conference
   titles, last place, etc — see computeLiveRankAutoTeams in
   js/league-facts.js) are deliberately "provisional" while a league's
   regular season is still live: they read whatever the current ESPN
   table shows, so a team in 1st place today can drop out next week.
   That's fine mid-season, but ESPN's live standings endpoint doesn't
   stop there — the postseason and, worse, the NEXT season's 0-0 table
   would silently keep changing what "Division title" means for a
   season that's actually already over. That's the exact same problem
   PRIOR_SEASON_DISPLAY_LEAGUES (js/data.js) already works around for
   MLB/WNBA between seasons — this generalizes the same idea to the
   moment ANY league's regular season ends, not just the gap between
   two of them.

   The fix: the moment a league's regular season is confirmed over
   (js/season-phase.js's isRegularSeasonOver, or EPL's own gamesPlayed
   check below), every rankAuto rule in that league gets computed one
   last time off the live table and frozen into a snapshot. From then
   on getLeagueRuleTeams (js/league-facts.js) reads that snapshot
   instead of the live table, and isRuleProvisional reports it as no
   longer provisional — a locked league's scoring can't move again on
   its own. Two admin-only escape hatches cover the two ways that can
   go wrong: forceLockLeague locks a league the automatic ESPN-date
   detection hasn't caught yet, and unlockLeague clears a lock outright
   (an accidental Force Lock click, most likely) so the league goes
   straight back to reading the live table until it's locked again.

   Same shared/public-read, admin-write, KV+localStorage-fallback model
   as League Facts (js/league-facts.js) — see that file's own header
   comment for the full rationale, not repeated here. Storage shape:
   { lockedAt: isoString, rules: { [ruleLabel]: [teamKey, ...] } },
   one blob per league.
   ============================================================ */
import { LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { fetchJSON, loadAdminPassword, putAuthedJSON } from './utils.js';
import { DASHBOARD_WORKER_BASE } from './api.js';
import { scopedKey, withSeasonQuery } from './season.js';
import { fetchSeasonPhaseCached, isRegularSeasonOver, SEASON_PHASE_LEAGUES } from './season-phase.js';
import { eplStandingsCache } from './standings-epl.js';
import { computeLiveRankAutoTeams } from './league-facts.js';
import { renderStandings } from './board.js';
import { renderAdminPage } from './admin.js';

const SEASON_LOCK_KEY = 'teamDashboardSeasonLock';

const lockCache = {}; // leagueKey -> { data: {lockedAt, rules} | null, loading, error }
function lockCacheFor(leagueKey){
  return lockCache[leagueKey] || (lockCache[leagueKey] = { data: null, loading: false, error: false });
}

function localKey(leagueKey){
  return `${scopedKey(SEASON_LOCK_KEY)}:${leagueKey}`;
}

function loadLocalLock(leagueKey){
  try {
    return JSON.parse(localStorage.getItem(localKey(leagueKey))) || null;
  } catch (e){
    return null;
  }
}

function saveLocalLock(leagueKey, lock){
  try { localStorage.setItem(localKey(leagueKey), JSON.stringify(lock)); } catch (e){}
}

const lockPromises = {}; // leagueKey -> in-flight GET promise

// Awaitable version of the lazy fetch every other cache in this app
// uses (see currentLeagueFacts in js/league-facts.js) — checkSeasonLocks
// below needs to know the REAL current lock state before deciding
// whether to write a new one, not whatever's cached a render behind, or
// two tabs (or a slow first load racing its own lock check) could each
// think a league isn't locked yet and both compute+write a snapshot.
function ensureLockLoaded(leagueKey){
  const cache = lockCacheFor(leagueKey);
  if(cache.data !== null || cache.error) return Promise.resolve();
  if(lockPromises[leagueKey]) return lockPromises[leagueKey];
  if(!DASHBOARD_WORKER_BASE){
    // No local lock either (the common case, for any league that isn't
    // locked) must still leave cache.data non-null — currentLock's
    // "cache.data === null" guard below is what decides whether to fetch
    // again, and {} unambiguously means "confirmed unlocked" the same
    // way it does in the fetched branch below.
    cache.data = loadLocalLock(leagueKey) || {};
    return Promise.resolve();
  }
  lockPromises[leagueKey] = (async () => {
    const data = await fetchJSON(withSeasonQuery(`${DASHBOARD_WORKER_BASE}/lock/${leagueKey}`));
    // A lock cleared by unlockLeague moments after this GET started
    // (another tab, most likely) is an acceptable rare race here, not
    // one this app needs to handle — same tolerance every other
    // shared-write cache in this app (facts/adjustments) already has
    // for "briefly stale until the next fetch."
    if(data && typeof data === 'object' && data.lockedAt){
      cache.data = data;
      saveLocalLock(leagueKey, data);
    } else if(data){
      // {} from a league that's never been locked — a real, successful
      // answer, not "still loading". Must still land on a non-null
      // cache.data (falling back to any locally-saved lock, or the {}
      // itself) or currentLock's guard below never clears and every
      // render re-kicks this same fetch, forever.
      cache.data = loadLocalLock(leagueKey) || data;
    } else {
      // A genuine fetch failure — cache.error (not cache.data) is what
      // stops currentLock from retrying below.
      cache.data = loadLocalLock(leagueKey);
      cache.error = true;
    }
  })();
  return lockPromises[leagueKey];
}

// Synchronous read used everywhere the app needs "what's the current
// lock state" for rendering — the shared copy once loaded, the local
// fallback until then. Kicks off the network fetch on first read, same
// lazy-load pattern as currentLeagueFacts.
function currentLock(leagueKey){
  const cache = lockCacheFor(leagueKey);
  if(cache.data === null && !cache.loading && !cache.error){
    cache.loading = true;
    ensureLockLoaded(leagueKey).then(() => { cache.loading = false; renderStandings(); renderAdminPage(); });
  }
  return cache.data || loadLocalLock(leagueKey);
}

export function isLeagueLocked(leagueKey){
  const lock = currentLock(leagueKey);
  return !!(lock && lock.lockedAt);
}

export function getLockedRuleTeams(leagueKey, ruleLabel){
  const lock = currentLock(leagueKey);
  return (lock && lock.rules && lock.rules[ruleLabel]) || [];
}

// For the admin page's "Locked <date>" display.
export function lockedAtFor(leagueKey){
  const lock = currentLock(leagueKey);
  return lock ? lock.lockedAt : null;
}

function persistLock(leagueKey, lock){
  const cache = lockCacheFor(leagueKey);
  cache.data = lock;
  saveLocalLock(leagueKey, lock);
  if(DASHBOARD_WORKER_BASE){
    putAuthedJSON(withSeasonQuery(`${DASHBOARD_WORKER_BASE}/lock/${leagueKey}`), loadAdminPassword(), lock)
      .then(({ ok }) => { if(!ok) console.warn('[Season Lock]', leagueKey, 'failed to sync to shared store'); });
  }
  renderStandings();
  renderAdminPage();
}

// Computes every rankAuto rule's current answer one last time and
// freezes it — called once, either by checkSeasonLocks below once ESPN
// confirms the regular season is over, or directly by an admin's
// "Force lock" button (unlockLeague further down is the undo for this,
// if it fires too early). Guards against PRIOR_SEASON_DISPLAY_LEAGUES
// here too, not just in checkSeasonLocks — forceLockLeague is a direct,
// unchecked entry point from the admin page, and locking in MLB/WNBA's
// current (non-counting, last season's) table would be a real mistake
// even with an undo available, not just a premature one.
function lockLeague(leagueKey){
  const scoring = LEAGUE_SCORING[leagueKey];
  if(!scoring || PRIOR_SEASON_DISPLAY_LEAGUES.includes(leagueKey)) return;
  const rules = {};
  scoring.rules.filter(r => r.rankAuto).forEach(r => {
    rules[r.label] = computeLiveRankAutoTeams(leagueKey, r);
  });
  persistLock(leagueKey, { lockedAt: new Date().toISOString(), rules });
}

export function forceLockLeague(leagueKey){
  lockLeague(leagueKey);
}
window.forceLockLeague = forceLockLeague;

// Clears a league's lock outright — the safety valve for an accidental
// Force Lock (or an automatic lock that fired on bad ESPN data): once
// unlocked, getLeagueRuleTeams/isRuleProvisional (js/league-facts.js)
// go straight back to reading the live table, exactly as if this
// league had never locked. Persists an empty {} rather than deleting
// the KV entry outright — same "PUT the full object, GET treats a
// never-written key the same as an explicit {}" contract every other
// write in this app already follows (see handleSeasonLock in
// worker/rundown-proxy.js).
export function unlockLeague(leagueKey){
  persistLock(leagueKey, {});
}
window.unlockLeague = unlockLeague;

// EPL has no discrete regular-season/postseason split for
// isRegularSeasonOver (js/season-phase.js) to read at all — one
// continuous 38-match-per-club Aug-May table, no playoffs. A real EPL
// season is complete once every club has played all 38 — the same
// `gamesPlayed` field the Standings tab already reads off
// eplStandingsCache (js/standings-epl.js), so this needs no extra fetch.
const EPL_MATCHES_PER_CLUB = 38;
function isEplRegularSeasonOver(){
  const table = eplStandingsCache.table;
  if(!table || !table.length) return null;
  return table.every(row => (row.gamesPlayed || 0) >= EPL_MATCHES_PER_CLUB);
}

// Checked once at boot (js/board.js) — cheap the vast majority of the
// time: every already-locked or still-mid-season league just returns
// immediately. Safe to call again later (e.g. a future scheduled
// re-check) since it's a no-op for anything already locked.
export async function checkSeasonLocks(){
  const leagueKeys = [...SEASON_PHASE_LEAGUES, 'epl'];
  for(const leagueKey of leagueKeys){
    if(!LEAGUE_SCORING[leagueKey]) continue;
    // MLB/WNBA's live table is still last season's right now — nothing
    // to lock until PRIOR_SEASON_DISPLAY_LEAGUES (js/data.js) no longer
    // lists them, the same gate getLeagueRuleTeams already applies.
    if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(leagueKey)) continue;
    await ensureLockLoaded(leagueKey);
    if(isLeagueLocked(leagueKey)) continue;
    let over;
    if(leagueKey === 'epl'){
      over = isEplRegularSeasonOver();
    } else {
      await fetchSeasonPhaseCached(leagueKey);
      over = isRegularSeasonOver(leagueKey);
    }
    if(over) lockLeague(leagueKey);
  }
}
