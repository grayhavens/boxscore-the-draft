/* ============================================================
   Activity: a log of RULE CHANGES, not game results — "since you last
   looked, who moved on a scoring line". An event only exists when a team
   crosses a line that scores (takes/loses a division lead or best record
   in its conference, moves into/out of last place or worst record,
   clinches the playoffs), the +5 league bonus flips between drafters, a
   league locks (its Live points become Locked: type 'lock'), or a
   drafter makes a notable projected-rank move (into/out of 1st, or 2+
   places — anything smaller is left to the Table's arrows).

   It renders as the Activity half of the Points tab (js/overall.js's
   Table | Activity switch), plus the slim link row on Home.

   Detection lives here in the browser because the scoring logic does
   (standings -> who holds a line -> drafter points; see js/league-facts.js
   and js/overall.js). The worker (worker/rundown-proxy.js, /activity)
   only stores it: one shared snapshot of "who holds what" plus the event
   log. Any open app diffs today's state against that snapshot and PUTs
   the result; the PUT is a compare-and-swap on the snapshot's `dataAt`,
   so two people opening the app at once can't log the same change twice.
   The known gap: nothing is logged while nobody has the app open — a
   change overnight shows up when the next person opens it, stamped then.

   Safety rails so a partial or stale load can't invent events:
   - a league only counts once its season is under way (Regular Season
     start through Postseason end, js/season-phase.js) and its live table
     shows a game played (before that, division tables can still hold
     last season's records, or preseason ones);
   - a league whose regular season is locked is skipped;
   - the snapshot's `dataAt` is the OLDEST cache timestamp used, and a
     client only writes if that is newer than the stored one, so a phone
     holding old data can never rewind the feed;
   - a group/rule only produces an event when it exists in BOTH snapshots;
   - lock state is only recorded once every league's lock has loaded;
   - a snapshot from an older SNAPSHOT_VERSION is never diffed against
     (v1 ranked by locked points; diffing it would log fake rank moves);
   - simulated (Fake) points data never runs detection.
   ============================================================ */
import { DRAFT_TEAMS, TEAM_META, LEAGUE_SCORING, LEAGUES, PRIOR_SEASON_DISPLAY_LEAGUES } from './data.js';
import { chatWorkerBase } from './api.js';
import { ordinal } from './utils.js';
import { isLeagueLocked, leagueLocksSettled, getLockedRuleTeams } from './season-lock.js';
import { leagueInputsSettled, leagueSeasonUnderway } from './league-facts.js';
import { fetchSeasonPhaseCached, SEASON_PHASE_LEAGUES, wasSeasonUnderwayAt } from './season-phase.js';
import { currentDraftTeamId } from './board.js';
import { obRankedRows, isObSimulated, obLeagueColor, obLeagueFullName, obOpenSheet, obSinceTs, obSinceLabel } from './overall.js';
import { currentBonusHolders, loadBonusInputs } from './compare.js';
import {
  espnNflStandingsCache, espnNflDivisionCache, fetchEspnNflStandingsCached, fetchEspnNflDivisionStandingsCached,
  computeNflConferenceStandings, computeNflDivisionStandings, findNflTeamKeyByEspnAbbr
} from './standings-nfl.js';
import {
  espnNbaStandingsCache, espnNbaDivisionCache, fetchEspnNbaStandingsCached, fetchEspnNbaDivisionStandingsCached,
  computeNbaConferenceStandings, computeNbaDivisionStandings, nbaConferences
} from './standings-nba.js';
import {
  espnNhlStandingsCache, espnNhlDivisionCache, fetchEspnNhlStandingsCached, fetchEspnNhlDivisionStandingsCached,
  computeNhlConferenceStandings, computeNhlDivisionStandings, nhlConferences
} from './standings-nhl.js';
import { findFlatTeamKey } from './standings-flat.js';
import { eplStandingsCache, fetchEplStandingsTable } from './standings-epl.js';
import { espnCfbRecordsCache, fetchEspnCfbRecordsCached } from './standings-cfb.js';
import { espnCbbStandingsCache, fetchEspnCbbStandingsCached } from './standings-cbb.js';

