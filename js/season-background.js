/* ============================================================
   Keeps last season scoring after the next draft. From the September
   draft until last season is recorded in History (js/season-overlap.js
   decides when that is), the app shows the new season, but last
   season's MLB and WNBA are still being played: its leagues still have
   to lock, its Activity still has to log, its points alerts still have
   to go out.

   The app's scoring reads one season per page load (js/season.js), so
   rather than teach every module to hold two, the newest season's page
   loads a hidden copy of the app on the older season
   (index.html?season=<id>&bg=1, IS_SEASON_BACKGROUND). That copy runs
   only the scoring work (js/board.js skips everything else when it's
   set): fresh standings, the season's own postseasons, the lock check
   (js/season-lock.js), one Activity run (js/activity.js, which PUTs the
   older season's own feed and alerts, named for it), and then reports
   back here and is removed.

   - When: 20 seconds after launch and whenever the app comes back to
     the foreground, at most every 30 minutes per device, only while the
     page is the newest season and an older one is in play. Each run is
     cut off after 3 minutes.
   - What it reports (the summary, kept in localStorage for Home and the
     Commissioner page): { id, at, rows: [{ id, rank, total }], open },
     `open` being the leagues still being played (not locked, or locked
     with their postseason still on).
   ============================================================ */
import { LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT } from './data.js';
import { SEASON_IDS, LATEST_SEASON_ID } from './seasons/index.js';
import { ACTIVE_SEASON_ID, IS_SEASON_BACKGROUND, setActiveSeason } from './season.js';
import { previousSeasonInPlay, seasonLabel } from './season-overlap.js';
import { historySeasons } from './history.js';
import { checkSeasonLocks, isLeagueLocked } from './season-lock.js';
import { runActivityDetection } from './activity.js';
import { obRankedRows } from './overall.js';
import { loadBonusInputs } from './compare.js';
import { loadScoringPostseasons, postseasonStillPlaying } from './postseason.js';
import { currentProfileId } from './identity.js';
import { ordinal } from './utils.js';
import { FILTER_CHIP_LABELS } from './league-labels.js';
import { linkRowHtml } from './ui.js';

const FIRST_RUN_DELAY_MS = 20 * 1000;
const RUN_GAP_MS = 30 * 60 * 1000;
const RUN_LIMIT_MS = 3 * 60 * 1000;
// Totals are trusted once two reads this far apart agree (lazy inputs,
// such as a past season's playoff results, are still landing before).
const SETTLE_STEP_MS = 4000;
const SETTLE_TRIES = 12;
const LAST_RUN_KEY = 'bxSeasonBgRun';
const SUMMARY_KEY = 'bxSeasonBgSummary';
const DONE_MESSAGE = 'bx-season-bg-done';

// ---- The newest season's side ----

// The older season still in play, or null (js/season-overlap.js).
export function seasonInPlay(){
  if(ACTIVE_SEASON_ID !== LATEST_SEASON_ID) return null;
  return previousSeasonInPlay({ ids: SEASON_IDS, recorded: historySeasons().map(s => s.id), preDraft: PRE_DRAFT });
}

// What the last background run found for the season in play, or just
// { id } before one has finished on this device. null when none is.
export function inPlaySummary(){
  const id = seasonInPlay();
  if(!id) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(SUMMARY_KEY));
    if(saved && saved.id === id) return saved;
  } catch (e){}
  return { id, rows: null, open: null };
}

let frame = null;
let cutoff = null;
const listeners = new Set();

// fn() whenever a background run reports back; returns an unsubscribe.
export function onSeasonSummary(fn){
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function closeFrame(){
  clearTimeout(cutoff);
  if(frame) frame.remove();
  frame = null;
}

function maybeRun(){
  if(IS_SEASON_BACKGROUND || frame || document.visibilityState === 'hidden') return;
  const id = seasonInPlay();
  if(!id) return;
  try {
    if(Date.now() - (Number(localStorage.getItem(LAST_RUN_KEY)) || 0) < RUN_GAP_MS) return;
    localStorage.setItem(LAST_RUN_KEY, String(Date.now()));
  } catch (e){ return; }
  // ?group= rides along where it's allowed (localhost, Pages previews).
  const query = new URLSearchParams({ season: id, bg: '1' });
  const group = new URLSearchParams(window.location.search).get('group');
  if(group) query.set('group', group);
  frame = document.createElement('iframe');
  frame.hidden = true;
  frame.tabIndex = -1;
  frame.setAttribute('aria-hidden', 'true');
  frame.src = `${window.location.pathname}?${query}`;
  document.body.appendChild(frame);
  cutoff = setTimeout(closeFrame, RUN_LIMIT_MS);
}

window.addEventListener('message', event => {
  if(event.origin !== window.location.origin || !frame || event.source !== frame.contentWindow) return;
  if(!event.data || event.data.type !== DONE_MESSAGE) return;
  const summary = event.data.summary;
  if(summary && summary.id){
    // A run whose totals never held still keeps the last standings shown.
    const before = inPlaySummary();
    if(!summary.rows && before && before.id === summary.id) summary.rows = before.rows;
    try { localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary)); } catch (e){}
  }
  closeFrame();
  listeners.forEach(fn => { try { fn(); } catch (e){ console.warn('[season-background]', e); } });
});

