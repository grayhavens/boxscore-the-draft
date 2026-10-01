/* ============================================================
   League history: every finished season's champion and final
   standings, and the all-time table. It shows as the History half of
   the Points tab (js/overall.js), as title tags on a drafter's
   breakdown, and for a few weeks after a season is recorded, as a card
   on Home.

   Nothing shows until the first season is recorded. The commissioner
   records seasons (js/admin.js, History, which appears once every league
   is locked); the worker
   stores them (worker/champions.js, GET /champions). The shapes and
   math are js/champions.js. A copy is mirrored to localStorage so the
   tab paints before the network answers.
   ============================================================ */
import { DRAFT_TEAMS, PRE_DRAFT } from './data.js';
import { chatWorkerBase } from './api.js';
import { withGroupQuery } from './group.js';
import { fetchJSON, escapeHtml, ordinal } from './utils.js';
import { ACTIVE_SEASON, ACTIVE_SEASON_ID } from './season.js';
import { LATEST_SEASON_ID } from './seasons/index.js';
import { rankStandings, placeLabel, championsOf, namesText, allTimeTable } from './champions.js';

const STORE_KEY = 'bxHistory';
// How long Home shows the newest champion after it's recorded.
const HOME_DAYS = 21;

let seasons = loadSaved();
let openSeasonId = null;

function loadSaved(){
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    return saved && Array.isArray(saved.seasons) ? saved.seasons : [];
  } catch (e){
    return [];
  }
}

function save(){
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ seasons })); } catch (e){}
}

export function historySeasons(){
  return seasons;
}

// Points shows History only once a season has been recorded.
export function hasHistory(){
  return !PRE_DRAFT && seasons.length > 0;
}

// The worker's answer to a write (js/admin.js) or a read.
export function applyHistory(list){
  if(!Array.isArray(list)) return;
  seasons = list;
  save();
  refreshHistoryUi();
}

export async function loadHistory(){
  const data = await fetchJSON(withGroupQuery(`${chatWorkerBase()}/champions`));
  if(data) applyHistory(data.seasons);
}

const currentNames = () => Object.fromEntries(DRAFT_TEAMS.map(d => [d.id, d.name]));

const ptsText = n => (n < 0 ? '&minus;' + Math.abs(n) : String(n));

// ---- The season the app is playing, as the commissioner would record it ----

// The class on screen, from the Points ranking (js/overall.js passes its
// rows in, so this module doesn't import the ranking). null for an older
// class or before the first draft.
export function seasonFromRows(rows){
  if(PRE_DRAFT || ACTIVE_SEASON_ID !== LATEST_SEASON_ID || !/^\d{4}$/.test(ACTIVE_SEASON_ID)) return null;
  return {
    id: ACTIVE_SEASON_ID,
    label: ACTIVE_SEASON.label,
    source: 'app',
    standings: rows.map(r => ({ id: r.id, name: r.name, pts: r.total }))
  };
}

export function isSeasonRecorded(id){
  return seasons.some(s => s.id === id);
}

// ---- Points -> History ----

function championText(season){
  const champs = championsOf(season);
  return namesText(champs.map(s => escapeHtml(s.name)));
}

// "Collin 2nd", "Josh T3rd": the rest of the podium.
function podiumParts(ranked){
  return ranked.filter(s => s.rank > 1 && s.rank <= 3)
    .map(s => `${escapeHtml(s.name)} ${placeLabel(s, ranked).startsWith('T') ? 'T' : ''}${ordinal(s.rank)}`);
}

function heroHtml(season){
  const ranked = rankStandings(season.standings);
  const champs = ranked.filter(s => s.rank === 1);
  const pts = champs[0].pts;
  const rest = podiumParts(ranked);
  return `
    <div class="ob-hero">
      <div class="ob-hero-top">
        <div class="ob-hero-left">
          <span class="ob-detail-eyebrow mute">${escapeHtml(season.label)} ${champs.length > 1 ? 'co-champions' : 'champion'}</span>
          <span class="ob-hero-rankline"><span class="ob-hero-rank">${championText(season)}</span></span>
        </div>
        ${pts === null ? '' : `
        <div class="ob-hero-right">
          <span class="ob-hero-total">${ptsText(pts)}</span>
          <span class="ob-hero-total-label">final pts</span>
        </div>`}
      </div>
      ${rest.length ? `<div class="ob-hero-explain">${rest.join(' &middot; ')}</div>` : ''}
    </div>
  `;
}

// One card per season: the champion up top, the final table when open.
function seasonCardHtml(season){
  const ranked = rankStandings(season.standings);
  const expanded = openSeasonId === season.id;
  const champs = ranked.filter(s => s.rank === 1);
  const sub = [escapeHtml(season.label), champs[0].pts === null ? '' : `${ptsText(champs[0].pts)} pts`].filter(Boolean).join(' &middot; ');
  const body = expanded ? `
    <div class="ob-card-body">${ranked.map(s => `
      <div class="ob-rule static">
        <div class="ob-rule-main"><div class="ob-rule-label">${placeLabel(s, ranked)}. ${escapeHtml(s.name)}</div></div>
        <div class="ob-rule-pts">${s.pts === null ? '' : ptsText(s.pts)}</div>
      </div>`).join('')}
    </div>` : '';
  return `
    <div class="ob-card ${expanded ? 'expanded' : ''}">
      <button type="button" class="ob-card-head" onclick="historyToggleSeason('${season.id}')" aria-expanded="${expanded}">
        <span class="act-tile rank">&rsquo;${season.id.slice(2)}</span>
        <div class="ob-card-main">
          <div class="ob-card-title">${championText(season)}</div>
          <div class="ob-card-sub">${sub}</div>
        </div>
        <div class="ob-card-right">
          <svg class="ob-card-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
        </div>
      </button>
      ${body}
    </div>
  `;
}

