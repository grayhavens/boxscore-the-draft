/* ============================================================
   WNBA Standings: a single flat league-wide ranking, no conference
   split — unlike NBA/NHL/MLB (js/standings-flat.js's East/West/
   Divisions machinery), WNBA has no real conference or division
   structure worth keeping separate for a fantasy-draft standings view,
   so this behaves like EPL's own single-table Standings block
   (js/standings-epl.js) instead: "League" (every WNBA team, ranked
   league-wide) and "Drafted" (each drafter's combined record — one
   team each, so this is really just that team's own record reordered
   by win%).
   ============================================================ */
import { LEAGUES, TEAM_META, DRAFT_TEAMS } from './data.js';
import { teamBadgeHtml, abbrFromName, segmentedControlHtml, formatWinPct } from './utils.js';
import { fetchEspnWnbaStandings } from './espn.js';
import { findFlatTeamKey } from './standings-flat.js';
import { renderStandings } from './board.js';
import { cacheGet, cacheSet } from './frozen-cache.js';

const ESPN_WNBA_STANDINGS_CACHE_KEY = 'teamDashboardEspnWnbaStandingsCache';
const WNBA_STANDINGS_TTL_MS = 60 * 60 * 1000;
export const espnWnbaStandingsCache = { table: null, error: false, loading: false, fetchedAt: null };
let wnbaStandingsPromise = null;

function winPct(row){
  return (row.wins + row.losses) > 0 ? row.wins / (row.wins + row.losses) : null;
}

function wnbaStandingsIsFresh(){
  return !!espnWnbaStandingsCache.table && !!espnWnbaStandingsCache.fetchedAt && (Date.now() - espnWnbaStandingsCache.fetchedAt) < WNBA_STANDINGS_TTL_MS;
}

function saveWnbaStandingsCache(){
  try { cacheSet('wnba', ESPN_WNBA_STANDINGS_CACHE_KEY, JSON.stringify(espnWnbaStandingsCache)); } catch (e){}
}