export function startSeasonBackground(){
  if(IS_SEASON_BACKGROUND) return;
  repaintHome();
  onSeasonSummary(repaintHome);
  setTimeout(maybeRun, FIRST_RUN_DELAY_MS);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible') maybeRun();
  });
}

// ---- Home: last season, while it's still being played ----

const leagueNames = keys => keys.map(k => FILTER_CHIP_LABELS[k] || k.toUpperCase()).join(', ');

// Home's stack is js/board.js's, reached through window since board.js
// imports this module. js/history.js repaints it too when History loads
// (a just-recorded season takes this row away).
const repaintHome = () => { if(window.renderHomeStack) window.renderHomeStack(); };

window.openSeasonInPlay = () => {
  const id = seasonInPlay();
  if(id) setActiveSeason(id);
};

// One row on Home, the same LinkRow as the champion's (js/history.js):
// "2026/27 is still being played", where you stand in it and what's left.
// Gone once that season is recorded (the champion row takes over) or the
// new year comes. An item for Home's stack (js/home-stack-math.js).
export function seasonOverlapHomeItem(){
  const summary = inPlaySummary();
  if(!summary) return null;
  const me = summary.rows && summary.rows.find(r => r.id === currentProfileId);
  const pts = n => (n < 0 ? `−${Math.abs(n)}` : String(n));
  const stand = me ? `You’re ${ordinal(me.rank)}, ${pts(me.total)} pts` : '';
  const open = summary.open;
  const left = !open ? '' : !open.length ? 'Every league is done'
    : `${open.length > 2 ? `${open.length} leagues` : leagueNames(open)} still playing`;
  const sub = [stand, left].filter(Boolean).join(' · ');
  const title = `${seasonLabel(summary.id)} is still being played`;
  return { id: 'last-season', tier: 'last-season', title, html: linkRowHtml({ title, sub, go: 'Open', onclick: 'openSeasonInPlay()' }) };
}

// ---- The background copy's side ----

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

async function settledRows(){
  let last = null;
  for(let i = 0; i < SETTLE_TRIES; i++){
    await wait(SETTLE_STEP_MS);
    const rows = obRankedRows().map(r => ({ id: r.id, rank: r.rank, total: r.total }));
    const key = JSON.stringify(rows);
    if(key === last) return rows;
    last = key;
  }
  return null;
}

// The leagues of this season still being played.
function openLeagues(){
  return LEAGUES.map(l => l.key)
    .filter(key => LEAGUE_SCORING[key] && !PRIOR_SEASON_DISPLAY_LEAGUES.includes(key))
    .filter(key => !isLeagueLocked(key) || postseasonStillPlaying(key));
}

// The copy's whole job (js/board.js calls it instead of the normal boot
// once the caches are loaded). `refresh` is board.js's
// refreshStandingsData. Always reports back, even after a failure, so
// the page that loaded it can remove it.
export async function runSeasonBackground(refresh){
  let summary = null;
  try {
    await Promise.allSettled([refresh(), loadScoringPostseasons(), loadBonusInputs()]);
    await checkSeasonLocks();
    const rows = await settledRows();
    // Only once the totals hold still: a half-loaded total would log
    // made-up rank moves (and alert them).
    if(rows) await runActivityDetection(true);
    summary = { id: ACTIVE_SEASON_ID, at: Date.now(), rows, open: openLeagues() };
  } catch (e){
    console.warn('[season-background]', e);
  } finally {
    try { window.parent.postMessage({ type: DONE_MESSAGE, summary }, window.location.origin); } catch (e){}
  }
}
