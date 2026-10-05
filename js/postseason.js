/* ============================================================
   Postseason ladder (Standings → NFL / College FB / College BB / MLB /
   WNBA → Postseason), and the team page's Postseason section. Design: the
   "Postseason standings" handoff (Regular | Postseason toggle + Ladder,
   direction 4a/4b), and its NCAA Tournament addendum (option 3a).

   Once a league's playoff field is set, its Standings card gets a
   Regular | Postseason toggle. Regular is the card exactly as it was.
   Postseason is a ladder: every playoff team climbing from the first round
   to Champion, eliminated teams left grayed on the rung where they lost,
   with a scrubber to replay the rounds, a champion moment, and a table of
   each drafter's teams still alive (gold = locked, blue = still in play).
   Tapping a chip opens that team's page, whose Postseason section shows
   what was known at the ladder's stage.

   The bracket is ESPN's (fetchEspnPostseason in js/espn.js), turned into
   each stage's view by the pure js/postseason-math.js. It's only fetched
   while that league's postseason can be on (football December through
   February, the NCAA Tournament March and April, MLB late September
   through November); local dev and Pages previews can replay any winter
   with ?psyear=2025 (the 2025 MLB postseason, NFL playoffs and CFP, and
   the NCAA Tournament of March 2026).

   College Basketball differs in a few ways. Its ladder shows only drafted
   teams (68 chips would bury them), on a rung per round, the first rung
   ("Tournament") holding the First Four too and growing rows to fit.
   And its rules also score the drafted teams that missed the field
   (postseasonRuleTeams).

   MLB's and the WNBA's postseasons can be ones that don't count: while the
   league is still showing the season before the draft class's
   (PRIOR_SEASON_DISPLAY_LEAGUES in js/data.js), its ladder, Home card and team pages show the real
   postseason with who drafted each team, but no points anywhere, and say
   so (postseasonScores). Its scoring rules never read it.

   A rung's points show in gold once a team has reached it (in every
   league): they're locked for that team. Only reached rungs are on the
   ladder (topRung), so that's every rung showing.

   The ladder is updated in place (paint) while you scrub, so chips move
   with CSS transitions; a full Standings render rebuilds it settled, and
   keepPostseason/restorePostseason carry the live node across one when
   the bracket hasn't changed.
   ============================================================ */
import { TEAM_META, DRAFT_TEAMS, LEAGUE_SCORING, PRE_DRAFT, PRIOR_SEASON_DISPLAY_LEAGUES, leagueOf } from './data.js';
import { teamBadgeHtml, segmentedControlHtml, findCfbTeamKeyByLocation, NEUTRAL_BADGE_STYLE } from './utils.js';
import { teamBadgeHtml as uiBadgeHtml, tagHtml } from './ui.js';
import { escapeHtml } from './escape.js';
import { fetchEspnPostseason } from './espn.js';
import { findNflTeamKeyByEspnAbbr } from './standings-nfl.js';
import { findCbbTeamKeyByEspnId } from './standings-cbb.js';
import { findFlatTeamKey } from './standings-flat.js';
import { renderStandings, standingsDataChanged } from './board.js';
import { currentProfileId } from './identity.js';
import { canAnimateLive } from './motion.js';
import { fxOn, once, play, pop, later } from './motion-fx.js';
import { allowsGroupOverride } from './groups.js';
import { isLeagueLocked } from './season-lock.js';
import {
  POSTSEASON_LEAGUES, buildBracket, snapshot, latestStage, ladderLayout, ladderGeometry, topRung, matchups, finalRound, isMissRule,
  postseasonStarted, currentRoundName, titleGameDate
} from './postseason-math.js';

const RUNG_H = 84;
// The champion's chip as the crown card's logo: its badge doubled (52px),
// centered 42px in from the rung's left and top.
const CROWN = { x: 22, y: 29 };
const CROWN_SCALE = 2;
const REPLAY_STEP_MS = 1700;
const COUNT_DELAY_MS = 900, COUNT_MS = 900;

// ---- Which season, and when to look ----

// Local dev and Pages previews only (allowsGroupOverride): ?psyear=2025
// replays that season's postseason, and ?psreveal=1 replays the playoffs
// reveal on every load and every visit to the league's tab (on last
// season's postseason unless ?psyear says otherwise).
// Both stick on this device once set (a plain reload drops the query, and
// the preview pane reloads to its bare address); ?psreveal=0 / ?psyear=0
// turns one off again.
function previewParam(name){
  try {
    if(!allowsGroupOverride(window.location.hostname)) return null;
    const key = `bxPreview:${name}`;
    const fromUrl = new URLSearchParams(window.location.search).get(name);
    if(fromUrl === '0' || fromUrl === ''){ localStorage.removeItem(key); return null; }
    if(fromUrl){ localStorage.setItem(key, fromUrl); return fromUrl; }
    return localStorage.getItem(key);
  } catch (e){ return null; }
}
const REVEAL_REPLAY = previewParam('psreveal') === '1';

// ESPN names a football season by the year it starts and a college
// basketball season by the spring it ends in.
const springSeason = key => key === 'mcbb';

// ?psyear names a winter by the year it starts: ?psyear=2025 is the 2025
// NFL playoffs and CFP and the March 2026 NCAA Tournament (ESPN's 2026),
// so one replay shows all three. ?psreveal=1 without a ?psyear: last
// winter's.
function previewYear(key){
  let y = Number(previewParam('psyear'));
  if(!(y > 2000)){
    if(!REVEAL_REPLAY) return null;
    y = new Date().getFullYear() - 1;
  }
  return springSeason(key) ? y + 1 : y;
}

// ESPN's season year. Football's playoffs finish in the next calendar
// year, so January and February still belong to last year's season; a
// college basketball season belongs to the spring it ends in, so from
// August on it's next year's.
export function postseasonYear(key){
  const now = new Date();
  const y = now.getFullYear();
  return previewYear(key) ?? (springSeason(key) ? (now.getMonth() >= 7 ? y + 1 : y) : (now.getMonth() < 7 ? y - 1 : y));
}

// Football: December (the CFP field is set early in the month) through
// February (the Super Bowl). The NCAA Tournament: March (Selection
// Sunday) and April (the title game). MLB: from September 25 (the field
// is set in the season's last days) through November (the World Series
// ends by early November). The WNBA: from September 10 through October
// (the Finals end by mid-October). Outside them there's no postseason to
// fetch.
function inWindow(key){
  if(previewYear(key) !== null) return true;
  const now = new Date(), m = now.getMonth();
  if(key === 'mlb') return m === 9 || m === 10 || (m === 8 && now.getDate() >= 25);
  if(key === 'wnba') return m === 9 || (m === 8 && now.getDate() >= 10);
  return (springSeason(key) ? [2, 3] : [11, 0, 1]).includes(m);
}

