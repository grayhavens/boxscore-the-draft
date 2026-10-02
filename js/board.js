/* ============================================================
   Board rendering, the drafter picker, tab navigation, URL state,
   and the Standings-tab orchestration that ties the EPL/CFB modules
   together. Also the app's boot sequence — this is the last script
   loaded, so it runs after every other module has registered its
   window.* entry points for the inline onclick handlers in the
   rendered HTML.
   ============================================================ */
import { DRAFT_TEAMS, TEAM_META, LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT } from './data.js';
import { updateUrlParam, teamBadgeHtml, skeletonRowsHtml, CHECK_ICON_SVG } from './utils.js';
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
import { renderOverallStandings, setObMode, obEnterView, obOpenSegment } from './overall.js';
import { renderAllPgaCardRecords, pgaStandingsBodyHtml, loadGolf, refreshGolfLive } from './golf-view.js';
import { startActivity } from './activity.js';
import { startHistory } from './history.js';
import { loadLiveDataCache, loadTeamInfoCache, renderRowStatus, backgroundRefreshTick, REFRESH_STEP_MS, liveDataCache, liveScoreboardSweepTick, LIVE_SWEEP_INTERVAL_MS } from './live-data.js';
import { loadSeasonPhaseCache, fetchSeasonPhaseCached, SEASON_PHASE_LEAGUES } from './season-phase.js';
import { checkSeasonLocks, primeFrozenSnapshots } from './season-lock.js';
import { isLeagueFrozen } from './frozen-cache.js';
import { paintSeasonBanner } from './season-switcher.js';
import { initDraftLive } from './draft-live.js';
import { initDraftSchedule, onDraftSchedule, getDraftSchedule, isDraftUpcoming, isDraftPollOpen, voteDraftPoll, scheduleDateLabel, scheduleTimeLabel, scheduleRelativeLabel } from './draft-schedule.js';
import { pollTally } from './draft-poll.js';
import { ACTIVE_SEASON_ID, ACTIVE_SEASON } from './season.js';
import { ACTIVE_GROUP } from './group.js';
import { renderLiveNow, resetTodayDay } from './live-now.js';
import { openTeamPage, settleTeamTransition } from './team-page.js';
import { showAdminPage } from './admin.js';
import { openScoringSheet, setScoringRules } from './scoring-sheet.js';
import { FILTER_CHIP_LABELS } from './league-labels.js';
import { getSettings } from './settings.js';
import { currentProfileId, paintIdentityChrome, maybeShowWelcome, renderSettingsPage } from './identity.js';
import { renderGuidePage } from './guide.js';
import { initChat, setChatActive, paintBadges as paintChatBadges } from './chat.js';
import { syncPushDevice } from './push.js';
import { favoriteMarkHtml, isFavorite } from './favorites.js';
import { navigate, enableNavMotion } from './motion.js';

import { teamRowHtml } from './ui.js';
import { initPullToRefresh } from './pull-refresh.js';
import { expireCaches } from './cache-fresh.js';
// The scoring sheet shows this group's rules. Set before anything can open
// it: the Points button, the guide, the draft room, ?view=scoring below.
setScoringRules(LEAGUES, LEAGUE_SCORING);

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

  // ?view=scoring was a page; the rules are a sheet over Points now.
  if(explicitView === 'scoring'){
    switchView('overall');
    openScoringSheet();
    return;
  }

  const view = (explicitView === 'board' || explicitView === 'live-now' || explicitView === 'standings' || explicitView === 'overall' || explicitView === 'chat' || explicitView === 'draft' || explicitView === 'admin' || explicitView === 'settings' || explicitView === 'guide')
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
  renderStandings();
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

// Before a group's first draft its board has nothing on it, so Home
// leads with the way into the draft instead. Keyed off preDraft, so it
// disappears on its own once the draft is exported into a real class.
// Any group, drafted before or not, also gets it while a live draft the
// commissioner scheduled is still ahead (js/draft-schedule.js), or while
// they're polling for a time (js/draft-poll.js).
function draftPollOptionHtml(arg, on, title, sub, count){
  return `
    <button type="button" class="draft-poll-opt" aria-pressed="${on}" onclick="toggleDraftPollVote(${arg})">
      <span class="draft-poll-check">${CHECK_ICON_SVG}</span>
      <span class="draft-poll-text"><span class="draft-poll-title">${title}</span>${sub ? `<span class="draft-poll-sub">${sub}</span>` : ''}</span>
      <span class="draft-poll-count">${count}</span>
    </button>`;
}

