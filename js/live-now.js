/* ============================================================
   Today: every drafted team's game for one calendar day, live games
   pinned to the top and the rest grouped by league — the whole slate,
   not just what's in progress (which is all the old "Live Now" could
   show). Three things this needs that the old view didn't:

     1. A date. The old view scanned liveDataCache, which only ever
        holds RIGHT NOW. This fetches ESPN's scoreboard for an explicit
        day (`?dates=YYYYMMDD` — see fetchEspnScoreboard in js/espn.js,
        which now takes that parameter), so the ‹ › arrows can walk
        backward/forward through real slates.
     2. Scheduled + final games, not only in-progress ones. One
        scoreboard response already carries all three states
        (`state: 'pre' | 'in' | 'post'`), so this is the same request,
        just not filtered down to `'in'`.
     3. Drafted-team matching by name. The old view walked
        liveDataCache by teamKey, which already knew each team's ESPN
        id. Starting from a date's scoreboard instead, the events come
        first and the drafted teams have to be found in them — done by
        exact nickname match (ESPN's `team.name`, e.g. "Cavaliers",
        which is exactly what TEAM_META.name holds), the same
        convention findFlatTeamKey in js/standings-flat.js uses, with
        findDraftedTeamByName as the fuzzy fallback.

   College Basketball joined FLAT_SCHEDULE_LEAGUES (js/live-data.js) on
   2026-09-17 once ESPN's hidden API was confirmed to cover it, so it's
   included here as a full 8th league now — TheRundown-only before that,
   and simply absent from this view entirely before that. Its
   draftedTeamFor match goes by ESPN team id, not name — see that
   function's own comment for why.
   ============================================================ */
import { TEAM_META, DRAFT_TEAMS, LEAGUES } from './data.js';
import { fetchEspnScoreboard } from './espn.js';
import { FLAT_SCHEDULE_LEAGUES, GAME_DETAIL_LEAGUES, fetchEspnScoreboardCached } from './live-data.js';
import { teamBadgeHtml, abbrFromName, normalizeTeamName, findDraftedTeamByName, findCfbTeamKeyByLocation, segmentedControlHtml, lockBodyScroll, unlockBodyScroll, enableSheetSwipeToDismiss, CHECK_ICON_SVG } from './utils.js';
import { currentProfileId } from './identity.js';
import { isFavorite, favoriteStarHtml } from './favorites.js';

// ---- View state (module-local, same "not persisted" convention as
// the old liveNowFilterKey — which day and which filter are cheap to
// re-pick and stale the moment the slate changes). `dayOffset` is in
// whole days from today; 0 is today. ----
let dayOffset = 0;
let filterKey = 'all'; // 'live' | 'upcoming' | 'all' — game STATE

// Team SCOPE — a different axis from filterKey above, and independent
// toggles rather than one exclusive choice: both can be on at once
// ("Drafted + Favorites, nothing else"), and "all" is just shorthand
// for "neither restriction is on". See the ghost chip/sheet below.
const scopeFilter = { mine: false, fav: false };
function scopeIsAll(){ return !scopeFilter.mine && !scopeFilter.fav; }

// ---- Day slate fetching ----
// One scoreboard request per sportPath per day. Today (offset 0) goes
// through live-data.js's own fetchEspnScoreboardCached instead of a
// second cache here — that same "today" scoreboard is already being
// fetched/cached there for the background refresh/sweep loops, so a
// separate cache in this file would just double the real ESPN calls
// while the Today tab is open. Any other day is finished or not
// started, so it's cached hard here — walking back and forth through
// the arrows shouldn't refetch anything.
const OTHER_DAY_TTL_MS = 15 * 60 * 1000;
const dayScoreboardCache = {}; // `${sportPath}|${yyyymmdd}` -> { data, fetchedAt }

