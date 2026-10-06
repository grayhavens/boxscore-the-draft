/* ============================================================
   Board rendering, the drafter picker, tab navigation, URL state,
   and the Standings-tab orchestration that ties the EPL/CFB modules
   together. Also the app's boot sequence — this is the last script
   loaded, so it runs after every other module has registered its
   window.* entry points for the inline onclick handlers in the
   rendered HTML.
   ============================================================ */
import { DRAFT_TEAMS, TEAM_META, LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT } from './data.js';
import { updateUrlParam, teamBadgeHtml, skeletonRowsHtml, CHECK_ICON_SVG, standingsOwnerHtml, findCfbTeamKeyByLocation, segmentedControlHtml } from './utils.js';
import { escapeHtml } from './escape.js';
import { standingsHeadHtml, leagueLeaders, overviewRows } from './standings-cols.js';
import { findFlatTeamKey } from './standings-flat.js';
import {
  eplStandingsCache, eplStandingsMode, computeEplDrafterCombined, renderEplByDrafterRow,
  renderStandingsRow, eplStandingsToggleHtml, fetchEplStandingsTable, loadEplStandingsCache,
  renderAllEplCardRecords, findEplTeamKeyByEspnName
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
  loadEspnNflStandingsCache, espnNflDivisionCache, fetchEspnNflDivisionStandingsCached, loadEspnNflDivisionCache,
  findNflTeamKeyByEspnAbbr
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
  espnCbbStandingsCache, fetchEspnCbbStandingsCached, loadEspnCbbStandingsCache, findCbbTeamKeyByEspnId
} from './standings-cbb.js';
import { renderOverallStandings, setObMode, obEnterView, obOpenSegment } from './overall.js';
import { renderAllPgaCardRecords, pgaStandingsBodyHtml, loadGolf, refreshGolfLive, golfMajorHomeHtml, onGolfData } from './golf-view.js';
import { startActivity } from './activity.js';
import { startSince } from './since.js';
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
import { maybeStartPostseasonReveal, postseasonRevealBusy, endPostseasonReveal } from './postseason-reveal.js';
import { replayReveals, postseasonHomeHtml, onPostseasonData, ensurePostseason, postseasonPhase, openPostseason, postseasonFieldSet, postseasonToggleHtml, postseasonCardHtml, postseasonDraftedHtml, resetPostseasonStages, keepPostseason, restorePostseason, ladderWide } from './postseason.js';
import { showAdminPage } from './admin.js';
import { openScoringSheet, setScoringRules } from './scoring-sheet.js';
import { FILTER_CHIP_LABELS, LEAGUE_FULL_LABELS } from './league-labels.js';
import { getSettings } from './settings.js';
import { currentProfileId, paintIdentityChrome, maybeShowWelcome, renderSettingsPage } from './identity.js';
import { renderGuidePage } from './guide.js';
import { initChat, paintBadges as paintChatBadges } from './chat.js';
import { initWide, setRailDrafter, onViewShown, wideChatNav } from './wide.js';
import { isWide, onWideChange } from './wide-query.js';
import { syncPushDevice } from './push.js';
import { favoriteMarkHtml, isFavorite } from './favorites.js';
import { navigate, enableNavMotion } from './motion.js';

import { teamRowHtml, filterTabHtml, revealActiveTab } from './ui.js';
import { initPullToRefresh } from './pull-refresh.js';
import { initBackButton } from './back-button.js';
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
  revealActiveTab(document.getElementById('filter-chips'));
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

// The "playoffs are set" cards (js/postseason.js): one per league whose
// field is set and whose reveal this device hasn't seen yet, then a golf
// major's card (js/golf-view.js) during its week and the week after. The
// postseason cards go first: the only overlap is April, when the NCAA
// Tournament's card is already on its last week. None before the draft:
// with no teams drafted, Home leads with the Draft card instead.
function renderPlayoffsHome(){
  const el = document.getElementById('playoffs-home');
  if(!el) return;
  const html = PRE_DRAFT ? '' : postseasonHomeHtml(LEAGUES.map(l => l.key)) + golfMajorHomeHtml();
  el.innerHTML = html ? `<div class="ps-home-stack">${html}</div>` : '';
}
onPostseasonData(() => { if(isViewActive('board')) renderPlayoffsHome(); });
onGolfData(() => { if(isViewActive('board')) renderPlayoffsHome(); });

