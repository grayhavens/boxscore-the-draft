/* ============================================================
   Activity: a log of RULE CHANGES, not game results — "since you last
   looked, who moved on a scoring line". An event only exists when a team
   crosses a line that scores (takes/loses a division lead or best record
   in its conference, moves into/out of last place or worst record,
   clinches the playoffs), the +5 league bonus flips between drafters, or
   a drafter's confirmed rank changes.

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
   - a league only counts once its live table shows a game played (before
     that, division tables can still hold last season's records);
   - a league whose regular season is locked is skipped;
   - the snapshot's `dataAt` is the OLDEST cache timestamp used, and a
     client only writes if that is newer than the stored one, so a phone
     holding old data can never rewind the feed;
   - a group/rule only produces an event when it exists in BOTH snapshots;
   - simulated (Fake) points data never runs detection.
   ============================================================ */
import { DRAFT_TEAMS, TEAM_META, LEAGUE_SCORING } from './data.js';
import { chatWorkerBase } from './api.js';
import { segmentedControlHtml } from './utils.js';
import { isLeagueLocked } from './season-lock.js';
import { leagueInputsSettled } from './league-facts.js';
import { currentDraftTeamId } from './board.js';
import { obRankedRows, isObSimulated, obLeagueColor, obLeagueFullName, obOpenDetail } from './overall.js';
import { currentBonusHolders } from './compare.js';
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

// The shared state, mirrored to localStorage so the Home card can paint
// before the network answers.
let feed = loadFeed();
let listFilter = 'all';

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
  return feed.events.filter(e => e.ts > seen).length;
}

export function markActivitySeen(){
  const newest = feed.events.reduce((m, e) => Math.max(m, e.ts), 0);
  try { localStorage.setItem(SEEN_KEY, String(Math.max(newest, lastSeen()))); } catch (e){}
  refreshActivityUi();
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
  );

  const holders = {};
  const times = [];
  TRACKED.forEach(cfg => {
    if(isLeagueLocked(cfg.key)) return;
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
  let totals = null, ranks = null;
  if(leagueInputsSettled()){
    totals = {}; ranks = {};
    obRankedRows().forEach(r => { totals[r.id] = r.confirmedTotal; ranks[r.id] = r.rank; });
  }

  return { dataAt: Math.min(...times), holders, bonus, totals, ranks };
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
      sub: `${drafterName(was)} lose it`,
      deltas: [delta(now, pts, true), delta(was, -pts, true)], moves: []
    });
  });

  if(prev.ranks && next.ranks && prev.totals && next.totals){
    const moves = Object.keys(next.ranks)
      .filter(d => prev.ranks[d] !== undefined && prev.ranks[d] !== next.ranks[d] && prev.totals[d] !== next.totals[d])
      .map(d => ({ id: d, from: prev.ranks[d], to: next.ranks[d] }));
    if(moves.length){
      const top = moves.slice().sort((a, b) => (b.from - b.to) - (a.from - a.to))[0];
      const up = top.from > top.to;
      events.push({
        id: id(), type: 'rank', ts, league: '', teamKey: '', drafterId: top.id,
        title: `${drafterName(top.id)} ${up ? 'moves up to' : 'drops to'} ${ordinalWord(top.to)}`,
        sub: moves.length > 1 ? `${moves.length} drafters changed places` : '',
        deltas: [], moves
      });
    }
  }
  return events;
}