const FEED_KEY = 'teamDashboardActivityFeed';
const SEEN_KEY = 'teamDashboardActivitySeen';
const HOME_WINDOW_MS = 48 * 60 * 60 * 1000;
const DETECT_COOLDOWN_MS = 5 * 60 * 1000;
const INPUTS_WAIT_MS = 8000;
// v2: totals/ranks are projected, plus per-league `locked` and `live`.
const SNAPSHOT_VERSION = 2;

// The shared state, mirrored to localStorage so the Home card can paint
// before the network answers.
let feed = loadFeed();
let listFilter = 'all';

// A rule/bonus event for a league whose season wasn't under way when it
// was logged can't have scored — an older client (before the season gate
// in buildSnapshot) logged NHL preseason moves. Hide those; a league whose
// phase hasn't loaded yet keeps its events.
function countsEvent(e){
  if((e.type !== 'rule' && e.type !== 'bonus') || !SEASON_PHASE_LEAGUES.includes(e.league)) return true;
  return wasSeasonUnderwayAt(e.league, e.ts) !== false;
}

function visibleEvents(){
  return feed.events.filter(countsEvent);
}

function loadFeed(){
  try {
    const saved = JSON.parse(localStorage.getItem(FEED_KEY));
    if(saved && Array.isArray(saved.events)) return saved;
  } catch (e){}
  return { snapshot: null, events: [] };
}

function saveFeed(){
  try { localStorage.setItem(FEED_KEY, JSON.stringify(feed)); } catch (e){}
}

function applyServerState(state){
  if(!state || !Array.isArray(state.events)) return false;
  feed = { snapshot: state.snapshot || null, events: state.events };
  saveFeed();
  return true;
}

// ---- Seen / unseen (per device) ----

function lastSeen(){
  try { return parseInt(localStorage.getItem(SEEN_KEY), 10) || 0; } catch (e){ return 0; }
}

export function unseenCount(){
  const seen = lastSeen();
  return visibleEvents().filter(e => e.ts > seen).length;
}

// `quiet` is for the Points render itself: repaint only the Home link
// (the caller is already drawing the badge-free Points page).
export function markActivitySeen(quiet){
  const newest = visibleEvents().reduce((m, e) => Math.max(m, e.ts), 0);
  if(newest <= lastSeen()) return;
  try { localStorage.setItem(SEEN_KEY, String(newest)); } catch (e){}
  if(quiet) renderActivityHomeLink(); else refreshActivityUi();
}

// ---- Fetch / store ----

async function fetchState(){
  try {
    const res = await fetch(`${chatWorkerBase()}/activity`, { cache: 'no-store' });
    if(!res.ok) return null;
    return await res.json();
  } catch (e){
    return null;
  }
}

export async function loadActivity(){
  const state = await fetchState();
  if(state && applyServerState(state)) refreshActivityUi();
}

// ---- Detection ----

const TRACKED = [
  {
    key: 'nfl',
    caches: () => [espnNflStandingsCache, espnNflDivisionCache],
    load: () => [fetchEspnNflStandingsCached(), fetchEspnNflDivisionStandingsCached()],
    rows: () => espnNflStandingsCache.rows || [],
    games: r => (r.wins || 0) + (r.losses || 0) + (r.ties || 0),
    teamKey: r => findNflTeamKeyByEspnAbbr(r.abbreviation),
    divisions: () => ['AFC', 'NFC'].flatMap(abbr => computeNflDivisionStandings(abbr)),
    conferences: () => ['AFC', 'NFC'].map(abbr => ({ name: abbr, teams: computeNflConferenceStandings(abbr) }))
  },
  flatTracked('nba', espnNbaStandingsCache, espnNbaDivisionCache, fetchEspnNbaStandingsCached, fetchEspnNbaDivisionStandingsCached,
    nbaConferences, computeNbaConferenceStandings, computeNbaDivisionStandings),
  flatTracked('nhl', espnNhlStandingsCache, espnNhlDivisionCache, fetchEspnNhlStandingsCached, fetchEspnNhlDivisionStandingsCached,
    nhlConferences, computeNhlConferenceStandings, computeNhlDivisionStandings)
];

