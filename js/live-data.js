/* ============================================================
   Live data: fetch, cache, and render each team's stats/last
   result/next fixture, plus the team detail modal and the staggered
   background refresh loop that keeps it all current.
   ============================================================ */
import { TEAM_META, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { fetchJSON, ordinal, formatKickoff, teamBadgeHtml, lockBodyScroll, unlockBodyScroll, enableSheetSwipeToDismiss, BALL_ICON_SVG } from './utils.js';
import { API_BASE, fetchRundownEventForTeam, isRundownEventLive, V2_MIGRATED_LEAGUES, UPCOMING_CHIP_LEAGUES, fetchSportsDbV2Team, fetchSportsDbV2Schedule } from './api.js';
import { fetchEplStandingsTable, findEspnEplRow } from './standings-epl.js';
import { fetchEspnTeamSchedule, fetchEspnScoreboard, findEspnScoreboardLine, fetchEspnSummary, fetchEspnFootballSummary, fetchEspnSoccerSummary } from './espn.js';
import { fetchMlbGameExtras } from './mlb-stats.js';
import { findCfbRecord, findEspnCfbRow, fetchEspnCfbRecordsCached } from './standings-cfb.js';
import { findEspnNflRow, fetchEspnNflStandingsCached, nflDivisionLabel, fetchEspnNflDivisionStandingsCached } from './standings-nfl.js';
import { nbaRecordLabel, findEspnNbaRow, fetchEspnNbaStandingsCached, nbaDivisionLabel, fetchEspnNbaDivisionStandingsCached } from './standings-nba.js';
import { nhlRecordLabel, findEspnNhlRow, fetchEspnNhlStandingsCached, nhlDivisionLabel, fetchEspnNhlDivisionStandingsCached } from './standings-nhl.js';
import { mlbRecordLabel, findEspnMlbRow, fetchEspnMlbStandingsCached, mlbDivisionLabel, fetchEspnMlbDivisionStandingsCached } from './standings-mlb.js';
import { wnbaRecordLabel, findEspnWnbaRow, fetchEspnWnbaStandingsCached } from './standings-wnba.js';
import { trackerSectionHtml } from './league-facts.js';

// Every league whose Most Recent Result/Next Match comes from ESPN's
// team-schedule endpoint (js/espn.js's fetchEspnTeamSchedule) rather
// than TheSportsDB — see the "EPL/NBA/NHL/MLB/WNBA" branch in
// fetchTeamBundle below. Each entry's `ensureStandings` is that
// league's own fetchCached (called first so `findRow` can resolve this
// club's ESPN team id by name — ESPN's ids don't line up with
// TheSportsDB's sportsdbId), and `sportPath` is ESPN's own sport/league
// slug for the schedule URL.
const FLAT_SCHEDULE_LEAGUES = {
  epl: { sportPath: 'soccer/eng.1', ensureStandings: fetchEplStandingsTable, findRow: findEspnEplRow },
  nfl: { sportPath: 'football/nfl', ensureStandings: fetchEspnNflStandingsCached, findRow: findEspnNflRow },
  cfb: { sportPath: 'football/college-football', ensureStandings: fetchEspnCfbRecordsCached, findRow: findEspnCfbRow },
  nba: { sportPath: 'basketball/nba', ensureStandings: fetchEspnNbaStandingsCached, findRow: findEspnNbaRow },
  nhl: { sportPath: 'hockey/nhl', ensureStandings: fetchEspnNhlStandingsCached, findRow: findEspnNhlRow },
  mlb: { sportPath: 'baseball/mlb', ensureStandings: fetchEspnMlbStandingsCached, findRow: findEspnMlbRow },
  wnba: { sportPath: 'basketball/wnba', ensureStandings: fetchEspnWnbaStandingsCached, findRow: findEspnWnbaRow }
};

// Game Details header title (see renderGameDetail below) picks one of
// three name styles per league, via each GAME_DETAIL_LEAGUES entry's
// `titleName` below — college programs go by school alone (no mascot:
// "Ohio State", not "Ohio State Buckeyes"), same-metro pro leagues go
// by mascot alone (no city: "Mets"/"Yankees", not "New York Mets"/"New
// York Yankees" — the city tells two teams apart but adds nothing once
// they're already side by side), and everyone else keeps the full
// "Location Mascot" name. Falls back through location/mascot/name/abbr
// at each step in case ESPN ever omits one (same defensiveness as
// espnTeamName in js/espn.js).
const titleNameLocation = team => (team && (team.location || team.mascot || team.name || team.abbr)) || '';
const titleNameMascot = team => (team && (team.mascot || team.location || team.name || team.abbr)) || '';
const titleNameFull = team => (team && (team.name || team.abbr)) || '';

// Leagues wired up for the "Game Details" boxscore drill-down (see
// openGameDetail/renderGameDetail below) — MLB first, CFB added
// 2026-09-12, EPL added 2026-09-12, NFL added 2026-09-12 (reuses CFB's
// football reader/linescore/situation text as-is — ESPN's football
// summary shape is the same for both). Each entry's `fetchSummary` is
// that sport's own summary reader (js/espn.js); `linescorePeriods`/
// `periodLabel` describe the linescore table's columns (9 innings vs. 4
// quarters+OT) — unused for EPL, which renders a goals/cards split
// instead of a linescore (see the `leagueKey === 'epl'` branch in
// renderGameDetail below), so those two keys are simply omitted there.
// basketball/hockey aren't here yet — no per-sport summary reader has
// been written for them (see docs/espn-migration-plan.md's Game Details
// section) — when they are, they're pro leagues sharing metro areas
// same as MLB, so they should use titleNameMascot too.
const GAME_DETAIL_LEAGUES = {
  mlb: {
    fetchSummary: fetchEspnSummary,
    linescorePeriods: 9,
    periodLabel: i => String(i + 1),
    situationText: mlbSituationText,
    titleName: titleNameMascot
  },
  cfb: {
    fetchSummary: fetchEspnFootballSummary,
    linescorePeriods: 4,
    periodLabel: i => (i < 4 ? String(i + 1) : (i === 4 ? 'OT' : `OT${i - 3}`)),
    situationText: footballSituationText,
    titleName: titleNameLocation
  },
  nfl: {
    fetchSummary: fetchEspnFootballSummary,
    linescorePeriods: 4,
    periodLabel: i => (i < 4 ? String(i + 1) : (i === 4 ? 'OT' : `OT${i - 3}`)),
    situationText: footballSituationText,
    titleName: titleNameFull
  },
  epl: {
    fetchSummary: fetchEspnSoccerSummary,
    // ESPN never sends a `situation` object for soccer (see
    // fetchEspnScoreboard's comment in js/espn.js) — always null in
    // practice, but renderGameDetail calls this unconditionally same as
    // every other league, so it needs a real function rather than being
    // omitted.
    situationText: () => null,
    titleName: titleNameFull
  }
};

// Today's scoreboard for a league — one shared fetch per sportPath
// (mirrors rundownDayCache in js/api.js), not one per team, since every
// team in FLAT_SCHEDULE_LEAGUES sharing a sportPath reads the exact
// same response. This is what replaces TheRundown for live in-game
// state (score/clock while a game is actually in progress) across
// those 7 leagues — see fetchEspnScoreboard/findEspnScoreboardLine in
// js/espn.js. Short TTL since a live score can move by the second;
// same cadence TheRundown's own day-cache used.
const ESPN_SCOREBOARD_TTL_MS = 60 * 1000;
const espnScoreboardCache = {}; // sportPath -> { data: {events, season}, fetchedAt }

async function fetchEspnScoreboardCached(sportPath){
  const cached = espnScoreboardCache[sportPath];
  if(cached && (Date.now() - cached.fetchedAt) < ESPN_SCOREBOARD_TTL_MS) return cached.data;
  const data = await fetchEspnScoreboard(sportPath);
  espnScoreboardCache[sportPath] = { data, fetchedAt: Date.now() };
  return data;
}

const LIVE_DATA_CACHE_KEY = 'teamDashboardLiveDataCache';

export const liveDataCache = {}; // teamKey -> { info, last, next, table, fetchedAt }

// Mirrors liveDataCache to localStorage — one key per team — so a
// team's last-known result survives across browser sessions, rather
// than every fresh page load starting blank until that team's turn
// comes up in the staggered background refresh (see REFRESH_STEP_MS
// below), which can take up to ~15 minutes. This is a per-browser
// convenience cache, not shared state — every viewer still fetches
// their own fresh data on the same schedule as before; this only
// changes what shows while waiting for that.
//
// Written per-team rather than as one growing JSON blob under
// LIVE_DATA_CACHE_KEY (the old shape) so a single team's refresh tick
// only serializes and writes that team's own entry — with the roster
// headed toward ~225 teams (see LIVE_TEAM_KEYS below), rewriting one
// ever-larger blob on every ~14s tick would mean a bigger synchronous
// write each time, almost all of it for teams that didn't even change.
const LIVE_DATA_CACHE_PREFIX = 'teamDashboardLiveData:';

function saveTeamBundleToStorage(teamKey, bundle){
  try { localStorage.setItem(LIVE_DATA_CACHE_PREFIX + teamKey, JSON.stringify(bundle)); } catch (e){}
}

function setTeamBundle(teamKey, bundle){
  liveDataCache[teamKey] = bundle;
  saveTeamBundleToStorage(teamKey, bundle);
}

// One-time move off the old single-blob key: reads whatever's there,
// fans it out into the new per-team keys, then removes it — so this
// only ever runs once, the same "don't lose what's already saved"
// approach as migrateAchievementsToFacts (js/league-facts.js).
function migrateLegacyLiveDataCache(){
  try {
    const raw = localStorage.getItem(LIVE_DATA_CACHE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    for(const teamKey of Object.keys(parsed)){
      localStorage.setItem(LIVE_DATA_CACHE_PREFIX + teamKey, JSON.stringify(parsed[teamKey]));
    }
    localStorage.removeItem(LIVE_DATA_CACHE_KEY);
  } catch (e){}
}

// Called once at boot, before the first paint, so cached pills show
// immediately rather than blank. fetchedAt round-trips through
// JSON.stringify as an ISO string, so it's parsed back into a Date
// here — everything else in a bundle is plain JSON already.
export function loadLiveDataCache(){
  migrateLegacyLiveDataCache();
  try {
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key || !key.startsWith(LIVE_DATA_CACHE_PREFIX)) continue;
      const teamKey = key.slice(LIVE_DATA_CACHE_PREFIX.length);
      const raw = localStorage.getItem(key);
      if(!raw) continue;
      const bundle = JSON.parse(raw);
      if(bundle && bundle.fetchedAt) bundle.fetchedAt = new Date(bundle.fetchedAt);
      liveDataCache[teamKey] = bundle;
    }
  } catch (e){}
}

