/* ============================================================
   Team Page: a real, navigable screen for a single team — the
   destination the trimmed team modal (js/live-data.js's openTeamModal)
   hands off to, and what a Standings row now pushes to directly. Owns
   its own three "screens" (the page itself, plus the Full Schedule and
   Full Squad screens behind its footer links) and their push/pop
   navigation, tab state, and the News/Roster/Stats fetches unique to
   this view.

   Full tab treatment (Overview/Stats/Squad, +Injuries for NFL) ships
   for every league in FLAT_SCHEDULE_LEAGUES (EPL/NFL/MLB/NBA/NHL/WNBA/
   CFB/CBB). News used to be its own 4th tab but is now just a section
   on Overview, below the schedule content (see scheduleTabHtml/
   ensureNews) — it only ever needed a team's ESPN id and sportPath, so
   it was never restricted the way Stats/Squad are, and folding it in
   there instead of a separate tab means it's never a full empty tab of
   its own when a team just has nothing new posted. Roster/team-stats
   endpoints were first verified for EPL, NFL and MLB (see js/espn.js's
   fetchEspnTeamRoster/fetchEspnTeamStatistics header comments); NBA,
   NHL, WNBA, CFB and College Basketball followed (2026-09-22) off one
   extra ESPN call per team, fetchEspnTeamPlayerStats, which carries
   both the team's season totals and every player's own stat line —
   see PLAYER_STATS_LEAGUES below for each league's tiles, leaders and
   roster stat line.

   Pushed/popped via the functions below, not switchView() — switchView
   also drives the bottom tab bar's active state off a fixed data-view
   whitelist that doesn't include these views, and the design wants
   whichever real tab was active before the push to stay lit ("Standings
   is the active tab throughout"). So this toggles `.view.active`
   directly (the same primitive switchView uses) and leaves the tab bar
   alone.
   ============================================================ */
