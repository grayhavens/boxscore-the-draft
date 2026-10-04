/* ============================================================
   League Facts (shared, league-wide marks like cup winners) and
   manual point adjustments — every league's scoring now lives on this
   one shared model.

   Instead of marking "Relegation" on Liverpool's own tracker, you mark
   the real-world fact once — "who got relegated" — from the dashboard's
   password-gated admin page (js/admin.js), and every drafter who owns
   one of the teams involved is credited automatically. Rank rules
   (rankAuto in LEAGUE_SCORING) skip marking entirely and are read
   straight off a live ESPN standings table once it loads — every
   league's division/conference/league-wide title and last-place rules
   are on this model now (see getLeagueRuleTeams/rankAutoTables below);
   only bracket-shaped rules (a conference championship, a bowl game, a
   cup final) still require a mark, since nothing here reads ESPN's
   postseason results yet. Adjustments are a flat manual point delta per
   team, for whatever a rule can't express.

   Both are shared across everyone looking at the dashboard, not just
   saved in your own browser — held in Workers KV behind the same
   Cloudflare Worker used for the TheRundown comparison (see
   DASHBOARD_WORKER_BASE / worker/rundown-proxy.js). Reads are public;
   writes require the admin password (js/utils.js's
   loadAdminPassword/putAuthedJSON) and are only ever triggered from the
   admin page, which gates its own edit controls behind that same
   password. localStorage is kept alongside as a fallback: it's what
   renders instantly before the network responds, and what's used if
   DASHBOARD_WORKER_BASE is empty or unreachable.

   Storage shape: facts are { [ruleLabel]: [teamKey, ...] }; adjustments
   are { [teamKey]: { pts, note } } — one blob of each per league.
   ============================================================ */