const CONFERENCE_NAMES = { East: 'Eastern Conference', West: 'Western Conference' };

function flatTracked(key, cache, divCache, loadFlat, loadDiv, conferences, computeConf, computeDiv){
  return {
    key,
    caches: () => [cache, divCache],
    load: () => [loadFlat(), loadDiv()],
    rows: () => cache.rows || [],
    games: r => (r.wins || 0) + (r.losses || 0) + (r.otLosses || 0),
    teamKey: r => findFlatTeamKey(key, r.teamNickname),
    divisions: () => conferences.flatMap(c => computeDiv(c.abbr)),
    conferences: () => conferences.map(c => ({ name: CONFERENCE_NAMES[c.abbr] || c.label, teams: computeConf(c.abbr) }))
  };
}

// "Who holds each line" for every tracked league that has real, current
// data. Values are a drafted team's key, or '~Nickname' for a team nobody
// drafted (still useful as the other half of "X takes the lead from Y").
function holderOf(cfg, row){
  const key = cfg.teamKey(row);
  return key || '~' + (row.teamNickname || row.teamName || '?');
}

function buildHolders(cfg){
  const out = {};
  const scoring = LEAGUE_SCORING[cfg.key];
  const groupsFor = scope => scope === 'division' ? cfg.divisions() : cfg.conferences();
  scoring.rules.filter(r => r.rankAuto && r.rankAuto.scope).forEach(rule => {
    groupsFor(rule.rankAuto.scope).forEach(g => {
      const teams = g.teams;
      if(!teams.length) return;
      const spec = rule.rankAuto;
      const pick = spec.bottom ? teams[teams.length - 1] : teams[(spec.rank || 1) - 1];
      if(pick) out[`${cfg.key}|${rule.label}|${g.name}`] = holderOf(cfg, pick);
    });
  });
  const clinch = scoring.rules.find(r => r.rankAuto && r.rankAuto.clinched);
  if(clinch){
    cfg.rows().forEach(row => {
      const teamKey = cfg.teamKey(row);
      if(!teamKey || !row.clincherDescription) return;
      if(/clinched/i.test(row.clincherDescription) && !/eliminated/i.test(row.clincherDescription)){
        out[`${cfg.key}|${clinch.label}|${teamKey}`] = teamKey;
      }
    });
  }
  return out;
}

function cacheTimes(caches){
  const times = caches.map(c => c.fetchedAt);
  return times.every(Boolean) ? Math.min(...times) : null;
}

function drafterName(id){
  const d = DRAFT_TEAMS.find(x => x.id === id);
  return d ? d.name : id;
}

function ownerOf(holder){
  const meta = holder && !holder.startsWith('~') ? TEAM_META[holder] : null;
  return meta && !meta.favoriteOnly ? meta.draftTeamId : null;
}

function holderName(holder){
  if(!holder) return '';
  if(holder.startsWith('~')) return holder.slice(1);
  return TEAM_META[holder] ? TEAM_META[holder].name : holder;
}

