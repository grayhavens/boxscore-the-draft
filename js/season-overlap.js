/* ============================================================
   Two seasons at once. A season (a draft class, js/seasons/index.js)
   is drafted in September and runs into the next fall: 2026/27's MLB
   and WNBA are still being played when the 2027 draft happens. From
   that draft until last season is recorded in History, the group has
   two seasons in play: the new one, which is what the app shows, and
   the previous one, which js/season-background.js keeps scoring in the
   background (locks, Activity, points alerts).

   Pure (no DOM, no storage, no imports), so the browser, the worker
   (alert titles) and Node tests (tests/season-overlap.test.mjs) share it:

   - seasonLabel: how a season is named on screen, "2026/27".
   - previousSeasonInPlay: which older season is still being played, if any.
   - classLeagueYear / liveTableYear: which ESPN season a league of a
     class is ("'27 Season" -> 2027), and which one ESPN's live table
     holds right now (rolledPastClassSeason: over, though ESPN moved on).
   - priorSeasonLeagues: MLB and the WNBA show the season before the
     class's own (not scoring) until the class's season begins; this
     works that out from ESPN's season calendar instead of a hand edit.
   ============================================================ */

// Where js/season-phase.js keeps each league's ESPN season (year and
// phase dates), per league: `${SEASON_PHASE_CACHE_KEY}:${league}`.
// js/data.js reads the year straight from storage at boot.
export const SEASON_PHASE_CACHE_KEY = 'teamDashboardSeasonPhaseCache';

// The leagues whose class season starts in the spring after the draft.
export const SPRING_START_LEAGUES = ['mlb', 'wnba'];

// "2026" -> "2026/27".
export function seasonLabel(id){
  const y = Number(id);
  if(!Number.isInteger(y)) return String(id);
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`;
}

// The older season still being played, or null. `ids` are the group's
// seasons oldest first; `recorded` the ids already in History. Only the
// one before the newest can be in play, and only until it's recorded or
// the new year after the newest draft (every league of the older season
// has finished by then: the World Series ends in early November).
export function previousSeasonInPlay({ ids, recorded = [], preDraft = false, now = Date.now() }){
  if(preDraft || !Array.isArray(ids) || ids.length < 2) return null;
  const latest = ids[ids.length - 1];
  const prev = ids[ids.length - 2];
  if(!/^\d{4}$/.test(prev) || !/^\d{4}$/.test(latest)) return null;
  if(recorded.includes(prev)) return null;
  if(now >= Date.UTC(Number(latest) + 1, 0, 1)) return null;
  return prev;
}

// The ESPN season year a league's class season is, from its label:
// "'26 Season" -> 2026, "'26/'27 Season" -> 2027 (ESPN names a season
// across two years by the one it ends in; the EPL is the exception,
// and isn't asked). null without a label.
export function classLeagueYear(label){
  const years = String(label || '').match(/'(\d{2})/g) || [];
  return years.length ? 2000 + Number(years[years.length - 1].slice(1)) : null;
}

// Which season a league's live ESPN table holds: ESPN's own season once
// its regular season has started, else the one before. ESPN moves its
// season year on early (in October 2026 its MLB standings said 2027 while
// still holding the 2026 table), so the year alone can't say. `espn` is
// { year, regularStart } from the season-phase cache; null when unknown.
export function liveTableYear(espn, now = Date.now()){
  if(!espn || !espn.year) return null;
  const start = espn.regularStart ? new Date(espn.regularStart).getTime() : NaN;
  return now >= start ? Number(espn.year) : Number(espn.year) - 1;
}

// Whether a league's class season is over by ESPN's calendar even though
// its phase data has moved on to the next season: ESPN's year is past the
// class's while the table still holds the class's season. Then
// isRegularSeasonOver (js/season-phase.js) is asking about the wrong season.
export function rolledPastClassSeason(espn, classYear, now = Date.now()){
  if(!espn || !classYear) return false;
  return Number(espn.year) > classYear && liveTableYear(espn, now) === classYear;
}

// The class's listed prior-season leagues (its PRIOR_SEASON_DISPLAY_LEAGUES),
// minus MLB / WNBA once the live table holds the class's season (its
// regular season has begun). `leagues` are the class's LEAGUES; `espn`
// { league: { year, regularStart } } from the season-phase cache. A
// league with nothing saved stays listed.
export function priorSeasonLeagues(listed, leagues, espn, now = Date.now()){
  return (listed || []).filter(key => {
    if(!SPRING_START_LEAGUES.includes(key)) return true;
    const league = (leagues || []).find(l => l.key === key);
    const classYear = league ? classLeagueYear(league.season) : null;
    const table = liveTableYear(espn && espn[key], now);
    return !(classYear && table && table >= classYear);
  });
}
