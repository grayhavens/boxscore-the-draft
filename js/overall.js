/* ============================================================
   Points view (formerly "Leaderboard"): cross-drafter standings.

   The LIST is deliberately plain — rank, name, one confirmed total.
   No per-league composition here at all (no mix bar, no legend); tap a
   row to drill into a drafter's DETAIL, where each scoring league gets
   its own accordion card (one open at a time) and provisional points
   — the rankAuto slice that still moves with the live table — surface
   in a banner and per-rule tags, never folded into the ranking number.
   See obIsProvisional below for what counts as provisional, and
   design_handoff_leaderboard/README.md (from the redesign handoff) for
   the full visual spec this implements.
   ============================================================ */
import { LEAGUES, LEAGUE_SCORING, DRAFT_TEAMS, TEAM_META } from './data.js';
import { updateUrlParam } from './utils.js';
import { getLeagueRuleTeams, getTeamAdjustment, isRuleProvisional } from './league-facts.js';
import { currentDraftTeamId } from './board.js';

// League color for the per-league card's accent bar. Deliberately NOT
// each league's real modal accent (LEAGUE_SCORING[key].accent) — those
// are brand colors picked to sit on a light badge, and half of them are
// near-black (NHL, CFB, NFL, MLB) or fully-saturated neon (WNBA, NBA),
// which reads as broken/jarring on this view's near-black background:
// some segments nearly vanish, others scream. This is a separate,
// hand-tuned set at consistent medium lightness/saturation so all
// eight sit comfortably on --bg/--surface, spaced around the hue wheel
// away from the tokens this same screen already uses for meaning
// (--accent, --win, --loss, --provisional) so a league's color is
// never mistaken for "leader," "positive," "negative," or "provisional."
const OB_LEAGUE_CHART_COLOR = {
  epl: '#826AC8', cfb: '#C86AA1', nfl: '#91C86A', mcbb: '#C58C6A',
  nba: '#B57FC0', nhl: '#6FBFC6', mlb: '#6AC87A', wnba: '#A8B36A'
};

// League full names for the detail view's card titles — LEAGUE_SCORING's
// own `full` is a scoring-table heading ("Premier League Scoring", used
// on the Manage Scoring page), not a display name, so this view keeps
// its own short list rather than borrowing that string.
const OB_LEAGUE_FULL_NAME = {
  epl: 'Premier League', cfb: 'College Football', nfl: 'NFL', mcbb: 'College Basketball',
  nba: 'NBA', nhl: 'NHL', mlb: 'MLB', wnba: 'WNBA'
};

function obLeagueColor(leagueKey){
  const scoring = LEAGUE_SCORING[leagueKey];
  return OB_LEAGUE_CHART_COLOR[leagueKey] || (scoring && scoring.accent) || 'var(--text-mute)';
}

function obLeagueFullName(leagueKey){
  return OB_LEAGUE_FULL_NAME[leagueKey] || (LEAGUES.find(l => l.key === leagueKey) || {}).label || leagueKey;
}

// Which drafter's full breakdown is open, and — within that — which
// single league card is expanded. Within-session view state only, same
// as standingsFilterKey in js/board.js. Both reset on every navigation
// (obOpenDetail / obCloseDetail) per the design spec.
let obDetailId = null;
let obOpenLeagueKey = null;

function obSignedPts(n){
  return (n > 0 ? '+' : '') + n;
}

function obPtsClass(n){
  return n > 0 ? 'pos' : (n < 0 ? 'neg' : 'zero');
}

/* ---- The seam a new league's scoring model plugs into ----

   obIsProvisional(rule, leagueKey): whether a rule's points can still
   move. Any rule carrying `rankAuto` (derived from a standings table)
   counts as provisional UNLESS that league has already locked in its
   regular season (js/season-lock.js) — see isRuleProvisional in
   js/league-facts.js, the single source of truth this defers to so a
   locked league's points stop reading as provisional here too. An
   explicit `live: true` in LEAGUE_SCORING is league-agnostic and always
   provisional, no lock involved. leagueKey is optional — the simulated-
   data preview below has no real lock state to check, so it falls back
   to the plain rankAuto/live check.

   Who satisfies a rule right now comes from getLeagueRuleTeams
   (js/league-facts.js) directly — every league is on that shared
   facts/live model now.
*/

