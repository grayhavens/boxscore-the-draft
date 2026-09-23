/* ============================================================
   Head to head: compare any two drafters from the Points detail view.

   Built around the scoring rules rather than games: the header shows
   both totals + the gap, the BONUS RACE (+5 per league to the best
   combined win %; EPL and NHL: most combined points) leads, and "where the gap
   comes from" splits every league into placement vs. bonus. It reuses
   the same per-league combined computations the Standings "Person"
   view reads, so there is no new data source here.

   Note the +5 league bonus isn't part of the Points totals in
   js/overall.js today (only LEAGUE_SCORING `rules` are summed). This
   view therefore shows it separately, as "who holds it right now",
   and only the Net line in the gap table adds it in.

   State (which two drafters) lives in js/overall.js; this module only
   turns rows into HTML.
   ============================================================ */
import { LEAGUE_SCORING, TEAM_META } from './data.js';
import { CHEVRON_LEFT_SVG, ordinal, teamBadgeHtml } from './utils.js';
import { isLeagueLocked } from './season-lock.js';
import { computeEplDrafterCombined } from './standings-epl.js';
import {
  computeNflDrafterCombined, computeNflConferenceStandings, computeNflDivisionStandings,
  fetchEspnNflStandingsCached, fetchEspnNflDivisionStandingsCached, findNflTeamKeyByEspnAbbr
} from './standings-nfl.js';
import { findFlatTeamKey } from './standings-flat.js';
import { computeCfbDrafterCombined } from './standings-cfb.js';
import { computeCbbDrafterCombined } from './standings-cbb.js';
import {
  computeNbaDrafterCombined, computeNbaConferenceStandings, computeNbaDivisionStandings,
  fetchEspnNbaStandingsCached, fetchEspnNbaDivisionStandingsCached, nbaConferences
} from './standings-nba.js';
import {
  computeNhlDrafterCombined, computeNhlConferenceStandings, computeNhlDivisionStandings,
  fetchEspnNhlStandingsCached, fetchEspnNhlDivisionStandingsCached, nhlConferences
} from './standings-nhl.js';
import { obLeagueColor, obLeagueFullName, obSignedPts } from './overall.js';

// Only leagues that score today. MLB and WNBA are deliberately absent:
// they're on prior-season data (PRIOR_SEASON_DISPLAY_LEAGUES in
// js/data.js) and a bonus race there would be scoring a season that
// doesn't count yet. `metric` is what the bonus is awarded on:
// win % for most leagues, combined points for EPL and NHL (see
// LEAGUE_SCORING[key].bonus).
// `minGames` keeps a bonus race from showing on a handful of games.
const BONUS_SOURCES = [
  { key: 'nfl',  compute: computeNflDrafterCombined, metric: 'pct',    minGames: 0 },
  { key: 'nba',  compute: computeNbaDrafterCombined, metric: 'pct',    minGames: 0 },
  { key: 'cfb',  compute: computeCfbDrafterCombined, metric: 'pct',    minGames: 0 },
  { key: 'nhl',  compute: computeNhlDrafterCombined, metric: 'points', minGames: 0 },
  { key: 'epl',  compute: computeEplDrafterCombined, metric: 'points', minGames: 0 },
  { key: 'mcbb', compute: computeCbbDrafterCombined, metric: 'pct',    minGames: 10 }
];

function gamesOf(r){
  return (r.wins || 0) + (r.win || 0) + (r.losses || 0) + (r.loss || 0) +
    (r.draw || 0) + (r.ties || 0) + (r.otLosses || 0);
}

function valueOf(r, metric){
  if(metric === 'points') return r.points || 0;
  if(r.pct !== undefined && r.pct !== null) return r.pct;
  const g = gamesOf(r);
  return g > 0 ? (r.wins || 0) / g : null;
}

function formatValue(v, metric){
  if(v === null || v === undefined) return '&mdash;';
  if(metric === 'points') return v + ' pts';
  return v.toFixed(3).replace(/^0/, '');
}

