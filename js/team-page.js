/* ============================================================
   Team Page: a real, navigable screen for a single team — the
   destination the trimmed team modal (js/live-data.js's openTeamModal)
   hands off to, and what a Standings row now pushes to directly. Owns
   its own three "screens" (the page itself, plus the Full Schedule and
   Full Squad screens behind its footer links) and their push/pop
   navigation, tab state, and the News/Roster/Stats fetches unique to
   this view.

   Full 4-tab treatment (Schedule/News/Stats/Squad) ships for every
   league in FLAT_SCHEDULE_LEAGUES (EPL/NFL/MLB/NBA/NHL/WNBA/CFB/CBB) —
   News only needs a team's ESPN id and sportPath (see ensureNews
   below), so it was never restricted the way Stats/Squad are.
   Roster/team-stats endpoints were only curled and verified for EPL,
   NFL and MLB (see js/espn.js's fetchEspnTeamRoster/
   fetchEspnTeamStatistics header comments and FULL_STATS_SQUAD_LEAGUES
   below) — every other FLAT_SCHEDULE_LEAGUES league (College Basketball
   included, added 2026-09-17) gets a real page and a working News tab,
   just a plain "not available yet" placeholder for Stats/Squad until
   those get their own design pass.

   Pushed/popped via the functions below, not switchView() — switchView
   also drives the bottom tab bar's active state off a fixed data-view
   whitelist that doesn't include these views, and the design wants
   whichever real tab was active before the push to stay lit ("Standings
   is the active tab throughout"). So this toggles `.view.active`
   directly (the same primitive switchView uses) and leaves the tab bar
   alone.
   ============================================================ */
import { TEAM_META, LEAGUES, DRAFT_TEAMS } from './data.js';
import { teamBadgeHtml, crestSrc, updateUrlParam, segmentedControlHtml } from './utils.js';
import { fetchEspnTeamNews, fetchEspnTeamRoster, fetchEspnTeamStatistics } from './espn.js';
import {
  FLAT_SCHEDULE_LEAGUES, GAME_DETAIL_LEAGUES, liveDataCache, fetchTeamBundle,
  renderStats, renderNext, formStripHtml, seasonStatus
} from './live-data.js';
import { findEspnEplRow } from './standings-epl.js';
import { findEspnNflRow } from './standings-nfl.js';
import { findEspnMlbRow } from './standings-mlb.js';
import { favoriteStarHtml } from './favorites.js';
import { trackerSectionHtml } from './league-facts.js';

// The 3 leagues with a verified roster/team-stats source (see this
// file's header comment) — every other FLAT_SCHEDULE_LEAGUES league
// still gets a real page + Schedule + News tab, just a placeholder
// Stats/Squad.
const FULL_STATS_SQUAD_LEAGUES = ['epl', 'nfl', 'mlb'];

