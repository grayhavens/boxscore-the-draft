/* ============================================================
   Scoring lines: how close a team is to each placement rule it can win
   or lose ("1½ games up on the Packers for the division", "2 points from
   the drop"). Pure, so Node tests can check it (tests/lines-math.test.mjs);
   js/lines.js feeds it the same ranked tables the rules score from
   (rankAutoRowTables in js/league-facts.js) and draws the result.

   Distance is in games behind for leagues ranked on record, and in table
   points for EPL and NHL, which rank on points. "Clinched", "out of
   reach", "safe" and "can't climb out" only use games left and ignore
   tiebreakers, so they only say so when it holds whatever the tiebreak.
   College seasons vary in length, so they only get the distance.
   ============================================================ */

// unit: what the gap is counted in. games: regular-season length (null
// when it varies). perWin: table points a win is worth.
export const LINE_LEAGUES = {
  nfl: { unit: 'games', games: 17 },
  nba: { unit: 'games', games: 82 },
  nhl: { unit: 'pts', games: 82, perWin: 2 },
  mlb: { unit: 'games', games: 162 },
  wnba: { unit: 'games', games: 44 },
  epl: { unit: 'pts', games: 38, perWin: 3 },
  cfb: { unit: 'games', games: null },
  mcbb: { unit: 'games', games: null }
};

// A standings row, flattened. A tie (or EPL draw) counts as half a win
// and half a loss, the way games behind is usually figured.
export function lineRecord(row){
  const w = Number(row.wins) || 0, l = Number(row.losses) || 0;
  const t = Number(row.ties ?? row.draws) || 0, otl = Number(row.otLosses) || 0;
  const gp = Number.isFinite(row.gamesPlayed) ? row.gamesPlayed : w + l + t + otl;
  return { w: w + t / 2, l: l + t / 2 + otl, pts: Number(row.points) || 0, gp };
}

// How far `a` trails `b` (negative when it's ahead).
export function behind(a, b, cfg){
  if(cfg.unit === 'pts') return b.pts - a.pts;
  return ((b.w - a.w) + (a.l - b.l)) / 2;
}

const left = (x, cfg) => Math.max(0, cfg.games - x.gp);

// The most `x` can still finish with, in the unit that ranks the table.
function ceiling(x, cfg){
  return cfg.unit === 'pts' ? x.pts + cfg.perWin * left(x, cfg) : x.w + left(x, cfg);
}

function current(x, cfg){
  return cfg.unit === 'pts' ? x.pts : x.w;
}

// `a` finishes ahead of `b` however the rest of the season goes.
export function staysAhead(a, b, cfg){
  if(!cfg.games) return false;
  return current(a, cfg) > ceiling(b, cfg);
}

// A gap in games (points over perWin) for ranking close calls across leagues.
export function gapInGames(gap, cfg){
  return cfg.unit === 'pts' ? gap / cfg.perWin : gap;
}

// The positions (0-based, inclusive) a rankAuto spec pays out on, in a
// table of `total` teams.
export function specRange(spec, total){
  if(spec.bottom) return [Math.max(0, total - spec.bottom), total - 1];
  if(spec.top) return [0, Math.min(spec.top, total) - 1];
  return [spec.rank - 1, spec.rank - 1];
}

// Where the team at `idx` stands against one rule. `table` is
// [{ record, name }] in rank order. Returns null when the line doesn't
// apply (a team already above an exact placement like "2nd in EPL").
//   status: holds | clinched | chasing | out          (a rule worth points)
//           risk | stuck | clear | safe                (a rule that costs them)
//   gap:    distance to the rival, never negative
//   rival:  the team on the other side of the line
export function lineStatus(table, idx, spec, cfg){
  const total = table.length;
  if(idx < 0 || idx >= total || total < 2) return null;
  const [lo, hi] = specRange(spec, total);
  const me = table[idx].record;
  const at = i => table[i];

  if(spec.bottom){
    if(idx >= lo){
      const safe = at(lo - 1);
      if(!safe) return null;
      return { status: staysAhead(safe.record, me, cfg) ? 'stuck' : 'risk', gap: Math.max(0, behind(me, safe.record, cfg)), rival: safe };
    }
    const edge = at(lo);
    return { status: staysAhead(me, edge.record, cfg) ? 'safe' : 'clear', gap: Math.max(0, behind(edge.record, me, cfg)), rival: edge };
  }

  if(idx < lo) return null;
  if(idx <= hi){
    const next = at(hi + 1);
    if(!next) return { status: 'clinched', gap: 0, rival: null };
    return { status: staysAhead(me, next.record, cfg) ? 'clinched' : 'holds', gap: Math.max(0, behind(next.record, me, cfg)), rival: next };
  }
  const target = at(hi);
  return { status: staysAhead(target.record, me, cfg) ? 'out' : 'chasing', gap: Math.max(0, behind(me, target.record, cfg)), rival: target };
}

// "1½ games", "½ game", "4 pts", "1 pt".
export function gapText(gap, cfg){
  if(cfg.unit === 'pts') return `${gap} pt${gap === 1 ? '' : 's'}`;
  const whole = Math.floor(gap), half = gap - whole >= 0.5;
  const n = `${whole || !half ? whole : ''}${half ? '½' : ''}`;
  return `${n} game${gap === 1 || (whole === 0 && half) ? '' : 's'}`;
}