import { TEAM_META, LEAGUE_SCORING, LEAGUES, DRAFT_TEAMS, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { fetchJSON, loadAdminPassword, putAuthedJSON, withNote, findCfbTeamKeyByLocation, draftOwnerName } from './utils.js';
import { FILTER_CHIP_LABELS } from './league-labels.js';
import { DASHBOARD_WORKER_BASE } from './api.js';
import { scopedKey, withScopeQuery } from './season.js';
import { eplStandingsCache, findEplTeamKeyByEspnName } from './standings-epl.js';
import { espnWnbaStandingsCache } from './standings-wnba.js';
import { findFlatTeamKey } from './standings-flat.js';
import { espnCfbRecordsCache, computeCfbConferenceStandings } from './standings-cfb.js';
import { espnCbbStandingsCache, computeCbbConferenceStandings, findCbbTeamKeyByEspnId } from './standings-cbb.js';
import {
  espnNflStandingsCache, espnNflDivisionCache,
  computeNflConferenceStandings, computeNflDivisionStandings, findNflTeamKeyByEspnAbbr
} from './standings-nfl.js';
import {
  espnNbaStandingsCache, espnNbaDivisionCache, nbaConferences,
  computeNbaConferenceStandings, computeNbaDivisionStandings
} from './standings-nba.js';
import {
  espnNhlStandingsCache, espnNhlDivisionCache, nhlConferences,
  computeNhlConferenceStandings, computeNhlDivisionStandings
} from './standings-nhl.js';
import {
  espnMlbStandingsCache, espnMlbDivisionCache, mlbConferences,
  computeMlbConferenceStandings, computeMlbDivisionStandings
} from './standings-mlb.js';
import { standingsDataChanged } from './board.js';
import { golfStore } from './golf-view.js';
import { golferAwardCounts } from './golf.js';
import { renderAdminPage } from './admin.js';
import { isLeagueLocked, getLockedRuleTeams } from './season-lock.js';
import { isSeasonUnderway, fetchSeasonPhaseCached, SEASON_PHASE_LEAGUES } from './season-phase.js';

// Per-league config for rankAuto's 'conference'/'division' scopes —
// NFL is kept separate (its own bespoke cache/lookup, not
// createFlatStandingsBoard — see js/standings-nfl.js) since it doesn't
// share NBA/NHL/MLB's generic shape (findFlatTeamKey, board.conferences,
// etc — see js/standings-flat.js).
const FLAT_RANK_AUTO_LEAGUES = {
  nba: {
    conferences: nbaConferences, cache: espnNbaStandingsCache, divisionCache: espnNbaDivisionCache,
    computeConferenceStandings: computeNbaConferenceStandings, computeDivisionStandings: computeNbaDivisionStandings
  },
  nhl: {
    conferences: nhlConferences, cache: espnNhlStandingsCache, divisionCache: espnNhlDivisionCache,
    computeConferenceStandings: computeNhlConferenceStandings, computeDivisionStandings: computeNhlDivisionStandings
  },
  mlb: {
    conferences: mlbConferences, cache: espnMlbStandingsCache, divisionCache: espnMlbDivisionCache,
    computeConferenceStandings: computeMlbConferenceStandings, computeDivisionStandings: computeMlbDivisionStandings
  }
};

// rankAuto's ranked source tables for one league/scope — an array of
// tables, each ranked independently top-to-bottom (one table total for
// a 'league'-scoped rule; one per conference/division otherwise). A
// table entry is { teamKey, row }: the resolved teamKey (or null for an
// undrafted ESPN team) and that team's standings row, at its position,
// so its INDEX still reflects the team's real rank — filtering nulls out
// before ranking would shift every drafted team's position for no
// reason. Returns [] while the underlying cache hasn't loaded yet, same
// "Pending" state the admin page already shows for a rankAuto rule with
// no data. js/lines.js reads the rows to say how close each team is to
// a line, so both always agree on the order.
export function rankAutoRowTables(leagueKey, scope){
  const entries = (rows, resolve) => rows.map(row => ({ teamKey: resolve(row), row }));
  if(leagueKey === 'epl'){
    return eplStandingsCache.table
      ? [entries(eplStandingsCache.table, row => findEplTeamKeyByEspnName(row.teamName))]
      : [];
  }
  if(leagueKey === 'wnba'){
    return espnWnbaStandingsCache.table
      ? [entries(espnWnbaStandingsCache.table, row => findFlatTeamKey('wnba', row.teamNickname))]
      : [];
  }
  if(leagueKey === 'nfl'){
    const nflKey = row => findNflTeamKeyByEspnAbbr(row.abbreviation);
    if(scope === 'division'){
      if(!espnNflDivisionCache.divisions) return [];
      return ['AFC', 'NFC'].flatMap(abbr => computeNflDivisionStandings(abbr)).map(div => entries(div.teams, nflKey));
    }
    if(!espnNflStandingsCache.rows) return [];
    return ['AFC', 'NFC'].map(abbr => entries(computeNflConferenceStandings(abbr), nflKey));
  }
  // CFB/mcbb have no fixed, hardcodable conference list the way NFL's
  // AFC/NFC or NBA's East/West are (10 real FBS conferences for CFB, 31
  // for mcbb) — so unlike every league above, the set of conferences to
  // rank within is read off the cache's own rows rather than a static
  // list, same idea as Object.values(byDrafter) elsewhere in this app
  // deriving its own grouping from live data instead of a fixed roster.
  if(leagueKey === 'cfb'){
    const rows = espnCfbRecordsCache.rows;
    if(!rows) return [];
    const conferences = [...new Set(rows.map(row => row.conference).filter(Boolean))];
    return conferences.map(conf => entries(computeCfbConferenceStandings(conf), row => findCfbTeamKeyByLocation(row.location)));
  }
  if(leagueKey === 'mcbb'){
    const rows = espnCbbStandingsCache.rows;
    if(!rows) return [];
    const conferences = [...new Set(rows.map(row => row.conferenceAbbr).filter(Boolean))];
    return conferences.map(conf => entries(computeCbbConferenceStandings(conf), row => findCbbTeamKeyByEspnId(row.id)));
  }
  const api = FLAT_RANK_AUTO_LEAGUES[leagueKey];
  if(!api) return [];
  const flatKey = row => findFlatTeamKey(leagueKey, row.teamNickname);
  const confAbbrs = api.conferences.map(c => c.abbr);
  if(scope === 'division'){
    if(!api.divisionCache.divisions) return [];
    return confAbbrs.flatMap(abbr => api.computeDivisionStandings(abbr)).map(div => entries(div.teams, flatKey));
  }
  if(!api.cache.rows) return [];
  return confAbbrs.map(abbr => entries(api.computeConferenceStandings(abbr), flatKey));
}

function rankAutoTables(leagueKey, scope){
  return rankAutoRowTables(leagueKey, scope).map(table => table.map(entry => entry.teamKey));
}

// Whether a 1-based rank within a table of `total` teams satisfies a
// rankAuto spec — exactly one of `rank` (an exact placement), `top`
// (placement <= N), or `bottom` (the worst N, e.g. relegation) is set
// per rule (see the LEAGUE_SCORING comment in js/data.js).
function rankAutoMatches(rank, total, spec){
  if(spec.bottom) return rank > total - spec.bottom;
  if(spec.top) return rank <= spec.top;
  return rank === spec.rank;
}

// The flat, unranked rows a `clinched: true` rule reads (see the
// LEAGUE_SCORING comment in js/data.js) — every conference/league
// combined into one list, since clinching doesn't need ranking, just
// ESPN's own clincherDescription text per team.
function clinchAutoRows(leagueKey){
  if(leagueKey === 'wnba') return espnWnbaStandingsCache.table || [];
  if(leagueKey === 'nfl') return espnNflStandingsCache.rows || [];
  const api = FLAT_RANK_AUTO_LEAGUES[leagueKey];
  return (api && api.cache.rows) || [];
}

function clinchAutoTeams(leagueKey){
  const resolve = leagueKey === 'nfl'
    ? row => findNflTeamKeyByEspnAbbr(row.abbreviation)
    : row => findFlatTeamKey(leagueKey, row.teamNickname);
  return clinchAutoRows(leagueKey)
    // Any "Clinched ___" wording guarantees a playoff spot, not just the
    // literal "Clinched Playoff Berth" — confirmed live (2026-09-17),
    // MLB's own division winners (the Brewers/Dodgers) show "Clinched
    // Division" with no separate "Playoff Berth" mention at all, and
    // winning a division always implies a playoff berth in every league
    // here. "Clinched" also covers e.g. "...and Won Commissioner's Cup"/
    // "...and a Bye" tacked onto either wording. Deliberately excludes
    // "Eliminated (From Playoffs/from Playoff Contention)" and a team
    // with no clincherDescription at all yet (still undetermined).
    .filter(row => row.clincherDescription && /clinched/i.test(row.clincherDescription) && !/eliminated/i.test(row.clincherDescription))
    .map(resolve)
    .filter(Boolean);
}

const LEAGUE_FACTS_KEY = 'teamDashboardLeagueFacts';

export const LEAGUE_FACTS_LEAGUES = LEAGUES.map(l => l.key);

// Whether every league's shared facts and manual adjustments have
// finished loading (or failed for good). Points totals read both through
// the local fallback until then, so a total computed before this is true
// can briefly be short — js/activity.js waits on it before trusting a
// rank change.
export function leagueInputsSettled(){
  if(!DASHBOARD_WORKER_BASE) return true;
  // A league still showing last season never reads its adjustments
  // (obDrafterAwards skips them), so they never load: don't wait on them.
  return LEAGUES.every(l => {
    const f = factsCacheFor(l.key), a = adjustmentsCacheFor(l.key);
    const adjSettled = PRIOR_SEASON_DISPLAY_LEAGUES.includes(l.key) || a.data !== null || a.error;
    return (f.data !== null || f.error) && adjSettled;
  });
}

const leagueFactsCache = {}; // leagueKey -> { data, loading, error }
function factsCacheFor(leagueKey){
  return leagueFactsCache[leagueKey] || (leagueFactsCache[leagueKey] = { data: null, loading: false, error: false });
}

// EPL was the pilot for this feature and kept its original bare
// localStorage key (with the legacy { epl: {...} }-nested shape some
// early versions wrote); every league added since gets its own
// suffixed key instead of sharing that one flat slot.
function localFactsKey(leagueKey){
  return leagueKey === 'epl' ? scopedKey(LEAGUE_FACTS_KEY) : `${scopedKey(LEAGUE_FACTS_KEY)}:${leagueKey}`;
}

function loadLocalLeagueFacts(leagueKey){
  try {
    const parsed = JSON.parse(localStorage.getItem(localFactsKey(leagueKey)));
    if(!parsed) return {};
    // Earlier versions of this feature stored { epl: {...} } (facts
    // nested per league, in case other leagues moved to this model
    // too). Unwrap that shape if we find it; otherwise this is already
    // the flat rule-map saveLocalLeagueFacts writes today.
    return (parsed[leagueKey] && typeof parsed[leagueKey] === 'object') ? parsed[leagueKey] : parsed;
  } catch (e){
    return {};
  }
}

function saveLocalLeagueFacts(leagueKey, facts){
  try {
    localStorage.setItem(localFactsKey(leagueKey), JSON.stringify(facts));
  } catch (e){
    // localStorage unavailable (private browsing, etc.) — facts just won't persist locally.
  }
}

// Synchronous read used everywhere the app needs "what's marked right
// now": the shared copy once it's loaded, the local fallback until
// then. Kicks off the network fetch on first read, same lazy-load
// pattern as fetchEplStandingsTable.
function currentLeagueFacts(leagueKey){
  const cache = factsCacheFor(leagueKey);
  if(cache.data === null && !cache.loading && !cache.error) fetchLeagueFacts(leagueKey);
  return cache.data || loadLocalLeagueFacts(leagueKey);
}

async function fetchLeagueFacts(leagueKey){
  const cache = factsCacheFor(leagueKey);
  if(cache.data !== null || cache.loading || !DASHBOARD_WORKER_BASE) return;
  cache.loading = true;
  const data = await fetchJSON(withScopeQuery(`${DASHBOARD_WORKER_BASE}/facts/${leagueKey}`));
  cache.loading = false;
  // If a mark was made locally while this was in flight, cache.data is
  // no longer null — don't clobber that edit with the (now stale) GET.
  if(cache.data !== null) return;
  if(data && typeof data === 'object'){
    cache.data = data;
    standingsDataChanged();
    renderAdminPage();
  } else {
    cache.error = true;
  }
}

// Pushes the current facts to both the local fallback and the shared
// store. The PUT is fire-and-forget — if it fails (offline, worker
// down, wrong/expired admin password) the mark still sticks locally, it
// just won't show up for anyone else until the next successful sync.
// Only ever called from the admin page, which already gated the edit
// controls behind a verified password — loadAdminPassword() here is
// just reading what that page already confirmed. Resolves to whether it
// reached the shared store, so the admin page can say when it didn't.
// "NFL", "CFB": how a league reads in a log line.
const leagueShort = leagueKey => FILTER_CHIP_LABELS[leagueKey] || leagueKey.toUpperCase();
// "Lions (Josh)"
const teamWithOwner = teamKey => `${TEAM_META[teamKey].name} (${draftOwnerName(teamKey)})`;

// `note` says what changed, for the system admin page's log (withNote).
function persistLeagueFacts(leagueKey, facts, note){
  saveLocalLeagueFacts(leagueKey, facts);
  if(!DASHBOARD_WORKER_BASE) return Promise.resolve(true);
  return putAuthedJSON(withNote(withScopeQuery(`${DASHBOARD_WORKER_BASE}/facts/${leagueKey}`), note), loadAdminPassword(), facts)
    .then(({ ok }) => {
      if(!ok) console.warn('[League Facts]', leagueKey, 'failed to sync to shared store');
      return ok;
    });
}

// ---- Manual point adjustments ----
// A flat point delta per team, for whatever a rule can't express (or
// ESPN's feed can't confirm). Same KV/localStorage-fallback pattern as
// facts above, just a different worker route and shape.
const LEAGUE_ADJUSTMENTS_KEY = 'teamDashboardLeagueAdjustments';
const leagueAdjustmentsCache = {}; // leagueKey -> { data, loading, error }

function adjustmentsCacheFor(leagueKey){
  return leagueAdjustmentsCache[leagueKey] || (leagueAdjustmentsCache[leagueKey] = { data: null, loading: false, error: false });
}

function loadLocalLeagueAdjustments(leagueKey){
  try {
    return JSON.parse(localStorage.getItem(`${scopedKey(LEAGUE_ADJUSTMENTS_KEY)}:${leagueKey}`)) || {};
  } catch (e){
    return {};
  }
}

function saveLocalLeagueAdjustments(leagueKey, adjustments){
  try {
    localStorage.setItem(`${scopedKey(LEAGUE_ADJUSTMENTS_KEY)}:${leagueKey}`, JSON.stringify(adjustments));
  } catch (e){}
}

export function currentLeagueAdjustments(leagueKey){
  const cache = adjustmentsCacheFor(leagueKey);
  if(cache.data === null && !cache.loading && !cache.error) fetchLeagueAdjustments(leagueKey);
  return cache.data || loadLocalLeagueAdjustments(leagueKey);
}

async function fetchLeagueAdjustments(leagueKey){
  const cache = adjustmentsCacheFor(leagueKey);
  if(cache.data !== null || cache.loading || !DASHBOARD_WORKER_BASE) return;
  cache.loading = true;
  const data = await fetchJSON(withScopeQuery(`${DASHBOARD_WORKER_BASE}/adjustments/${leagueKey}`));
  cache.loading = false;
  if(cache.data !== null) return;
  if(data && typeof data === 'object'){
    cache.data = data;
    standingsDataChanged();
    renderAdminPage();
  } else {
    cache.error = true;
  }
}

function persistLeagueAdjustments(leagueKey, adjustments, note){
  saveLocalLeagueAdjustments(leagueKey, adjustments);
  if(!DASHBOARD_WORKER_BASE) return Promise.resolve(true);
  return putAuthedJSON(withNote(withScopeQuery(`${DASHBOARD_WORKER_BASE}/adjustments/${leagueKey}`), note), loadAdminPassword(), adjustments)
    .then(({ ok }) => {
      if(!ok) console.warn('[League Adjustments]', leagueKey, 'failed to sync to shared store');
      return ok;
    });
}

// Sets (or, with pts 0 and no note, clears) one team's manual point
// adjustment. Only ever called from the admin page. Resolves to whether
// the shared store took it.
export function setTeamAdjustment(teamKey, pts, note){
  return setTeamAdjustments([{ teamKey, pts, note }]);
}
window.setTeamAdjustment = setTeamAdjustment;

// Several at once, all in one league: one write, so the store can't end up
// with an earlier, partial copy landing last.
export function setTeamAdjustments(changes){
  const valid = changes.filter(c => TEAM_META[c.teamKey]);
  if(!valid.length) return Promise.resolve(false);
  const leagueKey = TEAM_META[valid[0].teamKey].leagueKey;
  const cache = adjustmentsCacheFor(leagueKey);
  const adjustments = cache.data || (cache.data = currentLeagueAdjustments(leagueKey));
  const lines = valid.map(({ teamKey, pts, note }) => {
    if(!pts && !note){
      delete adjustments[teamKey];
      return `cleared ${teamWithOwner(teamKey)}`;
    }
    adjustments[teamKey] = { pts: pts || 0, note: note || '' };
    return `${teamWithOwner(teamKey)} ${pts > 0 ? '+' : ''}${pts || 0}${note ? ` “${note}”` : ''}`;
  });
  const synced = persistLeagueAdjustments(leagueKey, adjustments, `${leagueShort(leagueKey)} adjustment: ${lines.join('; ')}`);
  renderAdminPage();
  return synced;
}

// A team's current manual adjustment, or null if it has none — read by
// teamPointsSplit below and by obDrafterAwards in js/overall.js.
export function getTeamAdjustment(teamKey){
  const meta = TEAM_META[teamKey];
  if(!meta) return null;
  return currentLeagueAdjustments(meta.leagueKey)[teamKey] || null;
}

function findLeagueRule(leagueKey, ruleLabel){
  return LEAGUE_SCORING[leagueKey].rules.find(r => r.label === ruleLabel);
}

// The live (still-moving) rankAuto answer for one rule — reads straight
// off whatever ESPN's table shows right now, no lock/season-end
// awareness at all. Exported so js/season-lock.js can call this exact
// same logic one last time at the moment a league's regular season
// ends, to build the frozen snapshot getLeagueRuleTeams (below) then
// switches to reading instead. Everywhere else in the app should call
// getLeagueRuleTeams, not this directly, or it'll keep reading a moving
// target after a league is locked.
export function computeLiveRankAutoTeams(leagueKey, rule){
  if(rule.rankAuto.clinched) return clinchAutoTeams(leagueKey);
  return rankAutoTables(leagueKey, rule.rankAuto.scope).flatMap(table => {
    const total = table.length;
    return table.filter((teamKey, i) => teamKey && rankAutoMatches(i + 1, total, rule.rankAuto));
  });
}

// Whether a league's live table counts toward points yet: its season
// has to actually be under way (js/season-phase.js's isSeasonUnderway —
// Regular Season start through Postseason end). Stops an off-season
// table from scoring: College Basketball's still showing last season's
// final standings in September, NBA's fresh 0-0 table, NHL's preseason.
// EPL has no phase calendar; it counts once any club has played. null
// while the phase data is still loading (callers treat that as "not
// yet"; this kicks the fetch and repaints once it lands). Only gates
// the LIVE table — a locked league reads its frozen snapshot regardless.
const phasePrimed = {};
export function leagueSeasonUnderway(leagueKey){
  if(leagueKey === 'epl'){
    const table = eplStandingsCache.table;
    return table ? table.some(row => (row.gamesPlayed || 0) > 0) : null;
  }
  if(!SEASON_PHASE_LEAGUES.includes(leagueKey)) return true;
  const underway = isSeasonUnderway(leagueKey);
  if(underway === null && !phasePrimed[leagueKey]){
    phasePrimed[leagueKey] = true;
    fetchSeasonPhaseCached(leagueKey).then(standingsDataChanged);
  }
  return underway;
}

// Teams currently satisfying a rule — a frozen snapshot for a rankAuto
// rule whose league has already locked in its regular season
// (js/season-lock.js), the live ESPN table otherwise (computeLiveRankAutoTeams
// above), or the manually-marked facts for anything that isn't rankAuto
// at all. obRuleTeams (js/overall.js) picks this up automatically for
// any league listed in LEAGUE_FACTS_LEAGUES.
export function getLeagueRuleTeams(leagueKey, rule){
  if(!LEAGUE_FACTS_LEAGUES.includes(leagueKey)) return null;
  if(rule.golfAuto) return golfRuleTeams(leagueKey, rule);
  if(rule.rankAuto){
    // MLB/WNBA's live ESPN data is still last season's right now (see
    // PRIOR_SEASON_DISPLAY_LEAGUES in js/data.js) — a manual mark has an
    // admin to catch that before crediting it; an automated rule doesn't,
    // so it has to check this itself rather than silently scoring a
    // season that isn't supposed to count yet.
    if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(leagueKey)) return [];
    if(isLeagueLocked(leagueKey)) return getLockedRuleTeams(leagueKey, rule.label);
    if(leagueSeasonUnderway(leagueKey) !== true) return [];
    return computeLiveRankAutoTeams(leagueKey, rule);
  }
  return currentLeagueFacts(leagueKey)[rule.label] || [];
}

