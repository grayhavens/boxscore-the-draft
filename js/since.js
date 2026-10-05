/* Since last time (docs/delight-plan.md, Phase 4): when you come back after
   8 hours or more, the notable things that happened while you were away,
   as a stack of cards over Home. A summary first (your rank, points, newly
   locked points and your teams' record), then up to four of: points
   locking or a clinch, postseason games and upsets, a series against one
   drafter ("Drew beat you 5–1"), single games. Swipe them away (or Clear
   all) and Home's rows cascade in, with an "N updates" pill beside the
   title that reopens them once. Tapping the pill counts as having seen
   them, so it goes; it's also gone the next time the app is put away.

   The stack only drops in when something above a single game happened or
   your rank moved. Otherwise, the pill alone: a quiet night stays quiet.

   The pure half (which cards, in what order, what they say, when to
   prompt) is js/since-math.js. Here: gathering the inputs and drawing.

   - Games come from each of your teams' ESPN schedules (one fetch per
     team, however long you were away), for leagues that are scoring now
     (not MLB/WNBA's prior season, scores-only leagues or preseason).
   - The summary and the locks compare today against the last visit
     (`bx-last-seen`: { at, ranks, totals, lockedTotals, locked }), written
     whenever the app is put away. Not the Activity feed: it keeps only the
     group's last 150 events, which a few days can roll past. The feed
     still supplies clinches and a lock's exact points while it has them.

   Never before a group's first draft, while the draft card leads Home, or
   while a draft is live. With reduced motion (or no View Transitions)
   there's no stack: the pill opens the same cards as a sheet. If the
   inputs take too long, or you've already moved on from Home, the pill
   alone shows instead of the stack dropping in on top of you. */

import { DRAFT_TEAMS, TEAM_META, LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT, isScoresOnly } from './data.js';
import { currentProfileId } from './identity.js';
import { activityEventsSince, buildPointsSnapshot, latestPointsSnapshot, loadActivity, leagueTileHtml } from './activity.js';
import { obLeagueColor, obLeagueFullName } from './overall.js';
import { FLAT_SCHEDULE_LEAGUES } from './live-data.js';
import { fetchEspnTeamSchedule } from './espn.js';
import { getLockedRuleTeams, isLeagueLocked, leagueLocksSettled } from './season-lock.js';
import { leagueSeasonUnderway } from './league-facts.js';
import { isDraftLiveNow } from './draft-live.js';
import { isDraftUpcoming, isDraftPollOpen } from './draft-schedule.js';
import { ACTIVE_SEASON } from './season.js';
import { teamBadgeHtml, lockBodyScroll, unlockBodyScroll, openSheetOverlay, MOVE_SLOP, SWIPE_COMMIT, FLING_VELOCITY, NEUTRAL_BADGE_STYLE, escapeHtml } from './utils.js';
import { fxOn, once, stagger, pop } from './motion-fx.js';
import { attachDrag, releaseDirection } from './gestures.js';
import {
  updateCardHtml, updateStackHtml, updatesPillHtml, updateStatsHtml, rankBadgeHtml, tagHtml,
  teamBadgeHtml as uiTeamBadgeHtml
} from './ui.js';
import { isAwayLongEnough, buildCards } from './since-math.js';

const KEY = 'bx-last-seen';
const EYEBROW = 'Notable results';
const TITLE = 'Since last time';
// A game that started this long before the visit could have ended after it.
const GAME_LEAD_MS = 3 * 60 * 60 * 1000;
// How long after Home appears the stack may still drop in; later, the pill.
const SHOW_BUDGET_MS = 4000;
const SPLASH_WAIT_MS = 4000;
// Ranks wait on every scoring input; past this the summary goes without them.
const RANK_WAIT_MS = 3500;

let checked = false;     // the check has run, so visits may be saved
let pillCards = null;    // the cards the pill reopens
let detachDrag = null;

function loadVisit(){
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if(v && typeof v.at === 'number') return v;
  } catch (e){}
  return null;
}