// Unclaimed roster spots can't answer, so they aren't counted as waiting.
function draftPollHtml(poll){
  const roster = DRAFT_TEAMS.filter(d => !d.open).map(d => d.id);
  const tally = pollTally(poll, roster);
  const mine = poll.votes[currentProfileId];
  const optionsHtml = tally.options.map(o => draftPollOptionHtml(
    o.at, !!mine && mine.includes(o.at), scheduleDateLabel(o.at), scheduleTimeLabel(o.at), `${o.voters.length} in`
  )).join('');
  const noneHtml = draftPollOptionHtml(
    'null', !!mine && !mine.length, 'None of these work', '', tally.none.length ? `${tally.none.length} out` : ''
  );
  return `
    <div class="draft-when draft-poll">
      <div class="draft-when-label">Live draft</div>
      <div class="draft-when-date">When can you draft?</div>
      <div class="draft-when-time">Tap every time you can make. The commissioner picks the final one.</div>
      <div class="draft-poll-opts">${optionsHtml}${noneHtml}</div>
      <div class="draft-poll-foot">${roster.length - tally.waiting.length} of ${roster.length} have answered${mine ? '' : ' &middot; you haven&rsquo;t yet'}</div>
    </div>`;
}

// A time toggles in or out of this drafter's answer; null is "none of
// these work". Unpicking the last thing takes the answer back entirely.
window.toggleDraftPollVote = function(at){
  const { poll } = getDraftSchedule();
  if(!poll) return;
  const mine = poll.votes[currentProfileId];
  let picks;
  if(at === null) picks = mine && !mine.length ? null : [];
  else if(mine && mine.includes(at)) picks = mine.length > 1 ? mine.filter(x => x !== at) : null;
  else picks = (mine || []).concat(at);
  voteDraftPoll(currentProfileId, picks);
};

function draftWhenHtml(){
  const { scheduledAt, poll } = getDraftSchedule();
  if(isDraftPollOpen()) return draftPollHtml(poll);
  if(!isDraftUpcoming()){
    return `
      <div class="draft-when" data-set="false">
        <div class="draft-when-label">Live draft</div>
        <div class="draft-when-date">Date to be set</div>
        <div class="draft-when-time">The commissioner will pick a time</div>
      </div>`;
  }
  return `
    <div class="draft-when">
      <div class="draft-when-top">
        <div class="draft-when-label">Live draft</div>
        <div class="draft-when-rel">${scheduleRelativeLabel(scheduledAt)}</div>
      </div>
      <div class="draft-when-date">${scheduleDateLabel(scheduledAt)}</div>
      <div class="draft-when-time">${scheduleTimeLabel(scheduledAt)}</div>
    </div>`;
}

function renderDraftHome(){
  const el = document.getElementById('draft-home');
  if(!el) return;
  const pre = !!ACTIVE_SEASON.preDraft;
  el.innerHTML = (pre || isDraftUpcoming() || isDraftPollOpen()) ? `
    <section class="draft-home">
      <div class="draft-home-head">
        <div class="draft-home-title">Draft</div>
        ${pre ? '<div class="draft-home-sub">Your teams show up here once the draft is done.</div>' : ''}
      </div>
      ${draftWhenHtml()}
      <button type="button" class="set-row" onclick="goToMyMockDraft()">
        <span class="set-row-text"><span class="set-row-title">Mock Draft</span><span class="set-row-sub">Your own practice room &middot; picks don&rsquo;t count</span></span>
        <span class="set-chev">&rsaquo;</span>
      </button>
      <button type="button" class="set-row" onclick="goToDraftRoom('main')">
        <span class="set-row-text"><span class="set-row-title">Live Draft</span><span class="set-row-sub">The real draft lobby</span></span>
        <span class="set-chev">&rsaquo;</span>
      </button>
    </section>` : '';
}
onDraftSchedule(renderDraftHome);