// A golfAuto rule's answer (js/seasons/pga.js): each drafted golfer's
// key, once per time they hit the rule, so a golfer with three wins is
// three entries and the Points tab itemizes three awards. Read off the
// season's finished events (golfStore, js/golf-view.js), so it's final
// the moment an event is, never Live. Nothing counts while the league
// is still on prior-season data, or while the loaded season isn't this
// year's (January shows last season until its first event is done).
export const isAutoRule = rule => !!(rule.rankAuto || rule.golfAuto);

function golfRuleTeams(leagueKey, rule){
  if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(leagueKey)) return [];
  if(!golfStore.events || golfStore.season !== new Date().getFullYear()) return [];
  const kind = rule.golfAuto.each || rule.golfAuto.once;
  const out = [];
  LEAGUES.filter(l => l.key === leagueKey).forEach(league => league.teams.forEach(teamKey => {
    const meta = TEAM_META[teamKey];
    if(!meta || meta.kind !== 'golfer') return;
    const count = golferAwardCounts(golfStore.events, meta.espnAthleteId)[kind] || 0;
    for(let i = 0; i < (rule.golfAuto.once ? Math.min(count, 1) : count); i++) out.push(teamKey);
  }));
  return out;
}

// Both resolve to whether the shared store took the change (false for a
// no-op).
export function addLeagueFact(leagueKey, ruleLabel, teamKey){
  const rule = findLeagueRule(leagueKey, ruleLabel);
  if(!rule || isAutoRule(rule) || !teamKey) return Promise.resolve(false);

  const cache = factsCacheFor(leagueKey);
  const facts = cache.data || (cache.data = currentLeagueFacts(leagueKey));
  if(rule.exclusive){
    facts[ruleLabel] = [teamKey];
  } else {
    const list = facts[ruleLabel] || (facts[ruleLabel] = []);
    if(!list.includes(teamKey)) list.push(teamKey);
  }
  const synced = persistLeagueFacts(leagueKey, facts, `${leagueShort(leagueKey)}: marked ${teamWithOwner(teamKey)} for ${ruleLabel}`);
  renderAdminPage();
  return synced;
}
window.addLeagueFact = addLeagueFact;