// Does this postseason count for points? Not while the league is still
// showing the season before the draft class's (MLB's '26 postseason for
// the '27 class): the ladder and team pages then show no points at all.
export function postseasonScores(key){
  return !PRIOR_SEASON_DISPLAY_LEAGUES.includes(key);
}

// The year the reveal, Home card and labels name the postseason with: the
// class's season when it counts (seasonLabelYear), else ESPN's own.
function shownYear(key){
  return postseasonScores(key) ? seasonLabelYear(key) : postseasonYear(key);
}

// ---- Data ----

const STORE_KEY = 'bxPostseason';
const caches = {};

function cacheFor(key){
  const year = postseasonYear(key);
  if(caches[key] && caches[key].year === year) return caches[key];
  const c = { year, data: null, bracket: null, fetchedAt: 0, failedAt: 0, loading: false };
  try {
    const saved = JSON.parse(localStorage.getItem(`${STORE_KEY}:${key}:${year}`));
    if(saved && saved.data){
      c.data = saved.data;
      // Saved before the league logo was part of it: fetch again.
      c.fetchedAt = 'logo' in saved.data ? saved.fetchedAt || 0 : 0;
      c.bracket = buildBracket(key, saved.data.events, saved.data.seeds);
    }
  } catch (e){}
  caches[key] = c;
  return c;
}

// Quicker while games are on; slow once it's over or before the field is set.
function ttlMs(c){
  const b = c.bracket;
  if(!b) return 60 * 60 * 1000;
  if(latestStage(b) === finalRound(b.league)) return 6 * 60 * 60 * 1000;
  return b.games.some(g => g.live) ? 2 * 60 * 1000 : 10 * 60 * 1000;
}

const listeners = [];
export function onPostseasonData(fn){ listeners.push(fn); }

export function ensurePostseason(key, scoring = false){
  if(!POSTSEASON_LEAGUES[key] || !(inWindow(key) || scoring)) return;
  const c = cacheFor(key);
  const now = Date.now();
  if(c.loading || now - c.fetchedAt < ttlMs(c) || now - c.failedAt < 5 * 60 * 1000) return;
  c.loading = true;
  fetchEspnPostseason(key, c.year).then(data => {
    c.loading = false;
    if(!data){ c.failedAt = Date.now(); return; }
    c.data = data;
    c.bracket = buildBracket(key, data.events, data.seeds);
    c.fetchedAt = Date.now();
    try { localStorage.setItem(`${STORE_KEY}:${key}:${c.year}`, JSON.stringify({ data, fetchedAt: c.fetchedAt })); } catch (e){}
    standingsDataChanged();
    listeners.forEach(fn => fn(key));
  }, () => { c.loading = false; c.failedAt = Date.now(); });
}