// The visit baseline: now, with the newest trustworthy points (or the
// last saved ones while none have loaded this visit).
function saveVisit(){
  if(!checked || !currentProfileId) return;
  const prev = loadVisit() || {};
  const snap = latestPointsSnapshot();
  const pick = k => (snap && snap[k]) || prev[k] || null;
  const visit = { at: Date.now(), ranks: pick('ranks'), totals: pick('totals'), lockedTotals: pick('lockedTotals'), locked: pick('locked') };
  try { localStorage.setItem(KEY, JSON.stringify(visit)); } catch (e){}
}

// ---- Inputs ----

const leagueOf = key => LEAGUES.find(l => l.key === key);
const leagueLabel = key => (leagueOf(key) || { label: key.toUpperCase() }).label;
const drafterName = id => (DRAFT_TEAMS.find(d => d.id === id) || { name: id }).name;
const drafted = k => TEAM_META[k] && !TEAM_META[k].favoriteOnly && TEAM_META[k].draftTeamId;

// Clubs and colleges go by their name; pro teams by nickname ("the Knicks").
function opponentNames(league, e){
  if(league === 'cfb' || league === 'mcbb'){ const n = e.opponentLocation || e.opponentName; return { short: n, name: n }; }
  if(league === 'epl') return { short: e.opponentName, name: e.opponentName };
  const nick = e.opponentNickname || e.opponentName;
  return { short: nick, name: e.opponentNickname ? `the ${nick}` : nick };
}

function scoringLeague(league){
  return !!FLAT_SCHEDULE_LEAGUES[league] && !PRIOR_SEASON_DISPLAY_LEAGUES.includes(league)
    && !isScoresOnly(league) && leagueSeasonUnderway(league) !== false;
}

// Your games that started after `from`, from each team's ESPN schedule.
async function myGames(me, from){
  const leagues = [...new Set(Object.keys(TEAM_META).filter(k => drafted(k) === me).map(k => TEAM_META[k].leagueKey))].filter(scoringLeague);
  const lists = await Promise.all(leagues.map(async league => {
    const cfg = FLAT_SCHEDULE_LEAGUES[league];
    await cfg.ensureStandings();
    // Every drafted team in the league by ESPN id, to name the drafter you played.
    const byId = {}, mine = [];
    (leagueOf(league) || { teams: [] }).teams.filter(drafted).forEach(k => {
      const row = cfg.findRow(TEAM_META[k]);
      if(!row) return;
      byId[String(row.id)] = k;
      if(drafted(k) === me) mine.push({ teamKey: k, espnId: row.id });
    });
    const scheds = await Promise.all(mine.map(t => fetchEspnTeamSchedule(cfg.sportPath, t.espnId).catch(() => null)));
    const out = [];
    scheds.forEach((sched, i) => (sched ? sched.recent : []).forEach(e => {
      const at = new Date(e.date).getTime();
      if(!(at > from) || e.seasonType === 1 || e.ownScore === null || e.oppScore === null || isNaN(e.ownScore)) return;
      const teamKey = mine[i].teamKey;
      const oppKey = byId[String(e.opponentId)];
      const oppDrafter = oppKey && drafted(oppKey) !== me ? drafted(oppKey) : null;
      const names = opponentNames(league, e);
      out.push({
        id: e.id, teamKey, league, leagueLabel: leagueLabel(league), teamName: TEAM_META[teamKey].name,
        own: e.ownScore, opp: e.oppScore, oppName: names.name, oppShort: oppKey ? TEAM_META[oppKey].name : names.short,
        oppDrafter, oppDrafterName: oppDrafter ? drafterName(oppDrafter) : '',
        isHome: e.isHome, detail: e.statusDetail, at, postseason: e.seasonType === 3,
        ownRank: e.ownRank || null, oppRank: e.oppRank || null
      });
    }));
    return out;
  }));
  // Two of your own teams playing each other show once.
  const seen = new Set();
  return lists.flat().filter(g => !seen.has(g.id) && seen.add(g.id));
}