const TABS = {
  epl: [{ key: 'schedule', label: 'Schedule' }, { key: 'news', label: 'News' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Squad' }],
  nfl: [{ key: 'schedule', label: 'Schedule' }, { key: 'news', label: 'News' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Roster' }],
  mlb: [{ key: 'schedule', label: 'Schedule' }, { key: 'news', label: 'News' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Roster' }]
};
function tabsFor(leagueKey){
  return TABS[leagueKey] || [{ key: 'schedule', label: 'Schedule' }, { key: 'news', label: 'News' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Squad' }];
}

const EMPTY_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"></path><path d="M15 3v4h4"></path><path d="M9 13h6M9 17h6"></path></svg>';

// ---- Module state ----
// Only one Team Page (and one full-screen behind it) is ever open at
// once, so this is a single object rather than a map — cached per-team
// data lives in the *Cache objects below instead, so switching away and
// back to the same team's page doesn't refetch.
const state = { teamKey: null, originView: 'board', originScrollY: 0, activeTab: 'schedule', squadFilter: 'all' };

const newsCache = {};   // teamKey -> { status: 'idle'|'loading'|'ready'|'empty'|'error', items }
const rosterCache = {}; // teamKey -> { status, items }
const statsCache = {};  // teamKey -> { status, data } — `data` shape is league-specific, built in computeStatsTiles

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
  state.squadFilter = 'all';
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
    return;
  }
  if(state.activeTab === 'news'){
    el.innerHTML = newsTabHtml(teamKey);
    ensureNews(teamKey);
    return;
  }
  if(state.activeTab === 'stats'){
    if(!fullFeature){
      el.innerHTML = `<div class="placeholder-tab">Season stats for this league aren't built yet — check back once it gets its own design pass.</div>`;
      return;
    }
    el.innerHTML = statsTabHtml(teamKey, meta, bundle);
    return;
  }
  if(state.activeTab === 'squad'){
    if(!fullFeature){
      el.innerHTML = `<div class="placeholder-tab">A full roster for this league isn't built yet — check back once it gets its own design pass.</div>`;
      return;
    }
    el.innerHTML = squadTabHtml(teamKey);
    ensureRoster(teamKey);
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
  if(!bundle) return `<div class="loading-note">Loading schedule…</div>`;
  const sched = bundle.espnSchedule;
  if(!sched) return `<div class="no-live-note">Schedule isn't available for this team yet.</div>`;

  const recent = sched.recent.slice(0, 3);
  const upcoming = sched.upcoming.slice(0, 2);

  return `
    <div class="modal-section-title">Recent form</div>
    ${formStripHtml(sched.recent)}
    ${recent.map(evt => resultRowHtml(teamKey, evt)).join('') || '<div class="loading-note">No results yet.</div>'}
    <div class="modal-section-title" style="margin-top:16px;">Upcoming</div>
    ${upcoming.map(upcomingRowHtml).join('') || '<div class="loading-note">Nothing scheduled yet.</div>'}
    <div style="text-align:center; padding-top:14px;">
      <span class="boxscore-link" style="justify-content:center;" onclick="openFullSchedule('${teamKey}')">Full schedule <span class="chev">›</span></span>
    </div>
  `;
}

// ---- News tab ----

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
    if(state.teamKey === teamKey && state.activeTab === 'news') renderTabBody();
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

  if(!tiles){
    const entry = statsCache[teamKey];
    const body = (entry && entry.status === 'error')
      ? `<div class="no-live-note">Season stats aren't available for this team right now.</div>`
      : `<div class="loading-note">Loading season stats…</div>`;
    return body + splitHtml + trackerHtml;
  }

  return `
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

// ---- Squad tab ----

// A player's real production this season (goals+assists) — null when
// ESPN has no per-player stats for this league (NFL/MLB, see
// fetchEspnTeamRoster in js/espn.js) or this player hasn't featured yet.
function goalContribution(p){
  if(p.goals === null && p.assists === null) return null;
  return (p.goals || 0) + (p.assists || 0);
}

function playerRowHtml(p){
  const tagsHtml = p.injured ? `<span class="player-tag out">Out</span>` : '';
  const contribution = goalContribution(p);
  const statHtml = contribution !== null ? `<div class="player-stat">${p.goals || 0}G · ${p.assists || 0}A</div>` : '';
  return `
    <div class="player-row">
      <div class="number-chip">${p.jersey || '—'}</div>
      <div class="player-main">
        <div class="player-name">${p.name}${tagsHtml}</div>
        <div class="player-sub">${p.position}${p.age ? ' · ' + p.age : ''}</div>
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

// There's no real depth chart anywhere in ESPN's hidden API for NFL to
// sort by — confirmed live 2026-09-19: /teams/{id}/depthchart returns
// an empty {} for every team, and the per-athlete endpoint only links
// out to ESPN's own HTML depth chart page rather than returning
// structured data. This fixed position order is the next best thing:
// good enough to read like a depth chart (quarterbacks before backup
// linemen) without pretending to know who's actually WR1 vs WR3.
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

// Re-orders each broad group (Offense/Defense/...) by that position
// priority instead of ESPN's own within-group order (closer to
// alphabetical-by-first-name than anything position-based — see
// fetchEspnTeamRoster's header comment in js/espn.js). Groups themselves
// stay in place — `a.group !== b.group` returning 0 relies on Array.sort
// being stable, so cross-group order is left exactly as fetched (the
// active roster still comes before Injured Reserve/Practice Squad in
// "All"; only the order *inside* each group changes).
function sortNflRoster(items){
  return [...items].sort((a, b) => {
    if(a.group !== b.group) return 0;
    return nflPositionRank(a.position) - nflPositionRank(b.position) || ((parseInt(a.jersey, 10) || 999) - (parseInt(b.jersey, 10) || 999));
  });
}

// NFL/MLB rosters (50-90 players, no reliable "star" signal to build a
// teaser from — see keyPlayers above) skip the curated-teaser +
// separate full-screen pattern EPL uses below entirely: the whole
// roster is listed right here in the tab, narrowed by the same
// filter-chip look every other jump-nav in this app already uses,
// instead of a "Full roster ›" link off to its own screen.
function fullRosterHtml(entry, meta){
  const groups = squadPositionGroups(entry.items);
  const filter = groups.includes(state.squadFilter) ? state.squadFilter : 'all';
  const chips = ['all', ...groups].map(g => {
    const label = g === 'all' ? 'All' : g;
    return `<div class="filter-chip ${g === filter ? 'active' : ''}" onclick="setSquadFilter('${g.replace(/'/g, '')}')">${label}</div>`;
  }).join('');
  const base = meta.leagueKey === 'nfl' ? sortNflRoster(entry.items) : entry.items;
  const shown = filter === 'all' ? base : base.filter(p => p.group === filter);
  const rows = shown.map(playerRowHtml).join('') || `<div class="no-live-note">No players in this group.</div>`;
  return `<div class="filter-chips">${chips}</div>${rows}`;
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
    ${top.map(playerRowHtml).join('')}
    <div style="text-align:center; padding-top:14px;">
      <span class="boxscore-link" style="justify-content:center;" onclick="openFullSquad('${teamKey}')">Full squad <span class="chev">›</span></span>
    </div>
  `;
}

function ensureRoster(teamKey){
  const meta = TEAM_META[teamKey];
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(!row || !flat){ rosterCache[teamKey] = { status: 'error', items: [] }; return; }
  if(rosterCache[teamKey] && rosterCache[teamKey].status !== 'error') return;

  rosterCache[teamKey] = { status: 'loading', items: [] };
  fetchEspnTeamRoster(flat.sportPath, row.id).then(items => {
    rosterCache[teamKey] = items ? { status: 'ready', items } : { status: 'error', items: [] };
    if(state.teamKey === teamKey && state.activeTab === 'squad') renderTabBody();
  });
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
    bodyHtml = shown.map(playerRowHtml).join('') || `<div class="no-live-note">No players in this group.</div>`;
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