export function removeLeagueFact(leagueKey, ruleLabel, teamKey){
  const cache = factsCacheFor(leagueKey);
  const facts = cache.data || (cache.data = currentLeagueFacts(leagueKey));
  const list = facts[ruleLabel] || [];
  const idx = list.indexOf(teamKey);
  if(idx === -1) return Promise.resolve(false);
  list.splice(idx, 1);
  const synced = persistLeagueFacts(leagueKey, facts, `${leagueShort(leagueKey)}: removed ${teamWithOwner(teamKey)} from ${ruleLabel}`);
  renderAdminPage();
  return synced;
}
window.removeLeagueFact = removeLeagueFact;

// A rule's points are Live (the code's "provisional") while they read
// off a moving table: a rankAuto rule until its league locks in its
// regular season (js/season-lock.js) — from then on getLeagueRuleTeams
// is reading a frozen snapshot — or any rule marked `live: true`, which
// is always Live, no lock involved. Everything else is Locked. The one
// definition of Live the Points tab (js/overall.js) and the team page's
// Draft Points section share.
export function isRuleProvisional(rule, leagueKey){
  return (!!rule.rankAuto && !isLeagueLocked(leagueKey)) || !!rule.live;
}

// One team's points, split the same way the Points tab splits a
// drafter's: Locked (manual facts, a locked league's rankAuto rules,
// admin adjustments), Live (see isRuleProvisional), and Projected =
// Locked + Live, "if the season ended today". Adjustments are skipped
// for a league still showing last season (PRIOR_SEASON_DISPLAY_LEAGUES),
// same as obDrafterAwards does — nothing there counts yet.
export function teamPointsSplit(teamKey){
  const meta = TEAM_META[teamKey];
  const scoring = meta && LEAGUE_SCORING[meta.leagueKey];
  const split = { locked: 0, live: 0, projected: 0 };
  if(!scoring) return split;
  scoring.rules.forEach(r => {
    // A golfer can hit a rule more than once: one entry per time.
    const times = (getLeagueRuleTeams(meta.leagueKey, r) || []).filter(k => k === teamKey).length;
    if(!times) return;
    if(isRuleProvisional(r, meta.leagueKey)) split.live += r.pts * times;
    else split.locked += r.pts * times;
  });
  const adj = PRIOR_SEASON_DISPLAY_LEAGUES.includes(meta.leagueKey) ? null : getTeamAdjustment(teamKey);
  if(adj) split.locked += adj.pts;
  split.projected = split.locked + split.live;
  return split;
}

