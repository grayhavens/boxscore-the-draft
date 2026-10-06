/* ============================================================
   Team page, wide layout: the pure math behind its two new panels
   (docs/desktop-redesign-brief.md, handoff ROUND2.md), kept out of
   js/team-page.js so Node tests can import it.

   - Game by game: one bar per game this season, oldest left, newest
     right. A win grows up from the zero line, a loss down, a draw is a
     flat mark. Height is the margin against a per-league cap (a goal
     means more in the EPL than a point does in the NBA), so one blowout
     doesn't flatten every other bar; a bar past the cap is drawn at the
     cap and marked clamped.
   - The hero's glow color: the team's own color, or its second color
     when the first is too dark to show on the dark ground (Newcastle,
     the Steelers).
   ============================================================ */

// The margin a full-height bar stands for: goals in EPL and NHL, runs in
// MLB, points elsewhere.
export const MARGIN_CAPS = { epl: 3, nfl: 24, nba: 20, nhl: 4, mlb: 8, wnba: 15, cfb: 28, mcbb: 20 };
export const GAME_BY_GAME_MAX = 20;

// A bar's height as a percent of the chart: half the chart above or below
// the zero line, less a little headroom, plus a 4% floor so a one-goal
// game still reads as a bar.
export function barHeight(margin, cap){
  const m = Math.min(Math.abs(margin), cap);
  return Math.round((m / cap * 46 + 4) * 10) / 10;
}

// `recent` is a team's played games, newest first (js/espn.js's
// fetchEspnTeamSchedule). Preseason games and any without a score are
// left out. Returns { games, w, l, d, total }: the last `max` games
// oldest first, each { id, date, home, opp, score, result, margin,
// height, clamped }, and the record over those games.
export function gameByGame(recent, leagueKey, max = GAME_BY_GAME_MAX){
  const cap = MARGIN_CAPS[leagueKey] || 20;
  const played = (recent || []).filter(e => e && e.seasonType !== 1
    && Number.isFinite(e.ownScore) && Number.isFinite(e.oppScore));
  const games = played.slice(0, max).reverse().map(e => {
    const margin = e.ownScore - e.oppScore;
    return {
      id: e.id || null,
      date: e.date || null,
      home: !!e.isHome,
      opp: e.opponentAbbr || e.opponentShortName || e.opponentName || '',
      score: `${e.ownScore}–${e.oppScore}`,
      result: margin > 0 ? 'w' : (margin < 0 ? 'l' : 'd'),
      margin,
      height: margin === 0 ? 0 : barHeight(margin, cap),
      clamped: Math.abs(margin) > cap
    };
  });
  const count = r => games.filter(g => g.result === r).length;
  return { games, w: count('w'), l: count('l'), d: count('d'), total: played.length };
}

// "9–2–3 · last 14": draws only where the league has them.
export function gameByGameSub({ games, w, l, d }, leagueKey){
  const record = leagueKey === 'epl' ? `${w}–${l}–${d}` : `${w}–${l}`;
  return `${record} · last ${games.length}`;
}

// WCAG relative luminance of a #RRGGBB color, 0 (black) to 1 (white).
export function luminance(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if(!m) return null;
  const n = parseInt(m[1], 16);
  const lin = c => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

// The glow behind the hero crest: the primary color, or the secondary
// when the primary is near-black and the secondary isn't. The handoff
// said 0.14, but saturated reds sit around 0.13 (Liverpool's #C8102E is
// 0.127) and would lose their own color; 0.04 still catches Newcastle
// (0.015), the Steelers and navy teams.
export const DARK_LUMINANCE = 0.04;
export function glowColor(primary, secondary){
  const p = luminance(primary);
  if(p !== null && p >= DARK_LUMINANCE) return primary;
  const s = luminance(secondary);
  if(s !== null && s >= DARK_LUMINANCE) return secondary;
  return primary || secondary || null;
}