// ---- Team info: a separate, much slower-refreshing cache ----
// Of the 3 SportsDB calls a team used to make every single refresh
// tick, "team info" (sport, founded year, stadium, colors, badge) is
// essentially static — it doesn't change mid-season, unlike a team's
// last result or next fixture. Pulling it out of the per-tick fetch
// and caching it for a full day (persisted, so a fresh page load
// doesn't even need to re-fetch it) cuts a third of the per-team call
// volume with no real freshness cost. Same TTL-cache shape as
// eplStandingsCache/rundownDayCache elsewhere.
// Legacy single-blob key, migrated away from below (see
// migrateLegacyLiveDataCache's twin above for why: one growing
// JSON blob rewritten on every fetch doesn't scale as the roster grows).
const TEAM_INFO_CACHE_LEGACY_KEY = 'teamDashboardTeamInfoCache';
const TEAM_INFO_CACHE_PREFIX = 'teamDashboardTeamInfo:';
const TEAM_INFO_TTL_MS = 24 * 60 * 60 * 1000;
const teamInfoCache = {}; // teamKey -> { info, fetchedAt }

function saveTeamInfoToStorage(teamKey, entry){
  try { localStorage.setItem(TEAM_INFO_CACHE_PREFIX + teamKey, JSON.stringify(entry)); } catch (e){}
}