// The year the reveal and Home card label the playoffs with: the draft
// class's own season for the league (its card's "'26 Season" → 2026), not
// ESPN's, so it always matches the label on the Standings card. A season
// across two years ("'26/'27") is named, like ESPN does, by the spring
// it ends in.
export function seasonLabelYear(key){
  const years = (leagueOf(key).season || '').match(/'(\d{2})/g) || [];
  const last = years[springSeason(key) ? years.length - 1 : 0];
  return last ? 2000 + Number(last.slice(1)) : postseasonYear(key);
}

// The league's logo for the playoffs reveal, each part as { light, dark }:
// { emblem, wordmark? }. The NFL's shield comes from ESPN; ESPN has no CFP
// logo, so the College Football Playoff's emblem and wordmark are ours
// (icons/cfp-*.png, cut from the CFP's light and dark artwork).
const CFP_LOGO = {
  emblem: { light: 'icons/cfp-emblem-light.png', dark: 'icons/cfp-emblem-dark.png' },
  wordmark: { light: 'icons/cfp-wordmark-light.png', dark: 'icons/cfp-wordmark-dark.png' }
};
// March Madness is one wide lockup (the NCAA disc, the words and the
// brackets) that reads on both themes: no separate word, no second file.
const NCAA_LOGO = {
  emblem: { light: 'icons/march-madness.png', dark: 'icons/march-madness.png' },
  lockup: true
};
// MLB's postseason lockup (the logo, "Postseason" and the year) is drawn
// for one year, so it's keyed by ESPN's season: a year without one has no
// logo (the title is the words alone). The dark file is the light-on-navy
// artwork with the navy taken out.
const MLB_LOGOS = {
  2026: { emblem: { light: 'icons/mlb-postseason-light.png', dark: 'icons/mlb-postseason-dark.png' }, lockup: true }
};
// The WNBA Playoffs lockup (the logo and the words, no year) is one
// artwork for every year: the league's own on-dark file (white words), and
// ours for light with the white turned black (the orange stays).
const WNBA_LOGO = {
  emblem: { light: 'icons/wnba-playoffs-light.svg', dark: 'icons/wnba-playoffs-dark.svg' },
  lockup: true
};
const LOGO_TITLE = { nfl: 'NFL Playoffs', cfb: 'College Football Playoff', mcbb: 'NCAA Tournament', mlb: 'MLB Postseason', wnba: 'WNBA Playoffs' };
export const postseasonTitle = key => LOGO_TITLE[key] || 'Playoffs';
// One logo part, both themes (CSS shows the one that matches).
export function logoImgsHtml(part){
  return `<img class="ps-logo-dark" src="${escapeHtml(part.dark)}" alt="" draggable="false"><img class="ps-logo-light" src="${escapeHtml(part.light)}" alt="" draggable="false">`;
}

// The ladder's title: the league logo with "Playoffs" (the CFP's own
// wordmark), the stage under it. Just the stage without a logo.
function ladderTitleHtml(key, S){
  const logo = postseasonLogo(key);
  const stage = `<div class="ps-stage">${escapeHtml(S.stageLabel)}</div>`;
  if(!logo) return stage;
  return `
    <div class="ps-brand">
      <div class="ps-brand-row" aria-label="${postseasonTitle(key)}">
        <span class="ps-brand-logo${logo.lockup ? ' lockup' : ''}">${logoImgsHtml(logo.emblem)}</span>
        ${logo.lockup ? '' : `<span class="ps-brand-word${logo.wordmark ? ' mark' : ''}">${logo.wordmark ? logoImgsHtml(logo.wordmark) : S.L.word || 'Playoffs'}</span>`}
      </div>
      ${stage}
    </div>`;
}

export function postseasonLogo(key){
  if(!bracketFor(key)) return null;
  if(key === 'cfb') return CFP_LOGO;
  if(key === 'mcbb') return NCAA_LOGO;
  if(key === 'mlb') return MLB_LOGOS[postseasonYear(key)] || null;
  if(key === 'wnba') return WNBA_LOGO;
  const logo = cacheFor(key).data && cacheFor(key).data.logo;
  return logo ? { emblem: logo } : null;
}

export function bracketFor(key){
  if(!POSTSEASON_LEAGUES[key] || !inWindow(key)) return null;
  return cacheFor(key).bracket;
}

// Scoring's own read of the bracket (getLeagueRuleTeams in js/league-facts.js):
// the teams that have earned one of the league's postseason rules, so those
// points need no commissioner mark. Reaching a round or winning the title can't
// be undone, so these are Locked the moment ESPN has the game final. Unlike
// the ladder it isn't limited to December through February: once the league's
// regular season is locked it keeps fetching (the saved copy then serves
// every visit), so a March total doesn't drop the Super Bowl. null = this rule
// isn't one ESPN can answer (or no data yet): the caller uses the marks alone.
// Only the class whose season is the one ESPN is serving.
// The NCAA's miss rule ("Don't make NCAA tournament") is every drafted
// team of the league that isn't in the field, from the moment it's set.
export function postseasonRuleTeams(key, rule){
  if(!POSTSEASON_LEAGUES[key] || PRE_DRAFT || !postseasonScores(key)) return null;
  if(seasonLabelYear(key) !== postseasonYear(key)) return null;
  if(isLeagueLocked(key)) ensurePostseason(key, true);
  const bracket = cacheFor(key).bracket;
  if(!bracket) return null;
  const s = snapshot(bracket, latestStage(bracket), { rules: LEAGUE_SCORING[key].rules, ownerOf: ownerOf(key) });
  if(isMissRule(key, rule)){
    const inField = new Set(s.teams.map(t => t.teamKey).filter(Boolean));
    return leagueOf(key).teams.filter(k => TEAM_META[k] && TEAM_META[k].draftTeamId && !TEAM_META[k].favoriteOnly && !inField.has(k));
  }
  if(!s.milestones.some(m => m.label === rule.label)) return null;
  return s.teams.filter(t => t.teamKey && t.milestones.find(m => m.label === rule.label).got).map(t => t.teamKey);
}

function ownerOf(key){
  return t => {
    const teamKey = key === 'nfl' ? findNflTeamKeyByEspnAbbr(t.abbr) : key === 'mcbb' ? findCbbTeamKeyByEspnId(t.id)
      : key === 'mlb' || key === 'wnba' ? findFlatTeamKey(key, t.name) : findCfbTeamKeyByLocation(t.location);
    const meta = teamKey && TEAM_META[teamKey];
    if(!meta) return null;
    return { teamKey, owner: PRE_DRAFT || meta.favoriteOnly ? null : meta.draftTeamId };
  };
}

// A postseason that doesn't count (postseasonScores) is read with no
// rules: no milestones, nothing locked or in play.
export function snap(key, stage){
  const scoring = LEAGUE_SCORING[key];
  return snapshot(bracketFor(key), stage, {
    rules: scoring && postseasonScores(key) ? scoring.rules : [],
    ownerOf: ownerOf(key),
    drafters: DRAFT_TEAMS.map(d => ({ id: d.id, name: d.name })),
    me: currentProfileId
  });
}

// The teams with a chip on the ladder (and in the reveal): every team in
// the field, but for the NCAA's 68 only the drafted ones (before the first
// draft, the ones in this class's pool).
export function ladderTeams(key, S){
  if(key !== 'mcbb') return S.teams;
  return S.teams.filter(t => t.owner || (PRE_DRAFT && t.teamKey && !TEAM_META[t.teamKey].favoriteOnly));
}

// ---- Per-league view state ----

// phase: null until picked (then it follows the default rule below).
// stage: null follows the latest completed round.
// spot: the spotlighted drafter.
const ui = {};
const uiFor = key => ui[key] || (ui[key] = { phase: null, stage: null, spot: null });

function stageOf(key){
  const latest = latestStage(bracketFor(key));
  const s = uiFor(key).stage;
  return s === null || s > latest ? latest : s;
}

// Has this device seen the league's playoffs reveal (js/postseason-reveal.js)
// for this season? Until it has, the card stays the plain regular one.
// With ?psreveal=1 it's remembered only until the league's tab is left
// (replayReveals) or the page reloads, and never stored.
const revealKey = key => `bxPsReveal:${key}:${postseasonYear(key)}`;
const replaySeen = new Set();
export function revealSeen(key){
  if(REVEAL_REPLAY) return replaySeen.has(key);
  try { return localStorage.getItem(revealKey(key)) === '1'; } catch (e){ return true; }
}
export function markRevealSeen(key){
  if(REVEAL_REPLAY){ replaySeen.add(key); return; }
  try { localStorage.setItem(revealKey(key), '1'); } catch (e){}
}
export function replayReveals(){
  if(REVEAL_REPLAY) replaySeen.clear();
}

// The playoff field is set (ESPN has a bracket): the card header makes
// room for the toggle.
export function postseasonFieldSet(key){
  return !!bracketFor(key);
}

// 'reg' | 'post', or null when there's no toggle: no field yet, or (on
// the league's own Standings tab) the reveal hasn't introduced it yet, so
// it can play there. On the All tab (`inAll`) there's no reveal: the card
// has its toggle from the moment the field is set. Either way the card
// opens on Postseason.
export function postseasonPhase(key, inAll = false){
  if(!bracketFor(key) || !(inAll || revealSeen(key))) return null;
  return uiFor(key).phase || 'post';
}

// The Home banner's tap (openPlayoffs in js/board.js): straight to the
// ladder at its latest round, whatever the card was last left on. The
// first time, the reveal plays there instead and ends on it.
export function openPostseason(key){
  stopReplay();
  cancelCount();
  const u = uiFor(key);
  u.phase = 'post';
  u.stage = null;
  u.spot = null;
}

// The ladder at the field set (where the reveal leaves it).
export function showFieldSet(key){
  uiFor(key).stage = latestStage(bracketFor(key)) === 0 ? null : 0;
}

// The reveal takes a toggle tap mid-flight (it ends there and applies it).
let phaseTap = null;
export function onPostseasonPhaseTap(fn){ phaseTap = fn; }

function setPhase(key, phase){
  if(phaseTap && phaseTap(key, phase)) return;
  stopReplay();
  cancelCount();
  uiFor(key).phase = phase;
  renderStandings();
}
window.psPhase_nfl = v => setPhase('nfl', v);
window.psPhase_cfb = v => setPhase('cfb', v);
window.psPhase_mcbb = v => setPhase('mcbb', v);
window.psPhase_mlb = v => setPhase('mlb', v);
window.psPhase_wnba = v => setPhase('wnba', v);

// Picking another league on Standings brings each ladder back to its
// latest round.
export function resetPostseasonStages(){
  stopReplay();
  cancelCount();
  Object.values(ui).forEach(u => { u.stage = null; u.spot = null; });
}

// ---- Markup ----

const nameOf = (t, key) => (t.teamKey ? TEAM_META[t.teamKey].name : POSTSEASON_LEAGUES[key].byLocation ? t.location : t.name) || t.abbr;

export function badgeOf(t){
  if(t.teamKey) return teamBadgeHtml(TEAM_META[t.teamKey]);
  return uiBadgeHtml({ crestSrc: t.logo, name: t.displayName || t.name, style: NEUTRAL_BADGE_STYLE, text: t.abbr });
}

export function ownerLabel(t){
  if(PRE_DRAFT) return '';
  return t.mine ? 'You' : t.ownerName || '—';
}

export function postseasonToggleHtml(key, phase = postseasonPhase(key)){
  if(!phase) return '';
  return `<div class="ps-phase">${segmentedControlHtml([{ key: 'reg', label: 'Regular' }, { key: 'post', label: 'Postseason' }], phase, `psPhase_${key}`)}</div>`;
}

function rungClass(k, S){
  const frontier = S.champ && S.stage === S.N ? S.N : S.stage;
  return k === frontier ? (k === S.N ? 'frontier champ' : 'frontier') : k < frontier ? 'below' : 'above';
}

// Only rungs someone has reached show (topRung); one above them waits
// just over the ladder's top, so it slides down into place as it appears.
function rungClasses(k, S, top){
  const crowned = k === S.N && S.champ && S.stage === S.N;
  return `ps-rung ${rungClass(k, S)}${k > top ? ' unset' : ''}${crowned ? ' crowned' : ''}`;
}
// Where each rung sits and how tall it is (ladderGeometry: the NCAA's
// first rung grows a row for every six drafted teams on it).
function rungStyle(k, geo){
  return `transform:translateY(${geo.tops[k]}px);height:${geo.heights[k]}px`;
}

function rungPts(k, S){
  const m = S.milestones.filter(x => k === S.N ? x.win : !x.win && (x.reach === k + 1 || (k === 0 && x.reach === 0)));
  return m.length ? `+${m.reduce((s, x) => s + x.pts, 0)}` : '';
}

// The ladder's teams, rungs and chip spots at this stage.
function ladderOf(key, S){
  const teams = ladderTeams(key, S);
  const top = topRung(teams);
  const opts = { rungH: RUNG_H, top, games: S.games };
  return {
    teams, top,
    geo: ladderGeometry(teams, { ...opts, rungs: S.N + 1 }),
    pos: ladderLayout(teams, { ...opts, crown: CROWN, champRung: S.N })
  };
}

// One chip's look at this stage: its classes and where it sits.
function chipView(t, pos, spot){
  const p = pos[t.id];
  const out = !t.alive;
  const scale = t.champion ? CROWN_SCALE : out ? 0.88 : 1;
  const cls = ['ps-chip'];
  if(out) cls.push('out');
  if(t.justOut) cls.push('just-out');
  if(t.champion) cls.push('champ');
  if(t.mine) cls.push('mine');
  if(spot && t.owner !== spot) cls.push('dim');
  if(t.teamKey) cls.push('tap');
  const x = p.x != null ? `${p.x}px` : `calc((100cqw - var(--ps-label-w)) * ${p.fx.toFixed(4)} - 20px)`;
  return { cls: cls.join(' '), transform: `translate(${x}, ${p.y}px) scale(${scale})` };
}

// A small gray "v" between the two sides of each game still to play, so the
// pairs read as matchups without boxing anything in.
function pairsHtml(teams, S, pos){
  const lane = '(100cqw - var(--ps-label-w))';
  return matchups(teams, S.games).map(([a, b]) => {
    const pa = pos[a.id], pb = pos[b.id];
    if(!pa || !pb || pa.y !== pb.y) return '';
    return `<span class="ps-vs" style="transform:translate(calc(${lane} * ${((pa.fx + pb.fx) / 2).toFixed(4)} - 6px), ${pa.y + 7}px)">v</span>`;
  }).join('');
}

function chipHtml(key, t, pos, spot){
  const v = chipView(t, pos, spot);
  const tap = t.teamKey ? ` onclick="psTeam('${key}','${t.id}');openTeamPage('${t.teamKey}','standings',this)"` : '';
  return `
    <${t.teamKey ? 'button type="button"' : 'div'} class="${v.cls}" data-team="${t.id}" style="transform:${v.transform}"${tap} aria-label="${escapeHtml(nameOf(t, key))}">
      <span class="ps-chip-badge">${badgeOf(t)}</span>
      <span class="ps-chip-owner">${escapeHtml(ownerLabel(t))}</span>
    </${t.teamKey ? 'button' : 'div'}>`;
}

// The champion card's contents come from the finished bracket, so they
// don't change while scrubbing; only whether it's showing does.
function champInfo(key){
  const F = snap(key, finalRound(key));
  const t = F.champ;
  if(!t) return null;
  const owner = t.owner ? F.drafters.find(d => d.id === t.owner) : null;
  const final = F.games.find(g => g.round === F.N);
  return {
    t,
    title: key === 'nfl' ? `${(final && final.note) || 'Super Bowl'} champions` : F.L.champTitle,
    // Just whose team it is ("You" in gold for your own); each drafter's
    // total stays in the drafted table below.
    ownerLine: owner ? (owner.me ? 'You' : owner.name) : 'Undrafted',
    mine: !!(owner && owner.me),
    // What winning the title itself is worth (the rule for the final win);
    // nothing for a postseason that doesn't count.
    pts: owner && postseasonScores(key) ? F.milestones.filter(m => m.win).reduce((n, m) => n + m.pts, 0) : null
  };
}

// The Champion rung's crown card: once there's a champion, the rung becomes
// it, the champion's own chip (doubled) as its logo, then the title, the
// team, its owner and what the title win itself is worth, counting up.
function crownHtml(key, S){
  const c = champInfo(key);
  if(!c) return '';
  const show = S.stage === S.N && !!S.champ;
  return `
    <div class="ps-crown">
      <div class="ps-crown-text">
        <div class="ps-champ-eyebrow">${escapeHtml(c.title)}</div>
        <div class="ps-champ-name">${escapeHtml(nameOf(c.t, key))}</div>
        <div class="ps-champ-owner${c.mine ? ' me' : ''}">${escapeHtml(c.ownerLine)}</div>
      </div>
      ${c.pts !== null && !PRE_DRAFT ? `<div class="ps-champ-pts" data-target="${c.pts}">+${show ? c.pts : 0}</div>` : ''}
    </div>`;
}

function scrubHtml(key, S){
  // Each stop is named for the row it highlights (the rung the alive teams
  // have reached at that stage): Field, then the next round, … Champ.
  const stops = ['Field', ...S.L.roundShort.slice(1), 'Champ'];
  return `
    <div class="ps-scrub" data-ps-scrub="${key}" role="slider" tabindex="0" aria-label="Replay the postseason"
      aria-valuemin="0" aria-valuemax="${S.latest}" aria-valuenow="${S.stage}" aria-valuetext="${escapeHtml(S.stageLabel)}" style="--f:${S.stage / S.N}">
      <div class="ps-rail"></div>
      <div class="ps-fill"></div>
      <div class="ps-thumb"></div>
      <div class="ps-stops">${stops.map((l, i) => `<span class="${i === S.stage ? 'on' : ''}${i > S.latest ? ' later' : ''}">${l}</span>`).join('')}</div>
    </div>`;
}

function replayLabel(key){
  return replaying && replaying.key === key ? 'Stop' : 'Replay ▸';
}

// The card body under the Standings header while Postseason is picked.
export function postseasonCardHtml(key){
  maybeRevealChampion(key);
  const S = snap(key, stageOf(key));
  const spot = uiFor(key).spot;
  const { teams, top, geo, pos } = ladderOf(key, S);
  const rungs = S.L.rungs.map((_, i) => S.N - i).map(k => `
    <div class="${rungClasses(k, S, top)}" data-rung="${k}" style="${rungStyle(k, geo)}">
      <div class="ps-rung-label"><span>${S.L.rungs[k]}</span><span class="ps-rung-pts">${rungPts(k, S)}</span></div>
      ${k === S.N ? crownHtml(key, S) : ''}
    </div>`).join('');
  return `
    <div class="ps" data-ps="${key}" data-sig="${sigOf(key)}">
      <div class="ps-head">
        ${ladderTitleHtml(key, S)}
        ${S.latest > 0 ? `<button type="button" class="ps-replay" onclick="psReplay('${key}')">${replayLabel(key)}</button>` : ''}
      </div>
      <div class="ps-ladder" style="height:${geo.height}px">
        ${rungs}
        <div class="ps-pairs">${pairsHtml(teams, S, pos)}</div>
        ${teams.map(t => chipHtml(key, t, pos, spot)).join('')}
        ${teams.length ? '' : '<div class="ps-empty">No drafted teams made the field.</div>'}
      </div>
      ${scrubHtml(key, S)}
    </div>`;
}

// A postseason that doesn't count has no points columns, and its note
// says so instead of explaining the colors.
function draftedRowsHtml(key, S){
  const spot = uiFor(key).spot;
  const scores = postseasonScores(key);
  const rows = S.drafters.filter(d => d.alive.length);
  const gone = S.drafters.filter(d => d.inField && !d.alive.length);
  const rowsHtml = rows.map(d => `
    <button type="button" class="ps-drow${spot === d.id ? ' on' : ''}${d.me ? ' me' : ''}" onclick="psSpot('${key}','${d.id}')" aria-pressed="${spot === d.id}">
      <span class="ps-dname">${d.me ? 'You' : escapeHtml(d.name)}</span>
      <span class="ps-dteams">${d.alive.map(badgeOf).join('')}</span>
      ${scores ? `<span class="ps-dbank">+${d.banked}</span>
      <span class="ps-dplay">${d.inPlay ? `+${d.inPlay}` : ''}</span>` : ''}
    </button>`).join('');
  const out = gone.length ? `Out: ${gone.map(d => d.me ? 'You' : escapeHtml(d.name)).join(', ')}. ` : '';
  return {
    table: rowsHtml || '<div class="ps-dempty">No drafted teams left.</div>',
    note: `${out}${scores ? 'Gold is locked; blue is still in play.' : `The ${postseasonYear(key)} postseason doesn’t count for points.`}`
  };
}

// The drafted table under the card: every drafter with a team still
// alive, tap one to spotlight their chips. Nothing before the first draft.
export function postseasonDraftedHtml(key){
  if(PRE_DRAFT) return '';
  const S = snap(key, stageOf(key));
  if(!S.drafters.some(d => d.inField)) return '';
  const { table, note } = draftedRowsHtml(key, S);
  return `
    <div class="ps-drafted" data-ps-drafted="${key}">
      <div class="ps-drafted-head"><span>Drafted · still climbing</span><span>Tap to spotlight</span></div>
      <div class="ps-drafted-table">${table}</div>
      <div class="ps-drafted-note">${note}</div>
    </div>`;
}

// ---- Updating in place ----

function paint(key){
  const el = document.querySelector(`.ps[data-ps="${key}"]`);
  if(!el){ if(replaying && replaying.key === key) stopReplay(); return; }
  const S = snap(key, stageOf(key));
  const spot = uiFor(key).spot;
  const { teams, top, geo, pos } = ladderOf(key, S);
  el.querySelector('.ps-stage').textContent = S.stageLabel;
  el.querySelector('.ps-ladder').style.height = `${geo.height}px`;
  const replay = el.querySelector('.ps-replay');
  if(replay) replay.textContent = replayLabel(key);
  el.querySelectorAll('.ps-rung').forEach(r => {
    const k = Number(r.dataset.rung);
    r.className = rungClasses(k, S, top);
    r.style.transform = `translateY(${geo.tops[k]}px)`;
    r.style.height = `${geo.heights[k]}px`;
  });
  const pairs = el.querySelector('.ps-pairs');
  const pairsNow = pairsHtml(teams, S, pos);
  if(pairs && pairs.dataset.html !== pairsNow){
    pairs.innerHTML = pairsNow;
    pairs.dataset.html = pairsNow;
  }
  teams.forEach(t => {
    const chip = el.querySelector(`.ps-chip[data-team="${t.id}"]`);
    if(!chip) return;
    const v = chipView(t, pos, spot);
    chip.className = v.cls;
    chip.style.transform = v.transform;
  });
  const show = S.stage === S.N && !!S.champ;
  const pts = el.querySelector('.ps-champ-pts');
  if(pts && !counting) pts.textContent = `+${show ? pts.dataset.target : 0}`;
  const scrub = el.querySelector('.ps-scrub');
  scrub.style.setProperty('--f', S.stage / S.N);
  scrub.setAttribute('aria-valuenow', S.stage);
  scrub.setAttribute('aria-valuetext', S.stageLabel);
  scrub.querySelectorAll('.ps-stops span').forEach((s, i) => s.classList.toggle('on', i === S.stage));
  const drafted = document.querySelector(`.ps-drafted[data-ps-drafted="${key}"]`);
  if(drafted){
    const { table, note } = draftedRowsHtml(key, S);
    drafted.querySelector('.ps-drafted-table').innerHTML = table;
    drafted.querySelector('.ps-drafted-note').innerHTML = note;
  }
}

function setStage(key, s){
  const latest = latestStage(bracketFor(key));
  s = Math.max(0, Math.min(latest, s));
  const prev = stageOf(key);
  if(s === prev) return;
  uiFor(key).stage = s === latest ? null : s;
  if(prev === finalRound(key)) cancelCount();
  paint(key);
  if(s === finalRound(key)) playChampion(key);
}

window.psSpot = (key, id) => {
  const u = uiFor(key);
  u.spot = u.spot === id ? null : id;
  paint(key);
};

// ---- Replay ----

let replaying = null; // { key, timer }

function stopReplay(){
  if(!replaying) return;
  clearInterval(replaying.timer);
  const { key } = replaying;
  replaying = null;
  const btn = document.querySelector(`.ps[data-ps="${key}"] .ps-replay`);
  if(btn) btn.textContent = replayLabel(key);
}

window.psReplay = key => {
  if(replaying && replaying.key === key){ stopReplay(); return; }
  stopReplay();
  const latest = latestStage(bracketFor(key));
  if(!latest) return;
  replaying = { key, timer: null };
  if(stageOf(key) === 0) paint(key);
  else setStage(key, 0);
  replaying.timer = setInterval(() => {
    const s = stageOf(key);
    if(s >= latest || !document.querySelector(`.ps[data-ps="${key}"]`)){ stopReplay(); return; }
    setStage(key, s + 1);
    if(s + 1 >= latest) stopReplay();
  }, REPLAY_STEP_MS);
  const btn = document.querySelector(`.ps[data-ps="${key}"] .ps-replay`);
  if(btn) btn.textContent = replayLabel(key);
};

// ---- Scrubber: drag or tap to the nearest stop, arrow keys too ----

let drag = null;
function stageAt(scrub, x){
  const r = scrub.getBoundingClientRect();
  return Math.round(((x - r.left - 14) / Math.max(1, r.width - 28)) * finalRound(scrub.dataset.psScrub));
}
document.addEventListener('pointerdown', e => {
  const scrub = e.target.closest && e.target.closest('.ps-scrub');
  if(!scrub) return;
  stopReplay();
  drag = { key: scrub.dataset.psScrub, id: e.pointerId };
  try { scrub.setPointerCapture(e.pointerId); } catch (err){}
  setStage(drag.key, stageAt(scrub, e.clientX));
});
document.addEventListener('pointermove', e => {
  if(!drag || e.pointerId !== drag.id) return;
  // A release that never reached us (the pointer left the window, say):
  // a hover with no button down ends the drag instead of scrubbing.
  if(!e.buttons){ drag = null; return; }
  const scrub = document.querySelector(`.ps-scrub[data-ps-scrub="${drag.key}"]`);
  if(scrub) setStage(drag.key, stageAt(scrub, e.clientX));
});
const endDrag = e => { if(drag && e.pointerId === drag.id) drag = null; };
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', e => {
  const scrub = e.target.closest && e.target.closest('.ps-scrub');
  if(!scrub) return;
  const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key];
  if(!d) return;
  e.preventDefault();
  stopReplay();
  setStage(scrub.dataset.psScrub, stageOf(scrub.dataset.psScrub) + d);
});