// Where a rankAuto rule's answer comes from, in words, for the admin
// page: "1st in each conference", "Bottom 3 of the table", "Clinched on
// ESPN".
export function ruleAutoNote(rule){
  if(rule.golfAuto) return 'From ESPN results';
  const spec = rule.rankAuto;
  if(!spec) return '';
  if(spec.clinched) return 'Clinched on ESPN';
  const where = spec.scope === 'conference' || spec.scope === 'division' ? `in each ${spec.scope}` : 'of the table';
  const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
  if(spec.bottom) return spec.bottom === 1 ? `Last ${where}` : `Bottom ${spec.bottom} ${where}`;
  if(spec.top) return `Top ${spec.top} ${where}`;
  return `${ordinal(spec.rank)} ${where}`;
}

// Whether a rankAuto rule has nothing to read yet (no table loaded, the
// season not under way, or a league still showing last season), as
// opposed to a loaded table where no drafted team qualifies.
export function ruleDataPending(leagueKey, rule){
  if(!rule.rankAuto) return false;
  if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(leagueKey)) return true;
  if(isLeagueLocked(leagueKey)) return false;
  if(leagueSeasonUnderway(leagueKey) !== true) return true;
  return rule.rankAuto.clinched
    ? !clinchAutoRows(leagueKey).length
    : !rankAutoTables(leagueKey, rule.rankAuto.scope).length;
}