function obRuleTeams(league, rule){
  return getLeagueRuleTeams(league.key, rule) || [];
}

function obIsProvisional(rule, leagueKey){
  if(leagueKey) return isRuleProvisional(rule, leagueKey) || !!rule.live;
  return !!(rule.rankAuto || rule.live);
}

// Every rule currently satisfied by one of a drafter's teams, itemized.
// This is the single source for both levels of the view: per-league
// point totals and the confirmed/provisional split are summed from it
// (rather than from computeTeamPoints/computeTeamProvisionalPoints
// directly), so a rule that becomes provisional needs no other change.
// ---- TEMPORARY: Real/Simulated data preview ----
//
// The season hasn't produced enough real results to make this view
// worth showing anyone yet. "Simulated" fabricates a plausible-looking
// leaderboard from the real drafters, teams, and scoring rules — no
// fake teams or invented rules — so the page can be demoed now. Delete
// this whole block (down to "---- End temporary block ----"), the
// `obMode` branch in obDrafterAwards below, and the toggle markup in
// index.html / its CSS in style.css once real data makes it moot.

const OB_DATA_MODE_KEY = 'teamDashboardObDataMode';

function loadObMode(){
  try {
    const saved = localStorage.getItem(OB_DATA_MODE_KEY);
    return saved === 'simulated' ? 'simulated' : 'real';
  } catch (e){
    return 'real';
  }
}

let obMode = loadObMode();

export function setObMode(mode){
  if(mode !== 'real' && mode !== 'simulated') return;
  obMode = mode;
  try { localStorage.setItem(OB_DATA_MODE_KEY, mode); } catch (e){}
  updateUrlParam('data', mode === 'real' ? null : mode);
  renderOverallStandings();
}
window.setObMode = setObMode;