// One league's bonus race: everyone's value plus who holds the +5 now.
// `active` is false until enough games are played (see minGames).
function bonusRace(src){
  const rows = src.compute();
  const byId = {};
  rows.forEach(r => { byId[r.id] = { value: valueOf(r, src.metric), games: gamesOf(r), found: r.found }; });
  const maxGames = Math.max(0, ...rows.map(gamesOf));
  const active = maxGames > 0 && maxGames >= src.minGames;
  const lead = rows[0];
  const holderId = active && lead && lead.found > 0 ? lead.id : null;
  const scoring = LEAGUE_SCORING[src.key];
  return {
    key: src.key,
    metric: src.metric,
    pts: (scoring && scoring.bonus && scoring.bonus.pts) || 5,
    minGames: src.minGames,
    active,
    holderId,
    locked: isLeagueLocked(src.key),
    byId
  };
}

export function compareData(rows, aId, bId){
  const a = rows.find(r => r.id === aId);
  const b = rows.find(r => r.id === bId);
  if(!a || !b) return null;

  const races = BONUS_SOURCES.map(bonusRace);
  const raceByKey = {};
  races.forEach(r => { raceByKey[r.key] = r; });

  // Gap table: signed from a's side (a - b).
  const leagueKeys = [];
  a.leagues.forEach(x => {
    const y = b.leagues.find(z => z.league.key === x.league.key);
    const race = raceByKey[x.league.key];
    const bonus = race && race.active
      ? (race.holderId === a.id ? race.pts : (race.holderId === b.id ? -race.pts : 0))
      : 0;
    const placement = x.pts - (y ? y.pts : 0);
    if(placement === 0 && bonus === 0) return;
    leagueKeys.push({ key: x.league.key, placement, bonus, net: placement + bonus });
  });
  leagueKeys.sort((p, q) => Math.abs(q.net) - Math.abs(p.net));
  const net = leagueKeys.reduce((s, x) => s + x.net, 0);

  return { a, b, races, gap: leagueKeys, net };
}

// ---- Picker sheet ----

export function comparePickerHtml(rows, subjectId, currentOppId){
  const me = rows.find(r => r.id === subjectId);
  if(!me) return '';
  const others = rows.filter(r => r.id !== subjectId);
  return others.map(r => {
    const d = r.confirmedTotal - me.confirmedTotal;
    const gap = d > 0 ? d + ' ahead' : (d < 0 ? Math.abs(d) + ' behind' : 'Tied');
    return `
      <button type="button" class="cmp-pick ${r.id === currentOppId ? 'current' : ''}" onclick="obPickOpponent('${r.id}')">
        <span class="cmp-pick-rank">${r.rankLabel}</span>
        <span class="cmp-pick-name">${r.name}</span>
        <span class="cmp-pick-gap">${gap}</span>
        <span class="cmp-pick-total">${r.confirmedTotal}</span>
      </button>
    `;
  }).join('');
}

// ---- Compare view ----

function gapPill(diff){
  const cls = diff > 0 ? 'pos' : (diff < 0 ? 'neg' : 'zero');
  return `<span class="cmp-gap-pill ${cls}">${diff > 0 ? '+' : (diff < 0 ? '&minus;' : '')}${Math.abs(diff)}</span>`;
}

function signedCell(n){
  const cls = n > 0 ? 'pos' : (n < 0 ? 'neg' : 'zero');
  const text = n === 0 ? '0' : (n > 0 ? '+' : '&minus;') + Math.abs(n);
  return `<span class="cmp-num ${cls}">${text}</span>`;
}