export function loadEspnWnbaStandingsCache(){
  try {
    const raw = cacheGet('wnba', ESPN_WNBA_STANDINGS_CACHE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(parsed && parsed.table){
      espnWnbaStandingsCache.table = parsed.table;
      espnWnbaStandingsCache.fetchedAt = parsed.fetchedAt || null;
    }
  } catch (e){}
}

// fetchEspnWnbaStandings (js/espn.js) returns every team already, just
// each row carrying its own conference-relative winPercent (it reads
// the same fetchEspnFlatStandings NBA/NHL/MLB use, which groups by
// conference internally but flattens back out to one array) — this
// just re-sorts that flat array league-wide and stamps a real 1..N
// rank, since there's no per-conference view left to rank within.
export function fetchEspnWnbaStandingsCached(){
  if(espnWnbaStandingsCache.loading) return wnbaStandingsPromise;
  if(wnbaStandingsIsFresh()) return Promise.resolve();

  espnWnbaStandingsCache.loading = true;
  wnbaStandingsPromise = (async () => {
    const rows = await fetchEspnWnbaStandings();
    espnWnbaStandingsCache.loading = false;
    if(rows && rows.length){
      const sorted = rows.slice().sort((a, b) => {
        const pa = a.winPercent ?? -1, pb = b.winPercent ?? -1;
        if(pb !== pa) return pb - pa;
        if(b.wins !== a.wins) return b.wins - a.wins;
        return a.teamName.localeCompare(b.teamName);
      });
      sorted.forEach((row, i) => { row.rank = i + 1; });
      espnWnbaStandingsCache.table = sorted;
      espnWnbaStandingsCache.error = false;
      espnWnbaStandingsCache.fetchedAt = Date.now();
      saveWnbaStandingsCache();
    } else if(!espnWnbaStandingsCache.table){
      // Only flag "no data" if we never had a table to fall back on —
      // a transient failure on a background refresh should keep
      // showing the last-known-good table, not blank it out.
      espnWnbaStandingsCache.error = true;
    }
    renderStandings();
    renderAllWnbaCardRecords();
  })();
  return wnbaStandingsPromise;
}

// Given a drafted team's own meta, find its row in the flat table —
// used by wnbaRecordLabel (board cards) and the team modal's stat
// strip (js/live-data.js), same exact-match rule as NBA/NHL/MLB (see
// findFlatTeamKey's own comment in js/standings-flat.js) rather than
// EPL/CFB's looser substring rule.
export function findEspnWnbaRow(meta){
  const rows = espnWnbaStandingsCache.table;
  if(!rows) return null;
  const teamKey = LEAGUES.find(l => l.key === 'wnba').teams.find(tk => TEAM_META[tk] === meta) || null;
  if(!teamKey) return null;
  return rows.find(row => findFlatTeamKey('wnba', row.teamNickname) === teamKey) || null;
}

export function wnbaRecordLabel(meta){
  const row = findEspnWnbaRow(meta);
  return row ? `${row.wins}-${row.losses}` : '';
}

export function renderWnbaCardRecord(teamKey){
  const el = document.getElementById('wnba-record-' + teamKey);
  if(!el) return;
  const label = wnbaRecordLabel(TEAM_META[teamKey]);
  el.innerHTML = label ? ` &middot; ${label}` : '';
}

export function renderAllWnbaCardRecords(){
  LEAGUES.find(l => l.key === 'wnba').teams.forEach(renderWnbaCardRecord);
}

export function renderWnbaStandingsRow(row, rank){
  const teamKey = findFlatTeamKey('wnba', row.teamNickname);
  // An undrafted team has no TEAM_META entry (so no SportsDB badge),
  // but ESPN's own logoUrl covers it — real crest, same onerror
  // fallback to the plain monogram if it ever fails (mirrors
  // renderNflStandingsRow in js/standings-nfl.js). Mascot only
  // ("Valkyries"), not the full "Golden State Valkyries") — every
  // drafted team's own TEAM_META.name is mascot-only too, so this
  // keeps undrafted rows visually consistent with them.
  const meta = teamKey ? TEAM_META[teamKey] : {
    name: row.teamNickname || row.teamName,
    badgeStyle: 'background: rgba(255,255,255,0.08); color: var(--text-sub); border-color: var(--hairline-strong);',
    badgeText: row.abbreviation || abbrFromName(row.teamNickname || row.teamName),
    badgeUrl: row.logoUrl || null
  };
  const ownerHtml = `<div class="team-sub">${teamKey ? DRAFT_TEAMS.find(d => d.id === meta.draftTeamId).name : 'Undrafted'}</div>`;
  // Same two-tier record treatment as the Drafted view's row below —
  // the raw W-L record as the bold line, win% called out underneath.
  const rowPct = winPct(row);
  const recordHtml = `<span class="person-record-primary">${row.wins}-${row.losses}</span>${rowPct !== null ? `<span class="person-record-secondary">${formatWinPct(rowPct)}</span>` : ''}`;

  return `
    <div class="standings-row ${teamKey ? 'clickable' : ''}" ${teamKey ? `onclick="openTeamPage('${teamKey}', 'standings', this)"` : ''}>
      <div class="standings-rank">${row.rank}</div>
      ${teamBadgeHtml(meta)}
      <div class="team-main">
        <div class="team-name">${meta.name}</div>
        ${ownerHtml}
      </div>
      <div class="person-record-chip">${recordHtml}</div>
    </div>
  `;
}

// Toggle between the real team-by-team table and each drafter's own
// combined record — with one WNBA team per drafter, "Drafted" is just
// that same team reordered by win% rather than a genuine combination,
// but it stays for the same at-a-glance "how am I doing" view every
// other league's Drafted tab gives.
export let wnbaStandingsMode = 'table';

export function setWnbaStandingsMode(mode){
  wnbaStandingsMode = mode;
  renderStandings();
}
window.setWnbaStandingsMode = setWnbaStandingsMode;

export function computeWnbaDrafterCombined(){
  const league = LEAGUES.find(l => l.key === 'wnba');
  const byDrafter = {};
  DRAFT_TEAMS.forEach(d => {
    byDrafter[d.id] = { id: d.id, name: d.name, wins: 0, losses: 0, found: 0, total: 0, teamNames: [] };
  });

  league.teams.forEach(teamKey => {
    const meta = TEAM_META[teamKey];
    byDrafter[meta.draftTeamId].total++;
    byDrafter[meta.draftTeamId].teamNames.push(meta.name);
  });

  (espnWnbaStandingsCache.table || []).forEach(row => {
    const teamKey = findFlatTeamKey('wnba', row.teamNickname);
    if(!teamKey) return;
    const bucket = byDrafter[TEAM_META[teamKey].draftTeamId];
    bucket.wins += row.wins || 0;
    bucket.losses += row.losses || 0;
    bucket.found++;
  });

  return Object.values(byDrafter).sort((a, b) => {
    if(a.found === 0 && b.found === 0) return 0;
    if(a.found === 0) return 1;
    if(b.found === 0) return -1;
    const pa = winPct(a) ?? -1, pb = winPct(b) ?? -1;
    if(pb !== pa) return pb - pa;
    return b.wins - a.wins;
  });
}

export function renderWnbaByDrafterRow(row, rank){
  const teamsLabel = row.teamNames.join(' · ');
  let note = '';
  if(row.found === 0) note = 'No data yet';
  else if(row.found < row.total) note = `${row.found} of ${row.total} teams reporting`;

  // Two-tier: the raw W-L record as the bold line, win% called out
  // underneath — see .person-record-chip in css/style.css.
  const pct = winPct(row);
  const recordHtml = row.found > 0
    ? `<span class="person-record-primary">${row.wins}-${row.losses}</span>${pct !== null ? `<span class="person-record-secondary">${formatWinPct(pct)}</span>` : ''}`
    : `<span class="person-record-primary">&mdash;</span>`;

  return `
    <div class="standings-row">
      <div class="standings-rank">${row.found > 0 ? rank : '—'}</div>
      <div class="team-main">
        <div class="team-name">${row.name}</div>
        <div class="team-sub">${teamsLabel}${note ? ' &middot; ' + note : ''}</div>
      </div>
      <div class="person-record-chip">${recordHtml}</div>
    </div>
  `;
}

export function wnbaStandingsToggleHtml(){
  const segments = [
    { key: 'table', label: 'League' },
    { key: 'byDrafter', label: 'Drafted' }
  ];
  return `
    <div class="standings-toggle">
      ${segmentedControlHtml(segments, wnbaStandingsMode, 'setWnbaStandingsMode')}
    </div>
  `;
}