// ---- Champion moment ----

let counting = null; // { raf, timer }

function cancelCount(){
  if(!counting) return;
  cancelAnimationFrame(counting.raf);
  clearTimeout(counting.timer);
  counting = null;
}

// The champion springs up into the Champion rung's crown card, growing into
// its logo (CSS). Once it has landed,
// a soft gold bloom swells behind its crest and three thin rings ripple out
// from the crest's center, one pass each, while the crest gives a gentle
// pop and the Champion rung, now the crown card, pops and lights up while
// the title's points count up in it.
// Every time stage 4 is reached. The bloom and rings are transform and
// opacity only (smooth on the compositor), placed from the crest's landed
// position so they never chase a moving chip; reduced motion skips them.
const LAND_MS = 900; // the chip's 250ms delay + its spring settling
function playChampion(key){
  const el = document.querySelector(`.ps[data-ps="${key}"]`);
  const chip = el && el.querySelector('.ps-chip.champ');
  if(!chip || !canAnimateLive()) return;
  const crest = chip.querySelector('.ps-chip-badge');
  later(LAND_MS, () => {
    if(!crest.isConnected || !chip.classList.contains('champ') || !fxOn()) return;
    const ladder = el.querySelector('.ps-ladder');
    const lr = ladder.getBoundingClientRect(), cr = crest.getBoundingClientRect();
    const fx = document.createElement('div');
    fx.className = 'ps-fx';
    fx.setAttribute('aria-hidden', 'true');
    fx.style.transform = `translate(${cr.left - lr.left + cr.width / 2}px, ${cr.top - lr.top + cr.height / 2}px)`;
    fx.innerHTML = '<span class="ps-bloom"></span>' + '<span class="ps-ring"></span>'.repeat(3);
    ladder.insertBefore(fx, ladder.querySelector('.ps-chip'));
    const anims = [
      play(fx.querySelector('.ps-bloom'), [
        { opacity: 0, transform: 'scale(0.4)' },
        { opacity: 1, transform: 'scale(1.15)', offset: 0.35 },
        { opacity: 0, transform: 'scale(1.8)' }
      ], { duration: 1300, fill: 'both' }),
      ...[...fx.querySelectorAll('.ps-ring')].map((ring, i) => play(ring, [
        { opacity: 0.9, transform: 'scale(1)' },
        { opacity: 0, transform: 'scale(2.3)' }
      ], { duration: 1400, delay: i * 240, fill: 'both' }))
    ];
    pop(crest, { scale: 1.1, duration: 560 });
    // The Champion rung pops: the whole box swells a little and springs back
    // while it lights up, an extra layer of gold with a gold edge and a soft
    // glow outside it fading in and out under its label (opacity only).
    const rung = el.querySelector(`.ps-rung[data-rung="${finalRound(key)}"]`);
    if(rung){
      const base = rung.style.transform || 'none';
      const at = k => base === 'none' ? `scale(${k})` : `${base} scale(${k})`;
      anims.push(play(rung, [
        { transform: at(1) }, { transform: at(1.045), offset: 0.3 }, { transform: at(0.995), offset: 0.7 }, { transform: at(1) }
      ], { duration: 760, easing: 'ease-out' }));
      const flash = document.createElement('span');
      flash.className = 'ps-rung-flash';
      rung.prepend(flash);
      const a = play(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1200, fill: 'both' });
      anims.push(a);
      if(a) a.finished.then(() => flash.remove(), () => flash.remove());
      else flash.remove();
    }
    Promise.all(anims.map(a => a && a.finished)).then(() => fx.remove(), () => fx.remove());
  });
  const pts = el.querySelector('.ps-champ-pts');
  if(!pts) return;
  cancelCount();
  const target = Number(pts.dataset.target) || 0;
  pts.textContent = '+0';
  counting = { raf: 0, timer: 0 };
  counting.timer = setTimeout(() => {
    const t0 = performance.now();
    const tick = now => {
      const p = Math.min(1, (now - t0) / COUNT_MS);
      if(pts.isConnected) pts.textContent = `+${Math.round(target * (1 - Math.pow(1 - p, 3)))}`;
      if(p < 1) counting.raf = requestAnimationFrame(tick);
      else counting = null;
    };
    counting.raf = requestAnimationFrame(tick);
  }, COUNT_DELAY_MS);
}