// Your biggest placement a lock froze, for its card's title.
function lockBest(me, league){
  const scoring = LEAGUE_SCORING[league];
  if(!scoring) return null;
  const best = scoring.rules.filter(r => r.rankAuto && r.pts > 0)
    .map(r => ({ r, t: getLockedRuleTeams(league, r.label).find(t => drafted(t) === me) }))
    .filter(x => x.t)
    .sort((a, b) => b.r.pts - a.r.pts)[0];
  return best ? { teamKey: best.t, teamName: TEAM_META[best.t].name, label: best.r.label } : null;
}

// Leagues that locked since the visit with a team of yours in them: the
// visit's lock state against today's, plus the feed's lock events (which
// carry the exact points) while it still has them.
function locksSince(prev, me, events){
  const owns = league => Object.keys(TEAM_META).some(k => drafted(k) === me && TEAM_META[k].leagueKey === league);
  const found = {};
  events.filter(e => e.type === 'lock' && e.myPts > 0).forEach(e => { found[e.league] = { pts: e.myPts, at: e.ts }; });
  if(prev.locked && leagueLocksSettled()){
    LEAGUES.forEach(l => {
      if(prev.locked[l.key] === false && isLeagueLocked(l.key) && owns(l.key) && !found[l.key]) found[l.key] = { pts: null, at: Date.now() };
    });
  }
  return Object.keys(found).map(league => ({
    league, leagueLabel: leagueLabel(league), leagueName: obLeagueFullName(league),
    pts: found[league].pts, at: found[league].at, best: lockBest(me, league)
  }));
}

// `late` is set when the ranks weren't ready in time: a promise of the
// cards rebuilt once they land (null when they were there, or never will be).
async function gather(prev, me){
  const snapP = buildPointsSnapshot().catch(() => null);
  const [snap, games] = await Promise.all([
    Promise.race([snapP, new Promise(r => setTimeout(r, RANK_WAIT_MS, null))]),
    myGames(me, prev.at - GAME_LEAD_MS).catch(() => []),
    loadActivity().catch(() => null)
  ]);
  const events = activityEventsSince(prev.at, me).map(e => ({ ...e, leagueLabel: e.league ? leagueLabel(e.league) : '' }));
  const clinches = events.filter(e => e.type === 'rule' && e.myPts > 0 && (e.clinch || /clinch a playoff spot$/.test(e.title)));
  const locks = locksSince(prev, me, events);
  const build = s => {
    const rows = s && s.ranks && s.totals
      ? DRAFT_TEAMS.filter(d => s.ranks[d.id]).map(d => ({
        id: d.id, name: d.name, rank: s.ranks[d.id], total: s.totals[d.id],
        locked: s.lockedTotals ? s.lockedTotals[d.id] : 0
      }))
      : null;
    return buildCards({
      games, clinches, locks, drafterName,
      summary: { me, prev, rows, awayMs: Date.now() - prev.at, at: Date.now() }
    });
  };
  const first = build(snap);
  // A cold launch can take longer than RANK_WAIT_MS to settle every input.
  // Without ranks a move is invisible, so keep waiting and say it later.
  const late = snap ? null : snapP.then(s => (s && s.ranks && s.totals ? build(s) : null));
  return { ...first, late };
}

// ---- Rendering ----