function raceRowHtml(race, a, b, rowsById){
  const av = race.byId[a.id], bv = race.byId[b.id];
  const holder = race.holderId;
  const mine = holder === a.id, theirs = holder === b.id;

  let chip = '';
  if(mine || theirs){
    const who = mine ? a.name : b.name;
    chip = race.locked
      ? `<span class="cmp-chip win">${who} +${race.pts} &middot; Locked</span>`
      : `<span class="cmp-chip prov">${who} +${race.pts}</span>`;
  } else if(holder){
    const h = rowsById[holder];
    chip = `<span class="cmp-chip other">${h ? h.name : ''} holds &middot; ${formatValue(race.byId[holder].value, race.metric)}</span>`;
  }

  const va = av.value ?? 0, vb = bv.value ?? 0;
  const total = va + vb;
  const left = total > 0 ? (va / total) * 100 : 50;
  const inRace = mine || theirs;
  const leftCls = inRace ? (mine ? 'hold' : 'dim') : 'none-l';
  const rightCls = inRace ? (theirs ? 'hold' : 'dim') : 'none-r';

  return `
    <div class="cmp-race">
      <div class="cmp-race-top">
        <span class="cmp-league-dot" style="background:${obLeagueColor(race.key)};"></span>
        <span class="cmp-race-name">${obLeagueFullName(race.key)}</span>
        ${chip}
      </div>
      <div class="cmp-race-bar">
        <span class="cmp-race-val ${mine ? 'hold' : ''} ${inRace ? '' : 'flat'}">${formatValue(av.value, race.metric)}</span>
        <span class="cmp-tug"><span class="cmp-tug-l ${leftCls}" style="width:${left}%;"></span><span class="cmp-tug-r ${rightCls}"></span></span>
        <span class="cmp-race-val r ${theirs ? 'hold' : ''} ${inRace ? '' : 'flat'}">${formatValue(bv.value, race.metric)}</span>
      </div>
    </div>
  `;
}

export function compareHtml(rows, aId, bId){
  const data = compareData(rows, aId, bId);
  if(!data) return '';
  const { a, b, races, gap, net } = data;
  const rowsById = {};
  rows.forEach(r => { rowsById[r.id] = r; });

  const diff = a.confirmedTotal - b.confirmedTotal;

  // Leagues where one of the two holds the bonus come first.
  const active = races.filter(r => r.active)
    .sort((p, q) => {
      const ph = (p.holderId === a.id || p.holderId === b.id) ? 0 : 1;
      const qh = (q.holderId === a.id || q.holderId === b.id) ? 0 : 1;
      return ph - qh;
    });
  const waiting = races.filter(r => !r.active && r.minGames > 0);

  const raceHtml = active.length
    ? active.map(r => raceRowHtml(r, a, b, rowsById)).join('')
    : `<div class="cmp-empty">Bonus races start once teams have played a few games.</div>`;
  const waitingHtml = waiting.length
    ? `<div class="cmp-foot-note">${waiting.map(r => obLeagueFullName(r.key) + ' joins after ' + r.minGames + ' games.').join(' ')}</div>`
    : '';

  const gapRows = gap.map(x => `
    <div class="cmp-gap-row">
      <span class="cmp-gap-league"><span class="cmp-league-dot" style="background:${obLeagueColor(x.key)};"></span>${obLeagueFullName(x.key)}</span>
      ${signedCell(x.placement)}${signedCell(x.bonus)}<span class="cmp-net">${signedCell(x.net)}</span>
    </div>
  `).join('');

  const gapHtml = gap.length
    ? `
      <div class="ob-section-title cmp-title-row"><span>Where the gap comes from</span><span class="cmp-title-note">${net === 0 ? 'even' : '+ favors ' + (net > 0 ? a.name : b.name)}</span></div>
      <div class="ob-card cmp-card">
        <div class="cmp-gap-row head"><span>League</span><span>Placement</span><span>Bonus</span><span>Net</span></div>
        ${gapRows}
        <div class="cmp-gap-foot"><span>Net, including provisional</span><span class="cmp-net-total ${net > 0 ? 'pos' : (net < 0 ? 'neg' : 'zero')}">${net === 0 ? '0' : (net > 0 ? '+' : '&minus;') + Math.abs(net)}</span></div>
      </div>
    `
    : '';

  return `
    <div class="cmp-sticky" id="cmp-sticky">
      <button type="button" class="cmp-sticky-back" onclick="obCloseCompare()" aria-label="Back">${CHEVRON_LEFT_SVG}</button>
      <span class="cmp-sticky-a">${a.name} ${a.confirmedTotal}</span>
      ${gapPill(diff).replace('cmp-gap-pill', 'cmp-sticky-gap')}
      <span class="cmp-sticky-b">${b.confirmedTotal} ${b.name}</span>
      <button type="button" class="cmp-change" onclick="obOpenComparePicker()">Change</button>
    </div>
    <button type="button" class="ob-back" onclick="obCloseCompare()">${CHEVRON_LEFT_SVG}${a.name}</button>
    <div class="ob-detail-eyebrow cmp-eyebrow">Head to head</div>
    <div class="ob-card cmp-head" id="cmp-head">
      <div class="cmp-head-grid">
        <div class="cmp-side">
          <div class="cmp-side-label">Rank ${a.rankLabel}</div>
          <div class="cmp-side-name a">${a.name}</div>
          <div class="cmp-side-total">${a.confirmedTotal}</div>
        </div>
        <div class="cmp-mid">${gapPill(diff)}<div class="cmp-side-label">Gap</div></div>
        <div class="cmp-side r">
          <div class="cmp-side-label">Rank ${b.rankLabel}</div>
          <button type="button" class="cmp-side-name b" onclick="obOpenComparePicker()">${b.name}<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"></path></svg></button>
          <div class="cmp-side-total b">${b.confirmedTotal}</div>
        </div>
      </div>
      <div class="cmp-head-foot">
        <span class="ob-stripe-swatch"></span>
        <span class="cmp-head-foot-text">With provisional: <strong>${a.total}</strong> vs <strong>${b.total}</strong></span>
        <button type="button" class="cmp-change" onclick="obOpenComparePicker()">Change</button>
      </div>
    </div>

    <div class="ob-section-title cmp-title-row"><span>Bonus race &middot; +5 per league</span><span class="cmp-title-note">Win % or points</span></div>
    <div class="ob-card cmp-card">
      ${raceHtml}
      ${waitingHtml}
    </div>

    ${gapHtml}
    <div id="cmp-same-race"></div>
  `;
}

