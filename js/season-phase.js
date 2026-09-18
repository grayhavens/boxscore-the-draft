/* ============================================================
   Season phase — one real ESPN-sourced answer to "what part of its
   season is this league in right now", shared by two consumers that
   used to each carry their own (one of them unreliable) version of it:

   1. The team modal's season-phase badge (js/live-data.js's
      renderSeasonBadge) used to trust bundle.espnSeason.type, a raw
      pointer field off a single team's scoreboard fetch — confirmed
      live (2026-09-17) that pointer can be stale (NBA's said "Regular
      Season" while today's date fell inside that league's own listed
      Off Season window).
   2. LEAGUE_SCORING's regular-season point locking (js/season-lock.js)
      needs to know when a league's regular season has genuinely ended,
      so rankAuto's live/provisional placement rules (division titles,
      last place, etc — js/league-facts.js) can be snapshotted and
      frozen before the live standings table either enters the
      postseason noise or rolls over to next season's 0-0 table.

   Both now read the same thing: fetchEspnSeasonTypes (js/espn.js)
   returns a league's real Preseason/Regular Season/Postseason/Off
   Season date ranges (not a "current phase" pointer — see that
   function's own comment for why that pointer isn't trusted), fetched
   once per league and cached here with a long TTL (season phase moves
   in weeks, not minutes). "Which phase is today in" is a plain date
   comparison done here, not ESPN's own answer to that question.

   EPL has no such calendar at all — one continuous Aug-May table, no
   playoffs — so it isn't part of this cache. Its badge keeps using
   eplSeasonStatus (js/live-data.js), which already infers phase from
   a real schedule (nothing played + nothing left = Season Complete);
   its lock (js/season-lock.js) reads eplStandingsCache's own
   gamesPlayed field the same way (38 played = season complete).
   ============================================================ */
import { fetchEspnSeasonTypes } from './espn.js';

// ESPN's own site-API sport slug, and the (differently-shaped) core-API
// league slug fetchEspnSeasonTypes also needs — the first half of each
// pair matches FLAT_SCHEDULE_LEAGUES's sportPath (js/live-data.js) but
// isn't imported from there, to avoid a new cross-import into that
// already-large file for what's otherwise a handful of stable strings.
const SEASON_PHASE_PATHS = {
  nfl: { site: 'football/nfl', core: 'football/leagues/nfl' },
  nba: { site: 'basketball/nba', core: 'basketball/leagues/nba' },
  wnba: { site: 'basketball/wnba', core: 'basketball/leagues/wnba' },
  nhl: { site: 'hockey/nhl', core: 'hockey/leagues/nhl' },
  mlb: { site: 'baseball/mlb', core: 'baseball/leagues/mlb' },
  cfb: { site: 'football/college-football', core: 'football/leagues/college-football' },
  mcbb: { site: 'basketball/mens-college-basketball', core: 'basketball/leagues/mens-college-basketball' }
};

// ESPN's standard season-phase enum — same labels/classes the old
// bundle.espnSeason.type lookup used (js/live-data.js), just applied to
// a date-range match now instead of a raw pointer.
const SEASON_TYPE_LABEL = {
  1: { label: 'Pre-Season', cls: 'pre' },
  2: { label: 'In-Season', cls: 'in' },
  3: { label: 'Post-Season', cls: 'post' },
  4: { label: 'Season Complete', cls: 'complete' },
  5: { label: 'In-Season', cls: 'in' } // NBA's Play-In Season — reads as still in-season, not a 5th badge state
};

const SEASON_PHASE_CACHE_KEY = 'teamDashboardSeasonPhaseCache';
// Season phase moves in weeks, not minutes — much longer than any
// standings TTL in this app, deliberately, since this is 7 extra
// requests (one full types list per league) for something that barely
// changes hour to hour.
const SEASON_PHASE_TTL_MS = 6 * 60 * 60 * 1000;

