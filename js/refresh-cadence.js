/* ============================================================
   How often the open app refetches, by what's actually going on: fast
   while a game is live or about to start, slow when nothing is. Used by
   js/live-data.js's two loops:
   - the live sweep's per-league scoreboard (fetchEspnScoreboardCached),
     read every 20s behind a cache whose life this sets;
   - the team rotation (backgroundRefreshTick), which refetches each
     visible team's full schedule once its cycle has passed.

   Why: both ran at full speed all day. An open app asked ESPN for all 8
   leagues' scoreboards every minute, including leagues with no game
   today, and refetched ~25 teams' whole schedules (up to 275 KB of JSON
   each) every 5 minutes: about 18 requests a minute, ~10 MB an hour,
   with nothing live (docs/optimization-report.md, Phase 3 #2 and #3).
   The fast cadence stays wherever a game is live or near, so live scores
   are no later than before. Pull to refresh still fetches at once (the
   caches' isFreshAt floor, js/cache-fresh.js).

   Pure (no imports) so Node tests cover it (tests/refresh-cadence.test.mjs).
   ============================================================ */

export const MINUTE = 60 * 1000;
export const LIVE_SCOREBOARD_MS = MINUTE;          // as before: a live game's score
export const QUIET_SCOREBOARD_MAX_MS = 15 * MINUTE;
export const PRE_START_MS = 30 * MINUTE;           // back to every minute this long before a start
export const NEAR_GAME_CYCLE_MS = 5 * MINUTE;      // as before
export const QUIET_CYCLE_MS = 30 * MINUTE;
export const NEAR_AHEAD_MS = 3 * 60 * MINUTE;      // a game starting within 3 hours
export const NEAR_BEHIND_MS = 6 * 60 * MINUTE;     // or that started within 6 (covers a long game and its final)

const at = d => { const t = new Date(d).getTime(); return Number.isFinite(t) ? t : null; };

// How long a league's scoreboard stays fresh, from its events
// ({ state: 'pre'|'in'|'post', date }). A live game: a minute. Otherwise
// until PRE_START_MS before the next start, at most QUIET_SCOREBOARD_MAX_MS
// and never under a minute. A day with no games waits the maximum; no
// answer at all (a failed fetch) keeps a minute, so nothing is held back
// on a guess.
export function scoreboardTtlMs(events, now = Date.now()){
  if(!Array.isArray(events)) return LIVE_SCOREBOARD_MS;
  if(!events.length) return QUIET_SCOREBOARD_MAX_MS;
  if(events.some(e => e && e.state === 'in')) return LIVE_SCOREBOARD_MS;
  const starts = events.filter(e => e && e.state === 'pre').map(e => at(e.date)).filter(t => t !== null);
  const next = starts.length ? Math.min(...starts) : null;
  const until = next === null ? QUIET_SCOREBOARD_MAX_MS : next - PRE_START_MS - now;
  return Math.max(LIVE_SCOREBOARD_MS, Math.min(QUIET_SCOREBOARD_MAX_MS, until));
}

// How often a team's full schedule is refetched, from its bundle
// ({ espnSchedule: { upcoming, recent }, espnLive: { isLive } }).
// Near a game (live, starting within 3h, or started within 6h): 5
// minutes, as before. Otherwise 30. A bundle without an ESPN schedule
// (the TheSportsDB/TheRundown fallback) keeps 5: nothing to judge by.
export function teamCycleMs(bundle, now = Date.now()){
  const sched = bundle && bundle.espnSchedule;
  if(!sched) return NEAR_GAME_CYCLE_MS;
  if(bundle.espnLive && bundle.espnLive.isLive) return NEAR_GAME_CYCLE_MS;
  const next = sched.upcoming && sched.upcoming[0] && at(sched.upcoming[0].date);
  if(next !== null && next !== undefined && next - now <= NEAR_AHEAD_MS) return NEAR_GAME_CYCLE_MS;
  const last = sched.recent && sched.recent[0] && at(sched.recent[0].date);
  if(last !== null && last !== undefined && now - last <= NEAR_BEHIND_MS) return NEAR_GAME_CYCLE_MS;
  return QUIET_CYCLE_MS;
}