// Every owner's projected points in one league (rules plus adjustments,
// the same split the team page shows), for the admin page's chart. Only
// drafters with a team in the league.
export function leagueDrafterPoints(leagueKey){
  const league = LEAGUES.find(l => l.key === leagueKey);
  const totals = new Map();
  (league ? league.teams : []).forEach(teamKey => {
    const meta = TEAM_META[teamKey];
    if(!meta || meta.favoriteOnly) return;
    totals.set(meta.draftTeamId, (totals.get(meta.draftTeamId) || 0) + teamPointsSplit(teamKey).projected);
  });
  return DRAFT_TEAMS.filter(d => totals.has(d.id)).map(d => ({ id: d.id, name: d.name, pts: totals.get(d.id) }));
}

// One row per scoring rule, used by the admin page (js/admin.js) to mark
// league-wide facts (cup winners, who got relegated, etc.) instead of
// hunting down each drafted team individually — pick the real club from
// the dropdown and whoever drafted it gets credited. Rank-based rules
// (rankAuto) have no picker at all since they're read straight off the
// standings table above.
export function leagueFactRowHtml(league, rule){
  const selected = getLeagueRuleTeams(league.key, rule);
  const isAuto = isAutoRule(rule);

  const chipsHtml = selected.length
    ? selected.map(teamKey => {
        const meta = TEAM_META[teamKey];
        const removeBtn = isAuto ? '' : `<button class="fact-chip-x" onclick="removeLeagueFact('${league.key}', '${rule.label}', '${teamKey}')" aria-label="Remove ${meta.name}">&times;</button>`;
        return `
          <span class="fact-chip">
            <span class="fact-chip-badge" style="${meta.badgeStyle}">${meta.badgeText}</span>
            ${meta.name} <span class="fact-chip-owner">${draftOwnerName(teamKey)}</span>
            ${removeBtn}
          </span>
        `;
      }).join('')
    : `<span class="fact-empty">${isAuto ? 'Pending' : 'Not marked yet'}</span>`;

  // favoriteOnly teams (js/data.js) excluded from the picker — they're
  // not a real draft pick, and obDrafterAwards (js/overall.js) already
  // filters them out of every points computation, so marking a fact
  // against one would silently never count toward anyone. Offering it
  // here would just be a confusing dead end.
  const pickerHtml = isAuto ? '' : `
    <select class="fact-picker" onchange="if(this.value){ addLeagueFact('${league.key}', '${rule.label}', this.value); this.value=''; }">
      <option value="">+ Mark a team…</option>
      ${league.teams.filter(teamKey => !TEAM_META[teamKey].favoriteOnly).map(teamKey => `<option value="${teamKey}">${TEAM_META[teamKey].name} — ${DRAFT_TEAMS.find(d => d.id === TEAM_META[teamKey].draftTeamId).name}</option>`).join('')}
    </select>
  `;

  return `
    <div class="fact-row">
      <div class="fact-row-top">
        <div class="fact-label">${rule.label}</div>
        <div class="fact-pts ${rule.pts >= 0 ? 'pos' : 'neg'}">${rule.pts >= 0 ? '+' : ''}${rule.pts}</div>
      </div>
      <div class="fact-chips">${chipsHtml}</div>
      ${pickerHtml}
    </div>
  `;
}