// The first time this device sees a finished postseason's ladder, it opens
// on the final round and the champion climbs in.
let revealPending = null;
function maybeRevealChampion(key){
  const N = finalRound(key);
  if(revealPending || uiFor(key).stage !== null || latestStage(bracketFor(key)) !== N || !fxOn()) return;
  if(!once(`ps-champ:${key}:${postseasonYear(key)}`)) return;
  uiFor(key).stage = N - 1;
  revealPending = setTimeout(() => { revealPending = null; setStage(key, N); }, 700);
}

// ---- Surviving a Standings re-render ----

function sigOf(key){
  const c = cacheFor(key);
  return `${key}:${c.year}:${c.fetchedAt}:${currentProfileId}`;
}

// Before Standings rebuilds: the ladders on screen. After: put each one
// back in place of its fresh copy if the bracket is the same, so a chip
// mid-climb or the champion moment isn't cut off.
export function keepPostseason(container){
  return [...container.querySelectorAll('.ps[data-ps]')].map(el => ({ el, drafted: container.querySelector(`.ps-drafted[data-ps-drafted="${el.dataset.ps}"]`) }));
}
export function restorePostseason(container, kept){
  kept.forEach(({ el, drafted }) => {
    const fresh = container.querySelector(`.ps[data-ps="${el.dataset.ps}"]`);
    if(!fresh || fresh.dataset.sig !== el.dataset.sig) return;
    // A reveal cut short leaves its arrival classes behind: drop them.
    el.classList.remove('ps-arriving', 'ps-rungs-in', 'ps-pts-wait');
    fresh.replaceWith(el);
    const freshDrafted = container.querySelector(`.ps-drafted[data-ps-drafted="${el.dataset.ps}"]`);
    if(drafted && freshDrafted) freshDrafted.replaceWith(drafted);
    paint(el.dataset.ps);
  });
}