import { TEAM_META, LEAGUES, DRAFT_TEAMS, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { teamBadgeHtml, crestSrc, updateUrlParam, segmentedControlHtml } from './utils.js';
import { fetchEspnTeamNews, fetchEspnTeamRoster, fetchEspnTeamStatistics, fetchEspnTeamPlayerStats } from './espn.js';
import {
  FLAT_SCHEDULE_LEAGUES, GAME_DETAIL_LEAGUES, liveDataCache, fetchTeamBundle,
  renderStats, renderNext, seasonStatus
} from './live-data.js';
import { findEspnEplRow } from './standings-epl.js';
import { findEspnNflRow } from './standings-nfl.js';
import { findEspnMlbRow } from './standings-mlb.js';
import { favoriteStarHtml } from './favorites.js';
import { trackerSectionHtml } from './league-facts.js';
import {
  fetchNflverseDepthChartCached, fetchNflverseInjuriesCached,
  getTeamDepthChart, getTeamInjuries, nflverseInjuryStatus,
  nflverseInjuriesCache, nflverseDepthChartCache
} from './nflverse.js';

// Every league with a verified roster/team-stats source (see this
// file's header comment) — a FLAT_SCHEDULE_LEAGUES league missing from
// here still gets a real page + Overview tab, just a placeholder
// Stats/Squad.
const FULL_STATS_SQUAD_LEAGUES = ['epl', 'nfl', 'mlb', 'nba', 'nhl', 'wnba', 'cfb', 'mcbb'];

// News has no tab of its own anymore — it's a section on the Overview
// tab now (see scheduleTabHtml below), folded in under the "Full
// schedule ›" link.
const TABS = {
  epl: [{ key: 'schedule', label: 'Overview' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Squad' }],
  // Injuries is NFL-only — nflverse (js/nflverse.js) has no equivalent
  // structured injury-report data for any other league.
  nfl: [{ key: 'schedule', label: 'Overview' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Roster' }, { key: 'injuries', label: 'Injuries' }],
  mlb: [{ key: 'schedule', label: 'Overview' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Roster' }]
};
// "Squad" is soccer vocabulary — every US league calls it a roster.
['nba', 'nhl', 'wnba', 'cfb', 'mcbb'].forEach(key => { TABS[key] = TABS.mlb; });
function tabsFor(leagueKey){
  return TABS[leagueKey] || [{ key: 'schedule', label: 'Overview' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Squad' }];
}

const EMPTY_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"></path><path d="M15 3v4h4"></path><path d="M9 13h6M9 17h6"></path></svg>';

// ---- Module state ----
// Only one Team Page (and one full-screen behind it) is ever open at
// once, so this is a single object rather than a map — cached per-team
// data lives in the *Cache objects below instead, so switching away and
// back to the same team's page doesn't refetch.
// squadFilter starts null (rather than a real group name) so
// fullRosterHtml's own fallback — groups[0], i.e. whatever group a
// team's roster lists first (Offense, for NFL) — picks the default the
// first time a Roster tab renders, instead of hardcoding a group name
// here that wouldn't exist for every league (MLB's groups aren't
// Offense/Defense/Special Teams).
const state = { teamKey: null, originView: 'board', originScrollY: 0, activeTab: 'schedule', squadFilter: null };

const newsCache = {};   // teamKey -> { status: 'idle'|'loading'|'ready'|'empty'|'error', items }
const rosterCache = {}; // teamKey -> { status, items }
const statsCache = {};  // teamKey -> { status, data } — `data` shape is league-specific, built in computeStatsTiles
const playerStatsCache = {}; // teamKey -> { status, data } — `data` is fetchEspnTeamPlayerStats's shape (PLAYER_STATS_LEAGUES only)

function espnTeamRowFor(meta){
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  return flat ? flat.findRow(meta) : null;
}

// ---- Navigation ----

function setActiveView(viewId){
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === viewId));
}

// Note: this app's `?team=` param already means something else (which
// drafter's board you're peeking — see setDraftTeam in js/board.js), so
// the Team Page's own team key rides in `?tp=` instead to avoid
// colliding with that existing, unrelated param.
export function openTeamPage(teamKey, originView){
  if(!TEAM_META[teamKey]) return;
  state.teamKey = teamKey;
  state.originView = originView || 'board';
  state.originScrollY = window.scrollY;
  state.activeTab = 'schedule';
  state.squadFilter = null;
  setActiveView('view-team-page');
  window.scrollTo(0, 0);
  updateUrlParam('view', 'team');
  updateUrlParam('tp', teamKey);
  renderTeamPage();
  ensureBundle(teamKey);
}
window.openTeamPage = openTeamPage;

export function backFromTeamPage(){
  setActiveView('view-' + state.originView);
  updateUrlParam('view', state.originView === 'board' ? null : state.originView);
  updateUrlParam('tp', null);
  window.scrollTo(0, state.originScrollY);
}
window.backFromTeamPage = backFromTeamPage;

export function openFullSchedule(teamKey){
  state.teamKey = teamKey;
  setActiveView('view-team-schedule');
  window.scrollTo(0, 0);
  updateUrlParam('view', 'team-schedule');
  renderFullSchedule('all');
}
window.openFullSchedule = openFullSchedule;

export function openFullSquad(teamKey){
  state.teamKey = teamKey;
  setActiveView('view-team-squad');
  window.scrollTo(0, 0);
  updateUrlParam('view', 'team-squad');
  renderFullSquad('all');
}
window.openFullSquad = openFullSquad;

// Both full screens return to the page itself, not all the way back to
// the origin tab — "Full schedule ›"/"Full squad ›" are one level down
// from the page, not siblings of it.
export function backFromFullScreen(){
  setActiveView('view-team-page');
  updateUrlParam('view', 'team');
  window.scrollTo(0, 0);
}
window.backFromFullScreen = backFromFullScreen;

function ensureBundle(teamKey){
  if(liveDataCache[teamKey]) return;
  fetchTeamBundle(teamKey).then(bundle => {
    if(bundle && state.teamKey === teamKey) renderTeamPage();
  });
}

export function setTeamPageTab(tabKey){
  state.activeTab = tabKey;
  const tabsEl = document.getElementById('team-page-tabs');
  const meta = TEAM_META[state.teamKey];
  if(tabsEl && meta) tabsEl.innerHTML = segmentedControlHtml(tabsFor(meta.leagueKey), state.activeTab, 'setTeamPageTab');
  renderTabBody();
}
window.setTeamPageTab = tabKey => setTeamPageTab(tabKey);

// ---- Team Page ----

function heroHtml(teamKey, meta){
  const drafter = DRAFT_TEAMS.find(d => d.id === meta.draftTeamId);
  const league = LEAGUES.find(l => l.key === meta.leagueKey);
  const bundle = liveDataCache[teamKey];
  const status = bundle ? seasonStatus(meta, bundle) : null;
  const accent = meta.accent || '#D9B45B';
  const hex = accent.replace('#', '');
  const rgb = [0, 2, 4].map(i => parseInt(hex.substring(i, i + 2), 16) || 0).join(',');

  return `
    <div class="team-hero" style="background:linear-gradient(150deg, rgba(${rgb},0.45) 0%, rgba(${rgb},0.14) 46%, rgba(10,11,13,0) 100%);">
      <div class="team-hero-orb" style="background:radial-gradient(circle at 50% 50%, rgba(${rgb},0.45) 0%, transparent 70%);"></div>
      <div class="team-hero-scrim"></div>
      <div class="team-hero-row">
        ${meta.badgeUrl ? `<img class="crest-bare" src="${crestSrc(meta)}" alt="${meta.name}">` : teamBadgeHtml(meta)}
        <div>
          <div class="team-hero-name">${meta.fullName || meta.name}</div>
          <div class="team-hero-meta">
            <span>${league ? league.label : ''}</span>
            <span>&middot;</span>
            <span>${drafter ? drafter.name + (meta.favoriteOnly ? ' · Favorite' : '') : 'Undrafted'}</span>
            ${status ? `<span class="status-pill">${status.label}</span>` : ''}
          </div>
        </div>
      </div>
    </div>
  `;
}

function gameCardHtml(teamKey, bundle){
  const isLive = !!(bundle && bundle.espnLive && bundle.espnLive.isLive);
  return `<div class="game-card ${isLive ? 'live' : 'upcoming'}" id="team-page-game-card"><div class="next-match" id="team-page-next"></div></div>`;
}

function renderTeamPage(){
  const el = document.getElementById('team-page-content');
  if(!el) return;
  const teamKey = state.teamKey;
  const meta = TEAM_META[teamKey];
  if(!meta) return;
  const bundle = liveDataCache[teamKey];
  const tabs = tabsFor(meta.leagueKey);

  el.dataset.activeTeam = teamKey;
  el.innerHTML = `
    <div class="team-page-nav">
      <button class="team-page-back" onclick="backFromTeamPage()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>
        ${state.originView === 'standings' ? 'Standings' : (state.originView === 'live-now' ? 'Scores' : 'Home')}
      </button>
      <div class="team-page-actions">${favoriteStarHtml(teamKey)}</div>
    </div>
    ${heroHtml(teamKey, meta)}
    <div class="stat-strip" id="team-page-stats">${bundle ? '' : '<div class="stat-cell" style="flex:1;"><div class="lbl">Loading…</div></div>'}</div>
    ${gameCardHtml(teamKey, bundle)}
    <div style="margin: 16px 20px 0;" id="team-page-tabs">${segmentedControlHtml(tabs, state.activeTab, 'setTeamPageTab')}</div>
    <div class="tab-body" id="team-page-tab-body"></div>
  `;

  if(bundle){
    renderStats(meta, bundle, 'team-page-stats');
    renderNext(teamKey, meta, bundle, 'team-page-next');
  }
  renderTabBody();
}

function renderTabBody(){
  const el = document.getElementById('team-page-tab-body');
  if(!el) return;
  const teamKey = state.teamKey;
  const meta = TEAM_META[teamKey];
  if(!meta) return;
  const bundle = liveDataCache[teamKey];
  const fullFeature = FULL_STATS_SQUAD_LEAGUES.includes(meta.leagueKey);

  if(state.activeTab === 'schedule'){
    el.innerHTML = scheduleTabHtml(teamKey, meta, bundle);
    ensureNews(teamKey);
    return;
  }
  if(state.activeTab === 'stats'){
    if(!fullFeature){
      el.innerHTML = `<div class="placeholder-tab">Season stats for this league aren't built yet — check back once it gets its own design pass.</div>`;
      return;
    }
    el.innerHTML = PLAYER_STATS_LEAGUES[meta.leagueKey]
      ? playerStatsTabHtml(teamKey, meta, bundle)
      : statsTabHtml(teamKey, meta, bundle);
    return;
  }
  if(state.activeTab === 'squad'){
    if(!fullFeature){
      el.innerHTML = `<div class="placeholder-tab">A full roster for this league isn't built yet — check back once it gets its own design pass.</div>`;
      return;
    }
    el.innerHTML = squadTabHtml(teamKey);
    ensureRoster(teamKey);
    if(PLAYER_STATS_LEAGUES[meta.leagueKey]) ensurePlayerStats(teamKey, meta);
    return;
  }
  if(state.activeTab === 'injuries'){
    el.innerHTML = injuriesTabHtml(meta);
    ensureNflverse();
    return;
  }
}

// ---- Schedule tab ----

function resultRowHtml(teamKey, evt){
  let cls = 'd', label = 'D';
  if(evt.ownScore > evt.oppScore){ cls = 'w'; label = 'W'; }
  else if(evt.ownScore < evt.oppScore){ cls = 'l'; label = 'L'; }
  const meta = TEAM_META[teamKey];
  const gameDetail = GAME_DETAIL_LEAGUES[meta.leagueKey];
  const boxscoreHtml = (gameDetail && evt.id) ? `<div class="boxscore-link" onclick="openGameDetail('${teamKey}', '${evt.id}')">Boxscore <span class="chev">›</span></div>` : '';
  const dateLabel = new Date(evt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `
    <div class="form-item">
      <div class="form-pill ${cls}">${label}</div>
      <div class="form-detail">
        <span class="opp">${evt.isHome ? 'vs' : 'at'} ${evt.opponentName}</span>
        <span class="meta">${evt.venueName || ''}${evt.venueName ? ' · ' : ''}${dateLabel}</span>
      </div>
      <div class="form-right">
        <div class="form-score">${evt.ownScore}–${evt.oppScore}</div>
        ${boxscoreHtml}
      </div>
    </div>
  `;
}

function upcomingRowHtml(evt){
  const d = new Date(evt.date);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  // Same "venue · Sep 12" convention resultRowHtml uses for a played
  // game — the day-of-week label on the right (WED) told you nothing
  // about which Wednesday, so the actual date belongs on the meta line
  // too, not just the score side.
  const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `
    <div class="form-item">
      <div class="form-detail" style="margin-left:0;">
        <span class="opp">${evt.isHome ? 'vs' : 'at'} ${evt.opponentName}</span>
        <span class="meta">${evt.venueName || ''}${evt.venueName ? ' · ' : ''}${dateLabel}</span>
      </div>
      <div class="form-right">
        <div class="game-card-eyebrow" style="justify-content:flex-end;">${day}</div>
        <div class="form-score">${time}</div>
      </div>
    </div>
  `;
}

function scheduleTabHtml(teamKey, meta, bundle){
  const sched = bundle && bundle.espnSchedule;
  let scheduleHtml;
  if(!bundle){
    scheduleHtml = `<div class="loading-note">Loading schedule…</div>`;
  } else if(!sched){
    scheduleHtml = `<div class="no-live-note">Schedule isn't available for this team yet.</div>`;
  } else {
    // Last 5 results — the separate W/D/L summary strip and the
    // Upcoming section below it used to live here too, but this tab is
    // meant as a quick "how'd they do lately" glance now, not a mini
    // schedule (that's what "Full schedule ›" and the Full Schedule
    // screen are for). Each result row still carries its own W/D/L
    // pill (resultRowHtml above), just not the separate summary strip.
    const recentResults = sched.recent.slice(0, 5);
    scheduleHtml = `
      <div class="modal-section-title">Recent form</div>
      ${recentResults.map(evt => resultRowHtml(teamKey, evt)).join('') || '<div class="loading-note">No results yet.</div>'}
      <div style="text-align:center; padding-top:14px;">
        <span class="boxscore-link" style="justify-content:center;" onclick="openFullSchedule('${teamKey}')">Full schedule <span class="chev">›</span></span>
      </div>
    `;
  }

  // News used to be its own tab — it's a section here now, below the
  // schedule content, so it still shows even while schedule/bundle data
  // is loading or unavailable rather than being gated on it.
  return `
    ${scheduleHtml}
    <div class="modal-section-title" style="margin-top:16px;">News</div>
    ${newsTabHtml(teamKey)}
  `;
}

// ---- News (a section on the Overview tab, not its own tab) ----

function timeAgo(iso){
  if(!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = Math.round(diffMs / 3600000);
  if(hrs < 1) return 'Just now';
  if(hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function newsSkeletonHtml(){
  const widths = [['88%', '54%', '72%'], ['80%', '48%'], ['70%', '60%', '40%']];
  return widths.map((lines, i) => `
    <div class="news-card">
      ${lines.map((w, j) => `<div class="skel-bar" style="width:${w}; margin-top:${j ? '8px' : '0'}; animation-delay:${(i * 0.1 + j * 0.06).toFixed(2)}s;"></div>`).join('')}
      <div class="skel-bar meta" style="width:32%; margin-top:12px; animation-delay:${(i * 0.1 + 0.2).toFixed(2)}s;"></div>
    </div>
  `).join('');
}

function newsEmptyHtml(teamKey, meta, isError){
  return `
    <div class="empty-state">
      ${EMPTY_ICON_SVG}
      <div class="title">${isError ? 'Couldn’t load news' : 'No news yet'}</div>
      <div class="body">${isError
        ? 'Something went wrong reaching ESPN — try again in a moment.'
        : `ESPN hasn't published anything on ${meta.name} today. Match reports usually land within an hour of full time.`}</div>
      <span class="boxscore-link" onclick="retryTeamPageNews('${teamKey}')">Check again</span>
    </div>
  `;
}

function newsTabHtml(teamKey){
  const meta = TEAM_META[teamKey];
  const entry = newsCache[teamKey];
  if(!entry || entry.status === 'loading') return newsSkeletonHtml();
  if(entry.status === 'error') return newsEmptyHtml(teamKey, meta, true);
  if(entry.status === 'empty' || !entry.items.length) return newsEmptyHtml(teamKey, meta, false);
  return entry.items.slice(0, 4).map(a => `
    <div class="news-card" onclick="window.open('${(a.link || '').replace(/'/g, '&#39;')}', '_blank')">
      <div class="headline">${a.headline}</div>
      <div class="news-meta">ESPN <span style="color:#3A3B41;">·</span> ${timeAgo(a.published)}</div>
    </div>
  `).join('') + `<div class="news-footer-note">Headlines via ESPN team news</div>`;
}

function ensureNews(teamKey){
  const meta = TEAM_META[teamKey];
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(!row || !flat){ newsCache[teamKey] = { status: 'error', items: [] }; return; }
  if(newsCache[teamKey] && newsCache[teamKey].status !== 'error') return;

  newsCache[teamKey] = { status: 'loading', items: [] };
  fetchEspnTeamNews(flat.sportPath, row.id).then(items => {
    newsCache[teamKey] = items ? { status: items.length ? 'ready' : 'empty', items } : { status: 'error', items: [] };
    if(state.teamKey === teamKey && state.activeTab === 'schedule') renderTabBody();
  });
}
window.retryTeamPageNews = teamKey => {
  delete newsCache[teamKey];
  renderTabBody();
  ensureNews(teamKey);
};

// ---- Stats tab ----

// League-specific 2×2 tile sets. EPL's team-statistics endpoint returns
// an empty `results: {}` for every soccer club (verified live,
// 2026-09-17 — see fetchEspnTeamStatistics's header comment), so its
// tiles are sourced from the standings row's goalsFor/goalsAgainst/
// goalDifference/ppg instead of a second fetch — no equivalent for
// "clean sheets"/"possession" exists anywhere in ESPN's site API for
// soccer, so those two design-spec'd cells are swapped for what's
// actually available.
function statsTilesHtml(teamKey, meta){
  if(meta.leagueKey === 'epl'){
    const row = findEspnEplRow(meta);
    if(!row) return null;
    // Points-per-game computed here, not read off ESPN's own `ppg` stat —
    // that field comes back 0 for every club, verified live (2026-09-17)
    // against several teams with real nonzero points, same class of gap
    // as the empty /statistics response for soccer (see
    // fetchEspnTeamStatistics's header comment).
    const ppg = row.gamesPlayed ? (row.points / row.gamesPlayed).toFixed(2) : '—';
    return [
      { num: row.goalsFor ?? '—', lbl: 'Goals For' },
      { num: row.goalsAgainst ?? '—', lbl: 'Goals Against' },
      { num: (row.goalDifference ?? 0) >= 0 ? `+${row.goalDifference ?? 0}` : row.goalDifference, lbl: 'Goal Diff' },
      { num: ppg, lbl: 'Pts / Game' }
    ];
  }

  const entry = statsCache[teamKey];
  if(!entry || entry.status !== 'ready') return null;
  return entry.tiles;
}

function statsTabHtml(teamKey, meta, bundle){
  const tiles = statsTilesHtml(teamKey, meta);
  const splitHtml = homeAwaySplitHtml(bundle);
  const trackerHtml = `<div id="tracker-section" style="margin-top:16px;">${trackerSectionHtml(teamKey)}</div>`;

  if(meta.leagueKey !== 'epl' && !statsCache[teamKey]) ensureStats(teamKey, meta);
  const noteHtml = seasonNoteHtml(meta, null);

  if(!tiles){
    const entry = statsCache[teamKey];
    const body = (entry && entry.status === 'error')
      ? `<div class="no-live-note">Season stats aren't available for this team right now.</div>`
      : `<div class="loading-note">Loading season stats…</div>`;
    return noteHtml + body + splitHtml + trackerHtml;
  }

  return `
    ${noteHtml}
    <div class="stat-grid">
      ${tiles.map(t => `<div class="stat-tile"><div class="num">${t.num}</div><div class="lbl">${t.lbl}</div></div>`).join('')}
    </div>
    ${splitHtml}
    ${trackerHtml}
  `;
}

function ensureStats(teamKey, meta){
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(!row || !flat){ statsCache[teamKey] = { status: 'error', tiles: null }; return; }
  statsCache[teamKey] = { status: 'loading', tiles: null };
  fetchEspnTeamStatistics(flat.sportPath, row.id).then(byName => {
    statsCache[teamKey] = byName ? { status: 'ready', tiles: buildStatTiles(meta, byName) } : { status: 'error', tiles: null };
    if(state.teamKey === teamKey && state.activeTab === 'stats') renderTabBody();
  });
}

// NFL/MLB's per-game "allowed"/differential cells come from the
// standings row (js/standings-nfl.js's findEspnNflRow, js/standings-mlb.js's
// findEspnMlbRow) rather than the /statistics payload — that endpoint
// only carries this team's own offensive/defensive counting stats
// (tackles, sacks, at-bats, etc.), never an opponent-facing figure like
// points allowed (verified live, 2026-09-17: no such field exists
// anywhere in its response for either league).
function buildStatTiles(meta, byName){
  const val = name => byName[name] ? byName[name].displayValue : null;
  if(meta.leagueKey === 'nfl'){
    const row = findEspnNflRow(meta);
    const games = row ? (row.wins || 0) + (row.losses || 0) + (row.ties || 0) : 0;
    const ptsAllowed = (row && games) ? (row.pointsAgainst / games).toFixed(1) : '—';
    const turnover = byName.turnOverDifferential ? byName.turnOverDifferential.value : null;
    return [
      { num: val('totalPointsPerGame') ?? '—', lbl: 'Pts / Game' },
      { num: ptsAllowed, lbl: 'Pts Allowed' },
      { num: val('yardsPerGame') ?? '—', lbl: 'Yds / Game' },
      { num: turnover != null ? (turnover >= 0 ? `+${turnover}` : turnover) : '—', lbl: 'Turnover Diff' }
    ];
  }
  if(meta.leagueKey === 'mlb'){
    const row = findEspnMlbRow(meta);
    const diff = row ? row.pointDifferential : null;
    return [
      { num: val('avg') ?? '—', lbl: 'Team AVG' },
      { num: val('ERA') ?? '—', lbl: 'Team ERA' },
      { num: val('homeRuns') ?? '—', lbl: 'Home Runs' },
      { num: diff != null ? (diff >= 0 ? `+${diff}` : diff) : '—', lbl: 'Run Diff' }
    ];
  }
  return [];
}

function homeAwaySplitHtml(bundle){
  const sched = bundle && bundle.espnSchedule;
  if(!sched) return '';
  const played = sched.recent;
  // A bare "0-0 / 0-0" card says nothing — e.g. every NBA/College
  // Basketball team before its first game of the season.
  if(!played.length) return '';
  const split = { home: { w: 0, l: 0, d: 0 }, away: { w: 0, l: 0, d: 0 } };
  played.forEach(evt => {
    const side = evt.isHome ? split.home : split.away;
    if(evt.ownScore > evt.oppScore) side.w++;
    else if(evt.ownScore < evt.oppScore) side.l++;
    else side.d++;
  });
  const label = s => s.d ? `${s.w}-${s.d}-${s.l}` : `${s.w}-${s.l}`;
  return `
    <div class="modal-section-title" style="margin-top:16px;">Home / away split</div>
    <div class="split-card">
      <div class="split-row"><div class="split-label">Home</div><div class="split-values"><span class="split-record">${label(split.home)}</span></div></div>
      <div class="split-row"><div class="split-label">Away</div><div class="split-values"><span class="split-record">${label(split.away)}</span></div></div>
    </div>
  `;
}

// ---- Player-stats leagues (NBA/NHL/WNBA/CFB/College Basketball) ----

// One fetchEspnTeamPlayerStats call (js/espn.js) feeds these leagues'
// Stats tab (team tiles + team leaders) and the per-player stat line on
// their Roster tab. Stat names below are ESPN's own, verified live
// (2026-09-22) against each league's payload.
const statOf = (stats, name) => (stats && stats[name]) || null;
const dv = (stats, name) => { const s = statOf(stats, name); return s ? s.displayValue : null; };
const nv = (stats, name) => { const s = statOf(stats, name); return s && typeof s.value === 'number' ? s.value : null; };
const signed = n => n == null ? '—' : (n > 0 ? `+${n}` : String(n));

// Leaders need a minimum-games floor for per-game/percentage stats —
// otherwise a player with 2 garbage-time games at 100% tops "Save %".
// A quarter of the busiest player's games in that same group is loose
// enough to keep real rotation players and drop cameo appearances.
function qualified(players, gamesStat){
  if(!gamesStat) return players;
  const max = players.reduce((m, p) => Math.max(m, nv(p.stats, gamesStat) || 0), 0);
  return players.filter(p => (nv(p.stats, gamesStat) || 0) >= max * 0.25);
}

const BASKETBALL = {
  tiles: t => [
    { num: dv(t, 'avgPoints') ?? '—', lbl: 'Pts / Game' },
    { num: dv(t, 'avgRebounds') ?? '—', lbl: 'Reb / Game' },
    { num: dv(t, 'avgAssists') ?? '—', lbl: 'Ast / Game' },
    { num: dv(t, 'fieldGoalPct') != null ? `${dv(t, 'fieldGoalPct')}%` : '—', lbl: 'FG %' }
  ],
  leaders: [
    { group: 'game', stat: 'avgPoints', abbr: 'PTS', games: 'gamesPlayed' },
    { group: 'game', stat: 'avgRebounds', abbr: 'REB', games: 'gamesPlayed' },
    { group: 'game', stat: 'avgAssists', abbr: 'AST', games: 'gamesPlayed' },
    { group: 'game', stat: 'avgSteals', abbr: 'STL', games: 'gamesPlayed' },
    { group: 'game', stat: 'avgBlocks', abbr: 'BLK', games: 'gamesPlayed' }
  ],
  leaderUnit: 'per game',
  statLine: s => dv(s, 'avgPoints') == null ? null : {
    primary: `${dv(s, 'avgPoints')} PPG`,
    secondary: `${dv(s, 'avgRebounds') ?? '0'} RPG · ${dv(s, 'avgAssists') ?? '0'} APG`
  },
  sortKey: (p, s) => nv(s, 'avgPoints')
};

// NHL's skater group comes back named "team" (ESPN's own label for it —
// "Team Statistics"), goalies as "goalkeeping".
const NHL = {
  tiles: t => {
    const games = nv(t, 'games');
    const perGame = name => (games && nv(t, name) != null) ? (nv(t, name) / games).toFixed(2) : '—';
    return [
      { num: perGame('goals'), lbl: 'Goals / Game' },
      { num: dv(t, 'avgGoalsAgainst') ?? '—', lbl: 'GA / Game' },
      { num: dv(t, 'shootingPct') != null ? `${dv(t, 'shootingPct')}%` : '—', lbl: 'Shooting %' },
      { num: dv(t, 'savePct') ?? '—', lbl: 'Save %' }
    ];
  },
  leaders: [
    { group: 'team', stat: 'points', abbr: 'PTS' },
    { group: 'team', stat: 'goals', abbr: 'G' },
    { group: 'team', stat: 'assists', abbr: 'A' },
    { group: 'team', stat: 'plusMinus', abbr: '+/-', format: v => signed(v) },
    { group: 'goalkeeping', stat: 'wins', abbr: 'W' },
    { group: 'goalkeeping', stat: 'savePct', abbr: 'SV%', games: 'games' }
  ],
  leaderUnit: null,
  statLine: (s, p) => {
    if(p.positionAbbr === 'G'){
      if(dv(s, 'savePct') == null) return null;
      return {
        primary: `${dv(s, 'savePct')} SV%`,
        secondary: `${dv(s, 'wins') ?? 0}-${dv(s, 'losses') ?? 0}-${dv(s, 'overtimeLosses') ?? 0} · ${dv(s, 'avgGoalsAgainst') ?? '—'} GAA`
      };
    }
    if(dv(s, 'points') == null) return null;
    return { primary: `${dv(s, 'points')} PTS`, secondary: `${dv(s, 'goals') ?? 0}G · ${dv(s, 'assists') ?? 0}A` };
  },
  sortKey: (p, s) => p.positionAbbr === 'G' ? nv(s, 'games') : nv(s, 'points')
};

// Position order within each CFB roster group (ESPN's abbreviations) —
// same idea as NFL_POSITION_ORDER below, but CFB has no nflverse depth
// chart to sort by within a position, so production does that instead.
const CFB_POSITION_ORDER = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'OT', 'G', 'C', 'DE', 'DT', 'DL', 'LB', 'CB', 'S', 'DB', 'PK', 'K', 'P', 'LS'];

function cfbStatLine(s, p){
  const pos = p.positionAbbr;
  const nonzero = (name, label) => (nv(s, name) || 0) > 0 ? `${dv(s, name)} ${label}` : null;
  if(pos === 'QB' && dv(s, 'passingYards') != null){
    return { primary: `${dv(s, 'passingYards')} YDS`, secondary: `${dv(s, 'passingTouchdowns') ?? 0} TD · ${dv(s, 'interceptions') ?? 0} INT` };
  }
  if((pos === 'RB' || pos === 'FB') && dv(s, 'rushingYards') != null){
    return { primary: `${dv(s, 'rushingYards')} YDS`, secondary: `${dv(s, 'rushingAttempts') ?? 0} CAR · ${dv(s, 'rushingTouchdowns') ?? 0} TD` };
  }
  if((pos === 'WR' || pos === 'TE') && dv(s, 'receivingYards') != null){
    return { primary: `${dv(s, 'receivingYards')} YDS`, secondary: `${dv(s, 'receptions') ?? 0} REC · ${dv(s, 'receivingTouchdowns') ?? 0} TD` };
  }
  if((pos === 'PK' || pos === 'K') && dv(s, 'fieldGoalsMade') != null){
    return { primary: `${dv(s, 'fieldGoalsMade')}/${dv(s, 'fieldGoalAttempts') ?? 0} FG`, secondary: `${dv(s, 'extraPointsMade') ?? 0}/${dv(s, 'extraPointAttempts') ?? 0} XP` };
  }
  if(pos === 'P' && dv(s, 'grossAvgPuntYards') != null){
    return { primary: `${dv(s, 'grossAvgPuntYards')} AVG`, secondary: `${dv(s, 'punts') ?? 0} punts` };
  }
  if(p.group === 'Defense' && dv(s, 'totalTackles') != null){
    const extras = [nonzero('sacks', 'SACK'), nonzero('interceptions', 'INT')].filter(Boolean);
    return { primary: `${dv(s, 'totalTackles')} TKL`, secondary: extras.join(' · ') };
  }
  return null;
}

const CFB = {
  tiles: t => [
    { num: dv(t, 'totalPointsPerGame') ?? '—', lbl: 'Pts / Game' },
    { num: dv(t, 'yardsPerGame') ?? '—', lbl: 'Yds / Game' },
    { num: signed(nv(t, 'turnOverDifferential')), lbl: 'Turnover Diff' },
    { num: nv(t, 'thirdDownConvPct') != null ? `${nv(t, 'thirdDownConvPct').toFixed(1)}%` : '—', lbl: '3rd Down %' }
  ],
  leaders: [
    { group: 'passing', stat: 'passingYards', abbr: 'PASS', detail: s => `${dv(s, 'passingTouchdowns') ?? 0} TD · ${dv(s, 'interceptions') ?? 0} INT` },
    { group: 'rushing', stat: 'rushingYards', abbr: 'RUSH', detail: s => `${dv(s, 'rushingTouchdowns') ?? 0} TD` },
    { group: 'receiving', stat: 'receivingYards', abbr: 'REC', detail: s => `${dv(s, 'receptions') ?? 0} rec · ${dv(s, 'receivingTouchdowns') ?? 0} TD` },
    { group: 'defensive', stat: 'totalTackles', abbr: 'TKL' },
    { group: 'defensive', stat: 'sacks', abbr: 'SACK' },
    { group: 'defensive', stat: 'interceptions', abbr: 'INT' }
  ],
  leaderUnit: null,
  statLine: cfbStatLine,
  sortKey: (p, s) => {
    const pos = p.positionAbbr;
    if(pos === 'QB') return nv(s, 'passingYards');
    if(pos === 'RB' || pos === 'FB') return nv(s, 'rushingYards');
    if(pos === 'WR' || pos === 'TE') return nv(s, 'receivingYards');
    if(pos === 'PK' || pos === 'K') return nv(s, 'fieldGoalsMade');
    return nv(s, 'totalTackles');
  },
  positionOrder: CFB_POSITION_ORDER
};

const PLAYER_STATS_LEAGUES = { nba: BASKETBALL, wnba: BASKETBALL, mcbb: BASKETBALL, nhl: NHL, cfb: CFB };

function ensurePlayerStats(teamKey, meta){
  if(playerStatsCache[teamKey] && playerStatsCache[teamKey].status !== 'error') return;
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(!row || !flat){ playerStatsCache[teamKey] = { status: 'error', data: null }; return; }
  playerStatsCache[teamKey] = { status: 'loading', data: null };
  fetchEspnTeamPlayerStats(flat.sportPath, row.id).then(data => {
    playerStatsCache[teamKey] = data ? { status: 'ready', data } : { status: 'error', data: null };
    if(state.teamKey === teamKey && (state.activeTab === 'stats' || state.activeTab === 'squad')) renderTabBody();
  });
}

// Two different reasons a Stats tab isn't this season's scoring numbers,
// both flagged with the shared .prior-season-note (see
// PRIOR_SEASON_DISPLAY_LEAGUES in js/data.js): the league's drafted
// season hasn't started (MLB/WNBA — live, but non-scoring), or ESPN is
// serving last season because the current one hasn't tipped off yet
// (NBA/NHL/College Basketball each preseason).
function seasonNoteHtml(meta, data){
  if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(meta.leagueKey)){
    return `<div class="prior-season-note">Showing the '26 season, still in progress — points won't count until the '27 season.</div>`;
  }
  if(data && data.isPriorSeason){
    return `<div class="prior-season-note">Showing last season (${data.seasonLabel}) — the new season hasn't started yet.</div>`;
  }
  return '';
}

function leaderRowsHtml(cfg, data){
  return cfg.leaders.map(l => {
    const players = qualified(data.groups[l.group] || [], l.games).filter(p => nv(p.stats, l.stat) != null);
    if(!players.length) return '';
    const top = players.reduce((best, p) => nv(p.stats, l.stat) > nv(best.stats, l.stat) ? p : best);
    const value = l.format ? l.format(nv(top.stats, l.stat)) : dv(top.stats, l.stat);
    const sub = [top.position, l.detail ? l.detail(top.stats) : cfg.leaderUnit].filter(Boolean).join(' · ');
    return `
      <div class="player-row">
        <div class="number-chip leader-chip">${l.abbr}</div>
        <div class="player-main">
          <div class="player-name">${top.name}</div>
          <div class="player-sub">${sub}</div>
        </div>
        <div class="leader-value">${value}</div>
      </div>
    `;
  }).join('');
}

function playerStatsTabHtml(teamKey, meta, bundle){
  const cfg = PLAYER_STATS_LEAGUES[meta.leagueKey];
  const splitHtml = homeAwaySplitHtml(bundle);
  const trackerHtml = `<div id="tracker-section" style="margin-top:16px;">${trackerSectionHtml(teamKey)}</div>`;
  ensurePlayerStats(teamKey, meta);

  const entry = playerStatsCache[teamKey];
  if(!entry || entry.status !== 'ready'){
    const body = (entry && entry.status === 'error')
      ? `<div class="no-live-note">Season stats aren't available for this team right now.</div>`
      : `<div class="loading-note">Loading season stats…</div>`;
    return seasonNoteHtml(meta, null) + body + splitHtml + trackerHtml;
  }

  const data = entry.data;
  const leadersHtml = leaderRowsHtml(cfg, data);
  return `
    ${seasonNoteHtml(meta, data)}
    <div class="stat-grid">
      ${cfg.tiles(data.teamTotals).map(t => `<div class="stat-tile"><div class="num">${t.num}</div><div class="lbl">${t.lbl}</div></div>`).join('')}
    </div>
    ${leadersHtml ? `<div class="modal-section-title" style="margin-top:16px;">Team leaders</div>${leadersHtml}` : ''}
    <div class="news-footer-note">${data.seasonLabel ? data.seasonLabel + ' · ' : ''}Stats via ESPN</div>
    ${splitHtml}
    ${trackerHtml}
  `;
}

// Roster order for these leagues: most productive first (sortKey), then
// players with no stats yet (rookies/new signings — or everyone, if the
// stats call failed) by jersey. CFB additionally keeps positions
// together first (positionOrder), the way NFL's roster does. Groups
// themselves stay in fetched order (stable sort, same as sortNflRoster).
function sortPlayerStatsRoster(items, meta){
  const cfg = PLAYER_STATS_LEAGUES[meta.leagueKey];
  const entry = playerStatsCache[state.teamKey];
  const byAthlete = (entry && entry.data && entry.data.byAthlete) || {};
  const jerseyOf = p => parseInt(p.jersey, 10) || 999;
  const posRank = p => {
    if(!cfg.positionOrder) return 0;
    const idx = cfg.positionOrder.indexOf(p.positionAbbr);
    return idx === -1 ? cfg.positionOrder.length : idx;
  };
  return [...items].sort((a, b) => {
    if(a.group !== b.group) return 0;
    const posDiff = posRank(a) - posRank(b);
    if(posDiff) return posDiff;
    const ka = cfg.sortKey(a, byAthlete[String(a.id)]), kb = cfg.sortKey(b, byAthlete[String(b.id)]);
    if(ka != null && kb != null && ka !== kb) return kb - ka;
    if(ka != null && kb == null) return -1;
    if(ka == null && kb != null) return 1;
    return jerseyOf(a) - jerseyOf(b);
  });
}

function playerStatLineFor(p, meta){
  const cfg = PLAYER_STATS_LEAGUES[meta.leagueKey];
  if(!cfg) return null;
  const entry = playerStatsCache[state.teamKey];
  const stats = entry && entry.data && entry.data.byAthlete[String(p.id)];
  return stats ? cfg.statLine(stats, p) : null;
}

// ---- Squad tab ----

// A player's real production this season (goals+assists) — null when
// ESPN has no per-player stats for this league (NFL/MLB, see
// fetchEspnTeamRoster in js/espn.js) or this player hasn't featured yet.
function goalContribution(p){
  if(p.goals === null && p.assists === null) return null;
  return (p.goals || 0) + (p.assists || 0);
}

// Real report_status ('Out'/'Doubtful'/'Questionable', from nflverse's
// injury report — js/nflverse.js) when it's available for this player,
// falling back to ESPN's plain injured boolean (see fetchEspnTeamRoster
// in js/espn.js) for every league nflverse doesn't cover, or for an NFL
// player hurt badly enough to be off the roster's injury report cadence
// entirely (e.g. season-ending IR from before this week's report).
function injuryTagHtml(p, meta){
  const status = meta.leagueKey === 'nfl' ? nflverseInjuryStatus(p, meta) : null;
  if(status) return `<span class="player-tag ${status.toLowerCase()}">${status}</span>`;
  return p.injured ? `<span class="player-tag out">Out</span>` : '';
}

function playerRowHtml(p, meta){
  const tagsHtml = injuryTagHtml(p, meta);
  const contribution = goalContribution(p);
  const line = playerStatLineFor(p, meta);
  let statHtml = '';
  if(line) statHtml = `<div class="player-stat">${line.primary}${line.secondary ? `<div class="sub">${line.secondary}</div>` : ''}</div>`;
  else if(contribution !== null) statHtml = `<div class="player-stat">${p.goals || 0}G · ${p.assists || 0}A</div>`;
  // Class year for college rosters (no age there), age for pro ones.
  const detail = p.classYear || p.age;
  return `
    <div class="player-row">
      <div class="number-chip">${p.jersey || '—'}</div>
      <div class="player-main">
        <div class="player-name">${p.name}${tagsHtml}</div>
        <div class="player-sub">${p.position}${detail ? ' · ' + detail : ''}</div>
      </div>
      ${statHtml}
    </div>
  `;
}

// Ranks by real season output (goals + assists, ties broken by
// appearances as a "still gets picked" signal) instead of roster order —
// ESPN's own soccer roster sorts goalkeepers first, so the old first-4
// slice was showing a team's keepers instead of its stars (e.g.
// Manchester City's, ahead of Erling Haaland — confirmed live
// 2026-09-19). Falls back to plain roster order when a league has no
// per-player stats at all (goals/assists both null for every player —
// NFL/MLB today), rather than sorting everyone to a tied last place.
function keyPlayers(items){
  if(!items.some(p => goalContribution(p) !== null)) return items.slice(0, 4);
  return [...items].sort((a, b) => {
    const diff = (goalContribution(b) || 0) - (goalContribution(a) || 0);
    return diff || ((b.appearances || 0) - (a.appearances || 0));
  }).slice(0, 4);
}

// The coarse groups worth filtering a full roster by — NFL/MLB's own
// roster grouping (Offense/Defense/Special Teams, Pitchers/Catchers/...),
// not each player's fine position (16 distinct values on an NFL roster,
// which would make an unreadably long chip row — see
// fetchEspnTeamRoster in js/espn.js). In roster order, not alphabetized,
// so "Offense" leads for NFL the same way it does in the unfiltered list.
function squadPositionGroups(items){
  const groups = [];
  items.forEach(p => { if(p.group && !groups.includes(p.group)) groups.push(p.group); });
  return groups;
}

export function setSquadFilter(key){
  state.squadFilter = key;
  renderTabBody();
}
window.setSquadFilter = setSquadFilter;

// Fine-position display order — still the primary grouping key (see
// sortNflRoster below): it keeps every "Wide Receiver" together, every
// "Guard" together, etc., which nflverse's own per-formation pos_slot
// numbering doesn't reliably do (see bestDepthChartRank's comment).
// This alone used to be the ONLY ordering available at all (ESPN's own
// /teams/{id}/depthchart returns an empty {} for every team, confirmed
// live 2026-09-19 — no structured depth data anywhere in its hidden
// API); nflverse now supplies the real starter-vs-backup order *within*
// each of these positions instead of roster/jersey order.
const NFL_POSITION_ORDER = [
  'Quarterback', 'Running Back', 'Fullback', 'Wide Receiver', 'Tight End',
  'Offensive Tackle', 'Guard', 'Center',
  'Defensive End', 'Defensive Tackle', 'Linebacker', 'Cornerback', 'Safety',
  'Place Kicker', 'Punter', 'Long Snapper'
];

function nflPositionRank(position){
  const idx = NFL_POSITION_ORDER.indexOf(position);
  return idx === -1 ? NFL_POSITION_ORDER.length : idx;
}

// Real depth-chart rank (js/nflverse.js's pos_rank — starter=1,
// backup=2, ...) per player, used below to put a team's actual starter
// before its backups within a fine position instead of just roster
// order. NOT sourced from pos_slot's raw ordering, deliberately: a
// player's pos_slot is only a stable index WITHIN one nflverse pos_grp
// (personnel package), not comparable across them — e.g. Detroit's
// "3WR 1TE" package numbers its 3rd-WR slot (8) between the O-line
// (3-7) and QB (9), so sorting fine positions by raw slot number would
// put a backup WR ahead of the starting QB (confirmed live 2026-09-19).
// Grouping by ESPN's own position label first (nflPositionRank below,
// already reliable) and using rank only as the within-position tie-
// break keeps receivers with receivers, linemen with linemen, while
// still surfacing the real starter/backup order nflverse provides.
// Also prefers a player's non-"Special Teams" pos_grp row when they
// have both (e.g. a WR who's also the punt returner) — otherwise a
// receiver's PR/KR special-teams rank would override their actual WR
// depth rank.
function bestDepthChartRank(depthChart){
  const byId = {};
  depthChart.forEach(r => {
    if(!r.espn_id) return;
    const key = String(r.espn_id);
    const isST = r.pos_grp === 'Special Teams';
    const rank = parseInt(r.pos_rank, 10) || 999;
    const existing = byId[key];
    if(!existing || (existing.isST && !isST) || (existing.isST === isST && rank < existing.rank)){
      byId[key] = { rank, isST };
    }
  });
  return byId;
}

// Re-orders each broad group (Offense/Defense/...) by fine position
// (nflPositionRank), then by real depth-chart rank within that
// position — see bestDepthChartRank above for why depth-chart order
// alone isn't enough. Players nflverse doesn't chart at all (deep
// bench, practice squad, IR) fall back to jersey number and sort after
// every charted player at that position. Groups themselves stay in
// place — `a.group !== b.group` returning 0 relies on Array.sort being
// stable, so cross-group order is left exactly as fetched (the active
// roster still comes before Injured Reserve/Practice Squad in "All";
// only the order *inside* each group changes).
function sortNflRoster(items, meta){
  const byId = bestDepthChartRank(getTeamDepthChart(meta));
  const jerseyOf = p => parseInt(p.jersey, 10) || 999;

  return [...items].sort((a, b) => {
    if(a.group !== b.group) return 0;
    const posDiff = nflPositionRank(a.position) - nflPositionRank(b.position);
    if(posDiff) return posDiff;
    const ra = byId[String(a.id)], rb = byId[String(b.id)];
    if(ra && rb) return ra.rank - rb.rank || (jerseyOf(a) - jerseyOf(b));
    if(ra && !rb) return -1;
    if(!ra && rb) return 1;
    return jerseyOf(a) - jerseyOf(b);
  });
}

// The 3 broad NFL roster groups a real depth chart actually covers —
// Injured Reserve/Practice Squad/Suspended stay the plain player-row
// list (see fullRosterHtml below): a depth chart is inherently about
// who plays which role at what order, which doesn't mean anything for
// a player who isn't active.
const NFL_GRID_GROUPS = new Set(['Offense', 'Defense', 'Special Teams']);

// One row per real depth-chart SLOT, not per fine position — a fine
// position can be more than one slot (e.g. a 3-WR personnel package has
// 3 separate receiver slots, each with its own starter/backups; see
// bestDepthChartRank's comment for the same pos_slot-is-per-role point).
// `${pos_grp}|${pos_slot}` is the real per-role key nflverse uses;
// sorted by pos_slot ascending within each pos_grp (there's normally
// just one non-Special-Teams pos_grp per broad group, but the compound
// key keeps this correct if a team ever has more than one personnel
// package charted at once). Rows/cells are built entirely off the
// roster's own `group` field (via the espn_id join), not off nflverse's
// pos_grp text — nflverse's personnel-package names are scheme-specific
// strings ("3WR 1TE", "Base 4-3 D", ...) with no fixed vocabulary to
// pattern-match against, whereas the roster's Offense/Defense/Special
// Teams grouping (js/espn.js's NFL_ROSTER_GROUP_LABELS) is already
// reliable and is what every other grouping in this file uses.
function depthChartRowsFor(groupLabel, items, meta){
  const byEspnId = {};
  items.forEach(p => { byEspnId[String(p.id)] = p; });

  const bySlot = {};
  getTeamDepthChart(meta).forEach(r => {
    const player = byEspnId[String(r.espn_id)];
    if(!player) return;
    const isST = r.pos_grp === 'Special Teams';
    // Special Teams pulls every row nflverse itself charts under
    // "Special Teams", regardless of a player's own primary roster
    // group — a punt/kick returner is almost always a WR/RB on
    // offense first (confirmed live: Detroit's PR/KR slots are filled
    // by Tom Kennedy/Jacob Saylors/Tay Martin/Sione Vaki, all
    // roster-classified as Offense), so gating on roster group here
    // would silently drop every returner slot. Offense/Defense do the
    // opposite — excluding Special Teams rows and gating on the
    // roster's own group — so a returner's PR/KR row doesn't also leak
    // into their Offense grid entry alongside their real WR/RB slot.
    const matches = groupLabel === 'Special Teams' ? isST : (!isST && player.group === groupLabel);
    if(!matches) return;
    const key = `${r.pos_grp}|${r.pos_slot}`;
    const slotOrder = `${r.pos_grp} ${String(parseInt(r.pos_slot, 10) || 0).padStart(3, '0')}`;
    if(!bySlot[key]) bySlot[key] = { label: r.pos_abb || r.pos_name || '', slotOrder, entries: [] };
    bySlot[key].entries.push({ player, rank: parseInt(r.pos_rank, 10) || 999 });
  });

  return Object.values(bySlot)
    .sort((a, b) => a.slotOrder < b.slotOrder ? -1 : (a.slotOrder > b.slotOrder ? 1 : 0))
    .map(row => ({ label: row.label, entries: row.entries.sort((a, b) => a.rank - b.rank) }));
}

function depthChartCellHtml(entry, meta){
  const tag = injuryTagHtml(entry.player, meta);
  return `
    <div class="depth-chart-cell">
      <div class="depth-chart-player"><span class="num">${entry.player.jersey || '—'}</span>${entry.player.name}</div>
      ${tag}
    </div>
  `;
}

// A real position-by-position depth chart grid (position label column
// + one column per depth level, deepest first) instead of a flat
// player list — see depthChartRowsFor above for how rows/columns are
// derived. Columns are padded out to the widest row in this group so
// every row's Nth column lines up (a real depth chart reads as a
// spreadsheet, not a ragged list). Wrapped in an overflow-x scroller
// (same pattern as .filter-chips elsewhere in this app) with the
// position-label column pinned via position:sticky, since a full
// offensive or defensive depth chart is wider than a phone screen.
function depthChartGridHtml(groupLabel, items, meta){
  const rows = depthChartRowsFor(groupLabel, items, meta);
  if(!rows.length) return '';
  const maxCols = rows.reduce((m, r) => Math.max(m, r.entries.length), 1);
  const rowsHtml = rows.map(row => {
    const cells = row.entries.map(e => depthChartCellHtml(e, meta)).join('');
    const pad = '<div class="depth-chart-cell"></div>'.repeat(maxCols - row.entries.length);
    return `<div class="depth-chart-pos">${row.label}</div>${cells}${pad}`;
  }).join('');
  return `
    <div class="depth-chart-wrap">
      <div class="depth-chart" style="grid-template-columns: 42px repeat(${maxCols}, minmax(104px, 1fr));">
        ${rowsHtml}
      </div>
    </div>
  `;
}

// NFL/MLB rosters (50-90 players, no reliable "star" signal to build a
// teaser from — see keyPlayers above) skip the curated-teaser +
// separate full-screen pattern EPL uses below entirely: the whole
// roster is listed right here in the tab, narrowed by the same
// filter-chip look every other jump-nav in this app already uses,
// instead of a "Full roster ›" link off to its own screen. For NFL,
// Offense/Defense/Special Teams render as a real depth-chart grid
// (see depthChartGridHtml) once nflverse's data has loaded; Injured
// Reserve/Practice Squad/Suspended (and everything for MLB, and NFL
// before that data is ready) stay the plain player-row list — a depth
// chart doesn't mean anything for players who aren't active.
function fullRosterHtml(entry, meta){
  const groups = squadPositionGroups(entry.items);
  // No "All" chip — a combined Offense+Defense+Special Teams+IR+...
  // view doesn't read as one coherent thing once Offense/Defense/
  // Special Teams are real depth-chart grids (see depthChartGridHtml)
  // rather than plain rows, so this always shows exactly one group.
  // groups[0] is Offense for NFL (ESPN's own roster group order —
  // squadPositionGroups' comment), so that's the default the first
  // time this renders for a team.
  const filter = groups.includes(state.squadFilter) ? state.squadFilter : groups[0];
  const chips = groups.map(g => {
    return `<div class="filter-chip ${g === filter ? 'active' : ''}" onclick="setSquadFilter('${g.replace(/'/g, '')}')">${g}</div>`;
  }).join('');

  const hasDepthChart = meta.leagueKey === 'nfl' && getTeamDepthChart(meta).length > 0;

  const sectionHtml = group => {
    if(hasDepthChart && NFL_GRID_GROUPS.has(group)){
      const grid = depthChartGridHtml(group, entry.items, meta);
      if(grid) return grid;
    }
    const base = meta.leagueKey === 'nfl' ? sortNflRoster(entry.items, meta)
      : (PLAYER_STATS_LEAGUES[meta.leagueKey] ? sortPlayerStatsRoster(entry.items, meta) : entry.items);
    return base.filter(p => p.group === group).map(p => playerRowHtml(p, meta)).join('');
  };

  // Stat lines on this tab come from the same fetch as the Stats tab —
  // say which season they are when ESPN is serving last year's.
  const statsEntry = PLAYER_STATS_LEAGUES[meta.leagueKey] ? playerStatsCache[state.teamKey] : null;
  const statsData = statsEntry && statsEntry.data;
  const footer = statsData ? `<div class="news-footer-note" style="margin-top:12px;">Stats: ${statsData.seasonLabel}${statsData.isPriorSeason ? ' (last season)' : ''}</div>` : '';

  // Basketball rosters (NBA/WNBA/College Basketball) aren't grouped at
  // all — ~15 players reads fine as one list, so no chips there.
  if(!groups.length){
    return entry.items.length ? sectionHtml(null) + footer : `<div class="no-live-note">No players listed.</div>`;
  }

  const body = filter ? (sectionHtml(filter) || `<div class="no-live-note">No players in this group.</div>`) : `<div class="no-live-note">No players in this group.</div>`;

  return `<div class="filter-chips">${chips}</div>${body}${footer}`;
}

function squadTabHtml(teamKey){
  const entry = rosterCache[teamKey];
  const meta = TEAM_META[teamKey];
  if(!entry || entry.status === 'loading') return `<div class="loading-note">Loading squad…</div>`;
  if(entry.status === 'error' || !entry.items.length) return `<div class="no-live-note">Squad list isn't available for this team right now.</div>`;

  if(meta.leagueKey !== 'epl') return fullRosterHtml(entry, meta);

  const top = keyPlayers(entry.items);
  return `
    <div class="modal-section-title">Key players</div>
    ${top.map(p => playerRowHtml(p, meta)).join('')}
    <div style="text-align:center; padding-top:14px;">
      <span class="boxscore-link" style="justify-content:center;" onclick="openFullSquad('${teamKey}')">Full squad <span class="chev">›</span></span>
    </div>
  `;
}

function ensureRoster(teamKey){
  const meta = TEAM_META[teamKey];
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(meta.leagueKey === 'nfl') ensureNflverse();
  if(!row || !flat){ rosterCache[teamKey] = { status: 'error', items: [] }; return; }
  if(rosterCache[teamKey] && rosterCache[teamKey].status !== 'error') return;

  rosterCache[teamKey] = { status: 'loading', items: [] };
  fetchEspnTeamRoster(flat.sportPath, row.id).then(items => {
    rosterCache[teamKey] = items ? { status: 'ready', items } : { status: 'error', items: [] };
    if(state.teamKey === teamKey && state.activeTab === 'squad') renderTabBody();
  });
}

// ---- Injuries tab (NFL only — see TABS above) ----

// One shared fetch covers every NFL team (js/nflverse.js's byTeam
// blobs), so unlike ensureRoster/ensureStats/ensureNews above this
// isn't keyed per team. Guarded the same way those are (bail once
// there's nothing left to do) rather than unconditionally chaining a
// re-render onto every call — renderTabBody() is itself a caller of
// this function (via ensureRoster/the injuries tab), so an unguarded
// version here would re-queue its own .then on every single render,
// forever, the moment both caches are already warm.
let nflverseRenderPending = false;
function ensureNflverse(){
  if(nflverseDepthChartCache.byTeam && nflverseInjuriesCache.byTeam) return;
  if(nflverseRenderPending) return;
  nflverseRenderPending = true;
  Promise.all([fetchNflverseDepthChartCached(), fetchNflverseInjuriesCached()]).then(() => {
    nflverseRenderPending = false;
    const meta = TEAM_META[state.teamKey];
    if(meta && meta.leagueKey === 'nfl' && (state.activeTab === 'squad' || state.activeTab === 'injuries')) renderTabBody();
  });
}

const INJURY_STATUS_ORDER = { Out: 0, Doubtful: 1, Questionable: 2 };

function injuryRowHtml(row){
  const status = row.report_status || '';
  const tag = status ? `<span class="player-tag ${status.toLowerCase()}">${status}</span>` : '';
  const injury = row.report_primary_injury || row.practice_primary_injury || '';
  return `
    <div class="player-row">
      <div class="player-main">
        <div class="player-name">${row.full_name}${tag}</div>
        <div class="player-sub">${row.position}${injury ? ' · ' + injury : ''}</div>
      </div>
      <div class="player-stat">${row.practice_status || ''}</div>
    </div>
  `;
}

function injuriesTabHtml(meta){
  if(!nflverseInjuriesCache.byTeam) return `<div class="loading-note">Loading injury report…</div>`;
  const rows = getTeamInjuries(meta);
  if(!rows.length) return `<div class="no-live-note">No injuries reported for ${meta.name} this week.</div>`;

  const sorted = [...rows].sort((a, b) => {
    const oa = a.report_status in INJURY_STATUS_ORDER ? INJURY_STATUS_ORDER[a.report_status] : 3;
    const ob = b.report_status in INJURY_STATUS_ORDER ? INJURY_STATUS_ORDER[b.report_status] : 3;
    return oa - ob;
  });
  return `
    <div class="modal-section-title">This week's injury report</div>
    ${sorted.map(injuryRowHtml).join('')}
  `;
}

// ---- Full Schedule screen ----

export function setFullScheduleFilter(key){
  renderFullSchedule(key);
}
window.setFullScheduleFilter = setFullScheduleFilter;

function renderFullSchedule(filter){
  const el = document.getElementById('team-schedule-content');
  if(!el) return;
  const teamKey = state.teamKey;
  const meta = TEAM_META[teamKey];
  const bundle = liveDataCache[teamKey];
  const sched = bundle && bundle.espnSchedule;

  const chips = ['all', 'results', 'fixtures'].map(key => {
    const label = key === 'all' ? 'All' : (key === 'results' ? 'Results' : 'Fixtures');
    return `<div class="filter-chip ${key === filter ? 'active' : ''}" onclick="setFullScheduleFilter('${key}')">${label}</div>`;
  }).join('');

  let bodyHtml = `<div class="loading-note">Loading schedule…</div>`;
  if(sched){
    const events = [...sched.recent.map(e => ({ ...e, played: true })), ...sched.upcoming.map(e => ({ ...e, played: false }))]
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const shown = events.filter(e => filter === 'all' || (filter === 'results' && e.played) || (filter === 'fixtures' && !e.played));

    let lastMonth = null;
    bodyHtml = shown.map(evt => {
      const d = new Date(evt.date);
      const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
      const monthHtml = month !== lastMonth ? `<div class="standings-group-header">${month}</div>` : '';
      lastMonth = month;
      const rowHtml = evt.played ? resultRowHtml(teamKey, evt) : upcomingRowHtml(evt);
      return monthHtml + rowHtml;
    }).join('') || `<div class="no-live-note">Nothing to show here.</div>`;
  }

  el.innerHTML = `
    <div class="team-page-nav">
      <button class="team-page-back" onclick="backFromFullScreen()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>
        ${meta.name}
      </button>
    </div>
    <div class="page-header" style="padding: 0 4px 4px;">
      <h1 style="font-size:22px;">Schedule</h1>
      <div class="page-sub">${meta.name}</div>
    </div>
    <div class="filter-chips">${chips}</div>
    <div class="tab-body" style="min-height:0;">${bodyHtml}</div>
  `;
}

// ---- Full Squad screen ----
// EPL-only from here down (see squadTabHtml above) — NFL/MLB list their
// whole roster inline in the tab instead (fullRosterHtml above), so this
// screen never opens for them. EPL's own position spread (Goalkeeper/
// Defender/Midfielder/Forward) is small enough that filtering by each
// player's fine `position` reads fine as-is, unlike NFL/MLB's 16/11
// fine-grained values — no coarse `group` needed here.

export function setFullSquadFilter(key){
  renderFullSquad(key);
}
window.setFullSquadFilter = setFullSquadFilter;

function renderFullSquad(filter){
  const el = document.getElementById('team-squad-content');
  if(!el) return;
  const teamKey = state.teamKey;
  const meta = TEAM_META[teamKey];
  const entry = rosterCache[teamKey];

  const groups = ['all', ...new Set((entry && entry.items || []).map(p => p.position).filter(Boolean))];
  const chips = groups.map(g => {
    const label = g === 'all' ? 'All' : g;
    return `<div class="filter-chip ${g === filter ? 'active' : ''}" onclick="setFullSquadFilter('${g.replace(/'/g, '')}')">${label}</div>`;
  }).join('');

  let bodyHtml = `<div class="loading-note">Loading squad…</div>`;
  if(entry && entry.status === 'ready'){
    const shown = filter === 'all' ? entry.items : entry.items.filter(p => p.position === filter);
    bodyHtml = shown.map(p => playerRowHtml(p, meta)).join('') || `<div class="no-live-note">No players in this group.</div>`;
  } else if(entry && entry.status === 'error'){
    bodyHtml = `<div class="no-live-note">Squad list isn't available for this team right now.</div>`;
  }

  el.innerHTML = `
    <div class="team-page-nav">
      <button class="team-page-back" onclick="backFromFullScreen()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"></path></svg>
        ${meta.name}
      </button>
    </div>
    <div class="page-header" style="padding: 0 4px 4px;">
      <h1 style="font-size:22px;">Squad</h1>
      <div class="page-sub">${meta.name}${entry && entry.items.length ? ` · ${entry.items.length} players` : ''}</div>
    </div>
    <div class="filter-chips">${chips}</div>
    <div class="tab-body" style="min-height:0;">${bodyHtml}</div>
  `;
  if(!entry) ensureRoster(teamKey);
}
