/* ============================================================
   Today: every drafted team's game for one calendar day, grouped by
   league under a Live / Upcoming / Completed filter — the whole slate,
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

   Wide layout (900px and up, js/wide.js): no Live / Upcoming / Completed
   filter — the day shows as three groups at once (Live, Upcoming, Final,
   each hidden when empty), every league's games a grid of cards
   (css/style.css "Scores, wide" restyles the same card markup), and a
   week strip with each day's game count replaces the ‹ › arrows. The
   counts come from the same per-day scoreboards (collectDay), fetched a
   day at a time after the slate on screen has painted. The phone keeps
   the timeline, the filter and the arrows.
   ============================================================ */
import { TEAM_META, LEAGUES, PRE_DRAFT } from './data.js';
import { fetchEspnScoreboard } from './espn.js';
import { FLAT_SCHEDULE_LEAGUES, GAME_DETAIL_LEAGUES, fetchEspnScoreboardCached, syncScoresDetail } from './live-data.js';
import { teamBadgeHtml, abbrFromName, normalizeTeamName, draftOwnerName, findDraftedTeamByName, findCfbTeamKeyByLocation, localYyyymmdd, segmentedControlHtml, lockBodyScroll, unlockBodyScroll, openSheetOverlay, closeSheetOverlay, enableSheetSwipeToDismiss, CHECK_ICON_SVG } from './utils.js';
import { currentProfileId } from './identity.js';
import { isFavorite, favoriteMarkHtml } from './favorites.js';
import { golfCardsForDay, golfCardMatchesScope, golfCardHtml } from './golf-view.js';
import { escapeHtml as esc } from './escape.js';
import { gameCardHtml, gameSectionHtml, tagHtml, scoreBumpHtml } from './ui.js';
import { fxOn, playClass, pop, floatUp } from './motion-fx.js';

import { isFreshAt } from './cache-fresh.js';
import { isWide } from './wide-query.js';
// ---- View state (module-local, same "not persisted" convention as
// the old liveNowFilterKey — which day and which filter are cheap to
// re-pick and stale the moment the slate changes). `dayOffset` is in
// whole days from today; 0 is today. ----
let dayOffset = 0;
let filterKey = 'live'; // 'live' | 'upcoming' | 'completed' — game STATE
// False until the user taps a filter; until then the first render picks the
// most useful tab itself (there's no catch-all tab to fall back on).
let filterPicked = false;

// Odometer scores: the last score each side of each game showed, so a
// background refresh that finds a live game's score changed can roll the
// digits (odometerHtml) and flash the card. Nothing animates until the
// current slate has rendered once (scoresPrimed) — not the first paint,
// not arrowing to another day, not a filter or scope switch.
const lastScores = new Map(); // `${dayOffset}:${gameId}:${away|home}` -> score string
let scoresPrimed = false;
// A tab coming back from the background re-primes instead of replaying
// whatever changed while it was away (docs/motion-plan.md).
document.addEventListener('visibilitychange', () => { if(document.hidden) scoresPrimed = false; });

// Final whistle: each game's state at the last render, so a refresh that
// finds a live game final plays the final whistle. A game seen to end stays
// on the Live tab for ENDED_LINGER_MS (with its winner's W chip), so the
// moment happens where people are watching, not only on Completed.
const lastStates = new Map(); // `${day}:${gameId}` -> 'pre' | 'live' | 'final'
const endedAt = new Map();     // `${day}:${gameId}` -> when it was seen to end
const ENDED_LINGER_MS = 2 * 60 * 1000;
function justEnded(game){
  const t = endedAt.get(`${game.day}:${game.id}`);
  return t !== undefined && Date.now() - t < ENDED_LINGER_MS;
}

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

function dateForOffset(offset){
  const d = new Date();
  d.setHours(12, 0, 0, 0); // midday anchor so DST shifts can't roll the date
  d.setDate(d.getDate() + offset);
  return d;
}