function ordinalWord(n){
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
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

    // Carry the last known ranks forward if they couldn't be trusted this
    // time, so the next run still has something to diff against.
    if(!snapshot.totals && prev){ snapshot.totals = prev.totals || null; snapshot.ranks = prev.ranks || null; }

    const events = prev ? diffSnapshots(prev, snapshot, Date.now()) : [];
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

function chipsHtml(e){
  const chips = [];
  (e.deltas || []).forEach(d => {
    const cls = d.prov ? 'prov' : (d.pts > 0 ? 'win' : 'loss');
    chips.push(`<span class="act-chip ${cls}">${drafterName(d.id)} ${d.pts > 0 ? '+' : '&minus;'}${Math.abs(d.pts)}</span>`);
  });
  (e.moves || []).forEach(m => {
    chips.push(`<span class="act-chip rank">${drafterName(m.id)} ${m.to < m.from ? '&#9650;' : '&#9660;'}${Math.abs(m.from - m.to)}</span>`);
  });
  return chips.join('');
}

function timeText(ts, relative){
  const d = new Date(ts);
  if(relative){
    const mins = Math.max(0, Math.round((Date.now() - ts) / 60000));
    if(mins < 1) return 'now';
    if(mins < 60) return mins + 'm';
    return Math.floor(mins / 60) + 'h';
  }
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function sameDay(a, b){
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function eventAction(e){
  if(e.type === 'rank' || e.type === 'bonus') return `activityOpenDrafter('${e.drafterId}')`;
  return e.teamKey ? `openTeamModal('${e.teamKey}')` : '';
}

function homeItemHtml(e){
  return `
    <button type="button" class="act-item" onclick="${eventAction(e)}">
      ${tileHtml(e)}
      <span class="act-body">
        <span class="act-title">${e.title}</span>
        <span class="act-chips">${chipsHtml(e)}</span>
      </span>
      <span class="act-time">${timeText(e.ts, true)}</span>
    </button>
  `;
}

// Home card: hidden entirely (no empty state) when nothing moved in the
// last 48h. Once everything's been seen the dot goes and the title softens.
export function renderActivityHomeCard(){
  const el = document.getElementById('activity-home');
  if(!el) return;
  const recent = feed.events.filter(e => Date.now() - e.ts < HOME_WINDOW_MS);
  if(!recent.length){ el.innerHTML = ''; return; }
  const unseen = unseenCount() > 0;
  el.innerHTML = `
    <div class="league act-card">
      <div class="act-card-head">
        ${unseen ? '<span class="act-dot"></span>' : ''}
        <span class="act-card-title">${unseen ? 'Since you last looked' : 'Recent changes'}</span>
        <button type="button" class="act-see-all" onclick="obOpenActivity()">See all</button>
      </div>
      ${recent.slice(0, 3).map(homeItemHtml).join('')}
    </div>
  `;
}

function mineEvent(e){
  const me = currentDraftTeamId;
  if(e.drafterId === me) return true;
  return (e.deltas || []).some(d => d.id === me) || (e.moves || []).some(m => m.id === me);
}

function dayLabel(ts){
  const now = Date.now();
  if(sameDay(ts, now)) return 'Today';
  if(sameDay(ts, now - 86400000)) return 'Yesterday';
  return new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

export function setActivityFilter(key){
  listFilter = ['all', 'mine', 'rank'].includes(key) ? key : 'all';
  if(window.renderOverallStandings) window.renderOverallStandings();
}
window.setActivityFilter = setActivityFilter;

export function activityListHtml(){
  let events = feed.events;
  if(listFilter === 'mine') events = events.filter(mineEvent);
  if(listFilter === 'rank') events = events.filter(e => e.type === 'rank');

  const groups = [];
  events.forEach(e => {
    const label = dayLabel(e.ts);
    const g = groups[groups.length - 1];
    if(g && g.label === label) g.items.push(e); else groups.push({ label, items: [e] });
  });

  const body = groups.length ? groups.map(g => `
    <div class="ob-section-title act-day">${g.label}</div>
    <div class="ob-card act-group">
      ${g.items.map(e => `
        <button type="button" class="act-row" onclick="${eventAction(e)}">
          ${tileHtml(e)}
          <span class="act-body">
            <span class="act-title">${e.title}</span>
            ${e.sub ? `<span class="act-sub">${e.sub}</span>` : ''}
            <span class="act-chips">${chipsHtml(e)}</span>
          </span>
          <span class="act-time-col">
            <span class="act-time">${timeText(e.ts, sameDay(e.ts, Date.now()))}</span>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"></path></svg>
          </span>
        </button>
      `).join('')}
    </div>
  `).join('') : `<div class="ob-idle-block"><div class="ob-idle-title">Nothing yet</div><div class="ob-idle-body">${listFilter === 'all' ? 'No scoring lines have moved yet.' : 'Nothing here for this filter.'}</div></div>`;

  return `
    <h2 class="ob-detail-name act-h">Activity</h2>
    <div class="ob-detail-meta act-sub-copy">Only changes that move points. Game results stay on Scores.</div>
    <div class="act-filter">${segmentedControlHtml([
      { key: 'all', label: 'All' }, { key: 'mine', label: 'My teams' }, { key: 'rank', label: 'Rank moves' }
    ], listFilter, 'setActivityFilter')}</div>
    ${body}
  `;
}

// The Points toolbar's unseen dot and the Home card share one refresh.
export function refreshActivityUi(){
  renderActivityHomeCard();
  const dot = document.getElementById('ob-activity-dot');
  if(dot) dot.hidden = unseenCount() === 0;
}

window.activityOpenDrafter = id => {
  window.switchView('overall');
  obOpenDetail(id);
};

// ---- Boot ----

export function startActivity(){
  refreshActivityUi();
  loadActivity();
  setTimeout(() => runActivityDetection(), 6000);
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState === 'visible'){ loadActivity(); runActivityDetection(); }
  });
}
