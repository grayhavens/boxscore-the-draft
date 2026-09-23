/* ============================================================
   Board rendering, the drafter picker, tab navigation, URL state,
   and the Standings-tab orchestration that ties the EPL/CFB modules
   together. Also the app's boot sequence — this is the last script
   loaded, so it runs after every other module has registered its
   window.* entry points for the inline onclick handlers in the
   rendered HTML.
   ============================================================ */
import { DRAFT_TEAMS, TEAM_META, LEAGUES, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { updateUrlParam, teamBadgeHtml, skeletonRowsHtml } from './utils.js';
import { LEAGUE_FACTS_LEAGUES, migrateAchievementsToFacts } from './league-facts.js';
import {
  eplStandingsCache, eplStandingsMode, computeEplDrafterCombined, renderEplByDrafterRow,
  renderStandingsRow, eplStandingsToggleHtml, fetchEplStandingsTable, loadEplStandingsCache,
  renderAllEplCardRecords
} from './standings-epl.js';
import {
  cfbStandingsMode, computeCfbDrafterCombined, renderCfbByDrafterRow,
  computeCfbRankingTable, renderCfbRankingRow, cfbStandingsToggleHtml, fetchCfbRecords,
  loadCfbRecordsCache, renderAllCfbCardRecords,
  espnCfbRankingsCache, fetchEspnCfbRankingsCached, loadEspnCfbRankingsCache,
  espnCfbRecordsCache, fetchEspnCfbRecordsCached, loadEspnCfbRecordsCache
} from './standings-cfb.js';
import {
  nflStandingsMode, nflConferenceSubMode, computeNflDrafterCombined, renderNflByDrafterRow,
  computeNflDivisionStandings, computeNflConferenceStandings, renderNflStandingsRow, renderNflGroupHeader,
  nflStandingsToggleHtml, renderAllNflCardRecords, espnNflStandingsCache, fetchEspnNflStandingsCached,
  loadEspnNflStandingsCache, espnNflDivisionCache, fetchEspnNflDivisionStandingsCached, loadEspnNflDivisionCache
} from './standings-nfl.js';
import { loadNflverseCaches } from './nflverse.js';
import {
  espnNbaStandingsCache, loadEspnNbaStandingsCache, fetchEspnNbaStandingsCached, renderAllNbaCardRecords,
  computeNbaConferenceStandings, renderNbaStandingsRow, computeNbaDrafterCombined, renderNbaByDrafterRow,
  nbaStandingsToggleHtml, getNbaStandingsMode, nbaConferences,
  nbaHasDivisions, espnNbaDivisionCache, loadEspnNbaDivisionCache, fetchEspnNbaDivisionStandingsCached,
  computeNbaDivisionStandings, renderNbaGroupHeader, getNbaConferenceSubMode
} from './standings-nba.js';
import {
  espnNhlStandingsCache, loadEspnNhlStandingsCache, fetchEspnNhlStandingsCached, renderAllNhlCardRecords,
  computeNhlConferenceStandings, renderNhlStandingsRow, computeNhlDrafterCombined, renderNhlByDrafterRow,
  nhlStandingsToggleHtml, getNhlStandingsMode, nhlConferences,
  nhlHasDivisions, espnNhlDivisionCache, loadEspnNhlDivisionCache, fetchEspnNhlDivisionStandingsCached,
  computeNhlDivisionStandings, renderNhlGroupHeader, getNhlConferenceSubMode
} from './standings-nhl.js';
import {
  espnMlbStandingsCache, loadEspnMlbStandingsCache, fetchEspnMlbStandingsCached, renderAllMlbCardRecords,
  computeMlbConferenceStandings, renderMlbStandingsRow, computeMlbDrafterCombined, renderMlbByDrafterRow,
  mlbStandingsToggleHtml, getMlbStandingsMode, mlbConferences,
  mlbHasDivisions, espnMlbDivisionCache, loadEspnMlbDivisionCache, fetchEspnMlbDivisionStandingsCached,
  computeMlbDivisionStandings, renderMlbGroupHeader, getMlbConferenceSubMode
} from './standings-mlb.js';
import {
  espnWnbaStandingsCache, wnbaStandingsMode, computeWnbaDrafterCombined, renderWnbaByDrafterRow,
  renderWnbaStandingsRow, wnbaStandingsToggleHtml, fetchEspnWnbaStandingsCached, loadEspnWnbaStandingsCache,
  renderAllWnbaCardRecords
} from './standings-wnba.js';
import {
  cbbStandingsMode, computeCbbDrafterCombined, renderCbbByDrafterRow,
  computeCbbRankingTable, renderCbbRankingRow, cbbStandingsToggleHtml, renderAllCbbCardRecords,
  espnCbbRankingsCache, fetchEspnCbbRankingsCached, loadEspnCbbRankingsCache,
  espnCbbStandingsCache, fetchEspnCbbStandingsCached, loadEspnCbbStandingsCache
} from './standings-cbb.js';
import { renderOverallStandings, setObMode } from './overall.js';
import { startActivity } from './activity.js';
import { loadLiveDataCache, loadTeamInfoCache, renderRowStatus, backgroundRefreshTick, REFRESH_STEP_MS, liveDataCache, liveScoreboardSweepTick, LIVE_SWEEP_INTERVAL_MS } from './live-data.js';
import { loadSeasonPhaseCache, fetchSeasonPhaseCached, SEASON_PHASE_LEAGUES } from './season-phase.js';
import { checkSeasonLocks } from './season-lock.js';
import { renderLiveNow, resetTodayDay } from './live-now.js';
import { openTeamPage } from './team-page.js';
import { renderAdminPage } from './admin.js';
import { renderScoringPage } from './scoring-page.js';
import { getSettings } from './settings.js';
import { currentProfileId, paintIdentityChrome, maybeShowWelcome } from './identity.js';
import { initChat, setChatActive, paintBadges as paintChatBadges } from './chat.js';
import { favoriteStarHtml, isFavorite } from './favorites.js';

// Bump this on every deploy that changes what's on screen. It's shown
// in the corner of the app (see #build-tag in index.html) so you can
// confirm a device is actually running the latest build rather than
// a stale cached copy — compare what's on screen to the version
// mentioned when a change ships.
const APP_VERSION = '2026.09.19-3';

// ---- Bookmarkable state ----
// Reads whatever the URL specifies at load and applies it through the
// same setters a person clicking around would trigger, so this is the
// only place that needs to know the param names. ?league= or ?data=
// alone (no explicit ?view=) also switches to the tab that param
// belongs to — bookmarking "CFB standings" should land on Standings,
// not silently filter a tab you're not looking at.
function applyUrlState(){
  let params;
  try { params = new URLSearchParams(window.location.search); } catch (e){ return; }

  const team = params.get('team');
  if(team && DRAFT_TEAMS.some(d => d.id === team)) setDraftTeam(team);

  const league = params.get('league');
  const hasLeague = !!league && (league === 'all' || LEAGUES.some(l => l.key === league));
  if(hasLeague) setStandingsFilter(league);

  const data = params.get('data');
  const hasData = data === 'real' || data === 'simulated';
  if(hasData) setObMode(data);

  // The Team Page (js/team-page.js) isn't on switchView's whitelist — it
  // pushes/pops `.view.active` itself, keeping whichever real tab was
  // active underneath lit — so it's handled separately here rather than
  // added to the `view` list below. `?tp=` is its own team-key param,
  // not `?team=` (that one's already spoken for — see setDraftTeam
  // above), so it survives a page piece even if setDraftTeam above
  // didn't recognize a coincidentally-shaped `?team=` value.
  const explicitView = params.get('view');
  const tp = params.get('tp');
  if(explicitView === 'team' && tp && TEAM_META[tp]){
    openTeamPage(tp, 'standings');
    return;
  }

  const view = (explicitView === 'board' || explicitView === 'live-now' || explicitView === 'standings' || explicitView === 'overall' || explicitView === 'chat' || explicitView === 'admin' || explicitView === 'scoring')
    ? explicitView
    : (hasLeague ? 'standings' : (hasData ? 'overall' : null));
  // No view in the URL: fall back to the "Open to" setting (js/settings.js).
  // A shared/bookmarked link with any view of its own always wins.
  const landing = getSettings().landing;
  if(view) switchView(view);
  else if(landing !== 'board' && !params.has('view') && !params.has('team')) switchView(landing);
}

// ---- Draft team selection ----
// Which drafter's roster is currently DISPLAYED on the Board/Standings
// views — not necessarily who you are. Defaults to your own profile
// (js/identity.js), but a ?team= URL param can temporarily "peek" at
// someone else's board (see setDraftTeam below) without changing who
// you are or who gets credited when you favorite a team.
export let currentDraftTeamId = currentProfileId;

// Your own drafted roster, plus (only on your own board, never while
// peeking someone else's) any teams you've favorited that you didn't
// draft yourself — see the owner-label handling in renderBoard below,
// which is what tells the two apart on screen.
function teamsForCurrentDraftTeam(league){
  const owned = league.teams.filter(teamKey => TEAM_META[teamKey].draftTeamId === currentDraftTeamId);
  if(currentDraftTeamId !== currentProfileId) return owned;
  const favoritedElsewhere = league.teams.filter(teamKey =>
    TEAM_META[teamKey].draftTeamId !== currentDraftTeamId && isFavorite(teamKey)
  );
  return owned.concat(favoritedElsewhere);
}

// Deliberately not persisted to localStorage — that's the difference
// between this and a real identity switch. A ?team= link only changes
// what's displayed for this page view; reloading or picking your own
// profile again always lands back on your own board. See
// js/identity.js's chooseProfile, which calls this too (to keep the
// display in sync) alongside actually changing who you are.
export function setDraftTeam(id){
  if(!DRAFT_TEAMS.some(d => d.id === id)) return;
  currentDraftTeamId = id;
  // Keep the URL clean (no ?team=) for the common case of viewing your
  // own board; only set it while genuinely peeking, so the param's
  // bookmarkable/shareable role stays legible.
  updateUrlParam('team', id === currentProfileId ? null : id);
  renderBoard();
  const standingsView = document.getElementById('view-standings');
  if(standingsView && standingsView.classList.contains('active')) renderStandings();
  paintIdentityChrome(id);
  paintChatBadges();
}
window.setDraftTeam = setDraftTeam;

// ---- Board rendering ----

// Which league the Teams view is isolated to — same "All" + per-league
// chip row as standingsFilterKey/setStandingsFilter below, just scoped
// to the Board instead. Not persisted/URL-mirrored since the drafter
// picker already is; resets to "All" each time the view re-renders
// from a fresh load.
let boardFilterKey = 'all';

export function setBoardFilter(key){
  boardFilterKey = key;
  renderBoard();
}
window.setBoardFilter = setBoardFilter;

// Hardcoded on purpose: the header tally is the size of the draft, not a
// count of whatever's on the page (which now includes favorites).
const DRAFT_TEAM_COUNT = 21;

export function renderBoard(){
  const chipsEl = document.getElementById('filter-chips');
  const leaguesEl = document.getElementById('leagues');

  chipsEl.innerHTML = ['all'].concat(LEAGUES.map(l => l.key)).map(key => {
    const label = key === 'all' ? 'All' : (FILTER_CHIP_LABELS[key] || LEAGUES.find(l => l.key === key).label);
    return `<div class="filter-chip ${key === boardFilterKey ? 'active' : ''}" onclick="setBoardFilter('${key}')">${label}</div>`;
  }).join('');

  const shownLeagues = boardFilterKey === 'all' ? LEAGUES : LEAGUES.filter(l => l.key === boardFilterKey);

  leaguesEl.innerHTML = shownLeagues.map(league => {
    const leagueTeams = teamsForCurrentDraftTeam(league);
    const teamsHtml = leagueTeams.map(teamKey => {
      const meta = TEAM_META[teamKey];
      const cfbRecordHtml = league.key === 'cfb' ? `<span class="cfb-record" id="cfb-record-${teamKey}"></span>` : '';
      const nflRecordHtml = league.key === 'nfl' ? `<span class="cfb-record" id="nfl-record-${teamKey}"></span>` : '';
      const nbaRecordHtml = league.key === 'nba' ? `<span class="cfb-record" id="nba-record-${teamKey}"></span>` : '';
      const nhlRecordHtml = league.key === 'nhl' ? `<span class="cfb-record" id="nhl-record-${teamKey}"></span>` : '';
      const mlbRecordHtml = league.key === 'mlb' ? `<span class="cfb-record" id="mlb-record-${teamKey}"></span>` : '';
      const wnbaRecordHtml = league.key === 'wnba' ? `<span class="cfb-record" id="wnba-record-${teamKey}"></span>` : '';
      const mcbbRecordHtml = league.key === 'mcbb' ? `<span class="cfb-record" id="cfb-record-${teamKey}"></span>` : '';
      // EPL: every team is in the same one league, so the static
      // "Premier League" boardSub text carried no information — swap
      // it for the team's own record + table position instead (see
      // eplRecordLabel/renderEplCardRecord in js/standings-epl.js).
      // Every other league's boardSub (mascot/city) is still meaningful
      // per team, so those keep it and just append their record chip
      // after it (empty string until that league's standings cache
      // resolves, same as CFB/NFL always have).
      // A team pulled in by a favorite (not this drafter's own — see
      // teamsForCurrentDraftTeam above) renders exactly like any other
      // row, no owner credit — the star alone is what marks it as a
      // favorite rather than something actually drafted here.
      const subHtml = league.key === 'epl'
        ? `<span class="epl-record" id="epl-record-${teamKey}"></span>`
        : `${meta.boardSub}${cfbRecordHtml}${nflRecordHtml}${nbaRecordHtml}${nhlRecordHtml}${mlbRecordHtml}${wnbaRecordHtml}${mcbbRecordHtml}`;
      // The star is a favorited-status indicator here, not a persistent
      // toggle affordance on every row — it only appears once a team is
      // actually favorited (toggling that on happens from the team
      // modal). Keeps a drafter's own roster from being cluttered with
      // empty stars on every single team.
      return `
        <div class="team clickable" onclick="openTeamModal('${teamKey}')">
          ${teamBadgeHtml(meta)}
          <div class="team-main">
            <div class="team-name">${meta.name}</div>
            <div class="team-sub">${subHtml}</div>
          </div>
          ${isFavorite(teamKey) ? favoriteStarHtml(teamKey) : ''}
          <div class="status-slot" id="row-status-${teamKey}"></div>
        </div>
      `;
    }).join('');

    return `
      <div class="league" id="league-${league.key}">
        <div class="league-tab">
          <div>${LEAGUE_FULL_LABELS[league.key] || league.label}</div>
          <span class="n">${league.season}</span>
        </div>
        ${teamsHtml}
      </div>
    `;
  }).join('');

  document.getElementById('team-tally').textContent = `${LEAGUES.length} leagues · ${DRAFT_TEAM_COUNT} teams`;

  // The team rows above were just rebuilt from scratch, so every
  // row-status pill and CFB/EPL record chip starts blank again —
  // repaint them from whatever's already cached (same as the boot
  // sequence below) rather than leaving this drafter's roster blank
  // until the staggered background refresh or the standings TTLs
  // happen to reach it.
  for(const teamKey of Object.keys(liveDataCache)){
    if(TEAM_META[teamKey]) renderRowStatus(teamKey, liveDataCache[teamKey]);
  }
  renderAllCfbCardRecords();
  renderAllEplCardRecords();
  renderAllNflCardRecords();
  renderAllNbaCardRecords();
  renderAllNhlCardRecords();
  renderAllMlbCardRecords();
  renderAllWnbaCardRecords();
  renderAllCbbCardRecords();
}

// Spelled out in both the Teams tab's section headers and the
// Standings header — the filter chips still keep the short
// LEAGUES[].label as-is (see FILTER_CHIP_LABELS below). Also used by
// the Scoring modal header and the admin page (js/admin.js) so every
// "EPL"/"College FB"/"College BB" data.name reads as its full name
// wherever a header titles itself after the league.
export const LEAGUE_FULL_LABELS = {
  epl: 'English Premier League',
  cfb: 'College Football',
  mcbb: 'College Basketball'
};

// Shortened further still for the filter chip row only — the Teams
// tab's league jump-to chips, the Standings tab's league filter chips,
// and the admin page's (js/admin.js). Every other use of a league's
// label (Board section headers, the Standings header above, modal
// titles) keeps LEAGUES[].label.
export const FILTER_CHIP_LABELS = {
  cfb: 'CFB',
  mcbb: 'CBB'
};

function leagueBlockHtml(league, bodyHtml){
  const headerLabel = LEAGUE_FULL_LABELS[league.key] || league.label;
  // MLB/WNBA: the records below are ESPN's real, live '26 standings —
  // still worth showing — but drafted teams don't start scoring until
  // the '27 season actually begins. See PRIOR_SEASON_DISPLAY_LEAGUES
  // in js/data.js.
  const priorSeasonNoteHtml = PRIOR_SEASON_DISPLAY_LEAGUES.includes(league.key)
    ? `<div class="prior-season-note">Showing the '26 season, still in progress — points won't count until the '27 season.</div>`
    : '';

  return `
    <div class="league">
      <div class="league-tab standings-league-tab">
        <div class="league-tab-top">
          <div class="league-tab-left">${headerLabel}</div>
          <span class="n">${league.season}</span>
        </div>
        ${priorSeasonNoteHtml}
      </div>
      ${bodyHtml}
    </div>
  `;
}

// Shared render body for the 4 "flat" ESPN-standings leagues (NBA/NHL/
// MLB/WNBA) — conference/league toggle + Person, plus (for NBA/NHL/MLB,
// api.hasDivisions true) a nested Divisions-vs-Conference sub-toggle
// under each conference, same idea NFL pioneered in its own bespoke
// block below before this was generalized. WNBA has no real divisions,
// so api.hasDivisions is false there and this behaves exactly as it
// did before division support existed. Each api bundle is just that
// league's own exports from js/standings-flat.js (see js/standings-nba.js
// etc.) — this only knows the shape they all share, not any
// sport-specific detail.
function renderFlatLeagueBlock(league, api){
  const mode = api.getMode();
  let bodyHtml;

  const usesDivisionCache = api.hasDivisions && mode !== 'byDrafter' && api.getConferenceSubMode() === 'division';

  if(usesDivisionCache){
    const confAbbr = api.conferences.find(c => c.mode === mode).abbr;
    if(api.divisionCache.divisions){
      const divisions = api.computeDivisionStandings(confAbbr);
      const rowsHtml = divisions.length
        ? divisions.map(div =>
            api.renderGroupHeader(div.name) + div.teams.map((t, i) => api.renderStandingsRow(t, i + 1)).join('')
          ).join('')
        : `<div class="no-live-note">No teams currently reporting.</div>`;
      bodyHtml = api.toggleHtml() + rowsHtml;
      api.fetchDivisionCached(); // no-op if already fresh; quietly refreshes in the background if stale
    } else if(api.divisionCache.error){
      bodyHtml = `<div class="no-live-note">No data available.</div>`;
    } else {
      api.fetchDivisionCached();
      bodyHtml = skeletonRowsHtml();
    }
  } else if(mode === 'byDrafter'){
    if(api.cache.rows){
      const rowsHtml = api.computeDrafterCombined().map((row, i) => api.renderByDrafterRow(row, i + 1)).join('');
      bodyHtml = api.toggleHtml() + rowsHtml;
      api.fetchCached(); // no-op if already fresh; quietly refreshes in the background if stale
    } else if(api.cache.error){
      bodyHtml = `<div class="no-live-note">No data available.</div>`;
    } else {
      api.fetchCached();
      bodyHtml = skeletonRowsHtml();
    }
  } else if(api.cache.rows){
    const confAbbr = api.conferences.find(c => c.mode === mode).abbr;
    const teams = api.computeConferenceStandings(confAbbr);
    const rowsHtml = teams.length
      ? teams.map((t, i) => api.renderStandingsRow(t, i + 1)).join('')
      : `<div class="no-live-note">No teams currently reporting.</div>`;
    bodyHtml = api.toggleHtml() + rowsHtml;
    api.fetchCached();
  } else if(api.cache.error){
    bodyHtml = `<div class="no-live-note">No data available.</div>`;
  } else {
    api.fetchCached();
    bodyHtml = skeletonRowsHtml();
  }
  return leagueBlockHtml(league, bodyHtml);
}

// Which league the Standings view is isolated to — like eplStandingsMode
// in js/standings-epl.js, this isn't persisted to localStorage, so it
// resets to "All" each time you open the app with no URL state of its
// own. It IS mirrored into ?league= (see applyUrlState) so a specific
// league's Standings view is still bookmarkable/shareable, just not
// "sticky" the way the drafter picker is.
let standingsFilterKey = 'all';

export function setStandingsFilter(key){
  standingsFilterKey = key;
  updateUrlParam('league', key === 'all' ? null : key);
  renderStandings();
}
window.setStandingsFilter = setStandingsFilter;

export function renderStandings(){
  const container = document.getElementById('standings-content');
  if(!container) return;

  const chipsHtml = ['all'].concat(LEAGUES.map(l => l.key)).map(key => {
    const label = key === 'all' ? 'All' : (FILTER_CHIP_LABELS[key] || LEAGUES.find(l => l.key === key).label);
    return `<div class="filter-chip ${key === standingsFilterKey ? 'active' : ''}" onclick="setStandingsFilter('${key}')">${label}</div>`;
  }).join('');

  const shownLeagues = standingsFilterKey === 'all' ? LEAGUES : LEAGUES.filter(l => l.key === standingsFilterKey);

  const blocksHtml = shownLeagues.map(league => {
    if(league.key === 'epl'){
      let bodyHtml;
      if(eplStandingsCache.table){
        const rowsHtml = eplStandingsMode === 'byDrafter'
          ? computeEplDrafterCombined().map((row, i) => renderEplByDrafterRow(row, i + 1)).join('')
          : eplStandingsCache.table.map(row => renderStandingsRow('epl', row)).join('');
        bodyHtml = eplStandingsToggleHtml() + rowsHtml;
        fetchEplStandingsTable(); // no-op if already fresh; quietly refreshes in the background if stale
      } else if(eplStandingsCache.error){
        bodyHtml = `<div class="no-live-note">No data available.</div>`;
      } else {
        fetchEplStandingsTable();
        bodyHtml = skeletonRowsHtml();
      }
      return leagueBlockHtml(league, bodyHtml);
    }

    if(league.key === 'cfb'){
      // Each mode has its own ESPN cache — the AP Top 25 (rankings) and
      // "Person" (full-roster records) are two different ESPN endpoints
      // (js/standings-cfb.js's header comment), so each is gated on its
      // own cache rather than one shared check. fetchCfbRecords (the
      // TheRundown fallback for CFB's one FCS team, NDSU) rides along
      // with the ESPN fetch rather than gating readiness itself, since
      // ESPN alone already covers 29 of 30 drafted teams.
      let bodyHtml;
      if(cfbStandingsMode === 'byDrafter'){
        if(espnCfbRecordsCache.rows){
          const rowsHtml = computeCfbDrafterCombined().map((row, i) => renderCfbByDrafterRow(row, i + 1)).join('');
          bodyHtml = cfbStandingsToggleHtml() + rowsHtml;
          fetchEspnCfbRecordsCached(); // no-op if already fresh; quietly refreshes in the background if stale
          fetchCfbRecords();
        } else if(espnCfbRecordsCache.error){
          bodyHtml = `<div class="no-live-note">No data available.</div>`;
        } else {
          fetchEspnCfbRecordsCached();
          fetchCfbRecords();
          bodyHtml = skeletonRowsHtml();
        }
      } else {
        if(espnCfbRankingsCache.ranks){
          const rankingRows = computeCfbRankingTable();
          const rowsHtml = rankingRows.length
            ? rankingRows.map(rank => renderCfbRankingRow(rank)).join('')
            : `<div class="no-live-note">No teams currently ranked.</div>`;
          bodyHtml = cfbStandingsToggleHtml() + rowsHtml;
          fetchEspnCfbRankingsCached(); // no-op if already fresh; quietly refreshes in the background if stale
        } else if(espnCfbRankingsCache.error){
          bodyHtml = `<div class="no-live-note">No data available.</div>`;
        } else {
          fetchEspnCfbRankingsCached();
          bodyHtml = skeletonRowsHtml();
        }
      }
      return leagueBlockHtml(league, bodyHtml);
    }

    if(league.key === 'mcbb'){
      // Same Rank/Person split as CFB above, for the same reason (365 D1
      // teams across 31 conferences has no useful single "League" table
      // view) — see js/standings-cbb.js's header comment. Unlike CFB,
      // there's no TheRundown fallback fetch riding along here: every
      // drafted mcbb team resolves off the one bulk ESPN standings call.
      let bodyHtml;
      if(cbbStandingsMode === 'byDrafter'){
        if(espnCbbStandingsCache.rows){
          const rowsHtml = computeCbbDrafterCombined().map((row, i) => renderCbbByDrafterRow(row, i + 1)).join('');
          bodyHtml = cbbStandingsToggleHtml() + rowsHtml;
          fetchEspnCbbStandingsCached(); // no-op if already fresh; quietly refreshes in the background if stale
        } else if(espnCbbStandingsCache.error){
          bodyHtml = `<div class="no-live-note">No data available.</div>`;
        } else {
          fetchEspnCbbStandingsCached();
          bodyHtml = skeletonRowsHtml();
        }
      } else {
        if(espnCbbRankingsCache.ranks){
          const rankingRows = computeCbbRankingTable();
          const rowsHtml = rankingRows.length
            ? rankingRows.map(rank => renderCbbRankingRow(rank)).join('')
            : `<div class="no-live-note">No teams currently ranked.</div>`;
          bodyHtml = cbbStandingsToggleHtml() + rowsHtml;
          fetchEspnCbbRankingsCached(); // no-op if already fresh; quietly refreshes in the background if stale
        } else if(espnCbbRankingsCache.error){
          bodyHtml = `<div class="no-live-note">No data available.</div>`;
        } else {
          fetchEspnCbbRankingsCached();
          bodyHtml = skeletonRowsHtml();
        }
      }
      return leagueBlockHtml(league, bodyHtml);
    }

    if(league.key === 'nfl'){
      // Nested: pick AFC/NFC/Person first, then (for AFC/NFC) Divisions
      // vs. that conference's Full ranking — see js/standings-nfl.js's
      // header comment. "Divisions" reads the much heavier
      // espnNflDivisionCache (9 requests instead of 1); "Full
      // Conference" and "Person" both just need a team's own record
      // with no per-division grouping, so they share the cheap flat
      // espnNflStandingsCache — this split is about which ESPN cache is
      // cheap enough for the job, same idea as before, just nested now.
      const usesDivisionCache = nflStandingsMode !== 'byDrafter' && nflConferenceSubMode === 'division';
      let bodyHtml;
      if(usesDivisionCache){
        const conferenceAbbr = nflStandingsMode.toUpperCase();
        if(espnNflDivisionCache.divisions){
          const divisions = computeNflDivisionStandings(conferenceAbbr);
          const rowsHtml = divisions.length
            ? divisions.map(div =>
                renderNflGroupHeader(div.name) + div.teams.map((t, i) => renderNflStandingsRow(t, i + 1)).join('')
              ).join('')
            : `<div class="no-live-note">No teams currently reporting.</div>`;
          bodyHtml = nflStandingsToggleHtml() + rowsHtml;
          fetchEspnNflDivisionStandingsCached(); // no-op if already fresh; quietly refreshes in the background if stale
        } else if(espnNflDivisionCache.error){
          bodyHtml = `<div class="no-live-note">No data available.</div>`;
        } else {
          fetchEspnNflDivisionStandingsCached();
          bodyHtml = skeletonRowsHtml();
        }
      } else {
        if(espnNflStandingsCache.rows){
          let rowsHtml;
          if(nflStandingsMode === 'byDrafter'){
            rowsHtml = computeNflDrafterCombined().map((row, i) => renderNflByDrafterRow(row, i + 1)).join('');
          } else {
            const conferenceAbbr = nflStandingsMode.toUpperCase();
            const teams = computeNflConferenceStandings(conferenceAbbr);
            rowsHtml = teams.length
              ? teams.map((t, i) => renderNflStandingsRow(t, i + 1)).join('')
              : `<div class="no-live-note">No teams currently reporting.</div>`;
          }
          bodyHtml = nflStandingsToggleHtml() + rowsHtml;
          fetchEspnNflStandingsCached(); // no-op if already fresh; quietly refreshes in the background if stale
        } else if(espnNflStandingsCache.error){
          bodyHtml = `<div class="no-live-note">No data available.</div>`;
        } else {
          fetchEspnNflStandingsCached();
          bodyHtml = skeletonRowsHtml();
        }
      }
      return leagueBlockHtml(league, bodyHtml);
    }

    if(league.key === 'nba') return renderFlatLeagueBlock(league, {
      cache: espnNbaStandingsCache, fetchCached: fetchEspnNbaStandingsCached, getMode: getNbaStandingsMode,
      conferences: nbaConferences, computeConferenceStandings: computeNbaConferenceStandings,
      renderStandingsRow: renderNbaStandingsRow, computeDrafterCombined: computeNbaDrafterCombined,
      renderByDrafterRow: renderNbaByDrafterRow, toggleHtml: nbaStandingsToggleHtml,
      hasDivisions: nbaHasDivisions, divisionCache: espnNbaDivisionCache, fetchDivisionCached: fetchEspnNbaDivisionStandingsCached,
      computeDivisionStandings: computeNbaDivisionStandings, renderGroupHeader: renderNbaGroupHeader,
      getConferenceSubMode: getNbaConferenceSubMode
    });
    if(league.key === 'nhl') return renderFlatLeagueBlock(league, {
      cache: espnNhlStandingsCache, fetchCached: fetchEspnNhlStandingsCached, getMode: getNhlStandingsMode,
      conferences: nhlConferences, computeConferenceStandings: computeNhlConferenceStandings,
      renderStandingsRow: renderNhlStandingsRow, computeDrafterCombined: computeNhlDrafterCombined,
      renderByDrafterRow: renderNhlByDrafterRow, toggleHtml: nhlStandingsToggleHtml,
      hasDivisions: nhlHasDivisions, divisionCache: espnNhlDivisionCache, fetchDivisionCached: fetchEspnNhlDivisionStandingsCached,
      computeDivisionStandings: computeNhlDivisionStandings, renderGroupHeader: renderNhlGroupHeader,
      getConferenceSubMode: getNhlConferenceSubMode
    });
    if(league.key === 'mlb') return renderFlatLeagueBlock(league, {
      cache: espnMlbStandingsCache, fetchCached: fetchEspnMlbStandingsCached, getMode: getMlbStandingsMode,
      conferences: mlbConferences, computeConferenceStandings: computeMlbConferenceStandings,
      renderStandingsRow: renderMlbStandingsRow, computeDrafterCombined: computeMlbDrafterCombined,
      renderByDrafterRow: renderMlbByDrafterRow, toggleHtml: mlbStandingsToggleHtml,
      hasDivisions: mlbHasDivisions, divisionCache: espnMlbDivisionCache, fetchDivisionCached: fetchEspnMlbDivisionStandingsCached,
      computeDivisionStandings: computeMlbDivisionStandings, renderGroupHeader: renderMlbGroupHeader,
      getConferenceSubMode: getMlbConferenceSubMode
    });
    if(league.key === 'wnba'){
      // Flat league-wide ranking, same shape as EPL's block above — no
      // conference split (see js/standings-wnba.js's header comment for
      // why it no longer shares NBA/NHL/MLB's js/standings-flat.js
      // machinery).
      let bodyHtml;
      if(espnWnbaStandingsCache.table){
        const rowsHtml = wnbaStandingsMode === 'byDrafter'
          ? computeWnbaDrafterCombined().map((row, i) => renderWnbaByDrafterRow(row, i + 1)).join('')
          : espnWnbaStandingsCache.table.map((row, i) => renderWnbaStandingsRow(row, i + 1)).join('');
        bodyHtml = wnbaStandingsToggleHtml() + rowsHtml;
        fetchEspnWnbaStandingsCached(); // no-op if already fresh; quietly refreshes in the background if stale
      } else if(espnWnbaStandingsCache.error){
        bodyHtml = `<div class="no-live-note">No data available.</div>`;
      } else {
        fetchEspnWnbaStandingsCached();
        bodyHtml = skeletonRowsHtml();
      }
      return leagueBlockHtml(league, bodyHtml);
    }

    return leagueBlockHtml(league, `<div class="no-live-note">No data available.</div>`);
  }).join('');

  container.innerHTML = `
    <div class="standings-filter-row"><div class="filter-chips">${chipsHtml}</div></div>
    <div class="standings-grid">${blocksHtml}</div>
  `;
}

// ---- Bottom tab navigation ----

export function switchView(view){
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  updateUrlParam('view', view === 'board' ? null : view);
  setChatActive(view === 'chat');
  if(view === 'live-now'){ resetTodayDay(); renderLiveNow(); }
  if(view === 'standings') renderStandings();
  if(view === 'overall') renderOverallStandings();
  if(view === 'admin') renderAdminPage();
  if(view === 'scoring') renderScoringPage();
}
window.switchView = switchView;

// ---- Boot ----

const buildTagEl = document.getElementById('build-tag');
if(buildTagEl) buildTagEl.textContent = APP_VERSION;

LEAGUE_FACTS_LEAGUES.forEach(migrateAchievementsToFacts);
loadLiveDataCache();
loadEplStandingsCache();
loadCfbRecordsCache();
loadEspnCfbRankingsCache();
loadEspnCfbRecordsCache();
loadEspnNflStandingsCache();
loadEspnNflDivisionCache();
loadNflverseCaches();
loadEspnNbaStandingsCache();
loadEspnNbaDivisionCache();
loadEspnNhlStandingsCache();
loadEspnNhlDivisionCache();
loadEspnMlbStandingsCache();
loadEspnMlbDivisionCache();
loadEspnWnbaStandingsCache();
loadEspnCbbRankingsCache();
loadEspnCbbStandingsCache();
loadSeasonPhaseCache();
loadTeamInfoCache();
renderBoard();
paintIdentityChrome(currentDraftTeamId);
initChat();
applyUrlState();
maybeShowWelcome();
startActivity();

// renderBoard() already repaints row-status pills and CFB/EPL/NFL
// record chips from whatever's cached (possibly from a previous
// browser session), so nothing sits blank waiting for its turn in the
// staggered refresh below. Still need to kick off the actual records
// fetches here, regardless of whether the Standings tab (the only
// other place that calls these) has been opened yet, so the board's
// records aren't stuck waiting on that.
fetchCfbRecords();
fetchEspnCfbRecordsCached();
fetchEplStandingsTable();
fetchEspnNflStandingsCached();
fetchEspnNbaStandingsCached();
fetchEspnNhlStandingsCached();
fetchEspnMlbStandingsCached();
fetchEspnWnbaStandingsCached();

// NFL/NBA/NHL/MLB's division tables used to be fetched lazily (only
// once the Standings tab's Divisions view or a team modal in that
// league was opened) — now that LEAGUE_SCORING's Division title/Last
// place rules read them too (js/league-facts.js's rankAutoTables),
// those rules would sit "Pending" on the admin page and undercount
// every drafter's points until something happened to trigger one of
// those lazy paths. Fetched eagerly here for the same reason the flat
// standings above already are.
fetchEspnNflDivisionStandingsCached();
fetchEspnNbaDivisionStandingsCached();
fetchEspnNhlDivisionStandingsCached();
fetchEspnMlbDivisionStandingsCached();
fetchEspnCbbRankingsCached();
fetchEspnCbbStandingsCached();

// Season phase (js/season-phase.js) backs both the team modal's season
// badge and, via checkSeasonLocks just below, whether a league's
// regular-season rankAuto rules should already be frozen — eager here
// for the same "don't wait on some other tab being opened first" reason
// as the standings caches above.
SEASON_PHASE_LEAGUES.forEach(fetchSeasonPhaseCached);
// One-time-per-league check: has each league's regular season actually
// ended, and if so, lock in its rankAuto rules (js/season-lock.js) —
// already-locked leagues return immediately, so this is cheap on every
// normal boot. Deliberately not awaited — nothing else in this boot
// sequence depends on it finishing, and its own persistLock re-renders
// whatever needs it once a lock actually happens.
checkSeasonLocks();

// Both ticks below already patch the Teams tab's own row-status pills
// and an open team modal in place (see js/live-data.js) — Live Now
// needs the same treatment, since it's a second screen reading the
// exact same liveDataCache rather than its own fetch loop. Cheap to
// just re-run its render whenever it's the active view: it's a sweep
// over already-cached data, not a fetch.
function isLiveNowActive(){
  const el = document.getElementById('view-live-now');
  return !!el && el.classList.contains('active');
}

async function backgroundRefreshAndPaint(){
  await backgroundRefreshTick();
  if(isLiveNowActive()) renderLiveNow();
}
backgroundRefreshAndPaint();
setInterval(backgroundRefreshAndPaint, REFRESH_STEP_MS);

// Keeps live scores/final results current in between backgroundRefreshTick's
// slower per-team rotation — see liveScoreboardSweepTick's own header
// comment in js/live-data.js for why this is a separate, faster loop
// instead of just shortening the rotation above.
async function liveSweepAndPaint(){
  await liveScoreboardSweepTick();
  if(isLiveNowActive()) renderLiveNow();
}
liveSweepAndPaint();
setInterval(liveSweepAndPaint, LIVE_SWEEP_INTERVAL_MS);

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
