/* ============================================================
   Postseason ladder (Standings → NFL / College FB → Postseason), and the
   team page's Postseason section. Design: the "Postseason standings"
   handoff (Regular | Postseason toggle + Ladder, direction 4a/4b).

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
   December through February, when one of these postseasons can be on;
   local dev and Pages previews can replay any season with ?psyear=2025.

   The ladder is updated in place (paint) while you scrub, so chips move
   with CSS transitions; a full Standings render rebuilds it settled, and
   keepPostseason/restorePostseason carry the live node across one when
   the bracket hasn't changed.
   ============================================================ */
import { TEAM_META, DRAFT_TEAMS, LEAGUE_SCORING, PRE_DRAFT } from './data.js';
import { teamBadgeHtml, segmentedControlHtml, findCfbTeamKeyByLocation, NEUTRAL_BADGE_STYLE } from './utils.js';
import { teamBadgeHtml as uiBadgeHtml, tagHtml } from './ui.js';
import { escapeHtml } from './escape.js';
import { fetchEspnPostseason } from './espn.js';
import { findNflTeamKeyByEspnAbbr } from './standings-nfl.js';
import { renderStandings, standingsDataChanged } from './board.js';
import { currentProfileId } from './identity.js';
import { canAnimateLive } from './motion.js';
import { fxOn, once } from './motion-fx.js';
import { allowsGroupOverride } from './groups.js';
import {
  POSTSEASON_LEAGUES, buildBracket, snapshot, latestStage, ladderLayout, topRung
} from './postseason-math.js';

const RUNG_H = 84;
const STAGES = 4;
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

function previewYear(){
  const y = Number(previewParam('psyear'));
  if(y > 2000) return y;
  return REVEAL_REPLAY ? new Date().getFullYear() - 1 : null;
}

// ESPN's season year: a season's playoffs finish in the next calendar
// year, so January and February still belong to last year's season.
export function postseasonYear(){
  const now = new Date();
  return previewYear() ?? (now.getMonth() < 7 ? now.getFullYear() - 1 : now.getFullYear());
}

// December (the CFP field is set early in the month) through February
// (the Super Bowl): outside it there's no postseason to fetch.
function inWindow(){
  return previewYear() !== null || [11, 0, 1].includes(new Date().getMonth());
}

// ---- Data ----

const STORE_KEY = 'bxPostseason';
const caches = {};

function cacheFor(key){
  const year = postseasonYear();
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
  if(latestStage(b) === STAGES) return 6 * 60 * 60 * 1000;
  return b.games.some(g => g.live) ? 2 * 60 * 1000 : 10 * 60 * 1000;
}

const listeners = [];
export function onPostseasonData(fn){ listeners.push(fn); }