async function fetchDayScoreboard(sportPath, offset){
  if(offset === 0) return fetchEspnScoreboardCached(sportPath);
  const key = `${sportPath}|${localYyyymmdd(dateForOffset(offset))}`;
  const cached = dayScoreboardCache[key];
  if(cached && isFreshAt(cached.fetchedAt, OTHER_DAY_TTL_MS)) return cached.data;
  const data = await fetchEspnScoreboard(sportPath, localYyyymmdd(dateForOffset(offset)));
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
  if(competitor.isPlaceholder) return null;
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

// draftedTeamFor, minus anyone else's favorites: a favoriteOnly team
// (js/data.js) isn't in the draft, so it's only a tracked team for a
// viewer who favorited it. For everyone else it's just another
// opponent — its games neither appear on their own nor carry the
// drafted-team treatment — so a drafter's favorite never shows up
// outside their own view. Before a group's first draft every team is
// favoriteOnly (js/seasons/index.js) and every one of them shows.
function visibleTeamFor(leagueKey, competitor){
  const teamKey = draftedTeamFor(leagueKey, competitor);
  if(teamKey && !PRE_DRAFT && TEAM_META[teamKey].favoriteOnly && !isFavorite(teamKey)) return null;
  return teamKey;
}

// Drafted college teams show as the bare school ("Wake Forest" — that's
// TEAM_META.name), so an undrafted college opponent has to match that
// or the row breaks the pattern next to it. ESPN's `teamName` is the
// full "Wake Forest Demon Deacons"; its `location` is the school alone.
// Pro leagues keep the full name — there the nickname is the team.
// Before the first draft these aren't opponents, just teams The Draft
// never took, so they match the rest of the list's bare nicknames.
function opponentDisplayName(leagueKey, competitor){
  const isCollege = leagueKey === 'cfb' || leagueKey === 'mcbb';
  if(isCollege) return competitor.location || competitor.teamName;
  return (PRE_DRAFT && competitor.teamNickname) || competitor.teamName;
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
// The small label a game's card carries when it isn't a plain regular-
// season game: preseason (NHL/NBA/NFL exhibitions — real results, but
// they never count), or the playoff round ("Semifinals - Game 2", from
// ESPN's competition notes; bare "Playoffs" if a postseason game ever
// arrives without one). Regular season gets no label — it's the default.
function seasonTagFor(event){
  if(event.seasonType === 1) return { cls: 'pre', text: 'Preseason' };
  if(event.seasonType === 3) return { cls: 'post', text: (event.headline || 'Playoffs').replace(/\s+-\s+/, ' · ') };
  return null;
}

function buildGame(league, event){
  // A canceled game is almost always a playoff "if necessary" game the
  // series never needed — nothing to show. Postponed games stay (see
  // `postponed` below): the game still exists, just not at this time.
  if(event.statusName === 'STATUS_CANCELED') return null;
  const home = event.competitors.find(c => c.homeAway === 'home');
  const away = event.competitors.find(c => c.homeAway === 'away');
  if(!home || !away) return null;

  const sides = [away, home].map(c => {
    const teamKey = visibleTeamFor(league.key, c);
    const meta = teamKey ? TEAM_META[teamKey] : opponentMeta(opponentDisplayName(league.key, c), c.logoUrl);
    return {
      teamKey,
      meta,
      owner: teamKey ? draftOwnerName(teamKey) : '',
      isMine: !!teamKey && meta.draftTeamId === currentProfileId,
      isFav: !!teamKey && isFavorite(teamKey),
      score: c.score,
      rank: c.rank
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
    date: event.date ? new Date(event.date) : null,
    timeTbd: !!event.timeTbd,
    postponed: event.statusName === 'STATUS_POSTPONED',
    tag: seasonTagFor(event)
  };
}

// A game matches the current scope if either side satisfies whichever
// toggle(s) are on — an "OR" across sides and across toggles, so a
// Drafted+Favorites combo shows a game if it has either.
function gameMatchesScope(game){
  if(scopeIsAll()) return true;
  if(game.kind === 'golf') return golfCardMatchesScope(game, scopeFilter);
  return [game.away, game.home].some(s => (scopeFilter.mine && s.isMine) || (scopeFilter.fav && s.isFav));
}

// Reported bug: with the scope filter narrowed to Drafted/Favorites, a
// team could show up as playing on a day it wasn't actually scheduled
// for. ESPN's `dates=YYYYMMDD` scoreboard param isn't guaranteed to be
// a strict same-day filter for every sport (college football's
// schedule is organized by week, not day, and other date-boundary
// mismatches are possible too) — rather than trust each sportPath to
// filter itself server-side, every event is re-checked here against
// the day the user actually selected: a game is kept only if its own
// local calendar date matches dateForOffset(offset). Events missing a
// date (shouldn't happen, but buildGame tolerates it) are kept rather
// than silently dropped.
function isOnSelectedDay(game, offset){
  if(!game.date) return true;
  return localYyyymmdd(game.date) === localYyyymmdd(dateForOffset(offset));
}

async function collectDay(offset){
  const leagues = LEAGUES.filter(l => FLAT_SCHEDULE_LEAGUES[l.key]);
  // Golf has tournaments, not games: its own cards (js/golf-view.js).
  const golfPromise = golfCardsForDay(dateForOffset(offset)).catch(() => []);
  const boards = await Promise.all(leagues.map(l => fetchDayScoreboard(FLAT_SCHEDULE_LEAGUES[l.key].sportPath, offset)));
  const byLeague = {};
  leagues.forEach((league, i) => {
    const board = boards[i];
    if(!board || !Array.isArray(board.events)) return;
    const games = board.events.map(e => buildGame(league, e)).filter(Boolean).filter(g => isOnSelectedDay(g, offset));
    if(games.length) byLeague[league.key] = games;
  });
  const golf = await golfPromise;
  if(golf.length) byLeague.pga = golf;
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
function railParts(game){
  const detail = esc(game.detail);
  if(game.state === 'live') return { time: 'LIVE', sub: detail.replace(/\s+-\s+/, isWide() ? ' · ' : '<br>'), timeTone: 'live' };
  if(game.state === 'final') return { time: detail.replace('Final', 'F') };
  if(game.postponed) return { time: 'PPD' };
  if(game.timeTbd) return { time: 'TBD', timeTone: 'pre' };
  const t = timeLabel(game.date);
  return { time: t.replace(/ (AM|PM)/, ''), sub: t.slice(-2), timeTone: 'pre' };
}

// One rolling strip (0-9) per digit, parked on the old digit; renderLiveNow
// then moves each to its new one (data-to). A digit the old score didn't
// have (9 -> 10) rolls up from 0.
function odometerHtml(score, prev){
  const p = String(prev).padStart(score.length, ' ').slice(-score.length);
  return [...score].map((ch, i) => {
    if(!/\d/.test(ch)) return ch;
    const from = /\d/.test(p[i]) ? p[i] : '0';
    return `<span class="odo-d"><span class="odo-strip" style="--n:${from}" data-to="${ch}">${[...'0123456789'].map(d => `<span>${d}</span>`).join('')}</span></span>`;
  }).join('');
}

// One side of a game card, as data for gameCardHtml (js/ui.js). The badge
// is the one carve-out from the row's own click-to-open-Game-Details
// behavior (the row's onclick) — everything else in the card, including
// the team name, bubbles up to that. Only the badge button stops
// propagation, so tapping the crest still opens that team's modal instead.
function sideParts(side, dim, game, which, ended){
  const score = side.score === null || side.score === undefined ? '' : String(side.score);
  const key = `${game.day}:${game.id}:${which}`;
  const prev = lastScores.get(key);
  const scored = scoresPrimed && game.state === 'live' && prev !== undefined && prev !== score && score !== '';
  if(score !== '') lastScores.set(key, score);
  const scoreClass = `tg-score${dim ? ' dim' : ''}`;
  // A score that just went up by a whole number also carries the "+N" that
  // floats off it (playScoreEffects).
  const delta = scored ? Number(score) - Number(prev) : 0;
  const bump = delta > 0 && Number.isInteger(delta) ? ` data-delta="${delta}"` : '';
  const scoreHtml = scored
    ? `<span class="${scoreClass}" data-scored="1"${bump}><span class="odo-sr">${score}</span><span aria-hidden="true">${odometerHtml(score, prev)}</span></span>`
    : `<span class="${scoreClass}">${score}</span>`;
  const parts = {
    name: side.meta.name,
    rank: side.rank,
    dim,
    badgeHtml: teamBadgeHtml(side.meta),
    scoreHtml,
    // A game that just ended, still on the Live tab: the winner's W chip,
    // and an invisible one on the loser's line so the two scores stay aligned.
    afterHtml: ended === 'won' ? tagHtml({ label: 'W', variant: 'win' })
      : ended === 'lost' ? `<span class="tg-tag-space" aria-hidden="true">${tagHtml({ label: 'W', variant: 'win' })}</span>` : ''
  };
  if(!side.teamKey) return parts;
  return {
    ...parts,
    owner: side.owner,
    badgeOnclick: `event.stopPropagation(); openTeamPage('${side.teamKey}', 'live-now', this)`,
    // Same rule as the Teams tab: a read-only star, only once a team is
    // favorited — toggling happens on the team page.
    favHtml: side.isFav ? favoriteMarkHtml() : ''
  };
}

// The onclick sits on the whole row, not just the card, so the time-gutter
// rail opens Game Details too. The badge buttons inside each side still
// stopPropagation, so they open the team page instead.
function gameHtml(game){
  // Only a finished game has a loser to de-emphasize; live and
  // scheduled games keep both sides at full strength.
  const done = game.state === 'final';
  const a = game.away.score, h = game.home.score;
  const awayDim = done && a < h, homeDim = done && h < a;
  const ended = done && justEnded(game);

  const anyDrafted = game.away.teamKey ? game.away : game.home;
  const clickable = !!(GAME_DETAIL_LEAGUES[game.leagueKey] && game.id);
  return gameCardHtml({
    ...railParts(game),
    id: game.id,
    state: game.state,
    tag: game.tag,
    away: sideParts(game.away, awayDim, game, 'away', ended && (homeDim ? 'won' : awayDim ? 'lost' : null)),
    home: sideParts(game.home, homeDim, game, 'home', ended && (awayDim ? 'won' : homeDim ? 'lost' : null)),
    onclick: clickable ? `openGameDetail('${anyDrafted.teamKey}','${game.id}')` : null,
    cls: ended ? 'just-ended' : ''
  });
}

function sectionHtml(label, games){
  return gameSectionHtml({ label, html: games.map(g => (g.kind === 'golf' ? golfCardHtml(g) : gameHtml(g))).join('') });
}

// ---- Controls ----

export function setTodayFilter(key){
  filterKey = key;
  filterPicked = true;
  scoresPrimed = false;
  renderLiveNow();
}

export function stepTodayDay(delta){
  dayOffset += delta;
  scoresPrimed = false;
  renderLiveNow();
}

// Called by switchView (js/board.js) so re-entering the tab always
// lands on today rather than wherever the arrows were left.
export function resetTodayDay(){
  dayOffset = 0;
  scoresPrimed = false;
  filterKey = 'live';
  filterPicked = false;
  scopeFilter.mine = false;
  scopeFilter.fav = false;
}

// The wide layout's week strip: straight to a day.
export function pickTodayDay(offset){
  if(offset === dayOffset) return;
  dayOffset = offset;
  scoresPrimed = false;
  renderLiveNow();
}

window.setTodayFilter = setTodayFilter;
window.stepTodayDay = stepTodayDay;
window.pickTodayDay = pickTodayDay;

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
    // Nobody has a drafted roster before the first draft, so no Drafted row.
    writeHtml(rowsEl, (PRE_DRAFT
      ? todayScopeRowHtml('all', 'All teams', 'Every team', scopeIsAll())
      : todayScopeRowHtml('all', 'All teams', 'Every drafted team, every owner', scopeIsAll())
        + todayScopeRowHtml('mine', 'Drafted Teams', 'Your own drafted roster', scopeFilter.mine))
      + todayScopeRowHtml('fav', 'Favorites', 'Teams you’ve starred', scopeFilter.fav));
  }
}

export function openTodayScopeSheet(){
  refreshTodayScopeChrome();
  openSheetOverlay(document.getElementById('today-scope-sheet-overlay'));
  lockBodyScroll();
}

export function closeTodayScopeSheet(){
  unlockBodyScroll();
  closeSheetOverlay(document.getElementById('today-scope-sheet-overlay'));
}

// "All teams" clears both toggles (a one-tap reset); Drafted/Favorites
// flip independently and the sheet stays open, since this is a filter
// panel someone may want to set two switches on, not a menu that
// closes itself after one tap.
export function toggleTodayScope(key){
  if(key === 'all'){ scopeFilter.mine = false; scopeFilter.fav = false; }
  else scopeFilter[key] = !scopeFilter[key];
  scoresPrimed = false;
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
    { key: 'completed', label: 'Completed' }
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

// ---- Wide layout: the week strip and the day's three groups ----

// Each day's games (every scope), kept so the strip's counts follow the
// scope filter without refetching. Filled by renderLiveNow for the day on
// screen and by fillWeekCounts for the rest of the week.
const daySlates = new Map(); // offset -> { at, games }
const SLATE_TTL_MS = 15 * 60 * 1000;

function slateGames(byLeague, offset){
  const games = [];
  LEAGUES.forEach(l => { if(byLeague[l.key]) games.push(...byLeague[l.key].map(g => ({ ...g, league: l, day: offset }))); });
  return games;
}

// Monday to Sunday around the day on screen, as day offsets from today.
function weekOffsets(){
  const dow = dateForOffset(dayOffset).getDay();     // 0 = Sunday
  const monday = dayOffset - ((dow + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => monday + i);
}

function weekStripHtml(){
  const days = weekOffsets().map(off => {
    const d = dateForOffset(off);
    const slate = daySlates.get(off);
    const n = slate ? slate.games.filter(gameMatchesScope).length : null;
    const live = slate && off === 0 && slate.games.some(g => g.state === 'live' && gameMatchesScope(g));
    const count = n === null ? '&nbsp;' : n ? `${n} game${n === 1 ? '' : 's'}` : 'No games';
    return `<button type="button" class="tg-wd${off === dayOffset ? ' sel' : ''}${off === 0 ? ' today' : ''}${n === 0 ? ' none' : ''}" onclick="pickTodayDay(${off})"${off === dayOffset ? ' aria-current="date"' : ''}>`
      + `<span class="tg-wd-name">${off === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}</span>`
      + `<span class="tg-wd-date">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>`
      + `<span class="tg-wd-count">${live ? '<i class="tg-wd-live"></i>' : ''}${count}</span></button>`;
  }).join('');
  const back = weekOffsets().includes(0) ? '' : `<button type="button" class="tg-week-today" onclick="pickTodayDay(0)">Today</button>`;
  return `<div class="tg-week">`
    + `<button type="button" class="tg-arrow" onclick="stepTodayDay(-7)" aria-label="Previous week">&lsaquo;</button>`
    + `<div class="tg-week-days">${days}</div>`
    + `<button type="button" class="tg-arrow" onclick="stepTodayDay(7)" aria-label="Next week">&rsaquo;</button>${back}</div>`;
}

// The rest of the week's counts, one day at a time once the slate on
// screen has painted. Each day's scoreboards are cached (fetchDayScoreboard),
// so walking the strip afterwards costs nothing.
let weekFillToken = 0;
async function fillWeekCounts(){
  const token = ++weekFillToken;
  for(const off of weekOffsets()){
    const slate = daySlates.get(off);
    if(slate && isFreshAt(slate.at, SLATE_TTL_MS)) continue;
    const byLeague = await collectDay(off).catch(() => null);
    if(token !== weekFillToken) return;
    if(byLeague) daySlates.set(off, { at: Date.now(), games: slateGames(byLeague, off) });
    if(isWide()) writeHtml(document.getElementById('live-now-controls'), weekStripHtml());
  }
}

const GROUPS = [['live', 'Live'], ['upcoming', 'Upcoming'], ['final', 'Final']];

// The day as Live / Upcoming / Final, each a run of league sections. A
// game that just ended stays under Live for a moment, as on the phone.
function groupsHtml(games, onLiveTab){
  const inGroup = {
    live: onLiveTab,
    upcoming: g => g.state === 'pre',
    final: g => g.state === 'final' && !onLiveTab(g)
  };
  return GROUPS.map(([key, label]) => {
    const list = games.filter(inGroup[key]);
    if(!list.length) return '';
    const sections = LEAGUES.map(league => {
      const lg = list.filter(g => g.league.key === league.key);
      return lg.length ? sectionHtml(league.label, lg) : '';
    }).join('');
    return `<section class="tg-group ${key}"><h2 class="tg-group-head">${key === 'live' ? '<i class="tg-group-dot"></i>' : ''}${label}<span class="tg-group-n">${list.length}</span></h2>${sections}</section>`;
  }).join('');
}

const EMPTY_COPY = {
  live: ['Nothing live', 'No game is in progress right now. Check Upcoming or Completed, or use the arrows to change day.'],
  upcoming: ['Nothing upcoming', 'No games left to start on this date. Use the arrows to find the next slate.'],
  completed: ['Nothing completed', 'No game has finished on this date yet.']
};

function emptyHtml(hasGames){
  const [title, sub] = hasGames
    ? EMPTY_COPY[filterKey]
    : ['Nothing scheduled', `No ${PRE_DRAFT ? '' : 'drafted '}team plays on this date. ${isWide() ? 'Pick another day above.' : 'Use the arrows to find the next slate.'}`];
  return `
    <div class="empty-panel">
      <div class="tg-empty-ring"></div>
      <div class="empty-title">${title}</div>
      <div class="empty-sub">${sub}</div>
    </div>
  `;
}

// ---- Entry point (name unchanged: js/board.js's backgroundRefreshTick
// and liveScoreboardSweepTick both already call renderLiveNow, and the
// view/tab key stays 'live-now' so existing ?view= bookmarks keep
// working — only the label the user reads says "Today"). ----
let renderToken = 0;

// The background loops repaint this view every couple of seconds, almost
// always with nothing changed. Rewriting identical markup would cut off a
// running effect, reset a pressed card and can swallow a tap that lands
// mid-swap, so a write only happens when the markup is new.
const written = new WeakMap();
function writeHtml(el, html){
  if(!el || written.get(el) === html) return false;
  el.innerHTML = html;
  written.set(el, html);
  return true;
}

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

  const all = slateGames(byLeague, offsetAtStart);
  daySlates.set(offsetAtStart, { at: Date.now(), games: all });
  const wide = isWide();
  // Everything downstream (the count line, the Live badge, the list
  // itself) works off the scope-filtered set, not the full day's slate
  // \u2014 so picking "Drafted" actually narrows what "3 live" means too,
  // not just which cards are shown.
  const endedNow = new Set();
  all.forEach(g => {
    if(g.kind === 'golf') return;
    const key = `${g.day}:${g.id}`;
    if(scoresPrimed && lastStates.get(key) === 'live' && g.state === 'final'){ endedAt.set(key, Date.now()); endedNow.add(key); }
    lastStates.set(key, g.state);
  });
  const inScope = all.filter(gameMatchesScope);
  const liveCount = inScope.filter(g => g.state === 'live').length;
  const onLiveTab = g => g.state === 'live' || (g.state === 'final' && justEnded(g));

  if(!filterPicked){
    filterKey = inScope.some(onLiveTab) ? 'live'
      : inScope.some(g => g.state === 'pre') ? 'upcoming'
      : 'completed';
  }

  if(subEl){
    // Leagues counted off the same scope-filtered set the list renders
    // from, so the number matches the league sections actually shown.
    const leagueCount = new Set(inScope.map(g => g.league.key)).size;
    subEl.textContent = inScope.length
      ? `${leagueCount} league${leagueCount === 1 ? '' : 's'} · ${inScope.length} game${inScope.length === 1 ? '' : 's'}`
      : 'No games in this scope';
  }
  writeHtml(controlsEl, wide ? weekStripHtml() : controlsHtml(liveCount));
  refreshTodayScopeChrome();

  // Wide: every group at once, then the rest of the week's counts.
  if(wide){
    const changed = inScope.length
      ? writeHtml(listEl, groupsHtml(inScope, onLiveTab))
      : writeHtml(listEl, emptyHtml(false));
    scoresPrimed = true;
    if(changed) playScoreEffects(listEl, inScope.filter(g => endedNow.has(`${g.day}:${g.id}`)));
    syncScoresDetail();
    fillWeekCounts();
    return;
  }

  let shown = inScope;
  if(filterKey === 'live') shown = shown.filter(onLiveTab);
  if(filterKey === 'upcoming') shown = shown.filter(g => g.state === 'pre');
  if(filterKey === 'completed') shown = shown.filter(g => g.state === 'final');

  if(!shown.length){ writeHtml(listEl, emptyHtml(inScope.length > 0)); scoresPrimed = true; return; }

  // Every filter groups by league; a live game keeps its "LIVE" rail
  // label and node on the row itself rather than a section of its own.
  const html = [];
  LEAGUES.forEach(league => {
    const games = shown.filter(g => g.league.key === league.key);
    if(!games.length) return;
    html.push(sectionHtml(league.label, games));
  });

  const changed = writeHtml(listEl, html.join(''));
  scoresPrimed = true;
  if(changed) playScoreEffects(listEl, shown.filter(g => endedNow.has(`${g.day}:${g.id}`)));
}

// ---- Live effects (docs/motion-plan.md, Phase 2) ----
// Played on the freshly written list. Each ends on what the plain render
// already shows, so with motion off (or the page hidden) nothing is lost.
function playScoreEffects(listEl, ended){
  const settleDigits = () => listEl.querySelectorAll('.odo-strip[data-to]').forEach(s => s.style.setProperty('--n', s.dataset.to));
  // The strips are written parked on the old digit, so with effects off
  // they still have to move to the new score, just at once.
  if(!fxOn()){ settleDigits(); return; }
  // Goal: the digits roll, the card flashes a gold ring, and a "+N" floats
  // off the score. Two frames: the strips have to paint on the old digit
  // before moving.
  if(listEl.querySelector('[data-scored]')){
    requestAnimationFrame(() => requestAnimationFrame(() => {
      settleDigits();
      listEl.querySelectorAll('.tg-score[data-scored]').forEach(s => {
        playClass(s.closest('.tg-card'), 'just-scored');
        if(s.dataset.delta) floatUp(s.closest('.tg-side'), scoreBumpHtml({ n: s.dataset.delta }), { delay: 50 });
      });
    }));
  }
  // Final whistle: the live tint drains off the card, the rail and node lose
  // their red, the loser dims, and the winner's W chip pops in.
  ended.forEach(game => {
    const row = listEl.querySelector(`.tg-row[data-game="${CSS.escape(String(game.id))}"]`);
    if(!row) return;
    playClass(row, 'fx-final');
    pop(row.querySelector('.status-tag.win'), { from: 0.4, duration: 460, delay: 200 });
  });
}