async function buildSnapshot(){
  await Promise.allSettled(
    TRACKED.flatMap(cfg => cfg.load())
      .concat([fetchEplStandingsTable(), fetchEspnCfbRecordsCached(), fetchEspnCbbStandingsCached()])
      .concat(SEASON_PHASE_LEAGUES.map(fetchSeasonPhaseCached))
  );

  const holders = {};
  const times = [];
  TRACKED.forEach(cfg => {
    if(isLeagueLocked(cfg.key) || leagueSeasonUnderway(cfg.key) !== true) return;
    const at = cacheTimes(cfg.caches());
    if(!at || !cfg.rows().some(r => cfg.games(r) > 0)) return;
    Object.assign(holders, buildHolders(cfg));
    times.push(at);
  });

  const bonus = currentBonusHolders();
  const bonusCaches = {
    epl: eplStandingsCache, cfb: espnCfbRecordsCache, mcbb: espnCbbStandingsCache,
    nfl: espnNflStandingsCache, nba: espnNbaStandingsCache, nhl: espnNhlStandingsCache
  };
  Object.keys(bonus).forEach(k => {
    const at = bonusCaches[k] && bonusCaches[k].fetchedAt;
    if(at) times.push(at); else delete bonus[k];
  });

  if(!times.length) return null;

  // Points totals read shared facts + adjustments (loaded lazily by the
  // first read), so wait for them before trusting a rank.
  obRankedRows();
  const start = Date.now();
  while(!leagueInputsSettled() && Date.now() - start < INPUTS_WAIT_MS){
    await new Promise(r => setTimeout(r, 250));
  }
  // Projected totals/ranks, plus each drafter's Live points per league —
  // the part a lock event will say "just became permanent".
  // Totals also need every league's season phase: until it's known a
  // league's live points read as 0, and a phase landing later would look
  // like a rank move.
  const phasesKnown = LEAGUES.every(l => PRIOR_SEASON_DISPLAY_LEAGUES.includes(l.key) || leagueSeasonUnderway(l.key) !== null);
  let totals = null, ranks = null, live = null;
  if(leagueInputsSettled() && phasesKnown){
    totals = {}; ranks = {}; live = {};
    obRankedRows().forEach(r => {
      totals[r.id] = r.total;
      ranks[r.id] = r.rank;
      r.leagues.forEach(x => {
        if(!x.provisional) return;
        (live[x.league.key] || (live[x.league.key] = {}))[r.id] = x.provisional;
      });
    });
  }

  let locked = null;
  if(leagueLocksSettled()){
    locked = {};
    LEAGUES.forEach(l => { locked[l.key] = isLeagueLocked(l.key); });
  }

  return { v: SNAPSHOT_VERSION, dataAt: Math.min(...times), holders, bonus, totals, ranks, live, locked };
}

function delta(drafterId, pts, prov){
  return { id: drafterId, pts, prov: !!prov };
}

function ruleFor(leagueKey, label){
  return LEAGUE_SCORING[leagueKey].rules.find(r => r.label === label);
}