// ---- Home: the postseason banner ----

// "Field set · 2026"; the NCAA's field is set on Selection Sunday.
export function fieldSetEyebrow(key){
  return `${key === 'mcbb' ? 'Selection Sunday' : 'Field set'} · ${shownYear(key)}`;
}

// Home leads with a card for each league whose postseason is on, for as
// long as it's on (and a week past the title game, with the champion):
// the league's logo, the round being played or up next in the eyebrow
// ("Sweet 16 · 2027", "Selection Sunday" / "Field set" before the first
// game), "NFL Playoffs", and the viewer's own count: teams in
// before anything's played, teams left after. Their teams still alive
// sit at the right, ringed in gold. A tap opens Standings on that league
// (openPlayoffs in js/board.js), where the reveal plays the first time
// and the ladder opens after that.
const CHAMPION_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
export function postseasonHomeHtml(leagueKeys){
  return leagueKeys.filter(key => POSTSEASON_LEAGUES[key]).map(key => {
    ensurePostseason(key);
    const bracket = bracketFor(key);
    if(!bracket) return '';
    const S = snap(key, latestStage(bracket));
    const round = currentRoundName(bracket);
    // A week of the champion, then gone (a ?psyear replay keeps it).
    const crowned = titleGameDate(bracket);
    if(round === 'Champion' && previewYear(key) === null && crowned && Date.now() - crowned.getTime() > CHAMPION_WEEK_MS) return '';
    const started = postseasonStarted(bracket);
    const mineIn = S.teams.filter(t => t.mine);
    const mine = mineIn.filter(t => t.alive).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
    const logo = postseasonLogo(key);
    const title = postseasonTitle(key);
    const eyebrow = round === 'Champion' ? `${S.stageLabel} · ${shownYear(key)}` : round ? `${round} · ${shownYear(key)}` : fieldSetEyebrow(key);
    // Once there's a champion the eyebrow says it all: no sub line.
    const sub = round === 'Champion' ? ''
      : PRE_DRAFT || !currentProfileId
      ? (started ? `${plural(S.teams.filter(t => t.alive).length, 'team', 'teams')} left` : `${S.teams.length} teams are in`)
      : !mineIn.length ? 'None of your teams made it'
      : !started ? `You have ${plural(mineIn.length, 'team', 'teams')} in`
      : mine.length ? `You have ${plural(mine.length, 'team', 'teams')} left`
      : 'None of your teams left';
    // A postseason that doesn't count says so under the title.
    const noPts = postseasonScores(key) ? '' : 'Doesn’t count for points';
    return `
      <button type="button" class="ps-home" onclick="openPlayoffs('${key}')">
        ${logo ? `<span class="ps-home-logo${logo.lockup ? ' lockup' : ''}">${logoImgsHtml(logo.emblem)}</span>` : ''}
        <span class="ps-home-text">
          <span class="ps-home-eyebrow">${escapeHtml(eyebrow)}</span>
          <span class="ps-home-title">${title}</span>
          ${sub ? `<span class="ps-home-sub">${sub}</span>` : ''}
          ${noPts ? `<span class="ps-home-sub">${noPts}</span>` : ''}
        </span>
        ${mine.length ? `<span class="ps-home-teams">${mine.slice(0, 4).map(t => `<span class="ps-home-team">${badgeOf(t)}</span>`).join('')}</span>` : ''}
        <span class="ps-home-go" aria-hidden="true">&rsaquo;</span>
      </button>`;
  }).join('');
}