function yyyymmdd(date){
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}${m}${d}`;
}

function dateForOffset(offset){
  const d = new Date();
  d.setHours(12, 0, 0, 0); // midday anchor so DST shifts can't roll the date
  d.setDate(d.getDate() + offset);
  return d;
}

async function fetchDayScoreboard(sportPath, offset){
  if(offset === 0) return fetchEspnScoreboardCached(sportPath);
  const key = `${sportPath}|${yyyymmdd(dateForOffset(offset))}`;
  const cached = dayScoreboardCache[key];
  if(cached && Date.now() - cached.fetchedAt < OTHER_DAY_TTL_MS) return cached.data;
  const data = await fetchEspnScoreboard(sportPath, yyyymmdd(dateForOffset(offset)));
  dayScoreboardCache[key] = { data, fetchedAt: Date.now() };
  return data;
}

// Exact nickname match first — ESPN's competitor.teamNickname is the
// bare "Cavaliers"/"Padres", byte-identical to this app's own
// TEAM_META.name, so this is a lookup rather than a guess. The fuzzy
// findDraftedTeamByName fallback exists for the handful of clubs whose
// names don't line up (EPL's "Man City" etc — see TEAM_NAME_ALIASES in
// js/utils.js); it's second, not first, because its substring rule has
// a known false positive ("Nets" inside "Hornets").
//
// Both college leagues skip that pair entirely, for the same underlying
// reason: TEAM_META's entries for them are keyed by school ("Houston",
// "Texas"), not ESPN's mascot-based nickname ("Cougars", "Longhorns"),
// so the exact-nickname check can never match, and the substring
// fallback has real collisions of its own within college sports' many
// nested school names ("Texas" is a literal substring of "Texas Tech"
// and "North Texas", all separately relevant — this app's mcbb roster
// drafts both "Texas" and "Texas Tech", and CFB's Scores tab was once
// misattributing "North Texas" games to drafted "Texas", confirmed live
// 2026-09-19). College Basketball matches by competitor.teamId (ESPN's
// own numeric id) against TEAM_META's espnTeamId instead — see
// js/standings-cbb.js's header comment for the full Texas/Texas Tech
// case. CFB matches on competitor.location instead
// (findCfbTeamKeyByLocation, js/utils.js — the same lookup
// standings-cfb.js uses), since ESPN's `location` is unique per school.
function draftedTeamFor(leagueKey, competitor){
  if(leagueKey === 'cfb') return findCfbTeamKeyByLocation(competitor.location);
  const league = LEAGUES.find(l => l.key === leagueKey);
  if(!league) return null;
  if(leagueKey === 'mcbb'){
    return league.teams.find(teamKey => TEAM_META[teamKey].espnTeamId === competitor.teamId) || null;
  }
  const nickname = normalizeTeamName(competitor.teamNickname || '');
  const exact = league.teams.find(teamKey => normalizeTeamName(TEAM_META[teamKey].name) === nickname);
  return exact || findDraftedTeamByName(leagueKey, competitor.teamName);
}

function ownerName(draftTeamId){
  const d = DRAFT_TEAMS.find(x => x.id === draftTeamId);
  return d ? d.name : '';
}

// A synthetic "team" for a side nobody drafted. ESPN's scoreboard
// already hands back that side's own real crest (competitor.logoUrl) —
// same "real logo over a generic monogram" treatment
// renderCfbRankingRow (js/standings-cfb.js) gives undrafted ranked
// teams — so this is only a fallback for the rare team with no logo,
// via teamBadgeHtml's own onerror handler.
function opponentMeta(name, logoUrl){
  return {
    name,
    badgeText: abbrFromName(name),
    badgeStyle: 'background:var(--surface-2); color:var(--text-sub);',
    badgeUrl: logoUrl || null
  };
}

// Normalizes one scoreboard event into everything a row needs, or null
// if no drafted team is in it (the whole point of this view — ESPN's
// slate is every game in the league, this app only cares about the
// ones somebody owns).
function buildGame(league, event){
  const home = event.competitors.find(c => c.homeAway === 'home');
  const away = event.competitors.find(c => c.homeAway === 'away');
  if(!home || !away) return null;

  const sides = [away, home].map(c => {
    const teamKey = draftedTeamFor(league.key, c);
    const meta = teamKey ? TEAM_META[teamKey] : opponentMeta(c.teamName, c.logoUrl);
    return {
      teamKey,
      meta,
      owner: teamKey ? ownerName(meta.draftTeamId) : '',
      isMine: !!teamKey && meta.draftTeamId === currentProfileId,
      isFav: !!teamKey && isFavorite(teamKey),
      score: c.score
    };
  });
  if(!sides.some(s => s.teamKey)) return null;

  const state = event.state === 'in' ? 'live' : event.completed ? 'final' : 'pre';
  return {
    id: event.id,
    leagueKey: league.key,
    state,
    away: sides[0],
    home: sides[1],
    // ESPN's own shortDetail is already the right string in every
    // state: "Top 7th"/"Q3 4:12" live, "Final"/"Final/10" done,
    // "9:15 PM EDT" scheduled — no per-sport formatting needed here.
    detail: event.detail || '',
    date: event.date ? new Date(event.date) : null
  };
}

// A game matches the current scope if either side satisfies whichever
// toggle(s) are on — an "OR" across sides and across toggles, so a
// Drafted+Favorites combo shows a game if it has either.
function gameMatchesScope(game){
  if(scopeIsAll()) return true;
  return [game.away, game.home].some(s => (scopeFilter.mine && s.isMine) || (scopeFilter.fav && s.isFav));
}

async function collectDay(offset){
  const leagues = LEAGUES.filter(l => FLAT_SCHEDULE_LEAGUES[l.key]);
  const boards = await Promise.all(leagues.map(l => fetchDayScoreboard(FLAT_SCHEDULE_LEAGUES[l.key].sportPath, offset)));
  const byLeague = {};
  leagues.forEach((league, i) => {
    const board = boards[i];
    if(!board || !Array.isArray(board.events)) return;
    const games = board.events.map(e => buildGame(league, e)).filter(Boolean);
    if(games.length) byLeague[league.key] = games;
  });
  return byLeague;
}

// ---- Rendering ----

function timeLabel(date){
  if(!date) return '';
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

// Left gutter: the time IS the spine of this view, so it carries the
// game's whole identity at a glance — clock time when scheduled, the
// period when live, a short "F"/"F/10" when done (never the word
// "Final" twice, once here and once in the card).
function railHtml(game){
  if(game.state === 'live') return `<div class="tg-rail"><div class="tg-rail-top live">LIVE</div><div class="tg-rail-bot">${game.detail}</div></div>`;
  if(game.state === 'final') return `<div class="tg-rail"><div class="tg-rail-top">${game.detail.replace('Final', 'F')}</div></div>`;
  const t = timeLabel(game.date);
  return `<div class="tg-rail"><div class="tg-rail-top pre">${t.replace(/ (AM|PM)/, '')}</div><div class="tg-rail-bot pre">${t.slice(-2)}</div></div>`;
}

// The badge is the one carve-out from the row's own click-to-open-
// Game-Details behavior (gameHtml's onclick, on .tg-row) — everything
// else in the card, including the team name, bubbles up to that. Only
// the badge button stops propagation, so tapping the crest still opens
// that team's modal instead.
function sideHtml(side, dim){
  const nameClass = `tg-name${dim ? ' dim' : ''}`;
  const scoreClass = `tg-score${dim ? ' dim' : ''}`;
  const score = side.score === null || side.score === undefined ? '' : side.score;
  if(!side.teamKey){
    return `
      <div class="tg-side">
        ${teamBadgeHtml(side.meta)}
        <div class="tg-label"><span class="${nameClass}">${side.meta.name}</span></div>
        <span class="${scoreClass}">${score}</span>
      </div>
    `;
  }
  const openTeam = `onclick="event.stopPropagation(); openTeamModal('${side.teamKey}')"`;
  // Same rule as the Teams tab: the star only appears once a team is
  // actually favorited, not as an empty toggle on every row.
  const favHtml = side.isFav ? favoriteStarHtml(side.teamKey) : '';
  return `
    <div class="tg-side">
      <button type="button" class="tg-badge-btn" ${openTeam} aria-label="${side.meta.name}">${teamBadgeHtml(side.meta)}</button>
      <div class="tg-label">
        <span class="${nameClass}">${side.meta.name}</span>
        <span class="tg-owner">${side.owner}</span>
      </div>
      ${favHtml}
      <span class="${scoreClass}">${score}</span>
    </div>
  `;
}

function gameHtml(game){
  // Only a finished game has a loser to de-emphasize; live and
  // scheduled games keep both sides at full strength.
  const done = game.state === 'final';
  const a = game.away.score, h = game.home.score;
  const awayDim = done && a < h, homeDim = done && h < a;

  const anyDrafted = game.away.teamKey ? game.away : game.home;
  const clickable = !!(GAME_DETAIL_LEAGUES[game.leagueKey] && game.id);
  const onClick = clickable ? ` onclick="openGameDetail('${anyDrafted.teamKey}','${game.id}')"` : '';

  // onclick sits on the whole row, not just the card, so the time-gutter
  // rail (the clock/LIVE/Final label off to the side) opens Game
  // Details too — a tap anywhere on the row's real estate should work,
  // not just the two team lines. The badge/name buttons inside each
  // side (and the favorite star) still stopPropagation, so they keep
  // opening the team modal / toggling a favorite instead.
  return `
    <div class="tg-row${clickable ? ' clickable' : ''}"${onClick}>
      ${railHtml(game)}
      <span class="tg-line"></span>
      <span class="tg-node ${game.state}"></span>
      <div class="tg-card ${game.state}">
        ${sideHtml(game.away, awayDim)}
        ${sideHtml(game.home, homeDim)}
      </div>
    </div>
  `;
}

function sectionHtml(label, labelClass, games){
  return `
    <div class="tg-section">
      <div class="tg-section-head"><span class="tg-section-label ${labelClass}">${label}</span><span class="tg-section-rule"></span></div>
      ${games.map(gameHtml).join('')}
    </div>
  `;
}

// ---- Controls ----

export function setTodayFilter(key){
  filterKey = key;
  renderLiveNow();
}

export function stepTodayDay(delta){
  dayOffset += delta;
  renderLiveNow();
}

// Called by switchView (js/board.js) so re-entering the tab always
// lands on today rather than wherever the arrows were left.
export function resetTodayDay(){
  dayOffset = 0;
  filterKey = 'all';
  scopeFilter.mine = false;
  scopeFilter.fav = false;
}

window.setTodayFilter = setTodayFilter;
window.stepTodayDay = stepTodayDay;

// ---- Team scope sheet ("Show which teams?") ----

function todayScopeChipLabel(){
  if(scopeIsAll()) return 'All teams';
  if(scopeFilter.mine && scopeFilter.fav) return 'Drafted + Favorites';
  return scopeFilter.mine ? 'Drafted' : 'Favorites';
}

function todayScopeRowHtml(key, label, desc, active){
  return `
    <button class="sheet-row ${active ? 'active' : ''}" onclick="toggleTodayScope('${key}')">
      <div class="sheet-row-text">
        <div>${label}</div>
        <div class="sheet-desc">${desc}</div>
      </div>
      <span class="sheet-check">${active ? CHECK_ICON_SVG : ''}</span>
    </button>
  `;
}

function refreshTodayScopeChrome(){
  const labelEl = document.getElementById('today-scope-label');
  if(labelEl) labelEl.textContent = todayScopeChipLabel();
  const rowsEl = document.getElementById('today-scope-sheet-rows');
  if(rowsEl){
    rowsEl.innerHTML = todayScopeRowHtml('all', 'All teams', 'Every drafted team, every owner', scopeIsAll())
      + todayScopeRowHtml('mine', 'Drafted Teams', 'Your own drafted roster', scopeFilter.mine)
      + todayScopeRowHtml('fav', 'Favorites', 'Teams you’ve starred', scopeFilter.fav);
  }
}

export function openTodayScopeSheet(){
  refreshTodayScopeChrome();
  document.getElementById('today-scope-sheet-overlay').classList.add('open');
  lockBodyScroll();
}

export function closeTodayScopeSheet(){
  document.getElementById('today-scope-sheet-overlay').classList.remove('open');
  unlockBodyScroll();
}

// "All teams" clears both toggles (a one-tap reset); Drafted/Favorites
// flip independently and the sheet stays open, since this is a filter
// panel someone may want to set two switches on, not a menu that
// closes itself after one tap.
export function toggleTodayScope(key){
  if(key === 'all'){ scopeFilter.mine = false; scopeFilter.fav = false; }
  else scopeFilter[key] = !scopeFilter[key];
  refreshTodayScopeChrome();
  renderLiveNow();
}

window.openTodayScopeSheet = openTodayScopeSheet;
window.closeTodayScopeSheet = closeTodayScopeSheet;
window.toggleTodayScope = toggleTodayScope;

enableSheetSwipeToDismiss(document.getElementById('today-scope-sheet-content'), closeTodayScopeSheet);

function dayLabel(){
  if(dayOffset === 0) return 'Today';
  if(dayOffset === -1) return 'Yesterday';
  if(dayOffset === 1) return 'Tomorrow';
  return dateForOffset(dayOffset).toLocaleDateString('en-US', { weekday: 'long' });
}

function controlsHtml(liveCount){
  const segments = [
    { key: 'live', label: `Live${liveCount ? ' &middot; ' + liveCount : ''}` },
    { key: 'upcoming', label: 'Upcoming' },
    { key: 'all', label: 'All' }
  ];
  return `
    <div class="tg-daynav">
      <button type="button" class="tg-arrow" onclick="stepTodayDay(-1)" aria-label="Previous day">&lsaquo;</button>
      <div class="tg-daynav-center">
        <div class="tg-day">${dayLabel()}</div>
        <div class="tg-date">${dateForOffset(dayOffset).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        <span class="tg-day-underline"></span>
      </div>
      <button type="button" class="tg-arrow" onclick="stepTodayDay(1)" aria-label="Next day">&rsaquo;</button>
    </div>
    ${segmentedControlHtml(segments, filterKey, 'setTodayFilter')}
  `;
}

function emptyHtml(){
  return `
    <div class="empty-panel">
      <div class="tg-empty-ring"></div>
      <div class="empty-title">Nothing scheduled</div>
      <div class="empty-sub">No drafted team plays on this date. Use the arrows to find the next slate.</div>
    </div>
  `;
}

// ---- Entry point (name unchanged: js/board.js's backgroundRefreshTick
// and liveScoreboardSweepTick both already call renderLiveNow, and the
// view/tab key stays 'live-now' so existing ?view= bookmarks keep
// working — only the label the user reads says "Today"). ----
let renderToken = 0;

export async function renderLiveNow(){
  const subEl = document.getElementById('live-now-sub');
  const controlsEl = document.getElementById('live-now-controls');
  const listEl = document.getElementById('live-now-list');
  if(!listEl) return;

  // A slow fetch from a previous day must not paint over a newer one
  // the user has already arrowed to.
  const token = ++renderToken;
  const offsetAtStart = dayOffset;
  const byLeague = await collectDay(offsetAtStart);
  if(token !== renderToken) return;

  const all = [];
  LEAGUES.forEach(l => { if(byLeague[l.key]) all.push(...byLeague[l.key].map(g => ({ ...g, league: l }))); });
  // Everything downstream (the count line, the Live badge, the list
  // itself) works off the scope-filtered set, not the full day's slate
  // \u2014 so picking "Drafted" actually narrows what "3 live" means too,
  // not just which cards are shown.
  const inScope = all.filter(gameMatchesScope);
  const liveCount = inScope.filter(g => g.state === 'live').length;

  if(subEl){
    subEl.textContent = inScope.length
      ? `${inScope.length} game${inScope.length === 1 ? '' : 's'} \u00b7 ${liveCount || 'no'} live`
      : 'No games in this scope';
  }
  if(controlsEl) controlsEl.innerHTML = controlsHtml(liveCount);
  refreshTodayScopeChrome();

  let shown = inScope;
  if(filterKey === 'live') shown = shown.filter(g => g.state === 'live');
  if(filterKey === 'upcoming') shown = shown.filter(g => g.state === 'pre');

  if(!shown.length){ listEl.innerHTML = emptyHtml(); return; }

  const html = [];
  // Live pinned above everything, across leagues — the one thing worth
  // breaking the per-league grouping for. Only when live games aren't
  // already the entire list (the 'live' filter), which would otherwise
  // render the same games under a "Live now" header and then again
  // under each league.
  const pinLive = filterKey !== 'upcoming';
  const liveGames = shown.filter(g => g.state === 'live');
  if(pinLive && liveGames.length) html.push(sectionHtml('Live now', 'live', liveGames));

  LEAGUES.forEach(league => {
    const games = shown.filter(g => g.league.key === league.key && !(pinLive && g.state === 'live'));
    if(!games.length) return;
    html.push(sectionHtml(league.label, '', games));
  });

  listEl.innerHTML = html.join('');
}
