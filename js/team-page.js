/* ============================================================
   Team Page: a real, navigable screen for a single team, and the one
   place every team tap in the app goes (a Home or Standings row grows
   into it; Scores' crests and Points' rows push it in). Owns
   its own three "screens" (the page itself, plus the Full Schedule and
   Full Squad screens behind its footer links) and their push/pop
   navigation, tab state, and the News/Roster/Stats fetches unique to
   this view.

   Full tab treatment (Overview/Stats/Squad, +Injuries for NFL) ships
   for every league in FLAT_SCHEDULE_LEAGUES (EPL/NFL/MLB/NBA/NHL/WNBA/
   CFB/CBB). News used to be its own 4th tab but is now just a section
   on Overview, below the schedule content (see scheduleTabHtml/
   ensureNews) — it only ever needed a team's ESPN id and sportPath, so
   it was never restricted the way Stats/Squad are, and folding it in
   there instead of a separate tab means it's never a full empty tab of
   its own when a team just has nothing new posted. Roster/team-stats
   endpoints were first verified for EPL, NFL and MLB (see js/espn.js's
   fetchEspnTeamRoster/fetchEspnTeamStatistics header comments); NBA,
   NHL, WNBA, CFB and College Basketball followed (2026-09-22) off one
   extra ESPN call per team, fetchEspnTeamPlayerStats, which carries
   both the team's season totals and every player's own stat line —
   see PLAYER_STATS_LEAGUES below for each league's tiles, leaders and
   roster stat line.

   Pushed/popped via the functions below, not switchView() — switchView
   also drives the bottom tab bar's active state off a fixed data-view
   whitelist that doesn't include these views, and the design wants
   whichever real tab was active before the push to stay lit ("Standings
   is the active tab throughout"). So this toggles `.view.active`
   directly (the same primitive switchView uses) and leaves the tab bar
   alone.
   ============================================================ */
import { TEAM_META, LEAGUES, DRAFT_TEAMS, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT } from './data.js';
import {
  teamBadgeHtml, crestSrc, updateUrlParam, segmentedControlHtml, retryPending, abbrFromName, NEUTRAL_BADGE_STYLE,
  EASE_SPRING, EASE_OUT, MOVE_SLOP, SWIPE_COMMIT, FLING_VELOCITY, RUBBER_BAND, SNAP_BACK_MS
} from './utils.js';
import { fetchEspnTeamNews, fetchEspnTeamRoster, fetchEspnTeamStatistics, fetchEspnTeamPlayerStats } from './espn.js';
import {
  FLAT_SCHEDULE_LEAGUES, GAME_DETAIL_LEAGUES, liveDataCache, fetchTeamBundle, isBundleStale,
  renderStats, renderNext, seasonStatus, teamRecordStanding, setTeamPageRefresher
} from './live-data.js';
import { findEspnEplRow } from './standings-epl.js';
import { findEspnNflRow } from './standings-nfl.js';
import { findEspnMlbRow } from './standings-mlb.js';
import { favoriteStarHtml } from './favorites.js';
import { fetchMoreNewsCached, safeStoryUrl } from './news-more.js';
import { escapeHtml } from './escape.js';
import { navigate, canAnimateLive } from './motion.js';
import { fxOn, play, pop, rollNumbers, stagger } from './motion-fx.js';
import { teamPathToPoints, loadStandingsTables } from './lines.js';
import { postseasonTeamHtml, postseasonTeamOpened, onPostseasonData } from './postseason.js';
import { currentProfileId } from './identity.js';
import { attachDrag, releaseDirection } from './gestures.js';
import {
  fetchNflverseDepthChartCached, fetchNflverseInjuriesCached,
  getTeamDepthChart, getTeamInjuries, nflverseInjuryStatus,
  nflverseInjuriesCache, nflverseDepthChartCache
} from './nflverse.js';

import {
  backLinkHtml, teamBadgeHtml as badgeHtml, teamOrbHtml, compactBarHtml, pageDotsHtml, sectionCardHtml,
  pathToPointsHtml, formStripHtml, nextGameHtml,
  filterTabHtml, revealActiveTab
} from './ui.js';
// Every league with a verified roster/team-stats source (see this
// file's header comment) — a FLAT_SCHEDULE_LEAGUES league missing from
// here still gets a real page + Overview tab, just a placeholder
// Stats/Squad.
const FULL_STATS_SQUAD_LEAGUES = ['epl', 'nfl', 'mlb', 'nba', 'nhl', 'wnba', 'cfb', 'mcbb'];