function initials(name){
  return String(name || '?').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

function cardHtml(card, flat){
  const meta = card.teamKey && TEAM_META[card.teamKey];
  let badgeHtml, color;
  // The summary's badge is your rank; before ranks load, your initials.
  if(card.kind === 'summary'){
    badgeHtml = card.rank ? rankBadgeHtml({ n: card.rank }) : uiTeamBadgeHtml({ text: initials(drafterName(currentProfileId)), style: NEUTRAL_BADGE_STYLE });
    color = 'var(--accent)';
  }
  else if(card.kind === 'series'){ badgeHtml = uiTeamBadgeHtml({ text: initials(drafterName(card.drafterId)), style: NEUTRAL_BADGE_STYLE }); color = 'var(--text-mute)'; }
  else if(meta){ badgeHtml = teamBadgeHtml(meta); color = meta.accent || 'var(--text-mute)'; }
  else { badgeHtml = leagueTileHtml(card.league); color = obLeagueColor(card.league); }
  const metaHtml = (card.locked ? tagHtml({ label: 'Locked', variant: 'locked' }) : '') + escapeHtml(card.meta.filter(Boolean).join(' · '));
  const statsHtml = card.stats && card.stats.length ? updateStatsHtml({ stats: card.stats }) : '';
  return updateCardHtml({ color, badgeHtml, title: card.title, body: card.body, metaHtml, corner: card.corner || '', statsHtml, flat });
}

function homeActive(){
  const v = document.getElementById('view-board');
  return !!v && v.classList.contains('active');
}

// Draft first, always: the draft card leads Home, or the room is live.
function draftLeads(){
  return !!ACTIVE_SEASON.preDraft || isDraftUpcoming() || isDraftPollOpen() || isDraftLiveNow();
}

// ---- The stack ----

function openStack(cards){
  if(document.querySelector('.update-stack')) return;
  const root = document.createElement('div');
  root.innerHTML = updateStackHtml({ title: TITLE, eyebrow: EYEBROW, cardsHtml: cards.map(c => cardHtml(c, false)).join(''), count: cards.length, onclear: 'sinceClearAll()' });
  const stack = root.firstElementChild;
  document.body.appendChild(stack);
  document.documentElement.classList.add('since-hold');
  lockBodyScroll();

  const host = stack.querySelector('.update-stack-cards');
  const els = [...host.children];
  const countEl = stack.querySelector('.update-stack-count');
  let idx = 0;
  let finished = false;

  const setT = (el, t) => { el.style.transition = t; el.style.transitionDelay = '0ms'; };
  const layout = () => els.forEach((c, j) => {
    const i = j - idx;
    if(i < 0) return;
    c.style.zIndex = String(10 - i);
    c.style.opacity = i < 3 ? '1' : '0';
    c.style.transform = `translateY(${i * 14}px) scale(${1 - i * 0.05})`;
  });

  const finish = () => {
    if(finished) return;
    finished = true;
    if(detachDrag){ detachDrag(); detachDrag = null; }
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      stack.classList.add('done');
      setTimeout(() => {
        stack.remove();
        unlockBodyScroll();
        document.documentElement.classList.remove('since-hold');
        cascadeHome();
        showPill(cards);
      }, 450);
    }, 250);
  };

  const out = (c, dir, dy = 0) => {
    setT(c, 'transform 460ms var(--ease-out), opacity 460ms var(--ease-out)');
    c.style.transform = `translate(${dir * 440}px, ${dy}px) rotate(${dir * 22}deg)`;
    c.style.opacity = '0';
    idx++;
    countEl.textContent = `${Math.min(idx + 1, els.length)} of ${els.length}`;
    els.forEach((x, j) => { if(j >= idx) setT(x, 'transform 520ms var(--ease-spring), opacity 300ms var(--ease-out)'); });
    layout();
    if(idx >= els.length) finish();
  };

  // Clear all: the rest go 110ms apart.
  window.sinceClearAll = () => {
    if(finished) return;
    const rest = els.slice(idx);
    rest.forEach((c, k) => setTimeout(() => out(c, 1), k * 110));
  };
  const onKey = e => { if(e.key === 'Escape') window.sinceClearAll(); };
  document.addEventListener('keydown', onKey);

  detachDrag = attachDrag(host, {
    slop: MOVE_SLOP,
    ignore: () => idx >= els.length,
    onStart: () => {
      const c = els[idx], next = els[idx + 1];
      setT(c, 'none');
      if(next) setT(next, 'none');
    },
    onMove: (axis, { dx, dy }) => {
      const c = els[idx], next = els[idx + 1];
      c.style.transform = `translate(${dx}px, ${dy * 0.25}px) rotate(${dx / 18}deg)`;
      if(next){
        const p = Math.min(1, Math.abs(dx) / 140);
        next.style.transform = `translateY(${14 - 14 * p}px) scale(${0.95 + 0.05 * p})`;
      }
    },
    onEnd: (axis, { dx, dy, vx, cancelled }) => {
      const dir = cancelled ? 0 : releaseDirection(dx, vx, { commit: SWIPE_COMMIT.card, fling: FLING_VELOCITY });
      if(dir){ out(els[idx], dir, dy * 0.25); return; }
      els.slice(idx, idx + 2).forEach(x => setT(x, 'transform 520ms var(--ease-spring)'));
      layout();
    }
  });

  // Deal in from below, 90ms apart from 200ms.
  host.getBoundingClientRect();
  els.forEach((c, j) => { c.style.transitionDelay = `${200 + j * 90}ms`; });
  layout();
}