export function renderBoard(){
  const chipsEl = document.getElementById('filter-chips');
  const leaguesEl = document.getElementById('leagues');

  renderDraftHome();

  // A league shown without being drafted (js/sports.js) has nothing of
  // yours on Home until you favorite something in it.
  const boardLeagues = LEAGUES.filter(l => !l.scoresOnly || teamsForCurrentDraftTeam(l).length);
  if(boardFilterKey !== 'all' && !boardLeagues.some(l => l.key === boardFilterKey)) boardFilterKey = 'all';
  chipsEl.innerHTML = ['all'].concat(boardLeagues.map(l => l.key)).map(key => {
    const label = key === 'all' ? 'All' : (FILTER_CHIP_LABELS[key] || LEAGUES.find(l => l.key === key).label);
    return `<div class="filter-chip ${key === boardFilterKey ? 'active' : ''}" onclick="setBoardFilter('${key}')">${label}</div>`;
  }).join('');

  let shownLeagues = boardFilterKey === 'all' ? boardLeagues : boardLeagues.filter(l => l.key === boardFilterKey);
  // Pre-draft, only leagues a favorite put something in are worth a
  // section; the rest would be empty headers under the draft card.
  if(ACTIVE_SEASON.preDraft){
    shownLeagues = shownLeagues.filter(l => teamsForCurrentDraftTeam(l).length);
    chipsEl.hidden = !shownLeagues.length && boardFilterKey === 'all';
  }

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
      const pgaRecordHtml = league.key === 'pga' ? `<span class="cfb-record" id="pga-record-${teamKey}"></span>` : '';
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
        : `${meta.boardSub}${cfbRecordHtml}${nflRecordHtml}${nbaRecordHtml}${nhlRecordHtml}${mlbRecordHtml}${wnbaRecordHtml}${mcbbRecordHtml}${pgaRecordHtml}`;
      // The star is a read-only favorited-status indicator here — it only
      // appears once a team is favorited, and toggling happens solely on
      // the team page.
      return teamRowHtml({
        badgeHtml: teamBadgeHtml(meta),
        name: meta.name,
        subHtml,
        favHtml: isFavorite(teamKey) ? favoriteMarkHtml() : '',
        statusId: `row-status-${teamKey}`,
        onclick: `openTeamPage('${teamKey}', 'board', this)`
      });
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

  document.querySelectorAll('[data-group-name]').forEach(el => { el.textContent = ACTIVE_GROUP.name; });

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
  renderAllPgaCardRecords();
  loadGolf();
  renderAllCbbCardRecords();
}

// Spelled out in both the Teams tab's section headers and the
// Standings header — the filter chips still keep the short
// LEAGUES[].label as-is (see FILTER_CHIP_LABELS in js/league-labels.js). Also used by
// the Scoring modal header and the admin page (js/admin.js) so every
// "EPL"/"College FB"/"College BB" data.name reads as its full name
// wherever a header titles itself after the league.
export const LEAGUE_FULL_LABELS = {
  epl: 'English Premier League',
  cfb: 'College Football',
  mcbb: 'College Basketball'
};


// 2026 -> "26": the draft class's year, as the season labels write it.
const shortYear = y => String(y).slice(-2);