// Shows the compact header once the big one scrolls off the top.
let stickyObserver = null;

export function setupCompareSticky(){
  if(stickyObserver){ stickyObserver.disconnect(); stickyObserver = null; }
  const head = document.getElementById('cmp-head');
  const sticky = document.getElementById('cmp-sticky');
  if(!head || !sticky || !('IntersectionObserver' in window)) return;
  stickyObserver = new IntersectionObserver(([entry]) => {
    sticky.classList.toggle('show', !entry.isIntersecting && entry.boundingClientRect.top < 0);
  }, { threshold: 0 });
  stickyObserver.observe(head);
}


// ---- Same race ----
//
// When both drafters own teams in the same division (or both have a team
// near the top of the same conference), one team's win is the other's
// loss, so those get their own cards. NFL, NBA and NHL only — the
// leagues with real division/best-record placement rules that score
// today (MLB is on prior-season data; EPL/CFB/CBB have no divisions).
// Division tables are a heavier lazy fetch than the flat standings, so
// this fills in after the first paint (fillSameRace).

const SEASON_GAMES = { nfl: 17, nba: 82, nhl: 82 };
// A conference race only counts when both drafters' best teams are in
// the top few — a 2nd-place team vs a 14th-place one isn't a race.
const CONF_RACE_DEPTH = 3;

const CONFERENCE_NAMES = { East: 'Eastern Conference', West: 'Western Conference' };

