/* ============================================================
   Everything golfer-shaped on screen, for a group with PGA Tour in its
   league list (js/seasons/pga.js):
   - the golfer sheet (openGolfer): FedEx rank and points, this week's
     tournament, and every event of the season;
   - the tournament sheet (openGolfEvent): a full leaderboard;
   - the Standings block: the FedEx Cup table, and each drafter's
     combined FedEx points (the league bonus);
   - Home rows: FedEx rank after the country, and this week's place in
     the status slot;
   - the Scores tab's tournament card (golfCardsForDay, js/live-now.js).

   Data comes from js/golf-api.js: the season's finished events from the
   worker, and the event being played straight from ESPN. A golfer is
   known by ESPN athlete id; a TEAM_META entry (kind 'golfer') is only
   how the app knows who drafted or starred one.
   ============================================================ */
import { TEAM_META, DRAFT_TEAMS, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT, leagueOf } from './data.js';
import {
  teamBadgeHtml, escapeHtml as esc, skeletonLinesHtml, skeletonRowsHtml, lockBodyScroll, openSheetOverlay,
  isSheetOpen, standingsOwnerHtml, standingsToggleHtml, draftOwnerName, localYyyymmdd
} from './utils.js';
import { fetchGolfSeason, fetchCurrentGolfEvent, fetchGolfLeaderboard, fetchGolferRecord, fetchGolfEventsOn } from './golf-api.js';
import { golferResults, fedexTable, finishPosition, isMissedCut, golferHeadshotUrl } from './golf.js';
import { PGA_ACCENT } from './seasons/pga.js';
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
  if(!hasGolf()) return Promise.resolve();
  if(loadPromise) return loadPromise;
  if(!force && golfStore.events && Date.now() - golfStore.fetchedAt < SEASON_TTL_MS) return refreshGolfLive();
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
      golfStore.fetchedAt = Date.now();
    } else if(!golfStore.events){
      golfStore.error = true;
    }
    await refreshGolfLive(true);
    golfChanged();
  })().finally(() => { loadPromise = null; });
  return loadPromise;
}

// This week's event. Its leaderboard is refetched once a minute while
// it's being played, and not at all when nothing is on.
export async function refreshGolfLive(force = false){
  if(!hasGolf()) return;
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

function golfChanged(){
  standingsDataChanged();
  renderAllPgaCardRecords();
  const content = document.getElementById('modal-content');
  const active = content && content.dataset.activeTeam;
  if(active && active.startsWith('golfer:') && isSheetOpen(document.getElementById('modal-overlay'))){
    renderGolferSheet(active.slice('golfer:'.length));
  }
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
  if(p.thru === '18' || p.thru === 'F') return `R${board.round} · F`;
  return `R${board.round} · Thru ${p.thru}`;
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
    el.innerHTML = '';
    return;
  }
  const live = board.status === 'in' && p.state === 'in';
  el.className = 'status-slot' + (live ? ' live' : '');
  const value = board.status === 'pre' ? esc(shortName(board.name)) : `${esc(p.finish || '—')}${p.toPar ? ' &middot; ' + esc(p.toPar) : ''}`;
  el.innerHTML = `<span class="meta-label${live ? ' live' : ''}">${live ? '<span class="dot pulse"></span>' : ''}${esc(roundLabel(board, p))}</span><span class="meta-value">${value}</span>`;
}

const shortName = name => String(name || '').replace(/\s+(pres\.|presented)\s.*$/i, '');

// ---- Golfer sheet ----

export function openGolfer(athleteId){
  const id = String(athleteId);
  openSheetOverlay(document.getElementById('modal-overlay'));
  lockBodyScroll();
  const content = document.getElementById('modal-content');
  content.dataset.activeTeam = 'golfer:' + id;
  renderGolferSheet(id);
  loadGolf();
  const season = golfStore.season;
  if(season && !records[`${season}:${id}`]){
    fetchGolferRecord(id, season).then(r => {
      if(!r) return;
      records[`${season}:${id}`] = r;
      if(content.dataset.activeTeam === 'golfer:' + id) renderGolferSheet(id);
    });
  }
}
window.openGolfer = openGolfer;

