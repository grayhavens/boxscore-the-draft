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

   Not covered: College Basketball, which has no ESPN scoreboard at all
   (see FLAT_SCHEDULE_LEAGUES in js/live-data.js) — it was TheRundown-
   only in the old view and is simply absent here rather than given a
   second, date-less code path. If CBB needs to appear, it wants
   TheRundown's own /events/{date} endpoint through the worker.
   ============================================================ */
import { TEAM_META, DRAFT_TEAMS, LEAGUES } from './data.js';
import { fetchEspnScoreboard } from './espn.js';
import { FLAT_SCHEDULE_LEAGUES, GAME_DETAIL_LEAGUES } from './live-data.js';
import { teamBadgeHtml, abbrFromName, normalizeTeamName, findDraftedTeamByName, segmentedControlHtml } from './utils.js';

// ---- View state (module-local, same "not persisted" convention as
// the old liveNowFilterKey — which day and which filter are cheap to
// re-pick and stale the moment the slate changes). `dayOffset` is in
// whole days from today; 0 is today. ----
let dayOffset = 0;
let filterKey = 'all'; // 'live' | 'upcoming' | 'all'

// ---- Day slate fetching ----
// One scoreboard request per sportPath per day. Today's slate is live
// and has to stay fresh (same 60s figure ESPN_SCOREBOARD_TTL_MS uses
// in js/live-data.js); any other day is finished or not started, so it
// can be cached hard — walking back and forth through the arrows
// shouldn't refetch anything.
const TODAY_TTL_MS = 60 * 1000;
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
  const key = `${sportPath}|${yyyymmdd(dateForOffset(offset))}`;
  const ttl = offset === 0 ? TODAY_TTL_MS : OTHER_DAY_TTL_MS;
  const cached = dayScoreboardCache[key];
  if(cached && Date.now() - cached.fetchedAt < ttl) return cached.data;
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
function draftedTeamFor(leagueKey, competitor){
  const league = LEAGUES.find(l => l.key === leagueKey);
  if(!league) return null;
  const nickname = normalizeTeamName(competitor.teamNickname || '');
  const exact = league.teams.find(teamKey => normalizeTeamName(TEAM_META[teamKey].name) === nickname);
  return exact || findDraftedTeamByName(leagueKey, competitor.teamName);
}

function ownerName(draftTeamId){
  const d = DRAFT_TEAMS.find(x => x.id === draftTeamId);
  return d ? d.name : '';
}

// A synthetic "team" for a side nobody drafted — fed straight into
// teamBadgeHtml so it gets the same colored-monogram treatment every
// other name-only team in this app gets (unchanged from the old view).
function opponentMeta(name){
  return { name, badgeText: abbrFromName(name), badgeStyle: 'background:var(--surface-2); color:var(--text-sub);' };
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
    const meta = teamKey ? TEAM_META[teamKey] : opponentMeta(c.teamName);
    return {
      teamKey,
      meta,
      owner: teamKey ? ownerName(meta.draftTeamId) : '',
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

// Name and badge both open the team modal — the row's two real
// targets, each its own <button> (not a click handler on the whole
// row) so the card itself stays free for the Game Details drill-down
// the old view's .game-card.clickable already had.
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
  const open = `onclick="event.stopPropagation(); openTeamModal('${side.teamKey}')"`;
  return `
    <div class="tg-side">
      <button type="button" class="tg-badge-btn" ${open} aria-label="${side.meta.name}">${teamBadgeHtml(side.meta)}</button>
      <button type="button" class="tg-label" ${open}>
        <span class="${nameClass}">${side.meta.name}</span>
        <span class="tg-owner">${side.owner}</span>
      </button>
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

  return `
    <div class="tg-row">
      ${railHtml(game)}
      <span class="tg-line"></span>
      <span class="tg-node ${game.state}"></span>
      <div class="tg-card ${game.state}${clickable ? ' clickable' : ''}"${onClick}>
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
}

window.setTodayFilter = setTodayFilter;
window.stepTodayDay = stepTodayDay;

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
  const liveCount = all.filter(g => g.state === 'live').length;

  if(subEl){
    subEl.textContent = all.length
      ? `${all.length} game${all.length === 1 ? '' : 's'} \u00b7 ${liveCount || 'no'} live`
      : 'No games scheduled';
  }
  if(controlsEl) controlsEl.innerHTML = controlsHtml(liveCount);

  let shown = all;
  if(filterKey === 'live') shown = all.filter(g => g.state === 'live');
  if(filterKey === 'upcoming') shown = all.filter(g => g.state === 'pre');

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