export function ensurePostseason(key){
  if(!POSTSEASON_LEAGUES[key] || !inWindow()) return;
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

// The league's logo for the playoffs reveal, each part as { light, dark }:
// { emblem, wordmark? }. The NFL's shield comes from ESPN; ESPN has no CFP
// logo, so the College Football Playoff's emblem and wordmark are ours
// (icons/cfp-*.png, cut from the CFP's light and dark artwork).
const CFP_LOGO = {
  emblem: { light: 'icons/cfp-emblem-light.png', dark: 'icons/cfp-emblem-dark.png' },
  wordmark: { light: 'icons/cfp-wordmark-light.png', dark: 'icons/cfp-wordmark-dark.png' }
};
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
      <div class="ps-brand-row" aria-label="${key === 'nfl' ? 'NFL Playoffs' : 'College Football Playoff'}">
        <span class="ps-brand-logo">${logoImgsHtml(logo.emblem)}</span>
        <span class="ps-brand-word${logo.wordmark ? ' mark' : ''}">${logo.wordmark ? logoImgsHtml(logo.wordmark) : 'Playoffs'}</span>
      </div>
      ${stage}
    </div>`;
}

export function postseasonLogo(key){
  if(!bracketFor(key)) return null;
  if(key === 'cfb') return CFP_LOGO;
  const logo = cacheFor(key).data && cacheFor(key).data.logo;
  return logo ? { emblem: logo } : null;
}

export function bracketFor(key){
  if(!POSTSEASON_LEAGUES[key] || !inWindow()) return null;
  return cacheFor(key).bracket;
}

function ownerOf(key){
  return t => {
    const teamKey = key === 'nfl' ? findNflTeamKeyByEspnAbbr(t.abbr) : findCfbTeamKeyByLocation(t.location);
    const meta = teamKey && TEAM_META[teamKey];
    if(!meta) return null;
    return { teamKey, owner: PRE_DRAFT || meta.favoriteOnly ? null : meta.draftTeamId };
  };
}

export function snap(key, stage){
  const scoring = LEAGUE_SCORING[key];
  return snapshot(bracketFor(key), stage, {
    rules: scoring ? scoring.rules : [],
    ownerOf: ownerOf(key),
    drafters: DRAFT_TEAMS.map(d => ({ id: d.id, name: d.name })),
    me: currentProfileId
  });
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
const revealKey = key => `bxPsReveal:${key}:${postseasonYear()}`;
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

// 'reg' | 'post', or null when there's no toggle: no field yet, or the
// reveal hasn't introduced it. Once it has, the card opens on Postseason.
export function postseasonPhase(key){
  if(!bracketFor(key) || !revealSeen(key)) return null;
  return uiFor(key).phase || 'post';
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

// Picking another league on Standings brings each ladder back to its
// latest round.
export function resetPostseasonStages(){
  stopReplay();
  cancelCount();
  Object.values(ui).forEach(u => { u.stage = null; u.spot = null; });
}

// ---- Markup ----

const nameOf = (t, key) => (t.teamKey ? TEAM_META[t.teamKey].name : key === 'cfb' ? t.location : t.name) || t.abbr;

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
  const frontier = S.champ && S.stage === STAGES ? 4 : S.stage;
  return k === frontier ? (k === 4 ? 'frontier champ' : 'frontier') : k < frontier ? 'below' : 'above';
}

// Only rungs someone has reached show (topRung); one above them waits
// just over the ladder's top, so it slides down into place as it appears.
function rungClasses(k, S, top){
  return `ps-rung ${rungClass(k, S)}${k > top ? ' unset' : ''}`;
}
function rungStyle(k, top){
  return `transform:translateY(${(top - Math.min(k, top + 1)) * RUNG_H}px)`;
}

function rungPts(k, S){
  const m = S.milestones.filter(x => k === 4 ? x.win : !x.win && (x.reach === k + 1 || (k === 0 && x.reach === 0)));
  return m.length ? `+${m.reduce((s, x) => s + x.pts, 0)}` : '';
}

// One chip's look at this stage: its classes and where it sits.
function chipView(t, pos, spot){
  const p = pos[t.id];
  const out = !t.alive;
  const scale = t.champion ? 1.25 : out ? 0.88 : 1;
  const cls = ['ps-chip'];
  if(out) cls.push('out');
  if(t.justOut) cls.push('just-out');
  if(t.champion) cls.push('champ');
  if(t.mine) cls.push('mine');
  if(spot && t.owner !== spot) cls.push('dim');
  if(t.teamKey) cls.push('tap');
  return { cls: cls.join(' '), transform: `translate(calc((100cqw - var(--ps-label-w)) * ${p.fx.toFixed(4)} - 20px), ${p.y}px) scale(${scale})` };
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
  const F = snap(key, STAGES);
  const t = F.champ;
  if(!t) return null;
  const owner = t.owner ? F.drafters.find(d => d.id === t.owner) : null;
  const final = F.games.find(g => g.round === STAGES);
  return {
    t,
    title: key === 'nfl' ? `${(final && final.note) || 'Super Bowl'} champions` : F.L.champTitle,
    ownerLine: owner ? `${owner.me ? 'Your' : `${owner.name}’s`} postseason haul` : 'Undrafted',
    pts: owner ? owner.banked : null
  };
}

function champCardHtml(key, S){
  const c = champInfo(key);
  if(!c) return '<div class="ps-champ"></div>';
  const show = S.stage === STAGES;
  return `
    <div class="ps-champ${show ? ' show' : ''}">
      <div class="ps-champ-in">
        <span class="ps-champ-badge">${badgeOf(c.t)}</span>
        <div class="ps-champ-text">
          <div class="ps-champ-eyebrow">${escapeHtml(c.title)}</div>
          <div class="ps-champ-name">${escapeHtml(nameOf(c.t, key))}</div>
          <div class="ps-champ-owner">${escapeHtml(c.ownerLine)}</div>
        </div>
        ${c.pts !== null && !PRE_DRAFT ? `<div class="ps-champ-pts" data-target="${c.pts}">+${show ? c.pts : 0}</div>` : ''}
      </div>
    </div>`;
}

function scrubHtml(key, S){
  const stops = ['Field'].concat(S.L.roundShort);
  return `
    <div class="ps-scrub" data-ps-scrub="${key}" role="slider" tabindex="0" aria-label="Replay the postseason"
      aria-valuemin="0" aria-valuemax="${S.latest}" aria-valuenow="${S.stage}" aria-valuetext="${escapeHtml(S.stageLabel)}" style="--f:${S.stage / STAGES}">
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
  const top = topRung(S.teams);
  const pos = ladderLayout(S.teams, { rungH: RUNG_H, top });
  const rungs = [4, 3, 2, 1, 0].map(k => `
    <div class="${rungClasses(k, S, top)}" data-rung="${k}" style="${rungStyle(k, top)}">
      <div class="ps-rung-label"><span>${S.L.rungs[k]}</span><span class="ps-rung-pts">${rungPts(k, S)}</span></div>
    </div>`).join('');
  return `
    <div class="ps" data-ps="${key}" data-sig="${sigOf(key)}">
      <div class="ps-head">
        ${ladderTitleHtml(key, S)}
        ${S.latest > 0 ? `<button type="button" class="ps-replay" onclick="psReplay('${key}')">${replayLabel(key)}</button>` : ''}
      </div>
      <div class="ps-ladder" style="height:${(top + 1) * RUNG_H}px">
        ${rungs}
        ${S.teams.map(t => chipHtml(key, t, pos, spot)).join('')}
        <div class="ps-fx" aria-hidden="true"></div>
      </div>
      ${champCardHtml(key, S)}
      ${scrubHtml(key, S)}
    </div>`;
}