function priorSeasonNoteHtml(){
  if(!PRIOR_SEASON_DISPLAY_LEAGUES.includes('pga') || !golfStore.season) return '';
  const yy = y => String(y).slice(-2);
  return `<div class="prior-season-note golf-note">Showing the '${yy(golfStore.season)} FedEx Cup season &mdash; points count from the '${yy(Number(golfStore.season) + 1)} season.</div>`;
}

function renderGolferSheet(id){
  const content = document.getElementById('modal-content');
  const teamKey = teamKeyFor(id);
  const meta = golferBadgeMeta(id);
  const owner = teamKey && !PRE_DRAFT ? draftOwnerName(teamKey) : '';
  const flag = (meta.flag || (golfStore.names[id] || [])[1]) || '';
  const country = teamKey ? TEAM_META[teamKey].sub : '';
  const ready = !!golfStore.events;
  const line = ready ? seasonLine(id) : null;
  const cell = (num, lbl) => `<div class="stat-cell"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;

  content.innerHTML = `
    <div class="modal-accent" style="background:${PGA_ACCENT};"></div>
    <div class="modal-head">
      ${teamBadgeHtml(meta)}
      <div>
        <h2>${esc(meta.name)}</h2>
        <div class="modal-sub golf-sub">${flag ? `<img class="golf-flag" src="https://a.espncdn.com/i/teamlogos/countries/500/${esc(flag)}.png" alt="">` : ''}${esc(country || 'PGA Tour')}${owner ? ` &middot; Drafted by ${esc(owner)}` : ''}</div>
      </div>
      <div class="modal-actions">
        ${teamKey ? favoriteStarHtml(teamKey) : ''}
        <button class="modal-close" onclick="closeTeamModal()">&times;</button>
      </div>
    </div>
    <div class="stat-strip">
      ${line
        ? cell(line.rank ? '#' + line.rank : '—', 'FedEx') + cell(fmtPts(line.points), 'Points') + cell(line.wins, 'Wins') + cell(line.topTens, 'Top 10s')
        : `<div class="stat-cell"><div class="lbl">Loading…</div></div>`}
    </div>
    <div class="modal-body">
      ${priorSeasonNoteHtml()}
      <div class="modal-section-title">This week</div>
      <div class="golf-week">${thisWeekHtml(id)}</div>
      <div class="modal-section-title">${golfStore.season ? `${golfStore.season} season` : 'Season'}${line ? ` <span class="golf-title-note">${line.cutsMade} of ${line.starts} cuts made</span>` : ''}</div>
      <div class="golf-results">${ready ? seasonResultsHtml(line) : skeletonLinesHtml(4)}</div>
    </div>
  `;
}

function thisWeekHtml(id){
  const cur = golfStore.current;
  if(!golfStore.events && golfStore.loading) return skeletonLinesHtml(2);
  if(!cur) return '<div class="golf-muted">No PGA Tour event this week.</div>';
  const { event, board } = cur;
  const when = `${shortDate(event.start)} – ${shortDate(event.end)}`;
  const head = `<button type="button" class="golf-event-link" onclick="openGolfEvent('${esc(event.id)}')"><span>${esc(shortName(event.name))}</span><span class="golf-muted">${board && board.status === 'in' ? `Round ${board.round}` : board && board.status === 'post' ? 'Final' : when}</span></button>`;
  if(!board) return head + '<div class="golf-muted">The field isn’t out yet.</div>';
  const p = board.players.find(x => x.id === id);
  if(!p) return head + '<div class="golf-muted">Not in the field this week.</div>';
  if(board.status === 'pre' || p.state === 'pre'){
    return head + `<div class="golf-muted">${p.teeTime ? `Tees off ${new Date(p.teeTime).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'In the field'}</div>`;
  }
  const live = board.status === 'in' && p.state === 'in';
  return head + `
    <div class="golf-week-line${live ? ' live' : ''}">
      <div class="golf-week-pos">${esc(p.finish || '—')}</div>
      <div class="golf-week-score">
        <div class="golf-week-topar">${esc(p.toPar || 'E')}</div>
        <div class="golf-muted">${live ? '<span class="dot pulse"></span>' : ''}${esc(roundLabel(board, p))}${p.today && board.status !== 'post' ? ` &middot; Today ${esc(p.today)}` : ''}</div>
      </div>
    </div>`;
}