// Tiny seeded PRNG (xmur3 hash -> mulberry32) so the simulated
// leaderboard looks the same on every render/reload instead of
// reshuffling each time — a moving demo is harder to walk someone
// through than a stable one.
function obSeededRandom(seedStr){
  let h = 1779033703 ^ seedStr.length;
  for(let i = 0; i < seedStr.length; i++){
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  let a = h >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function obSeededShuffle(arr, rng){
  const a = arr.slice();
  for(let i = a.length - 1; i > 0; i--){
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Builds a fake "standings" per league (a seeded shuffle of that
// league's real teams) and cascades each league's real rules down from
// it: the highest-value rule is the most exclusive (won by a team near
// the top of the shuffle), and easier rules land on a wider band of
// teams — the same way a real playoff bracket nests. `exclusive` rules
// (only ever true for one team) go to a single team from the top of
// the order. Negative rules cascade up from the bottom the same way.
// Computed once and cached — it's deterministic, so recomputing would
// only waste cycles.
let obSimIndexCache = null;

function obSimIndex(){
  if(obSimIndexCache) return obSimIndexCache;
  const index = {};
  LEAGUES.forEach(league => {
    const scoring = LEAGUE_SCORING[league.key];
    if(!scoring) return;
    const rng = obSeededRandom('ob-sim-' + league.key);
    // Excludes any favoriteOnly team (see its definition in js/data.js)
    // — a personal add-on outside the real draft, so it shouldn't be
    // eligible to win simulated awards any more than real ones.
    const order = obSeededShuffle(league.teams.filter(teamKey => !TEAM_META[teamKey].favoriteOnly), rng);
    const n = order.length;
    const awards = [];

    scoring.rules.filter(r => r.pts > 0).sort((a, b) => b.pts - a.pts).forEach((rule, i) => {
      if(rule.exclusive){
        const pool = Math.max(1, Math.min(n, Math.round(n * 0.3)));
        awards.push({ teamKey: order[Math.floor(rng() * pool)], rule });
        return;
      }
      const count = Math.max(1, Math.min(n, Math.round(n * Math.min(0.85, 0.12 + i * 0.14))));
      order.slice(0, count).forEach(teamKey => awards.push({ teamKey, rule }));
    });

    scoring.rules.filter(r => r.pts < 0).sort((a, b) => a.pts - b.pts).forEach((rule, i) => {
      const count = Math.max(1, Math.min(n, Math.round(n * Math.min(0.5, 0.12 + i * 0.14))));
      order.slice(n - count).forEach(teamKey => awards.push({ teamKey, rule }));
    });

    index[league.key] = awards;
  });
  obSimIndexCache = index;
  return index;
}

function obSimDrafterAwards(draftTeamId){
  const index = obSimIndex();
  const awards = [];
  LEAGUES.forEach(league => {
    (index[league.key] || []).forEach(({ teamKey, rule }) => {
      const meta = TEAM_META[teamKey];
      if(!meta || meta.draftTeamId !== draftTeamId) return;
      awards.push({
        leagueKey: league.key,
        leagueLabel: league.label,
        teamKey,
        teamName: meta.name,
        label: rule.label,
        pts: rule.pts,
        provisional: obIsProvisional(rule)
      });
    });
  });
  return awards;
}

// ---- End temporary block ----

function obDrafterAwards(draftTeamId){
  if(obMode === 'simulated') return obSimDrafterAwards(draftTeamId);

  const awards = [];
  LEAGUES.forEach(league => {
    const scoring = LEAGUE_SCORING[league.key];
    if(!scoring) return;
    scoring.rules.forEach(rule => {
      obRuleTeams(league, rule).forEach(teamKey => {
        const meta = TEAM_META[teamKey];
        // favoriteOnly (js/data.js) is a personal add-on outside the
        // real draft — excluded here too, as a last-resort backstop, in
        // case it's ever credited upstream (an admin's League Facts
        // pick, or a rankAuto table match) rather than just filtered out
        // of the combined-record computations.
        if(!meta || meta.draftTeamId !== draftTeamId || meta.favoriteOnly) return;
        awards.push({
          leagueKey: league.key,
          leagueLabel: league.label,
          teamKey,
          teamName: meta.name,
          label: rule.label,
          pts: rule.pts,
          provisional: obIsProvisional(rule, league.key)
        });
      });
    });
    // Manual point adjustments — a flat delta an admin set for whatever a
    // rule can't express. Always confirmed, never provisional: an admin
    // decided them, they don't move with a live table.
    league.teams.forEach(teamKey => {
      const meta = TEAM_META[teamKey];
      if(!meta || meta.draftTeamId !== draftTeamId || meta.favoriteOnly) return;
      const adj = getTeamAdjustment(teamKey);
      if(!adj || !adj.pts) return;
      awards.push({
        leagueKey: league.key,
        leagueLabel: league.label,
        teamKey,
        teamName: meta.name,
        label: adj.note || 'Manual adjustment',
        pts: adj.pts,
        provisional: false
      });
    });
  });
  return awards;
}

// One drafter's row model. The confirmed total is what ranks the board;
// provisional only ever surfaces in the detail view.
function obBuildRow(d){
  const awards = obDrafterAwards(d.id);
  const leagues = LEAGUES.map(l => {
    const mine = awards.filter(a => a.leagueKey === l.key);
    const pts = mine.reduce((s, a) => s + a.pts, 0);
    const provisional = mine.reduce((s, a) => s + (a.provisional ? a.pts : 0), 0);
    return { league: l, pts, provisional, confirmed: pts - provisional, awards: mine };
  });
  const total = leagues.reduce((s, x) => s + x.pts, 0);
  const provisionalTotal = leagues.reduce((s, x) => s + x.provisional, 0);
  const scoringLeagues = leagues.filter(x => x.confirmed !== 0);
  const topLeague = scoringLeagues.slice().sort((a, b) => b.confirmed - a.confirmed)[0] || null;
  return {
    id: d.id,
    name: d.name,
    total,
    provisionalTotal,
    confirmedTotal: total - provisionalTotal,
    leagues,
    scoringCount: scoringLeagues.length,
    topLeague
  };
}

// All ten rows, sorted by confirmed points (ties broken alphabetically)
// and annotated with standard-competition rank + a "T" tie prefix, e.g.
// 1, T2, T2, 4 — the single source both the list and the detail header
// read rank from, so the two never drift out of sync.
function obRankedRows(){
  const rows = DRAFT_TEAMS.map(obBuildRow)
    .sort((a, b) => b.confirmedTotal - a.confirmedTotal || a.name.localeCompare(b.name));

  let prevTotal = null, prevRank = 0;
  rows.forEach((r, i) => {
    r.rank = (prevTotal !== null && r.confirmedTotal === prevTotal) ? prevRank : i + 1;
    prevTotal = r.confirmedTotal;
    prevRank = r.rank;
  });
  const rankCounts = {};
  rows.forEach(r => { rankCounts[r.rank] = (rankCounts[r.rank] || 0) + 1; });
  rows.forEach(r => { r.rankLabel = (rankCounts[r.rank] > 1 ? 'T' : '') + r.rank; });

  return rows;
}

// ---- List ----

function obSubCopy(row){
  if(row.scoringCount === 0) return 'No Points Earned';
  const base = row.scoringCount + (row.scoringCount === 1 ? ' league scoring' : ' leagues scoring');
  return row.topLeague ? base + ' &middot; best in ' + row.topLeague.league.label : base;
}

function obRowHtml(row, hasLeader){
  const isTop = hasLeader && row.rank === 1;
  const rankTier = isTop ? 'rank-1' : (hasLeader && row.rank <= 3 ? 'rank-mid' : '');
  return `
    <button type="button" class="ob-row ${isTop ? 'leader' : ''} ${row.id === currentDraftTeamId ? 'current' : ''}" onclick="obOpenDetail('${row.id}')">
      <span class="ob-rank ${rankTier}">${row.rankLabel}</span>
      <span class="ob-identity">
        <span class="ob-name">${row.name}</span>
        <span class="ob-sub">${obSubCopy(row)}</span>
      </span>
      <span class="ob-totalwrap">
        <span class="ob-total">${row.confirmedTotal}</span>
        <svg class="ob-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
      </span>
    </button>
  `;
}

// No genuine leader to call out when every row is tied for rank 1 (the
// whole board sits at 0 confirmed points before anything's settled, most
// obviously) — highlighting "the leader" in that case would just be
// singling out an arbitrary alphabetical pick, so the leader wash/gold
// rank only renders once someone has actually separated from the pack.
function obListHtml(rows){
  const leaderCount = rows.filter(r => r.rank === 1).length;
  const hasLeader = leaderCount > 0 && leaderCount < rows.length;
  const rowsHtml = rows.map(row => obRowHtml(row, hasLeader)).join('');
  return `<div class="ob-list">${rowsHtml}</div>`;
}

// ---- Detail ----

function obCardHtml(x, maxAbs){
  const expanded = obOpenLeagueKey === x.league.key;
  const teams = [];
  x.awards.forEach(a => { if(teams.indexOf(a.teamName) === -1) teams.push(a.teamName); });
  const pct = Math.round((Math.abs(x.confirmed) / maxAbs) * 100);
  const barColor = x.confirmed < 0 ? 'var(--loss)' : obLeagueColor(x.league.key);

  const rulesHtml = x.awards.slice()
    .sort((a, b) => (a.provisional === b.provisional) ? b.pts - a.pts : (a.provisional ? 1 : -1))
    .map(a => `
      <div class="ob-rule" onclick="openTeamModal('${a.teamKey}')">
        <div class="ob-rule-main">
          <div class="ob-rule-label">${a.label}</div>
          <div class="ob-rule-meta">
            <span>${a.teamName}</span>
            ${a.provisional ? '<span class="ob-prov-tag">Provisional</span>' : ''}
          </div>
        </div>
        <div class="ob-rule-pts ${obPtsClass(a.pts)}">${obSignedPts(a.pts)}</div>
      </div>
    `).join('');

  return `
    <div class="ob-card ${expanded ? 'expanded' : ''}">
      <button type="button" class="ob-card-head" onclick="obToggleLeague('${x.league.key}')" aria-expanded="${expanded}">
        <div class="ob-card-pts ${obPtsClass(x.confirmed)}">${x.confirmed === 0 ? '0' : obSignedPts(x.confirmed)}</div>
        <div class="ob-card-main">
          <div class="ob-card-title">${obLeagueFullName(x.league.key)}</div>
          <div class="ob-card-sub">${x.league.season} &middot; ${teams.join(' &middot; ')}</div>
        </div>
        <div class="ob-card-right">
          <div class="ob-card-bar-track"><span class="ob-card-bar-fill" style="width:${pct}%; background:${barColor};"></span></div>
          <svg class="ob-card-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
        </div>
      </button>
      ${expanded ? `<div class="ob-card-body">${rulesHtml}</div>` : ''}
    </div>
  `;
}

function obDetailHtml(row){
  const scoringRows = row.leagues.filter(x => x.awards.length > 0)
    .sort((a, b) => b.confirmed - a.confirmed || Math.abs(b.pts) - Math.abs(a.pts));
  const idle = row.leagues.filter(x => x.awards.length === 0);
  const maxAbs = Math.max(1, ...scoringRows.map(x => Math.abs(x.confirmed)));

  const bannerHtml = row.provisionalTotal !== 0
    ? `
      <div class="ob-prov-banner">
        <span class="ob-stripe-swatch"></span>
        <div class="ob-prov-text">${row.provisionalTotal > 0
          ? obSignedPts(row.provisionalTotal) + ' more is provisional &mdash; it depends on where a club sits in a live table and is not in the total above.'
          : obSignedPts(row.provisionalTotal) + ' is at risk from live tables &mdash; it is not in the total above, but would come off if the table holds.'}</div>
      </div>
    `
    : '';

  const idleHtml = idle.length
    ? `
      <div class="ob-idle-block">
        <div class="ob-idle-title">No points yet</div>
        <div class="ob-idle-body">${idle.map(x => obLeagueFullName(x.league.key)).join(', ')} &mdash; every rule there is still available.</div>
      </div>
    `
    : '';

  return `
    <button type="button" class="ob-back" onclick="obCloseDetail()">&larr; Points</button>
    <div class="ob-detail-head">
      <div class="ob-detail-left">
        <div class="ob-detail-eyebrow">Rank ${row.rankLabel} of ${DRAFT_TEAMS.length}</div>
        <h2 class="ob-detail-name">${row.name}</h2>
        <div class="ob-detail-meta">${row.scoringCount} of ${LEAGUES.length} leagues scoring confirmed points</div>
      </div>
      <div class="ob-detail-right">
        <div class="ob-detail-total">${row.confirmedTotal}</div>
        <div class="ob-detail-total-label">Confirmed pts</div>
      </div>
    </div>
    ${bannerHtml}
    <div class="ob-section-title">Where the points come from</div>
    <div class="ob-cards">${scoringRows.map(x => obCardHtml(x, maxAbs)).join('')}</div>
    ${idleHtml}
    <button class="ob-detail-link" onclick="setDraftTeam('${row.id}'); switchView('board');">See ${row.name}'s board &rarr;</button>
  `;
}

// ---- Entry points ----

export function obOpenDetail(id){
  obDetailId = id;
  obOpenLeagueKey = null;
  window.scrollTo(0, 0);
  renderOverallStandings();
}
window.obOpenDetail = obOpenDetail;

export function obCloseDetail(){
  obDetailId = null;
  obOpenLeagueKey = null;
  renderOverallStandings();
}
window.obCloseDetail = obCloseDetail;

export function obToggleLeague(key){
  obOpenLeagueKey = obOpenLeagueKey === key ? null : key;
  renderOverallStandings();
}
window.obToggleLeague = obToggleLeague;

// TEMPORARY: see the block above obDrafterAwards — delete alongside it.
function obSyncModeToggle(){
  document.querySelectorAll('#ob-mode-switch .ob-mode-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.mode === obMode);
  });
}

const OB_SIM_BANNER_HTML = `<div class="ob-sim-banner">Showing fake results for preview &mdash; switch data to Real for live standings.</div>`;

export function renderOverallStandings(){
  const container = document.getElementById('overall-content');
  if(!container) return;
  obSyncModeToggle();
  const simBanner = obMode === 'simulated' ? OB_SIM_BANNER_HTML : '';
  const rows = obRankedRows();

  if(obDetailId){
    const row = rows.find(r => r.id === obDetailId);
    if(row){
      container.innerHTML = `${simBanner}<div class="ob-detail">${obDetailHtml(row)}</div>`;
      return;
    }
    obDetailId = null;
  }

  container.innerHTML = simBanner + obListHtml(rows);
}