function draftedRowsHtml(key, S){
  const spot = uiFor(key).spot;
  const rows = S.drafters.filter(d => d.alive.length);
  const gone = S.drafters.filter(d => d.inField && !d.alive.length);
  const rowsHtml = rows.map(d => `
    <button type="button" class="ps-drow${spot === d.id ? ' on' : ''}${d.me ? ' me' : ''}" onclick="psSpot('${key}','${d.id}')" aria-pressed="${spot === d.id}">
      <span class="ps-dname">${d.me ? 'You' : escapeHtml(d.name)}</span>
      <span class="ps-dteams">${d.alive.map(badgeOf).join('')}</span>
      <span class="ps-dbank">+${d.banked}</span>
      <span class="ps-dplay">${d.inPlay ? `+${d.inPlay}` : ''}</span>
    </button>`).join('');
  const out = gone.length ? `Out: ${gone.map(d => d.me ? 'You' : escapeHtml(d.name)).join(', ')}. ` : '';
  return {
    table: rowsHtml || '<div class="ps-dempty">No drafted teams left.</div>',
    note: `${out}Gold is locked; blue is still in play.`
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
  const top = topRung(S.teams);
  const pos = ladderLayout(S.teams, { rungH: RUNG_H, top });
  el.querySelector('.ps-stage').textContent = S.stageLabel;
  el.querySelector('.ps-ladder').style.height = `${(top + 1) * RUNG_H}px`;
  const replay = el.querySelector('.ps-replay');
  if(replay) replay.textContent = replayLabel(key);
  el.querySelectorAll('.ps-rung').forEach(r => {
    const k = Number(r.dataset.rung);
    r.className = rungClasses(k, S, top);
    r.style.transform = rungStyle(k, top).split(':')[1];
  });
  S.teams.forEach(t => {
    const chip = el.querySelector(`.ps-chip[data-team="${t.id}"]`);
    if(!chip) return;
    const v = chipView(t, pos, spot);
    chip.className = v.cls;
    chip.style.transform = v.transform;
  });
  const champ = el.querySelector('.ps-champ');
  const show = S.stage === STAGES && !!S.champ;
  if(champ) champ.classList.toggle('show', show);
  const pts = el.querySelector('.ps-champ-pts');
  if(pts && !counting) pts.textContent = `+${show ? pts.dataset.target : 0}`;
  const scrub = el.querySelector('.ps-scrub');
  scrub.style.setProperty('--f', S.stage / STAGES);
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
  if(prev === STAGES) cancelCount();
  paint(key);
  if(s === STAGES) playChampion(key);
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
  return Math.round(((x - r.left - 14) / Math.max(1, r.width - 28)) * STAGES);
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

// The champion springs up (CSS), three gold rings ripple out of its
// badge, the card opens below the ladder and the owner's haul counts up.
// Every time stage 4 is reached; the ripples skip reduced motion.
function playChampion(key){
  const el = document.querySelector(`.ps[data-ps="${key}"]`);
  const chip = el && el.querySelector('.ps-chip.champ');
  if(!chip || !canAnimateLive()) return;
  const fx = el.querySelector('.ps-fx');
  fx.innerHTML = '';
  fx.style.transform = chip.style.transform.replace(/scale\([^)]*\)/, '');
  if(fxOn()){
    fx.innerHTML = [0, 1, 2].map(i => `<span class="ps-ring" style="animation-delay:${750 + i * 300}ms"></span>`).join('');
    setTimeout(() => { if(fx.isConnected) fx.innerHTML = ''; }, 4600);
  }
  const badge = el.querySelector('.ps-champ-badge');
  if(badge){
    badge.classList.remove('glow');
    void badge.offsetWidth;
    badge.classList.add('glow');
  }
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
  if(revealPending || uiFor(key).stage !== null || latestStage(bracketFor(key)) !== STAGES || !fxOn()) return;
  if(!once(`ps-champ:${key}:${postseasonYear()}`)) return;
  uiFor(key).stage = STAGES - 1;
  revealPending = setTimeout(() => { revealPending = null; setStage(key, STAGES); }, 700);
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
    fresh.replaceWith(el);
    const freshDrafted = container.querySelector(`.ps-drafted[data-ps-drafted="${el.dataset.ps}"]`);
    if(drafted && freshDrafted) freshDrafted.replaceWith(drafted);
    paint(el.dataset.ps);
  });
}

