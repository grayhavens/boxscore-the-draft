/* ============================================================
   Everything golfer-shaped on screen, for a group with PGA Tour in its
   league list (js/seasons/pga.js):
   - the golfer page (openGolfer): a golfer's team page, its shell from
     js/team-page.js and every golf piece on it from here;
   - the tournament sheet (openGolfEvent): a full leaderboard;
   - the Standings block: the FedEx Cup table, and each drafter's
     combined FedEx points (the league bonus);
   - Home rows: FedEx rank after the country, and this week's place in
     the status slot;
   - the Scores tab's tournament card (golfCardsForDay, js/live-now.js);
   - Home's card for a major (golfMajorHomeHtml, js/board.js), from the
     Monday of its week until a week after (docs/golf-majors-plan.md).

   Data comes from js/golf-api.js: the season's finished events from the
   worker, and the event being played straight from ESPN. A golfer is
   known by ESPN athlete id; a TEAM_META entry (kind 'golfer') is only
   how the app knows who drafted or starred one.
   ============================================================ */
import { TEAM_META, DRAFT_TEAMS, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT, LEAGUE_SCORING, leagueOf, isScoresOnly } from './data.js';
import {
  teamBadgeHtml, escapeHtml as esc, skeletonLinesHtml, skeletonRowsHtml, lockBodyScroll, openSheetOverlay,
  isSheetOpen, standingsOwnerHtml, standingsToggleHtml, draftOwnerName, localYyyymmdd, retryPending
} from './utils.js';
import { fetchGolfSeason, fetchCurrentGolfEvent, fetchGolfLeaderboard, fetchGolferRecord, fetchGolfEventsOn, fetchGolfCalendar, fetchGolfNews } from './golf-api.js';
import {
  golferResults, fedexTable, finishPosition, isMissedCut, golferHeadshotUrl,
  activeMajor, majorGolfers, majorLeaders, majorFromBoard, isOut, golferNews, finishForm, FORM_FINISH_CAP
} from './golf.js';
import { nextGameHtml, sectionCardHtml, formStripHtml, gameByGameHtml } from './ui.js';
import { barHeight, GAME_BY_GAME_MAX } from './team-wide-math.js';
import { PGA_ACCENT, PGA_SCORING, majorOf } from './seasons/pga.js';
import { previewParam } from './postseason.js';
import { favoriteStarHtml, favoriteMarkHtml, isFavorite } from './favorites.js';
import { currentProfileId } from './identity.js';
import { renderStandings, standingsDataChanged } from './board.js';

const SEASON_TTL_MS = 10 * 60 * 1000;
const LIVE_TTL_MS = 60 * 1000;
const THIS_WEEK_DAYS = 5;   // how far ahead the next event counts as "this week"
const FEDEX_CUT = 30;       // the TOUR Championship field
const TABLE_ROWS = 50;

export const golfStore = {
  season: null,     // the FedEx season shown (last year's until this year's starts)
  events: null,     // condensed events (worker/golf.js)
  names: {},        // athleteId -> [name, flag code]
  fedex: null,      // athleteId -> { rank, points }
  current: null,    // { event, board } this week, board null until the field is out
  loading: false,
  error: false,
  failedAt: 0,      // the last failed season fetch (retryPending in js/utils.js)
  fetchedAt: 0,
  liveAt: 0
};
const records = {}; // `${season}:${athleteId}` -> official record, once loaded

export function hasGolf(){
  return leagueOf('pga').teams.length > 0;
}

// athleteId -> TEAM_META key, for the golfers this group lists.
let keyById = null;
function teamKeyFor(athleteId){
  if(!keyById){
    keyById = {};
    leagueOf('pga').teams.forEach(k => { keyById[TEAM_META[k].espnAthleteId] = k; });
  }
  return keyById[String(athleteId)] || null;
}

// Who a viewer follows: every listed golfer before the draft, then the
// drafted ones plus their own starred ones (the same rule as Scores).
function isTracked(teamKey){
  if(!teamKey) return false;
  const meta = TEAM_META[teamKey];
  return PRE_DRAFT || !meta.favoriteOnly || isFavorite(teamKey);
}

function nameOf(athleteId){
  const key = teamKeyFor(athleteId);
  if(key) return TEAM_META[key].name;
  const n = golfStore.names[athleteId];
  return n ? n[0] : 'Unknown';
}

// A badge for anyone, drafted or not: the headshot, initials behind it.
function golferBadgeMeta(athleteId){
  const key = teamKeyFor(athleteId);
  if(key) return TEAM_META[key];
  const name = nameOf(athleteId);
  return {
    name,
    kind: 'golfer',
    badgeText: name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase(),
    badgeStyle: `background:${PGA_ACCENT}; color:#FFFFFF;`,
    badgeUrl: golferHeadshotUrl(athleteId)
  };
}

const fmtPts = n => Math.round(n || 0).toLocaleString('en-US');
const shortDate = iso => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');

// ---- Loading ----

let loadPromise = null;