// Turns "old snapshot -> new snapshot" into events. `ts` stamps them all.
function diffSnapshots(prev, next, ts){
  const events = [];
  let n = 0;
  const id = () => `ev_${ts}_${n++}`;

  Object.keys(next.holders).forEach(k => {
    if(!(k in prev.holders) || prev.holders[k] === next.holders[k]) return;
    const [leagueKey, label, group] = k.split('|');
    const rule = ruleFor(leagueKey, label);
    if(!rule) return;
    const was = prev.holders[k], now = next.holders[k];

    if(rule.rankAuto.clinched){
      const owner = ownerOf(now);
      if(!owner) return;
      events.push({
        id: id(), type: 'rule', ts, league: leagueKey, teamKey: now, drafterId: owner,
        title: `${holderName(now)} clinch a playoff spot`, sub: '',
        deltas: [delta(owner, rule.pts, true)], moves: []
      });
      return;
    }

    const wasOwner = ownerOf(was), nowOwner = ownerOf(now);
    if(!wasOwner && !nowOwner) return;
    const positive = rule.pts > 0;
    const isDivision = rule.rankAuto.scope === 'division';
    const lead = isDivision ? `the ${group} lead` : `the best record in the ${group}`;
    const deltas = [];
    if(nowOwner) deltas.push(delta(nowOwner, rule.pts, true));
    if(wasOwner) deltas.push(delta(wasOwner, -rule.pts, true));

    let title, sub, teamKey, drafterId;
    if(positive){
      // A team took the line; a drafted team may be the one that lost it.
      title = `${holderName(now)} take ${lead}`;
      sub = `${holderName(was)} lose it`;
      teamKey = ownerOf(now) ? now : was;
    } else {
      const where = isDivision ? `last place in the ${group}` : `the worst record in the ${group}`;
      title = `${holderName(now)} fall into ${where}`;
      sub = `${holderName(was)} climb out`;
      teamKey = ownerOf(now) ? now : was;
    }
    drafterId = ownerOf(teamKey);
    events.push({ id: id(), type: 'rule', ts, league: leagueKey, teamKey, drafterId, title, sub, deltas, moves: [] });
  });

  Object.keys(next.bonus).forEach(leagueKey => {
    const was = prev.bonus[leagueKey], now = next.bonus[leagueKey];
    if(!was || was === now) return;
    const pts = (LEAGUE_SCORING[leagueKey].bonus || {}).pts || 5;
    events.push({
      id: id(), type: 'bonus', ts, league: leagueKey, teamKey: '', drafterId: now,
      title: `${drafterName(now)} takes the ${obLeagueFullName(leagueKey)} bonus lead`,
      sub: `${drafterName(was)} loses it`,
      deltas: [delta(now, pts, true), delta(was, -pts, true)], moves: []
    });
  });

  // Projected rank moves. Only notable ones make an event — into or out
  // of 1st, or 2+ places; every small shuffle is left to the Table's
  // arrows, since projected moves with nearly every rule event.
  if(prev.ranks && next.ranks && prev.totals && next.totals){
    const moves = Object.keys(next.ranks)
      .filter(d => prev.ranks[d] !== undefined && prev.ranks[d] !== next.ranks[d] && prev.totals[d] !== next.totals[d])
      .map(d => ({ id: d, from: prev.ranks[d], to: next.ranks[d] }));
    const notable = moves.filter(m => (m.from === 1) !== (m.to === 1) || Math.abs(m.from - m.to) >= 2);
    if(notable.length){
      const weight = m => (m.to === 1 ? 100 : 0) + Math.abs(m.from - m.to);
      const top = notable.slice().sort((a, b) => weight(b) - weight(a))[0];
      const up = top.from > top.to;
      events.push({
        id: id(), type: 'rank', ts, league: '', teamKey: '', drafterId: top.id,
        title: top.to === 1
          ? `${drafterName(top.id)} moves into 1st projected`
          : `${drafterName(top.id)} ${up ? 'moves up to' : 'drops to'} ${ordinal(top.to)} projected`,
        sub: moves.length > 1 ? `${moves.length} drafters changed places` : '',
        deltas: [], moves
      });
    }
  }

  // A league locked: every drafter's Live points there are now Locked.
  // Projected doesn't move — the deltas are what became permanent.
  if(prev.locked && next.locked){
    Object.keys(next.locked).forEach(leagueKey => {
      if(prev.locked[leagueKey] !== false || !next.locked[leagueKey]) return;
      const held = (prev.live && prev.live[leagueKey]) || {};
      const deltas = Object.keys(held).filter(d => held[d]).map(d => delta(d, held[d], false))
        .sort((a, b) => b.pts - a.pts);
      events.push({
        id: id(), type: 'lock', ts, league: leagueKey, teamKey: '',
        drafterId: deltas.length ? deltas[0].id : '',
        title: `${obLeagueFullName(leagueKey)} regular season ends: points locked`,
        sub: notableLockedRule(leagueKey),
        deltas, moves: []
      });
    });
  }
  return events;
}

// "Chiefs lock in Division title" — the biggest drafted placement the
// lock just froze, for the lock event's sub line.
function notableLockedRule(leagueKey){
  const best = LEAGUE_SCORING[leagueKey].rules
    .filter(r => r.rankAuto && r.pts > 0)
    .map(r => ({ rule: r, team: getLockedRuleTeams(leagueKey, r.label).find(t => ownerOf(t)) }))
    .filter(x => x.team)
    .sort((a, b) => b.rule.pts - a.rule.pts)[0];
  return best ? `${holderName(best.team)} lock in ${best.rule.label}` : '';
}

let lastRun = 0;
let running = false;

