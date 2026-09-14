/* ============================================================
   Live Now: every drafted team's live game right now, grouped by
   league, spanning all 10 drafters at once — every other view is
   scoped to one drafter (Teams) or reads one league's own standings
   feed (Standings). This adds no new fetches of its own: it just
   scans the same liveDataCache js/live-data.js already keeps current
   via backgroundRefreshTick/liveScoreboardSweepTick (see the tick
   wiring at the bottom of js/board.js) and re-renders on demand.
   ============================================================ */
import { TEAM_META, DRAFT_TEAMS, LEAGUES, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { liveDataCache, rundownEventLine, getNextEventInfo, GAME_DETAIL_LEAGUES } from './live-data.js';
import { isRundownEventLive } from './api.js';
import { teamBadgeHtml, abbrFromName, findDraftedTeamByName } from './utils.js';

function ownerName(draftTeamId){
  const d = DRAFT_TEAMS.find(x => x.id === draftTeamId);
  return d ? d.name : '';
}

// A synthetic "team" for whichever side of a matchup isn't a drafted
// team — fed straight into teamBadgeHtml so a plain-name opponent gets
// the exact same colored-monogram badge treatment every other
// name-only team in this app already gets (see e.g. findEspnEplRow in
// js/standings-epl.js), not a one-off style invented for this view.
function opponentMeta(name){
  return { name, badgeText: abbrFromName(name), badgeStyle: 'background:var(--surface-2); color:var(--text-sub);' };
}

// One live team's line, normalized across its two possible sources
// (ESPN's shared scoreboard vs TheRundown) into the shape
// collectLiveGames below needs: a key shared by both sides of the same
// real-world game — so two drafted teams facing each other collapse
// into one card instead of two identical ones — plus enough to render
// that side of the matchup. Returns null if this team isn't actually
// live right now.
function liveLineFor(bundle){
  if(bundle.espnLive && bundle.espnLive.isLive){
    const l = bundle.espnLive;
    return { matchKey: `espn:${l.eventId}`, eventId: l.eventId, isHome: l.isHome, own: l.own, opp: l.opp, opponentName: l.opponentName, period: l.period };
  }
  // College Basketball has no ESPN scoreboard sweep (js/live-data.js's
  // FLAT_SCHEDULE_LEAGUES doesn't cover it) — this is its only live
  // source, refreshed on the slower backgroundRefreshTick rotation, so
  // a CBB game can show up here a little later than an ESPN-backed one.
  if(isRundownEventLive(bundle.rundownEvent)){
    const line = rundownEventLine(bundle.rundownEvent, bundle.rundownTeamId);
    const s = bundle.rundownEvent.score;
    const ids = [s.team_id_home, s.team_id_away].sort((a, b) => a - b);
    return { matchKey: `rundown:${ids.join('-')}`, eventId: null, isHome: line.isHome, own: line.own, opp: line.opp, opponentName: line.opponentName, period: line.period };
  }
  return null;
}

// Groups every currently-live drafted team into games, keyed by
// matchKey — two drafted teams sharing one (playing each other, common
// in fully- or near-fully-drafted leagues like EPL/NFL/NBA/MLB) merge
// into a single two-owner entry instead of two cards with the same
// score.
function collectLiveGames(){
  const byLeague = {};
  for(const league of LEAGUES){
    const games = new Map();
    for(const teamKey of league.teams){
      const bundle = liveDataCache[teamKey];
      if(!bundle) continue;
      const line = liveLineFor(bundle);
      if(!line) continue;
      const side = { teamKey, meta: TEAM_META[teamKey], line };
      if(games.has(line.matchKey)) games.get(line.matchKey).push(side);
      else games.set(line.matchKey, [side]);
    }
    if(games.size) byLeague[league.key] = { league, games: [...games.values()] };
  }
  return byLeague;
}

function draftedSideHtml(side){
  return `
    <div class="gc-side">
      ${teamBadgeHtml(side.meta)}
      <div class="gc-name">${side.meta.name}</div>
      <div class="gc-owner">${ownerName(side.meta.draftTeamId)}</div>
    </div>
  `;
}

function opponentSideHtml(name){
  return `
    <div class="gc-side">
      ${teamBadgeHtml(opponentMeta(name))}
      <div class="gc-name">${name}</div>
      <div class="gc-owner placeholder">&ndash;</div>
    </div>
  `;
}

function renderGameCard(sides, leagueKey){
  let homeSide = sides.find(s => s.line.isHome);
  let awaySide = sides.find(s => !s.line.isHome);
  // Both sides agreeing on isHome (shouldn't happen — same event, two
  // independent fetches) would otherwise collapse them onto one side;
  // fall back to fetch order so neither team just disappears.
  if(sides.length === 2 && (!homeSide || !awaySide)){ homeSide = sides[0]; awaySide = sides[1]; }

  const homeScore = homeSide ? homeSide.line.own : awaySide.line.opp;
  const awayScore = awaySide ? awaySide.line.own : homeSide.line.opp;
  const period = (homeSide || awaySide).line.period;

  const leftHtml = awaySide ? draftedSideHtml(awaySide) : opponentSideHtml(homeSide.line.opponentName);
  const rightHtml = homeSide ? draftedSideHtml(homeSide) : opponentSideHtml(awaySide.line.opponentName);

  const eventId = (homeSide && homeSide.line.eventId) || (awaySide && awaySide.line.eventId) || null;
  const anyDrafted = homeSide || awaySide;
  const clickable = !!(GAME_DETAIL_LEAGUES[leagueKey] && eventId);

  return `
    <div class="game-card${clickable ? ' clickable' : ''}"${clickable ? ` onclick="openGameDetail('${anyDrafted.teamKey}','${eventId}')"` : ''}>
      ${leftHtml}
      <div class="gc-center">
        <span class="meta-label live"><span class="dot pulse"></span>Live</span>
        <span class="meta-value">${awayScore}&ndash;${homeScore}</span>
        <span class="meta-clock">${period || ''}</span>
      </div>
      ${rightHtml}
      ${clickable ? '<span class="gc-chev">&rsaquo;</span>' : ''}
    </div>
  `;
}

function leagueSectionHtml({ league, games }){
  const count = games.length;
  const noun = league.key === 'epl' ? (count === 1 ? 'Match' : 'Matches') : (count === 1 ? 'Game' : 'Games');
  const cardsHtml = games.map(sides => renderGameCard(sides, league.key)).join('');
  // MLB/WNBA: these games are real and live, but drafted teams don't
  // start scoring until the '27 season — same flag already used on
  // their Standings/team-modal views (see PRIOR_SEASON_DISPLAY_LEAGUES
  // in js/data.js), so it doesn't read as if this counts here either.
  const priorNoteHtml = PRIOR_SEASON_DISPLAY_LEAGUES.includes(league.key)
    ? `<div class="prior-season-note">Real, in-progress result &mdash; won't count until the '27 season.</div>`
    : '';
  return `
    <div class="league">
      <div class="league-tab">
        <div>${league.label}</div>
        <span class="n">${count} ${noun}</span>
      </div>
      ${priorNoteHtml}
      ${cardsHtml}
    </div>
  `;
}

// ---- Empty state: nothing live right now ----

function formatUpcomingParts(d){
  const value = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const label = d.toDateString() === new Date().toDateString() ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
  return { label, value };
}

const NEXT_UP_LIMIT = 3;

// Scoped per league (not a flat scan of every TEAM_META key) so a
// found opponent can be checked against that same league's roster —
// findDraftedTeamByName (js/utils.js) is what every standings module
// already uses to match a real name back to a drafted team, reused
// here so an opponent who's also drafted (common — EPL/NFL/NBA/MLB are
// mostly or fully drafted) gets its own real badge/owner instead of
// the plain name-only placeholder, and so the same real-world matchup
// found from each side's own schedule collapses into one row instead
// of two.
function collectNextUp(){
  const now = new Date();
  const rows = [];
  const seen = new Set();
  for(const league of LEAGUES){
    for(const teamKey of league.teams){
      const bundle = liveDataCache[teamKey];
      if(!bundle) continue;
      const info = getNextEventInfo(TEAM_META[teamKey], bundle);
      if(!info || !(info.date > now)) continue;

      const opponentTeamKey = findDraftedTeamByName(league.key, info.opponentName);
      // Prefer the real ESPN event id when we have one (exact, not a
      // name match); fall back to the drafted-opponent pairing, then
      // to a per-team key that can't collide with anything else.
      const dedupeKey = info.eventId
        ? `event:${info.eventId}`
        : (opponentTeamKey ? `pair:${[teamKey, opponentTeamKey].sort().join('-')}` : `team:${teamKey}`);
      if(seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      rows.push({ teamKey, meta: TEAM_META[teamKey], info, opponentTeamKey });
    }
  }
  rows.sort((a, b) => a.info.date - b.info.date);
  return rows.slice(0, NEXT_UP_LIMIT);
}

function renderUpcomingCard(row){
  const { teamKey, meta, info, opponentTeamKey } = row;
  const draftedHtml = draftedSideHtml({ teamKey, meta });
  const opponentHtml = opponentTeamKey
    ? draftedSideHtml({ teamKey: opponentTeamKey, meta: TEAM_META[opponentTeamKey] })
    : opponentSideHtml(info.opponentName);
  const { label, value } = formatUpcomingParts(info.date);
  return `
    <div class="game-card">
      ${info.isHome ? opponentHtml : draftedHtml}
      <div class="gc-center">
        <span class="meta-label">${label}</span>
        <span class="meta-value" style="font-size:14px;">${value}</span>
      </div>
      ${info.isHome ? draftedHtml : opponentHtml}
    </div>
  `;
}

function emptyStateHtml(){
  const upcoming = collectNextUp();
  const nextUpHtml = upcoming.length ? `
    <div class="next-up">
      <div class="next-up-label">Next up</div>
      <div class="league">${upcoming.map(renderUpcomingCard).join('')}</div>
    </div>
  ` : '';
  return `
    <div class="empty-panel">
      <div class="empty-ball">&#127944;</div>
      <div class="empty-title">No games live right now</div>
      <div class="empty-sub">Check back closer to kickoff &mdash; this tab updates itself the moment a drafted team takes the field.</div>
      ${nextUpHtml}
    </div>
  `;
}

// ---- League filter chips (same "All" + per-league pattern as
// js/board.js's boardFilterKey/setBoardFilter, scoped to this view and
// — like that one — reset to "All" on every fresh render rather than
// persisted, since which leagues even have a live game changes minute
// to minute). Only leagues with an actual live game get a chip, same
// "don't show an empty option" convention leagueBlockHtml already uses
// for "No data available" sections elsewhere. ----
let liveNowFilterKey = 'all';

export function setLiveNowFilter(key){
  liveNowFilterKey = key;
  renderLiveNow();
}
window.setLiveNowFilter = setLiveNowFilter;

export function renderLiveNow(){
  const subEl = document.getElementById('live-now-sub');
  const chipsEl = document.getElementById('live-now-chips');
  const leaguesEl = document.getElementById('live-now-leagues');
  if(!leaguesEl) return;

  const byLeague = collectLiveGames();
  const activeLeagueKeys = LEAGUES.filter(l => byLeague[l.key]).map(l => l.key);
  if(liveNowFilterKey !== 'all' && !activeLeagueKeys.includes(liveNowFilterKey)) liveNowFilterKey = 'all';

  if(subEl){
    subEl.textContent = activeLeagueKeys.length
      ? `All games in progress across ${LEAGUES.length} leagues`
      : `No games in progress across ${LEAGUES.length} leagues right now`;
  }

  if(chipsEl){
    chipsEl.innerHTML = activeLeagueKeys.length ? ['all', ...activeLeagueKeys].map(key => {
      const label = key === 'all' ? 'All' : LEAGUES.find(l => l.key === key).label;
      return `<div class="filter-chip ${key === liveNowFilterKey ? 'active' : ''}" onclick="setLiveNowFilter('${key}')">${label}</div>`;
    }).join('') : '';
  }

  if(!activeLeagueKeys.length){
    leaguesEl.innerHTML = emptyStateHtml();
    return;
  }

  const shownKeys = liveNowFilterKey === 'all' ? activeLeagueKeys : [liveNowFilterKey];
  leaguesEl.innerHTML = shownKeys.map(key => leagueSectionHtml(byLeague[key])).join('');
}