const SAME_RACE_LEAGUES = [
  {
    key: 'nfl',
    load: () => Promise.all([fetchEspnNflStandingsCached(), fetchEspnNflDivisionStandingsCached()]),
    confs: [{ abbr: 'AFC', label: 'AFC' }, { abbr: 'NFC', label: 'NFC' }],
    conference: abbr => computeNflConferenceStandings(abbr),
    divisions: abbr => computeNflDivisionStandings(abbr),
    teamKey: row => findNflTeamKeyByEspnAbbr(row.abbreviation)
  },
  {
    key: 'nba',
    load: () => Promise.all([fetchEspnNbaStandingsCached(), fetchEspnNbaDivisionStandingsCached()]),
    confs: nbaConferences.map(c => ({ abbr: c.abbr, label: CONFERENCE_NAMES[c.abbr] || c.label })),
    conference: abbr => computeNbaConferenceStandings(abbr),
    divisions: abbr => computeNbaDivisionStandings(abbr),
    teamKey: row => findFlatTeamKey('nba', row.teamNickname)
  },
  {
    key: 'nhl',
    load: () => Promise.all([fetchEspnNhlStandingsCached(), fetchEspnNhlDivisionStandingsCached()]),
    confs: nhlConferences.map(c => ({ abbr: c.abbr, label: CONFERENCE_NAMES[c.abbr] || c.label })),
    conference: abbr => computeNhlConferenceStandings(abbr),
    divisions: abbr => computeNhlDivisionStandings(abbr),
    teamKey: row => findFlatTeamKey('nhl', row.teamNickname)
  }
];

function ruleStake(leagueKey, scope){
  const scoring = LEAGUE_SCORING[leagueKey];
  const rule = scoring && scoring.rules.find(r => r.rankAuto && r.rankAuto.scope === scope && r.rankAuto.rank === 1);
  return rule ? rule.pts : null;
}

function gamesPlayed(r){
  return (r.wins || 0) + (r.losses || 0) + (r.ties || 0) + (r.otLosses || 0);
}

function recordText(leagueKey, r){
  if(leagueKey === 'nhl') return `${r.wins}–${r.losses}–${r.otLosses || 0}`;
  return `${r.wins}–${r.losses}` + (r.ties ? `–${r.ties}` : '');
}

function halfText(n){
  const whole = Math.floor(n);
  const half = n - whole >= 0.5;
  return (whole ? whole : '') + (half ? '½' : '') || '0';
}

// "Lions lead Packers by 1 game with 4 left." Only ever about the two
// drafters' best teams in the race.
function raceNote(leagueKey, x, y){
  const left = SEASON_GAMES[leagueKey] - Math.min(gamesPlayed(x.row), gamesPlayed(y.row));
  const leftText = left > 0 ? ` with ${left} left` : '';
  const nameOf = t => TEAM_META[t.teamKey].name;
  const lead = x.rank <= y.rank ? x : y, chase = lead === x ? y : x;

  if(leagueKey === 'nhl'){
    const d = Math.abs((lead.row.points || 0) - (chase.row.points || 0));
    if(d === 0) return `${nameOf(x)} and ${nameOf(y)} are level on points${leftText}.`;
    return `${nameOf(lead)} lead ${nameOf(chase)} by ${d} ${d === 1 ? 'pt' : 'pts'}${leftText}.`;
  }
  const g = ((lead.row.wins - lead.row.losses) - (chase.row.wins - chase.row.losses)) / 2;
  if(g <= 0) return `${nameOf(x)} and ${nameOf(y)} are level on record${leftText}.`;
  return `${nameOf(lead)} lead ${nameOf(chase)} by ${halfText(g)} ${g <= 1 ? 'game' : 'games'}${leftText}.`;
}

function raceTeamHtml(leagueKey, t, aId){
  const meta = TEAM_META[t.teamKey];
  const isA = meta.draftTeamId === aId;
  return `
    <button type="button" class="cmp-team" onclick="openTeamModal('${t.teamKey}')">
      <span class="cmp-badge">${teamBadgeHtml(meta)}</span>
      <span class="cmp-team-name">${meta.name} <span class="cmp-team-owner ${isA ? 'a' : ''}">&middot; ${t.ownerName}</span></span>
      <span class="cmp-team-rec">${recordText(leagueKey, t.row)} &middot; ${ordinal(t.rank)}</span>
    </button>
  `;
}