// News has no tab of its own anymore — it's a section on the Overview
// tab now (see scheduleTabHtml below), folded in under the "Full
// schedule ›" link.
const TABS = {
  epl: [{ key: 'schedule', label: 'Overview' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Squad' }],
  // Injuries is NFL-only — nflverse (js/nflverse.js) has no equivalent
  // structured injury-report data for any other league.
  nfl: [{ key: 'schedule', label: 'Overview' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Roster' }, { key: 'injuries', label: 'Injuries' }],
  mlb: [{ key: 'schedule', label: 'Overview' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Roster' }]
};
// "Squad" is soccer vocabulary — every US league calls it a roster.
['nba', 'nhl', 'wnba', 'cfb', 'mcbb'].forEach(key => { TABS[key] = TABS.mlb; });
function tabsFor(leagueKey){
  return TABS[leagueKey] || [{ key: 'schedule', label: 'Overview' }, { key: 'stats', label: 'Stats' }, { key: 'squad', label: 'Squad' }];
}

const EMPTY_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h9l4 4v14H6z"></path><path d="M15 3v4h4"></path><path d="M9 13h6M9 17h6"></path></svg>';

// ---- Module state ----
// Only one Team Page (and one full-screen behind it) is ever open at
// once, so this is a single object rather than a map — cached per-team
// data lives in the *Cache objects below instead, so switching away and
// back to the same team's page doesn't refetch.
// squadFilter starts null (rather than a real group name) so
// fullRosterHtml's own fallback — groups[0], i.e. whatever group a
// team's roster lists first (Offense, for NFL) — picks the default the
// first time a Roster tab renders, instead of hardcoding a group name
// here that wouldn't exist for every league (MLB's groups aren't
// Offense/Defense/Special Teams).
// swipeOrder is the teams a swipe on the hero moves through (yours, in
// Home's order; empty on a team you don't own) and teamIndex is where in
// it this one sits.
const state = { teamKey: null, originView: 'board', originScrollY: 0, activeTab: 'schedule', squadFilter: null, swipeOrder: [], teamIndex: -1 };

const moreNewsCache = {}; // teamKey -> stories (Perigon, via the worker)
const newsCache = {};   // teamKey -> { status: 'idle'|'loading'|'ready'|'empty'|'error', items }
const rosterCache = {}; // teamKey -> { status, items }
const statsCache = {};  // teamKey -> { status, data } — `data` shape is league-specific, built in computeStatsTiles
const playerStatsCache = {}; // teamKey -> { status, data } — `data` is fetchEspnTeamPlayerStats's shape (PLAYER_STATS_LEAGUES only)

function espnTeamRowFor(meta){
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  return flat ? flat.findRow(meta) : null;
}

// ---- Navigation ----

function setActiveView(viewId){
  document.querySelectorAll('.view').forEach(v => {
    v.classList.toggle('active', v.id === viewId);
    // See .tp-still in css/style.css: only needed until the page is next hidden.
    if(v.id !== viewId) v.classList.remove('tp-still');
  });
}

// Note: this app's `?team=` param already means something else (which
// drafter's board you're peeking — see setDraftTeam in js/board.js), so
// the Team Page's own team key rides in `?tp=` instead to avoid
// colliding with that existing, unrelated param.
// originView: the view the tap came from ('board', 'standings',
// 'live-now', 'overall'); Back returns there, at the same scroll.
// rowEl: what was tapped, when it shows the team's crest (a Home or
// Standings row, a team on a Scores card, a Compare team) — the page then
// grows out of it (expandFromRow below) instead of pushing in.
export function openTeamPage(teamKey, originView, rowEl){
  if(!TEAM_META[teamKey] || rowMotion) return;
  // A golfer has no team page: the golfer sheet is the whole thing.
  if(TEAM_META[teamKey].kind === 'golfer'){ window.openGolfer(TEAM_META[teamKey].espnAthleteId); return; }
  const origin = originView || 'board';
  const src = rowEl && canAnimateLive() ? teamSource(rowEl) : null;
  if(src && rowOnScreen(src.el)){
    fxBeginOpen('row');
    expandFromRow(teamKey, origin, src);
    return;
  }
  navigate('push', () => {
    fxBeginOpen('push');
    openTeamPageNow(teamKey, origin);
  });
}
window.openTeamPage = openTeamPage;

// What Back says: the page it returns to.
const BACK_LABELS = { board: 'Home', standings: 'Standings', 'live-now': 'Scores', overall: 'Points' };

function setTeamPageState(teamKey, originView){
  postseasonTeamOpened(teamKey);
  state.teamKey = teamKey;
  state.originView = originView;
  state.originScrollY = window.scrollY;
  state.activeTab = 'schedule';
  state.squadFilter = null;
  state.swipeOrder = swipeOrderFor(teamKey);
  state.teamIndex = state.swipeOrder.indexOf(teamKey);
  updateUrlParam('view', 'team');
  updateUrlParam('tp', teamKey);
}

// Your own teams in Home's order, league by league (golfers have no team
// page). Empty when the team isn't yours: swiping is off there, rather
// than running through a whole league of teams nobody here owns.
function swipeOrderFor(teamKey){
  const me = currentProfileId;
  const meta = TEAM_META[teamKey];
  if(PRE_DRAFT || !me || !meta || meta.favoriteOnly || meta.draftTeamId !== me) return [];
  return LEAGUES.flatMap(l => l.teams).filter(k => {
    const m = TEAM_META[k];
    return m && m.draftTeamId === me && !m.favoriteOnly && m.kind !== 'golfer';
  });
}

function openTeamPageNow(teamKey, originView){
  setTeamPageState(teamKey, originView);
  setActiveView('view-team-page');
  window.scrollTo(0, 0);
  renderTeamPage();
  ensureBundle(teamKey);
}

export function backFromTeamPage(){
  // Back tapped while the page is still growing in: land the opening at
  // once and shrink straight back, rather than ignoring the tap. A tap
  // during the shrink itself is already on its way.
  if(rowMotion){
    if(!rowMotion.opening) return;
    rowMotion.finish();
  }
  const { originView } = state;
  if(canAnimateLive() && collapseToRow(originView)) return;
  navigate('pop', () => {
    setActiveView('view-' + originView);
    updateUrlParam('view', originView === 'board' ? null : originView);
    updateUrlParam('tp', null);
    window.scrollTo(0, state.originScrollY);
  });
}
window.backFromTeamPage = backFromTeamPage;

/* ---- Team crest ↔ Team page: container transform ----
   Whatever holds the tapped crest (a Home or Standings row, a team's line
   on a Scores card, a Compare team) grows into the page, and Back shrinks
   the page back into it (design handoff "Row Expand Transition"; timings, curves and
   sequencing are theirs). Run with Web Animations on the live DOM rather
   than a View Transition: on the way back the team page is the *old*
   state, and a View Transition only has a frozen picture of that, so its
   body, veil and ghost couldn't fade on their own.

   While it runs, both views are showing: the view the row is on stays in
   the page flow (.tp-under) and the team page sits over it as a fixed layer
   (.tp-layer) laid out exactly where it sits in the flow at scroll 0, so
   swapping back to the plain layout at the end moves no pixels. Everything
   that moves is a transform or an opacity (see .tp-layer in
   css/style.css), so it stays smooth while the page renders under it. Above
   the layer, #tp-fx holds the pieces that fly: a veil the color of the
   row's own surface, a "ghost" of the row's rank and record, and copies
   of the hero crest and name (the real ones sit inside .team-hero's
   overflow: hidden, which would clip them in flight). */
const ROW_D = 560;                                 // open; close runs at 0.85x
const ROW_EASE = 'cubic-bezier(0.45,0.05,0.15,1)';  // gentle start, long settle
const ROW_SOFT = 'cubic-bezier(0.45,0,0.55,1)';     // crossfades
const TP_BODY = '#team-page-stats, #team-page-game-card, #team-page-tabs, #team-page-tab-body';

// What grows into the page from a tap on `el`, and the parts of it that
// fly into the hero: { el, crest, name?, owner? }, or null when what was
// tapped shows no crest (the page then pushes in). A Standings row's sub
// line and a Scores team's are its owner; a Home row's is its record,
// which stays behind with the rest.
function teamSource(el){
  const side = el.closest('.tg-side');
  if(side){
    const owner = side.querySelector('.tg-owner');
    return { el: side, crest: side.querySelector('.badge'), name: side.querySelector('.tg-name'), owner: owner && owner.textContent.trim() ? owner : null };
  }
  // A Standings postseason ladder chip: just its crest flies.
  const chip = el.closest('.ps-chip');
  if(chip){
    const crest = chip.querySelector('.badge');
    return crest ? { el: chip, crest } : null;
  }
  const row = el.closest('.standings-row, .team, .cmp-team');
  const crest = row && row.querySelector('.badge');
  if(!crest) return null;
  if(row.classList.contains('cmp-team')) return { el: row, crest };
  return { el: row, crest, name: row.querySelector('.team-name'), owner: row.classList.contains('standings-row') ? row.querySelector('.team-sub') : null };
}

let rowMotion = null;       // the running transition, if any: { finish, opening }
let pendingRender = false;  // a render that landed mid-transition, held until it ends
const afterRow = [];        // other work held until it ends

// Runs `fn` now, or once a running row transition lands: anything that
// would rewrite the page's layout mid-flight waits for it.
function whenSettled(fn){
  if(rowMotion) afterRow.push(fn);
  else fn();
}

function rowOnScreen(el){
  if(!el || !el.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
}

// The row's own surface (its league card), for the veil.
function surfaceColor(el){
  for(let n = el; n && n !== document.documentElement; n = n.parentElement){
    const c = getComputedStyle(n).backgroundColor;
    if(c && c !== 'transparent' && !/rgba\(.*,\s*0\)$/.test(c)) return c;
  }
  return getComputedStyle(document.body).backgroundColor;
}

const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

// Everything both directions share. `opening` picks the direction; every
// keyframe pair is written open-wise and swapped for close, with easing
// still running forward (no `direction: reverse`, which would turn the
// ease-out into an ease-in).
// `under` is the view the row sits on; `src` is teamSource's. Parts it
// has no copy of (a Home row's owner, a Compare team's name) fade in on
// the hero instead of flying.
function runRowMotion({ opening, src, page, under, onDone }){
  const row = src.el;
  const D = opening ? ROW_D : Math.round(ROW_D * 0.85);
  const clip = page.querySelector('.tp-clip'), content = clip.firstElementChild;
  const { width: vw, height: vh } = page.getBoundingClientRect();
  const rr = rect(row);
  const { crest: rowCrest, name: rowName = null, owner: rowOwner = null } = src;
  const heroCrest = page.querySelector('.team-hero-row > :first-child');
  const heroName = page.querySelector('.team-hero-name'), heroOwner = page.querySelector('.team-hero-owner');
  const anims = [];
  const go = (el, a, b, opts) => {
    if(!el) return;
    anims.push(el.animate(opening ? [a, b] : [b, a], Object.assign({ duration: D, easing: ROW_EASE, fill: 'both' }, opts)));
  };

  // The page window: the row's rectangle → the whole screen. The layer's
  // own edge is the window's left and top, .tp-clip's is its right and
  // bottom, and the content moves back by the sum of both, so it holds
  // still on screen while the window opens over it.
  const x0 = rr.x, y0 = rr.y, x1 = rr.x + rr.w, y1 = rr.y + rr.h;
  const at = (x, y) => ({ transform: `translate(${x}px, ${y}px)` });
  go(page, at(x0, y0), at(0, 0));
  go(clip, at(x1 - vw - x0, y1 - vh - y0), at(0, 0));
  go(content, at(vw - x1, vh - y1), at(0, 0));
  // The compact bar is fixed to the moving content meanwhile (see
  // .tp-layer in css/style.css): hold it at the screen's top left.
  const cr = content.getBoundingClientRect();
  page.style.setProperty('--tp-bx', -cr.left + 'px');
  page.style.setProperty('--tp-by', -cr.top + 'px');
  page.style.setProperty('--tp-vw', vw + 'px');

  const fx = document.createElement('div');
  fx.id = 'tp-fx';
  document.body.appendChild(fx);

  // Veil: the row's surface, clipped exactly like the page, fading off it.
  const veil = document.createElement('div');
  veil.className = 'tp-veil';
  veil.style.background = surfaceColor(row);
  fx.appendChild(veil);
  // A flat color, so it can simply stretch.
  go(veil, { transform: `translate(${x0}px, ${y0}px) scale(${rr.w / vw}, ${rr.h / vh})` }, { transform: 'translate(0px, 0px) scale(1, 1)' });
  // Closing, the veil is in (and the page's content gone) by the time
  // the card is half its way down, so what lands is a clean row-colored
  // card rather than an empty page-colored box that changes color as it
  // settles.
  go(veil, { opacity: 1 }, { opacity: 0 }, opening
    ? { easing: ROW_SOFT, duration: D * 0.6, delay: D * 0.1 }
    : { easing: ROW_SOFT, duration: D * 0.35, delay: D * 0.1 });

  // Copies of the row pinned where it is, showing only some of it, laid
  // out exactly like the real one — including the top hairline, which the
  // row gets from its neighbor (a sibling rule), not from itself.
  // `flying` picks which copy: the parts that fly and nothing else (a
  // hidden parent's visible child still shows), or everything but them.
  const parts = [rowCrest, rowName, rowOwner].filter(Boolean);
  parts.forEach(n => { n.dataset.tpPart = ''; });
  const rowBorder = getComputedStyle(row).borderTopWidth;
  const rowCopy = flying => {
    const c = row.cloneNode(true);
    c.removeAttribute('onclick');
    c.classList.add('tp-ghost');
    if(flying) c.style.visibility = 'hidden';
    c.querySelectorAll('[data-tp-part]').forEach(n => { n.style.visibility = flying ? 'visible' : 'hidden'; });
    Object.assign(c.style, {
      left: rr.x + 'px', top: rr.y + 'px', width: rr.w + 'px', height: rr.h + 'px',
      borderTop: `${rowBorder} solid transparent`
    });
    fx.appendChild(c);
    return c;
  };

  // Ghost: the row's rank and record — its crest, name and owner fly
  // instead.
  const ghost = rowCopy(false);
  // Closing, the rank and record fill in while the card lands, not after.
  go(ghost, { opacity: 1 }, { opacity: 0 }, opening
    ? { easing: ROW_SOFT, duration: D * 0.35 }
    : { easing: ROW_SOFT, duration: D * 0.35, delay: D * 0.45 });

  // Shared crest, name and owner: copies of the hero's, flown from the row's
  // (FLIP, origin 0 0, uniform scale — separate x/y scales would squash
  // the text). The name scales by font size, which stays right even when
  // the hero name wraps to two lines.
  //
  // The row's own crest and name aren't the same pixels as the hero's (a
  // padded 32px badge with a tight shadow, Manrope vs Space Grotesk, maybe
  // another variant of the crest image), so they never just swap: the copy
  // lands on what the row actually draws (the image inside the badge's
  // padding) and cross-fades with the real thing over the stretch nearest
  // the row — the start of opening, the end of closing. The row's side of
  // that cross-fade is a copy of the row showing only its crest and name,
  // above the veil (the real row sits under it) and pixel-identical to the
  // real row that replaces it when the transition ends.
  const face = rowCopy(true);
  parts.forEach(n => { delete n.dataset.tpPart; });
  const hidden = [];
  const hide = el => { if(el){ el.style.visibility = 'hidden'; hidden.push(el); } };
  const handoff = opening ? { easing: ROW_SOFT, duration: D * 0.15 } : { easing: ROW_SOFT, duration: D * 0.22, delay: D * 0.78 };
  // The box an element's picture actually fills: a crest's image inside
  // any padding, otherwise the element itself.
  const drawn = el => {
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    const box = rect(img || el);
    if(!img) return box;
    const cs = getComputedStyle(img);
    const pl = parseFloat(cs.paddingLeft) || 0, pt = parseFloat(cs.paddingTop) || 0;
    const pr = parseFloat(cs.paddingRight) || 0, pb = parseFloat(cs.paddingBottom) || 0;
    return { x: box.x + pl, y: box.y + pt, w: box.w - pl - pr, h: box.h - pt - pb };
  };
  const fly = (src, dst, scale, { settle = false } = {}) => {
    if(!src || !dst) return;
    const box = rect(dst);
    if(!box.w || !box.h) return;
    const s = drawn(src), t = drawn(dst);
    const copy = dst.cloneNode(true);
    const cs = getComputedStyle(dst);
    copy.classList.add('tp-fly');
    // Already decoded for the row; drawing it straight away keeps the copy
    // from flying in blank for a frame.
    copy.querySelectorAll('img').forEach(img => { img.decoding = 'sync'; });
    if(copy.tagName === 'IMG') copy.decoding = 'sync';
    // Styles the copy would lose outside the page (the owner's come from
    // .team-hero-meta, the crest's size from .team-hero). Not the crest's
    // drop-shadow: a filter on something scaling is redrawn as it goes,
    // and it hitched the flight on iPhone. A badge's shadow is left
    // behind the same way.
    Object.assign(copy.style, {
      left: box.x + 'px', top: box.y + 'px', width: box.w + 'px', height: box.h + 'px',
      color: cs.color,
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight, letterSpacing: cs.letterSpacing
    });
    fx.appendChild(copy);
    // Map the copy's drawn box onto the row's: scale about the copy's
    // top-left corner, then shift by wherever that leaves its drawn box.
    const k = scale(s, t);
    const tx = s.x - box.x - k * (t.x - box.x), ty = s.y - box.y - k * (t.y - box.y);
    go(copy, { transform: `translate(${tx}px, ${ty}px) scale(${k})` }, { transform: 'translate(0px, 0px) scale(1)' });
    go(copy, { opacity: 0 }, { opacity: 1 }, handoff);
    hide(src);
    // The hero crest wears a drop-shadow the copy doesn't. Rather than
    // drawing it for the first time on the landing frame (a hitch) and
    // popping it in, the real crest fades in under the copy over the
    // last stretch, while the copy is within a few pixels of it.
    if(settle) go(dst, { opacity: 0 }, { opacity: 1 }, opening
      ? { easing: ROW_SOFT, duration: D * 0.15, delay: D * 0.85 }
      : { easing: ROW_SOFT, duration: D * 0.15 });
    else hide(dst);
  };
  fly(rowCrest, heroCrest, (s, t) => s.h / t.h, { settle: true });
  const byFont = (src, dst) => () => parseFloat(getComputedStyle(src).fontSize) / parseFloat(getComputedStyle(dst).fontSize);
  fly(rowName, heroName, byFont(rowName, heroName));
  fly(rowOwner, heroOwner, byFont(rowOwner, heroOwner));
  go(face, { opacity: 1 }, { opacity: 0 }, handoff);

  // The page's own content comes in once the shape is mostly there (and
  // goes first on the way back).
  const inT = opening ? { delay: D * 0.25, duration: D * 0.75 } : { delay: 0, duration: D * 0.3, easing: ROW_SOFT };
  page.querySelectorAll(TP_BODY).forEach(el => go(el, { opacity: 0, transform: 'translateY(28px)' }, { opacity: 1, transform: 'translateY(0px)' }, inT));
  // The meta line fades except the owner, which flies (its original stays
  // hidden until the copy lands on it).
  page.querySelectorAll(`.compact-bar, .team-hero-meta > ${rowOwner ? ':not(.team-hero-owner)' : '*'}, .page-dots${rowName ? '' : ', .team-hero-name'}`).forEach(el => go(el, { opacity: 0 }, { opacity: 1 }, inT));

  // The view underneath recedes, toward the row.
  const sr = under.getBoundingClientRect();
  under.style.transformOrigin = `50% ${rr.y + rr.h / 2 - sr.top}px`;
  go(under, { transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.93)', opacity: 0.3 });

  let ended = false;
  const finish = () => {
    if(ended) return;
    ended = true;
    anims.forEach(a => { try{ a.cancel(); }catch(e){} });
    hidden.forEach(el => { el.style.visibility = ''; });
    under.style.transformOrigin = '';
    ['--tp-bx', '--tp-by', '--tp-vw'].forEach(p => page.style.removeProperty(p));
    fx.remove();
    rowMotion = null;
    onDone();
    // What waited for the landing runs just after it, so the landing frame
    // only has to put the page back in the flow.
    requestAnimationFrame(() => setTimeout(() => {
      const held = afterRow.splice(0);
      if(rowMotion){ afterRow.push(...held); return; }  // another one started
      if(pendingRender){ pendingRender = false; renderTeamPage({ refresh: true }); }
      held.forEach(fn => fn());
    }));
  };
  rowMotion = { finish, opening };
  // Whatever happens to the animations, always land the navigation.
  Promise.all(anims.map(a => a.finished)).then(finish, finish);
  setTimeout(finish, D + 400);
}

// Lays the team page over the view underneath as a fixed layer that
// matches its in-flow position at scroll 0 (see the section comment).
// Measured off whichever of the two is in the flow right now; both sit in
// the same spot in .board.
function layTeamPageOver(page, under){
  const sr = (page.classList.contains('active') ? page : under).getBoundingClientRect();
  page.style.setProperty('--tp-t', sr.top + window.scrollY + 'px');
  page.style.setProperty('--tp-l', sr.left + 'px');
  page.style.setProperty('--tp-w', sr.width + 'px');
  page.classList.add('tp-layer', 'tp-still');
  under.classList.add('tp-under');
}

function liftTeamPageLayer(page, under){
  page.classList.remove('tp-layer');
  ['--tp-t', '--tp-l', '--tp-w'].forEach(p => page.style.removeProperty(p));
  under.classList.remove('tp-under');
}

function expandFromRow(teamKey, origin, src){
  const page = document.getElementById('view-team-page');
  const under = document.getElementById('view-' + origin);
  if(!page || !under){ openTeamPageNow(teamKey, origin); return; }
  try{
    layTeamPageOver(page, under);
    setTeamPageState(teamKey, origin);
    setActiveView('view-team-page');
    page.classList.add('tp-still');
    renderTeamPage();
    page.querySelector('.tp-clip').scrollTop = 0;
    // The page opens at its top, whatever the view underneath is scrolled
    // to: a fold left over from that scroll (or the last visit's) would
    // push the hero crest down, and the crest would fly to the wrong spot.
    setFold(page, 0);
    runRowMotion({ opening: true, src, page, under, onDone: () => {
      liftTeamPageLayer(page, under);
      if(page.classList.contains('active')) window.scrollTo(0, 0);
    } });
    // A fresh fetch lands after the page has: its parse and render would
    // compete with the transition for the main thread.
    whenSettled(() => { if(state.teamKey === teamKey) ensureBundle(teamKey); });
  }catch(e){
    console.error(e);
    if(rowMotion) rowMotion.finish();
    else { liftTeamPageLayer(page, under); openTeamPageNow(teamKey, origin); }
  }
}

// false when there's no row to shrink into (it scrolled away, a refresh
// dropped it, or a swipe moved to a team that isn't on screen there) —
// the caller then pops the ordinary way.
function collapseToRow(origin){
  const page = document.getElementById('view-team-page');
  const under = document.getElementById('view-' + origin);
  if(!page || !under) return false;
  const pageScroll = window.scrollY;
  try{
    layTeamPageOver(page, under);
    page.querySelector('.tp-clip').scrollTop = pageScroll;
    setFold(page, pageScroll);
    setActiveView('view-' + origin);
    page.classList.add('tp-still');
    updateUrlParam('view', origin === 'board' ? null : origin);
    updateUrlParam('tp', null);
    window.scrollTo(0, state.originScrollY);
    const key = state.teamKey;
    const src = [...under.querySelectorAll('[onclick]')]
      .filter(r => (r.getAttribute('onclick') || '').includes(`openTeamPage('${key}'`))
      .map(teamSource).find(t => t && rowOnScreen(t.el));
    if(!src){
      // Nothing to land on: put the page back and let the caller pop.
      liftTeamPageLayer(page, under);
      setActiveView('view-team-page');
      updateUrlParam('view', 'team');
      updateUrlParam('tp', key);
      window.scrollTo(0, pageScroll);
      return false;
    }
    runRowMotion({ opening: false, src, page, under, onDone: () => {
      liftTeamPageLayer(page, under);
      page.classList.remove('tp-still');
    } });
    return true;
  }catch(e){
    console.error(e);
    if(rowMotion) rowMotion.finish();
    else liftTeamPageLayer(page, under);
    return true;
  }
}

// Jump a running row transition straight to its end (switchView calls
// this so a tab tap mid-flight lands cleanly).
export function settleTeamTransition(){
  if(rowMotion) rowMotion.finish();
}

export function openFullSchedule(teamKey){
  navigate('push', () => {
    state.teamKey = teamKey;
    setActiveView('view-team-schedule');
    window.scrollTo(0, 0);
    updateUrlParam('view', 'team-schedule');
    renderFullSchedule('all');
  });
}
window.openFullSchedule = openFullSchedule;

export function openFullSquad(teamKey){
  navigate('push', () => {
    state.teamKey = teamKey;
    setActiveView('view-team-squad');
    window.scrollTo(0, 0);
    updateUrlParam('view', 'team-squad');
    renderFullSquad('all');
  });
}
window.openFullSquad = openFullSquad;

// Both full screens return to the page itself, not all the way back to
// the origin tab — "Full schedule ›"/"Full squad ›" are one level down
// from the page, not siblings of it.
export function backFromFullScreen(){
  navigate('pop', () => {
    setActiveView('view-team-page');
    updateUrlParam('view', 'team');
    window.scrollTo(0, 0);
    applyScroll();
  });
}
window.backFromFullScreen = backFromFullScreen;

// A cached bundle renders straight away, but it can be a localStorage
// restore from before the team's latest game — refetch it once it's
// stale instead of waiting on the background rotation.
function ensureBundle(teamKey){
  if(liveDataCache[teamKey] && !isBundleStale(liveDataCache[teamKey])) return;
  fetchTeamBundle(teamKey).then(bundle => {
    if(!bundle || state.teamKey !== teamKey) return;
    // Mid-transition the page's pieces are being animated; replacing
    // them now would pop them in. Render once it lands instead.
    if(rowMotion) pendingRender = true;
    else renderTeamPage({ refresh: true });
  });
}

export function setTeamPageTab(tabKey){
  state.activeTab = tabKey;
  const tabsEl = document.getElementById('team-page-tabs');
  const meta = TEAM_META[state.teamKey];
  if(tabsEl && meta) tabsEl.innerHTML = segmentedControlHtml(tabsFor(meta.leagueKey), state.activeTab, 'setTeamPageTab');
  renderTabBody();
}
window.setTeamPageTab = tabKey => setTeamPageTab(tabKey);

// ---- Team Page ----

// The fallback hero color for a team with none of its own.
const NO_ACCENT = '#D9B45B';
// Past this many teams the dots would run off the hero; it says "3 of 30".
const MAX_DOTS = 24;

// The line under the hero name. Its status pill needs the bundle, so a
// refresh rewrites just this (renderTeamPage).
function heroMetaHtml(teamKey, meta){
  const drafter = DRAFT_TEAMS.find(d => d.id === meta.draftTeamId);
  const league = LEAGUES.find(l => l.key === meta.leagueKey);
  const bundle = liveDataCache[teamKey];
  // MLB/WNBA show a season that doesn't score yet (PRIOR_SEASON_DISPLAY_LEAGUES):
  // an "In-Season" pill would read as if it counts.
  const prior = PRIOR_SEASON_DISPLAY_LEAGUES.includes(meta.leagueKey);
  const status = bundle && !prior ? seasonStatus(meta, bundle) : null;
  const mine = !!drafter && drafter.id === currentProfileId;
  return `
    ${PRE_DRAFT ? '' : `<span class="team-hero-owner${mine ? ' me' : ''}">${drafter ? drafter.name + (meta.favoriteOnly ? ' · Favorite' : '') : 'Undrafted'}</span>
    <span>&middot;</span>`}
    <span>${league ? league.label : ''}</span>
    ${status ? `<span class="status-pill">${status.label}</span>` : ''}
  `;
}

function heroHtml(teamKey, meta){
  const order = state.swipeOrder;
  let dots = '';
  if(order.length > 1 && order.length <= MAX_DOTS){
    dots = pageDotsHtml({ count: order.length, index: state.teamIndex, labels: order.map(k => TEAM_META[k].name), onclick: 'teamPageJump' });
  } else if(order.length > 1){
    dots = `<div class="page-dots-count">${state.teamIndex + 1} of ${order.length}</div>`;
  }

  return `
    <div class="team-hero" id="team-hero">
      ${teamOrbHtml({ color: meta.accent || NO_ACCENT, cls: 'team-hero-orb' })}
      <div class="team-hero-scrim"></div>
      <div class="team-hero-fold">
        <div class="team-hero-row">
          ${meta.badgeUrl ? `<img class="crest-bare" src="${crestSrc(meta)}" alt="${meta.name}" draggable="false">` : teamBadgeHtml(meta)}
          <div class="team-hero-name">${meta.fullName || meta.name}</div>
          <div class="team-hero-meta"></div>
        </div>
        ${dots}
      </div>
    </div>
  `;
}

// What each section of the page was last written with. A refresh rewrites
// only the sections whose markup changed, so one that lands mid-entrance
// leaves whatever is still playing (the orb bloom, the stat roll, Path to
// points, the form bars) alone instead of replacing it halfway through.
const written = new WeakMap();
function writeHtml(el, html){
  if(!el || written.get(el) === html) return false;
  el.innerHTML = html;
  written.set(el, html);
  return true;
}
// js/live-data.js's renderers write into an element by id: run one into a
// scratch element first, so its markup can go through writeHtml.
function writeRendered(el, render){
  if(!el) return false;
  const scratch = document.createElement('div');
  scratch.id = `${el.id}-scratch`;
  scratch.hidden = true;
  document.body.appendChild(scratch);
  try{ render(scratch.id); } finally { scratch.remove(); }
  return writeHtml(el, scratch.innerHTML);
}

// `refresh`: new data for the page already on screen (a fetch landing),
// rather than an open or a swipe. The bar, hero and tabs stay put; only
// what the data drives is rewritten, and only where it changed.
function renderTeamPage({ refresh = false } = {}){
  const el = document.getElementById('team-page-content');
  if(!el) return;
  const teamKey = state.teamKey;
  const meta = TEAM_META[teamKey];
  if(!meta) return;
  const shell = !(refresh && el.dataset.activeTeam === teamKey && el.querySelector('.team-hero'));
  // A swipe or a pull is holding the hero; rebuilding it waits for the
  // release. A refresh leaves the hero alone, so it goes ahead.
  if(shell && gesture){ pendingRender = true; return; }
  if(shell) pendingRender = false;
  const tabs = tabsFor(meta.leagueKey);
  const oldOrb = el.querySelector('.team-hero-orb');
  const fromColor = oldOrb ? oldOrb.style.getPropertyValue('--orb') : null;
  const backLabel = BACK_LABELS[state.originView] || 'Home';

  if(shell){
    el.dataset.activeTeam = teamKey;
    el.innerHTML = `
      ${compactBarHtml({
        backHtml: backLinkHtml({ label: backLabel, onclick: 'backFromTeamPage()' }),
        badgeHtml: teamBadgeHtml(meta),
        name: meta.name,
        actionsHtml: favoriteStarHtml(teamKey),
        color: meta.accent || NO_ACCENT
      })}
      ${heroHtml(teamKey, meta)}
      <div class="stat-strip" id="team-page-stats"></div>
      <div class="game-card upcoming" id="team-page-game-card"><div class="next-match" id="team-page-next"></div></div>
      <div class="team-page-tabs" id="team-page-tabs">${segmentedControlHtml(tabs, state.activeTab, 'setTeamPageTab')}</div>
      <div class="tab-body" id="team-page-tab-body"></div>
    `;
  }

  writeHtml(el.querySelector('.team-hero-meta'), heroMetaHtml(teamKey, meta));
  renderStatStrip(teamKey);
  renderNextGame(teamKey);
  renderTabBody();
  if(shell){
    ensureTables(teamKey);
    bindHeroGestures();
    bindPageSwipe();
    crossFadeOrb(fromColor);
    applyScroll();
  }
  playHeroOpen();
  playSwipeIn();
  playStatsRoll();
}

// The postseason bracket landing fills in an open page's Postseason section.
onPostseasonData(key => {
  const meta = TEAM_META[state.teamKey];
  if(meta && meta.leagueKey === key) writeHtml(document.getElementById('ps-section'), postseasonTeamHtml(state.teamKey));
});

// The live-data refresh ticks (js/live-data.js) repaint just these two.
setTeamPageRefresher(teamKey => {
  if(teamKey !== state.teamKey) return;
  renderStatStrip(teamKey);
  renderNextGame(teamKey);
});

// Record, standing and what the team's worth to its owner. Before the
// standings tables are in, the league's own strip from the bundle.
function renderStatStrip(teamKey){
  const el = document.getElementById('team-page-stats');
  const meta = TEAM_META[teamKey];
  if(!el || !meta) return;
  const rs = teamRecordStanding(meta);
  const bundle = liveDataCache[teamKey];
  if(!rs){
    if(bundle) writeRendered(el, id => renderStats(meta, bundle, id));
    else writeHtml(el, '<div class="stat-cell"><div class="lbl">Loading…</div></div>');
    return;
  }
  const path = teamPathToPoints(teamKey);
  const cell = (num, lbl, cls = '') => `<div class="stat-cell${cls ? ` ${cls}` : ''}"><div class="num">${num}</div><div class="lbl">${lbl}</div></div>`;
  writeHtml(el, cell(rs.record, 'Record')
    + cell(rs.standing, rs.group || 'Standing')
    + (path ? cell(path.now < 0 ? '&minus;' + Math.abs(path.now) : path.now, 'Points', 'pts') : ''));
}

// The next game's date, time and opponent, or the league's own live line
// while a game is on (and for the few teams with no ESPN schedule).
function renderNextGame(teamKey){
  const card = document.getElementById('team-page-game-card');
  const meta = TEAM_META[teamKey];
  const bundle = liveDataCache[teamKey];
  if(!card || !meta || !bundle) return;
  const live = !!(bundle.espnLive && bundle.espnLive.isLive);
  const evt = !live && bundle.espnSchedule && bundle.espnSchedule.upcoming && bundle.espnSchedule.upcoming[0];
  card.classList.toggle('live', live);
  card.classList.toggle('upcoming', !live);
  card.classList.toggle('next-game', !!evt);
  // A tap anywhere on the card opens the game's Game Details (the preview
  // before it starts, the box score while it's on), like every other game
  // in the app.
  const eventId = live ? bundle.espnLive.eventId : evt && evt.id;
  const tap = eventId && GAME_DETAIL_LEAGUES[meta.leagueKey] ? `openGameDetail('${teamKey}', '${eventId}')` : null;
  card.classList.toggle('clickable', !!tap);
  if(tap) card.setAttribute('onclick', tap);
  else card.removeAttribute('onclick');
  if(!evt){
    if(!card.querySelector('#team-page-next')) card.innerHTML = '<div class="next-match" id="team-page-next"></div>';
    writeRendered(card.querySelector('#team-page-next'), id => renderNext(teamKey, meta, bundle, id));
    return;
  }
  const opp = evt.opponentShortName || evt.opponentName;
  card.innerHTML = nextGameHtml({
    when: nextWhen(evt),
    home: evt.isHome,
    oppBadgeHtml: badgeHtml({ crestSrc: evt.opponentLogoUrl, name: evt.opponentName, style: NEUTRAL_BADGE_STYLE, text: evt.opponentAbbr || abbrFromName(evt.opponentName) }),
    oppName: opp,
    subHtml: [evt.venueName, evt.broadcast].filter(Boolean).join(' &middot; ')
  });
}

// "Today · 7:30 PM", "Sun, Oct 4 · 7:20 PM", "Sun, Oct 4 · Time TBD".
function nextWhen(evt){
  const d = new Date(evt.date);
  if(isNaN(d.getTime())) return '';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const day = sameDay ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const time = evt.timeTbd ? 'Time TBD' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

// ---- Hero: scroll collapse, swipe between teams, pull to stretch ----

// Scrolling folds the hero into the compact bar. One passive listener
// writes the page's --y (scroll) and --p (0 → 1 from 110px to 200px); the
// CSS does the rest. Nothing here reads layout.
const COLLAPSE_FROM = 110, COLLAPSE_OVER = 90;
let scrollFrame = 0;
function applyScroll(){
  scrollFrame = 0;
  const page = document.getElementById('view-team-page');
  // While it's the crest transition's layer, the window's scroll is the
  // view underneath's, not the page's (setFold sets it then).
  if(!page || !page.classList.contains('active') || page.classList.contains('tp-layer')) return;
  setFold(page, window.scrollY);
}
function setFold(page, scrollY){
  const y = Math.max(0, scrollY);
  page.style.setProperty('--y', y.toFixed(1));
  page.style.setProperty('--p', Math.min(1, Math.max(0, (y - COLLAPSE_FROM) / COLLAPSE_OVER)).toFixed(3));
}
window.addEventListener('scroll', () => { if(!scrollFrame) scrollFrame = requestAnimationFrame(applyScroll); }, { passive: true });

// The gesture holding the page right now ('x' swipe, 'y' pull, 'leave'
// while a committed swipe slides out), if any.
let gesture = null;
let detachHero = null;

// Pull to stretch: down on the hero at the very top.
function bindHeroGestures(){
  if(detachHero){ detachHero(); detachHero = null; }
  const hero = document.getElementById('team-hero');
  if(!hero) return;
  const orb = hero.querySelector('.team-hero-orb');
  document.getElementById('team-page-content').classList.toggle('swipes', state.swipeOrder.length > 1);
  detachHero = attachDrag(hero, {
    slop: MOVE_SLOP,
    ignore: 'button, a',
    accept: (axis, { dy }) => !rowMotion && !gesture && axis === 'y' && dy > 0 && window.scrollY <= 0 && fxOn(),
    onStart: () => {
      gesture = 'y';
      hero.getAnimations().forEach(a => a.cancel());
      hero.style.transition = 'none';
      orb.style.transition = 'none';
    },
    onMove: (axis, { dy }) => {
      const stretch = Math.min(Math.max(dy, 0), 180) * RUBBER_BAND.pull;
      hero.style.setProperty('--pull', stretch.toFixed(1));
      orb.style.transform = `scale(${(1 + stretch / 260).toFixed(4)})`;
    },
    onEnd: () => {
      gesture = null;
      springBack(hero, ['height'], () => hero.style.removeProperty('--pull'), orb);
      if(pendingRender){ pendingRender = false; renderTeamPage({ refresh: true }); }
    }
  });
}

// Swipe between teams from anywhere on the page. The hero's crest and name
// and every section under it follow the finger 1:1 while the orb drifts a
// little behind; a release past SWIPE_COMMIT.team (or a flick) slides the
// page out and the next team in from the other side, anything less springs
// back. A drag that starts in something that scrolls sideways (the depth
// chart, a box score) is left to it. Bound once: #team-page-content stays
// put while its contents are rewritten.
let pageSwipeBound = false;
function swipePieces(){
  const page = document.getElementById('team-page-content');
  return page ? [page.querySelector('.team-hero-row'), ...page.querySelectorAll(TP_BODY)].filter(Boolean) : [];
}
const pageOrb = () => document.querySelector('#team-page-content .team-hero-orb');
const ORB_DRIFT = 0.2;

function scrollsSideways(target, root){
  for(let el = target; el && el !== root; el = el.parentElement){
    if(el.scrollWidth > el.clientWidth + 1 && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

function bindPageSwipe(){
  const page = document.getElementById('team-page-content');
  if(pageSwipeBound || !page) return;
  pageSwipeBound = true;
  let pieces = [], orb = null;
  attachDrag(page, {
    slop: MOVE_SLOP,
    ignore: t => t.closest('input, select, textarea') || scrollsSideways(t, page),
    // Clearly sideways only, so a slightly diagonal scroll stays a scroll.
    accept: (axis, { dx, dy }) => !rowMotion && !gesture && axis === 'x'
      && state.swipeOrder.length > 1 && Math.abs(dx) > Math.abs(dy) * 1.2,
    onStart: () => {
      gesture = 'x';
      pieces = swipePieces();
      orb = pageOrb();
      [...pieces, orb].forEach(el => {
        if(!el) return;
        el.getAnimations().forEach(a => a.cancel());
        el.style.transition = 'none';
        el.style.willChange = 'transform, opacity';
      });
    },
    onMove: (axis, { dx }) => {
      const w = window.innerWidth;
      const t = `translateX(${dx.toFixed(1)}px)`;
      const o = (1 - Math.min(0.6, Math.abs(dx) / w * 0.9)).toFixed(3);
      pieces.forEach(el => { el.style.transform = t; el.style.opacity = o; });
      if(orb) orb.style.transform = `translateX(${(dx * ORB_DRIFT).toFixed(1)}px)`;
    },
    onEnd: (axis, { dx, vx, cancelled }) => {
      const dir = cancelled ? 0 : releaseDirection(-dx, -vx, { commit: SWIPE_COMMIT.team, fling: FLING_VELOCITY });
      [...pieces, orb].forEach(el => { if(el) el.style.willChange = ''; });
      if(dir){ leaveTo(state.teamIndex + dir, dir, { dx, vx, pieces, orb }); return; }
      gesture = null;
      pieces.forEach(el => springBack(el, ['transform', 'opacity'], () => { el.style.transform = ''; el.style.opacity = ''; }));
      if(orb) springBack(orb, ['transform'], () => { orb.style.transform = ''; });
      if(pendingRender){ pendingRender = false; renderTeamPage({ refresh: true }); }
    }
  });
}

// Slides the page out toward where the finger was going (`dx` and `vx` are
// where and how fast the drag let go), then shows the team at `index`.
// Quick: the faster the flick, the sooner the next team is up.
function leaveTo(index, dir, { dx = 0, vx = 0, pieces = swipePieces(), orb = pageOrb() } = {}){
  if(!fxOn() || !pieces.length){ gesture = null; swipeTo(index, dir); return; }
  gesture = 'leave';
  const w = window.innerWidth;
  const to = -dir * w * 0.45;
  const speed = Math.max(Math.abs(vx), 1.4);
  const duration = Math.round(Math.min(220, Math.max(110, Math.abs(to - dx) / speed)));
  const fromOpacity = pieces[0].style.opacity || '1';
  const anims = pieces.map(el => el.animate([
    { transform: `translateX(${dx}px)`, opacity: fromOpacity },
    { transform: `translateX(${to}px)`, opacity: 0 }
  ], { duration, easing: 'cubic-bezier(0.3,0.5,0.6,1)', fill: 'forwards' }));
  if(orb) orb.animate([{ transform: `translateX(${dx * ORB_DRIFT}px)` }, { transform: 'none' }], { duration: duration + 200, easing: EASE_OUT });
  const go = () => { gesture = null; pendingRender = false; swipeTo(index, dir); };
  anims[0].finished.then(go, go);
}

// Lets go of a drag: back to the plain layout on --ease-spring, or at once
// without motion. `orb` (the pull) springs its scale back alongside.
function springBack(el, props, reset, orb){
  const spring = fxOn();
  const t = `${SNAP_BACK_MS}ms var(--ease-spring)`;
  el.style.transition = spring ? props.map(p => `${p} ${p === 'opacity' ? '300ms var(--ease-out)' : t}`).join(', ') : 'none';
  if(orb) orb.style.transition = spring ? `transform ${t}, background-color 700ms var(--ease-out)` : 'none';
  reset();
  if(orb) orb.style.transform = '';
  setTimeout(() => {
    el.style.transition = '';
    if(orb) orb.style.transition = '';
  }, spring ? SNAP_BACK_MS + 60 : 0);
}

// Moves to the team at `index` in the swipe order (wrapping), coming in
// from `dir` (1: from the right). Back still returns to where the page was
// opened from; only `tp` in the URL changes.
function swipeTo(index, dir){
  const order = state.swipeOrder;
  if(order.length < 2) return;
  const i = ((index % order.length) + order.length) % order.length;
  const teamKey = order[i];
  state.teamIndex = i;
  if(teamKey === state.teamKey) return;
  state.teamKey = teamKey;
  state.squadFilter = null;
  if(!tabsFor(TEAM_META[teamKey].leagueKey).some(t => t.key === state.activeTab)) state.activeTab = 'schedule';
  updateUrlParam('tp', teamKey);
  window.scrollTo(0, 0);
  fxBeginOpen('swipe', dir);
  renderTeamPage();
  ensureBundle(teamKey);
}
window.teamPageJump = i => {
  if(i === state.teamIndex || gesture || rowMotion) return;
  leaveTo(i, i > state.teamIndex ? 1 : -1);
};

function renderTabBody(){
  const el = document.getElementById('team-page-tab-body');
  if(!el) return;
  const teamKey = state.teamKey;
  const meta = TEAM_META[teamKey];
  if(!meta) return;
  const bundle = liveDataCache[teamKey];
  const fullFeature = FULL_STATS_SQUAD_LEAGUES.includes(meta.leagueKey);
  // Overview is laid out once per open and then filled section by section,
  // so news or a refetched bundle landing doesn't redraw Recent form.
  const shows = state.activeTab === 'schedule' ? `schedule:${teamKey}` : '';
  const same = shows && el.dataset.shows === shows;
  el.dataset.shows = shows;

  if(state.activeTab === 'schedule'){
    if(!same) el.innerHTML = scheduleTabHtml(teamKey);
    writeHtml(document.getElementById('ps-section'), postseasonTeamHtml(teamKey));
    writeHtml(document.getElementById('ptp-section'), pathSectionHtml(teamKey));
    writeHtml(document.getElementById('form-section'), recentFormHtml(teamKey, bundle));
    writeHtml(document.getElementById('news-section'), newsTabHtml(teamKey));
    playPathIn();
    playPathChanges(teamKey);
    playFormGrow();
    ensureNews(teamKey);
    ensureMoreNews(teamKey);
    return;
  }
  if(state.activeTab === 'stats'){
    if(!fullFeature){
      el.innerHTML = `<div class="placeholder-tab">Season stats for this league aren't built yet — check back once it gets its own design pass.</div>`;
      return;
    }
    el.innerHTML = PLAYER_STATS_LEAGUES[meta.leagueKey]
      ? playerStatsTabHtml(teamKey, meta, bundle)
      : statsTabHtml(teamKey, meta, bundle);
    return;
  }
  if(state.activeTab === 'squad'){
    if(!fullFeature){
      el.innerHTML = `<div class="placeholder-tab">A full roster for this league isn't built yet — check back once it gets its own design pass.</div>`;
      return;
    }
    // The group tabs are rebuilt here, so carry their sideways scroll across.
    const oldTabs = el.querySelector('.filter-chips');
    const tabsScroll = oldTabs ? oldTabs.scrollLeft : 0;
    el.innerHTML = squadTabHtml(teamKey);
    const tabs = el.querySelector('.filter-chips');
    if(tabs) tabs.scrollLeft = tabsScroll;
    ensureRoster(teamKey);
    if(PLAYER_STATS_LEAGUES[meta.leagueKey]) ensurePlayerStats(teamKey, meta);
    return;
  }
  if(state.activeTab === 'injuries'){
    el.innerHTML = injuriesTabHtml(meta);
    ensureNflverse();
    return;
  }
}

// ---- Schedule tab ----

function resultRowHtml(teamKey, evt){
  let cls = 'd', label = 'D';
  if(evt.ownScore > evt.oppScore){ cls = 'w'; label = 'W'; }
  else if(evt.ownScore < evt.oppScore){ cls = 'l'; label = 'L'; }
  const meta = TEAM_META[teamKey];
  const gameDetail = GAME_DETAIL_LEAGUES[meta.leagueKey];
  const boxscoreHtml = (gameDetail && evt.id) ? `<div class="boxscore-link" onclick="openGameDetail('${teamKey}', '${evt.id}')">Boxscore <span class="chev">›</span></div>` : '';
  const dateLabel = new Date(evt.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `
    <div class="form-item">
      <div class="form-pill ${cls}">${label}</div>
      <div class="form-detail">
        <span class="opp">${evt.isHome ? 'vs' : 'at'} ${evt.opponentName}</span>
        <span class="meta">${evt.venueName || ''}${evt.venueName ? ' · ' : ''}${dateLabel}</span>
      </div>
      <div class="form-right">
        <div class="form-score">${evt.ownScore}–${evt.oppScore}</div>
        ${boxscoreHtml}
      </div>
    </div>
  `;
}

function upcomingRowHtml(evt){
  const d = new Date(evt.date);
  const day = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const time = evt.timeTbd ? 'TBD' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  // Same "venue · Sep 12" convention resultRowHtml uses for a played
  // game — the day-of-week label on the right (WED) told you nothing
  // about which Wednesday, so the actual date belongs on the meta line
  // too, not just the score side.
  const dateLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `
    <div class="form-item">
      <div class="form-detail">
        <span class="opp">${evt.isHome ? 'vs' : 'at'} ${evt.opponentName}</span>
        <span class="meta">${evt.venueName || ''}${evt.venueName ? ' · ' : ''}${dateLabel}</span>
      </div>
      <div class="form-right">
        <div class="game-card-eyebrow end">${day}</div>
        <div class="form-score">${time}</div>
      </div>
    </div>
  `;
}

// Margin scale for the form strip's bars: goals in EPL and NHL, runs in
// MLB, points elsewhere (docs/delight-plan.md says goals ÷3 and points
// ÷25; hockey and baseball margins are goal-sized, so they scale like EPL).
const FORM_MARGIN_PER = { epl: 3, nhl: 3, mlb: 5 };

function formStripCardHtml(teamKey, meta, recent){
  const gameDetail = GAME_DETAIL_LEAGUES[meta.leagueKey];
  const games = recent.slice(0, 5).reverse().map(evt => {
    const margin = (evt.ownScore ?? 0) - (evt.oppScore ?? 0);
    return {
      result: margin > 0 ? 'w' : (margin < 0 ? 'l' : 'd'),
      score: `${evt.ownScore}–${evt.oppScore}`,
      opp: evt.opponentAbbr || abbrFromName(evt.opponentName),
      margin,
      onclick: gameDetail && evt.id ? `openGameDetail('${teamKey}', '${evt.id}')` : null
    };
  });
  return sectionCardHtml({
    title: 'Recent form',
    subHtml: `Last ${games.length}`,
    html: formStripHtml({ games, per: FORM_MARGIN_PER[meta.leagueKey] || 25 }),
    cls: 'form-card'
  });
}

// Path to points folds to one row; whether it's unfolded is remembered per
// device, the same for every team.
const PATH_OPEN_KEY = 'bx-ptp-open';
let pathOpen = false;
try{ pathOpen = localStorage.getItem(PATH_OPEN_KEY) === '1'; }catch(err){}

function pathSectionHtml(teamKey){
  const path = teamPathToPoints(teamKey);
  return path ? pathToPointsHtml({ ...path, toggle: 'togglePathToPoints', open: pathOpen }) : '';
}
window.togglePathToPoints = () => {
  pathOpen = !pathOpen;
  try{ localStorage.setItem(PATH_OPEN_KEY, pathOpen ? '1' : '0'); }catch(err){}
  const el = document.getElementById('ptp-section');
  if(!el || !el.dataset.team) return;
  const card = el.querySelector('.ptp.fold');
  // Flip the class in place so the fold animates; the next write sees the
  // new markup only if something else changed too.
  if(card){
    card.classList.toggle('open', pathOpen);
    card.querySelector('.ptp-toggle').setAttribute('aria-expanded', String(pathOpen));
    card.querySelector('.ptp-sum').setAttribute('aria-hidden', String(pathOpen));
  }
};

// The last five as a strip of bars; every result row, with its boxscore
// link, is on the Full schedule screen.
function recentFormHtml(teamKey, bundle){
  const meta = TEAM_META[teamKey];
  const sched = bundle && bundle.espnSchedule;
  if(!bundle) return `<div class="loading-note">Loading schedule…</div>`;
  if(!sched) return `<div class="no-live-note">Schedule isn't available for this team yet.</div>`;
  return `${sched.recent.length ? formStripCardHtml(teamKey, meta, sched.recent) : '<div class="loading-note">No results yet.</div>'}
      <div class="more-link-row">
        <span class="boxscore-link center" onclick="openFullSchedule('${teamKey}')">Full schedule <span class="chev">›</span></span>
      </div>`;
}

// The Overview tab's sections, empty: renderTabBody fills each one. During
// an NFL, CFB or NCAA Tournament postseason a team in the field leads with its Postseason
// section (js/postseason.js). Recent form comes next, then Path to points: what this team is worth to its owner,
// rule by rule, with On the line's distance on each (folded to one row
// until it's opened). News follows, and shows even while the schedule is
// loading or unavailable.
function scheduleTabHtml(teamKey){
  return `
    <div id="ps-section"></div>
    <div id="form-section"></div>
    <div id="ptp-section" data-team="${teamKey}"></div>
    <div class="modal-section-title spaced">News</div>
    <div id="news-section"></div>
  `;
}

// The tables the stat strip and Path to points read (division ones too) may
// not be loaded yet; both fill in once they are, if this team is still on
// screen.
// Tables already loaded land before the page's first frame and draw with
// it; ones that need a fetch wait out a row transition (whenSettled).
function ensureTables(teamKey){
  let early = true;
  setTimeout(() => { early = false; });
  loadStandingsTables([TEAM_META[teamKey].leagueKey]).then(() => (early ? f => f() : whenSettled)(() => {
    if(state.teamKey !== teamKey) return;
    renderStatStrip(teamKey);
    playStatsRoll();
    const el = document.getElementById('ptp-section');
    if(el && el.dataset.team === teamKey && writeHtml(el, pathSectionHtml(teamKey))){
      playPathIn();
      playPathChanges(teamKey);
    }
  }));
}

// ---- Live effects (docs/motion-plan.md Phase 4, docs/delight-plan.md Phase 2) ----
// Each open of the page plays its entrance once: the orb blooms, the stat
// strip rolls up, Path to points pops in, the form bars grow. A data
// refresh re-renders the page but plays none of them again, and neither
// does anything that only arrives well after the page opened. `fx.kind`
// is how the page arrived: 'push' (plain), 'row' (grown out of a Home or
// Standings row, which flies the crest and name itself) or 'swipe' (from the team beside it; `fx.dir` is
// the side it came from).
const FX_OPEN_WINDOW_MS = 8000;
const fx = { kind: null, at: 0, done: new Set(), path: null, dir: 0 };

function fxBeginOpen(kind, dir = 0){
  fx.kind = kind;
  fx.at = Date.now();
  fx.done = new Set();
  fx.path = null;
  fx.dir = dir;
}

// True once per open for `key`, and only soon after the open.
function fxFirst(key){
  if(fx.done.has(key) || Date.now() - fx.at > FX_OPEN_WINDOW_MS) return false;
  fx.done.add(key);
  return true;
}

const rise = px => [{ opacity: 0, transform: `translateY(${px}px)` }, { opacity: 1, transform: 'none' }];

// The orb blooms out from behind the crest. On a plain push the crest,
// name and meta rise in too; a row brings the crest and name along
// itself, and a swipe brings the whole hero in from the side.
function playHeroOpen(){
  const hero = document.querySelector('#team-page-content .team-hero');
  if(!hero || fx.kind === 'swipe' || !fxOn() || !fxFirst('hero')) return;
  const orb = hero.querySelector('.team-hero-orb');
  play(orb, [{ transform: 'scale(0.2)' }, { transform: 'none' }], { duration: 1100, delay: 150 });
  play(orb, [{ opacity: 0, offset: 0 }], { duration: 700, delay: 150 });
  if(fx.kind === 'push'){
    play(hero.querySelector('.team-hero-row > :first-child'), [{ opacity: 0, transform: 'scale(0.7) rotate(-6deg)' }, { opacity: 1, transform: 'none' }], { duration: 620, delay: 200, easing: EASE_SPRING });
    play(hero.querySelector('.team-hero-name'), rise(18), { duration: 520, delay: 380 });
  }
  if(fx.kind !== 'row') play(hero.querySelector('.team-hero-meta'), rise(10), { duration: 480, delay: 480 });
}

// A swipe: the new page comes in from the side it was swiped from, picking
// up where the old one slid out (leaveTo), the sections under the hero a
// beat behind it.
function playSwipeIn(){
  if(fx.kind !== 'swipe' || !fxOn() || !fxFirst('swipe')) return;
  const page = document.getElementById('team-page-content');
  const from = fx.dir * Math.min(window.innerWidth * 0.35, 220);
  const slide = [{ opacity: 0, transform: `translateX(${from}px)` }, { opacity: 1, transform: 'none' }];
  play(page.querySelector('.team-hero-row'), slide, { duration: 420 });
  stagger(page.querySelectorAll(TP_BODY), slide, { step: 30, delay: 20, duration: 420 });
}

// The orb cross-fades from the last team's color to this one's (its CSS
// transition does the work; this starts it from the old color).
function crossFadeOrb(fromColor){
  const orb = document.querySelector('#team-page-content .team-hero-orb');
  const bar = document.querySelector('#team-page-content .compact-bar');
  if(!orb || !fromColor || fx.kind !== 'swipe' || !fxOn()) return;
  const to = orb.style.getPropertyValue('--orb');
  if(!to || to === fromColor) return;
  [orb, bar].forEach(el => { if(el) el.style.setProperty('--orb', fromColor); });
  void orb.offsetWidth;
  [orb, bar].forEach(el => { if(el) el.style.setProperty('--orb', to); });
}

// The stat strip's numbers roll up from zero, once its numbers are in;
// the team's points last.
function playStatsRoll(){
  const nums = document.querySelectorAll('#team-page-stats .stat-cell .num');
  if(!nums.length || !fxOn() || !fxFirst('stats')) return;
  nums.forEach(el => rollNumbers(el, { duration: 700, delay: el.parentElement.classList.contains('pts') ? 350 : 300 }));
}

// Path to points: the nodes pop in 90ms apart, and the gold line between
// locked rules draws down after them. Folded, its row of dots pops instead.
function playPathIn(){
  const steps = [...document.querySelectorAll('#ptp-section .ptp-step')];
  if(!steps.length || !fxOn() || !fxFirst('path')) return;
  if(!pathOpen){
    document.querySelectorAll('#ptp-section .ptp-dot').forEach((dot, i) => pop(dot, { from: 0, duration: 420, delay: 200 + i * 50 }));
    return;
  }
  steps.forEach((step, i) => {
    pop(step.querySelector('.ptp-node'), { from: 0, duration: 460, delay: 200 + i * 90 });
    const line = step.querySelector('.ptp-line.gold');
    if(line) play(line, [{ transform: 'scaleY(0)' }, { transform: 'none' }], { duration: 500, delay: 380 + i * 90 });
  });
}

// A rule whose state changed since this page last drew it (In reach →
// Live, say) pops its tag and its points.
function playPathChanges(teamKey){
  const steps = [...document.querySelectorAll('#ptp-section [data-rule]')];
  const now = {};
  steps.forEach(r => { now[r.dataset.rule] = r.dataset.state; });
  const prev = fx.path && fx.path.team === teamKey ? fx.path.states : null;
  fx.path = { team: teamKey, states: now };
  if(!prev || !fxOn()) return;
  steps.forEach(r => {
    const was = prev[r.dataset.rule];
    if(!was || was === r.dataset.state) return;
    play(r.querySelector('.status-tag'), [{ opacity: 0.4, transform: 'scale(1.25)' }, { opacity: 1, transform: 'none' }], { duration: 380, easing: EASE_SPRING });
    pop(r.querySelector('.ptp-node'), { scale: 1.3, duration: 480 });
    pop(r.querySelector('.ptp-pts'), { scale: 1.35, duration: 480 });
  });
}

// Recent form: each bar grows out of the midline, 60ms apart.
function playFormGrow(){
  const bars = document.querySelectorAll('#team-page-tab-body .fs-bar > i');
  if(!bars.length || !fxOn() || !fxFirst('form')) return;
  bars.forEach((bar, i) => play(bar, [{ transform: 'scaleY(0)' }, { transform: 'none' }], { duration: 600, delay: 300 + i * 60, easing: EASE_SPRING }));
}

// ---- News (a section on the Overview tab, not its own tab) ----

function timeAgo(iso){
  if(!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const hrs = Math.round(diffMs / 3600000);
  if(hrs < 1) return 'Just now';
  if(hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function newsSkeletonHtml(){
  const widths = [['88%', '54%', '72%'], ['80%', '48%'], ['70%', '60%', '40%']];
  return widths.map((lines, i) => `
    <div class="news-card">
      ${lines.map((w, j) => `<div class="skel-bar" style="width:${w}; margin-top:${j ? '8px' : '0'}; animation-delay:${(i * 0.1 + j * 0.06).toFixed(2)}s;"></div>`).join('')}
      <div class="skel-bar meta" style="width:32%; margin-top:12px; animation-delay:${(i * 0.1 + 0.2).toFixed(2)}s;"></div>
    </div>
  `).join('');
}

function newsEmptyHtml(teamKey, meta, isError){
  return `
    <div class="empty-state">
      ${EMPTY_ICON_SVG}
      <div class="title">${isError ? 'Couldn’t load news' : 'No news yet'}</div>
      <div class="body">${isError
        ? 'Something went wrong reaching ESPN — try again in a moment.'
        : `ESPN hasn't published anything on ${meta.name} today. Match reports usually land within an hour of full time.`}</div>
      <span class="boxscore-link" onclick="retryTeamPageNews('${teamKey}')">Check again</span>
    </div>
  `;
}

function newsTabHtml(teamKey){
  const meta = TEAM_META[teamKey];
  const entry = newsCache[teamKey];
  if(!entry || entry.status === 'loading') return newsSkeletonHtml();
  if(entry.status === 'error') return newsEmptyHtml(teamKey, meta, true);
  if(entry.status === 'empty' || !entry.items.length) return newsEmptyHtml(teamKey, meta, false) + moreNewsHtml(teamKey);
  return entry.items.slice(0, 4).map(a => `
    <div class="news-card" onclick="window.open('${(a.link || '').replace(/'/g, '&#39;')}', '_blank')">
      <div class="headline">${a.headline}</div>
      <div class="news-meta">ESPN <span class="news-dot">·</span> ${timeAgo(a.published)}</div>
    </div>
  `).join('') + `<div class="news-footer-note">Headlines via ESPN team news</div>` + moreNewsHtml(teamKey);
}

// Stories from beyond ESPN, under the ESPN ones. Nothing at all when the
// worker has none for this team yet.
function moreNewsHtml(teamKey){
  const stories = (moreNewsCache[teamKey] || []).filter(a => safeStoryUrl(a.url)).slice(0, 4);
  if(!stories.length) return '';
  return `<div class="modal-section-title spaced">More news</div>` + stories.map(a => `
    <a class="news-card link" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">
      <div class="headline">${escapeHtml(a.title)}</div>
      <div class="news-meta">${escapeHtml(a.source || 'News')} <span class="news-dot">·</span> ${timeAgo(a.at)}</div>
    </a>
  `).join('') + `<div class="news-footer-note">More headlines via Perigon</div>`;
}

// One shared read per league (js/news-more.js); repaints just the news
// section when it lands, and only if something new arrived for this team.
function ensureMoreNews(teamKey){
  const meta = TEAM_META[teamKey];
  if(!meta) return;
  fetchMoreNewsCached(meta.leagueKey).then(teams => {
    const stories = teams && teams[teamKey];
    if(!stories || !stories.length || stories === moreNewsCache[teamKey]) return;
    moreNewsCache[teamKey] = stories;
    if(state.teamKey === teamKey && state.activeTab === 'schedule') writeHtml(document.getElementById('news-section'), newsTabHtml(teamKey));
  });
}

// Each tab's fetch repaints the tab when it settles, and painting asks
// for anything missing — so a failed fetch waits out retryPending
// (js/utils.js) instead of being retried by its own repaint in a loop.
function ensureNews(teamKey){
  const meta = TEAM_META[teamKey];
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(!row || !flat){ newsCache[teamKey] = { status: 'error', items: [] }; return; }
  if(newsCache[teamKey] && (newsCache[teamKey].status !== 'error' || retryPending(newsCache[teamKey]))) return;

  newsCache[teamKey] = { status: 'loading', items: [] };
  fetchEspnTeamNews(flat.sportPath, row.id).then(items => {
    newsCache[teamKey] = items ? { status: items.length ? 'ready' : 'empty', items } : { status: 'error', items: [], failedAt: Date.now() };
    // Just the news, so the sections above it keep their entrance.
    if(state.teamKey === teamKey && state.activeTab === 'schedule') writeHtml(document.getElementById('news-section'), newsTabHtml(teamKey));
  });
}
window.retryTeamPageNews = teamKey => {
  delete newsCache[teamKey];
  renderTabBody();
  ensureNews(teamKey);
};

// ---- Stats tab ----

// League-specific 2×2 tile sets. EPL's team-statistics endpoint returns
// an empty `results: {}` for every soccer club (verified live,
// 2026-09-17 — see fetchEspnTeamStatistics's header comment), so its
// tiles are sourced from the standings row's goalsFor/goalsAgainst/
// goalDifference/ppg instead of a second fetch — no equivalent for
// "clean sheets"/"possession" exists anywhere in ESPN's site API for
// soccer, so those two design-spec'd cells are swapped for what's
// actually available.
function statsTilesHtml(teamKey, meta){
  if(meta.leagueKey === 'epl'){
    const row = findEspnEplRow(meta);
    if(!row) return null;
    // Points-per-game computed here, not read off ESPN's own `ppg` stat —
    // that field comes back 0 for every club, verified live (2026-09-17)
    // against several teams with real nonzero points, same class of gap
    // as the empty /statistics response for soccer (see
    // fetchEspnTeamStatistics's header comment).
    const ppg = row.gamesPlayed ? (row.points / row.gamesPlayed).toFixed(2) : '—';
    return [
      { num: row.goalsFor ?? '—', lbl: 'Goals For' },
      { num: row.goalsAgainst ?? '—', lbl: 'Goals Against' },
      { num: (row.goalDifference ?? 0) >= 0 ? `+${row.goalDifference ?? 0}` : row.goalDifference, lbl: 'Goal Diff' },
      { num: ppg, lbl: 'Pts / Game' }
    ];
  }

  const entry = statsCache[teamKey];
  if(!entry || entry.status !== 'ready') return null;
  return entry.tiles;
}

function statsTabHtml(teamKey, meta, bundle){
  const tiles = statsTilesHtml(teamKey, meta);
  const splitHtml = homeAwaySplitHtml(bundle);

  if(meta.leagueKey !== 'epl' && !statsCache[teamKey]) ensureStats(teamKey, meta);
  const noteHtml = seasonNoteHtml(meta, null);

  if(!tiles){
    const entry = statsCache[teamKey];
    const body = (entry && entry.status === 'error')
      ? `<div class="no-live-note">Season stats aren't available for this team right now.</div>`
      : `<div class="loading-note">Loading season stats…</div>`;
    return noteHtml + body + splitHtml;
  }

  return `
    ${noteHtml}
    <div class="stat-grid">
      ${tiles.map(t => `<div class="stat-tile"><div class="num">${t.num}</div><div class="lbl">${t.lbl}</div></div>`).join('')}
    </div>
    ${splitHtml}
  `;
}

function ensureStats(teamKey, meta){
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(!row || !flat){ statsCache[teamKey] = { status: 'error', tiles: null }; return; }
  statsCache[teamKey] = { status: 'loading', tiles: null };
  fetchEspnTeamStatistics(flat.sportPath, row.id).then(byName => {
    statsCache[teamKey] = byName ? { status: 'ready', tiles: buildStatTiles(meta, byName) } : { status: 'error', tiles: null };
    if(state.teamKey === teamKey && state.activeTab === 'stats') renderTabBody();
  });
}

// NFL/MLB's per-game "allowed"/differential cells come from the
// standings row (js/standings-nfl.js's findEspnNflRow, js/standings-mlb.js's
// findEspnMlbRow) rather than the /statistics payload — that endpoint
// only carries this team's own offensive/defensive counting stats
// (tackles, sacks, at-bats, etc.), never an opponent-facing figure like
// points allowed (verified live, 2026-09-17: no such field exists
// anywhere in its response for either league).
function buildStatTiles(meta, byName){
  const val = name => byName[name] ? byName[name].displayValue : null;
  if(meta.leagueKey === 'nfl'){
    const row = findEspnNflRow(meta);
    const games = row ? (row.wins || 0) + (row.losses || 0) + (row.ties || 0) : 0;
    const ptsAllowed = (row && games) ? (row.pointsAgainst / games).toFixed(1) : '—';
    const turnover = byName.turnOverDifferential ? byName.turnOverDifferential.value : null;
    return [
      { num: val('totalPointsPerGame') ?? '—', lbl: 'Pts / Game' },
      { num: ptsAllowed, lbl: 'Pts Allowed' },
      { num: val('yardsPerGame') ?? '—', lbl: 'Yds / Game' },
      { num: turnover != null ? (turnover >= 0 ? `+${turnover}` : turnover) : '—', lbl: 'Turnover Diff' }
    ];
  }
  if(meta.leagueKey === 'mlb'){
    const row = findEspnMlbRow(meta);
    const diff = row ? row.pointDifferential : null;
    return [
      { num: val('avg') ?? '—', lbl: 'Team AVG' },
      { num: val('ERA') ?? '—', lbl: 'Team ERA' },
      { num: val('homeRuns') ?? '—', lbl: 'Home Runs' },
      { num: diff != null ? (diff >= 0 ? `+${diff}` : diff) : '—', lbl: 'Run Diff' }
    ];
  }
  return [];
}

function homeAwaySplitHtml(bundle){
  const sched = bundle && bundle.espnSchedule;
  if(!sched) return '';
  const played = sched.recent;
  // A bare "0-0 / 0-0" card says nothing — e.g. every NBA/College
  // Basketball team before its first game of the season.
  if(!played.length) return '';
  const split = { home: { w: 0, l: 0, d: 0 }, away: { w: 0, l: 0, d: 0 } };
  played.forEach(evt => {
    const side = evt.isHome ? split.home : split.away;
    if(evt.ownScore > evt.oppScore) side.w++;
    else if(evt.ownScore < evt.oppScore) side.l++;
    else side.d++;
  });
  const label = s => s.d ? `${s.w}-${s.d}-${s.l}` : `${s.w}-${s.l}`;
  return `
    <div class="modal-section-title spaced">Home / away split</div>
    <div class="split-card">
      <div class="split-row"><div class="split-label">Home</div><div class="split-values"><span class="split-record">${label(split.home)}</span></div></div>
      <div class="split-row"><div class="split-label">Away</div><div class="split-values"><span class="split-record">${label(split.away)}</span></div></div>
    </div>
  `;
}

// ---- Player-stats leagues (NBA/NHL/WNBA/CFB/College Basketball) ----

// One fetchEspnTeamPlayerStats call (js/espn.js) feeds these leagues'
// Stats tab (team tiles + team leaders) and the per-player stat line on
// their Roster tab. Stat names below are ESPN's own, verified live
// (2026-09-22) against each league's payload.
const statOf = (stats, name) => (stats && stats[name]) || null;
const dv = (stats, name) => { const s = statOf(stats, name); return s ? s.displayValue : null; };
const nv = (stats, name) => { const s = statOf(stats, name); return s && typeof s.value === 'number' ? s.value : null; };
const signed = n => n == null ? '—' : (n > 0 ? `+${n}` : String(n));

// Leaders need a minimum-games floor for per-game/percentage stats —
// otherwise a player with 2 garbage-time games at 100% tops "Save %".
// A quarter of the busiest player's games in that same group is loose
// enough to keep real rotation players and drop cameo appearances.
function qualified(players, gamesStat){
  if(!gamesStat) return players;
  const max = players.reduce((m, p) => Math.max(m, nv(p.stats, gamesStat) || 0), 0);
  return players.filter(p => (nv(p.stats, gamesStat) || 0) >= max * 0.25);
}

const BASKETBALL = {
  tiles: t => [
    { num: dv(t, 'avgPoints') ?? '—', lbl: 'Pts / Game' },
    { num: dv(t, 'avgRebounds') ?? '—', lbl: 'Reb / Game' },
    { num: dv(t, 'avgAssists') ?? '—', lbl: 'Ast / Game' },
    { num: dv(t, 'fieldGoalPct') != null ? `${dv(t, 'fieldGoalPct')}%` : '—', lbl: 'FG %' }
  ],
  leaders: [
    { group: 'game', stat: 'avgPoints', abbr: 'PTS', games: 'gamesPlayed' },
    { group: 'game', stat: 'avgRebounds', abbr: 'REB', games: 'gamesPlayed' },
    { group: 'game', stat: 'avgAssists', abbr: 'AST', games: 'gamesPlayed' },
    { group: 'game', stat: 'avgSteals', abbr: 'STL', games: 'gamesPlayed' },
    { group: 'game', stat: 'avgBlocks', abbr: 'BLK', games: 'gamesPlayed' }
  ],
  leaderUnit: 'per game',
  statLine: s => dv(s, 'avgPoints') == null ? null : {
    primary: `${dv(s, 'avgPoints')} PPG`,
    secondary: `${dv(s, 'avgRebounds') ?? '0'} RPG · ${dv(s, 'avgAssists') ?? '0'} APG`
  },
  sortKey: (p, s) => nv(s, 'avgPoints')
};

// NHL's skater group comes back named "team" (ESPN's own label for it —
// "Team Statistics"), goalies as "goalkeeping".
const NHL = {
  tiles: t => {
    const games = nv(t, 'games');
    const perGame = name => (games && nv(t, name) != null) ? (nv(t, name) / games).toFixed(2) : '—';
    return [
      { num: perGame('goals'), lbl: 'Goals / Game' },
      { num: dv(t, 'avgGoalsAgainst') ?? '—', lbl: 'GA / Game' },
      { num: dv(t, 'shootingPct') != null ? `${dv(t, 'shootingPct')}%` : '—', lbl: 'Shooting %' },
      { num: dv(t, 'savePct') ?? '—', lbl: 'Save %' }
    ];
  },
  leaders: [
    { group: 'team', stat: 'points', abbr: 'PTS' },
    { group: 'team', stat: 'goals', abbr: 'G' },
    { group: 'team', stat: 'assists', abbr: 'A' },
    { group: 'team', stat: 'plusMinus', abbr: '+/-', format: v => signed(v) },
    { group: 'goalkeeping', stat: 'wins', abbr: 'W' },
    { group: 'goalkeeping', stat: 'savePct', abbr: 'SV%', games: 'games' }
  ],
  leaderUnit: null,
  statLine: (s, p) => {
    if(p.positionAbbr === 'G'){
      if(dv(s, 'savePct') == null) return null;
      return {
        primary: `${dv(s, 'savePct')} SV%`,
        secondary: `${dv(s, 'wins') ?? 0}-${dv(s, 'losses') ?? 0}-${dv(s, 'overtimeLosses') ?? 0} · ${dv(s, 'avgGoalsAgainst') ?? '—'} GAA`
      };
    }
    if(dv(s, 'points') == null) return null;
    return { primary: `${dv(s, 'points')} PTS`, secondary: `${dv(s, 'goals') ?? 0}G · ${dv(s, 'assists') ?? 0}A` };
  },
  sortKey: (p, s) => p.positionAbbr === 'G' ? nv(s, 'games') : nv(s, 'points')
};

// Position order within each CFB roster group (ESPN's abbreviations) —
// same idea as NFL_POSITION_ORDER below, but CFB has no nflverse depth
// chart to sort by within a position, so production does that instead.
const CFB_POSITION_ORDER = ['QB', 'RB', 'FB', 'WR', 'TE', 'OL', 'OT', 'G', 'C', 'DE', 'DT', 'DL', 'LB', 'CB', 'S', 'DB', 'PK', 'K', 'P', 'LS'];

function cfbStatLine(s, p){
  const pos = p.positionAbbr;
  const nonzero = (name, label) => (nv(s, name) || 0) > 0 ? `${dv(s, name)} ${label}` : null;
  if(pos === 'QB' && dv(s, 'passingYards') != null){
    return { primary: `${dv(s, 'passingYards')} YDS`, secondary: `${dv(s, 'passingTouchdowns') ?? 0} TD · ${dv(s, 'interceptions') ?? 0} INT` };
  }
  if((pos === 'RB' || pos === 'FB') && dv(s, 'rushingYards') != null){
    return { primary: `${dv(s, 'rushingYards')} YDS`, secondary: `${dv(s, 'rushingAttempts') ?? 0} CAR · ${dv(s, 'rushingTouchdowns') ?? 0} TD` };
  }
  if((pos === 'WR' || pos === 'TE') && dv(s, 'receivingYards') != null){
    return { primary: `${dv(s, 'receivingYards')} YDS`, secondary: `${dv(s, 'receptions') ?? 0} REC · ${dv(s, 'receivingTouchdowns') ?? 0} TD` };
  }
  if((pos === 'PK' || pos === 'K') && dv(s, 'fieldGoalsMade') != null){
    return { primary: `${dv(s, 'fieldGoalsMade')}/${dv(s, 'fieldGoalAttempts') ?? 0} FG`, secondary: `${dv(s, 'extraPointsMade') ?? 0}/${dv(s, 'extraPointAttempts') ?? 0} XP` };
  }
  if(pos === 'P' && dv(s, 'grossAvgPuntYards') != null){
    return { primary: `${dv(s, 'grossAvgPuntYards')} AVG`, secondary: `${dv(s, 'punts') ?? 0} punts` };
  }
  if(p.group === 'Defense' && dv(s, 'totalTackles') != null){
    const extras = [nonzero('sacks', 'SACK'), nonzero('interceptions', 'INT')].filter(Boolean);
    return { primary: `${dv(s, 'totalTackles')} TKL`, secondary: extras.join(' · ') };
  }
  return null;
}

const CFB = {
  tiles: t => [
    { num: dv(t, 'totalPointsPerGame') ?? '—', lbl: 'Pts / Game' },
    { num: dv(t, 'yardsPerGame') ?? '—', lbl: 'Yds / Game' },
    { num: signed(nv(t, 'turnOverDifferential')), lbl: 'Turnover Diff' },
    { num: nv(t, 'thirdDownConvPct') != null ? `${nv(t, 'thirdDownConvPct').toFixed(1)}%` : '—', lbl: '3rd Down %' }
  ],
  leaders: [
    { group: 'passing', stat: 'passingYards', abbr: 'PASS', detail: s => `${dv(s, 'passingTouchdowns') ?? 0} TD · ${dv(s, 'interceptions') ?? 0} INT` },
    { group: 'rushing', stat: 'rushingYards', abbr: 'RUSH', detail: s => `${dv(s, 'rushingTouchdowns') ?? 0} TD` },
    { group: 'receiving', stat: 'receivingYards', abbr: 'REC', detail: s => `${dv(s, 'receptions') ?? 0} rec · ${dv(s, 'receivingTouchdowns') ?? 0} TD` },
    { group: 'defensive', stat: 'totalTackles', abbr: 'TKL' },
    { group: 'defensive', stat: 'sacks', abbr: 'SACK' },
    { group: 'defensive', stat: 'interceptions', abbr: 'INT' }
  ],
  leaderUnit: null,
  statLine: cfbStatLine,
  sortKey: (p, s) => {
    const pos = p.positionAbbr;
    if(pos === 'QB') return nv(s, 'passingYards');
    if(pos === 'RB' || pos === 'FB') return nv(s, 'rushingYards');
    if(pos === 'WR' || pos === 'TE') return nv(s, 'receivingYards');
    if(pos === 'PK' || pos === 'K') return nv(s, 'fieldGoalsMade');
    return nv(s, 'totalTackles');
  },
  positionOrder: CFB_POSITION_ORDER
};

const PLAYER_STATS_LEAGUES = { nba: BASKETBALL, wnba: BASKETBALL, mcbb: BASKETBALL, nhl: NHL, cfb: CFB };

function ensurePlayerStats(teamKey, meta){
  if(playerStatsCache[teamKey] && (playerStatsCache[teamKey].status !== 'error' || retryPending(playerStatsCache[teamKey]))) return;
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(!row || !flat){ playerStatsCache[teamKey] = { status: 'error', data: null }; return; }
  playerStatsCache[teamKey] = { status: 'loading', data: null };
  fetchEspnTeamPlayerStats(flat.sportPath, row.id).then(data => {
    playerStatsCache[teamKey] = data ? { status: 'ready', data } : { status: 'error', data: null, failedAt: Date.now() };
    if(state.teamKey === teamKey && (state.activeTab === 'stats' || state.activeTab === 'squad')) renderTabBody();
  });
}

// Two different reasons a Stats tab isn't this season's scoring numbers,
// both flagged with the shared .prior-season-note (see
// PRIOR_SEASON_DISPLAY_LEAGUES in js/data.js): the league's drafted
// season hasn't started (MLB/WNBA — live, but non-scoring), or ESPN is
// serving last season because the current one hasn't tipped off yet
// (NBA/NHL/College Basketball each preseason).
function seasonNoteHtml(meta, data){
  if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(meta.leagueKey)){
    return `<div class="prior-season-note">Showing the '26 season, still in progress — points won't count until the '27 season.</div>`;
  }
  if(data && data.isPriorSeason){
    return `<div class="prior-season-note">Showing last season (${data.seasonLabel}) — the new season hasn't started yet.</div>`;
  }
  return '';
}

function leaderRowsHtml(cfg, data){
  return cfg.leaders.map(l => {
    const players = qualified(data.groups[l.group] || [], l.games).filter(p => nv(p.stats, l.stat) != null);
    if(!players.length) return '';
    const top = players.reduce((best, p) => nv(p.stats, l.stat) > nv(best.stats, l.stat) ? p : best);
    const value = l.format ? l.format(nv(top.stats, l.stat)) : dv(top.stats, l.stat);
    const sub = [top.position, l.detail ? l.detail(top.stats) : cfg.leaderUnit].filter(Boolean).join(' · ');
    return `
      <div class="player-row">
        <div class="number-chip leader-chip">${l.abbr}</div>
        <div class="player-main">
          <div class="player-name">${top.name}</div>
          <div class="player-sub">${sub}</div>
        </div>
        <div class="leader-value">${value}</div>
      </div>
    `;
  }).join('');
}

function playerStatsTabHtml(teamKey, meta, bundle){
  const cfg = PLAYER_STATS_LEAGUES[meta.leagueKey];
  const splitHtml = homeAwaySplitHtml(bundle);
  ensurePlayerStats(teamKey, meta);

  const entry = playerStatsCache[teamKey];
  if(!entry || entry.status !== 'ready'){
    const body = (entry && entry.status === 'error')
      ? `<div class="no-live-note">Season stats aren't available for this team right now.</div>`
      : `<div class="loading-note">Loading season stats…</div>`;
    return seasonNoteHtml(meta, null) + body + splitHtml;
  }

  const data = entry.data;
  const leadersHtml = leaderRowsHtml(cfg, data);
  return `
    ${seasonNoteHtml(meta, data)}
    <div class="stat-grid">
      ${cfg.tiles(data.teamTotals).map(t => `<div class="stat-tile"><div class="num">${t.num}</div><div class="lbl">${t.lbl}</div></div>`).join('')}
    </div>
    ${leadersHtml ? `<div class="modal-section-title spaced">Team leaders</div>${leadersHtml}` : ''}
    <div class="news-footer-note">${data.seasonLabel ? data.seasonLabel + ' · ' : ''}Stats via ESPN</div>
    ${splitHtml}
  `;
}

// Roster order for these leagues: most productive first (sortKey), then
// players with no stats yet (rookies/new signings — or everyone, if the
// stats call failed) by jersey. CFB additionally keeps positions
// together first (positionOrder), the way NFL's roster does. Groups
// themselves stay in fetched order (stable sort, same as sortNflRoster).
function sortPlayerStatsRoster(items, meta){
  const cfg = PLAYER_STATS_LEAGUES[meta.leagueKey];
  const entry = playerStatsCache[state.teamKey];
  const byAthlete = (entry && entry.data && entry.data.byAthlete) || {};
  const jerseyOf = p => parseInt(p.jersey, 10) || 999;
  const posRank = p => {
    if(!cfg.positionOrder) return 0;
    const idx = cfg.positionOrder.indexOf(p.positionAbbr);
    return idx === -1 ? cfg.positionOrder.length : idx;
  };
  return [...items].sort((a, b) => {
    if(a.group !== b.group) return 0;
    const posDiff = posRank(a) - posRank(b);
    if(posDiff) return posDiff;
    const ka = cfg.sortKey(a, byAthlete[String(a.id)]), kb = cfg.sortKey(b, byAthlete[String(b.id)]);
    if(ka != null && kb != null && ka !== kb) return kb - ka;
    if(ka != null && kb == null) return -1;
    if(ka == null && kb != null) return 1;
    return jerseyOf(a) - jerseyOf(b);
  });
}

function playerStatLineFor(p, meta){
  const cfg = PLAYER_STATS_LEAGUES[meta.leagueKey];
  if(!cfg) return null;
  const entry = playerStatsCache[state.teamKey];
  const stats = entry && entry.data && entry.data.byAthlete[String(p.id)];
  return stats ? cfg.statLine(stats, p) : null;
}

// ---- Squad tab ----

// A player's real production this season (goals+assists) — null when
// ESPN has no per-player stats for this league (NFL/MLB, see
// fetchEspnTeamRoster in js/espn.js) or this player hasn't featured yet.
function goalContribution(p){
  if(p.goals === null && p.assists === null) return null;
  return (p.goals || 0) + (p.assists || 0);
}

// Real report_status ('Out'/'Doubtful'/'Questionable', from nflverse's
// injury report — js/nflverse.js) when it's available for this player,
// falling back to ESPN's plain injured boolean (see fetchEspnTeamRoster
// in js/espn.js) for every league nflverse doesn't cover, or for an NFL
// player hurt badly enough to be off the roster's injury report cadence
// entirely (e.g. season-ending IR from before this week's report).
function injuryTagHtml(p, meta){
  const status = meta.leagueKey === 'nfl' ? nflverseInjuryStatus(p, meta) : null;
  if(status) return `<span class="player-tag ${status.toLowerCase()}">${status}</span>`;
  return p.injured ? `<span class="player-tag out">Out</span>` : '';
}

function playerRowHtml(p, meta){
  const tagsHtml = injuryTagHtml(p, meta);
  const contribution = goalContribution(p);
  const line = playerStatLineFor(p, meta);
  let statHtml = '';
  if(line) statHtml = `<div class="player-stat">${line.primary}${line.secondary ? `<div class="sub">${line.secondary}</div>` : ''}</div>`;
  else if(contribution !== null) statHtml = `<div class="player-stat">${p.goals || 0}G · ${p.assists || 0}A</div>`;
  // Class year for college rosters (no age there), age for pro ones.
  const detail = p.classYear || p.age;
  return `
    <div class="player-row">
      <div class="number-chip">${p.jersey || '—'}</div>
      <div class="player-main">
        <div class="player-name">${p.name}${tagsHtml}</div>
        <div class="player-sub">${p.position}${detail ? ' · ' + detail : ''}</div>
      </div>
      ${statHtml}
    </div>
  `;
}

// Ranks by real season output (goals + assists, ties broken by
// appearances as a "still gets picked" signal) instead of roster order —
// ESPN's own soccer roster sorts goalkeepers first, so the old first-4
// slice was showing a team's keepers instead of its stars (e.g.
// Manchester City's, ahead of Erling Haaland — confirmed live
// 2026-09-19). Falls back to plain roster order when a league has no
// per-player stats at all (goals/assists both null for every player —
// NFL/MLB today), rather than sorting everyone to a tied last place.
function keyPlayers(items){
  if(!items.some(p => goalContribution(p) !== null)) return items.slice(0, 4);
  return [...items].sort((a, b) => {
    const diff = (goalContribution(b) || 0) - (goalContribution(a) || 0);
    return diff || ((b.appearances || 0) - (a.appearances || 0));
  }).slice(0, 4);
}

// The coarse groups worth filtering a full roster by — NFL/MLB's own
// roster grouping (Offense/Defense/Special Teams, Pitchers/Catchers/...),
// not each player's fine position (16 distinct values on an NFL roster,
// which would make an unreadably long chip row — see
// fetchEspnTeamRoster in js/espn.js). In roster order, not alphabetized,
// so "Offense" leads for NFL the same way it does in the unfiltered list.
function squadPositionGroups(items){
  const groups = [];
  items.forEach(p => { if(p.group && !groups.includes(p.group)) groups.push(p.group); });
  return groups;
}

export function setSquadFilter(key){
  state.squadFilter = key;
  renderTabBody();
  const tabs = document.querySelector('#team-page-tab-body .filter-chips');
  if(tabs) revealActiveTab(tabs);
}
window.setSquadFilter = setSquadFilter;

// Fine-position display order — still the primary grouping key (see
// sortNflRoster below): it keeps every "Wide Receiver" together, every
// "Guard" together, etc., which nflverse's own per-formation pos_slot
// numbering doesn't reliably do (see bestDepthChartRank's comment).
// This alone used to be the ONLY ordering available at all (ESPN's own
// /teams/{id}/depthchart returns an empty {} for every team, confirmed
// live 2026-09-19 — no structured depth data anywhere in its hidden
// API); nflverse now supplies the real starter-vs-backup order *within*
// each of these positions instead of roster/jersey order.
const NFL_POSITION_ORDER = [
  'Quarterback', 'Running Back', 'Fullback', 'Wide Receiver', 'Tight End',
  'Offensive Tackle', 'Guard', 'Center',
  'Defensive End', 'Defensive Tackle', 'Linebacker', 'Cornerback', 'Safety',
  'Place Kicker', 'Punter', 'Long Snapper'
];

function nflPositionRank(position){
  const idx = NFL_POSITION_ORDER.indexOf(position);
  return idx === -1 ? NFL_POSITION_ORDER.length : idx;
}

// Real depth-chart rank (js/nflverse.js's pos_rank — starter=1,
// backup=2, ...) per player, used below to put a team's actual starter
// before its backups within a fine position instead of just roster
// order. NOT sourced from pos_slot's raw ordering, deliberately: a
// player's pos_slot is only a stable index WITHIN one nflverse pos_grp
// (personnel package), not comparable across them — e.g. Detroit's
// "3WR 1TE" package numbers its 3rd-WR slot (8) between the O-line
// (3-7) and QB (9), so sorting fine positions by raw slot number would
// put a backup WR ahead of the starting QB (confirmed live 2026-09-19).
// Grouping by ESPN's own position label first (nflPositionRank below,
// already reliable) and using rank only as the within-position tie-
// break keeps receivers with receivers, linemen with linemen, while
// still surfacing the real starter/backup order nflverse provides.
// Also prefers a player's non-"Special Teams" pos_grp row when they
// have both (e.g. a WR who's also the punt returner) — otherwise a
// receiver's PR/KR special-teams rank would override their actual WR
// depth rank.
function bestDepthChartRank(depthChart){
  const byId = {};
  depthChart.forEach(r => {
    if(!r.espn_id) return;
    const key = String(r.espn_id);
    const isST = r.pos_grp === 'Special Teams';
    const rank = parseInt(r.pos_rank, 10) || 999;
    const existing = byId[key];
    if(!existing || (existing.isST && !isST) || (existing.isST === isST && rank < existing.rank)){
      byId[key] = { rank, isST };
    }
  });
  return byId;
}

// Re-orders each broad group (Offense/Defense/...) by fine position
// (nflPositionRank), then by real depth-chart rank within that
// position — see bestDepthChartRank above for why depth-chart order
// alone isn't enough. Players nflverse doesn't chart at all (deep
// bench, practice squad, IR) fall back to jersey number and sort after
// every charted player at that position. Groups themselves stay in
// place — `a.group !== b.group` returning 0 relies on Array.sort being
// stable, so cross-group order is left exactly as fetched (the active
// roster still comes before Injured Reserve/Practice Squad in "All";
// only the order *inside* each group changes).
function sortNflRoster(items, meta){
  const byId = bestDepthChartRank(getTeamDepthChart(meta));
  const jerseyOf = p => parseInt(p.jersey, 10) || 999;

  return [...items].sort((a, b) => {
    if(a.group !== b.group) return 0;
    const posDiff = nflPositionRank(a.position) - nflPositionRank(b.position);
    if(posDiff) return posDiff;
    const ra = byId[String(a.id)], rb = byId[String(b.id)];
    if(ra && rb) return ra.rank - rb.rank || (jerseyOf(a) - jerseyOf(b));
    if(ra && !rb) return -1;
    if(!ra && rb) return 1;
    return jerseyOf(a) - jerseyOf(b);
  });
}

// The 3 broad NFL roster groups a real depth chart actually covers —
// Injured Reserve/Practice Squad/Suspended stay the plain player-row
// list (see fullRosterHtml below): a depth chart is inherently about
// who plays which role at what order, which doesn't mean anything for
// a player who isn't active.
const NFL_GRID_GROUPS = new Set(['Offense', 'Defense', 'Special Teams']);

// One row per real depth-chart SLOT, not per fine position — a fine
// position can be more than one slot (e.g. a 3-WR personnel package has
// 3 separate receiver slots, each with its own starter/backups; see
// bestDepthChartRank's comment for the same pos_slot-is-per-role point).
// `${pos_grp}|${pos_slot}` is the real per-role key nflverse uses;
// sorted by pos_slot ascending within each pos_grp (there's normally
// just one non-Special-Teams pos_grp per broad group, but the compound
// key keeps this correct if a team ever has more than one personnel
// package charted at once). Rows/cells are built entirely off the
// roster's own `group` field (via the espn_id join), not off nflverse's
// pos_grp text — nflverse's personnel-package names are scheme-specific
// strings ("3WR 1TE", "Base 4-3 D", ...) with no fixed vocabulary to
// pattern-match against, whereas the roster's Offense/Defense/Special
// Teams grouping (js/espn.js's NFL_ROSTER_GROUP_LABELS) is already
// reliable and is what every other grouping in this file uses.
function depthChartRowsFor(groupLabel, items, meta){
  const byEspnId = {};
  items.forEach(p => { byEspnId[String(p.id)] = p; });

  const bySlot = {};
  getTeamDepthChart(meta).forEach(r => {
    const player = byEspnId[String(r.espn_id)];
    if(!player) return;
    const isST = r.pos_grp === 'Special Teams';
    // Special Teams pulls every row nflverse itself charts under
    // "Special Teams", regardless of a player's own primary roster
    // group — a punt/kick returner is almost always a WR/RB on
    // offense first (confirmed live: Detroit's PR/KR slots are filled
    // by Tom Kennedy/Jacob Saylors/Tay Martin/Sione Vaki, all
    // roster-classified as Offense), so gating on roster group here
    // would silently drop every returner slot. Offense/Defense do the
    // opposite — excluding Special Teams rows and gating on the
    // roster's own group — so a returner's PR/KR row doesn't also leak
    // into their Offense grid entry alongside their real WR/RB slot.
    const matches = groupLabel === 'Special Teams' ? isST : (!isST && player.group === groupLabel);
    if(!matches) return;
    const key = `${r.pos_grp}|${r.pos_slot}`;
    const slotOrder = `${r.pos_grp}\u0000${String(parseInt(r.pos_slot, 10) || 0).padStart(3, '0')}`;
    if(!bySlot[key]) bySlot[key] = { label: r.pos_abb || r.pos_name || '', slotOrder, entries: [] };
    bySlot[key].entries.push({ player, rank: parseInt(r.pos_rank, 10) || 999 });
  });

  return Object.values(bySlot)
    .sort((a, b) => a.slotOrder < b.slotOrder ? -1 : (a.slotOrder > b.slotOrder ? 1 : 0))
    .map(row => ({ label: row.label, entries: row.entries.sort((a, b) => a.rank - b.rank) }));
}

function depthChartCellHtml(entry, meta){
  const tag = injuryTagHtml(entry.player, meta);
  return `
    <div class="depth-chart-cell">
      <div class="depth-chart-player"><span class="num">${entry.player.jersey || '—'}</span>${entry.player.name}</div>
      ${tag}
    </div>
  `;
}

// A real position-by-position depth chart grid (position label column
// + one column per depth level, deepest first) instead of a flat
// player list — see depthChartRowsFor above for how rows/columns are
// derived. Columns are padded out to the widest row in this group so
// every row's Nth column lines up (a real depth chart reads as a
// spreadsheet, not a ragged list). Wrapped in an overflow-x scroller
// (same pattern as .filter-chips elsewhere in this app) with the
// position-label column pinned via position:sticky, since a full
// offensive or defensive depth chart is wider than a phone screen.
function depthChartGridHtml(groupLabel, items, meta){
  const rows = depthChartRowsFor(groupLabel, items, meta);
  if(!rows.length) return '';
  const maxCols = rows.reduce((m, r) => Math.max(m, r.entries.length), 1);
  const rowsHtml = rows.map(row => {
    const cells = row.entries.map(e => depthChartCellHtml(e, meta)).join('');
    const pad = '<div class="depth-chart-cell"></div>'.repeat(maxCols - row.entries.length);
    return `<div class="depth-chart-pos">${row.label}</div>${cells}${pad}`;
  }).join('');
  return `
    <div class="depth-chart-wrap">
      <div class="depth-chart" style="grid-template-columns: 42px repeat(${maxCols}, minmax(104px, 1fr));">
        ${rowsHtml}
      </div>
    </div>
  `;
}

// NFL/MLB rosters (50-90 players, no reliable "star" signal to build a
// teaser from — see keyPlayers above) skip the curated-teaser +
// separate full-screen pattern EPL uses below entirely: the whole
// roster is listed right here in the tab, narrowed by the same
// underline tabs as Home and Standings' league filter,
// instead of a "Full roster ›" link off to its own screen. For NFL,
// Offense/Defense/Special Teams render as a real depth-chart grid
// (see depthChartGridHtml) once nflverse's data has loaded; Injured
// Reserve/Practice Squad/Suspended (and everything for MLB, and NFL
// before that data is ready) stay the plain player-row list — a depth
// chart doesn't mean anything for players who aren't active.
function fullRosterHtml(entry, meta){
  const groups = squadPositionGroups(entry.items);
  // No "All" chip — a combined Offense+Defense+Special Teams+IR+...
  // view doesn't read as one coherent thing once Offense/Defense/
  // Special Teams are real depth-chart grids (see depthChartGridHtml)
  // rather than plain rows, so this always shows exactly one group.
  // groups[0] is Offense for NFL (ESPN's own roster group order —
  // squadPositionGroups' comment), so that's the default the first
  // time this renders for a team.
  const filter = groups.includes(state.squadFilter) ? state.squadFilter : groups[0];
  const chips = groups.map(g => {
    return filterTabHtml({ label: g, active: g === filter, onclick: `setSquadFilter('${g.replace(/'/g, '')}')` });
  }).join('');

  const hasDepthChart = meta.leagueKey === 'nfl' && getTeamDepthChart(meta).length > 0;

  const sectionHtml = group => {
    if(hasDepthChart && NFL_GRID_GROUPS.has(group)){
      const grid = depthChartGridHtml(group, entry.items, meta);
      if(grid) return grid;
    }
    const base = meta.leagueKey === 'nfl' ? sortNflRoster(entry.items, meta)
      : (PLAYER_STATS_LEAGUES[meta.leagueKey] ? sortPlayerStatsRoster(entry.items, meta) : entry.items);
    return base.filter(p => p.group === group).map(p => playerRowHtml(p, meta)).join('');
  };

  // Stat lines on this tab come from the same fetch as the Stats tab —
  // say which season they are when ESPN is serving last year's.
  const statsEntry = PLAYER_STATS_LEAGUES[meta.leagueKey] ? playerStatsCache[state.teamKey] : null;
  const statsData = statsEntry && statsEntry.data;
  const footer = statsData ? `<div class="news-footer-note spaced">Stats: ${statsData.seasonLabel}${statsData.isPriorSeason ? ' (last season)' : ''}</div>` : '';

  // Basketball rosters (NBA/WNBA/College Basketball) aren't grouped at
  // all — ~15 players reads fine as one list, so no chips there.
  if(!groups.length){
    return entry.items.length ? sectionHtml(null) + footer : `<div class="no-live-note">No players listed.</div>`;
  }

  const body = filter ? (sectionHtml(filter) || `<div class="no-live-note">No players in this group.</div>`) : `<div class="no-live-note">No players in this group.</div>`;

  return `<div class="filter-chips" role="tablist">${chips}</div>${body}${footer}`;
}

function squadTabHtml(teamKey){
  const entry = rosterCache[teamKey];
  const meta = TEAM_META[teamKey];
  if(!entry || entry.status === 'loading') return `<div class="loading-note">Loading squad…</div>`;
  if(entry.status === 'error' || !entry.items.length) return `<div class="no-live-note">Squad list isn't available for this team right now.</div>`;

  if(meta.leagueKey !== 'epl') return fullRosterHtml(entry, meta);

  const top = keyPlayers(entry.items);
  return `
    <div class="modal-section-title">Key players</div>
    ${top.map(p => playerRowHtml(p, meta)).join('')}
    <div class="more-link-row">
      <span class="boxscore-link center" onclick="openFullSquad('${teamKey}')">Full squad <span class="chev">›</span></span>
    </div>
  `;
}

function ensureRoster(teamKey){
  const meta = TEAM_META[teamKey];
  const row = espnTeamRowFor(meta);
  const flat = FLAT_SCHEDULE_LEAGUES[meta.leagueKey];
  if(meta.leagueKey === 'nfl') ensureNflverse();
  if(!row || !flat){ rosterCache[teamKey] = { status: 'error', items: [] }; return; }
  if(rosterCache[teamKey] && (rosterCache[teamKey].status !== 'error' || retryPending(rosterCache[teamKey]))) return;

  rosterCache[teamKey] = { status: 'loading', items: [] };
  fetchEspnTeamRoster(flat.sportPath, row.id).then(items => {
    rosterCache[teamKey] = items ? { status: 'ready', items } : { status: 'error', items: [], failedAt: Date.now() };
    if(state.teamKey === teamKey && state.activeTab === 'squad') renderTabBody();
  });
}

// ---- Injuries tab (NFL only — see TABS above) ----

// One shared fetch covers every NFL team (js/nflverse.js's byTeam
// blobs), so unlike ensureRoster/ensureStats/ensureNews above this
// isn't keyed per team. Guarded the same way those are (bail once
// there's nothing left to do) rather than unconditionally chaining a
// re-render onto every call — renderTabBody() is itself a caller of
// this function (via ensureRoster/the injuries tab), so an unguarded
// version here would re-queue its own .then on every single render,
// forever, the moment both caches are already warm.
let nflverseRenderPending = false;
function ensureNflverse(){
  if(nflverseDepthChartCache.byTeam && nflverseInjuriesCache.byTeam) return;
  if(nflverseRenderPending) return;
  nflverseRenderPending = true;
  const before = [nflverseDepthChartCache.byTeam, nflverseInjuriesCache.byTeam];
  Promise.all([fetchNflverseDepthChartCached(), fetchNflverseInjuriesCached()]).then(() => {
    nflverseRenderPending = false;
    // Nothing new (a fetch failed, or is backing off): repainting would
    // just call back in here.
    if(nflverseDepthChartCache.byTeam === before[0] && nflverseInjuriesCache.byTeam === before[1]) return;
    const meta = TEAM_META[state.teamKey];
    if(meta && meta.leagueKey === 'nfl' && (state.activeTab === 'squad' || state.activeTab === 'injuries')) renderTabBody();
  });
}

const INJURY_STATUS_ORDER = { Out: 0, Doubtful: 1, Questionable: 2 };

function injuryRowHtml(row){
  const status = row.report_status || '';
  const tag = status ? `<span class="player-tag ${status.toLowerCase()}">${status}</span>` : '';
  const injury = row.report_primary_injury || row.practice_primary_injury || '';
  return `
    <div class="player-row">
      <div class="player-main">
        <div class="player-name">${row.full_name}${tag}</div>
        <div class="player-sub">${row.position}${injury ? ' · ' + injury : ''}</div>
      </div>
      <div class="player-stat">${row.practice_status || ''}</div>
    </div>
  `;
}

function injuriesTabHtml(meta){
  if(!nflverseInjuriesCache.byTeam) return `<div class="loading-note">Loading injury report…</div>`;
  const rows = getTeamInjuries(meta);
  if(!rows.length) return `<div class="no-live-note">No injuries reported for ${meta.name} this week.</div>`;

  const sorted = [...rows].sort((a, b) => {
    const oa = a.report_status in INJURY_STATUS_ORDER ? INJURY_STATUS_ORDER[a.report_status] : 3;
    const ob = b.report_status in INJURY_STATUS_ORDER ? INJURY_STATUS_ORDER[b.report_status] : 3;
    return oa - ob;
  });
  return `
    <div class="modal-section-title">This week's injury report</div>
    ${sorted.map(injuryRowHtml).join('')}
  `;
}

// ---- Full Schedule screen ----

export function setFullScheduleFilter(key){
  renderFullSchedule(key);
}
window.setFullScheduleFilter = setFullScheduleFilter;

function renderFullSchedule(filter){
  const el = document.getElementById('team-schedule-content');
  if(!el) return;
  const teamKey = state.teamKey;
  const meta = TEAM_META[teamKey];
  const bundle = liveDataCache[teamKey];
  const sched = bundle && bundle.espnSchedule;

  const chips = ['all', 'results', 'upcoming'].map(key => {
    const label = key === 'all' ? 'All' : (key === 'results' ? 'Results' : 'Upcoming');
    return filterTabHtml({ label, active: key === filter, onclick: `setFullScheduleFilter('${key}')` });
  }).join('');

  let bodyHtml = `<div class="loading-note">Loading schedule…</div>`;
  if(sched){
    const events = [...sched.recent.map(e => ({ ...e, played: true })), ...sched.upcoming.map(e => ({ ...e, played: false }))]
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    const shown = events.filter(e => filter === 'all' || (filter === 'results' && e.played) || (filter === 'upcoming' && !e.played));

    let lastMonth = null;
    bodyHtml = shown.map(evt => {
      const d = new Date(evt.date);
      const month = d.toLocaleDateString('en-US', { month: 'long' }).toUpperCase();
      const monthHtml = month !== lastMonth ? `<div class="standings-group-header">${month}</div>` : '';
      lastMonth = month;
      const rowHtml = evt.played ? resultRowHtml(teamKey, evt) : upcomingRowHtml(evt);
      return monthHtml + rowHtml;
    }).join('') || `<div class="no-live-note">Nothing to show here.</div>`;
  }

  el.innerHTML = `
    <div class="team-page-nav">
      ${backLinkHtml({ label: meta.name, onclick: 'backFromFullScreen()' })}
    </div>
    <div class="page-header compact">
      <h1>Schedule</h1>
      <div class="page-sub">${meta.name}</div>
    </div>
    <div class="filter-chips" role="tablist">${chips}</div>
    <div class="tab-body fit">${bodyHtml}</div>
  `;
}

// ---- Full Squad screen ----
// EPL-only from here down (see squadTabHtml above) — NFL/MLB list their
// whole roster inline in the tab instead (fullRosterHtml above), so this
// screen never opens for them. EPL's own position spread (Goalkeeper/
// Defender/Midfielder/Forward) is small enough that filtering by each
// player's fine `position` reads fine as-is, unlike NFL/MLB's 16/11
// fine-grained values — no coarse `group` needed here.

export function setFullSquadFilter(key){
  renderFullSquad(key);
  const tabs = document.querySelector('#team-squad-content .filter-chips');
  if(tabs) revealActiveTab(tabs);
}
window.setFullSquadFilter = setFullSquadFilter;

function renderFullSquad(filter){
  const el = document.getElementById('team-squad-content');
  if(!el) return;
  const teamKey = state.teamKey;
  const meta = TEAM_META[teamKey];
  const entry = rosterCache[teamKey];

  const groups = ['all', ...new Set((entry && entry.items || []).map(p => p.position).filter(Boolean))];
  const chips = groups.map(g => {
    const label = g === 'all' ? 'All' : g;
    return filterTabHtml({ label, active: g === filter, onclick: `setFullSquadFilter('${g.replace(/'/g, '')}')` });
  }).join('');

  let bodyHtml = `<div class="loading-note">Loading squad…</div>`;
  if(entry && entry.status === 'ready'){
    const shown = filter === 'all' ? entry.items : entry.items.filter(p => p.position === filter);
    bodyHtml = shown.map(p => playerRowHtml(p, meta)).join('') || `<div class="no-live-note">No players in this group.</div>`;
  } else if(entry && entry.status === 'error'){
    bodyHtml = `<div class="no-live-note">Squad list isn't available for this team right now.</div>`;
  }

  // The tabs are rebuilt below, so carry their sideways scroll across.
  const oldTabs = el.querySelector('.filter-chips');
  const tabsScroll = oldTabs ? oldTabs.scrollLeft : 0;
  el.innerHTML = `
    <div class="team-page-nav">
      ${backLinkHtml({ label: meta.name, onclick: 'backFromFullScreen()' })}
    </div>
    <div class="page-header compact">
      <h1>Squad</h1>
      <div class="page-sub">${meta.name}${entry && entry.items.length ? ` · ${entry.items.length} players` : ''}</div>
    </div>
    <div class="filter-chips" role="tablist">${chips}</div>
    <div class="tab-body fit">${bodyHtml}</div>
  `;
  el.querySelector('.filter-chips').scrollLeft = tabsScroll;
  if(!entry) ensureRoster(teamKey);
}