const phaseCache = {}; // leagueKey -> { data: {year, types}, fetchedAt, loading, error }
function phaseCacheFor(leagueKey){
  return phaseCache[leagueKey] || (phaseCache[leagueKey] = { data: null, fetchedAt: null, loading: false, error: false });
}

function isFresh(cache){
  return !!cache.data && !!cache.fetchedAt && (Date.now() - cache.fetchedAt) < SEASON_PHASE_TTL_MS;
}

function localKey(leagueKey){
  return `${SEASON_PHASE_CACHE_KEY}:${leagueKey}`;
}

export function loadSeasonPhaseCache(){
  Object.keys(SEASON_PHASE_PATHS).forEach(leagueKey => {
    try {
      const raw = localStorage.getItem(localKey(leagueKey));
      if(!raw) return;
      const parsed = JSON.parse(raw);
      if(parsed && parsed.data){
        const cache = phaseCacheFor(leagueKey);
        cache.data = parsed.data;
        cache.fetchedAt = parsed.fetchedAt || null;
      }
    } catch (e){}
  });
}

function saveLocal(leagueKey, cache){
  try { localStorage.setItem(localKey(leagueKey), JSON.stringify({ data: cache.data, fetchedAt: cache.fetchedAt })); } catch (e){}
}

const phasePromises = {};

// Eager per-league fetch (mirrors every fetchEspnXStandingsCached in
// this app) — a no-op if already fresh, returns the in-flight promise
// if a fetch is already running so a caller that needs to know the
// result (js/season-lock.js's lock check) can await it instead of
// racing a second request.
export function fetchSeasonPhaseCached(leagueKey){
  const paths = SEASON_PHASE_PATHS[leagueKey];
  if(!paths) return Promise.resolve();
  const cache = phaseCacheFor(leagueKey);
  if(cache.loading) return phasePromises[leagueKey];
  if(isFresh(cache)) return Promise.resolve();

  cache.loading = true;
  phasePromises[leagueKey] = (async () => {
    const result = await fetchEspnSeasonTypes(paths.site, paths.core);
    cache.loading = false;
    if(result){
      cache.data = result;
      cache.error = false;
      cache.fetchedAt = Date.now();
      saveLocal(leagueKey, cache);
    } else if(!cache.data){
      // Same "don't blank out a good cache on a transient miss" rule
      // every other ESPN-standings cache in this app follows.
      cache.error = true;
    }
  })();
  return phasePromises[leagueKey];
}

function activeType(leagueKey){
  const cache = phaseCacheFor(leagueKey);
  if(!cache.data) return null;
  const now = new Date();
  const types = cache.data.types;
  // "Which window contains today" first; if today falls in a real gap
  // between two listed windows (not observed live, but not assumed
  // impossible either), fall back to the closest passed window so a
  // gap reads as "still whatever most recently ended" rather than
  // nothing at all.
  const contains = types.find(t => now >= new Date(t.startDate) && now <= new Date(t.endDate));
  if(contains) return contains;
  const passed = types.filter(t => now > new Date(t.endDate)).sort((a, b) => new Date(b.endDate) - new Date(a.endDate));
  return passed[0] || null;
}

// { label, cls } for the team modal's season-phase badge, or null if
// this league's phase data hasn't loaded yet (badge stays hidden, same
// as before this module existed).
export function getSeasonPhaseLabel(leagueKey){
  const type = activeType(leagueKey);
  return type ? (SEASON_TYPE_LABEL[type.type] || null) : null;
}

// Whether this league's Regular Season (ESPN type 2) has genuinely
// ended — the signal js/season-lock.js locks on. null (not false) while
// the data hasn't loaded yet, so a caller can tell "don't know yet"
// apart from "confirmed still going".
export function isRegularSeasonOver(leagueKey){
  const cache = phaseCacheFor(leagueKey);
  if(!cache.data) return null;
  const regular = cache.data.types.find(t => t.type === 2);
  if(!regular || !regular.endDate) return null;
  return new Date() > new Date(regular.endDate);
}

export const SEASON_PHASE_LEAGUES = Object.keys(SEASON_PHASE_PATHS);