// ---- Team page: the Postseason section ----

// A chip tap passes its stage to the page it opens (psTeam, then the
// page's own open calls postseasonTeamOpened). Opened any other way, the
// page shows the latest.
let pendingTeam = null, activeTeam = null;
window.psTeam = (key, id) => {
  const t = bracketFor(key) && snap(key, stageOf(key)).byId[id];
  pendingTeam = t && t.teamKey ? { teamKey: t.teamKey, stage: stageOf(key) } : null;
};
export function postseasonTeamOpened(teamKey){
  activeTeam = pendingTeam && pendingTeam.teamKey === teamKey ? pendingTeam : null;
  pendingTeam = null;
}

function stepHtml({ dot, label, html, result = '', tone = '' }){
  return `
    <div class="ps-step">
      <span class="ps-step-dot ${dot}"></span>
      <div class="ps-step-main">
        <div class="ps-step-label">${label}</div>
        <div class="ps-step-title">${html}</div>
      </div>
      <div class="ps-step-result ${tone}">${result}</div>
    </div>`;
}

// What this team's postseason looks like: Status / Locked / In play, its
// path game by game, and each postseason rule as locked, in play or
// missed. Empty for a team outside the field (or out of season).
export function postseasonTeamHtml(teamKey){
  const meta = TEAM_META[teamKey];
  const key = meta && meta.leagueKey;
  if(!POSTSEASON_LEAGUES[key]) return '';
  ensurePostseason(key);
  if(!bracketFor(key)) return '';
  const ctx = activeTeam && activeTeam.teamKey === teamKey ? activeTeam : null;
  const S = snap(key, ctx ? ctx.stage : latestStage(bracketFor(key)));
  const t = S.teams.find(x => x.teamKey === teamKey);
  if(!t) return '';

  const asOf = S.stage < S.latest ? ` · ${S.L.stages[S.stage]}` : '';
  const seed = [t.seed ? `#${t.seed} seed` : '', t.conf, t.record ? `· ${t.record}` : ''].filter(Boolean).join(' ');
  const steps = [stepHtml({ dot: 'field', label: 'Field', html: `<span>${escapeHtml(seed || 'In the field')}</span>`, result: t.isBye ? 'Bye' : '', tone: 'sub' })];
  t.path.forEach(g => {
    const meTop = g.top.team === t;
    const me = meTop ? g.top : g.bot, op = meTop ? g.bot : g.top;
    const label = g.roundName + (g.note && g.note !== g.roundName ? ` · ${g.note}` : '');
    const vs = op.team ? `${badgeOf(op.team)}<span>vs ${escapeHtml(nameOf(op.team, key))}</span>` : '<span>vs TBD</span>';
    if(g.final){
      steps.push(stepHtml({ dot: me.won ? 'win' : 'loss', label: escapeHtml(label), html: vs, result: `${me.won ? 'W' : 'L'} ${me.score}–${op.score}${g.ot ? ' OT' : ''}`, tone: me.won ? 'win' : 'loss' }));
    } else if(g.begun && S.isLatest && S.L.series){
      // A series under way: its tally so far.
      const mine = meTop ? g.scoreA : g.scoreB, theirs = meTop ? g.scoreB : g.scoreA;
      const tally = `${mine > theirs ? 'Leads' : mine < theirs ? 'Trails' : 'Tied'} ${mine}–${theirs}`;
      steps.push(stepHtml({ dot: g.live ? 'live' : 'next', label: escapeHtml(label), html: vs, result: g.live ? `Live · ${tally}` : tally, tone: g.live ? 'live' : 'next' }));
    } else {
      steps.push(stepHtml({ dot: g.live ? 'live' : 'next', label: escapeHtml(label), html: vs, result: g.live ? 'Live' : 'Next', tone: g.live ? 'live' : 'next' }));
    }
  });
  if(t.champion){
    const final = S.games.find(g => g.round === S.N);
    steps.push(stepHtml({ dot: 'champ', label: 'Champion', html: `<span>${key === 'nfl' ? `Won ${escapeHtml((final && final.note) || 'the Super Bowl')}` : escapeHtml(S.L.champTitle)}</span>`, tone: 'accent' }));
  }

  const rules = t.milestones.map(m => `
    <div class="ps-ms${m.possible ? '' : ' missed'}">
      <span class="ps-ms-label">${escapeHtml(m.label)}</span>
      <span class="ps-ms-pts">+${m.pts}</span>
      <span class="ps-ms-state">${m.got ? tagHtml({ label: 'Locked', variant: 'locked' }) : m.possible ? tagHtml({ label: 'In play', variant: 'live' }) : 'Missed'}</span>
    </div>`).join('');

  const cell = (lbl, val, cls) => `<div class="stat-cell"><div class="num ${cls}">${val}</div><div class="lbl">${lbl}</div></div>`;
  // A postseason that doesn't count: the rounds won instead of points,
  // and a plain "No" for whether it counts.
  const scores = postseasonScores(key);
  const won = t.path.filter(g => g.final && (g.top.team === t ? g.top : g.bot).won).length;
  return `
    <div class="modal-section-title">${escapeHtml(scores ? 'Postseason' : `${postseasonYear(key)} Postseason`)}${escapeHtml(asOf)}</div>
    <div class="ps-tp-strip">
      ${cell('Status', escapeHtml(t.status), t.champion ? 'accent' : t.alive ? '' : 'mute')}
      ${scores ? cell('Locked', `+${t.banked}`, 'accent') : cell(S.L.series ? 'Series won' : 'Rounds won', won, '')}
      ${scores ? cell('In play', `+${t.inPlay}`, 'prov') : cell('Counts', 'No', 'mute')}
    </div>
    <div class="ps-tp-card">${steps.join('')}</div>
    ${t.milestones.length ? `<div class="modal-section-title spaced">Postseason points</div><div class="ps-tp-card ps-ms-list">${rules}</div>` : ''}
    <div class="ps-tp-gap"></div>`;
}
