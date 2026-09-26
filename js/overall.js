/* ============================================================
   Points view: cross-drafter standings, ranked by PROJECTED points.

   Every point a drafter holds is one of two kinds:
   - Locked: permanent. Manual League Facts, a locked league's rankAuto
     rules (js/season-lock.js), and admin adjustments.
   - Live: held today off a live table (rankAuto / `live: true` rules
     in a league that hasn't locked). Can still flip. The code calls
     this "provisional" (isRuleProvisional); the UI says "Live".
   Projected = Locked + Live, "if every season ended today", is the
   ranking number. Locked is shown alongside it as the floor.
   Each league's +5 bonus counts too: it goes to the leader of that
   league's Drafted standings (bonusStandings, js/compare.js), Live
   until the league locks.

   The page: a "You" hero (projected rank, the locked/live split and a
   ladder of the drafters around you), then a Standings | Activity switch.
   Any drafter opens a quick sheet; its Full breakdown pushes the
   per-drafter detail (one accordion card per scoring league). The
   Activity half is rendered by js/activity.js. See docs/points-ux-plan.md.
   ============================================================ */
import { LEAGUES, LEAGUE_SCORING, DRAFT_TEAMS, TEAM_META, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { updateUrlParam, segmentedControlHtml, CHEVRON_LEFT_SVG, reducedMotion, EASE_OUT, EASE_SPRING, countUp, lockBodyScroll, unlockBodyScroll, isSheetOpen, openSheetOverlay, closeSheetOverlay, enableSheetSwipeToDismiss, ordinal } from './utils.js';
import { getLeagueRuleTeams, getTeamAdjustment, isRuleProvisional, leagueInputsSettled } from './league-facts.js';
import { currentDraftTeamId } from './board.js';
import { currentProfileId } from './identity.js';
import { activityPanelHtml, activityRecentHtml, markActivitySeen, runActivityDetection, unseenCount, renderActivityHomeLink } from './activity.js';
import { compareHtml, comparePickerHtml, setupCompareSticky, fillSameRace, bonusStandings, loadBonusInputs } from './compare.js';

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

export function obLeagueColor(leagueKey){
  const scoring = LEAGUE_SCORING[leagueKey];
  return OB_LEAGUE_CHART_COLOR[leagueKey] || (scoring && scoring.accent) || 'var(--text-mute)';
}

export function obLeagueFullName(leagueKey){
  return OB_LEAGUE_FULL_NAME[leagueKey] || (LEAGUES.find(l => l.key === leagueKey) || {}).label || leagueKey;
}

// Within-session view state, same as standingsFilterKey in js/board.js.
// obSegment is the Standings | Activity switch ('standings' | 'activity'):
// every visit opens on Standings unless it was asked for Activity (the
// Home link, or ?seg=activity). obSegmentNext carries that request
// across switchView, which is what starts the visit. The
// drafter being looked at in the quick sheet, the pushed breakdown, and —
// within that — the one expanded league card and the Compare opponent.
let obSegment = 'standings';
let obSegmentNext = null;
let obSheetId = null;
let obDetailId = null;
let obOpenLeagueKey = null;
let obCompareId = null;

// Split bars that build (css/style.css, "Split bars that build"): entering
// the tab fills the hero and ladder bars from zero and counts the hero
// total up. Only the first list render of a visit plays it. A re-render
// while it's still playing (the bonus repaint just after entering) picks
// it up where it was instead of snapping to full.
const OB_GROW_MS = 1400; // the last ladder bar's delay plus its fill
const OB_COUNT_MS = 800;
let obGrowNext = false;
let obGrowStart = 0;

export function obSignedPts(n){
  return n > 0 ? '+' + n : obPts(n);
}

// A total with a real minus sign, no plus: "29", "0", "−1".
function obPts(n){
  return n < 0 ? '&minus;' + Math.abs(n) : String(n);
}

/* ---- The seam a new league's scoring model plugs into ----

   obIsProvisional(rule, leagueKey): whether a rule's points are Live.
   Any rule carrying `rankAuto` (derived from a standings table) is Live
   UNLESS that league has already locked in its regular season
   (js/season-lock.js) — see isRuleProvisional in js/league-facts.js,
   the single source of truth this defers to. An explicit `live: true`
   in LEAGUE_SCORING is league-agnostic and always Live, no lock
   involved. leagueKey is optional — the simulated-data preview below
   has no real lock state to check, so it falls back to the plain
   rankAuto/live check.

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
// point totals and the locked/live split are summed from it (rather
// than from computeTeamPoints/computeTeamProvisionalPoints directly), so
// a rule that becomes Live needs no other change.
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

// The Activity feed must never log fake preview data (js/activity.js).
export function isObSimulated(){ return obMode === 'simulated'; }

export function setObMode(mode){
  if(mode !== 'real' && mode !== 'simulated') return;
  obMode = mode;
  try { localStorage.setItem(OB_DATA_MODE_KEY, mode); } catch (e){}
  updateUrlParam('data', mode === 'real' ? null : mode);
  renderOverallStandings();
}
window.setObMode = setObMode;
window.getObMode = () => obMode;

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
    // A prior-season league doesn't score yet, in the preview either.
    if(!scoring || PRIOR_SEASON_DISPLAY_LEAGUES.includes(league.key)) return;
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

    // The league bonus goes to one seeded drafter.
    if(scoring.bonus){
      const holder = DRAFT_TEAMS[Math.floor(rng() * DRAFT_TEAMS.length)].id;
      awards.push({ bonusHolder: holder, rule: scoring.bonus });
    }

    index[league.key] = awards;
  });
  obSimIndexCache = index;
  return index;
}

function obSimDrafterAwards(draftTeamId){
  const index = obSimIndex();
  const awards = [];
  LEAGUES.forEach(league => {
    (index[league.key] || []).forEach(({ teamKey, rule, bonusHolder }) => {
      if(bonusHolder){
        if(bonusHolder === draftTeamId) awards.push(obBonusAward(league, rule.label, rule.pts, true));
        return;
      }
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

// The league bonus as one more award line. No team: it's won by a
// drafter's whole roster in that league.
function obBonusAward(league, label, pts, provisional){
  return { leagueKey: league.key, leagueLabel: league.label, teamKey: '', teamName: 'League bonus', label, pts, provisional, bonus: true };
}

// `bonuses` is bonusStandings() (js/compare.js), computed once per
// ranking pass by the caller rather than once per drafter.
function obDrafterAwards(draftTeamId, bonuses){
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
    const bonus = bonuses[league.key];
    if(bonus && bonus.holderId === draftTeamId) awards.push(obBonusAward(league, bonus.label, bonus.pts, !bonus.locked));
    // Manual point adjustments — a flat delta an admin set for whatever a
    // rule can't express. Always Locked: an admin decided them, they
    // don't move with a live table. Skipped for a league still showing
    // last season (PRIOR_SEASON_DISPLAY_LEAGUES), same as its rules are
    // in getLeagueRuleTeams — nothing there counts yet.
    if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(league.key)) return;
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

// One drafter's row model. `total` (projected) ranks the board;
// `confirmedTotal` (locked) is the floor shown beside it.
function obBuildRow(d, bonuses){
  const awards = obDrafterAwards(d.id, bonuses);
  const leagues = LEAGUES.map(l => {
    const mine = awards.filter(a => a.leagueKey === l.key);
    const pts = mine.reduce((s, a) => s + a.pts, 0);
    const provisional = mine.reduce((s, a) => s + (a.provisional ? a.pts : 0), 0);
    return { league: l, pts, provisional, confirmed: pts - provisional, awards: mine };
  });
  const total = leagues.reduce((s, x) => s + x.pts, 0);
  const provisionalTotal = leagues.reduce((s, x) => s + x.provisional, 0);
  return {
    id: d.id,
    name: d.name,
    total,
    provisionalTotal,
    confirmedTotal: total - provisionalTotal,
    leagues
  };
}

// Standard competition rank on `field` with a "T" tie prefix, e.g.
// 1, T2, T2, 4, written to row[rankKey] / row[rankKey + 'Label'].
function obAssignRank(rows, field, rankKey){
  const sorted = rows.slice().sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name));
  let prev = null, prevRank = 0;
  sorted.forEach((r, i) => {
    r[rankKey] = (prev !== null && r[field] === prev) ? prevRank : i + 1;
    prev = r[field];
    prevRank = r[rankKey];
  });
  const counts = {};
  sorted.forEach(r => { counts[r[rankKey]] = (counts[r[rankKey]] || 0) + 1; });
  sorted.forEach(r => { r[rankKey + 'Label'] = (counts[r[rankKey]] > 1 ? 'T' : '') + r[rankKey]; });
  return sorted;
}

// All ten rows, sorted by projected points (ties broken alphabetically).
// `rank`/`rankLabel` is the projected rank; `lockedRank`/`lockedRankLabel`
// ranks the same rows on locked points. The single source every surface
// (Table, hero, sheet, breakdown, Compare, Activity) reads rank from.
export function obRankedRows(){
  const bonuses = obMode === 'simulated' ? {} : bonusStandings();
  const rows = DRAFT_TEAMS.map(d => obBuildRow(d, bonuses));
  obAssignRank(rows, 'confirmedTotal', 'lockedRank');
  return obAssignRank(rows, 'total', 'rank');
}

// "T2" -> "T2nd", "3" -> "3rd".
function obOrdinalLabel(label){
  const s = String(label);
  return s.startsWith('T') ? 'T' + ordinal(s.slice(1)) : ordinal(s);
}

// The one phrasing for "where this drafter stands" (hero, sheet, breakdown).
function obRankPhrase(row){
  return `${obOrdinalLabel(row.rankLabel)} projected &middot; ${obOrdinalLabel(row.lockedRankLabel)} locked`;
}

function obYouId(){
  return currentDraftTeamId;
}

// ---- Rank change "since" your last visit (per device) ----
//
// { prev: {ranks, ts}, cur: {ranks, ts} } in localStorage. Arrows compare
// today's projected ranks against `prev`. `cur` is the ranks from the
// start of the latest visit; it only rolls into `prev` once it is
// OB_BASELINE_ROLL_MS old, so hopping between tabs (or a re-render
// mid-visit) doesn't wipe the arrows the moment they appear.
const OB_BASELINE_KEY = 'teamDashboardObRankBaseline';
const OB_BASELINE_ROLL_MS = 6 * 60 * 60 * 1000;
let obBaseline = obLoadBaseline();
let obBaselinePending = false;

function obLoadBaseline(){
  try {
    const saved = JSON.parse(localStorage.getItem(OB_BASELINE_KEY));
    if(saved && typeof saved === 'object') return saved;
  } catch (e){}
  return {};
}

function obRollBaseline(rows){
  if(!obBaselinePending || obMode === 'simulated' || !leagueInputsSettled()) return;
  obBaselinePending = false;
  const now = Date.now();
  const ranks = {};
  rows.forEach(r => { ranks[r.id] = r.rank; });
  if(!obBaseline.cur) obBaseline = { cur: { ranks, ts: now } };
  else if(now - obBaseline.cur.ts > OB_BASELINE_ROLL_MS) obBaseline = { prev: obBaseline.cur, cur: { ranks, ts: now } };
  else return;
  try { localStorage.setItem(OB_BASELINE_KEY, JSON.stringify(obBaseline)); } catch (e){}
}

// Places gained (+) or lost (-) since the baseline; 0 when unknown.
export function obRankMove(row){
  if(obMode === 'simulated' || !obBaseline.prev) return 0;
  const was = obBaseline.prev.ranks[row.id];
  return was ? was - row.rank : 0;
}

// When "since" is: the baseline's timestamp, or 0 with no baseline.
export function obSinceTs(){
  return obBaseline.prev ? obBaseline.prev.ts : 0;
}

// "since Tue" / "since yesterday" / "today".
export function obSinceLabel(ts){
  if(!ts) return '';
  const d = new Date(ts), now = new Date();
  if(d.toDateString() === now.toDateString()) return 'today';
  if(d.toDateString() === new Date(now.getTime() - 86400000).toDateString()) return 'since yesterday';
  return 'since ' + d.toLocaleDateString([], { weekday: 'short' });
}

function obMoveHtml(move, withSince){
  if(!move) return '';
  const since = withSince ? ' ' + obSinceLabel(obSinceTs()) : '';
  return `<span class="ob-move ${move > 0 ? 'up' : 'down'}">${move > 0 ? '&#9650;' : '&#9660;'}${Math.abs(move)}${since}</span>`;
}

// ---- Shared split bar (solid Locked + striped Live) ----
//
// scaleMax is the value a full-width bar stands for. Negative Live shows
// as the red "risk" stripe: its width is |live| and the locked segment
// shrinks to the projected total, so the two still add up to Locked.
export function splitBarHtml(locked, live, scaleMax, cls){
  const scale = Math.max(1, scaleMax);
  const pct = n => Math.max(0, Math.min(100, (n / scale) * 100)).toFixed(1) + '%';
  const lockedPart = live < 0 ? locked + live : locked;
  return `<span class="split-bar ${cls || ''}"><span class="lk" style="width:${pct(Math.max(0, lockedPart))}"></span><span class="lv ${live < 0 ? 'risk' : ''}" style="width:${pct(Math.abs(live))}"></span></span>`;
}

function obBarScale(locked, live){
  return Math.max(locked, locked + live, Math.abs(live));
}

// ---- Hero ----

// Four rows: 1st pinned, then a three-row window starting at you, pulled
// back from the bottom of the board (you're last -> the two above you).
function obLadderRows(rows, meIdx){
  if(meIdx <= 0) return rows.slice(0, 4);
  const start = Math.max(1, Math.min(meIdx, rows.length - 3));
  return [rows[0]].concat(rows.slice(start, start + 3));
}

function obHeroHtml(rows, me){
  const meIdx = rows.indexOf(me);
  const scale = Math.max(1, ...rows.map(r => obBarScale(r.confirmedTotal, r.provisionalTotal)));
  const ladder = obLadderRows(rows, meIdx).map(r => {
    const mine = r.id === me.id;
    const gap = r.total - me.total;
    const gapHtml = mine || gap === 0 ? '' : `<span class="ob-gap ${gap > 0 ? 'ahead' : 'behind'}">${obSignedPts(gap)}</span>`;
    return `
      <button type="button" class="ob-ladder-row ${mine ? 'me' : ''}" data-id="${r.id}" data-total="${r.total}" onclick="obOpenSheet('${r.id}')">
        <span class="ob-ladder-rank">${r.rankLabel}</span>
        <span class="ob-ladder-name">${r.name}</span>
        ${splitBarHtml(r.confirmedTotal, r.provisionalTotal, scale, 'sm')}
        <span class="ob-ladder-total">${obPts(r.total)}</span>
        <span class="ob-ladder-gap">${gapHtml}</span>
      </button>
    `;
  }).join('');
  const live = me.provisionalTotal;
  const you = me.id === currentProfileId ? ' &middot; You' : '';
  return `
    <div class="ob-hero">
      <div class="ob-hero-top">
        <div class="ob-hero-left">
          <span class="ob-detail-eyebrow mute">${me.name}${you}</span>
          <span class="ob-hero-rankline"><span class="ob-hero-rank">${obOrdinalLabel(me.rankLabel)}</span>${obMoveHtml(obRankMove(me), true)}</span>
        </div>
        <div class="ob-hero-right">
          <span class="ob-hero-total">${obPts(me.total)}</span>
          <span class="ob-hero-total-label">projected pts</span>
        </div>
      </div>
      <div class="ob-split">
        ${splitBarHtml(me.confirmedTotal, live, obBarScale(me.confirmedTotal, live), 'lg')}
        <div class="ob-split-legend">
          <span><span class="split-swatch lk"></span>${me.confirmedTotal} locked</span>
          <span class="${live < 0 ? 'risk' : 'lv'}"><span class="split-swatch lv ${live < 0 ? 'risk' : ''}"></span>${obSignedPts(live)} live</span>
        </div>
      </div>
      <div class="ob-ladder">${ladder}</div>
      <div class="ob-hero-explain">Locked points only change when a regular season ends or a playoff round finishes. Live points move with the tables every day.</div>
    </div>
  `;
}

// ---- Table ----

// No genuine leader to call out when every row is tied for rank 1 (the
// whole board sits at 0 before anything's settled, most obviously) —
// highlighting "the leader" in that case would just be singling out an
// arbitrary alphabetical pick, so the leader wash/gold rank only renders
// once someone has actually separated from the pack.
function obTableHtml(rows){
  const leaderCount = rows.filter(r => r.rank === 1).length;
  const hasLeader = leaderCount > 0 && leaderCount < rows.length;
  const me = obYouId();
  const body = rows.map(r => {
    const isTop = hasLeader && r.rank === 1;
    const tier = isTop ? 'rank-1' : (hasLeader && r.rank <= 3 ? 'rank-mid' : '');
    const live = r.provisionalTotal;
    return `
      <button type="button" class="ob-table-row ${isTop ? 'leader' : ''} ${r.id === me ? 'current' : ''}" data-id="${r.id}" data-total="${r.total}" onclick="obOpenSheet('${r.id}')">
        <span class="ob-rank ${tier}">${r.rankLabel}</span>
        <span class="ob-table-name"><span class="ob-table-name-text">${r.name}</span>${obMoveHtml(obRankMove(r), false)}</span>
        <span class="ob-table-locked">${obPts(r.confirmedTotal)}</span>
        <span class="ob-table-live ${live === 0 ? 'zero' : (live < 0 ? 'neg' : '')}">${obSignedPts(live)}</span>
        <span class="ob-table-proj">${obPts(r.total)}</span>
      </button>
    `;
  }).join('');
  return `
    <div class="ob-table">
      <div class="ob-table-row head">
        <span></span><span>Ranked by projected</span><span>Locked</span><span class="lv">Live</span><span class="pj">Proj</span>
      </div>
      ${body}
    </div>
  `;
}

function obListHtml(rows){
  const me = rows.find(r => r.id === obYouId());
  const badge = obSegment === 'activity' ? 0 : unseenCount();
  const seg = segmentedControlHtml([
    { key: 'standings', label: 'Standings' },
    { key: 'activity', label: 'Activity', badge }
  ], obSegment, 'obSetSegment');
  return `
    ${me ? obHeroHtml(rows, me) : ''}
    <div class="ob-seg">${seg}</div>
    ${obSegment === 'activity' ? activityPanelHtml() : obTableHtml(rows)}
  `;
}

// ---- Re-rank motion ----
// Before a list re-render, note where every row sits (the table and the
// hero's ladder separately), its total and its move chip. Afterwards,
// rows that moved glide from the old spot to the new one (FLIP), those
// moving up under a green wash; changed totals count up, and a changed
// move chip pops in once the row has mostly landed.
const OB_ROW_SEL = '.ob-table-row[data-id], .ob-ladder-row[data-id]';
const obRowKey = el => (el.classList.contains('ob-ladder-row') ? 'L:' : 'T:') + el.dataset.id;

function obSnapshot(container){
  const snap = { hero: null, rows: {} };
  container.querySelectorAll(OB_ROW_SEL).forEach(el => {
    const chip = el.querySelector('.ob-move');
    snap.rows[obRowKey(el)] = { top: el.getBoundingClientRect().top, total: Number(el.dataset.total), chip: chip ? chip.textContent : '' };
  });
  const me = container.querySelector('.ob-ladder-row.me');
  if(me) snap.hero = Number(me.dataset.total);
  return snap;
}

function obPlayFlip(container, before, rows){
  if(reducedMotion()) return;
  container.querySelectorAll(OB_ROW_SEL).forEach(el => {
    const old = before.rows[obRowKey(el)];
    if(!old) return;
    const dy = old.top - el.getBoundingClientRect().top;
    if(Math.abs(dy) > 1){
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], { duration: 700, easing: EASE_OUT });
      if(dy > 0){
        const rest = getComputedStyle(el).backgroundColor;
        el.animate([{ backgroundColor: 'rgba(95,184,138,0.14)' }, { backgroundColor: rest }], { duration: 1400, easing: 'ease-out' });
      }
    }
    const total = Number(el.dataset.total);
    if(old.total !== total){
      countUp(el.querySelector(el.classList.contains('ob-ladder-row') ? '.ob-ladder-total' : '.ob-table-proj'), old.total, total, obPts);
    }
    const chip = el.querySelector('.ob-move');
    if(chip && chip.textContent !== old.chip){
      chip.animate([
        { transform: 'scale(0.6)', opacity: 0 },
        { transform: 'scale(1.08)', opacity: 1, offset: 0.6 },
        { transform: 'scale(1)', opacity: 1 }
      ], { duration: 320, easing: EASE_SPRING, delay: 450, fill: 'backwards' });
    }
  });
  // The hero's own total, unless the entry build is still counting it.
  const me = rows.find(r => r.id === obYouId());
  if(me && before.hero !== null && before.hero !== me.total && performance.now() - obGrowStart >= OB_COUNT_MS){
    countUp(container.querySelector('.ob-hero-total'), before.hero, me.total, obPts);
  }
}

// Tag split bars to fill from zero, staggered by --row (60ms each). `skip`
// fast-forwards them that far in, for a re-render mid-way through.
function obGrowBars(bars, firstRow, skip){
  bars.forEach((bar, i) => {
    bar.style.setProperty('--row', firstRow + i);
    if(skip) bar.style.setProperty('--grow-skip', skip + 'ms');
    bar.classList.add('grow');
  });
}

// prevHeroTotal is the replaced hero's total when this is a re-render
// (null on the visit's first render, which counts up from zero).
function obPlayGrow(container, rows, prevHeroTotal){
  const elapsed = performance.now() - obGrowStart;
  if(elapsed >= OB_GROW_MS || reducedMotion()) return;
  obGrowBars(container.querySelectorAll('.ob-split .split-bar, .ob-ladder-row .split-bar'), 0, Math.round(elapsed));
  const heroTotal = container.querySelector('.ob-hero-total');
  const me = rows.find(r => r.id === obYouId());
  if(!heroTotal || !me || elapsed >= OB_COUNT_MS) return;
  // Resuming: carry on from the number the old hero was showing.
  const shown = prevHeroTotal ? Number(prevHeroTotal.textContent.replace('\u2212', '-')) : 0;
  countUp(heroTotal, Number.isFinite(shown) ? shown : 0, me.total, obPts, OB_COUNT_MS - elapsed);
}

// ---- Quick sheet ----

const obSheetOverlay = () => document.getElementById('ob-sheet-overlay');

function obSheetHtml(rows, row){
  const me = rows.find(r => r.id === obYouId());
  let vsYou = '';
  if(me && me.id === row.id) vsYou = "That's you";
  else if(me){
    const d = row.total - me.total;
    vsYou = d === 0 ? 'Level with you' : `${Math.abs(d)} ${d > 0 ? 'ahead of' : 'behind'} you projected`;
  }
  const leagues = row.leagues.filter(x => x.awards.length).sort((a, b) => b.pts - a.pts);
  const scale = Math.max(1, ...leagues.map(x => obBarScale(x.confirmed, x.provisional)));
  const leaguesHtml = leagues.length
    ? leagues.map(x => `
        <div class="ob-sheet-league">
          <span class="ob-sheet-league-name">${obLeagueFullName(x.league.key)}</span>
          ${splitBarHtml(x.confirmed, x.provisional, scale, 'xs')}
          <span class="ob-sheet-league-pts ${x.pts < 0 ? 'neg' : ''}">${obPts(x.pts)}</span>
        </div>
      `).join('')
    : `<div class="ob-sheet-empty">No points in any league yet.</div>`;
  const own = me && me.id === row.id;
  return `
    <div class="sheet-title-row ob-sheet-head">
      <div>
        <div class="ob-detail-eyebrow mute">${obRankPhrase(row)}</div>
        <div class="sheet-title ob-sheet-name">${row.name}</div>
        <div class="sheet-title-sub">${vsYou}</div>
      </div>
      <div class="ob-sheet-total">
        <span class="ob-sheet-total-num">${obPts(row.total)}</span>
        <span class="ob-sheet-total-split">${row.confirmedTotal} locked &middot; ${obSignedPts(row.provisionalTotal)} live</span>
      </div>
      <button class="modal-close" onclick="obCloseSheet()" aria-label="Close">&times;</button>
    </div>
    <div class="ob-sheet-leagues">${leaguesHtml}</div>
    <div class="ob-sheet-actions">
      <button type="button" class="modal-cta secondary" onclick="obSheetCompare('${row.id}')">${own || !me ? 'Compare&hellip;' : 'Compare with you'}</button>
      <button type="button" class="modal-cta" onclick="obSheetFull('${row.id}')">Full breakdown</button>
    </div>
  `;
}

export function obOpenSheet(id){
  const overlay = obSheetOverlay();
  const rows = obRankedRows();
  const row = rows.find(r => r.id === id);
  if(!overlay || !row) return;
  obSheetId = id;
  document.getElementById('ob-sheet-content').innerHTML = obSheetHtml(rows, row);
  if(!isSheetOpen(overlay)){
    // Rows 0-1 are the sheet's own spring, so its bars start after it.
    if(!reducedMotion()) obGrowBars(document.querySelectorAll('#ob-sheet-content .split-bar'), 2, 0);
    openSheetOverlay(overlay);
    lockBodyScroll();
  }
}
window.obOpenSheet = obOpenSheet;

export function obCloseSheet(){
  obSheetId = null;
  const el = obSheetOverlay();
  if(!isSheetOpen(el)) return;
  unlockBodyScroll();
  closeSheetOverlay(el);
}
window.obCloseSheet = obCloseSheet;

window.obSheetFull = id => {
  obCloseSheet();
  window.switchView('overall');
  obOpenDetail(id, { push: true });
};

// From someone else's sheet: straight into you-vs-them. From your own
// (or with no identity to compare from): your breakdown + the picker.
window.obSheetCompare = id => {
  obCloseSheet();
  window.switchView('overall');
  const me = obYouId();
  if(me && me !== id){
    obDetailId = me;
    obOpenLeagueKey = null;
    obCompareId = id;
    window.scrollTo(0, 0);
    renderOverallStandings({ push: true });
    return;
  }
  obOpenDetail(id, { push: true });
  obOpenComparePicker();
};

const obSheetEl = document.getElementById('ob-sheet-content');
if(obSheetEl) enableSheetSwipeToDismiss(obSheetEl, obCloseSheet);

// ---- Detail ----

function obSplitText(locked, live){
  const parts = [];
  if(locked !== 0 || live === 0) parts.push(`${obPts(locked)} locked`);
  if(live !== 0) parts.push(`${obSignedPts(live)} live`);
  return parts.join(' &middot; ');
}

function obRulePtsClass(a){
  if(a.pts < 0) return 'neg';
  return a.provisional ? 'live' : '';
}

function obCardHtml(x, scale){
  const expanded = obOpenLeagueKey === x.league.key;

  const rulesHtml = x.awards.slice()
    .sort((a, b) => (a.provisional === b.provisional) ? b.pts - a.pts : (a.provisional ? 1 : -1))
    .map(a => `
      <div class="ob-rule" ${a.teamKey ? `onclick="openTeamModal('${a.teamKey}')"` : ''}>
        <div class="ob-rule-main">
          <div class="ob-rule-label">${a.label}</div>
          <div class="ob-rule-meta">
            <span>${a.teamName}</span>
            ${a.provisional ? '<span class="pts-tag live">Live</span>' : '<span class="pts-tag locked">Locked</span>'}
          </div>
        </div>
        <div class="ob-rule-pts ${obRulePtsClass(a)}">${obSignedPts(a.pts)}</div>
      </div>
    `).join('');

  return `
    <div class="ob-card ${expanded ? 'expanded' : ''}">
      <button type="button" class="ob-card-head" onclick="obToggleLeague('${x.league.key}')" aria-expanded="${expanded}">
        <div class="ob-card-pts ${x.pts < 0 ? 'neg' : ''}">${obPts(x.pts)}</div>
        <div class="ob-card-main">
          <div class="ob-card-title">${obLeagueFullName(x.league.key)}</div>
          <div class="ob-card-sub">${obSplitText(x.confirmed, x.provisional)}</div>
        </div>
        <div class="ob-card-right">
          ${splitBarHtml(x.confirmed, x.provisional, scale, 'xs ob-card-bar')}
          <svg class="ob-card-chevron" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
        </div>
      </button>
      ${expanded ? `<div class="ob-card-body">${rulesHtml}</div>` : ''}
    </div>
  `;
}

function obDetailHtml(row){
  const scoringRows = row.leagues.filter(x => x.awards.length > 0)
    .sort((a, b) => b.pts - a.pts || Math.abs(b.confirmed) - Math.abs(a.confirmed));
  const idle = row.leagues.filter(x => x.awards.length === 0);
  const scale = Math.max(1, ...scoringRows.map(x => obBarScale(x.confirmed, x.provisional)));
  const live = row.provisionalTotal;
  const move = obRankMove(row);
  const since = obSinceLabel(obSinceTs());

  const idleHtml = idle.length
    ? `
      <div class="ob-idle-block">
        <div class="ob-idle-title">No points yet</div>
        <div class="ob-idle-body">${idle.map(x => obLeagueFullName(x.league.key)).join(', ')} &mdash; every rule there is still available.</div>
      </div>
    `
    : '';

  const recent = activityRecentHtml(row.id);

  return `
    <div class="ob-back-row">
      <button type="button" class="ob-back" onclick="obCloseDetail()">${CHEVRON_LEFT_SVG}Points</button>
      <button type="button" class="cmp-btn" onclick="obOpenComparePicker()">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7h12"></path><path d="M16 3l4 4-4 4"></path><path d="M16 17H4"></path><path d="M8 13l-4 4 4 4"></path></svg>
        Compare
      </button>
    </div>
    <div class="ob-detail-head">
      <div class="ob-detail-left">
        <div class="ob-detail-eyebrow mute">${obRankPhrase(row)}</div>
        <h2 class="ob-detail-name ${row.id === obYouId() ? 'current' : ''}">${row.name}</h2>
      </div>
      <div class="ob-detail-right">
        <div class="ob-detail-total">${obPts(row.total)}</div>
        <div class="ob-detail-total-label">Projected pts</div>
      </div>
    </div>
    <div class="ob-split ob-detail-split">
      ${splitBarHtml(row.confirmedTotal, live, obBarScale(row.confirmedTotal, live), 'lg')}
      <div class="ob-stat-row">
        <div class="stat-tile"><div class="lbl">Locked</div><div class="num">${row.confirmedTotal}</div></div>
        <div class="stat-tile"><div class="lbl">Live</div><div class="num ${live < 0 ? 'neg' : 'lv'}">${obSignedPts(live)}</div></div>
        <div class="stat-tile"><div class="lbl">${since ? since.charAt(0).toUpperCase() + since.slice(1) : 'Rank move'}</div><div class="num">${move ? obMoveHtml(move, false) : '&ndash;'}</div></div>
      </div>
    </div>
    ${recent ? `<div class="ob-section-title">Recent changes</div>${recent}` : ''}
    <div class="ob-section-title">Where the points come from</div>
    <div class="ob-cards">${scoringRows.map(x => obCardHtml(x, scale)).join('')}</div>
    ${idleHtml}
    <button class="ob-detail-link" onclick="setDraftTeam('${row.id}'); switchView('board');">See ${row.name}'s board &rarr;</button>
  `;
}

// ---- Entry points ----

// Called by switchView (js/board.js) every time the Points tab opens.
// Standings first, unless this visit was asked for Activity (see
// obSegmentNext) or the URL says so (a reload, a shared link). Also
// starts a new visit for the "since" rank baseline.
export function obEnterView(){
  const fromUrl = new URLSearchParams(window.location.search).get('seg');
  obSegment = obSegmentNext || (fromUrl === 'activity' ? 'activity' : 'standings');
  obSegmentNext = null;
  obBaselinePending = true;
  obGrowNext = true;
}

export function obSetSegment(key){
  if(key !== 'standings' && key !== 'activity') return;
  obSegment = key;
  renderOverallStandings();
}
window.obSetSegment = obSetSegment;

export function obOpenDetail(id, opts){
  obDetailId = id;
  obOpenLeagueKey = null;
  obCompareId = null;
  window.scrollTo(0, 0);
  renderOverallStandings(opts);
}
window.obOpenDetail = obOpenDetail;

export function obCloseDetail(){
  obDetailId = null;
  obOpenLeagueKey = null;
  obCompareId = null;
  renderOverallStandings();
}
window.obCloseDetail = obCloseDetail;

export function obToggleLeague(key){
  obOpenLeagueKey = obOpenLeagueKey === key ? null : key;
  renderOverallStandings();
}
window.obToggleLeague = obToggleLeague;

// ---- Activity ----

// Every "go to Activity" (the Home link, a notification) lands here.
export function obOpenActivity(){
  obSegment = 'activity';
  obSegmentNext = 'activity';
  obDetailId = null;
  obCompareId = null;
  obCloseSheet();
  window.switchView('overall');
  window.scrollTo(0, 0);
}
window.obOpenActivity = obOpenActivity;
window.renderOverallStandings = () => renderOverallStandings();

// ---- Compare (head to head) ----

const comparePickerOverlay = () => document.getElementById('compare-sheet-overlay');

export function obOpenComparePicker(){
  if(!obDetailId || !comparePickerOverlay()) return;
  const rows = obRankedRows();
  const me = rows.find(r => r.id === obDetailId);
  if(!me) return;
  document.getElementById('compare-sheet-title').textContent = 'Compare ' + me.name + ' with…';
  document.getElementById('compare-sheet-rows').innerHTML = comparePickerHtml(rows, obDetailId, obCompareId);
  openSheetOverlay(comparePickerOverlay());
  lockBodyScroll();
}
window.obOpenComparePicker = obOpenComparePicker;

export function obCloseComparePicker(){
  const el = comparePickerOverlay();
  if(!isSheetOpen(el)) return;
  unlockBodyScroll();
  closeSheetOverlay(el);
}
window.obCloseComparePicker = obCloseComparePicker;

// Picking from the detail view pushes the compare screen; picking from
// within it (Change) swaps the opponent in place.
export function obPickOpponent(id){
  const fromCompare = !!obCompareId;
  obCloseComparePicker();
  obCompareId = id;
  if(!fromCompare) window.scrollTo(0, 0);
  renderOverallStandings({ push: !fromCompare });
}
window.obPickOpponent = obPickOpponent;

export function obCloseCompare(){
  obCompareId = null;
  window.scrollTo(0, 0);
  renderOverallStandings();
}
window.obCloseCompare = obCloseCompare;

const compareSheet = document.getElementById('compare-sheet-content');
if(compareSheet) enableSheetSwipeToDismiss(compareSheet, obCloseComparePicker);

// The bonus reads standings tables nothing else on this page loads, so
// the first render fetches them and repaints once (totals would
// otherwise sit 5 short for whoever holds each bonus until some other
// tab happened to load that league).
let obBonusPrimed = false;
function obPrimeBonus(){
  if(obBonusPrimed) return;
  obBonusPrimed = true;
  loadBonusInputs().then(() => {
    renderActivityHomeLink();
    const view = document.getElementById('view-overall');
    if(view && view.classList.contains('active')) renderOverallStandings();
  });
}

const OB_SIM_BANNER_HTML = `<div class="ob-sim-banner">Showing fake results for preview &mdash; set Points Tab Data to Real in Settings for live standings.</div>`;

export function renderOverallStandings(opts){
  const container = document.getElementById('overall-content');
  if(!container) return;
  const push = opts && opts.push ? 'view-push-in' : '';
  const simBanner = obMode === 'simulated' ? OB_SIM_BANNER_HTML : '';
  const rows = obRankedRows();
  const growNow = obGrowNext;
  obGrowNext = false;
  obRollBaseline(rows);
  runActivityDetection();
  obPrimeBonus();

  if(obDetailId){
    const row = rows.find(r => r.id === obDetailId);
    if(row){
      if(obCompareId && rows.some(r => r.id === obCompareId)){
        container.innerHTML = `${simBanner}<div class="ob-detail cmp ${push}">${compareHtml(rows, obDetailId, obCompareId)}</div>`;
        container.dataset.obSurface = 'detail';
        setupCompareSticky();
        fillSameRace(rows, obDetailId, obCompareId);
        return;
      }
      obCompareId = null;
      container.innerHTML = `${simBanner}<div class="ob-detail ${push}">${obDetailHtml(row)}</div>`;
      container.dataset.obSurface = 'detail';
      setupCompareSticky();
      return;
    }
    obDetailId = null;
    obCompareId = null;
  }

  const viewEl = document.getElementById('view-overall');
  if(viewEl && viewEl.classList.contains('active')) updateUrlParam('seg', obSegment);
  // Looking at the feed is what marks it seen — quietly, so the Home link
  // and badge repaint without re-entering this render.
  if(obSegment === 'activity' && unseenCount() > 0) markActivitySeen(true);
  // Re-rank: only a re-render of the same list glides (never entering
  // the tab, a push back from a detail, or a segment switch).
  const surface = 'list:' + obSegment;
  const before = !growNow && !push && container.dataset.obSurface === surface ? obSnapshot(container) : null;
  const prevHeroTotal = container.querySelector('.ob-hero-total');
  container.innerHTML = simBanner + obListHtml(rows);
  container.dataset.obSurface = surface;
  if(growNow) obGrowStart = performance.now();
  obPlayGrow(container, rows, growNow ? null : prevHeroTotal);
  if(before) obPlayFlip(container, before, rows);
  if(obSheetId) obOpenSheet(obSheetId);
}
