/* ============================================================
   College Basketball Standings: the real AP Top 25, plus each
   drafter's combined win percentage across their 3 mcbb teams — same
   idea as js/standings-cfb.js (no single "League" table view here
   either: 365 D1 teams across 31 conferences has no useful one-table
   shape, so this only ever shows Rank/Person, matching CFB's own
   reasoning for skipping a League view).

   Modeled on js/standings-cfb.js, but simpler in one real way: matching
   an ESPN row back to a drafted team goes by a static espnTeamId on
   TEAM_META (js/data.js), not by name. CFB needs a name-override table
   (CFB_ESPN_NAME_OVERRIDES) because ESPN's `location` field doesn't
   always match this app's shortened TEAM_META.name ("IU" vs "Indiana").
   mcbb's roster has the same problem, worse: several drafted teams'
   TEAM_META.name is an abbreviation ESPN's location never uses at all
   (NDSU vs "North Dakota State", SLU vs "Saint Louis"), and a plain
   substring rule (findDraftedTeamByName in js/utils.js) has real
   false positives here beyond what an override table could patch
   cleanly — "Texas" is a literal substring of "Texas Tech", and both
   are drafted, the same class of bug js/standings-flat.js's header
   comment documents for NBA's "Nets"/"Hornets". Every one of this
   app's 30 drafted mcbb teams' real ESPN team id was already known
   (baked into each TEAM_META entry's existing badgeUrl, e.g. Houston's
   ".../ncaa/500/248.png") and verified live (2026-09-17) against
   fetchEspnCbbStandings — 30/30 matched — so espnTeamId just makes that
   already-known id an explicit field instead of parsing it back out of
   a CDN URL every time.

   Unlike CFB, there's no FCS-style gap needing a defensive per-team
   fallback fetch either — ESPN's mens-college-basketball standings
   endpoint lists all 365 D1 teams as direct conference entries (no
   CFB-style "Sun Belt nests a division deeper" surprise), so every
   drafted team resolves from the one bulk standings call.

   TheRundown (RUNDOWN_SPORT_ID.mcbb, js/api.js) stays wired up as a
   defensive fallback only, same status as CFB's NDSU/TheSportsDB
   fallback — see js/live-data.js's fetchTeamBundle: FLAT_SCHEDULE_LEAGUES
   is checked before the plain `meta.rundownTeamId` "rundown-only"
   branch, so a team here only ever reaches TheRundown if findEspnCbbRow
   genuinely fails to resolve it on a given refresh, which shouldn't
   happen for any of today's 30 drafted teams.
   ============================================================ */
import { LEAGUES, TEAM_META, DRAFT_TEAMS } from './data.js';
import { teamBadgeHtml, abbrFromName, segmentedControlHtml, formatWinPct } from './utils.js';
import { fetchEspnCbbRankings, fetchEspnCbbStandings } from './espn.js';
import { renderStandings } from './board.js';
import { liveDataCache, renderStats } from './live-data.js';

// ---- Full-roster records (all 30 drafted teams, one bulk ESPN call) ----

const ESPN_CBB_STANDINGS_CACHE_KEY = 'teamDashboardEspnCbbStandingsCache';
// A team's record only changes after its own game — same hourly cadence
// every other ESPN-standings cache in this app uses (see
// ESPN_CFB_RECORDS_TTL_MS in js/standings-cfb.js).
const ESPN_CBB_STANDINGS_TTL_MS = 60 * 60 * 1000;
export const espnCbbStandingsCache = { rows: null, error: false, loading: false, fetchedAt: null };
let espnCbbStandingsPromise = null;

function espnCbbStandingsIsFresh(){
  return !!espnCbbStandingsCache.rows && !!espnCbbStandingsCache.fetchedAt && (Date.now() - espnCbbStandingsCache.fetchedAt) < ESPN_CBB_STANDINGS_TTL_MS;
}

function saveEspnCbbStandingsCache(){
  try { localStorage.setItem(ESPN_CBB_STANDINGS_CACHE_KEY, JSON.stringify(espnCbbStandingsCache)); } catch (e){}
}