function finishClass(finish){
  const pos = finishPosition(finish);
  if(pos === 1) return 'win';
  if(pos !== null && pos <= 10) return 'top';
  if(isMissedCut(finish) || finish === 'WD' || finish === 'DQ') return 'miss';
  return '';
}

function seasonResultsHtml(line){
  if(!line.played.length) return '<div class="golf-muted">No starts this season.</div>';
  return line.played.slice().reverse().map(r => `
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
  const board = await fetchGolfLeaderboard(eventId);
  if(content.dataset.activeTeam !== 'event:' + eventId) return;
  content.innerHTML = eventSheetHtml(board, board);
}
window.openGolfEvent = openGolfEvent;

function eventSheetHtml(head, board){
  const status = !head ? '' : head.status === 'in' ? `Round ${head.round || ''} · In progress`
    : head.status === 'post' ? 'Final' : head.status === 'canceled' ? 'Cancelled' : head.start ? `Starts ${shortDate(head.start)}` : '';
  const rows = board ? board.players : null;
  return `
    <div class="modal-accent" style="background:${PGA_ACCENT};"></div>
    <div class="modal-head">
      <div>
        <h2>${esc(shortName(head ? head.name : 'Tournament'))}</h2>
        <div class="modal-sub">${esc(status)}${head && head.major ? ' &middot; Major' : ''}${board && board.purse ? ` &middot; ${esc(board.purse)} purse` : ''}</div>
      </div>
      <div class="modal-actions"><button class="modal-close" onclick="closeTeamModal()">&times;</button></div>
    </div>
    <div class="modal-body golf-board">
      ${rows === null ? skeletonRowsHtml(8) : rows.length ? rows.map(p => leaderRowHtml(board, p)).join('') : '<div class="golf-muted">The field isn’t out yet.</div>'}
    </div>`;
}

function leaderRowHtml(board, p){
  const teamKey = teamKeyFor(p.id);
  const tracked = isTracked(teamKey);
  const owner = teamKey && !PRE_DRAFT && !TEAM_META[teamKey].favoriteOnly ? draftOwnerName(teamKey) : '';
  const detail = board.status === 'post'
    ? p.rounds.filter(v => v !== null).join(' · ')
    : board.status === 'in' && p.state !== 'pre' ? `${roundLabel(board, p)}${p.today ? ' · ' + p.today : ''}` : p.teeTime ? `Tee ${timeOf(p.teeTime)}` : '';
  return `
    <button type="button" class="golf-lb-row${tracked && !PRE_DRAFT ? ' tracked' : ''}" onclick="openGolfer('${esc(p.id)}')">
      <span class="golf-lb-pos">${esc(p.finish || '')}</span>
      <span class="golf-lb-name">${esc(p.name)}${owner ? `<span class="golf-owner">${esc(owner)}</span>` : ''}</span>
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
  const toggle = standingsToggleHtml([{ key: 'table', label: 'FedEx Cup' }, { key: 'byDrafter', label: 'Drafted' }], pgaStandingsMode, 'setPgaStandingsMode');
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
    <div class="standings-row clickable" onclick="openGolfer('${esc(r.id)}')">
      <div class="standings-rank">${r.rank}</div>
      ${teamBadgeHtml(meta)}
      <div class="team-main">
        <div class="team-name">${esc(meta.name)}</div>
        ${teamKey ? standingsOwnerHtml(TEAM_META[teamKey].favoriteOnly ? null : teamKey) : ''}
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
      <button type="button" class="tg-badge-btn" onclick="event.stopPropagation(); openGolfer('${esc(p.id)}')" aria-label="${esc(p.name)}">${teamBadgeHtml(TEAM_META[r.teamKey])}</button>
      <div class="tg-label">
        <span class="tg-name">${esc(p.name)}</span>
        <span class="tg-owner">${esc([r.owner, sub].filter(Boolean).join(' · '))}</span>
      </div>
      ${r.isFav ? favoriteMarkHtml() : ''}
      <span class="golf-card-pos">${esc(board.status === 'pre' ? '' : p.finish || '')}</span>
      <span class="tg-score">${esc(board.status === 'pre' ? '' : p.toPar || '')}</span>
    </div>`;
}