function migrateLegacyTeamInfoCache(){
  try {
    const raw = localStorage.getItem(TEAM_INFO_CACHE_LEGACY_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    for(const teamKey of Object.keys(parsed)){
      localStorage.setItem(TEAM_INFO_CACHE_PREFIX + teamKey, JSON.stringify(parsed[teamKey]));
    }
    localStorage.removeItem(TEAM_INFO_CACHE_LEGACY_KEY);
  } catch (e){}
}

export function loadTeamInfoCache(){
  migrateLegacyTeamInfoCache();
  try {
    for(let i = 0; i < localStorage.length; i++){
      const key = localStorage.key(i);
      if(!key || !key.startsWith(TEAM_INFO_CACHE_PREFIX)) continue;
      const teamKey = key.slice(TEAM_INFO_CACHE_PREFIX.length);
      const raw = localStorage.getItem(key);
      if(raw) teamInfoCache[teamKey] = JSON.parse(raw);
    }
  } catch (e){}
}

async function fetchTeamInfoCached(teamKey, id, useV2){
  const cached = teamInfoCache[teamKey];
  if(cached && (Date.now() - cached.fetchedAt) < TEAM_INFO_TTL_MS) return cached.info;

  const info = useV2 ? await fetchSportsDbV2Team(id) : await fetchJSON(`${API_BASE}lookupteam.php?id=${id}`);
  const entry = { info, fetchedAt: Date.now() };
  teamInfoCache[teamKey] = entry;
  saveTeamInfoToStorage(teamKey, entry);
  return entry.info;
}

async function fetchTeamBundle(teamKey){
  const meta = TEAM_META[teamKey];
  if(!meta) return null;

  // EPL/NFL/CFB/NBA/NHL/MLB/WNBA: real schedule (past results + every
  // remaining fixture) from ESPN (js/espn.js) instead of TheSportsDB's
  // eventslast/eventsnext (V1) or schedule-previous/schedule-next
  // (V2) — see fetchEspnTeamSchedule for what that adds (real venue
  // names, TV broadcasts). Standings have to load first: ESPN's team
  // ids don't line up with TheSportsDB's sportsdbId (same issue
  // findEspnEplRow/findEspnNbaRow/etc already solve for the stat
  // strip), so this club's ESPN id is resolved by name through the
  // standings table rather than carried as its own TEAM_META field —
  // which also means this doesn't need meta.sportsdbId at all, unlike
  // the generic branch below: NBA/NHL/MLB/WNBA teams that were never
  // given a sportsdbId (every currently-drafted team but Josh's own —
  // real board-card records for them already came from this same
  // name-matching, see js/standings-flat.js) get a real modal schedule
  // here too, not just the "not hooked up" placeholder they got before
  // this was checked ahead of the sportsdbId gate. Only commits to this
  // path once that id actually resolves — a team whose row genuinely
  // never resolves falls through to the generic TheSportsDB/TheRundown
  // branch below instead of ending up with no data at all, same as
  // NDSU used to before it got its own ESPN row (see NDSU_ESPN_TEAM_ID
  // in js/standings-cfb.js).
  const flatSchedule = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(flatSchedule){
    await flatSchedule.ensureStandings();
    const row = flatSchedule.findRow(meta);
    if(row){
      // No TheSportsDB "info" fetch here — every league on this path
      // has its own real-record branch in renderStats (findEspnEplRow,
      // findCfbRecord, etc.) that always renders first, so bundle.info
      // (TheSportsDB's generic Sport/Founded/Stadium bio) would never
      // actually reach the screen for a team that resolves this far.
      // Fetching it anyway was pure unused SportsDB traffic on every
      // refresh — cut once that stopped being needed for NDSU too (see
      // NDSU_ESPN_TEAM_ID in js/standings-cfb.js).
      const [espnSchedule, scoreboard] = await Promise.all([
        fetchEspnTeamSchedule(flatSchedule.sportPath, row.id),
        fetchEspnScoreboardCached(flatSchedule.sportPath)
      ]);
      const espnLive = findEspnScoreboardLine(scoreboard ? scoreboard.events : null, row.id);
      const espnSeason = scoreboard ? scoreboard.season : null;
      const bundle = { info: null, last: null, next: null, espnSchedule, espnLive, espnSeason, rundownTeamId: meta.rundownTeamId || null, fetchedAt: new Date() };
      setTeamBundle(teamKey, bundle);
      return bundle;
    }
  }

  if(!meta.sportsdbId && !meta.rundownTeamId) return null;

  if(meta.sportsdbId){
    const id = meta.sportsdbId;
    const useV2 = V2_MIGRATED_LEAGUES.includes(meta.leagueKey);

    // TheSportsDB-primary teams (the common case): everything comes from
    // TheSportsDB, optionally supplemented with TheRundown's in-game
    // state for leagues in RUNDOWN_SPORT_ID (see fetchRundownEventForTeam).
    // Team info is decoupled from this per-tick fetch — see
    // fetchTeamInfoCached — since it's the one piece of this bundle
    // that's effectively static.
    const [info, last, next, rundownEvent] = await Promise.all([
      fetchTeamInfoCached(teamKey, id, useV2),
      useV2 ? fetchSportsDbV2Schedule('schedule-previous', id) : fetchJSON(`${API_BASE}eventslast.php?id=${id}`),
      useV2 ? fetchSportsDbV2Schedule('schedule-next', id) : fetchJSON(`${API_BASE}eventsnext.php?id=${id}`),
      fetchRundownEventForTeam(meta)
    ]);

    const bundle = { info, last, next, rundownEvent, rundownTeamId: meta.rundownTeamId || null, fetchedAt: new Date() };
    setTeamBundle(teamKey, bundle);
    return bundle;
  }

  // Rundown-only teams (currently just College Basketball, which
  // TheSportsDB doesn't carry at all): TheRundown is the sole live
  // source. Scoped to today's slate only, not a multi-day lookahead —
  // see renderRowStatus/renderNext/renderForm for how that's rendered.
  const rundownEvent = await fetchRundownEventForTeam(meta);
  const bundle = { info: null, last: null, next: null, table: null, rundownEvent, rundownTeamId: meta.rundownTeamId, rundownOnly: true, fetchedAt: new Date() };
  setTeamBundle(teamKey, bundle);
  return bundle;
}

// Turns ESPN's solid zone hex (e.g. "#81D6AC") into a low-alpha rgba,
// matching the soft-tint badge look used everywhere else (--win-soft,
// --loss-soft, etc.) instead of a solid pastel fill with forced dark text.
function softZoneTint(hex, alpha){
  const h = hex.replace(/^#+/, '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ESPN's standard season-phase enum — confirmed against the core API's
// leagues/{league}/seasons/{year}/types listing (NFL: 1 Preseason 2026-
// 08-06→09-06, 2 Regular Season 09-06→2027-01-13, 3 Postseason →02-16,
// 4 Off Season →08-01) — mapped to the modal-head season badge below.
const ESPN_SEASON_TYPE = {
  1: { label: 'Pre-Season', cls: 'pre' },
  2: { label: 'In-Season', cls: 'in' },
  3: { label: 'Post-Season', cls: 'post' },
  4: { label: 'Season Complete', cls: 'complete' }
};

// EPL's ESPN season has no pre/post/off split at all — the core API
// lists exactly one continuous "types" entry for the whole Aug-May
// campaign, unlike NFL/NBA/etc's four. So instead of a real
// season.type, this reads the same schedule already fetched for the
// modal (bundle.espnSchedule) and infers phase from what's actually on
// it: nothing played and nothing left means the close season, nothing
// played yet but fixtures exist means it hasn't kicked off, and
// everything else (or a full but exhausted fixture list) is scored as
// either mid-season or wrapped up.
function eplSeasonStatus(bundle){
  const sched = bundle.espnSchedule;
  if(!sched) return null;
  const played = sched.recent && sched.recent.length > 0;
  const scheduled = sched.upcoming && sched.upcoming.length > 0;
  if(!played && !scheduled) return { label: 'Season Complete', cls: 'complete' };
  if(!played) return { label: 'Pre-Season', cls: 'pre' };
  if(!scheduled) return { label: 'Season Complete', cls: 'complete' };
  return { label: 'In-Season', cls: 'in' };
}

// What phase of its season this team's league is actually in right
// now — not just "do we have live data hooked up" (that's hasLive in
// openTeamModal, which only gates whether this badge's slot exists at
// all). Returns null when there's no reliable signal (college
// basketball has no ESPN wiring at all — see FLAT_SCHEDULE_LEAGUES —
// so its bundle carries neither espnSeason nor espnSchedule), in which
// case the badge stays hidden rather than guessing.
function seasonStatus(meta, bundle){
  if(meta.leagueKey === 'epl') return eplSeasonStatus(bundle);
  if(bundle.espnSeason && ESPN_SEASON_TYPE[bundle.espnSeason.type]) return ESPN_SEASON_TYPE[bundle.espnSeason.type];
  return null;
}

function renderSeasonBadge(meta, bundle){
  const el = document.getElementById('season-badge');
  if(!el) return;
  // MLB/WNBA: this badge would just be reporting on the '26 season
  // that doesn't count towards drafted points (see priorSeasonNoteHtml
  // in openTeamModal below) — showing "In-Season" here reads as if the
  // team is live for scoring purposes, so skip the badge entirely.
  if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(meta.leagueKey)) {
    el.style.display = 'none';
    el.innerHTML = '';
    return;
  }
  const status = seasonStatus(meta, bundle);
  el.style.display = status ? 'inline-block' : 'none';
  el.innerHTML = status ? `<span class="season-badge ${status.cls}">${status.label}</span>` : '';
}

export function renderStats(meta, bundle){
  const el = document.getElementById('live-stats');
  if(!el) return;

  // EPL: same ESPN standings source the Standings tab reads (see
  // findEspnEplRow/eplRecordLabel in js/standings-epl.js) — this used
  // to match on TheSportsDB's idTeam/sportsdbId; ESPN's team ids don't
  // line up with those, so this matches by club name instead, same as
  // everywhere else in standings-epl.js.
  if(meta.leagueKey === 'epl'){
    const row = findEspnEplRow(meta);
    if(row){
      el.innerHTML = `
        <div class="stat-cell"><div class="num">${ordinal(row.rank)}</div><div class="lbl">Position</div></div>
        <div class="stat-cell"><div class="num">${row.points}</div><div class="lbl">Points</div></div>
        <div class="stat-cell"><div class="num">${row.wins}-${row.draws}-${row.losses}</div><div class="lbl">W-D-L</div></div>
      `;
      // Champions League/Europa League/Relegation — straight off ESPN's
      // own qualification-zone note, which TheSportsDB's table never
      // had at all. Sits in the modal head (see openTeamModal), not the
      // stat strip, so this only updates that one span rather than
      // re-rendering stats around it.
      const zoneEl = document.getElementById('zone-tag');
      if(zoneEl){
        // display toggled (not just emptied) so an inactive zone doesn't
        // still eat a flex gap slot in .modal-sub next to it.
        zoneEl.style.display = row.zone ? 'inline-block' : 'none';
        const zoneColor = row.zoneColor || '#94969E';
        zoneEl.innerHTML = row.zone
          ? `<span class="zone-tag" style="color:${zoneColor};background:${softZoneTint(zoneColor, 0.16)};">${row.zone}</span>`
          : '';
      }
      return;
    }
  }

  // CFB: findCfbRecord (js/standings-cfb.js) — ESPN's full FBS
  // standings first, falling back to TheRundown only for the one
  // drafted FCS team ESPN's standings don't cover — carries a real
  // record and AP Top 25 rank, more useful here than TheSportsDB's
  // generic Sport/Founded/Stadium bio fields.
  if(meta.leagueKey === 'cfb'){
    const rec = findCfbRecord(meta);
    if(rec && rec.wins !== null){
      el.innerHTML = `
        <div class="stat-cell"><div class="num">${rec.wins}-${rec.losses}</div><div class="lbl">Record</div></div>
        <div class="stat-cell"><div class="num">${typeof rec.ranking === 'number' ? '#' + rec.ranking : 'NR'}</div><div class="lbl">AP Rank</div></div>
      `;
      return;
    }
  }

  // NFL: same ESPN standings source the Standings tab reads (see
  // findEspnNflRow/nflRecordLabel in js/standings-nfl.js) — this used
  // to read TheRundown's per-team division field instead, which could
  // (and did) drift from what the Standings tab showed once that moved
  // to ESPN. Division now comes from that same Standings-tab source too
  // (nflDivisionLabel/fetchEspnNflDivisionStandingsCached) — it didn't
  // exist when this modal was first built (ESPN's simple standings
  // endpoint has no division field at all; that heavier per-division
  // fetch came later), which is why Conference used to be the only
  // grouping shown here. fetchEspnNflDivisionStandingsCached is a no-op
  // if already fresh; kicked off here (not just from the Standings tab)
  // since this is often the first place in a session that needs it —
  // its own completion re-renders this modal if it's still open once
  // that heavier fetch resolves.
  if(meta.leagueKey === 'nfl'){
    const row = findEspnNflRow(meta);
    if(row){
      const recordLabel = `${row.wins}-${row.losses}${row.ties ? '-' + row.ties : ''}`;
      fetchEspnNflDivisionStandingsCached();
      el.innerHTML = `
        <div class="stat-cell"><div class="num">${recordLabel}</div><div class="lbl">Record</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${row.conferenceAbbr || '—'}</div><div class="lbl">Conference</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${nflDivisionLabel(meta) || '—'}</div><div class="lbl">Division</div></div>
      `;
      return;
    }
  }

  // NBA/NHL/MLB/WNBA: same ESPN standings source the Standings tab
  // reads (js/standings-flat.js's createFlatStandingsBoard) — these 4
  // leagues had no real record source at all before ESPN, only the
  // generic Sport/Founded/Stadium bio fields below. Division (NBA/NHL/
  // MLB only — WNBA has no real divisions, see js/standings-wnba.js)
  // follows the same "kick off the heavier fetch here, its own
  // completion re-renders this modal" pattern as NFL's above.
  if(meta.leagueKey === 'nba'){
    const record = nbaRecordLabel(meta);
    if(record){
      const row = findEspnNbaRow(meta);
      fetchEspnNbaDivisionStandingsCached();
      el.innerHTML = `
        <div class="stat-cell"><div class="num">${record}</div><div class="lbl">Record</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${row.conferenceAbbr || '—'}</div><div class="lbl">Conference</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${nbaDivisionLabel(meta) || '—'}</div><div class="lbl">Division</div></div>
      `;
      return;
    }
  }
  if(meta.leagueKey === 'nhl'){
    const record = nhlRecordLabel(meta);
    if(record){
      const row = findEspnNhlRow(meta);
      fetchEspnNhlDivisionStandingsCached();
      el.innerHTML = `
        <div class="stat-cell"><div class="num">${row.wins}-${row.losses}-${row.otLosses || 0}</div><div class="lbl">Record</div></div>
        <div class="stat-cell"><div class="num">${row.points}</div><div class="lbl">Points</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${row.conferenceAbbr || '—'}</div><div class="lbl">Conference</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${nhlDivisionLabel(meta) || '—'}</div><div class="lbl">Division</div></div>
      `;
      return;
    }
  }
  if(meta.leagueKey === 'mlb'){
    const record = mlbRecordLabel(meta);
    if(record){
      const row = findEspnMlbRow(meta);
      fetchEspnMlbDivisionStandingsCached();
      el.innerHTML = `
        <div class="stat-cell"><div class="num">${record}</div><div class="lbl">Record</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${row.conferenceAbbr || '—'}</div><div class="lbl">League</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${mlbDivisionLabel(meta) || '—'}</div><div class="lbl">Division</div></div>
      `;
      return;
    }
  }
  if(meta.leagueKey === 'wnba'){
    const record = wnbaRecordLabel(meta);
    if(record){
      const row = findEspnWnbaRow(meta);
      el.innerHTML = `
        <div class="stat-cell"><div class="num">${record}</div><div class="lbl">Record</div></div>
        <div class="stat-cell"><div class="num" style="font-size:14px;">${row.conferenceAbbr || '—'}</div><div class="lbl">Conference</div></div>
      `;
      return;
    }
  }

  const team = bundle.info && bundle.info.teams && bundle.info.teams[0];
  if(team){
    el.innerHTML = `
      <div class="stat-cell"><div class="num">${team.strSport || '—'}</div><div class="lbl">Sport</div></div>
      <div class="stat-cell"><div class="num">${team.intFormedYear || '—'}</div><div class="lbl">Founded</div></div>
      <div class="stat-cell"><div class="num" style="font-size:14px;">${team.strStadium || '—'}</div><div class="lbl">Home</div></div>
    `;
    return;
  }

  el.innerHTML = bundle.rundownOnly
    ? `<div class="stat-cell" style="flex:1;"><div class="lbl">Team info isn't available from this data source</div></div>`
    : `<div class="stat-cell" style="flex:1;"><div class="lbl">Live stats unavailable right now</div></div>`;
}

// Last 5 results as a compact row of pills, oldest on the left ending
// with the most recent (matches recentEvents' own newest-first order,
// so this just reverses a slice of it) — the detailed line rendered
// below it always covers the rightmost/most recent one already.
function formStripHtml(recentEvents){
  const last5 = recentEvents.slice(0, 5).reverse();
  return `
    <div class="form-strip">
      ${last5.map(evt => {
        let cls = 'd', label = 'D';
        if(evt.ownScore > evt.oppScore){ cls = 'w'; label = 'W'; }
        else if(evt.ownScore < evt.oppScore){ cls = 'l'; label = 'L'; }
        const title = `${evt.isHome ? 'vs' : 'at'} ${evt.opponentName} · ${evt.ownScore}-${evt.oppScore}`;
        return `<div class="form-pill ${cls}" title="${title}">${label}</div>`;
      }).join('')}
    </div>
  `;
}

function renderForm(teamKey, meta, bundle){
  const el = document.getElementById('live-form');
  if(!el) return;
  const id = meta.sportsdbId;

  const rStatus = bundle.rundownEvent && bundle.rundownEvent.score && bundle.rundownEvent.score.event_status;
  if(rStatus === 'STATUS_FINAL'){
    const line = rundownEventLine(bundle.rundownEvent, bundle.rundownTeamId);
    let result = 'd', label = 'D';
    if(line.own > line.opp){ result = 'w'; label = 'W'; }
    else if(line.own < line.opp){ result = 'l'; label = 'L'; }
    el.innerHTML = `
      <div class="form-item">
        <div class="form-pill ${result}">${label}</div>
        <div class="form-detail">
          <span class="opp">${line.opponentName}</span>
          <span class="meta">${line.isHome ? 'Home' : 'Away'}</span>
        </div>
        <div class="form-score">${line.own}–${line.opp}</div>
      </div>
    `;
    return;
  }

  // EPL: real schedule data from ESPN (js/espn.js) instead of
  // TheSportsDB's eventslast — see fetchEspnTeamSchedule. Adds a
  // "Form" strip (last 5 results) above the usual detailed line, and a
  // real venue name on that line — neither available from TheSportsDB.
  if(bundle.espnSchedule){
    const recent = bundle.espnSchedule.recent;
    const evt = recent && recent[0];
    if(!evt){
      el.innerHTML = `<div class="loading-note">No recent result found.</div>`;
      return;
    }
    let result = 'd', label = 'D';
    if(evt.ownScore > evt.oppScore){ result = 'w'; label = 'W'; }
    else if(evt.ownScore < evt.oppScore){ result = 'l'; label = 'L'; }
    // Same Game Details sheet as the LIVE entry chip in renderNext, just
    // for this team's last completed game instead of one in progress —
    // gated the same way (a league wired up in GAME_DETAIL_LEAGUES and a
    // real ESPN event id). Styled as a plain text link rather than a
    // pill/chip — lighter still than the LIVE chip, since this sits
    // amid an already-busy result row (form pill, opponent, score)
    // rather than being the row's only secondary element.
    const gameDetail = GAME_DETAIL_LEAGUES[meta.leagueKey];
    const boxscoreLinkHtml = (gameDetail && evt.id) ? `
      <div class="boxscore-link" onclick="openGameDetail('${teamKey}', '${evt.id}')">View boxscore <span class="chev">›</span></div>
    ` : '';
    el.innerHTML = `
      ${formStripHtml(recent)}
      <div class="form-item">
        <div class="form-pill ${result}">${label}</div>
        <div class="form-detail">
          <span class="opp">${evt.opponentName}</span>
          <span class="meta">${evt.isHome ? 'Home' : 'Away'}${evt.venueName ? ' · ' + evt.venueName : ''}</span>
        </div>
        <div class="form-right">
          <div class="form-score">${evt.ownScore}–${evt.oppScore}</div>
          ${boxscoreLinkHtml}
        </div>
      </div>
    `;
    return;
  }

  const evt = bundle.last && bundle.last.results && bundle.last.results[0];
  if(!evt){
    el.innerHTML = bundle.rundownOnly
      ? `<div class="loading-note">No recent result — check back once the season's underway.</div>`
      : `<div class="loading-note">No recent result found.</div>`;
    return;
  }

  const isHome = String(evt.idHomeTeam) === String(id);
  const opponent = isHome ? evt.strAwayTeam : evt.strHomeTeam;
  const own = isHome ? evt.intHomeScore : evt.intAwayScore;
  const opp = isHome ? evt.intAwayScore : evt.intHomeScore;

  let result = 'd', label = 'D';
  if(own !== null && opp !== null && own !== undefined && opp !== undefined){
    if(parseInt(own, 10) > parseInt(opp, 10)){ result = 'w'; label = 'W'; }
    else if(parseInt(own, 10) < parseInt(opp, 10)){ result = 'l'; label = 'L'; }
  }

  el.innerHTML = `
    <div class="form-item">
      <div class="form-pill ${result}">${label}</div>
      <div class="form-detail">
        <span class="opp">${opponent || 'TBD'}</span>
        <span class="meta">${isHome ? 'Home' : 'Away'}${evt.dateEvent ? ' · ' + evt.dateEvent : ''}</span>
      </div>
      <div class="form-score">${own ?? '–'}–${opp ?? '–'}</div>
    </div>
  `;
}

// Shared by renderNext, renderForm and renderRowStatus: pulls this
// team's own score, the opponent's score/name, and a human
// clock/period label out of a TheRundown event, from that team's
// perspective — live or not; callers branch on event_status first.
function rundownEventLine(event, rundownTeamId){
  const s = event.score;
  const isHome = s.team_id_home === rundownTeamId;
  const own = isHome ? s.score_home : s.score_away;
  const opp = isHome ? s.score_away : s.score_home;
  const opponent = (event.teams || []).find(t => t.team_id !== rundownTeamId);
  const period = s.display_clock || s.event_status_detail || 'Live';
  return { isHome, own, opp, opponentName: (opponent && opponent.name) || 'TBD', period };
}

function renderNext(teamKey, meta, bundle){
  const el = document.getElementById('live-next');
  if(!el) return;
  const id = meta.sportsdbId;

  // EPL/NFL/CFB/NBA/NHL/MLB/WNBA: live in-game state from ESPN's
  // scoreboard (js/espn.js) instead of TheRundown — see
  // fetchEspnScoreboardCached/findEspnScoreboardLine above. Checked
  // first since a game actually in progress takes priority over the
  // upcoming-fixture line the espnSchedule branch below would show.
  if(bundle.espnLive && bundle.espnLive.isLive){
    const line = bundle.espnLive;
    // Gated to leagues wired up for the "Game Details" boxscore sheet
    // (see GAME_DETAIL_LEAGUES above) and a real eventId, not just the
    // league, since a team whose event lookup somehow came back without
    // one has nothing to fetch.
    const gameDetail = GAME_DETAIL_LEAGUES[meta.leagueKey];
    // Sits directly on #live-next's own row (it's already a
    // space-between flex row — see .next-match in css/style.css) rather
    // than stacked below in its own bordered card. Same plain
    // .boxscore-link treatment (and "View boxscore" wording) as the
    // "Most Recent Result" row below, rather than its own heavier pill —
    // one CTA style for "open Game Details" everywhere it appears.
    const detailHtml = (gameDetail && line.eventId) ? `
      <div class="boxscore-link" onclick="openGameDetail('${teamKey}', '${line.eventId}')">View boxscore <span class="chev">›</span></div>
    ` : '';
    el.innerHTML = `
      <div class="nm-left">
        <div class="nm-teams">${line.isHome ? 'vs' : 'at'} ${line.opponentName}</div>
        <div class="nm-when"><span class="gd-live-tag"><span class="dot pulse"></span>Live</span> ${line.own}-${line.opp} · ${line.period}</div>
      </div>
      ${detailHtml}
    `;
    return;
  }

  const rEvt = bundle.rundownEvent;
  const rStatus = rEvt && rEvt.score && rEvt.score.event_status;

  if(isRundownEventLive(rEvt)){
    const line = rundownEventLine(rEvt, bundle.rundownTeamId);
    el.innerHTML = `
      <div class="nm-left">
        <div class="nm-teams">${line.isHome ? 'vs' : 'at'} ${line.opponentName}</div>
        <div class="nm-when"><span class="gd-live-tag"><span class="dot pulse"></span>Live</span> ${line.own}-${line.opp} · ${line.period}</div>
      </div>
    `;
    return;
  }

  // Rundown-only teams have no TheSportsDB eventsnext to fall back to,
  // so a scheduled-for-today game (found via fetchRundownEventForTeam,
  // which only checks today — see fetchTeamBundle) is shown here too.
  if(rStatus === 'STATUS_SCHEDULED'){
    const line = rundownEventLine(rEvt, bundle.rundownTeamId);
    el.innerHTML = `
      <div class="nm-left">
        <div class="nm-teams">${line.isHome ? 'vs' : 'at'} ${line.opponentName}</div>
        <div class="nm-when">${formatKickoff(rEvt.event_date)}${line.isHome ? ' · Home' : ' · Away'}</div>
      </div>
    `;
    return;
  }

  // EPL: real schedule data from ESPN (js/espn.js) instead of
  // TheSportsDB's eventsnext — see fetchEspnTeamSchedule. Adds the
  // real venue and TV broadcast, neither available from TheSportsDB.
  if(bundle.espnSchedule){
    const evt = bundle.espnSchedule.upcoming && bundle.espnSchedule.upcoming[0];
    if(!evt){
      el.innerHTML = `<div class="loading-note">No upcoming match scheduled yet.</div>`;
      return;
    }
    const metaLine = [evt.isHome ? 'Home' : 'Away', evt.venueName, evt.broadcast].filter(Boolean).join(' · ');
    el.innerHTML = `
      <div class="nm-left">
        <div class="nm-teams">${evt.isHome ? 'vs' : 'at'} ${evt.opponentName}</div>
        <div class="nm-when">${formatKickoff(evt.date)}</div>
        <div class="nm-venue">${metaLine}</div>
      </div>
    `;
    return;
  }

  const evt = bundle.next && bundle.next.events && bundle.next.events[0];
  if(!evt){
    el.innerHTML = bundle.rundownOnly
      ? `<div class="loading-note">No game scheduled today — check back once the season's underway.</div>`
      : `<div class="loading-note">No upcoming match scheduled yet.</div>`;
    return;
  }

  const isHome = String(evt.idHomeTeam) === String(id);
  const opponent = isHome ? evt.strAwayTeam : evt.strHomeTeam;

  el.innerHTML = `
    <div class="nm-left">
      <div class="nm-teams">${isHome ? 'vs' : 'at'} ${opponent || 'TBD'}</div>
      <div class="nm-when">${formatKickoff(evt.strTimestamp)}${isHome ? ' · Home' : ' · Away'}</div>
    </div>
  `;
}

// Compact date label for the "next match" status slot — split into a
// small label ("Today"/"Sat") and the time value, painted as the two
// stacked lines of .status-slot (see paintStatusSlot below) rather
// than one combined string.
function formatChipUpcomingParts(d){
  const value = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const label = d.toDateString() === new Date().toDateString()
    ? 'Today'
    : d.toLocaleDateString('en-US', { weekday: 'short' });
  return { label, value };
}

// Paints the board row's right-hand status column: a small uppercase
// label over a bolder value (see .status-slot/.meta-label/.meta-value
// in css/style.css) instead of the single-line colored pill this used
// to be. `live` adds the pulsing dot; `linkable` (a live game or a
// just-finished result, either with a real Game Details sheet behind
// it) adds the chevron + click-through — see the .linkable/.live CSS
// for how the two combine differently on hover.
function paintStatusSlot(el, { label, value, valueClass, live, linkable, onClick }){
  el.className = 'status-slot' + (linkable ? ' linkable' : '') + (live ? ' live' : '');
  const dotHtml = live ? '<span class="dot pulse"></span>' : '';
  const chevHtml = linkable ? '<span class="chev">&rsaquo;</span>' : '';
  const valClass = 'meta-value' + (valueClass ? ' ' + valueClass : '');
  el.innerHTML = `<span class="meta-label${live ? ' live' : ''}">${dotHtml}${label}</span><span class="${valClass}">${value}${chevHtml}</span>`;
  el.onclick = linkable ? onClick : null;
}

function clearStatusSlot(el){
  el.className = 'status-slot';
  el.innerHTML = '';
  el.onclick = null;
}

// Board-row status: reuses whatever the modal fetch already pulled
// (last result / next fixture) rather than fetching anything extra,
// so it stays inside the same 30 req/min budget described in js/api.js.
export function renderRowStatus(teamKey, bundle){
  const el = document.getElementById('row-status-' + teamKey);
  if(!el) return;
  const meta = TEAM_META[teamKey];
  const id = meta.sportsdbId;

  // CFB/EPL/NFL show the next match regardless of when it falls, rather
  // than only for today's game — see UPCOMING_CHIP_LEAGUES in js/api.js.
  // Every other league keeps "today's game, else last result". Only
  // read by the schedule-based branches further down now — the
  // espnLive-completed branch right below shows today's final for every
  // league, this one included, before falling back to "next match" once
  // the shared scoreboard fetch itself moves on to a new game.
  const showsUpcoming = UPCOMING_CHIP_LEAGUES.includes(meta.leagueKey);

  // EPL/NFL/CFB/NBA/NHL/MLB/WNBA: live in-game state from ESPN's
  // scoreboard instead of TheRundown — see findEspnScoreboardLine in
  // js/espn.js. Same priority-over-everything-else idea as renderNext.
  if(bundle.espnLive && bundle.espnLive.isLive){
    // Tapping the value jumps straight to the Game Details boxscore
    // sheet instead of the team modal underneath it — but only where
    // that sheet actually exists (GAME_DETAIL_LEAGUES) and this live
    // game has a real ESPN eventId to fetch it with. Everywhere else
    // the slot has no handler of its own, so the click bubbles up to
    // the row's openTeamModal exactly like before.
    const gameDetail = GAME_DETAIL_LEAGUES[meta.leagueKey];
    const eventId = bundle.espnLive.eventId;
    paintStatusSlot(el, {
      label: 'Live',
      value: `${bundle.espnLive.own}-${bundle.espnLive.opp}`,
      live: true,
      linkable: !!(gameDetail && eventId),
      onClick: (e) => { e.stopPropagation(); openGameDetail(teamKey, eventId); }
    });
    return;
  }

  // A game that just ended, seen here before the next full per-team
  // refresh gets around to re-fetching bundle.espnSchedule (which is
  // what the fallback further down reads) — see liveScoreboardSweepTick
  // below, which patches bundle.espnLive in place every ~20s off the
  // same shared scoreboard fetch that drives the LIVE branch above, so
  // a final score shows immediately rather than sitting on "LIVE" (or
  // blank) until this team's turn comes up in the slower rotation.
  // Applies to the always-show-next-match leagues too now — today's
  // final score takes priority over jumping straight to next week's
  // fixture, same as it already does for every other league; it only
  // fades back to "next match" once the shared scoreboard fetch itself
  // rolls over to a new game for this team. Clicking the result opens
  // Game Details, same gating/handler as the LIVE branch above.
  if(bundle.espnLive && bundle.espnLive.completed){
    const { own, opp, eventId } = bundle.espnLive;
    if(own !== null && opp !== null){
      let cls = 'd', label = 'D';
      if(own > opp){ cls = 'w'; label = 'W'; } else if(own < opp){ cls = 'l'; label = 'L'; }
      const gameDetail = GAME_DETAIL_LEAGUES[meta.leagueKey];
      paintStatusSlot(el, {
        label: 'Final',
        value: `${label} ${own}-${opp}`,
        valueClass: cls,
        linkable: !!(gameDetail && eventId),
        onClick: (e) => { e.stopPropagation(); openGameDetail(teamKey, eventId); }
      });
      return;
    }
  }

  const rEvt = bundle.rundownEvent;
  const rStatus = rEvt && rEvt.score && rEvt.score.event_status;

  if(isRundownEventLive(rEvt)){
    const line = rundownEventLine(rEvt, bundle.rundownTeamId);
    paintStatusSlot(el, { label: 'Live', value: `${line.own}-${line.opp}`, live: true });
    return;
  }

  // Rundown-only teams (no TheSportsDB fallback) get their today's-game
  // result/fixture straight from the same event checked for live state.
  if(bundle.rundownOnly && rStatus === 'STATUS_FINAL'){
    const line = rundownEventLine(rEvt, bundle.rundownTeamId);
    let cls = 'd', label = 'D';
    if(line.own > line.opp){ cls = 'w'; label = 'W'; } else if(line.own < line.opp){ cls = 'l'; label = 'L'; }
    paintStatusSlot(el, { label: 'Final', value: `${label} ${line.own}-${line.opp}`, valueClass: cls });
    return;
  }
  if(bundle.rundownOnly && rStatus === 'STATUS_SCHEDULED' && rEvt.event_date){
    const d = new Date(rEvt.event_date);
    if(!isNaN(d.getTime())){
      paintStatusSlot(el, formatChipUpcomingParts(d));
      return;
    }
  }

  // showsUpcoming (CFB/EPL/NFL always show next match rather than last
  // result) is computed near the top of this function now — see there.

  // EPL/NBA/NHL/MLB/WNBA: real schedule data from ESPN (js/espn.js)
  // instead of TheSportsDB's eventsnext — see fetchEspnTeamSchedule.
  // Still respects showsUpcoming above: EPL always shows its next
  // match, but NBA/NHL/MLB/WNBA keep the nightly-slate "today's game,
  // else last result" behavior they had on TheSportsDB, just sourced
  // from ESPN now.
  if(bundle.espnSchedule){
    const nextEvt = bundle.espnSchedule.upcoming && bundle.espnSchedule.upcoming[0];
    if(nextEvt){
      const d = new Date(nextEvt.date);
      if(!isNaN(d.getTime()) && (showsUpcoming || d.toDateString() === new Date().toDateString())){
        paintStatusSlot(el, formatChipUpcomingParts(d));
        return;
      }
    }
    if(!showsUpcoming){
      const lastEvt = bundle.espnSchedule.recent && bundle.espnSchedule.recent[0];
      if(lastEvt && lastEvt.ownScore !== null && lastEvt.oppScore !== null){
        let cls = 'd', label = 'D';
        if(lastEvt.ownScore > lastEvt.oppScore){ cls = 'w'; label = 'W'; }
        else if(lastEvt.ownScore < lastEvt.oppScore){ cls = 'l'; label = 'L'; }
        paintStatusSlot(el, { label: 'Final', value: `${label} ${lastEvt.ownScore}-${lastEvt.oppScore}`, valueClass: cls });
        return;
      }
    }
    clearStatusSlot(el);
    return;
  }

  const nextEvt = bundle.next && bundle.next.events && bundle.next.events[0];
  if(nextEvt && nextEvt.strTimestamp){
    const d = new Date(nextEvt.strTimestamp.includes('Z') ? nextEvt.strTimestamp : nextEvt.strTimestamp + 'Z');
    if(!isNaN(d.getTime()) && (showsUpcoming || d.toDateString() === new Date().toDateString())){
      paintStatusSlot(el, formatChipUpcomingParts(d));
      return;
    }
  }

  if(!showsUpcoming){
    const lastEvt = bundle.last && bundle.last.results && bundle.last.results[0];
    if(lastEvt){
      const isHome = String(lastEvt.idHomeTeam) === String(id);
      const own = isHome ? lastEvt.intHomeScore : lastEvt.intAwayScore;
      const opp = isHome ? lastEvt.intAwayScore : lastEvt.intHomeScore;
      if(own !== null && opp !== null && own !== undefined && opp !== undefined){
        const ownN = parseInt(own, 10), oppN = parseInt(opp, 10);
        let cls = 'd', label = 'D';
        if(ownN > oppN){ cls = 'w'; label = 'W'; } else if(ownN < oppN){ cls = 'l'; label = 'L'; }
        paintStatusSlot(el, { label: 'Final', value: `${label} ${ownN}-${oppN}`, valueClass: cls });
        return;
      }
    }
  }

  clearStatusSlot(el);
}

export function renderLiveBundle(teamKey, bundle){
  const meta = TEAM_META[teamKey];
  if(!meta || !bundle) return;
  renderStats(meta, bundle);
  renderSeasonBadge(meta, bundle);
  renderForm(teamKey, meta, bundle);
  renderNext(teamKey, meta, bundle);
}

async function openLiveTeam(teamKey){
  const bundle = await fetchTeamBundle(teamKey);
  if(bundle) renderRowStatus(teamKey, bundle);
  // If the modal moved on to a different team while this was loading, bail.
  if(document.getElementById('modal-content').dataset.activeTeam !== teamKey) return;

  if(bundle){
    renderLiveBundle(teamKey, bundle);
  } else {
    const el = document.getElementById('live-form');
    if(el) el.innerHTML = `<div class="loading-note">Unable to load live data right now — try again in a moment.</div>`;
  }
}

export function openTeamModal(teamKey){
  const meta = TEAM_META[teamKey];
  if(!meta) return;

  document.getElementById('modal-overlay').classList.add('open');
  lockBodyScroll();

  const modalContent = document.getElementById('modal-content');
  modalContent.dataset.activeTeam = teamKey;
  modalContent.dataset.activeLeagueResults = '';

  // A team also has live data if its league is in FLAT_SCHEDULE_LEAGUES
  // (see fetchTeamBundle) — that path matches by name/nickname, not
  // sportsdbId, so it covers NBA/NHL/MLB/WNBA teams that were never
  // given a sportsdbId too (every currently-drafted team but Josh's
  // own), not just the ones with real TheSportsDB/TheRundown ids.
  const hasLive = !!meta.sportsdbId || !!meta.rundownTeamId || !!FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  const cached = hasLive ? liveDataCache[teamKey] : null;
  const tracker = trackerSectionHtml(teamKey);
  // MLB/WNBA: the stat strip and results below are ESPN's real, live
  // '26 data — still worth showing — but this team's drafted record
  // doesn't start scoring until the '27 season actually begins. See
  // PRIOR_SEASON_DISPLAY_LEAGUES in js/data.js.
  const priorSeasonNoteHtml = PRIOR_SEASON_DISPLAY_LEAGUES.includes(meta.leagueKey)
    ? `<div class="prior-season-note">Showing the '26 season, still in progress — points won't count until the '27 season.</div>`
    : '';

  modalContent.innerHTML = `
    <div class="modal-accent" style="background:${meta.accent};"></div>
    <div class="modal-head">
      ${teamBadgeHtml(meta)}
      <div>
        <h2>${meta.fullName || meta.name}</h2>
        <div class="modal-sub">${meta.sub}${hasLive ? ' <span id="season-badge" style="display:none;"></span>' : ''}${meta.leagueKey === 'epl' ? '<span id="zone-tag" style="display:none;"></span>' : ''}</div>
      </div>
      <button class="modal-close" onclick="closeTeamModal()">&times;</button>
    </div>
    ${hasLive ? `
      <div class="stat-strip" id="live-stats">${cached ? '' : '<div class="stat-cell" style="flex:1;"><div class="lbl">Loading…</div></div>'}</div>
      <div class="modal-body">
        ${priorSeasonNoteHtml}
        <div class="modal-section-title">${meta.recentLabel || 'Most Recent Result'}</div>
        <div class="form-list" id="live-form">${cached ? '' : '<div class="loading-note">Loading…</div>'}</div>
        <div class="modal-section-title">${meta.leagueKey === 'epl' ? 'Next Match' : 'Next Game'}</div>
        <div class="next-match" id="live-next">${cached ? '' : '<div class="loading-note">Loading…</div>'}</div>
        <div id="tracker-section">${tracker}</div>
      </div>
    ` : `
      <div class="modal-body">
        <div class="no-live-note">Live results for ${meta.fullName || meta.name} aren't hooked up yet — showing placeholder space here for now.</div>
        <div id="tracker-section">${tracker}</div>
      </div>
    `}
  `;

  if(hasLive){
    if(cached) renderLiveBundle(teamKey, cached);
    else openLiveTeam(teamKey);
  }
}
window.openTeamModal = openTeamModal;

export function closeTeamModal(){
  closeGameDetail();
  document.getElementById('modal-overlay').classList.remove('open');
  const modalContent = document.getElementById('modal-content');
  modalContent.dataset.activeTeam = '';
  modalContent.dataset.activeLeagueResults = '';
  unlockBodyScroll();
}
window.closeTeamModal = closeTeamModal;

/* ---- Game Details: a wider sheet stacked on top of the team modal ----
   Option B from the drill-down exploration — see docs/espn-migration-plan.md.
   Fetched only when a drafter actually taps in for the box score (never
   prefetched alongside the team modal's own live line), for leagues
   listed in GAME_DETAIL_LEAGUES above (MLB, then CFB added 2026-09-12)
   — the entry point above is gated on the same map. Body scroll is
   already locked by openTeamModal underneath; this overlay opens/closes
   without touching that lock. */

// One out/count/runners line, e.g. "2 outs · 1-2 count · runner on 2nd" —
// built from the raw situation object off bundle.espnLive.situation
// (see findEspnScoreboardLine in js/espn.js), so it degrades to fewer
// clauses instead of breaking if a piece of it is ever missing.
function mlbSituationText(sit){
  if(!sit) return null;
  const parts = [];
  if(sit.outs !== null && sit.outs !== undefined) parts.push(`${sit.outs} out${sit.outs === 1 ? '' : 's'}`);
  if(sit.balls !== null && sit.balls !== undefined && sit.strikes !== null && sit.strikes !== undefined) parts.push(`${sit.balls}-${sit.strikes} count`);
  const bases = [];
  if(sit.onFirst) bases.push('1st');
  if(sit.onSecond) bases.push('2nd');
  if(sit.onThird) bases.push('3rd');
  parts.push(bases.length ? `runner${bases.length > 1 ? 's' : ''} on ${bases.join(' & ')}` : 'bases empty');
  return parts.join(' · ');
}

// Football's equivalent of mlbSituationText above — ESPN pre-formats
// the down/distance/yard-line line as `downDistanceText` (e.g. "2nd &
// 7 at DAL 34"), confirmed live 2026-09-12, so there's no need to
// compose it field-by-field the way baseball's count/outs/runners
// line has to be.
function footballSituationText(sit){
  if(!sit || !sit.downDistanceText) return null;
  return sit.downDistanceText + (sit.isRedZone ? ' · Red zone' : '');
}

// One stat table off a boxscore group (batting/pitching for MLB;
// passing/rushing/receiving/etc. for CFB) — headers come from ESPN's
// own `labels` array (see fetchEspnSummary/fetchEspnFootballSummary in
// js/espn.js) rather than a hardcoded column list, so this renders
// correctly for either sport without a sport-specific branch here —
// confirmed live 2026-09-12 that both sports' real payloads share this
// exact shape.
function boxGroupHtml(group){
  if(!group.rows.length) return '';
  const headerCells = group.labels.map(l => `<th>${l}</th>`).join('');
  const rows = group.rows.map(r => `
    <tr><td class="name">${r.name}</td>${r.stats.map(s => `<td>${s}</td>`).join('')}</tr>
  `).join('');
  return `
    <div class="modal-section-title" style="margin-top:14px;">${group.name}</div>
    <div class="box-scroll">
      <table class="box-table">
        <tr><th style="text-align:left;"></th>${headerCells}</tr>
        ${rows}
      </table>
    </div>
  `;
}

// Which team's boxscore tables Game Details is currently showing below
// the linescore, plus enough of the last render's own inputs to redraw
// it when that changes — set at the end of renderGameDetail below, read
// by setGameDetailTeam so switching teams doesn't need to re-fetch.
let gameDetailRenderState = null; // { accent, leagueKey, summary, situation, selectedTeamId, mlb: {topPlays, selectedTopPlayIndex, decisions, gameInfo} } | null

// leagueKey selects the linescore column count/labels (9 numbered
// innings for MLB, 4 quarters + OT for CFB — see GAME_DETAIL_LEAGUES)
// and which trailing summary columns make sense: baseball has R/H/E,
// football only has a final score (no hits/errors concept on this
// endpoint), so that column group is skipped entirely for CFB rather
// than showing empty H/E cells.
//
// selectedTeamId picks which team's boxscore tables show below the
// shared linescore/situation — the two-team chip toggle underneath it
// (same .standings-toggle/.toggle-btn pattern as the Standings tab's
// Divisions/Conference switch) lets a drafter flip between them instead
// of always scrolling past both team's full tables stacked together.
function renderGameDetail(accent, leagueKey, summary, situation, selectedTeamId, mlb){
  const el = document.getElementById('game-detail-content');
  if(!el) return;

  const gameDetail = GAME_DETAIL_LEAGUES[leagueKey];

  if(!summary || summary.teams.length < 2 || !gameDetail){
    gameDetailRenderState = null;
    el.innerHTML = `
      <div class="gd-head with-back">
        <button class="gd-back" onclick="closeGameDetail()">&lsaquo;</button>
        <div class="gd-title">Boxscore</div>
      </div>
      <div class="modal-body"><div class="loading-note">Boxscore isn't available for this game right now — try again in a moment.</div></div>
    `;
    return;
  }

  const isBaseball = leagueKey === 'mlb';
  const isSoccer = leagueKey === 'epl';
  const away = summary.teams.find(t => t.homeAway === 'away') || summary.teams[0];
  const home = summary.teams.find(t => t.homeAway === 'home') || summary.teams[1];

  const situationText = gameDetail.situationText(situation);
  const situationHtml = situationText ? `<div class="gd-situation">${situationText}</div>` : '';

  // A recap photo + headline/summary + a link — MLB games source this
  // from MLB's own Stats API (deriveMlbRecap in js/mlb-stats.js: MLB's
  // own staff-written recap article) rather than ESPN's
  // parseEspnGameMedia (js/espn.js), so the whole MLB sheet is sourced
  // from one place instead of mixing ESPN and MLB — every other league
  // still reads ESPN's version, the only source they have. Both shapes
  // are identical ({ photoUrl, recapHeadline, recapSummary, linkUrl,
  // linkLabel }), so the template below needs no per-source branching,
  // only which object it reads and that object's own label. Falls back
  // to ESPN's version if MLB hasn't published a recap yet (a still-live
  // game) rather than showing a blank card.
  // The link itself points at different things per source on purpose:
  // ESPN's is "Watch highlights" (a video — the only thing ESPN's media
  // offers, since its clips don't map to a specific play and so can't
  // be embedded the way Top Plays are). MLB's is "Read full recap" (the
  // article, not another video) — MLB games already get real embedded
  // clips via Top Plays below this card, so a second video link would
  // just be a redundant path to something already playable in the
  // sheet; the article is what isn't already covered.
  // The headline/summary is what turns the photo from a bare image
  // into an actual recap card; it only exists once a recap's been
  // published, so a still-live game shows just the link (if the
  // underlying data exists yet) with no card. Deliberately just a hero
  // image and a plain link-out, never an embedded player here — that's
  // what Top Plays is for.
  const media = (leagueKey === 'mlb' && mlb && mlb.recap) ? mlb.recap : (summary.media || {});
  const mediaHtml = (media.photoUrl || media.recapHeadline || media.linkUrl) ? `
    <div class="gd-media">
      ${media.photoUrl ? `<img class="gd-photo" src="${media.photoUrl}" alt="" loading="lazy">` : ''}
      ${media.recapHeadline ? `
        <div class="gd-recap-headline">${media.recapHeadline}</div>
        ${media.recapSummary ? `<div class="gd-recap-summary">${media.recapSummary}</div>` : ''}
      ` : ''}
      ${media.linkUrl ? `<a class="boxscore-link gd-highlights-link" href="${media.linkUrl}" target="_blank" rel="noopener noreferrer">${media.linkLabel || 'Read more'} <span class="chev">›</span></a>` : ''}
    </div>
  ` : '';

  // MLB-only — see js/mlb-stats.js for how these are resolved (a real
  // playId->guid join against MLB's own Stats API for each of up to 3
  // scoring plays, ranked by MLB's own captivatingIndex, not a text/
  // headline guess) and openGameDetail below for where they're
  // fetched. Unlike ESPN's media block above (a link-out — ESPN's own
  // clips don't map to a specific play), these are exact, curated
  // clips, so they're embedded directly: one video area (tap-to-play,
  // never autoplay) with a thumbnail rail underneath when there's more
  // than one, so switching plays never stacks a second player — same
  // "one media element, not several" footprint as before, just now
  // selectable rather than fixed to a single clip.
  const topPlays = (leagueKey === 'mlb' && mlb && Array.isArray(mlb.topPlays)) ? mlb.topPlays.filter(p => p && p.videoUrl) : [];
  const activeIdx = topPlays.length ? Math.min(Math.max((mlb && mlb.selectedTopPlayIndex) || 0, 0), topPlays.length - 1) : 0;
  const activePlay = topPlays[activeIdx];
  const topPlayHtml = activePlay ? (() => {
    const inningLabel = (activePlay.halfInning && activePlay.inning)
      ? `${activePlay.halfInning === 'top' ? 'Top' : 'Bottom'} ${ordinal(activePlay.inning)}`
      : null;
    const railHtml = topPlays.length > 1 ? `
      <div class="gd-topplay-rail">
        ${topPlays.map((p, i) => `
          <button class="gd-topplay-thumb ${i === activeIdx ? 'active' : ''}" onclick="setMlbTopPlayIndex(${i})" ${p.thumbnailUrl ? `style="background-image:url('${p.thumbnailUrl}')"` : ''}></button>
        `).join('')}
      </div>
    ` : '';
    return `
      <div class="gd-topplay">
        <div class="modal-section-title">Top Plays</div>
        <video class="gd-topplay-video" controls preload="none" playsinline ${activePlay.thumbnailUrl ? `poster="${activePlay.thumbnailUrl}"` : ''}>
          <source src="${activePlay.videoUrl}" type="video/mp4">
        </video>
        ${activePlay.headline ? `<div class="gd-topplay-caption">${inningLabel ? `${inningLabel} — ` : ''}${activePlay.headline}</div>` : ''}
        ${railHtml}
      </div>
    `;
  })() : '';

  // Reachable from a completed game now too (the "Most Recent Result"
  // link, not just the LIVE entry chip), so the LIVE tag only shows
  // when the game actually still is — otherwise just the plain status
  // detail (e.g. "Final"). Same pulsing-dot treatment as the Teams tab's
  // row status (see .status-slot/.dot in css/style.css) rather than the
  // old solid green pill, so "live" reads the same everywhere.
  const isLiveNow = summary.status && summary.status.state === 'in';
  const statusHtml = `${isLiveNow ? '<span class="gd-live-tag"><span class="dot pulse"></span>Live</span> ' : ''}${(summary.status && summary.status.detail) || ''}`;

  // The score itself is now the header's title (see el.innerHTML below)
  // — previously the header showed only team names, with the score
  // only visible after scrolling down to the linescore table, buried
  // below the recap card/Top Plays/situation that have all landed
  // above it since. Every league's summary.teams already carries
  // `score` (not just MLB's), so this is header-level, not MLB-
  // specific. A team with a higher score than its opponent is 'win'; a
  // tie (soccer draws are common; a rare old NFL tie is possible too)
  // is neither, styled neutrally rather than forced into a false
  // win/loss. hasScore guards a fallback to the plain team-names title
  // (gameDetail.titleName below) for the (practically unreachable —
  // every real caller opens this sheet for a live or completed game,
  // which always has a score) case it's ever missing.
  const awayScore = away.score, homeScore = home.score;
  const hasScore = awayScore !== null && awayScore !== undefined && homeScore !== null && homeScore !== undefined;
  const awayWon = hasScore && awayScore > homeScore;
  const homeWon = hasScore && homeScore > awayScore;

  // MLB-only — the classic boxscore "W/L/SV" line, sourced from
  // js/mlb-stats.js's fetchMlbGameExtras (liveData.decisions cross-
  // referenced against each pitcher's own season line, both already
  // on the same live-feed response Top Plays needs — no extra
  // request). save is commonly absent (most games don't have one), so
  // that piece is just skipped rather than shown empty.
  const decisions = (leagueKey === 'mlb' && mlb && mlb.decisions) ? mlb.decisions : null;
  const pitcherRecord = p => (p && p.wins !== undefined && p.losses !== undefined)
    ? ` <span class="gd-decision-record">(${p.wins}-${p.losses}${p.era ? `, ${p.era}` : ''})</span>` : '';
  const decisionsHtml = (decisions && (decisions.win || decisions.loss || decisions.save)) ? `
    <div class="gd-decisions">
      ${decisions.win ? `<span class="gd-decision"><b class="win">W</b> ${decisions.win.name}${pitcherRecord(decisions.win)}</span>` : ''}
      ${decisions.loss ? `<span class="gd-decision"><b class="loss">L</b> ${decisions.loss.name}${pitcherRecord(decisions.loss)}</span>` : ''}
      ${decisions.save ? `<span class="gd-decision"><b class="save">SV</b> ${decisions.save.name} <span class="gd-decision-record">(${decisions.save.saves ?? 0})</span></span>` : ''}
    </div>
  ` : '';

  // MLB-only — a minimal venue/attendance/duration line, the same trio
  // almost every real box score prints. All three are optional
  // individually (a mid-game open, before gameInfo is final, might be
  // missing duration) so this only joins whichever parts exist rather
  // than showing blank placeholders.
  const gameInfo = (leagueKey === 'mlb' && mlb && mlb.gameInfo) ? mlb.gameInfo : null;
  const gameInfoHtml = gameInfo ? (() => {
    const parts = [];
    if(gameInfo.venue) parts.push(gameInfo.venue);
    if(gameInfo.attendance) parts.push(`${gameInfo.attendance.toLocaleString()} attendance`);
    if(gameInfo.durationMinutes) parts.push(`${Math.floor(gameInfo.durationMinutes / 60)}:${String(gameInfo.durationMinutes % 60).padStart(2, '0')}`);
    return parts.length ? `<div class="gd-gameinfo">${parts.join(' · ')}</div>` : '';
  })() : '';

  // EPL has no innings/quarters linescore or per-athlete boxscore on
  // this endpoint (see fetchEspnSoccerSummary in js/espn.js) — the
  // sheet's body is a goals/cards split by team instead, built by
  // soccerEventsHtml below, rather than the linescore+toggle+box-table
  // layout every other GAME_DETAIL_LEAGUES entry shares.
  const bodyHtml = isSoccer ? soccerEventsHtml(summary.events || [], away, home) : (() => {
    const periods = Math.max(away.linescore.length, home.linescore.length, gameDetail.linescorePeriods);
    const periodHeaders = Array.from({ length: periods }, (_, i) => `<th>${gameDetail.periodLabel(i)}</th>`).join('');
    const lineRow = team => `
      <tr>
        <td class="team">${team.abbr || '—'}</td>
        ${Array.from({ length: periods }, (_, i) => `<td>${team.linescore[i] !== undefined ? team.linescore[i] : '–'}</td>`).join('')}
        <td class="tot">${team.score ?? '–'}</td>${isBaseball ? `<td class="tot">${team.hits ?? '–'}</td><td class="tot">${team.errors ?? '–'}</td>` : ''}
      </tr>
    `;

    // Default to whichever team this sheet was opened from (see
    // openGameDetail) rather than always away/home, so tapping "View full
    // boxscore" off a team's own modal lands on that team's own stats
    // first — falls back to the away team if that side's id ever doesn't
    // match either boxscore entry.
    const activeId = summary.boxscore.some(t => String(t.teamId) === String(selectedTeamId))
      ? String(selectedTeamId)
      : String(away.teamId);
    const activeBox = summary.boxscore.find(t => String(t.teamId) === activeId);

    const teamToggleHtml = `
      <div class="standings-toggle gd-team-toggle">
        <button class="toggle-btn ${String(away.teamId) === activeId ? 'active' : ''}" onclick="setGameDetailTeam('${away.teamId}')">${away.abbr}</button>
        <button class="toggle-btn ${String(home.teamId) === activeId ? 'active' : ''}" onclick="setGameDetailTeam('${home.teamId}')">${home.abbr}</button>
      </div>
    `;
    const boxHtml = activeBox ? activeBox.groups.map(boxGroupHtml).join('') : '';

    return `
      <div class="box-scroll">
        <table class="linescore-table">
          <tr><th></th>${periodHeaders}<th>${isBaseball ? 'R' : 'T'}</th>${isBaseball ? '<th>H</th><th>E</th>' : ''}</tr>
          ${lineRow(away)}
          ${lineRow(home)}
        </table>
      </div>
      ${decisionsHtml}
      ${teamToggleHtml}
      ${boxHtml}
    `;
  })();

  el.innerHTML = `
    <div class="modal-accent" style="background:${accent};"></div>
    <div class="gd-head with-back">
      <button class="gd-back" onclick="closeGameDetail()">&lsaquo;</button>
      <div>
        ${hasScore ? `
          <div class="gd-score-title">
            <span class="gd-score-team${awayWon ? ' win' : ''}">${away.abbr || away.name}<b>${awayScore}</b></span>
            <span class="gd-score-sep">–</span>
            <span class="gd-score-team${homeWon ? ' win' : ''}">${home.abbr || home.name}<b>${homeScore}</b></span>
          </div>
        ` : `<div class="gd-title">${gameDetail.titleName(away)} at ${gameDetail.titleName(home)}</div>`}
        <div class="gd-sub">${statusHtml}</div>
      </div>
    </div>
    <div class="modal-body">
      ${mediaHtml}
      ${topPlayHtml}
      ${situationHtml}
      ${bodyHtml}
      ${gameInfoHtml}
    </div>
  `;

  gameDetailRenderState = {
    accent, leagueKey, summary, situation, selectedTeamId,
    mlb: { topPlays, selectedTopPlayIndex: activeIdx, decisions, gameInfo }
  };
}

// EPL's Game Details body (see the isSoccer branch above) — goals and
// cards split into the two teams' own columns rather than a shared
// chronological feed, since there's no shared linescore to anchor a
// single-column timeline to (contrast Option B's in-modal timeline from
// the original UI exploration, which does read as one feed). Each
// team's own events stay in the minute order fetchEspnSoccerSummary
// already sorted them into.
function soccerEventsHtml(events, away, home){
  const teamColumn = (team, isHomeCol) => {
    const own = events.filter(e => String(e.teamId) === String(team.teamId));
    const rows = own.length ? own.map(e => `
      <div class="gd-event">
        <span class="gd-event-min">${e.minute || ''}</span>
        ${e.kind === 'goal'
          ? `<span class="gd-ball-icon">${BALL_ICON_SVG}</span>`
          : `<span class="gd-card-chip ${e.kind === 'red' ? 'r' : 'y'}"></span>`}
        <span class="gd-event-who">${e.player}</span>
      </div>
    `).join('') : `<div class="gd-event-empty">No goals or cards</div>`;
    return `
      <div class="gd-split-col">
        <div class="gd-split-head"><span class="gd-split-dot ${isHomeCol ? 'home' : 'away'}"></span>${team.abbr || '—'}</div>
        ${rows}
      </div>
    `;
  };

  return `
    <div class="gd-split">
      ${teamColumn(away, false)}
      ${teamColumn(home, true)}
    </div>
  `;
}

// Fired by the team-toggle chips built in renderGameDetail above —
// redraws from the last fetch's own result rather than re-fetching,
// same as flipping Standings' Divisions/Conference toggle doesn't
// re-hit the network either.
function setGameDetailTeam(teamId){
  if(!gameDetailRenderState) return;
  const { accent, leagueKey, summary, situation, mlb } = gameDetailRenderState;
  renderGameDetail(accent, leagueKey, summary, situation, teamId, mlb);
}
window.setGameDetailTeam = setGameDetailTeam;

// Fired by the thumbnail rail built in renderGameDetail above —
// switches which of the (up to 3) Top Play clips the single video
// area shows, redrawn from the last fetch's own result same as
// setGameDetailTeam above (no re-fetch either) — the boxscore team
// toggle's own selection (selectedTeamId, stashed in render state) is
// passed straight through unchanged so switching clips never resets
// which team's stats are showing below.
function setMlbTopPlayIndex(index){
  if(!gameDetailRenderState) return;
  const { accent, leagueKey, summary, situation, selectedTeamId, mlb } = gameDetailRenderState;
  renderGameDetail(accent, leagueKey, summary, situation, selectedTeamId, { ...mlb, selectedTopPlayIndex: index });
}
window.setMlbTopPlayIndex = setMlbTopPlayIndex;

// eventId is passed in explicitly by both callers (renderNext's LIVE
// entry chip and renderForm's "Most Recent Result" link) rather than
// read off bundle.espnLive here, so this works the same way for a
// currently-live game and a past completed one — bundle.espnLive only
// ever describes today's/the current game.
export async function openGameDetail(teamKey, eventId){
  const meta = TEAM_META[teamKey];
  const gameDetail = GAME_DETAIL_LEAGUES[meta && meta.leagueKey];
  const flatSchedule = FLAT_SCHEDULE_LEAGUES[meta && meta.leagueKey];
  if(!meta || !eventId || !gameDetail || !flatSchedule) return;

  const overlay = document.getElementById('game-detail-overlay');
  const el = document.getElementById('game-detail-content');
  if(!overlay || !el) return;

  overlay.classList.add('open');
  // Guards the fetch below the same way openLiveTeam guards the team
  // modal's own fetch — if the sheet gets closed, or reopened for a
  // different game, while this request is in flight, its result is
  // stale and shouldn't paint over whatever's showing now.
  el.dataset.activeEvent = String(eventId);
  el.innerHTML = `<div class="modal-body"><div class="loading-note">Loading boxscore…</div></div>`;

  const summary = await gameDetail.fetchSummary(flatSchedule.sportPath, eventId);
  if(el.dataset.activeEvent !== String(eventId)) return;

  // MLB-only: resolve the same game on MLB's own Stats API (by team
  // name + start time, then join scoring plays to clips by GUID — see
  // js/mlb-stats.js) and fetch its Top Play clips plus the W/L/SV
  // decisions and venue/attendance/duration line — all one call, all
  // riding the same live-feed request. Awaited here rather than
  // rendered progressively after the fact, so this sheet only ever
  // paints once — the extra requests only happen for MLB games, and
  // only when a drafter actually opens Game Details, same on-demand
  // cost profile as the boxscore fetch itself.
  const mlb = (meta.leagueKey === 'mlb' && summary && summary.teams.length === 2)
    ? await fetchMlbGameExtras(
        summary.date,
        (summary.teams.find(t => t.homeAway === 'away') || {}).name,
        (summary.teams.find(t => t.homeAway === 'home') || {}).name
      )
    : null;
  if(el.dataset.activeEvent !== String(eventId)) return;

  // situation (down/distance, balls/strikes/etc.) only ever comes from
  // the *current* scoreboard fetch (see fetchEspnScoreboard/
  // findEspnScoreboardLine in js/espn.js) — meaningful only when this
  // sheet's game is that same still-live one; a past completed game
  // (opened from "Most Recent Result") has none to show.
  const freshLine = liveDataCache[teamKey] && liveDataCache[teamKey].espnLive;
  const situation = (freshLine && String(freshLine.eventId) === String(eventId)) ? freshLine.situation : null;

  // Default the team-toggle to this team's own side, resolved the same
  // way the rest of this app identifies a team's ESPN row (findRow,
  // matched by name) rather than via bundle.espnLive's isHome — that
  // only describes today's/the current game, not necessarily this one.
  const row = flatSchedule.findRow(meta);
  renderGameDetail(meta.accent || 'var(--accent)', meta.leagueKey, summary, situation, row && row.id, mlb);
}
window.openGameDetail = openGameDetail;

export function closeGameDetail(){
  const overlay = document.getElementById('game-detail-overlay');
  if(overlay) overlay.classList.remove('open');
  gameDetailRenderState = null;
}
window.closeGameDetail = closeGameDetail;

enableSheetSwipeToDismiss(document.getElementById('modal-content'), closeTeamModal);
enableSheetSwipeToDismiss(document.getElementById('game-detail-content'), closeGameDetail);

document.addEventListener('keydown', (e) => {
  if(e.key !== 'Escape') return;
  const gdOverlay = document.getElementById('game-detail-overlay');
  if(gdOverlay && gdOverlay.classList.contains('open')){ closeGameDetail(); return; }
  closeTeamModal();
});

/* ---- Staggered background refresh ----
   Refreshing every live team at once would burst way too many
   requests into a single second. Instead we refresh one team at a
   time on a rotating schedule, spread evenly across a full cycle, so
   sending is smoothed out to a handful of requests per minute rather
   than a spike. Every tick also paints that team's board-row pill
   (last result / today's fixture) from the same fetch — no extra
   requests for that. If a team's modal happens to be open when its
   turn comes up, it updates live right in front of you.

   This full-bundle rotation is no longer what keeps live scores
   current — see liveScoreboardSweepTick below for that; this loop's
   job is now just the slower-moving parts of a team's bundle (full
   schedule/last-result/next-match, and the one-time initial fetch for
   a team that's never been fetched at all). MIN_REFRESH_CYCLE_MS is
   sized for that, not for a rate limit: per
   docs/espn-migration-plan.md ("SportsDB fully deprecated"),
   TheSportsDB makes zero calls in normal operation today, and ESPN's
   hidden API has no observed rate limit at all, so there's no metered
   budget left to derive this cycle length from the way there used to
   be. The one real per-team cost still on a shared daily quota is
   TheRundown, for College Basketball only (RUNDOWN_SPORT_ID's mcbb
   entry, via fetchRundownEventForTeam) — but that rides one
   day-cache per league+date (rundownDayCache in js/api.js), so its
   cost doesn't scale with how many CBB teams are in the rotation. */
const MIN_REFRESH_CYCLE_MS = 5 * 60 * 1000;

// Every team ESPN can resolve real data for (any team in a
// FLAT_SCHEDULE_LEAGUES league — matched by name, not by an id field,
// see fetchTeamBundle above) belongs in the rotation, plus the small
// legacy set that still resolves via sportsdbId/rundownTeamId (mostly
// just College Basketball's 3 mapped teams at this point). This used
// to be gated on sportsdbId/rundownTeamId alone, which was correct
// back when only teams with one of those ids had any live source at
// all — but it left ~117 of this app's 210 drafted teams (every
// NBA/NHL/MLB/WNBA team besides Josh's own, which resolve through
// ESPN's flat standings by name instead) permanently out of this
// rotation: never proactively refreshed, only ever fetched once if
// someone happened to open that team's modal. Fixed as part of the
// 2026-09-12 ESPN-cadence review.
const LIVE_TEAM_KEYS = Object.keys(TEAM_META).filter(k => {
  const meta = TEAM_META[k];
  return !!FLAT_SCHEDULE_LEAGUES[meta.leagueKey] || meta.sportsdbId || meta.rundownTeamId;
});
export const REFRESH_STEP_MS = LIVE_TEAM_KEYS.length ? MIN_REFRESH_CYCLE_MS / LIVE_TEAM_KEYS.length : MIN_REFRESH_CYCLE_MS;
let refreshCursor = 0;

export async function backgroundRefreshTick(){
  if(LIVE_TEAM_KEYS.length === 0) return;
  const teamKey = LIVE_TEAM_KEYS[refreshCursor % LIVE_TEAM_KEYS.length];
  refreshCursor++;

  const bundle = await fetchTeamBundle(teamKey);
  if(!bundle) return;
  renderRowStatus(teamKey, bundle);
  if(document.getElementById('modal-content').dataset.activeTeam === teamKey){
    renderLiveBundle(teamKey, bundle);
  }
}

/* ---- Fast live-scoreboard sweep ----
   backgroundRefreshTick above cycles through one team's full bundle
   (a real per-team schedule fetch) every REFRESH_STEP_MS, so with 183
   teams now in the rotation any single team's turn only comes up
   roughly once every 5 minutes — fine for "last result"/"next match",
   far too slow for "the score just changed." This sweep closes that
   gap cheaply instead of just shortening MIN_REFRESH_CYCLE_MS (which
   would mean re-fetching all 183 teams' full schedules 15x more
   often for no reason — that data doesn't move mid-game): it re-reads
   the same shared, already-cached-per-league scoreboard
   (fetchEspnScoreboardCached/ESPN_SCOREBOARD_TTL_MS above) every
   LIVE_SWEEP_INTERVAL_MS and patches just the live/final score line
   into whatever bundle each team already has cached, for every team
   at once. Real network cost stays at 7 requests/min (one per
   FLAT_SCHEDULE_LEAGUES sportPath, throttled further by the 60s cache
   above so most sweeps hit no network at all) regardless of how often
   this runs or how many teams are drafted — the per-league scoreboard
   already covers every team in it in one response.

   Only patches a team that already has a cached bundle (from a prior
   backgroundRefreshTick or an opened modal) — a team with no bundle
   yet yields no row-status element worth patching in place, and its
   own turn in the slower rotation above will populate it soon
   regardless (LIVE_TEAM_KEYS is 183 teams over a 5-minute cycle, so
   at most ~1.6s away at any given moment). */
export const LIVE_SWEEP_INTERVAL_MS = 20 * 1000;
const FLAT_SCHEDULE_SPORT_PATHS = [...new Set(Object.values(FLAT_SCHEDULE_LEAGUES).map(cfg => cfg.sportPath))];

function applyLiveScoreboardPatch(teamKey, espnLive){
  const cached = liveDataCache[teamKey];
  if(!cached) return;
  cached.espnLive = espnLive;
  // This sweep re-confirms freshness (off a scoreboard fetch that's at
  // most ESPN_SCOREBOARD_TTL_MS old) far more often than the full
  // per-team bundle refresh does, so fetchedAt should track it too —
  // otherwise it sits stuck on the last full refresh (up to
  // MIN_REFRESH_CYCLE_MS stale) while the score is visibly live.
  cached.fetchedAt = new Date();
  renderRowStatus(teamKey, cached);
  if(document.getElementById('modal-content').dataset.activeTeam === teamKey){
    renderLiveBundle(teamKey, cached);
  }
}

export async function liveScoreboardSweepTick(){
  const scoreboards = await Promise.all(FLAT_SCHEDULE_SPORT_PATHS.map(fetchEspnScoreboardCached));
  const bySportPath = {};
  FLAT_SCHEDULE_SPORT_PATHS.forEach((sportPath, i) => { bySportPath[sportPath] = scoreboards[i]; });

  LIVE_TEAM_KEYS.forEach(teamKey => {
    const meta = TEAM_META[teamKey];
    const flatSchedule = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
    if(!flatSchedule) return; // e.g. College Basketball — no ESPN scoreboard to sweep
    const scoreboard = bySportPath[flatSchedule.sportPath];
    if(!scoreboard) return;
    // Same by-name resolution fetchTeamBundle's ESPN branch uses — needs
    // that league's standings cache warm, which board.js's boot sequence
    // already kicks off for every league regardless of this sweep.
    const row = flatSchedule.findRow(meta);
    if(!row) return;
    applyLiveScoreboardPatch(teamKey, findEspnScoreboardLine(scoreboard.events, row.id));
  });
}