function leagueBlockHtml(league, bodyHtml){
  const headerLabel = LEAGUE_FULL_LABELS[league.key] || league.label;
  // MLB/WNBA: the records below are ESPN's real, live '26 standings —
  // still worth showing — but drafted teams don't start scoring until
  // the '27 season actually begins. See PRIOR_SEASON_DISPLAY_LEAGUES
  // in js/data.js.
  const priorSeasonNoteHtml = PRIOR_SEASON_DISPLAY_LEAGUES.includes(league.key) && league.key !== 'pga'
    ? `<div class="prior-season-note">Showing the '${shortYear(ACTIVE_SEASON_ID)} season, still in progress — points won't count until the '${shortYear(Number(ACTIVE_SEASON_ID) + 1)} season.</div>`
    : '';
  const frozenNoteHtml = isLeagueFrozen(league.key)
    ? `<div class="prior-season-note">Final standings — this draft class's season is over, so these are its saved end-of-season numbers.</div>`
    : '';

  return `
    <div class="league">
      <div class="league-tab standings-league-tab">
        <div class="league-tab-top">
          <div class="league-tab-left">${headerLabel}</div>
          <span class="n">${league.season}</span>
        </div>
        ${priorSeasonNoteHtml}${frozenNoteHtml}
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

function isViewActive(view){
  const el = document.getElementById('view-' + view);
  return !!el && el.classList.contains('active');
}

// Every standings/rankings cache calls this when one of its fetches
// settles. Boot settles ~15 of them at once, so this batches them into
// one repaint per frame, and only repaints the views that read those
// tables and are actually open (showView renders a view fresh on entry).
let standingsRepaintQueued = false;
export function standingsDataChanged(){
  if(standingsRepaintQueued) return;
  standingsRepaintQueued = true;
  requestAnimationFrame(() => {
    standingsRepaintQueued = false;
    renderStandings();
    if(isViewActive('overall')) renderOverallStandings();
  });
}

export function renderStandings(){
  const container = document.getElementById('standings-content');
  if(!container || !isViewActive('standings')) return;

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
    // PGA Tour: the FedEx Cup table (js/golf-view.js).
    if(league.key === 'pga') return leagueBlockHtml(league, pgaStandingsBodyHtml());

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

// The draft room (js/draft.js and the pool, scouting, outlooks and
// spreadsheet code under it, about a third of the app's script) loads the
// first time it opens rather than at every launch. Once the app is idle
// its files are fetched ahead (modulepreload: downloaded and compiled,
// not run), so the first open is still quick.
let draftModule = null;
function setDraftActive(on){
  if(!on && !draftModule) return;
  if(!draftModule) draftModule = import('./draft.js');
  // Both directions chain on the one import, so they land in order.
  draftModule.then(m => m.setDraftActive(on), e => { console.error('[Draft] failed to load', e); draftModule = null; });
}
function preloadDraftRoom(){
  if(draftModule) return;
  const link = document.createElement('link');
  link.rel = 'modulepreload';
  link.href = new URL('./draft.js', import.meta.url).href;
  document.head.appendChild(link);
}

// Tab bar order, left to right: a switch between two of these slides
// toward the tapped tab (see js/motion.js); any other switch (Draft,
// Admin, Scoring, or leaving one of those) crossfades instead.
const TAB_ORDER = ['board', 'live-now', 'chat', 'standings', 'overall'];

export function switchView(view){
  settleTeamTransition();
  const activeTab = document.querySelector('.tab-btn.active');
  const from = TAB_ORDER.indexOf(activeTab ? activeTab.dataset.view : '');
  const to = TAB_ORDER.indexOf(view);
  const kind = from < 0 || to < 0 || from === to ? null : (to > from ? 'fwd' : 'back');
  navigate(kind, () => showView(view));
}
window.switchView = switchView;

function showView(view){
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  paintTabPill(view);
  updateUrlParam('view', view === 'board' ? null : view);
  // A tab tapped from the team page leaves it behind.
  updateUrlParam('tp', null);
  setChatActive(view === 'chat');
  setDraftActive(view === 'draft');
  if(view === 'live-now'){ resetTodayDay(); renderLiveNow(); }
  if(view === 'standings') renderStandings();
  if(view === 'overall'){ obEnterView(); renderOverallStandings(); }
  else updateUrlParam('seg', null);
  if(view === 'admin') showAdminPage();
  else updateUrlParam('screen', null);
  if(view === 'settings') renderSettingsPage(SETTINGS_BACK_LABELS[settingsOrigin] || 'Back');
  if(view === 'guide') renderGuidePage();
}

// ---- Settings page ----
// The header gear pushes Settings in like the team page, and its back
// button pops to whichever view the gear was tapped on, at the same
// scroll position. A ?view=settings deep link has no origin, so back
// lands on Teams.
let settingsOrigin = 'board';
let settingsOriginScrollY = 0;
// What Settings' back button says: the page it returns to.
const SETTINGS_BACK_LABELS = {
  'board': 'Home', 'live-now': 'Scores', 'chat': 'Chat', 'standings': 'Standings',
  'overall': 'Points', 'draft': 'Draft', 'admin': 'Commissioner'
};

export function openSettings(){
  const active = document.querySelector('.view.active');
  const from = active ? active.id.replace(/^view-/, '') : 'board';
  if(from === 'settings') return;
  settingsOrigin = from;
  settingsOriginScrollY = window.scrollY;
  navigate('push', () => {
    showView('settings');
    window.scrollTo(0, 0);
  });
}
window.openSettings = openSettings;

export function closeSettings(){
  // navigate runs the update inside the transition, after this returns.
  const origin = settingsOrigin, y = settingsOriginScrollY;
  settingsOrigin = 'board';
  settingsOriginScrollY = 0;
  navigate('pop', () => {
    showView(origin);
    window.scrollTo(0, y);
  });
}
window.closeSettings = closeSettings;

// Back from a page Settings opened (Commissioner): pops to Settings
// without touching its origin, so Settings' own back still returns to
// the tab the gear was tapped on.
export function backToSettings(){
  navigate('pop', () => {
    showView('settings');
    window.scrollTo(0, 0);
  });
}
window.backToSettings = backToSettings;

// Settings -> How Boxscore works (js/guide.js). Pushed like the team
// page; its back button is backToSettings.
export function openGuide(){
  navigate('push', () => {
    showView('guide');
    window.scrollTo(0, 0);
  });
}
window.openGuide = openGuide;

// The gold pill behind the active tab (.tab-pill) springs to its slot
// via a CSS transition on --tab-i; off the five tabs it fades out.
function paintTabPill(view){
  const bar = document.querySelector('.tab-bar');
  if(!bar) return;
  const i = TAB_ORDER.indexOf(view);
  if(i >= 0) bar.style.setProperty('--tab-i', i);
  bar.classList.toggle('no-pill', i < 0);
}

// ---- Boot ----

// A draft class that isn't the newest reads its finished leagues' final
// standings from their season-lock snapshot instead of ESPN (see
// js/frozen-cache.js) — that has to be in place before any of the
// cache loaders below run. No-op (and no await cost) for the newest class.
await primeFrozenSnapshots();

// Keys from retired storage shapes (the per-team achievements checklist,
// single-blob team caches) and the flags their one-time migrations left.
try {
  const retired = /^teamDashboard(Achievements|LiveDataCache|TeamInfoCache)$|^teamDashboard(Epl)?FactsMigrated/;
  Object.keys(localStorage).filter(k => retired.test(k)).forEach(k => localStorage.removeItem(k));
} catch (e){}
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
// Nothing is broken down by draft team until there's been a draft.
if(PRE_DRAFT) document.getElementById('standings-sub').textContent = 'Real standings for every league';
renderBoard();
paintSeasonBanner();
initDraftLive();
initDraftSchedule();
paintIdentityChrome(currentDraftTeamId);
initChat();
applyUrlState();
enableNavMotion();
(window.requestIdleCallback || (fn => setTimeout(fn, 3000)))(preloadDraftRoom, { timeout: 8000 });
maybeShowWelcome();
startActivity();
startHistory();

// Every standings/rankings/season-phase cache, kicked off regardless of
// which tab is open. Each call is a no-op while its cache is fresh (or
// just failed), so this is cheap to repeat: at boot, whenever the app
// comes back to the foreground, and every STANDINGS_REFRESH_MS while it
// stays open — otherwise a long-open app kept whatever tables it booted
// with until someone happened to open the Standings tab.
const STANDINGS_REFRESH_MS = 15 * 60 * 1000;
// Returns once every fetch it started has settled (pull to refresh waits on it).
function refreshStandingsData(){
  const jobs = [];
  // renderBoard() already repaints row-status pills and CFB/EPL/NFL
  // record chips from whatever's cached (possibly from a previous
  // browser session), so nothing sits blank waiting for its turn in the
  // staggered refresh below. Still need to kick off the actual records
  // fetches here, regardless of whether the Standings tab (the only
  // other place that calls these) has been opened yet, so the board's
  // records aren't stuck waiting on that.
  jobs.push(fetchCfbRecords());
  jobs.push(fetchEspnCfbRecordsCached());
  jobs.push(fetchEplStandingsTable());
  jobs.push(fetchEspnNflStandingsCached());
  jobs.push(fetchEspnNbaStandingsCached());
  jobs.push(fetchEspnNhlStandingsCached());
  jobs.push(fetchEspnMlbStandingsCached());
  jobs.push(fetchEspnWnbaStandingsCached());

  // NFL/NBA/NHL/MLB's division tables used to be fetched lazily (only
  // once the Standings tab's Divisions view or a team modal in that
  // league was opened) — now that LEAGUE_SCORING's Division title/Last
  // place rules read them too (js/league-facts.js's rankAutoTables),
  // those rules would sit "Pending" on the admin page and undercount
  // every drafter's points until something happened to trigger one of
  // those lazy paths. Fetched eagerly here for the same reason the flat
  // standings above already are.
  jobs.push(fetchEspnNflDivisionStandingsCached());
  jobs.push(fetchEspnNbaDivisionStandingsCached());
  jobs.push(fetchEspnNhlDivisionStandingsCached());
  jobs.push(fetchEspnMlbDivisionStandingsCached());
  jobs.push(fetchEspnCbbRankingsCached());
  jobs.push(fetchEspnCbbStandingsCached());

  // Season phase (js/season-phase.js) backs both the team modal's season
  // badge and, via checkSeasonLocks just below, whether a league's
  // regular-season rankAuto rules should already be frozen — eager here
  // for the same "don't wait on some other tab being opened first" reason
  // as the standings caches above.
  jobs.push(...SEASON_PHASE_LEAGUES.map(league => fetchSeasonPhaseCached(league)));
  return Promise.allSettled(jobs);
}
refreshStandingsData();
setInterval(() => { if(document.visibilityState !== 'hidden') refreshStandingsData(); }, STANDINGS_REFRESH_MS);

// One-time-per-league check: has each league's regular season actually
// ended, and if so, lock in its rankAuto rules (js/season-lock.js) —
// already-locked leagues return immediately, so this is cheap on every
// normal boot. Deliberately not awaited — nothing else in this boot
// sequence depends on it finishing, and its own persistLock re-renders
// whatever needs it once a lock actually happens.
checkSeasonLocks();

// Both ticks below already patch Home's row-status pills and an open
// team page in place (see js/live-data.js). Scores reads the scoreboards
// the live sweep refreshes, so that loop re-runs its render while it's
// the active view: a pass over cached data that only writes what changed.
//
// Both loops sit out while the app is hidden (a backgrounded desktop tab
// would otherwise keep fetching all day); coming back runs a sweep at once.
// A tick still waiting on a slow network is left to finish rather than
// stacking another one on top of it every interval.
function paintingLoop(tick, { paintsScores = true } = {}){
  let running = false;
  return async () => {
    if(running || document.visibilityState === 'hidden') return;
    running = true;
    try {
      await tick();
      if(paintsScores && isViewActive('live-now')) renderLiveNow();
    } finally {
      running = false;
    }
  };
}

// Scores reads the day's scoreboards, not team bundles, so a team's
// refetch has nothing to repaint there.
const backgroundRefreshAndPaint = paintingLoop(backgroundRefreshTick, { paintsScores: false });
backgroundRefreshAndPaint();
setInterval(backgroundRefreshAndPaint, REFRESH_STEP_MS);

// Keeps live scores/final results current in between backgroundRefreshTick's
// slower per-team rotation — see liveScoreboardSweepTick's own header
// comment in js/live-data.js for why this is a separate, faster loop
// instead of just shortening the rotation above.
const liveSweepAndPaint = paintingLoop(() => Promise.all([liveScoreboardSweepTick(), refreshGolfLive()]));
liveSweepAndPaint();
setInterval(liveSweepAndPaint, LIVE_SWEEP_INTERVAL_MS);
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState !== 'visible') return;
  liveSweepAndPaint();
  refreshStandingsData();
});

// Pull to refresh (js/pull-refresh.js) on the views that show live data,
// never under an open sheet (lockBodyScroll pins the body). A pull makes
// every cache stale and refetches, then repaints the open view; pulls
// within PULL_FETCH_GAP_MS of the last real one just replay the gesture
// over the data already in, so a few quick pulls can't hammer ESPN. Not
// on the team page: pulling its hero stretches it instead
// (docs/delight-plan.md), and its data refreshes on its own.
const PULL_VIEWS = new Set(['view-board', 'view-live-now', 'view-standings', 'view-overall']);
const PULL_FETCH_GAP_MS = 10 * 1000;
let lastPullFetch = 0;
const activeView = () => document.querySelector('.board > .view.active');
initPullToRefresh({
  view: activeView,
  canPull: () => {
    const view = activeView();
    return !!view && PULL_VIEWS.has(view.id) && document.body.style.position !== 'fixed';
  },
  refresh: async () => {
    if(Date.now() - lastPullFetch > PULL_FETCH_GAP_MS){
      lastPullFetch = Date.now();
      expireCaches();
    }
    await Promise.allSettled([refreshStandingsData(), liveScoreboardSweepTick(), refreshGolfLive()]);
    if(isViewActive('board')) renderBoard();
    if(isViewActive('live-now')) await renderLiveNow();
    if(isViewActive('overall')) renderOverallStandings();
  }
});

if('serviceWorker' in navigator){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    syncPushDevice(currentProfileId);
  });
  // Tapping an alert while the app is already open (sw.js): go straight
  // to the view it's about instead of reloading the page.
  navigator.serviceWorker.addEventListener('message', event => {
    if(!event.data || event.data.type !== 'bx-open-alert') return;
    let target;
    try { target = new URL(event.data.url, location.href); } catch (e){ return; }
    const view = target.searchParams.get('view');
    const room = target.searchParams.get('room');
    const currentRoom = new URLSearchParams(location.search).get('room');
    if(view === 'overall' && target.searchParams.get('seg')) obOpenSegment(target.searchParams.get('seg'));
    else if(view && (view !== 'draft' || room === currentRoom)) switchView(view);
    else location.href = target.href;
  });
}
