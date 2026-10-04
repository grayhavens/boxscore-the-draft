/* ============================================================
   NBA / NHL / MLB playoff rounds: pure, no DOM and no fetches, shared by
   js/playoff-series.js and tests/playoff-series-math.test.mjs.

   ESPN's scoreboard (one request per day) tags a playoff game with its
   round in competitions[0].notes[0].headline ("East Finals - Game 3",
   "Stanley Cup Final - Game 6") and, in competitions[0].series, the whole
   series' tally so far (each side's wins, `completed` once decided). The
   league's own competition type is the same for every round, so only the
   headline says which round it is. Checked against the 2026 NBA and NHL
   playoffs and the 2026 MLB postseason through the Division Series
   (tests/fixtures/espn-playoffs-*.json); the MLB LCS and World Series
   headlines ("NLCS", "ALCS", "World Series") are expected, not yet seen.

   Three rungs score in every league: 1 = conference finals (LCS), 2 = the
   final, and winning it. A team that reached the final also reached the
   conference finals, so a missed day can't lose it. A team is "in" a round
   the moment ESPN lists a game of that round with it, and that can't be
   undone; the title is won when the final's series is `completed`.
   Points come from the group's own LEAGUE_SCORING rules matched by label,
   so a group with different numbers needs no code change.
   ============================================================ */

export const PLAYOFF_SERIES_LEAGUES = {
  nba: {
    conf: /^(East|West) Finals\b/i, final: /^NBA Finals\b/i,
    rules: [{ re: /win (the )?finals/i, win: true }, { re: /make (the )?finals/i, reach: 2 }, { re: /conference finals/i, reach: 1 }],
    window: year => ({ from: [year, 4, 1], to: [year, 5, 30] })
  },
  nhl: {
    conf: /^(East|West) Final\b/i, final: /^Stanley Cup Final/i,
    rules: [{ re: /win stanley cup/i, win: true }, { re: /make stanley cup/i, reach: 2 }, { re: /conference finals/i, reach: 1 }],
    window: year => ({ from: [year, 4, 1], to: [year, 5, 30] })
  },
  mlb: {
    conf: /^(AL|NL)CS\b/i, final: /^World Series\b/i,
    rules: [{ re: /win (the )?world series/i, win: true }, { re: /make (the )?world series/i, reach: 2 }, { re: /\blcs\b/i, reach: 1 }],
    window: year => ({ from: [year, 9, 10], to: [year, 10, 12] })
  }
};

// Rules of a league's scoring that a playoff run can earn, with the rung each needs.
export function seriesMilestones(leagueKey, rules){
  const L = PLAYOFF_SERIES_LEAGUES[leagueKey];
  if(!L) return [];
  return (rules || []).filter(r => !r.rankAuto).map(r => {
    const m = L.rules.find(x => x.re.test(r.label));
    return m ? { label: r.label, ...(m.win ? { win: true } : { reach: m.reach }) } : null;
  }).filter(Boolean);
}

// The days worth asking ESPN about: every third day of the league's late
// rounds (a series lasts at least four games over a week, so one request in
// three still sees every series), up to `today`. Dates as YYYYMMDD.
export function playoffDates(leagueKey, year, today = new Date()){
  const L = PLAYOFF_SERIES_LEAGUES[leagueKey];
  if(!L) return [];
  const { from, to } = L.window(year);
  const out = [];
  for(let d = new Date(Date.UTC(...from)); d <= new Date(Date.UTC(...to)) && d <= today; d = new Date(d.getTime() + 3 * 864e5)){
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return out;
}

// The three-day sample can step over the clinching game, and a game's series
// tally is only as of that game. Once a final-round game has been seen and
// nobody has won it yet, these are the days after the last one seen, one by
// one, that finish the question (YYYYMMDD, up to `today`).
export function finalFollowUps(leagueKey, games, today = new Date()){
  const finals = (games || []).filter(g => seriesRound(leagueKey, g.headline) === 2 && g.day);
  if(!finals.length || Object.values(playoffReach(leagueKey, games)).some(t => t.champion)) return [];
  const last = finals.map(g => g.day).sort().at(-1);
  const out = [];
  for(let i = 1; i <= 9; i++){
    const d = new Date(Date.UTC(+last.slice(0, 4), +last.slice(4, 6) - 1, +last.slice(6, 8) + i));
    if(d > today) break;
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ''));
  }
  return out;
}

// One raw ESPN scoreboard event → the fields the rounds need, or null for
// anything that isn't a postseason game (the NBA play-in is its own season type).
export function parseSeriesEvent(event){
  const comp = event && event.competitions && event.competitions[0];
  if(!comp || !event.season || event.season.slug !== 'post-season') return null;
  const note = (comp.notes || []).find(n => n.headline);
  const series = comp.series || null;
  return {
    id: String(event.id), day: String(event.date || '').slice(0, 10).replace(/-/g, ''),
    needed: series && series.totalCompetitions ? Math.ceil(series.totalCompetitions / 2) : 4,
    headline: note ? note.headline : '',
    seriesDone: !!(series && series.completed),
    wins: series ? (series.competitors || []).map(c => ({ id: String(c.id), wins: Number(c.wins) || 0 })) : [],
    sides: (comp.competitors || []).map(c => ({ id: String((c.team && c.team.id) || c.id), name: (c.team && c.team.displayName) || '' }))
  };
}

// Round of a parsed game: 1 conference finals, 2 the final, 0 earlier.
export function seriesRound(leagueKey, headline){
  const L = PLAYOFF_SERIES_LEAGUES[leagueKey];
  if(!L) return 0;
  if(L.final.test(headline)) return 2;
  if(L.conf.test(headline)) return 1;
  return 0;
}

// Parsed games → { [espnTeamId]: { name, round, champion } } for every team in the late rounds.
export function playoffReach(leagueKey, games){
  const teams = {};
  (games || []).forEach(g => {
    const round = seriesRound(leagueKey, g.headline);
    if(!round) return;
    g.sides.forEach(s => {
      if(!s.id) return;
      const t = teams[s.id] || (teams[s.id] = { name: s.name, round: 0, champion: false });
      t.round = Math.max(t.round, round);
    });
    // A series is won with the clinching game, which is also what flips
    // `completed`: the tally on an earlier game is only as of that game.
    const top = [...g.wins].sort((a, b) => b.wins - a.wins);
    if(round === 2 && top.length === 2 && top[0].wins > top[1].wins && (g.seriesDone || top[0].wins >= g.needed) && teams[top[0].id]) teams[top[0].id].champion = true;
  });
  return teams;
}

// The ESPN team ids that have earned one rule label, or null when the
// rule isn't a playoff-run rule.
export function teamsEarning(leagueKey, rules, label, reach){
  const m = seriesMilestones(leagueKey, rules).find(x => x.label === label);
  if(!m) return null;
  return Object.entries(reach).filter(([, t]) => m.win ? t.champion : t.round >= m.reach).map(([id]) => id);
}