// Called at boot, whenever the Points tab opens, and when the app comes
// back to the foreground — it throttles itself.
export async function runActivityDetection(force){
  if(running || isObSimulated()) return;
  if(!force && Date.now() - lastRun < DETECT_COOLDOWN_MS) return;
  running = true;
  lastRun = Date.now();
  try {
    const [server, snapshot] = await Promise.all([fetchState(), buildSnapshot()]);
    if(server) applyServerState(server);
    if(!server || !snapshot) return;

    const prev = server.snapshot;
    if(prev && prev.dataAt >= snapshot.dataAt) return;   // someone has newer data than this device

    // An older-version snapshot can't be diffed (v1 ranked on locked
    // points), so this run just replaces it.
    const comparable = prev && prev.v === SNAPSHOT_VERSION;

    // Carry the last known ranks/locks forward if they couldn't be trusted
    // this time, so the next run still has something to diff against.
    if(comparable && !snapshot.totals){ snapshot.totals = prev.totals || null; snapshot.ranks = prev.ranks || null; snapshot.live = prev.live || null; }
    if(comparable && !snapshot.locked) snapshot.locked = prev.locked || null;

    const events = comparable ? diffSnapshots(prev, snapshot, Date.now()) : [];
    const res = await fetch(`${chatWorkerBase()}/activity`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base: prev ? prev.dataAt : null, snapshot, events })
    });
    // 409 = someone else wrote first; their state is in the body.
    const state = await res.json().catch(() => null);
    if(state && applyServerState(state)) refreshActivityUi();
  } catch (e){
    console.warn('[Activity] detection failed', e);
  } finally {
    running = false;
  }
}

// ---- Rendering ----

const LEAGUE_ABBR = { epl: 'EPL', nfl: 'NFL', nba: 'NBA', nhl: 'NHL', mlb: 'MLB', wnba: 'WNBA', cfb: 'CFB', mcbb: 'CBB' };

function tileHtml(e){
  if(e.type === 'rank'){
    return `<span class="act-tile rank">&#9650;</span>`;
  }
  const color = obLeagueColor(e.league);
  return `<span class="act-tile" style="color:${color}; background:color-mix(in srgb, ${color} 16%, transparent);">${LEAGUE_ABBR[e.league] || ''}</span>`;
}

function kindTagHtml(e){
  if(e.type === 'lock') return '<span class="pts-tag lock-in">Locked in</span>';
  if(e.type === 'rank') return '<span class="pts-tag rank">Projected rank</span>';
  return '<span class="pts-tag live">Live</span>';
}

function signed(n){
  return (n > 0 ? '+' : '&minus;') + Math.abs(n);
}

function moveText(m){
  return `${m.to < m.from ? '&#9650;' : '&#9660;'}${Math.abs(m.from - m.to)}`;
}

// "Around the league" chips: every drafter the event touched.
function chipsHtml(e){
  const chips = [];
  (e.deltas || []).forEach(d => {
    if(e.type === 'lock') chips.push(`<span class="act-chip locked">${drafterName(d.id)} ${signed(d.pts)} locked</span>`);
    else chips.push(`<span class="act-chip ${d.prov ? 'prov' : (d.pts > 0 ? 'win' : 'loss')}">${drafterName(d.id)} ${signed(d.pts)}</span>`);
  });
  (e.moves || []).forEach(m => {
    chips.push(`<span class="act-chip rank">${drafterName(m.id)} ${moveText(m)}</span>`);
  });
  return chips.join('');
}

// What an event did to one drafter: { html, cls, lock } or null.
function deltaFor(e, drafterId){
  if(e.type === 'rank'){
    const m = (e.moves || []).find(x => x.id === drafterId);
    return m ? { html: moveText(m), cls: m.to < m.from ? 'up' : 'down' } : null;
  }
  const d = (e.deltas || []).find(x => x.id === drafterId);
  if(!d) return null;
  if(e.type === 'lock') return { html: signed(d.pts), cls: 'lock', lock: true };
  return { html: signed(d.pts), cls: d.prov ? (d.pts < 0 ? 'risk' : 'live') : (d.pts < 0 ? 'down' : 'up') };
}

export function myDelta(e){
  return deltaFor(e, currentDraftTeamId);
}

// Everyone else's part in an event you're in, as plain text.
function othersLine(e){
  const me = currentDraftTeamId;
  const parts = (e.deltas || []).filter(d => d.id !== me).map(d => `${drafterName(d.id)} ${signed(d.pts)}`)
    .concat((e.moves || []).filter(m => m.id !== me).map(m => `${drafterName(m.id)} ${moveText(m)}`));
  return parts.join(' &middot; ');
}

