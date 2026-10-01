/* ============================================================
   On the line: how close each drafted team is to the placement rules
   that score ("1½ games up on the Packers" for Division title, "2 pts
   clear of the drop"). Two places show it:
   - the team page's Overview, one row per rule the team can win or lose;
   - a drafter's Points breakdown, their closest calls across every team.

   The tables are the ones the rules score from (rankAutoRowTables in
   js/league-facts.js), so a line here always agrees with Live points.
   The math is pure and tested (js/lines-math.js). Only a league whose
   season is under way and not yet locked has lines; once it locks, its
   points are settled and Points says so.
   ============================================================ */
import { TEAM_META, LEAGUE_SCORING, LEAGUES, PRIOR_SEASON_DISPLAY_LEAGUES, PRE_DRAFT } from './data.js';
import { escapeHtml } from './utils.js';
import { rankAutoRowTables, leagueSeasonUnderway } from './league-facts.js';
import { isLeagueLocked } from './season-lock.js';
import { LINE_LEAGUES, lineRecord, lineStatus, gapText, gapInGames } from './lines-math.js';
import { fetchEspnNflStandingsCached, fetchEspnNflDivisionStandingsCached } from './standings-nfl.js';
import { fetchEspnNbaStandingsCached, fetchEspnNbaDivisionStandingsCached } from './standings-nba.js';
import { fetchEspnNhlStandingsCached, fetchEspnNhlDivisionStandingsCached } from './standings-nhl.js';
import { fetchEspnMlbStandingsCached, fetchEspnMlbDivisionStandingsCached } from './standings-mlb.js';
import { fetchEspnWnbaStandingsCached } from './standings-wnba.js';
import { fetchEplStandingsTable } from './standings-epl.js';
import { fetchEspnCfbRecordsCached } from './standings-cfb.js';
import { fetchEspnCbbStandingsCached } from './standings-cbb.js';

// Every table a league's rules read (the division ones too, which the
// Standings tab only loads on demand).
const LOADERS = {
  nfl: () => [fetchEspnNflStandingsCached(), fetchEspnNflDivisionStandingsCached()],
  nba: () => [fetchEspnNbaStandingsCached(), fetchEspnNbaDivisionStandingsCached()],
  nhl: () => [fetchEspnNhlStandingsCached(), fetchEspnNhlDivisionStandingsCached()],
  mlb: () => [fetchEspnMlbStandingsCached(), fetchEspnMlbDivisionStandingsCached()],
  wnba: () => [fetchEspnWnbaStandingsCached()],
  epl: () => [fetchEplStandingsTable()],
  cfb: () => [fetchEspnCfbRecordsCached()],
  mcbb: () => [fetchEspnCbbStandingsCached()]
};

// A drafter's breakdown only lists lines this close (in games; table
// points count as games at a win's worth).
const CLOSE_GAMES = 2;
// The team page shows a rule that would cost the team only once it's
// this close to falling in.
const NEAR_DROP_GAMES = 3;

export function loadLineInputs(leagueKeys){
  const keys = leagueKeys.filter(k => LOADERS[k] && linesLive(k) !== false);
  return Promise.allSettled(keys.flatMap(k => LOADERS[k]()));
}

// true when a league's table is moving and scores; false when it can't
// have lines (not a scoring league, still last season's, locked); null
// while its season phase is still loading.
function linesLive(leagueKey){
  if(!LINE_LEAGUES[leagueKey] || !LEAGUE_SCORING[leagueKey]) return false;
  if(PRIOR_SEASON_DISPLAY_LEAGUES.includes(leagueKey) || isLeagueLocked(leagueKey)) return false;
  const underway = leagueSeasonUnderway(leagueKey);
  return underway === null ? null : underway;
}

function entryName(entry){
  const meta = entry.teamKey && TEAM_META[entry.teamKey];
  const row = entry.row;
  return (meta && meta.name) || row.teamNickname || row.location || row.teamName || '';
}

// "Make the playoffs" reads ESPN's own clinch note, like its points do.
function playoffLine(leagueKey, teamKey){
  const entry = rankAutoRowTables(leagueKey, 'conference').flat().find(e => e.teamKey === teamKey);
  const note = entry && entry.row.clincherDescription;
  if(!note) return null;
  if(/eliminated/i.test(note)) return { status: 'out', gap: 0, rival: null };
  if(/clinched/i.test(note)) return { status: 'clinched', gap: 0, rival: null };
  return null;
}

// Every scoring line one drafted team is near, in the league's rule
// order: { rule, teamKey, leagueKey, status, gap, rival, cfg }.
export function teamLines(teamKey){
  const meta = TEAM_META[teamKey];
  if(PRE_DRAFT || !meta || meta.favoriteOnly || linesLive(meta.leagueKey) !== true) return [];
  const leagueKey = meta.leagueKey;
  const cfg = LINE_LEAGUES[leagueKey];
  const out = [];
  LEAGUE_SCORING[leagueKey].rules.forEach(rule => {
    const spec = rule.rankAuto;
    if(!spec) return;
    if(spec.clinched){
      const line = playoffLine(leagueKey, teamKey);
      if(line) out.push({ rule, teamKey, leagueKey, cfg, ...line });
      return;
    }
    for(const entries of rankAutoRowTables(leagueKey, spec.scope)){
      const idx = entries.findIndex(e => e.teamKey === teamKey);
      if(idx === -1) continue;
      const table = entries.map(e => ({ record: lineRecord(e.row), name: entryName(e) }));
      // A table nobody has played in yet is all ties, not lines.
      if(!table.some(t => t.record.gp > 0)) break;
      const line = lineStatus(table, idx, spec, cfg);
      if(line) out.push({ rule, teamKey, leagueKey, cfg, ...line });
      break;
    }
  });
  return out;
}