// Home's rows come back up in a cascade, as after the launch splash.
function cascadeHome(){
  const rows = [...document.querySelectorAll('#view-board .filter-chips, #view-board .league-tab, #view-board .team')]
    .filter(el => el.getBoundingClientRect().top < window.innerHeight).slice(0, 12);
  stagger(rows, [{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { step: 45, duration: 520 });
}

// ---- The pill, and the sheet list (reduced motion) ----

function showPill(cards){
  const slot = document.getElementById('since-pill');
  if(!slot || !cards.length) return;
  pillCards = cards;
  slot.innerHTML = updatesPillHtml({ count: cards.length, onclick: 'openSinceUpdates()' });
  pop(slot.firstElementChild, { from: 0.4, duration: 500 });
}

function dropPill(){
  pillCards = null;
  const slot = document.getElementById('since-pill');
  if(slot) slot.innerHTML = '';
}

// Tapping the pill is seeing them: it goes, and the cards open once more.
window.openSinceUpdates = function(){
  const cards = pillCards;
  dropPill();
  if(!cards) return;
  if(fxOn()){ openStack(cards); return; }
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  if(!overlay || !content) return;
  content.innerHTML = `
    <div class="sheet-title-row">
      <div><div class="sheet-title">${TITLE}</div><div class="sheet-title-sub">${EYEBROW}</div></div>
      <button class="modal-close" onclick="closeModalSheet()" aria-label="Close">&times;</button>
    </div>
    <div class="update-list">${cards.map(c => cardHtml(c, true)).join('')}</div>`;
  openSheetOverlay(overlay);
  lockBodyScroll();
};

// ---- Boot ----

function splashGone(){
  if(!document.getElementById('launch-splash')) return Promise.resolve();
  return new Promise(resolve => {
    window.addEventListener('bx-splash-done', resolve, { once: true });
    setTimeout(resolve, SPLASH_WAIT_MS);
  });
}

async function check(){
  const prev = loadVisit();
  const me = currentProfileId;
  // No baseline yet (this device's first visit), or back too soon.
  if(!me || PRE_DRAFT || !prev || !isAwayLongEnough(prev.at, Date.now())) return;

  const [{ cards, prompt, late }, homeAt] = await Promise.all([gather(prev, me), splashGone().then(() => Date.now())]);
  if(draftLeads() || !once(`since:${prev.at}`)) return;
  // Ranks that landed after the wait: the pill, never a stack dropping in late.
  if(late) late.then(r => { if(r && r.cards.length && !draftLeads() && !document.querySelector('.update-stack')) showPill(r.cards); }).catch(() => {});
  if(!cards.length) return;

  // The stack only drops in for something notable, on a Home you haven't
  // started using yet.
  const drop = prompt && fxOn() && homeActive() && window.scrollY < 40 && !document.querySelector('.modal-overlay.open')
    && Date.now() - homeAt < SHOW_BUDGET_MS;
  if(drop) openStack(cards);
  else showPill(cards);
}

export function startSince(){
  check().catch(e => console.warn('[Since] check failed', e)).finally(() => {
    checked = true;
    saveVisit();
  });
  document.addEventListener('visibilitychange', () => {
    if(document.visibilityState !== 'hidden') return;
    saveVisit();
    dropPill();
  });
}