// A playoffs card's tap: Standings, on that league, where the reveal plays.
window.openPlayoffs = key => {
  openPostseason(key);
  setStandingsFilter(key);
  window.scrollTo(0, 0);
  switchView('standings');
};

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
      ${pre ? `<button type="button" class="set-row" onclick="openGuide('board')">
        <span class="set-row-text"><span class="set-row-title">How Boxscore works</span><span class="set-row-sub">New to this? The short version, in three steps</span></span>
        <span class="set-chev">&rsaquo;</span>
      </button>` : ''}
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

  renderPlayoffsHome();
  renderDraftHome();

  // A league shown without being drafted (js/sports.js) has nothing of
  // yours on Home until you favorite something in it.
  const boardLeagues = LEAGUES.filter(l => !l.scoresOnly || teamsForCurrentDraftTeam(l).length);
  if(boardFilterKey !== 'all' && !boardLeagues.some(l => l.key === boardFilterKey)) boardFilterKey = 'all';
  chipsEl.innerHTML = ['all'].concat(boardLeagues.map(l => l.key)).map(key => {
    const label = key === 'all' ? 'All' : (FILTER_CHIP_LABELS[key] || LEAGUES.find(l => l.key === key).label);
    return filterTabHtml({ label, active: key === boardFilterKey, onclick: `setBoardFilter('${key}')` });
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
  setRailDrafter(currentDraftTeamId);

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

// LEAGUE_FULL_LABELS lives in js/league-labels.js now (the wide team
// page reads it too); re-exported for js/admin.js.
export { LEAGUE_FULL_LABELS };


// 2026 -> "26": the draft class's year, as the season labels write it.
const shortYear = y => String(y).slice(-2);

// NFL, CFB, College BB, MLB and WNBA get a slot for the Regular | Postseason switch once a
// playoff field is set (js/postseason.js), filled once the playoffs reveal
// (js/postseason-reveal.js) has introduced it; the season label moves under
// the name to make room. `afterHtml` sits below the card (the postseason's drafted
// table), the two kept together in the grid.
// `span`: the wide layout's two-conference card, which takes the grid's
// full width.
// `controlsHtml`: the wide layout's view control, in the header row.
function leagueBlockHtml(league, bodyHtml, { afterHtml = '', span = false, controlsHtml = '' } = {}){
  const headerLabel = LEAGUE_FULL_LABELS[league.key] || league.label;
  const fieldSet = postseasonFieldSet(league.key);
  // MLB/WNBA: the records below are ESPN's real, live '26 standings —
  // still worth showing — but drafted teams don't start scoring until
  // the '27 season actually begins. See PRIOR_SEASON_DISPLAY_LEAGUES
  // in js/data.js.
  // On its Postseason view (MLB's or the WNBA's '26 postseason), the note names that.
  const onPostseason = fieldSet && postseasonPhase(league.key, standingsFilterKey === 'all') === 'post';
  const priorSeasonNoteHtml = PRIOR_SEASON_DISPLAY_LEAGUES.includes(league.key) && league.key !== 'pga'
    ? `<div class="prior-season-note">${onPostseason
      ? `The '${shortYear(ACTIVE_SEASON_ID)} postseason doesn't count — points start with the '${shortYear(Number(ACTIVE_SEASON_ID) + 1)} season.`
      : `Showing the '${shortYear(ACTIVE_SEASON_ID)} season, still in progress — points won't count until the '${shortYear(Number(ACTIVE_SEASON_ID) + 1)} season.`}</div>`
    : '';
  const frozenNoteHtml = isLeagueFrozen(league.key)
    ? `<div class="prior-season-note">Final standings — this draft class's season is over, so these are its saved end-of-season numbers.</div>`
    : '';

  const topHtml = fieldSet
    ? `<div class="league-tab-top ps-top">
          <div class="ps-title"><div class="league-tab-left">${headerLabel}</div><span class="n">${league.season}</span></div>
          <div class="ps-phase-slot">${postseasonToggleHtml(league.key, postseasonPhase(league.key, standingsFilterKey === 'all'))}</div>
        </div>`
    : `<div class="league-tab-top">
          <div class="league-tab-left">${headerLabel}</div>
          ${controlsHtml ? `<div class="st-controls">${controlsHtml}</div>` : ''}
          <span class="n">${league.season}</span>
        </div>`;
  const cardHtml = `
    <div class="league${span ? ' st-span' : ''}" data-league="${league.key}">
      <div class="league-tab standings-league-tab">
        ${topHtml}
        ${priorSeasonNoteHtml}${frozenNoteHtml}
      </div>
      ${bodyHtml}
    </div>
  `;
  return afterHtml ? `<div class="ps-stack">${cardHtml}${afterHtml}</div>` : cardHtml;
}

// NFL / CFB / College BB / MLB / WNBA: the ladder in place of the card's body while Postseason is
// picked; otherwise null, and the card renders as it always has.
// Wide (a league picked on its own, ladderWide): the bigger ladder with
// the drafted table beside it, in one full-width card. The All overview
// shows just the ladder, with "Full details" opening the league (its
// drafted table included), like the other cards' "Full table".
function postseasonBlockHtml(league){
  ensurePostseason(league.key);
  const inAll = standingsFilterKey === 'all';
  if(postseasonPhase(league.key, inAll) !== 'post') return null;
  if(inAll) return leagueBlockHtml(league, postseasonCardHtml(league.key) + overviewMoreHtml(league.key, 'Full details'));
  if(ladderWide(inAll)){
    const drafted = postseasonDraftedHtml(league.key);
    return leagueBlockHtml(league, `<div class="ps-split">${postseasonCardHtml(league.key, true)}${drafted ? `<div class="ps-side">${drafted}</div>` : ''}</div>`, { span: true });
  }
  return leagueBlockHtml(league, postseasonCardHtml(league.key), { afterHtml: postseasonDraftedHtml(league.key) });
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
// ---- Standings at wide widths: one league's full card ----
// No League | Drafted toggle: the real table and the Drafted race (each
// drafter's teams combined, the league's +5 bonus) show together, the
// Drafted panel beside a single table or under a pair of conference
// tables. Conference leagues show both conferences side by side, with
// Divisions | Conference as a small control in the card's header. The
// phone keeps its toggles (the per-league blocks in renderStandings);
// these share their state, so turning an iPad keeps the same view.

// The NBA/NHL/MLB boards (js/standings-flat.js) as renderFlatLeagueBlock
// and the wide layout read them.
function flatApi(key){
  const by = {
    nba: { cache: espnNbaStandingsCache, fetchCached: fetchEspnNbaStandingsCached, getMode: getNbaStandingsMode,
      conferences: nbaConferences, computeConferenceStandings: computeNbaConferenceStandings,
      renderStandingsRow: renderNbaStandingsRow, computeDrafterCombined: computeNbaDrafterCombined,
      renderByDrafterRow: renderNbaByDrafterRow, toggleHtml: nbaStandingsToggleHtml,
      hasDivisions: nbaHasDivisions, divisionCache: espnNbaDivisionCache, fetchDivisionCached: fetchEspnNbaDivisionStandingsCached,
      computeDivisionStandings: computeNbaDivisionStandings, renderGroupHeader: renderNbaGroupHeader,
      getConferenceSubMode: getNbaConferenceSubMode },
    nhl: { cache: espnNhlStandingsCache, fetchCached: fetchEspnNhlStandingsCached, getMode: getNhlStandingsMode,
      conferences: nhlConferences, computeConferenceStandings: computeNhlConferenceStandings,
      renderStandingsRow: renderNhlStandingsRow, computeDrafterCombined: computeNhlDrafterCombined,
      renderByDrafterRow: renderNhlByDrafterRow, toggleHtml: nhlStandingsToggleHtml,
      hasDivisions: nhlHasDivisions, divisionCache: espnNhlDivisionCache, fetchDivisionCached: fetchEspnNhlDivisionStandingsCached,
      computeDivisionStandings: computeNhlDivisionStandings, renderGroupHeader: renderNhlGroupHeader,
      getConferenceSubMode: getNhlConferenceSubMode },
    mlb: { cache: espnMlbStandingsCache, fetchCached: fetchEspnMlbStandingsCached, getMode: getMlbStandingsMode,
      conferences: mlbConferences, computeConferenceStandings: computeMlbConferenceStandings,
      renderStandingsRow: renderMlbStandingsRow, computeDrafterCombined: computeMlbDrafterCombined,
      renderByDrafterRow: renderMlbByDrafterRow, toggleHtml: mlbStandingsToggleHtml,
      hasDivisions: mlbHasDivisions, divisionCache: espnMlbDivisionCache, fetchDivisionCached: fetchEspnMlbDivisionStandingsCached,
      computeDivisionStandings: computeMlbDivisionStandings, renderGroupHeader: renderMlbGroupHeader,
      getConferenceSubMode: getMlbConferenceSubMode }
  };
  return by[key];
}

const NO_DATA_HTML = `<div class="no-live-note">No data available.</div>`;
const NONE_RANKED_HTML = `<div class="no-live-note">No teams currently ranked.</div>`;

// The one-table leagues' tables (the college ones are the AP Top 25).
const WIDE_SINGLE = {
  epl: { ready: () => eplStandingsCache.table, error: () => eplStandingsCache.error, fetch: fetchEplStandingsTable,
    rows: () => standingsHeadFor('epl') + eplStandingsCache.table.map(r => renderStandingsRow('epl', r)).join('') },
  wnba: { ready: () => espnWnbaStandingsCache.table, error: () => espnWnbaStandingsCache.error, fetch: fetchEspnWnbaStandingsCached,
    rows: () => standingsHeadFor('wnba') + espnWnbaStandingsCache.table.map((r, i) => renderWnbaStandingsRow(r, i + 1)).join('') },
  cfb: { ready: () => espnCfbRankingsCache.ranks, error: () => espnCfbRankingsCache.error, fetch: fetchEspnCfbRankingsCached, title: 'AP Top 25',
    rows: () => { const r = computeCfbRankingTable(); return r.length ? r.map(x => renderCfbRankingRow(x)).join('') : NONE_RANKED_HTML; } },
  mcbb: { ready: () => espnCbbRankingsCache.ranks, error: () => espnCbbRankingsCache.error, fetch: fetchEspnCbbRankingsCached, title: 'AP Top 25',
    rows: () => { const r = computeCbbRankingTable(); return r.length ? r.map(x => renderCbbRankingRow(x)).join('') : NONE_RANKED_HTML; } }
};

// Each league's Drafted rows: the phone's Drafted view, from the same caches.
const WIDE_DRAFTED = {
  epl: { ready: () => eplStandingsCache.table, fetch: fetchEplStandingsTable, rows: () => computeEplDrafterCombined().map((r, i) => renderEplByDrafterRow(r, i + 1)) },
  wnba: { ready: () => espnWnbaStandingsCache.table, fetch: fetchEspnWnbaStandingsCached, rows: () => computeWnbaDrafterCombined().map((r, i) => renderWnbaByDrafterRow(r, i + 1)) },
  cfb: { ready: () => espnCfbRecordsCache.rows, fetch: () => { fetchEspnCfbRecordsCached(); fetchCfbRecords(); }, rows: () => computeCfbDrafterCombined().map((r, i) => renderCfbByDrafterRow(r, i + 1)) },
  mcbb: { ready: () => espnCbbStandingsCache.rows, fetch: fetchEspnCbbStandingsCached, rows: () => computeCbbDrafterCombined().map((r, i) => renderCbbByDrafterRow(r, i + 1)) },
  nfl: { ready: () => espnNflStandingsCache.rows, fetch: fetchEspnNflStandingsCached, rows: () => computeNflDrafterCombined().map((r, i) => renderNflByDrafterRow(r, i + 1)) }
};

function wideDraftedPanelHtml(key){
  const flat = flatApi(key);
  const src = WIDE_DRAFTED[key] || (flat && {
    ready: () => flat.cache.rows, fetch: flat.fetchCached,
    rows: () => flat.computeDrafterCombined().map((r, i) => flat.renderByDrafterRow(r, i + 1))
  });
  if(!src) return '';
  src.fetch();  // no-op if already fresh
  const bonus = LEAGUE_SCORING[key] && LEAGUE_SCORING[key].bonus;
  const rows = src.ready() ? src.rows().join('') : skeletonRowsHtml();
  return `<section class="st-drafted"><div class="st-drafted-head"><h3 class="st-drafted-title">Drafted</h3>`
    + (bonus ? `<span class="st-drafted-sub">+${bonus.pts} for ${escapeHtml(bonus.label.charAt(0).toLowerCase() + bonus.label.slice(1))}</span>` : '')
    + `</div><div class="st-drafted-rows">${rows}</div></section>`;
}

// Divisions | Conference, sized to its labels.
function widePillHtml(active, handler){
  return `<div class="st-pill">${segmentedControlHtml([{ key: 'division', label: 'Divisions' }, { key: 'full', label: 'Conference' }], active, handler)}</div>`;
}

// Both conferences of the NFL, NBA, NHL or MLB, side by side.
function wideConferencesHtml(key){
  const nfl = key === 'nfl';
  const api = nfl ? null : flatApi(key);
  const hasDivisions = nfl || api.hasDivisions;
  const sub = nfl ? nflConferenceSubMode : api.getConferenceSubMode();
  const divisions = hasDivisions && sub === 'division';
  const handler = nfl ? 'setNflConferenceSubMode' : `set${key[0].toUpperCase()}${key.slice(1)}ConferenceSubMode`;
  const pill = hasDivisions ? widePillHtml(sub, handler) : '';
  const cache = nfl ? (divisions ? espnNflDivisionCache : espnNflStandingsCache) : (divisions ? api.divisionCache : api.cache);
  const ready = divisions ? cache.divisions : cache.rows;
  if(nfl) (divisions ? fetchEspnNflDivisionStandingsCached : fetchEspnNflStandingsCached)();
  else (divisions ? api.fetchDivisionCached : api.fetchCached)();  // no-op if already fresh
  if(!ready) return { html: cache.error ? NO_DATA_HTML : skeletonRowsHtml(), pill };
  const confs = nfl ? [{ abbr: 'AFC', label: 'AFC' }, { abbr: 'NFC', label: 'NFC' }] : api.conferences;
  const row = (t, i) => (nfl ? renderNflStandingsRow(t, i + 1) : api.renderStandingsRow(t, i + 1));
  const parts = confs.map(c => ({
    label: c.label,
    html: divisions
      ? (nfl ? computeNflDivisionStandings(c.abbr) : api.computeDivisionStandings(c.abbr))
          .map(d => (nfl ? renderNflGroupHeader(d.name) : api.renderGroupHeader(d.name)) + d.teams.map(row).join('')).join('')
      : (nfl ? computeNflConferenceStandings(c.abbr) : api.computeConferenceStandings(c.abbr)).map(row).join('')
  }));
  return { html: confPairHtml(key, parts), pill };
}

function wideLeagueBlockHtml(league){
  const key = league.key;
  const post = postseasonFieldSet(key) ? postseasonBlockHtml(league) : null;
  if(post) return post;
  if(key === 'pga') return leagueBlockHtml(league, pgaStandingsBodyHtml());
  // Before the first draft, or in a league nobody drafted, there's no race.
  const panel = standingsOwnerHtml(null, key) ? wideDraftedPanelHtml(key) : '';
  const single = WIDE_SINGLE[key];
  if(!single){
    const { html, pill } = wideConferencesHtml(key);
    return leagueBlockHtml(league, html + (panel ? `<div class="st-under">${panel}</div>` : ''), { span: true, controlsHtml: pill });
  }
  single.fetch();  // no-op if already fresh
  const table = single.ready()
    ? (single.title ? `<div class="st-conf-title">${single.title}</div>` : '') + single.rows()
    : (single.error() ? NO_DATA_HTML : skeletonRowsHtml());
  return leagueBlockHtml(league, panel ? `<div class="st-split"><div class="st-main">${table}</div>${panel}</div>` : table, { span: true });
}

// ---- Standings: the All overview (every width) ----
// One compact card per league: its top OVERVIEW_TOP, then any of the
// displayed drafter's teams further down (with their real rank, after a
// gap), and "Full table" to open that league on its own. Conference
// leagues rank both conferences together. Always the League view; the
// toggles live on the full table. A league on its Postseason view keeps
// its ladder card.
const OVERVIEW_TOP = 5;
const OVERVIEW_LEAGUES = {
  epl: { ready: () => eplStandingsCache.table, fetch: fetchEplStandingsTable, teamKey: r => findEplTeamKeyByEspnName(r.teamName), render: r => renderStandingsRow('epl', r), head: true },
  nfl: { ready: () => espnNflStandingsCache.rows, fetch: fetchEspnNflStandingsCached, teamKey: r => findNflTeamKeyByEspnAbbr(r.abbreviation), render: renderNflStandingsRow, head: true, leaders: true, note: 'Best records, AFC and NFC together' },
  nba: { ready: () => espnNbaStandingsCache.rows, fetch: fetchEspnNbaStandingsCached, teamKey: r => findFlatTeamKey('nba', r.teamNickname), render: renderNbaStandingsRow, head: true, leaders: true, note: 'Best records, East and West together' },
  nhl: { ready: () => espnNhlStandingsCache.rows, fetch: fetchEspnNhlStandingsCached, teamKey: r => findFlatTeamKey('nhl', r.teamNickname), render: renderNhlStandingsRow, head: true, leaders: true, note: 'Most points, East and West together' },
  mlb: { ready: () => espnMlbStandingsCache.rows, fetch: fetchEspnMlbStandingsCached, teamKey: r => findFlatTeamKey('mlb', r.teamNickname), render: renderMlbStandingsRow, head: true, leaders: true, note: 'Best records, AL and NL together' },
  wnba: { ready: () => espnWnbaStandingsCache.table, fetch: fetchEspnWnbaStandingsCached, teamKey: r => findFlatTeamKey('wnba', r.teamNickname), render: renderWnbaStandingsRow, head: true },
  cfb: { ready: () => espnCfbRankingsCache.ranks && computeCfbRankingTable(), fetch: fetchEspnCfbRankingsCached, teamKey: r => findCfbTeamKeyByLocation(r.location), render: r => renderCfbRankingRow(r), note: 'AP Top 25' },
  mcbb: { ready: () => espnCbbRankingsCache.ranks && computeCbbRankingTable(), fetch: fetchEspnCbbRankingsCached, teamKey: r => findCbbTeamKeyByEspnId(r.id), render: r => renderCbbRankingRow(r), note: 'AP Top 25' }
};

// An overview card's link to its league on its own, opened at the top of
// the page rather than where this card was.
function overviewMoreHtml(key, label){
  return `<button type="button" class="st-more" onclick="setStandingsFilter('${key}'); window.scrollTo(0, 0)">${label} <span class="chev">›</span></button>`;
}

function overviewBlockHtml(league){
  const post = postseasonFieldSet(league.key) ? postseasonBlockHtml(league) : null;
  if(post) return post;
  const src = OVERVIEW_LEAGUES[league.key];
  if(!src) return league.key === 'pga' ? leagueBlockHtml(league, pgaStandingsBodyHtml()) : '';
  src.fetch();  // no-op if already fresh
  const rows = src.ready();
  const more = overviewMoreHtml(league.key, 'Full table');
  if(!rows) return leagueBlockHtml(league, skeletonRowsHtml() + more);
  const ordered = src.leaders ? leagueLeaders(rows, league.key) : rows;
  const mine = row => {
    const teamKey = src.teamKey(row);
    const meta = teamKey && TEAM_META[teamKey];
    return !!meta && !meta.favoriteOnly && meta.draftTeamId === currentDraftTeamId;
  };
  const list = overviewRows(ordered, mine, OVERVIEW_TOP);
  const body = (src.note ? `<div class="st-ov-note">${escapeHtml(src.note)}</div>` : '')
    + (src.head ? standingsHeadFor(league.key) : '')
    + (list.length ? list.map(x => (x.gap ? '<div class="st-gap" aria-hidden="true"></div>' : '') + src.render(x.row, x.rank)).join('') : '<div class="no-live-note">No teams currently reporting.</div>')
    + more;
  return leagueBlockHtml(league, body);
}

// The column labels over a League-view table (shown only at wide widths).
// "Drafted by" only where the rows show an owner.
function standingsHeadFor(leagueKey){
  return standingsHeadHtml(leagueKey, { owner: !!standingsOwnerHtml(null, leagueKey) });
}

// Wide layout (900px and up): a league's conferences side by side, each
// its own table, instead of one at a time behind a toggle. `parts`:
// [{ label, html }] with each conference's rows (and division headers).
function confPairHtml(leagueKey, parts){
  return `<div class="st-confs">${parts.map(p => `<div class="st-conf"><div class="st-conf-title">${escapeHtml(p.label)}</div>`
    + (p.html ? standingsHeadFor(leagueKey) + p.html : '<div class="no-live-note">No teams currently reporting.</div>')
    + `</div>`).join('')}</div>`;
}

function renderFlatLeagueBlock(league, api){
  const mode = api.getMode();
  let bodyHtml;

  const usesDivisionCache = api.hasDivisions && mode !== 'byDrafter' && api.getConferenceSubMode() === 'division';

  if(usesDivisionCache){
    const confAbbr = api.conferences.find(c => c.mode === mode).abbr;
    if(api.divisionCache.divisions){
      const divisions = api.computeDivisionStandings(confAbbr);
      const rowsHtml = divisions.length
        ? standingsHeadFor(league.key) + divisions.map(div =>
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
      ? standingsHeadFor(league.key) + teams.map((t, i) => api.renderStandingsRow(t, i + 1)).join('')
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
  endPostseasonReveal();
  if(key !== standingsFilterKey){ resetPostseasonStages(); replayReveals(); }
  standingsFilterKey = key;
  updateUrlParam('league', key === 'all' ? null : key);
  renderStandings();
  const tabs = document.querySelector('#standings-content .filter-chips');
  if(tabs) revealActiveTab(tabs);
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
  // The playoffs reveal holds the card it's playing in until it ends.
  if(!container || !isViewActive('standings') || postseasonRevealBusy()) return;

  const chipsHtml = ['all'].concat(LEAGUES.map(l => l.key)).map(key => {
    const label = key === 'all' ? 'All' : (FILTER_CHIP_LABELS[key] || LEAGUES.find(l => l.key === key).label);
    return filterTabHtml({ label, active: key === standingsFilterKey, onclick: `setStandingsFilter('${key}')` });
  }).join('');

  const shownLeagues = standingsFilterKey === 'all' ? LEAGUES : LEAGUES.filter(l => l.key === standingsFilterKey);

  // All: a compact card per league (overviewBlockHtml) instead of every
  // full table, on phones too.
  const overview = standingsFilterKey === 'all';
  const blocksHtml = shownLeagues.map(league => {
    if(overview) return overviewBlockHtml(league);
    if(isWide()) return wideLeagueBlockHtml(league);
    if(league.key === 'epl'){
      let bodyHtml;
      if(eplStandingsCache.table){
        const rowsHtml = eplStandingsMode === 'byDrafter'
          ? computeEplDrafterCombined().map((row, i) => renderEplByDrafterRow(row, i + 1)).join('')
          : standingsHeadFor('epl') + eplStandingsCache.table.map(row => renderStandingsRow('epl', row)).join('');
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
      const post = postseasonBlockHtml(league);
      if(post) return post;
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
      const post = postseasonBlockHtml(league);
      if(post) return post;
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
      const post = postseasonBlockHtml(league);
      if(post) return post;
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
            ? standingsHeadFor('nfl') + divisions.map(div =>
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
              ? standingsHeadFor('nfl') + teams.map((t, i) => renderNflStandingsRow(t, i + 1)).join('')
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

    if(league.key === 'nba') return renderFlatLeagueBlock(league, flatApi('nba'));
    if(league.key === 'nhl') return renderFlatLeagueBlock(league, flatApi('nhl'));
    if(league.key === 'mlb'){
      const post = postseasonBlockHtml(league);
      if(post) return post;
    }
    if(league.key === 'mlb') return renderFlatLeagueBlock(league, flatApi('mlb'));
    // PGA Tour: the FedEx Cup table (js/golf-view.js).
    if(league.key === 'pga') return leagueBlockHtml(league, pgaStandingsBodyHtml());

    if(league.key === 'wnba'){
      // Flat league-wide ranking, same shape as EPL's block above — no
      // conference split (see js/standings-wnba.js's header comment for
      // why it no longer shares NBA/NHL/MLB's js/standings-flat.js
      // machinery).
      const post = postseasonBlockHtml(league);
      if(post) return post;
      let bodyHtml;
      if(espnWnbaStandingsCache.table){
        const rowsHtml = wnbaStandingsMode === 'byDrafter'
          ? computeWnbaDrafterCombined().map((row, i) => renderWnbaByDrafterRow(row, i + 1)).join('')
          : standingsHeadFor('wnba') + espnWnbaStandingsCache.table.map((row, i) => renderWnbaStandingsRow(row, i + 1)).join('');
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

  // The row is rebuilt below, so carry its sideways scroll across.
  const oldTabs = container.querySelector('.filter-chips');
  const tabsScroll = oldTabs ? oldTabs.scrollLeft : 0;
  const ladders = keepPostseason(container);
  container.innerHTML = `
    <div class="standings-filter-row"><div class="filter-chips" role="tablist">${chipsHtml}</div></div>
    <div class="standings-grid${overview ? ' st-overview' : ''}">${blocksHtml}</div>
  `;
  container.querySelector('.filter-chips').scrollLeft = tabsScroll;
  restorePostseason(container, ladders);
  maybeStartPostseasonReveal(container, standingsFilterKey);
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
  // At wide widths Chat sits beside the page (js/wide.js), not in place of it.
  if(view === 'chat' && wideChatNav()) return;
  settleTeamTransition();
  const activeTab = document.querySelector('.tab-btn.active');
  const from = TAB_ORDER.indexOf(activeTab ? activeTab.dataset.view : '');
  const to = TAB_ORDER.indexOf(view);
  // The sideways tab slide is a phone gesture; wide widths crossfade.
  const kind = isWide() || from < 0 || to < 0 || from === to ? null : (to > from ? 'fwd' : 'back');
  navigate(kind, () => showView(view));
}
window.switchView = switchView;

function showView(view){
  // A ?view=chat link opened at wide widths: Home, with chat beside it.
  if(view === 'chat' && isWide()){
    wideChatNav({ open: true });
    view = 'board';
  }
  if(view !== 'standings') endPostseasonReveal();
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  paintTabPill(view);
  updateUrlParam('view', view === 'board' ? null : view);
  // A tab tapped from the team page leaves it behind.
  updateUrlParam('tp', null);
  onViewShown();
  setDraftActive(view === 'draft');
  if(view === 'live-now'){ resetTodayDay(); renderLiveNow(); }
  if(view === 'standings') renderStandings();
  if(view === 'board') renderPlayoffsHome();
  if(view === 'overall'){ obEnterView(); renderOverallStandings(); }
  else updateUrlParam('seg', null);
  if(view === 'admin') showAdminPage();
  else updateUrlParam('screen', null);
  if(view === 'settings') renderSettingsPage(SETTINGS_BACK_LABELS[settingsOrigin] || 'Back');
  if(view === 'guide') renderGuidePage({ backLabel: guideFromHome ? 'Home' : 'Settings' });
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

// How Boxscore works (js/guide.js), from Settings or, before a group's
// first draft, from Home's Draft section. Pushed like the team page; its
// back button (closeGuide) pops to whichever opened it, Home at the same
// scroll position.
let guideFromHome = false, guideHomeScrollY = 0;
export function openGuide(from = 'settings'){
  guideFromHome = from === 'board';
  guideHomeScrollY = guideFromHome ? window.scrollY : 0;
  navigate('push', () => {
    showView('guide');
    window.scrollTo(0, 0);
  });
}
window.openGuide = openGuide;

export function closeGuide(){
  if(!guideFromHome){ backToSettings(); return; }
  const y = guideHomeScrollY;
  guideFromHome = false;
  navigate('pop', () => {
    showView('board');
    window.scrollTo(0, y);
  });
}
window.closeGuide = closeGuide;

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
initWide();
// Crossing 900px swaps Standings, Scores and Points between their phone and wide layouts.
onWideChange(() => {
  if(isViewActive('standings')) renderStandings();
  if(isViewActive('live-now')) renderLiveNow();
  if(isViewActive('overall')) renderOverallStandings();
});
applyUrlState();
enableNavMotion();
(window.requestIdleCallback || (fn => setTimeout(fn, 3000)))(preloadDraftRoom, { timeout: 8000 });
maybeShowWelcome();
startActivity();
startSince();
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
initBackButton();
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