// Builds the cards for one league: every division holding a team of both
// drafters, then the conference if both have a top-N team in it.
function leagueRaces(cfg, a, b){
  const cards = [];
  // Off-season / not started: the division tables can still hold last
  // season's records while the live conference table is 0-0, so wait
  // until the live table shows a game played.
  const started = cfg.confs.some(conf => cfg.conference(conf.abbr).some(r => gamesPlayed(r) > 0));
  if(!started) return cards;
  const owned = (row, rank) => {
    const teamKey = cfg.teamKey(row);
    const meta = teamKey && TEAM_META[teamKey];
    if(!meta || meta.favoriteOnly) return null;
    if(meta.draftTeamId !== a.id && meta.draftTeamId !== b.id) return null;
    const owner = meta.draftTeamId === a.id ? a : b;
    return { teamKey, row, rank, ownerId: owner.id, ownerName: owner.name };
  };

  cfg.confs.forEach(conf => {
    cfg.divisions(conf.abbr).forEach(div => {
      const mine = div.teams.map((row, i) => owned(row, i + 1)).filter(Boolean);
      const hasA = mine.some(t => t.ownerId === a.id), hasB = mine.some(t => t.ownerId === b.id);
      if(!hasA || !hasB) return;
      const stake = ruleStake(cfg.key, 'division');
      cards.push({
        leagueKey: cfg.key, name: div.name, tag: stake ? `Division +${stake}` : 'Division',
        teams: mine, note: raceNote(cfg.key, mine.find(t => t.ownerId === a.id), mine.find(t => t.ownerId === b.id))
      });
    });

    const table = cfg.conference(conf.abbr);
    const inConf = table.map((row, i) => owned(row, i + 1)).filter(Boolean);
    const bestA = inConf.find(t => t.ownerId === a.id), bestB = inConf.find(t => t.ownerId === b.id);
    if(bestA && bestB && bestA.rank <= CONF_RACE_DEPTH && bestB.rank <= CONF_RACE_DEPTH){
      const stake = ruleStake(cfg.key, 'conference');
      const teams = [bestA, bestB].sort((p, q) => p.rank - q.rank);
      cards.push({
        leagueKey: cfg.key, name: conf.label, tag: stake ? `Best record +${stake}` : 'Best record',
        teams, note: raceNote(cfg.key, bestA, bestB)
      });
    }
  });
  return cards;
}

function sameRaceHtml(rows, aId, bId){
  const a = rows.find(r => r.id === aId), b = rows.find(r => r.id === bId);
  if(!a || !b) return '';
  const cards = [];
  SAME_RACE_LEAGUES.forEach(cfg => {
    if(!(LEAGUE_SCORING[cfg.key])) return;
    cards.push(...leagueRaces(cfg, a, b));
  });
  if(!cards.length) return '';

  return `
    <div class="ob-section-title cmp-title-row"><span>Same race</span><span class="cmp-title-note">One team's win is the other's loss</span></div>
    ${cards.map(c => `
      <div class="ob-card cmp-card cmp-same">
        <div class="cmp-race-top">
          <span class="cmp-league-dot" style="background:${obLeagueColor(c.leagueKey)};"></span>
          <span class="cmp-race-name">${c.name}</span>
          <span class="cmp-chip prov cmp-chip-caps">${c.tag}</span>
        </div>
        ${c.teams.map(t => raceTeamHtml(c.leagueKey, t, aId)).join('')}
        <div class="cmp-same-note">${c.note}</div>
      </div>
    `).join('')}
  `;
}

// Fetches whatever division data is missing, then paints the section —
// unless the user has already navigated to a different comparison.
export async function fillSameRace(rows, aId, bId){
  const slot = document.getElementById('cmp-same-race');
  if(!slot) return;
  const key = aId + '|' + bId;
  slot.dataset.key = key;
  const paint = () => {
    const el = document.getElementById('cmp-same-race');
    if(!el || el.dataset.key !== key) return;
    try { el.innerHTML = sameRaceHtml(rows, aId, bId); } catch (e){ el.innerHTML = ''; }
  };
  paint();
  try { await Promise.all(SAME_RACE_LEAGUES.map(cfg => cfg.load())); } catch (e){}
  paint();
}