// ---- Home: the way in to the playoffs reveal ----

// Someone who hasn't opened the app in weeks lands on Home, not Standings,
// so Home leads with a card for each league whose field is set and whose
// reveal this device hasn't seen: the league's logo, "The NFL playoffs are
// set", how many of your teams are in (their badges ringed in gold). A tap
// opens Standings on that league (openPlayoffs in js/board.js), where the
// reveal plays; once it has, the card is gone.
export function postseasonHomeHtml(leagueKeys){
  return leagueKeys.filter(key => POSTSEASON_LEAGUES[key]).map(key => {
    ensurePostseason(key);
    if(!bracketFor(key) || revealSeen(key)) return '';
    const S = snap(key, 0);
    const mine = S.teams.filter(t => t.mine).sort((a, b) => (a.seed ?? 99) - (b.seed ?? 99));
    const logo = postseasonLogo(key);
    const year = postseasonYear();
    const title = key === 'nfl' ? 'The NFL playoffs are set' : 'The College Football Playoff is set';
    const sub = PRE_DRAFT || !currentProfileId ? `${S.teams.length} teams are in`
      : mine.length ? `You have ${mine.length} ${mine.length === 1 ? 'team' : 'teams'} in`
      : `None of your teams made it`;
    return `
      <button type="button" class="ps-home" onclick="openPlayoffs('${key}')">
        ${logo ? `<span class="ps-home-logo">${logoImgsHtml(logo.emblem)}</span>` : ''}
        <span class="ps-home-text">
          <span class="ps-home-eyebrow">Field set · ${year + 1}</span>
          <span class="ps-home-title">${title}</span>
          <span class="ps-home-sub">${sub}</span>
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
    } else {
      steps.push(stepHtml({ dot: g.live ? 'live' : 'next', label: escapeHtml(label), html: vs, result: g.live ? 'Live' : 'Next', tone: g.live ? 'live' : 'next' }));
    }
  });
  if(t.champion){
    const final = S.games.find(g => g.round === STAGES);
    steps.push(stepHtml({ dot: 'champ', label: 'Champion', html: `<span>${key === 'nfl' ? `Won ${escapeHtml((final && final.note) || 'the Super Bowl')}` : 'National champions'}</span>`, tone: 'accent' }));
  }

  const rules = t.milestones.map(m => `
    <div class="ps-ms${m.possible ? '' : ' missed'}">
      <span class="ps-ms-label">${escapeHtml(m.label)}</span>
      <span class="ps-ms-pts">+${m.pts}</span>
      <span class="ps-ms-state">${m.got ? tagHtml({ label: 'Locked', variant: 'locked' }) : m.possible ? tagHtml({ label: 'In play', variant: 'live' }) : 'Missed'}</span>
    </div>`).join('');

  const cell = (lbl, val, cls) => `<div class="stat-cell"><div class="num ${cls}">${val}</div><div class="lbl">${lbl}</div></div>`;
  return `
    <div class="modal-section-title">Postseason${escapeHtml(asOf)}</div>
    <div class="ps-tp-strip">
      ${cell('Status', escapeHtml(t.status), t.champion ? 'accent' : t.alive ? '' : 'mute')}
      ${cell('Locked', `+${t.banked}`, 'accent')}
      ${cell('In play', `+${t.inPlay}`, 'prov')}
    </div>
    <div class="ps-tp-card">${steps.join('')}</div>
    ${t.milestones.length ? `<div class="modal-section-title spaced">Postseason points</div><div class="ps-tp-card ps-ms-list">${rules}</div>` : ''}
    <div class="ps-tp-gap"></div>`;
}