const COSTS = new Set(['risk', 'stuck', 'clear', 'safe']);

// What each status is called, and its colors: ptsCls for .ob-rule-pts
// (team page), deltaCls for .act-delta (Points).
const STATUS = {
  holds: { tag: 'Holding', tagCls: 'live', ptsCls: 'live', deltaCls: 'live' },
  clinched: { tag: 'Clinched', tagCls: 'locked', ptsCls: '', deltaCls: 'lock' },
  chasing: { tag: 'Chasing', tagCls: 'rank', ptsCls: 'mute', deltaCls: 'mute' },
  out: { tag: 'Out of reach', tagCls: 'rank', ptsCls: 'mute', deltaCls: 'mute' },
  risk: { tag: 'At risk', tagCls: 'risk', ptsCls: 'neg', deltaCls: 'risk' },
  stuck: { tag: 'Stuck', tagCls: 'risk', ptsCls: 'neg', deltaCls: 'risk' },
  clear: { tag: 'Clear', tagCls: 'rank', ptsCls: 'mute', deltaCls: 'mute' },
  safe: { tag: 'Safe', tagCls: 'rank', ptsCls: 'mute', deltaCls: 'mute' }
};

function lineText(line){
  const rival = line.rival ? escapeHtml(line.rival.name) : '';
  const gap = gapText(line.gap, line.cfg);
  switch(line.status){
    case 'holds': return line.gap ? `${gap} up on ${rival}` : `Level with ${rival}`;
    case 'clinched': return rival ? `Can’t be caught` : 'Clinched on ESPN';
    case 'chasing': return line.gap ? `${gap} behind ${rival}` : `Level with ${rival}`;
    case 'out': return rival ? `Can’t catch ${rival}` : 'Eliminated on ESPN';
    case 'risk': return line.gap ? `${gap} behind ${rival} to climb out` : `Level with ${rival}`;
    case 'stuck': return `Can’t climb out`;
    case 'clear': return line.gap ? `${gap} clear of ${rival}` : `Level with ${rival}`;
    case 'safe': return `Can’t fall in`;
  }
  return '';
}

function signedPts(n){
  return n > 0 ? '+' + n : '&minus;' + Math.abs(n);
}

// ---- Team page ----

// A rule that would cost the team only shows while it's in it, or close.
function shownOnTeamPage(line){
  if(!COSTS.has(line.status)) return true;
  if(line.status === 'safe') return false;
  return line.status !== 'clear' || gapInGames(line.gap, line.cfg) <= NEAR_DROP_GAMES;
}

// The Overview's "On the line" section: '' when the team has none.
export function teamLinesSectionHtml(teamKey){
  const lines = teamLines(teamKey).filter(shownOnTeamPage);
  if(!lines.length) return '';
  const rows = lines.map(line => {
    const s = STATUS[line.status];
    return `
      <div class="ob-rule static">
        <div class="ob-rule-main">
          <div class="ob-rule-label">${escapeHtml(line.rule.label)}</div>
          <div class="ob-rule-meta">
            <span>${lineText(line)}</span>
            <span class="pts-tag ${s.tagCls}">${s.tag}</span>
          </div>
        </div>
        <div class="ob-rule-pts ${s.ptsCls}">${signedPts(line.rule.pts)}</div>
      </div>`;
  }).join('');
  return `
    <div class="modal-section-title spaced">On the line</div>
    <div class="ob-card ob-lines">${rows}</div>
    <div class="act-foot">From today’s table. Clinched and out of reach ignore tiebreakers.</div>
  `;
}

// ---- A drafter's Points breakdown ----

// Their closest calls: lines they hold or chase, or a drop they're in or
// near, within CLOSE_GAMES. Tightest first, then the bigger swing.
export function drafterCloseLines(drafterId){
  const lines = LEAGUES.flatMap(l => l.teams)
    .filter(teamKey => TEAM_META[teamKey] && TEAM_META[teamKey].draftTeamId === drafterId)
    .flatMap(teamLines)
    .filter(line => ['holds', 'chasing', 'risk', 'clear'].includes(line.status) && gapInGames(line.gap, line.cfg) <= CLOSE_GAMES);
  return lines.sort((a, b) => gapInGames(a.gap, a.cfg) - gapInGames(b.gap, b.cfg) || Math.abs(b.rule.pts) - Math.abs(a.rule.pts)).slice(0, 5);
}

// Rows in the same compact shape as the breakdown's "Recent changes"
// right above it. `tile` is js/activity.js's league tile.
export function drafterLinesHtml(drafterId, tile){
  const lines = drafterCloseLines(drafterId);
  if(!lines.length) return '';
  return `<div class="ob-card act-group">${lines.map(line => {
    const s = STATUS[line.status];
    return `
      <div class="act-row compact">
        ${tile(line.leagueKey)}
        <span class="act-body">
          <span class="act-title">${escapeHtml(TEAM_META[line.teamKey].name)} &middot; ${escapeHtml(line.rule.label)}</span>
          <span class="act-sub">${lineText(line)}</span>
        </span>
        <span class="act-right"><span class="act-delta ${s.deltaCls}">${signedPts(line.rule.pts)}</span><span class="act-time">${s.tag}</span></span>
      </div>`;
  }).join('')}</div>`;
}

// The leagues a drafter has teams in, for loadLineInputs.
export function drafterLeagueKeys(drafterId){
  return LEAGUES.filter(l => l.teams.some(teamKey => TEAM_META[teamKey] && TEAM_META[teamKey].draftTeamId === drafterId)).map(l => l.key);
}
