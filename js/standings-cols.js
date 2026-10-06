/* ============================================================
   Standings at wide widths (900px and up): every League-view row gets
   real stat columns (W, L, PCT, GB, PF, PA, DIFF, streak…) out of the
   ESPN row it was already built from. The phone layout shows only the
   record, so these cells are always in the markup but hidden under
   900px (css/style.css "Standings, wide"); a narrow table drops the
   columns marked to give way (see STANDINGS_COLS).

   Pure (only escape.js), so Node tests can import it.
   ============================================================ */
import { escapeHtml } from './escape.js';

const dash = '—';
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = v => (num(v) === null ? dash : String(Math.round(v)));
const signed = v => (num(v) === null ? dash : (v > 0 ? `+${Math.round(v)}` : v < 0 ? `−${Math.abs(Math.round(v))}` : '0'));

// ".750", "1.000"; computed from the record when ESPN sent no percent.
export function pctText(row){
  let p = num(row.winPercent);
  if(p === null){
    const w = num(row.wins), l = num(row.losses), t = num(row.ties) || 0;
    if(w === null || l === null || w + l + t === 0) return dash;
    p = (w + t / 2) / (w + l + t);
  }
  const s = p.toFixed(3);
  return p >= 1 ? s : s.slice(1);
}

// Games behind: the leader shows a dash.
export function gbText(v){
  const n = num(v);
  if(n === null || n === 0) return dash;
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

// ESPN's streak is +n for wins, −n for losses.
export function streakText(v){
  const n = num(v);
  if(n === null || n === 0) return dash;
  return n > 0 ? `W${n}` : `L${-n}`;
}

const diffOf = row => {
  if(num(row.pointDifferential) !== null) return row.pointDifferential;
  if(num(row.pointsFor) !== null && num(row.pointsAgainst) !== null) return row.pointsFor - row.pointsAgainst;
  return null;
};

// Per league: [label, (row) => text, drop?]. `drop` is when a column
// gives way to the team name: 'narrow' in a table under 640px (one of two
// conferences side by side, a half-width card), 'tiny' under 480px too
// (an All overview card).
const N = 'narrow', T = 'tiny';
export const STANDINGS_COLS = {
  epl: [
    ['GP', r => int(r.gamesPlayed), N], ['W', r => int(r.wins)], ['D', r => int(r.draws)], ['L', r => int(r.losses)],
    ['GF', r => int(r.goalsFor), N], ['GA', r => int(r.goalsAgainst), N], ['GD', r => signed(r.goalDifference), T], ['PTS', r => int(r.points)]
  ],
  nfl: [
    ['W', r => int(r.wins)], ['L', r => int(r.losses)], ['T', r => int(r.ties), T], ['PCT', pctText],
    ['PF', r => int(r.pointsFor), N], ['PA', r => int(r.pointsAgainst), N], ['DIFF', r => signed(diffOf(r))], ['STRK', r => streakText(r.streak), T]
  ],
  nba: [['W', r => int(r.wins)], ['L', r => int(r.losses)], ['PCT', pctText], ['GB', r => gbText(r.gamesBehind)], ['STRK', r => streakText(r.streak), T]],
  wnba: [['W', r => int(r.wins)], ['L', r => int(r.losses)], ['PCT', pctText], ['GB', r => gbText(r.gamesBehind)], ['STRK', r => streakText(r.streak), T]],
  nhl: [
    ['GP', r => (num(r.wins) === null ? dash : String((r.wins || 0) + (r.losses || 0) + (r.otLosses || 0))), N],
    ['W', r => int(r.wins)], ['L', r => int(r.losses)], ['OTL', r => int(r.otLosses)], ['PTS', r => int(r.points)], ['STRK', r => streakText(r.streak), T]
  ],
  mlb: [
    ['W', r => int(r.wins)], ['L', r => int(r.losses)], ['PCT', pctText], ['GB', r => gbText(r.gamesBehind)],
    ['DIFF', r => signed(diffOf(r)), N], ['STRK', r => streakText(r.streak), T]
  ]
};

const cellHtml = (text, drop) => `<span class="st-c${drop ? ` ${drop}` : ''}">${escapeHtml(text)}</span>`;

// A row's stat cells, or '' for a league without columns.
export function standingsColsHtml(leagueKey, row){
  const cols = STANDINGS_COLS[leagueKey];
  if(!cols || !row) return '';
  return `<div class="st-cols">${cols.map(([, fn, drop]) => cellHtml(fn(row), drop)).join('')}</div>`;
}

// The column labels over a table: a row shaped like the standings rows
// (rank, badge slot, team and owner, then the cells).
export function standingsHeadHtml(leagueKey, { owner = true } = {}){
  const cols = STANDINGS_COLS[leagueKey];
  if(!cols) return '';
  return `<div class="standings-row st-row st-head" aria-hidden="true"><div class="standings-rank">#</div><span class="st-head-badge"></span>`
    + `<div class="team-main"><div class="team-name">Team</div>${owner ? '<div class="team-sub">Drafted by</div>' : ''}</div>`
    + `<div class="st-cols">${cols.map(([label, , drop]) => cellHtml(label, drop)).join('')}</div></div>`;
}

// ---- The All overview (every width) ----

// Leaders across a whole league, both conferences together: the NHL by
// points, everyone else by win percentage; then wins, then name.
export function leagueLeaders(rows, leagueKey){
  const score = leagueKey === 'nhl'
    ? r => (num(r.points) === null ? -1 : r.points)
    : r => { const p = pctText(r); return p === dash ? -1 : Number(p); };
  return [...rows].sort((a, b) => (score(b) - score(a))
    || ((b.wins || 0) - (a.wins || 0))
    || String(a.teamName || '').localeCompare(String(b.teamName || '')));
}

// The rows an overview card shows: the top `n`, then any row further down
// that `isMine` picks out, each with its real rank. `gap` marks a row
// that follows skipped ones.
export function overviewRows(rows, isMine, n = 5){
  const out = [];
  rows.forEach((row, i) => {
    if(i >= n && !isMine(row)) return;
    const prev = out[out.length - 1];
    out.push({ row, rank: i + 1, gap: !!prev && prev.rank !== i });
  });
  return out;
}