window.historyToggleSeason = id => {
  openSeasonId = openSeasonId === id ? null : id;
  if(window.renderOverallStandings) window.renderOverallStandings();
};

// The all-time table, on the Points table's grid.
function allTimeHtml(me){
  const table = allTimeTable(seasons, currentNames());
  if(!table.length) return '';
  let rank = 0;
  const body = table.map((r, i) => {
    const prev = table[i - 1];
    if(!prev || prev.titles !== r.titles || prev.podiums !== r.podiums || prev.avg !== r.avg) rank = i + 1;
    const lead = rank === 1 && r.titles > 0;
    const tap = r.id && DRAFT_TEAMS.some(d => d.id === r.id);
    const tag = tap ? 'button' : 'div';
    return `
      <${tag} ${tap ? `type="button" onclick="obOpenSheet('${r.id}')"` : ''} class="ob-table-row ${lead ? 'leader' : ''} ${r.id && r.id === me ? 'current' : ''} ${tap ? '' : 'static'}">
        <span class="ob-rank ${lead ? 'rank-1' : ''}">${rank}</span>
        <span class="ob-table-name"><span class="ob-table-name-text">${escapeHtml(r.name)}</span></span>
        <span class="ob-table-locked">${r.seasons}</span>
        <span class="ob-table-locked">${r.podiums}</span>
        <span class="ob-table-proj">${r.titles}</span>
      </${tag}>`;
  }).join('');
  return `
    <div class="ob-section-title">All-time</div>
    <div class="ob-table">
      <div class="ob-table-row head"><span></span><span>Titles, then top-3 finishes</span><span>Played</span><span>Top 3</span><span class="pj">Titles</span></div>
      ${body}
    </div>
  `;
}

function inProgressHtml(){
  if(PRE_DRAFT || isSeasonRecorded(ACTIVE_SEASON_ID)) return '';
  return `
    <div class="ob-idle-block">
      <div class="ob-idle-title">${escapeHtml(ACTIVE_SEASON.label)} in progress</div>
      <div class="ob-idle-body">Once every league is done, the commissioner records the final standings and the champion shows up here.</div>
    </div>
  `;
}

// `me` is the drafter this device follows (their row is gold).
export function historyPanelHtml(me){
  if(!seasons.length){
    return `${inProgressHtml() || `
      <div class="ob-idle-block">
        <div class="ob-idle-title">No seasons yet</div>
        <div class="ob-idle-body">Once a season is done, the commissioner records the final standings and the champion shows up here.</div>
      </div>`}`;
  }
  return `
    ${heroHtml(seasons[0])}
    ${inProgressHtml()}
    <div class="ob-section-title">Every season</div>
    <div class="ob-cards">${seasons.map(seasonCardHtml).join('')}</div>
    ${allTimeHtml(me)}
  `;
}

// Title tags for a drafter ("2026 champion"), '' when they have none.
export function drafterTitlesHtml(drafterId){
  const years = seasons.filter(s => championsOf(s).some(c => c.id === drafterId)).map(s => s.id);
  if(!years.length) return '';
  return `<span class="act-chips">${years.map(y => `<span class="pts-tag locked">${y} champion</span>`).join('')}</span>`;
}

// ---- Home ----

// For HOME_DAYS after the newest season the app recorded: who won it.
export function renderChampionHome(){
  const el = document.getElementById('champion-home');
  if(!el) return;
  const season = seasons.find(s => s.source === 'app');
  if(PRE_DRAFT || !season || Date.now() - (season.at || 0) > HOME_DAYS * 86400000){
    el.innerHTML = '';
    return;
  }
  const ranked = rankStandings(season.standings);
  const champs = ranked.filter(s => s.rank === 1);
  const sub = [champs[0].pts === null ? '' : `${ptsText(champs[0].pts)} pts`, ...podiumParts(ranked)].filter(Boolean).join(' &middot; ');
  el.innerHTML = `
    <button type="button" class="act-link unseen" onclick="obOpenSegment('history')">
      <span class="act-dot"></span>
      <span class="act-link-body">
        <span class="act-link-title">${championText(season)} ${champs.length > 1 ? 'share' : 'wins'} the ${escapeHtml(season.label)}</span>
        ${sub ? `<span class="act-link-sub">${sub}</span>` : ''}
      </span>
      <span class="act-link-go">History &rsaquo;</span>
    </button>
  `;
}

export function refreshHistoryUi(){
  renderChampionHome();
  const view = document.getElementById('view-overall');
  if(view && view.classList.contains('active') && window.renderOverallStandings) window.renderOverallStandings();
}

export function startHistory(){
  renderChampionHome();
  if(!PRE_DRAFT) loadHistory();
}