export function loadEspnCbbStandingsCache(){
  try {
    const raw = localStorage.getItem(ESPN_CBB_STANDINGS_CACHE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(parsed && parsed.rows){
      espnCbbStandingsCache.rows = parsed.rows;
      espnCbbStandingsCache.fetchedAt = parsed.fetchedAt || null;
    }
  } catch (e){}
}

export function fetchEspnCbbStandingsCached(){
  if(espnCbbStandingsCache.loading) return espnCbbStandingsPromise;
  if(espnCbbStandingsIsFresh()) return Promise.resolve();

  espnCbbStandingsCache.loading = true;
  espnCbbStandingsPromise = (async () => {
    const rows = await fetchEspnCbbStandings();
    espnCbbStandingsCache.loading = false;
    if(rows && rows.length){
      espnCbbStandingsCache.rows = rows;
      espnCbbStandingsCache.error = false;
      espnCbbStandingsCache.fetchedAt = Date.now();
      saveEspnCbbStandingsCache();
    } else if(!espnCbbStandingsCache.rows){
      // Same "don't blank out a good cache on a transient miss" rule
      // every other ESPN-standings cache in this app follows.
      espnCbbStandingsCache.error = true;
    }
    renderStandings();
    renderAllCbbCardRecords();
    const activeTeam = document.getElementById('modal-content').dataset.activeTeam;
    const activeMeta = activeTeam && TEAM_META[activeTeam];
    if(activeMeta && activeMeta.leagueKey === 'mcbb'){
      renderStats(activeMeta, liveDataCache[activeTeam] || {});
    }
  })();
  return espnCbbStandingsPromise;
}

// Given a drafted team's own meta, find its row in the ESPN standings
// cache — by espnTeamId, not name (see file header). Exported for
// js/live-data.js too: this is also how fetchTeamBundle resolves this
// team's ESPN id for the schedule/live-score fetch (FLAT_SCHEDULE_LEAGUES'
// `findRow`); a null return falls back to the plain TheRundown
// "rundown-only" branch there instead of getting no data at all.
export function findEspnCbbRow(meta){
  const rows = espnCbbStandingsCache.rows;
  if(!rows || !meta.espnTeamId) return null;
  return rows.find(row => row.id === meta.espnTeamId) || null;
}

// The real win-loss record (and AP Top 25 rank, if any) for a drafted
// mcbb team.
export function findCbbRecord(meta){
  const row = findEspnCbbRow(meta);
  if(!row) return null;
  const rankRow = (espnCbbRankingsCache.ranks || []).find(r => r.id === meta.espnTeamId);
  return { wins: row.wins, losses: row.losses, ranking: rankRow ? rankRow.rank : null };
}

// A team's 1-based rank within its own conference — same idea as
// nflConferenceRank/nbaConferenceRank (js/standings-nfl.js/-nba.js),
// shown next to the Conference stat cell so "Big Ten" also reads as
// "Big Ten · #2". Unlike those, this isn't built on
// js/standings-flat.js's shared createFlatStandingsBoard engine (mcbb
// never adopted that — see this file's header comment), so it's a
// small standalone version instead: filter espnCbbStandingsCache's 365
// teams down to this team's own conference (30+ teams even for one
// conference, e.g. the ACC's 18 — real rank, not a top-25-only
// approximation), sorted the same win%-then-name way NBA's
// sortConference does.
export function computeCbbConferenceStandings(conferenceAbbr){
  const rows = (espnCbbStandingsCache.rows || []).filter(row => row.conferenceAbbr === conferenceAbbr);
  return rows.sort((a, b) => {
    const pa = a.winPercent ?? -1, pb = b.winPercent ?? -1;
    if(pb !== pa) return pb - pa;
    return a.teamName.localeCompare(b.teamName);
  });
}

export function cbbConferenceRank(meta){
  const row = findEspnCbbRow(meta);
  if(!row || !row.conferenceAbbr) return null;
  const standings = computeCbbConferenceStandings(row.conferenceAbbr);
  const idx = standings.indexOf(row);
  return idx === -1 ? null : idx + 1;
}

// Record (and AP rank, if any) shown on each mcbb team's board row —
// painted onto the per-team span rather than re-rendering the whole
// board, same targeted-update pattern as renderCfbCardRecord.
export function cbbRecordLabel(meta){
  const rec = findCbbRecord(meta);
  if(!rec || rec.wins === null) return '';
  const record = `${rec.wins}-${rec.losses}`;
  return typeof rec.ranking === 'number' ? `#${rec.ranking} &middot; ${record}` : record;
}

export function renderCbbCardRecord(teamKey){
  const el = document.getElementById('cfb-record-' + teamKey);
  if(!el) return;
  const label = cbbRecordLabel(TEAM_META[teamKey]);
  el.innerHTML = label ? ` &middot; ${label}` : '';
}

export function renderAllCbbCardRecords(){
  LEAGUES.find(l => l.key === 'mcbb').teams.forEach(renderCbbCardRecord);
}

// ---- AP Top 25 (ESPN-sourced) ----

const ESPN_CBB_RANKINGS_CACHE_KEY = 'teamDashboardEspnCbbRankingsCache';
// Same hourly cadence as CFB's rankings cache — the poll only moves
// about once a week in-season, but there's no reason for this cache to
// march to a different rhythm than every other one in this file.
const ESPN_CBB_RANKINGS_TTL_MS = 60 * 60 * 1000;
export const espnCbbRankingsCache = { ranks: null, error: false, loading: false, fetchedAt: null };
let espnCbbRankingsPromise = null;

function espnCbbRankingsIsFresh(){
  return !!espnCbbRankingsCache.ranks && !!espnCbbRankingsCache.fetchedAt && (Date.now() - espnCbbRankingsCache.fetchedAt) < ESPN_CBB_RANKINGS_TTL_MS;
}

function saveEspnCbbRankingsCache(){
  try { localStorage.setItem(ESPN_CBB_RANKINGS_CACHE_KEY, JSON.stringify(espnCbbRankingsCache)); } catch (e){}
}

export function loadEspnCbbRankingsCache(){
  try {
    const raw = localStorage.getItem(ESPN_CBB_RANKINGS_CACHE_KEY);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(parsed && parsed.ranks){
      espnCbbRankingsCache.ranks = parsed.ranks;
      espnCbbRankingsCache.fetchedAt = parsed.fetchedAt || null;
    }
  } catch (e){}
}

export function fetchEspnCbbRankingsCached(){
  if(espnCbbRankingsCache.loading) return espnCbbRankingsPromise;
  if(espnCbbRankingsIsFresh()) return Promise.resolve();

  espnCbbRankingsCache.loading = true;
  espnCbbRankingsPromise = (async () => {
    const ranks = await fetchEspnCbbRankings();
    espnCbbRankingsCache.loading = false;
    if(ranks && ranks.length){
      espnCbbRankingsCache.ranks = ranks;
      espnCbbRankingsCache.error = false;
      espnCbbRankingsCache.fetchedAt = Date.now();
      saveEspnCbbRankingsCache();
    } else if(!espnCbbRankingsCache.ranks){
      espnCbbRankingsCache.error = true;
    }
    renderStandings();
  })();
  return espnCbbRankingsPromise;
}

function findCbbTeamKeyByEspnId(espnTeamId){
  const teams = LEAGUES.find(l => l.key === 'mcbb').teams;
  return teams.find(teamKey => TEAM_META[teamKey].espnTeamId === espnTeamId) || null;
}

// ranks is already sorted 1-25 by ESPN.
export function computeCbbRankingTable(){
  return espnCbbRankingsCache.ranks || [];
}

export function renderCbbRankingRow(rank){
  const teamKey = findCbbTeamKeyByEspnId(rank.id);
  // A ranked-but-undrafted team has no TEAM_META entry — ESPN's own
  // logoUrl covers the badge, same as CFB's renderCfbRankingRow.
  const meta = teamKey ? TEAM_META[teamKey] : {
    name: rank.location || rank.teamName,
    badgeStyle: 'background: rgba(255,255,255,0.08); color: var(--text-sub); border-color: var(--hairline-strong);',
    badgeText: abbrFromName(rank.location || rank.teamName),
    badgeUrl: rank.logoUrl || null
  };
  // favoriteOnly (js/data.js) is a personal add-on outside the real
  // draft — flagged here as "· Favorite" so the owner name doesn't read
  // as one of that drafter's 3 real mcbb picks.
  const ownerHtml = `<div class="team-sub">${teamKey ? DRAFT_TEAMS.find(d => d.id === meta.draftTeamId).name + (meta.favoriteOnly ? ' · Favorite' : '') : 'Undrafted'}</div>`;
  // Same two-tier record treatment as the Drafted view's row (see
  // .person-record-chip in css/style.css and renderCbbByDrafterRow
  // below).
  const m = /^(\d+)-(\d+)/.exec(rank.record || '');
  const wins = m ? parseInt(m[1], 10) : null;
  const losses = m ? parseInt(m[2], 10) : null;
  const pct = wins !== null && (wins + losses) > 0 ? wins / (wins + losses) : null;
  const recordHtml = `<span class="person-record-primary">${rank.record || ''}</span>${pct !== null ? `<span class="person-record-secondary">${formatWinPct(pct)}</span>` : ''}`;

  return `
    <div class="standings-row ${teamKey ? 'clickable' : ''}" ${teamKey ? `onclick="openTeamPage('${teamKey}', 'standings')"` : ''}>
      <div class="standings-rank">${rank.rank}</div>
      ${teamBadgeHtml(meta)}
      <div class="team-main">
        <div class="team-name">${meta.name}</div>
        ${ownerHtml}
      </div>
      <div class="person-record-chip">${recordHtml}</div>
    </div>
  `;
}

// Toggle between the real national Top 25 and each drafter's combined
// record — same idea as cfbStandingsMode in js/standings-cfb.js.
export let cbbStandingsMode = 'ranking';

export function setCbbStandingsMode(mode){
  cbbStandingsMode = mode;
  renderStandings();
}
window.setCbbStandingsMode = setCbbStandingsMode;

export function cbbStandingsToggleHtml(){
  const segments = [
    { key: 'ranking', label: 'AP Top 25' },
    { key: 'byDrafter', label: 'Drafted' }
  ];
  return `
    <div class="standings-toggle">
      ${segmentedControlHtml(segments, cbbStandingsMode, 'setCbbStandingsMode')}
    </div>
  `;
}

// Combined win percentage across each drafter's 3 mcbb teams — matches
// LEAGUE_SCORING.mcbb.bonus ("Best combined win percentage") exactly,
// same as CFB's computeCfbDrafterCombined.
export function computeCbbDrafterCombined(){
  const league = LEAGUES.find(l => l.key === 'mcbb');
  // Excludes any favoriteOnly team (see its definition in js/data.js) —
  // a personal add-on outside the real draft must never move a
  // drafter's combined record/bonus standing, only their own board.
  const scoringTeams = league.teams.filter(teamKey => !TEAM_META[teamKey].favoriteOnly);
  const byDrafter = {};
  DRAFT_TEAMS.forEach(d => {
    byDrafter[d.id] = { id: d.id, name: d.name, wins: 0, losses: 0, found: 0, total: 0, teamNames: [] };
  });

  scoringTeams.forEach(teamKey => {
    const meta = TEAM_META[teamKey];
    byDrafter[meta.draftTeamId].total++;
    byDrafter[meta.draftTeamId].teamNames.push(meta.name);
  });

  scoringTeams.forEach(teamKey => {
    const meta = TEAM_META[teamKey];
    const rec = findCbbRecord(meta);
    if(!rec || rec.wins === null) return;
    const bucket = byDrafter[meta.draftTeamId];
    bucket.wins += rec.wins;
    bucket.losses += rec.losses;
    bucket.found++;
  });

  return Object.values(byDrafter)
    .map(b => Object.assign(b, { pct: (b.wins + b.losses) > 0 ? b.wins / (b.wins + b.losses) : null }))
    .sort((a, b) => {
      if(a.found === 0 && b.found === 0) return 0;
      if(a.found === 0) return 1;
      if(b.found === 0) return -1;
      if(b.pct !== a.pct) return b.pct - a.pct;
      return b.wins - a.wins;
    });
}

export function renderCbbByDrafterRow(row, rank){
  const teamsLabel = row.teamNames.join(' · ');
  let note = '';
  if(row.found === 0) note = 'No data yet';
  else if(row.found < row.total) note = `${row.found} of ${row.total} teams reporting`;

  const recordHtml = row.found > 0
    ? `<span class="person-record-primary">${row.wins}-${row.losses}</span>${row.pct !== null ? `<span class="person-record-secondary">${formatWinPct(row.pct)}</span>` : ''}`
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