// The season's results, and this week's event. Last year's season until
// this year's first event is done, so January isn't an empty table.
export function loadGolf(force = false){
  if(!hasGolf() && !MAJOR_REPLAY) return Promise.resolve();
  if(loadPromise) return loadPromise;
  if(!force && golfStore.events && Date.now() - golfStore.fetchedAt < SEASON_TTL_MS) return refreshGolfLive();
  // A failed fetch waits out the retry delay. Otherwise the repaint it
  // triggers (Standings' PGA block calls this) asks again straight away,
  // over and over, and every row is replaced before a tap can land on it.
  if(!force && !golfStore.events && retryPending(golfStore)) return Promise.resolve();
  golfStore.loading = true;
  loadPromise = (async () => {
    const year = new Date().getFullYear();
    let data = await fetchGolfSeason(year);
    if(!data || !data.events || !data.events.some(e => e.results)) data = (await fetchGolfSeason(year - 1)) || data;
    golfStore.loading = false;
    if(data && Array.isArray(data.events)){
      golfStore.season = data.season;
      golfStore.events = data.events;
      golfStore.names = data.golfers || {};
      golfStore.fedex = {};
      fedexTable(data.events.filter(e => e.results)).forEach(r => { golfStore.fedex[r.id] = r; });
      golfStore.error = false;
      golfStore.failedAt = 0;
      golfStore.fetchedAt = Date.now();
    } else if(!golfStore.events){
      golfStore.error = true;
      golfStore.failedAt = Date.now();
    }
    await refreshGolfLive(true);
    golfChanged();
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}

// This week's event. Its leaderboard is refetched once a minute while
// it's being played, and not at all when nothing is on.
export async function refreshGolfLive(force = false){
  if(!hasGolf() && !MAJOR_REPLAY) return;
  if(MAJOR_REPLAY){
    if(golfStore.current && golfStore.current.replay) return;
    golfStore.current = await replayMajorCurrent();
    if(!force) golfChanged();
    return;
  }
  const cur = golfStore.current;
  const playing = cur && cur.board && cur.board.status === 'in';
  if(!force && !playing && Date.now() - golfStore.liveAt < SEASON_TTL_MS) return;
  if(!force && playing && Date.now() - golfStore.liveAt < LIVE_TTL_MS) return;
  golfStore.liveAt = Date.now();
  const event = await fetchCurrentGolfEvent();
  if(!event){ golfStore.current = null; return; }
  const soon = event.start && Date.parse(event.start) - Date.now() < THIS_WEEK_DAYS * 86400000;
  const board = soon ? await fetchGolfLeaderboard(event.id) : null;
  golfStore.current = { event, board: board && board.players.length ? board : null };
  if(!force) golfChanged();
}

// Called whenever golf data lands (Home's major card, js/board.js).
const listeners = [];
export function onGolfData(fn){ listeners.push(fn); }

function golfChanged(){
  standingsDataChanged();
  listeners.forEach(fn => fn());
  renderAllPgaCardRecords();
  refreshPage();
}

// ---- Season numbers ----

// A golfer's season off the condensed events: starts, wins, top 10s,
// cuts made, FedEx points and rank. The official record replaces the
// points once it's loaded (the summed ones can be a point off).
function seasonLine(athleteId){
  const id = String(athleteId);
  const played = golferResults((golfStore.events || []).filter(e => e.results), id);
  const pos = r => finishPosition(r.finish);
  const fx = (golfStore.fedex || {})[id];
  const official = records[`${golfStore.season}:${id}`];
  return {
    played,
    starts: played.length,
    wins: played.filter(r => pos(r) === 1).length,
    topTens: played.filter(r => pos(r) !== null && pos(r) <= 10).length,
    cutsMade: played.filter(r => pos(r) !== null).length,
    points: official ? official.cupPoints : (fx ? fx.points : 0),
    rank: fx && fx.points > 0 ? fx.rank : null
  };
}

// ---- Home rows ----

export function renderPgaCardRecord(teamKey){
  const el = document.getElementById('pga-record-' + teamKey);
  if(!el) return;
  const meta = TEAM_META[teamKey];
  const line = golfStore.events ? seasonLine(meta.espnAthleteId) : null;
  el.innerHTML = line && line.rank ? ` &middot; FedEx #${line.rank}` : '';
  renderGolfRowStatus(teamKey);
}

export function renderAllPgaCardRecords(){
  leagueOf('pga').teams.forEach(renderPgaCardRecord);
}

function thisWeekFor(athleteId){
  const cur = golfStore.current;
  if(!cur || !cur.board) return null;
  return cur.board.players.find(p => p.id === String(athleteId)) || null;
}

function roundLabel(board, p){
  if(board.status === 'post') return 'Final';
  if(p.state === 'pre' || (!p.thru && p.teeTime)) return p.teeTime ? `Tee ${timeOf(p.teeTime)}` : `Round ${board.round || 1}`;
  if(isOut(p.finish)) return p.finish === 'CUT' ? 'Missed cut' : p.finish;
  if(p.thru === '18' || p.thru === 'F') return `R${board.round} · F`;
  return p.thru ? `R${board.round} · Thru ${p.thru}` : `R${board.round}`;
}

const timeOf = iso => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

// This week's place, in the row's status slot (same markup as a team's
// live score, js/live-data.js paintStatusSlot).
function renderGolfRowStatus(teamKey){
  const el = document.getElementById('row-status-' + teamKey);
  if(!el) return;
  const p = thisWeekFor(TEAM_META[teamKey].espnAthleteId);
  const board = golfStore.current && golfStore.current.board;
  if(!p || !board || (board.status === 'pre' && !p.teeTime)){
    el.className = 'status-slot';
    if(el._html !== ''){ el.innerHTML = ''; el._html = ''; }
    return;
  }
  const live = board.status === 'in' && p.state === 'in';
  el.className = 'status-slot' + (live ? ' live' : '');
  const value = board.status === 'pre' ? esc(shortName(board.name)) : `${esc(p.finish || '—')}${p.toPar ? ' &middot; ' + esc(p.toPar) : ''}`;
  const html = `<span class="meta-label${live ? ' live' : ''}">${live ? '<span class="dot pulse"></span>' : ''}${esc(roundLabel(board, p))}</span><span class="meta-value">${value}</span>`;
  // Unchanged: leave it, so the live dot's pulse isn't restarted.
  if(el._html !== html){ el.innerHTML = html; el._html = html; }
}

const shortName = name => String(name || '').replace(/\s+(pres\.|presented)\s.*$/i, '');

// ---- Home: a major's card ----

// Points show only for a group that drafted its golfers and whose golf
// counts: not before the draft, not golf shown for scores only, not a
// FedEx season before the class's.
function majorsScore(){
  if(MAJOR_REPLAY && MAJOR_REPLAY.mine) return true;
  return !PRE_DRAFT && !isScoresOnly('pga') && !PRIOR_SEASON_DISPLAY_LEAGUES.includes('pga') && !!LEAGUE_SCORING.pga;
}

function myGolferIds(){
  const current = golfStore.current;
  if(MAJOR_REPLAY && MAJOR_REPLAY.mine) return (current && current.replayMine) || [];
  if(!currentProfileId) return [];
  return leagueOf('pga').teams
    .map(k => TEAM_META[k])
    .filter(m => !m.favoriteOnly && m.draftTeamId === currentProfileId)
    .map(m => String(m.espnAthleteId));
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const weekday = iso => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `\u2212${-n}` : '0');

// Who's leading, or won: "Scottie Scheffler leads at -9", "3 tied for
// the lead at -9", "Scottie Scheffler won at -10".
function majorLeaderLine(major){
  const { ids, toPar } = majorLeaders(major);
  if(!ids.length) return '';
  const at = toPar ? ` at ${toPar}` : '';
  if(ids.length > 1) return major.status === 'post' ? `${ids.length} tied for the win${at}` : `${ids.length} tied for the lead${at}`;
  const name = major.names[ids[0]] || nameOf(ids[0]);
  return `${name} ${major.status === 'post' ? 'won' : 'leads'}${at}`;
}

// The card, in the postseason banner's shell (.ps-home): the PGA Tour
// logo, "Round 2 · 2027", the major's name, then who's leading and, for a
// drafter in a group whose golf scores, how their golfers stand: points
// in play (blue) while it's on, locked (gold) once it's over. Their
// golfers still playing sit at the right (the winner, once it's over).
// A tap opens the leaderboard.
export function golfMajorHomeHtml(){
  if(!hasGolf() && !MAJOR_REPLAY) return '';
  const major = activeMajor({ current: golfStore.current, events: golfStore.events || [], now: Date.now() });
  if(!major) return '';
  const year = String(major.start || '').slice(0, 4);
  const eyebrow = major.status === 'pre' ? `Starts ${weekday(major.start)} \u00b7 ${year}`
    : major.status === 'in' ? `Round ${major.round || 1} \u00b7 ${year}`
    : `Final \u00b7 ${year}`;
  const field = Object.keys(major.finishes).length;
  const lines = [];
  const lead = major.status === 'pre' ? '' : majorLeaderLine(major);
  if(lead) lines.push(esc(lead));

  const scoring = majorsScore() && (LEAGUE_SCORING.pga || PGA_SCORING).rules;
  const mineIds = scoring ? myGolferIds() : [];
  const mine = mineIds.length ? majorGolfers(major, mineIds, scoring) : null;
  let badges = [];
  // Before ESPN posts the field there's nobody to count.
  if(mine && (field || major.status !== 'pre')){
    const n = mine.rows.length;
    const count = !n ? 'None of your golfers are in'
      : major.status === 'pre' ? `You have ${plural(n, 'golfer', 'golfers')} in`
      : major.status === 'in' && major.cutDone ? `${mine.playing} of ${n} made the cut`
      : major.status === 'in' ? `You have ${plural(n, 'golfer', 'golfers')} in`
      : 'Your golfers';
    const pts = n && major.status !== 'pre'
      ? `${major.status === 'post' ? ':' : ' \u00b7'} <span class="ps-home-pts ${major.status === 'post' ? 'locked' : 'prov'}">${signed(mine.total)}${major.status === 'post' ? '' : ' in play'}</span>`
      : '';
    lines.push(esc(count) + pts);
    badges = (major.status === 'post' ? [] : mine.rows.filter(r => major.status === 'pre' || r.playing)).map(r => ({ id: r.id, mine: true }));
  } else if(major.status === 'pre' && field){
    lines.push(`${field} golfers in the field`);
  }
  if(major.status === 'post'){
    const mineSet = new Set(mineIds);
    badges = majorLeaders(major).ids.map(id => ({ id, mine: mineSet.has(id) }));
  }

  // The major's own logo; ESPN's PGA Tour one for a major we don't know.
  const own = majorOf(major.name);
  const logo = own ? own.logo : golfStore.current && golfStore.current.event && golfStore.current.event.logo;
  const logoHtml = logo ? `<span class="ps-home-logo ${own && own.lockup ? 'lockup' : 'square'}"><img class="ps-logo-dark" src="${esc(logo.dark)}" alt="" draggable="false"><img class="ps-logo-light" src="${esc(logo.light)}" alt="" draggable="false"></span>` : '';
  return `
    <button type="button" class="ps-home" onclick="openGolfEvent('${esc(major.id)}')">
      ${logoHtml}
      <span class="ps-home-text">
        <span class="ps-home-eyebrow">${esc(eyebrow)}</span>
        <span class="ps-home-title">${esc(own ? own.name : shortName(major.name))}</span>
        ${lines.map(l => `<span class="ps-home-sub">${l}</span>`).join('')}
      </span>
      ${badges.length ? `<span class="ps-home-teams">${badges.slice(0, 4).map(b => `<span class="ps-home-team${b.mine ? '' : ' plain'}">${teamBadgeHtml(golferBadgeMeta(b.id))}</span>`).join('')}</span>` : ''}
      <span class="ps-home-go" aria-hidden="true">&rsaquo;</span>
    </button>`;
}

// ---- Preview: replay a major on Home ----

// Local dev and Pages previews only (previewParam in js/postseason.js,
// sticky until ?major=0): ?major=masters|pga|usopen|open replays that
// major's last edition on Home, whatever the date and whether or not the
// group has golf. &majorphase=pre|live|final (live: round 3, after the
// cut) and &majormine=4 to have the viewer "draft" that many of its
// field, spread through the leaderboard, so the points show.
const MAJOR_REPLAY = (() => {
  if(typeof window === 'undefined') return null;
  const key = previewParam('major');
  if(!key) return null;
  return {
    key,
    phase: previewParam('majorphase') || 'live',
    mine: Math.max(0, Math.min(8, Number(previewParam('majormine')) || 0))
  };
})();

// The major's real leaderboard, its dates moved by whole weeks so this
// is its week (the week after, for `final`) and its status set to the
// phase.
async function replayMajorCurrent(){
  const year = new Date().getFullYear();
  let event = null;
  for(const y of [year, year - 1]){
    const cal = (await fetchGolfCalendar(y)) || [];
    event = cal.filter(e => e.end && Date.parse(e.end) < Date.now()).find(e => (majorOf(e.name) || {}).key === MAJOR_REPLAY.key);
    if(event) break;
  }
  const board = event && await fetchGolfLeaderboard(event.id);
  if(!board) return null;
  const WEEK = 7 * 86400000;
  const weeks = Math.round((Date.now() - Date.parse(board.start)) / WEEK) - (MAJOR_REPLAY.phase === 'final' ? 1 : 0);
  const shift = iso => new Date(Date.parse(iso) + weeks * WEEK).toISOString();
  const { phase } = MAJOR_REPLAY;
  const b = { ...board, start: shift(board.start), end: shift(board.end) };
  if(phase === 'pre'){
    Object.assign(b, { status: 'pre', round: null, players: board.players.map(p => ({ ...p, finish: null, toPar: null })) });
  } else if(phase !== 'final'){
    Object.assign(b, { status: 'in', round: 3 });
  }
  // A spread of the field for &majormine: the leader's group down to a missed cut.
  const field = board.players;
  const mine = MAJOR_REPLAY.mine
    ? Array.from({ length: MAJOR_REPLAY.mine }, (_, i) => field[Math.min(field.length - 1, Math.round((i + 0.5) * field.length / MAJOR_REPLAY.mine * 0.8) + 3)].id)
    : [];
  return { replay: true, replayMine: [...new Set(mine)], event: { id: b.id, name: b.name, start: b.start, end: b.end }, board: b };
}

// ---- Golfer page ----

/* A golfer's page is the team page (js/team-page.js): its shell (the hero,
   the compact bar, a row growing into it, swiping through your own teams,
   the tabs, the wide layout) is shared, and every piece of golf on it
   comes from here: the stat strip, the week's tournament in the game
   card's place, Recent form as finishes, the Stats and Results tabs, and
   news off the tour's feed. A golfer the group lists is known by their
   TEAM_META key; anyone else (a leaderboard's field) by `golfer:<id>`. */

const PSEUDO_KEY = /^golfer:(\d+)$/;

// The page's key for a golfer: their TEAM_META key when listed.
export function golferPageKey(athleteId){
  return teamKeyFor(athleteId) || `golfer:${athleteId}`;
}

// A `golfer:<id>` key's meta, shaped like a TEAM_META entry; null for
// anything else, or in a group without golf.
export function golferPageMeta(key){
  const m = PSEUDO_KEY.exec(String(key || ''));
  if(!m || !hasGolf()) return null;
  const listed = teamKeyFor(m[1]);
  return listed ? TEAM_META[listed] : { ...golferBadgeMeta(m[1]), leagueKey: 'pga', accent: PGA_ACCENT, espnAthleteId: m[1] };
}

// Opens a golfer's page from anywhere: a row (it grows into the page, as a
// team's does), a Scores card, or a leaderboard sheet (closed first; the
// page then returns to the view under it).
export function openGolfer(athleteId, originView, rowEl){
  const id = String(athleteId);
  if(isSheetOpen(document.getElementById('modal-overlay'))) window.closeModalSheet();
  window.openTeamPage(golferPageKey(id), originView, rowEl);
}
window.openGolfer = openGolfer;

// The page repaints when anything it shows lands (js/team-page.js).
let pageRefresher = null;
export function setGolferPageRefresher(fn){ pageRefresher = fn; }
const refreshPage = () => { if(pageRefresher) pageRefresher(); };

// The season, this week, and the golfer's official totals once the
// season is known.
export function ensureGolferPage(athleteId){
  const id = String(athleteId);
  Promise.resolve(loadGolf()).then(() => {
    const season = golfStore.season;
    if(!season || records[`${season}:${id}`]) return;
    fetchGolferRecord(id, season).then(r => {
      if(!r) return;
      records[`${season}:${id}`] = r;
      refreshPage();
    });
  });
}

// The golfer's stories (js/golf.js golferNews), or null when the feed
// didn't load.
export function fetchGolferNews(athleteId){
  return fetchGolfNews().then(feed => (feed ? golferNews(feed, athleteId) : null));
}

export function golferNationHtml(athleteId){
  const key = teamKeyFor(athleteId);
  const flag = (key && TEAM_META[key].flag) || (golfStore.names[athleteId] || [])[1] || '';
  return flag ? `<img class="golf-flag" src="https://a.espncdn.com/i/teamlogos/countries/500/${esc(flag)}.png" alt="">` : '';
}

export function priorSeasonNoteHtml(){
  if(!PRIOR_SEASON_DISPLAY_LEAGUES.includes('pga') || !golfStore.season) return '';
  const yy = y => String(y).slice(-2);
  return `<div class="prior-season-note golf-note">Showing the '${yy(golfStore.season)} FedEx Cup season &mdash; points count from the '${yy(Number(golfStore.season) + 1)} season.</div>`;
}

// The stat strip: FedEx rank and points, then what the golfer is worth
// to their owner (`path`, js/lines.js teamPathToPoints), or their wins.
// FedEx points go without a thousands comma so they roll up as one number.
export function golferStatStripHtml(athleteId, path){
  if(!golfStore.events) return `<div class="stat-cell"><div class="lbl">${golfStore.error ? 'No data available' : 'Loading…'}</div></div>`;
  const line = seasonLine(athleteId);
  const cell = (num, lbl, cls = '') => `<div class="stat-cell${cls ? ` ${cls}` : ''}"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  return cell(line.rank ? '#' + line.rank : '—', 'FedEx Cup')
    + cell(Math.round(line.points || 0), 'FedEx pts')
    + (path ? cell(path.now < 0 ? '&minus;' + Math.abs(path.now) : path.now, 'Points', 'pts') : cell(line.wins, 'Wins'));
}

// The week's tournament, in the team page's next-game card: where the
// golfer stands (red while they're on the course), their tee time, or why
// they aren't in it. { html, live, eventId }; a tap opens the leaderboard.
export function golferWeekCard(athleteId){
  const id = String(athleteId);
  const title = 'This week';
  if(!golfStore.events && golfStore.loading) return { html: nextGameHtml({ title, when: '', oppName: 'Loading…' }), live: false, eventId: null };
  const cur = golfStore.current;
  if(!cur) return { html: nextGameHtml({ title, when: '', oppName: 'No PGA Tour event this week' }), live: false, eventId: null };
  const { event, board } = cur;
  const name = shortName(event.name);
  const dates = `${shortDate(event.start)} – ${shortDate(event.end)}`;
  const card = (opts, live = false) => ({ html: nextGameHtml({ title, oppName: name, ...opts }), live, eventId: event.id });
  if(!board) return card({ when: dates, subHtml: 'The field isn’t out yet.' });
  const p = board.players.find(x => x.id === id);
  const round = board.status === 'in' ? `Round ${board.round}` : board.status === 'post' ? 'Final' : dates;
  if(!p) return card({ when: round, subHtml: board.status === 'post' ? 'Didn’t play this week.' : 'Not in the field this week.' });
  if(board.status === 'pre' || p.state === 'pre'){
    const tee = p.teeTime ? new Date(p.teeTime).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    return card({ when: tee ? `Tees off ${tee}` : round, subHtml: board.status === 'in' ? `In the field &middot; ${esc(roundLabel(board, p))}` : 'In the field' });
  }
  const live = board.status === 'in' && p.state === 'in';
  const right = `<span class="ng-pos">${esc(p.finish || '—')}</span><span class="ng-topar">${esc(p.toPar || 'E')}</span>`;
  const sub = board.status === 'post'
    ? esc(p.rounds.filter(v => v).join(' · '))
    : [esc(roundLabel(board, p)), p.today && !isOut(p.finish) ? `Today ${esc(p.today)}` : ''].filter(Boolean).join(' &middot; ');
  return card({ title: live ? 'Live' : title, live, when: round, rightHtml: right, subHtml: sub }, live);
}

// A short name for an event under a form bar: the major's own short name,
// else the first word that isn't "The" ("RBC", "Memorial", "Players").
function eventShort(name){
  const major = majorOf(name);
  if(major) return { masters: 'Masters', pga: 'PGA', usopen: 'U.S. Open', open: 'The Open' }[major.key] || major.name;
  const word = shortName(name).split(/\s+/).find(w => !/^the$/i.test(w)) || '';
  return word.length > 9 ? word.slice(0, 8) + '…' : word;
}

// Recent form: the last five finishes as bars (js/golf.js finishForm),
// then a way to every result. formStripHtml draws margin / per * 48 plus a
// 6 floor, capped at 48: this `per` makes a win exactly the full height,
// so a T4 still stands a little shorter than a win.
const FORM_PER = FORM_FINISH_CAP * 48 / 42;
export function golferFormHtml(athleteId){
  if(!golfStore.events) return golfStore.error ? '<div class="no-live-note">No data available.</div>' : '<div class="loading-note">Loading results…</div>';
  const played = seasonLine(athleteId).played;
  const link = `<div class="more-link-row"><span class="boxscore-link center" onclick="setTeamPageTab('results')">All results <span class="chev">›</span></span></div>`;
  if(!played.length) return `<div class="loading-note">No starts this season yet.</div>`;
  const games = played.slice(-5).map(r => ({
    ...finishForm(r.finish),
    res: r.finish || '—',
    score: eventShort(r.name),
    opp: shortDate(r.end),
    onclick: `openGolfEvent('${esc(r.id)}')`
  }));
  return sectionCardHtml({ title: 'Recent form', subHtml: `Last ${games.length}`, html: formStripHtml({ games, per: FORM_PER }), cls: 'form-card' }) + link;
}

const bestFinish = played => {
  const best = played.map(r => ({ r, pos: finishPosition(r.finish) })).filter(x => x.pos !== null).sort((a, b) => a.pos - b.pos)[0];
  return best ? best.r.finish : '—';
};

// The Stats tab: the season's numbers as tiles, then the majors.
export function golferStatsTabHtml(athleteId){
  if(!golfStore.events) return golfStore.error ? '<div class="no-live-note">No data available.</div>' : '<div class="loading-note">Loading season stats…</div>';
  const line = seasonLine(athleteId);
  const official = records[`${golfStore.season}:${athleteId}`];
  const tiles = [
    { num: line.rank ? '#' + line.rank : '—', lbl: 'FedEx Cup' },
    { num: fmtPts(line.points), lbl: 'FedEx Points' },
    { num: line.starts, lbl: 'Starts' },
    { num: line.wins, lbl: 'Wins' },
    { num: line.topTens, lbl: 'Top 10s' },
    { num: line.starts ? `${line.cutsMade}/${line.starts}` : '—', lbl: 'Cuts Made' },
    { num: bestFinish(line.played), lbl: 'Best Finish' },
    { num: official && official.scoringAverage ? official.scoringAverage.toFixed(2) : '—', lbl: 'Scoring Avg' }
  ];
  const majors = line.played.filter(r => r.major);
  return `
    ${priorSeasonNoteHtml()}
    <div class="stat-grid">${tiles.map(t => `<div class="stat-tile"><div class="num">${esc(String(t.num))}</div><div class="lbl">${t.lbl}</div></div>`).join('')}</div>
    <div class="modal-section-title spaced">Majors</div>
    <div class="golf-results">${majors.length ? resultRowsHtml(majors) : '<div class="golf-muted">No majors played this season.</div>'}</div>`;
}

// The Results tab: every event of the season, newest first.
export function golferResultsTabHtml(athleteId){
  if(!golfStore.events) return golfStore.error ? '<div class="no-live-note">No data available.</div>' : skeletonLinesHtml(4);
  const line = seasonLine(athleteId);
  return `
    ${priorSeasonNoteHtml()}
    <div class="modal-section-title">${golfStore.season ? `${golfStore.season} season` : 'Season'}${line.starts ? ` <span class="golf-title-note">${line.cutsMade} of ${line.starts} cuts made</span>` : ''}</div>
    <div class="golf-results">${line.played.length ? resultRowsHtml(line.played.slice().reverse()) : '<div class="golf-muted">No starts this season.</div>'}</div>`;
}

// ---- Golfer page, wide ----

// The tag row over the name: FedEx rank, then the tour.
export function golferWideTagHtml(athleteId){
  const line = golfStore.events ? seasonLine(athleteId) : null;
  return (line && line.rank ? `<span class="tw-standing">#${line.rank}</span><span>FedEx Cup</span><i class="tw-dot"></i>` : '')
    + `<span>PGA Tour</span>${golferNationHtml(athleteId)}`;
}

export function golferWideSeasonHtml(athleteId){
  if(!golfStore.events) return '';
  const line = seasonLine(athleteId);
  const official = records[`${golfStore.season}:${athleteId}`];
  const cells = [[line.rank ? '#' + line.rank : '—', 'FedEx Cup'], [fmtPts(line.points), 'FedEx points'], [line.wins, 'Wins'], [line.topTens, 'Top 10s']];
  const splits = [[line.starts, 'Starts'], [line.starts ? `${line.cutsMade}/${line.starts}` : '—', 'Cuts made'], [bestFinish(line.played), 'Best finish'], [official && official.scoringAverage ? official.scoringAverage.toFixed(2) : '—', 'Scoring avg']];
  const note = PRIOR_SEASON_DISPLAY_LEAGUES.includes('pga') ? '<span class="wide-panel-sub">Doesn’t count yet</span>' : '';
  return `<section class="wide-panel tw-season"><div class="wide-panel-head"><span class="wide-panel-label">${golfStore.season ? `${golfStore.season} season` : 'Season'}</span>${note}</div>`
    + `<div class="tw-stats">${cells.map(([n, l]) => `<div class="tw-stat"><span class="tw-stat-num">${esc(String(n))}</span><span class="tw-stat-lbl">${l}</span></div>`).join('')}</div>`
    + `<div class="tw-splits">${splits.map(([n, l]) => `<div><span class="tw-split-num">${esc(String(n))}</span><span class="tw-split-lbl">${l}</span></div>`).join('')}</div></section>`;
}

// Every start as a bar, oldest left (the team page's Game by game).
export function golferEventByEventHtml(athleteId){
  if(!golfStore.events) return '';
  const line = seasonLine(athleteId);
  const played = line.played.slice(-GAME_BY_GAME_MAX);
  if(!played.length) return '';
  const games = played.map(r => {
    const f = finishForm(r.finish);
    return { result: f.result, height: f.result === 'd' ? 0 : barHeight(f.margin, FORM_FINISH_CAP), tip: `${shortDate(r.end)} · ${shortName(r.name)} · ${r.finish || '—'}` };
  });
  const sub = `${plural(line.wins, 'win', 'wins')} · ${line.cutsMade} of ${line.starts} cuts`;
  return gameByGameHtml({ games, sub, firstLabel: shortDate(played[0].end), title: 'Event by event' });
}

export function golferWideResultsHtml(athleteId){
  if(!golfStore.events) return '<div class="loading-note">Loading results…</div>';
  const played = seasonLine(athleteId).played;
  if(!played.length) return '';
  return `<section class="wide-card"><div class="wide-panel-head"><h3 class="wide-panel-title">Results</h3><span class="wide-panel-sub">${plural(played.length, 'start', 'starts')}</span></div>`
    + `<div class="golf-results">${resultRowsHtml(played.slice().reverse())}</div></section>`;
}

function finishClass(finish){
  const pos = finishPosition(finish);
  if(pos === 1) return 'win';
  if(pos !== null && pos <= 10) return 'top';
  if(isMissedCut(finish) || finish === 'WD' || finish === 'DQ') return 'miss';
  return '';
}

function resultRowsHtml(results){
  return results.map(r => `
    <button type="button" class="golf-result" onclick="openGolfEvent('${esc(r.id)}')">
      <span class="golf-finish ${finishClass(r.finish)}">${esc(r.finish || '—')}</span>
      <span class="golf-result-main">
        <span class="golf-result-name">${esc(shortName(r.name))}${r.major ? '<span class="golf-tag">Major</span>' : ''}</span>
        <span class="golf-muted">${shortDate(r.end)}</span>
      </span>
      <span class="golf-result-pts">${r.cupPoints ? fmtPts(r.cupPoints) : ''}</span>
    </button>`).join('');
}

// ---- Tournament sheet ----

export async function openGolfEvent(eventId){
  const content = document.getElementById('modal-content');
  openSheetOverlay(document.getElementById('modal-overlay'));
  lockBodyScroll();
  content.dataset.activeTeam = 'event:' + eventId;
  const summary = (golfStore.events || []).find(e => e.id === String(eventId));
  content.innerHTML = eventSheetHtml(summary ? { name: summary.name, status: summary.status } : null, null);
  // The Home replay's leaderboard is the moved one, not ESPN's.
  const cur = golfStore.current;
  const board = cur && cur.replay && cur.board && cur.board.id === String(eventId) ? cur.board : await fetchGolfLeaderboard(eventId);
  if(content.dataset.activeTeam !== 'event:' + eventId) return;
  content.innerHTML = eventSheetHtml(board, board);
}
window.openGolfEvent = openGolfEvent;

// The viewer's own golfers in the field, pinned above the leaderboard
// (a drafter in a group whose golf scores, like Home's major card), best
// place first. In a major each carries what that place is worth: in play
// (blue) while it's on, locked (gold) once it's over.
function pinnedHtml(board){
  if(!majorsScore()) return '';
  const ids = myGolferIds();
  if(!ids.length) return '';
  const mine = majorGolfers(majorFromBoard(board), ids, (LEAGUE_SCORING.pga || PGA_SCORING).rules);
  if(!mine.rows.length) return '';
  const byId = {};
  board.players.forEach(p => { byId[p.id] = p; });
  const scores = board.major && board.status !== 'pre';
  const tone = board.status === 'post' ? 'locked' : 'prov';
  const total = scores
    ? `<span class="golf-pts ${tone}">${signed(mine.total)}${board.status === 'post' ? '' : ' in play'}</span>` : '';
  return `
    <div class="modal-section-title golf-pin-title"><span>Your golfers</span>${total}</div>
    <div class="golf-pin">${mine.rows.map(r => leaderRowHtml(board, byId[r.id], scores ? { pts: r.pts, tone } : {})).join('')}</div>
    <div class="modal-section-title spaced">Leaderboard</div>`;
}

function eventSheetHtml(head, board){
  const status = !head ? '' : head.status === 'in' ? `Round ${head.round || ''} · In progress`
    : head.status === 'post' ? 'Final' : head.status === 'canceled' ? 'Cancelled' : head.start ? `Starts ${shortDate(head.start)}` : '';
  const rows = board ? board.players : null;
  const own = head && majorOf(head.name);
  return `
    <div class="modal-accent" style="background:${PGA_ACCENT};"></div>
    <div class="modal-head">
      <div>
        <h2>${esc(own && head.major ? own.name : shortName(head ? head.name : 'Tournament'))}</h2>
        <div class="modal-sub">${esc(status)}${head && head.major ? ' &middot; Major' : ''}${board && board.purse ? ` &middot; ${esc(board.purse)} purse` : ''}</div>
      </div>
      <div class="modal-actions"><button class="modal-close" onclick="closeModalSheet()">&times;</button></div>
    </div>
    <div class="modal-body golf-board">
      ${rows === null ? skeletonRowsHtml(8) : rows.length ? pinnedHtml(board) + rows.map(p => leaderRowHtml(board, p)).join('') : '<div class="golf-muted">The field isn’t out yet.</div>'}
    </div>`;
}

// One leaderboard row. Pinned rows (`pts` given) show what the place is
// worth where the full list shows the owner.
function leaderRowHtml(board, p, { pts = null, tone = '' } = {}){
  const teamKey = teamKeyFor(p.id);
  const tracked = isTracked(teamKey);
  const drafted = teamKey && !PRE_DRAFT && !TEAM_META[teamKey].favoriteOnly;
  const owner = drafted ? draftOwnerName(teamKey) : '';
  const isMine = majorsScore() && myGolferIds().includes(p.id);
  const detail = board.status === 'post'
    ? p.rounds.filter(v => v).join(' · ')
    : board.status === 'in' && p.state !== 'pre' ? `${roundLabel(board, p)}${p.today && !isOut(p.finish) ? ' · ' + p.today : ''}` : p.teeTime ? `Tee ${timeOf(p.teeTime)}` : '';
  const tag = pts !== null ? `<span class="golf-pts ${tone}">${signed(pts)}</span>` : owner ? `<span class="golf-owner">${esc(owner)}</span>` : '';
  return `
    <button type="button" class="golf-lb-row${tracked && !PRE_DRAFT ? ' tracked' : ''}${isMine ? ' me' : ''}" onclick="openGolfer('${esc(p.id)}')">
      <span class="golf-lb-pos">${esc(p.finish || '')}</span>
      <span class="golf-lb-name">${esc(p.name)}${tag}</span>
      <span class="golf-lb-detail">${esc(detail)}</span>
      <span class="golf-lb-topar">${esc(p.toPar || '')}</span>
    </button>`;
}

// ---- Standings ----

export let pgaStandingsMode = 'table';
export function setPgaStandingsMode(mode){
  pgaStandingsMode = mode;
  renderStandings();
}
window.setPgaStandingsMode = setPgaStandingsMode;

export function pgaStandingsBodyHtml(){
  if(!golfStore.events){
    loadGolf();
    return golfStore.error ? '<div class="no-live-note">No data available.</div>' : skeletonRowsHtml();
  }
  loadGolf(); // quietly refreshes when stale
  const toggle = standingsToggleHtml([{ key: 'table', label: 'FedEx Cup' }, { key: 'byDrafter', label: 'Drafted' }], pgaStandingsMode, 'setPgaStandingsMode', 'pga');
  const note = priorSeasonNoteHtml();
  if(pgaStandingsMode === 'byDrafter' && !PRE_DRAFT) return note + toggle + computePgaDrafterCombined().map(renderPgaByDrafterRow).join('');
  const rows = Object.values(golfStore.fedex || {})
    .filter(r => r.points > 0 && (r.rank <= TABLE_ROWS || isTracked(teamKeyFor(r.id))))
    .sort((a, b) => a.rank - b.rank || b.points - a.points);
  if(!rows.length) return note + toggle + '<div class="no-live-note">No FedEx Cup points yet this season.</div>';
  const html = [];
  rows.forEach((r, i) => {
    if(i > 0 && rows[i - 1].rank <= FEDEX_CUT && r.rank > FEDEX_CUT) html.push(`<div class="golf-cutline"><span>Top ${FEDEX_CUT} make the TOUR Championship</span></div>`);
    html.push(renderPgaStandingsRow(r));
  });
  return note + toggle + html.join('');
}

function renderPgaStandingsRow(r){
  const teamKey = teamKeyFor(r.id);
  const meta = golferBadgeMeta(r.id);
  const wins = golferResults(golfStore.events.filter(e => e.results), r.id).filter(x => x.finish === '1').length;
  return `
    <div class="standings-row clickable" onclick="openGolfer('${esc(r.id)}', 'standings', this)">
      <div class="standings-rank">${r.rank}</div>
      ${teamBadgeHtml(meta)}
      <div class="team-main">
        <div class="team-name">${esc(meta.name)}</div>
        ${teamKey ? standingsOwnerHtml(TEAM_META[teamKey].favoriteOnly ? null : teamKey, 'pga') : ''}
      </div>
      <div class="person-record-chip"><span class="person-record-primary">${fmtPts(r.points)}</span><span class="person-record-secondary">${wins ? `${wins} win${wins === 1 ? '' : 's'}` : 'pts'}</span></div>
    </div>`;
}

// Each drafter's golfers' FedEx points together: the league bonus race.
export function computePgaDrafterCombined(){
  const by = {};
  DRAFT_TEAMS.forEach(d => { by[d.id] = { id: d.id, name: d.name, points: 0, names: [], found: 0 }; });
  leagueOf('pga').teams.forEach(k => {
    const meta = TEAM_META[k];
    if(meta.favoriteOnly || !by[meta.draftTeamId]) return;
    const row = by[meta.draftTeamId];
    row.names.push(meta.name);
    const line = golfStore.events ? seasonLine(meta.espnAthleteId) : null;
    if(line){ row.points += line.points; row.found++; }
  });
  return Object.values(by).sort((a, b) => b.points - a.points);
}

function renderPgaByDrafterRow(row, i){
  return `
    <div class="standings-row${row.id === currentProfileId ? ' me' : ''}">
      <div class="standings-rank">${row.points ? i + 1 : '—'}</div>
      <div class="team-main">
        <div class="team-name">${esc(row.name)}</div>
        <div class="team-sub">${esc(row.names.join(' · '))}</div>
      </div>
      <div class="person-record-chip"><span class="person-record-primary">${fmtPts(row.points)}</span><span class="person-record-secondary">pts</span></div>
    </div>`;
}

// ---- Scores ----

// The tournament(s) being played on one day, as Scores cards: every
// followed golfer in the field, best first. Events with none are left
// out, like a game with no drafted team.
export async function golfCardsForDay(date){
  if(!hasGolf()) return [];
  const day = localYyyymmdd(date);
  const iso = `${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`;
  const events = (await fetchGolfEventsOn(day)) || [];
  const onDay = events.filter(e => e.start && e.end && e.start.slice(0, 10) <= iso && iso <= e.end.slice(0, 10) && e.status !== 'canceled');
  const cards = await Promise.all(onDay.map(async e => {
    const board = await fetchGolfLeaderboard(e.id);
    if(!board || !board.players.length) return null;
    const rows = board.players
      .map(p => ({ p, teamKey: teamKeyFor(p.id) }))
      .filter(x => isTracked(x.teamKey))
      .map(({ p, teamKey }) => ({
        p,
        teamKey,
        owner: !PRE_DRAFT && !TEAM_META[teamKey].favoriteOnly ? draftOwnerName(teamKey) : '',
        isMine: TEAM_META[teamKey].draftTeamId === currentProfileId,
        isFav: isFavorite(teamKey)
      }));
    if(!rows.length) return null;
    return {
      kind: 'golf',
      id: e.id,
      leagueKey: 'pga',
      state: board.status === 'in' ? 'live' : board.status === 'post' ? 'final' : 'pre',
      board,
      rows,
      leader: board.players[0],
      date: null
    };
  }));
  return cards.filter(Boolean);
}

export function golfCardMatchesScope(card, scope){
  return card.rows.some(r => (scope.mine && r.isMine) || (scope.fav && r.isFav));
}

const SCORES_ROWS = 6;

export function golfCardHtml(card){
  const { board } = card;
  const rail = card.state === 'live'
    ? `<div class="tg-rail"><div class="tg-rail-top live">LIVE</div><div class="tg-rail-bot">R${board.round}</div></div>`
    : card.state === 'final'
      ? '<div class="tg-rail"><div class="tg-rail-top">F</div></div>'
      : `<div class="tg-rail"><div class="tg-rail-top pre">R${board.round || 1}</div></div>`;
  const shown = card.rows.slice(0, SCORES_ROWS);
  const more = card.rows.length - shown.length;
  const leaderLine = card.leader && !card.rows.some(r => r.p.id === card.leader.id) && card.state !== 'pre'
    ? `<div class="golf-card-leader">Leader: ${esc(card.leader.name)} ${esc(card.leader.toPar || '')}</div>` : '';
  return `
    <div class="tg-row clickable" onclick="openGolfEvent('${esc(card.id)}')">
      ${rail}
      <span class="tg-line"></span>
      <span class="tg-node ${card.state}"></span>
      <div class="tg-card golf-card ${card.state}">
        <div class="tg-tag">${esc(shortName(board.name))}${board.major ? ' &middot; Major' : ''}</div>
        ${shown.map(r => golfCardRowHtml(board, r)).join('')}
        ${more > 0 ? `<div class="golf-card-more">+${more} more in the field</div>` : ''}
        ${leaderLine}
      </div>
    </div>`;
}

function golfCardRowHtml(board, r){
  const { p } = r;
  const sub = board.status === 'pre' || p.state === 'pre'
    ? (p.teeTime ? `Tee ${timeOf(p.teeTime)}` : '')
    : board.status === 'post' ? 'Final' : `${roundLabel(board, p)}${p.today ? ' · ' + p.today : ''}`;
  return `
    <div class="tg-side golf-side">
      <button type="button" class="tg-badge-btn" onclick="event.stopPropagation(); openGolfer('${esc(p.id)}', 'live-now', this)" aria-label="${esc(p.name)}">${teamBadgeHtml(TEAM_META[r.teamKey])}</button>
      <div class="tg-label">
        <span class="tg-name">${esc(p.shortName || p.name)}</span>
        <span class="tg-owner">${esc([r.owner, sub].filter(Boolean).join(' · '))}</span>
      </div>
      ${r.isFav ? favoriteMarkHtml() : ''}
      <span class="golf-card-pos">${esc(board.status === 'pre' ? '' : p.finish || '')}</span>
      <span class="tg-score">${esc(board.status === 'pre' ? '' : p.toPar || '')}</span>
    </div>`;
}