// Today: "2h" / "now"; otherwise "Yesterday" or the weekday.
function timeText(ts){
  const now = Date.now();
  if(sameDay(ts, now)){
    const mins = Math.max(0, Math.round((now - ts) / 60000));
    if(mins < 1) return 'now';
    if(mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h';
  }
  if(sameDay(ts, now - 86400000)) return 'Yesterday';
  return new Date(ts).toLocaleDateString([], { weekday: 'short' });
}

function sameDay(a, b){
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function eventAction(e){
  if(e.type === 'rank' || e.type === 'bonus' || e.type === 'lock'){
    const id = e.type === 'lock' && mineEvent(e) ? currentDraftTeamId : e.drafterId;
    return id ? `obOpenSheet('${id}')` : '';
  }
  return e.teamKey ? `openTeamModal('${e.teamKey}')` : '';
}

function mineEvent(e){
  const me = currentDraftTeamId;
  if(e.drafterId === me) return true;
  return (e.deltas || []).some(d => d.id === me) || (e.moves || []).some(m => m.id === me);
}

// One feed row. `mine` rows lead with your own delta on the right and
// name everyone else in a plain line; the rest show every drafter as chips.
function rowHtml(e, mine){
  const d = mine ? myDelta(e) : null;
  const right = d
    ? `<span class="act-delta ${d.cls}">${d.html}</span><span class="act-time">${d.lock ? 'locked &middot; ' : ''}${timeText(e.ts)}</span>`
    : `<span class="act-time">${timeText(e.ts)}</span>`;
  const detail = mine
    ? (othersLine(e) ? `<span class="act-sub">${othersLine(e)}</span>` : '')
    : `${e.sub ? `<span class="act-sub">${e.sub}</span>` : ''}<span class="act-chips">${chipsHtml(e)}</span>`;
  return `
    <button type="button" class="act-row ${e.type === 'lock' ? 'lock' : ''}" onclick="${eventAction(e)}">
      ${tileHtml(e)}
      <span class="act-body">
        ${kindTagHtml(e)}
        <span class="act-title">${e.title}</span>
        ${mine && e.sub && e.type === 'lock' ? `<span class="act-sub">${e.sub}</span>` : ''}
        ${detail}
      </span>
      <span class="act-right">${right}</span>
    </button>
  `;
}

function sectionHtml(label, note, items, mine){
  if(!items.length) return '';
  return `
    <div class="ob-section-title ob-section-split"><span>${label}</span>${note || ''}</div>
    <div class="ob-card act-group">${items.map(e => rowHtml(e, mine)).join('')}</div>
  `;
}

// "Live +3 since Tue": your net Live change across the feed since the
// Points rank baseline (js/overall.js). Lock events don't count — they
// turn Live into Locked without moving projected.
function myLiveNote(events){
  const since = obSinceTs();
  const sum = events.filter(e => e.ts > since && e.type !== 'lock' && e.type !== 'rank')
    .reduce((s, e) => s + ((e.deltas || []).find(d => d.id === currentDraftTeamId && d.prov) || { pts: 0 }).pts, 0);
  if(!sum) return '';
  const label = obSinceLabel(since);
  return `<span class="ob-section-note ${sum < 0 ? 'risk' : 'lv'}">Live ${signed(sum)}${label ? ' ' + label : ''}</span>`;
}

export function setActivityFilter(key){
  listFilter = ['all', 'mine', 'locked', 'rank'].includes(key) ? key : 'all';
  if(window.renderOverallStandings) window.renderOverallStandings();
}
window.setActivityFilter = setActivityFilter;

const FILTERS = [
  { key: 'all', label: 'All' }, { key: 'mine', label: 'My teams' },
  { key: 'locked', label: 'Locked in' }, { key: 'rank', label: 'Rank moves' }
];

// The Activity half of the Points tab.
export function activityPanelHtml(){
  const events = visibleEvents();
  const mine = events.filter(mineEvent);
  let body;
  if(listFilter === 'locked'){
    body = sectionHtml('Locked in', '<span class="ob-section-note locked">Permanent</span>', events.filter(e => e.type === 'lock'), false);
  } else if(listFilter === 'rank'){
    body = sectionHtml('Projected rank moves', '', events.filter(e => e.type === 'rank'), false);
  } else {
    body = sectionHtml('Moved your points', myLiveNote(mine), mine, true)
      + (listFilter === 'all' ? sectionHtml('Around the league', '', events.filter(e => !mineEvent(e)), false) : '');
  }
  if(!body){
    body = `<div class="ob-idle-block"><div class="ob-idle-title">Nothing here yet</div><div class="ob-idle-body">No scoring lines have moved for this filter.</div></div>`;
  }
  return `
    <div class="filter-chips sm act-filters">${FILTERS.map(f =>
      `<button type="button" class="filter-chip ${f.key === listFilter ? 'active' : ''}" onclick="setActivityFilter('${f.key}')">${f.label}</button>`
    ).join('')}</div>
    ${body}
    <div class="act-foot">Only changes that move points. Game results stay on Scores.</div>
  `;
}

// A drafter breakdown's "Recent changes": the last few events that
// touched them, compact. '' when there are none (the section hides).
export function activityRecentHtml(drafterId){
  const items = visibleEvents().filter(e => deltaFor(e, drafterId)).slice(0, 5);
  if(!items.length) return '';
  return `<div class="ob-card act-group">${items.map(e => {
    const d = deltaFor(e, drafterId);
    return `
      <div class="act-row compact">
        ${tileHtml(e)}
        <span class="act-body">
          <span class="act-title">${e.title}</span>
          <span class="act-time">${timeText(e.ts)}${e.type === 'lock' ? ' &middot; locked in' : ''}</span>
        </span>
        <span class="act-right"><span class="act-delta ${d.cls}">${d.html}</span></span>
      </div>
    `;
  }).join('')}</div>`;
}

// Home: one slim row into Points > Activity. Hidden entirely when nothing
// moved in the last 48h.
export function renderActivityHomeLink(){
  const el = document.getElementById('activity-home');
  if(!el) return;
  const recent = visibleEvents().filter(e => Date.now() - e.ts < HOME_WINDOW_MS);
  if(!recent.length){ el.innerHTML = ''; return; }
  const unseen = unseenCount();
  const latest = recent[0];
  // Unseen: what changed, with the latest line under it. All seen: just
  // where you stand, one line.
  let title, sub = '';
  if(unseen){
    const d = myDelta(latest);
    title = `${unseen} point change${unseen === 1 ? '' : 's'} since you last looked`;
    sub = `${latest.title}${d ? ` &middot; <span class="act-delta-inline ${d.cls}">${d.html}</span>` : ''}`;
  } else {
    const me = obRankedRows().find(r => r.id === currentDraftTeamId);
    const total = me && (me.total < 0 ? '&minus;' + Math.abs(me.total) : me.total);
    title = me ? `Projected ${me.rankLabel.startsWith('T') ? 'T' + ordinal(me.rankLabel.slice(1)) : ordinal(me.rankLabel)} &middot; ${total} pts` : 'Points';
  }
  el.innerHTML = `
    <button type="button" class="act-link ${unseen ? 'unseen' : ''}" onclick="obOpenActivity()">
      ${unseen ? '<span class="act-dot"></span>' : ''}
      <span class="act-link-body">
        <span class="act-link-title">${title}</span>
        ${sub ? `<span class="act-link-sub">${sub}</span>` : ''}
      </span>
      <span class="act-link-go">Points &rsaquo;</span>
    </button>
  `;
}

// The Home link, and the Points tab (for its badge and the feed itself)
// when it's the open view, share one refresh.
export function refreshActivityUi(){
  renderActivityHomeLink();
  const view = document.getElementById('view-overall');
  if(view && view.classList.contains('active') && window.renderOverallStandings) window.renderOverallStandings();
}

window.activityOpenDrafter = id => obOpenSheet(id);

// ---- Boot ----

export function startActivity(){
  refreshActivityUi();
  // Home's "Projected 1st · 36 pts" includes the league bonus, which
  // reads standings tables Home doesn't otherwise load.
  loadBonusInputs().then(renderActivityHomeLink);
  loadActivity();
  setTimeout(() => runActivityDetection(), 6000);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible'){ loadActivity(); runActivityDetection(); }
  });
}
