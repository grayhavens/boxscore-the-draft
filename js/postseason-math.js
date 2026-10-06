/* ============================================================
   Postseason ladder math (Standings → NFL/CFB/CBB/MLB/WNBA → Postseason): pure, no
   DOM and no fetches, shared by js/postseason.js and
   tests/postseason-math.test.mjs.

   ESPN's postseason scoreboard (parseScoreboardEvent) becomes a bracket
   (buildBracket): every game with its round, both sides and the score.
   snapshot(bracket, stage, …) is what the ladder, the drafted table and the
   team page's Postseason section show at one replay stage: 0 is the field
   set, the last (one per round: 4 for football, 6 for the NCAA
   Tournament) the champion, and stage s means rounds 1..s are over. At the
   latest stage the round being played counts too, game by game, so a team
   that won on Saturday has already moved up while Sunday's games are still
   to come.

   Points come from the group's own LEAGUE_SCORING rules (milestonesFor): a
   rule is matched by its label to the round it's for, so a group with
   different numbers gets them here without a code change.

   The NCAA Tournament (mcbb) adds two things football doesn't have. The
   First Four is played as part of the first round (`playIn` games): its
   teams start on the first rung with everyone else, a loser stays there,
   and a win doesn't move a team up. And one rule scores the teams that
   aren't in the field at all ("Don't make NCAA tournament", a `miss`
   rule), which js/postseason.js answers from the bracket too.

   MLB plays series, not games. ESPN's scoreboard has one event per game
   ("ALDS - Game 2", with the series tally so far), so seriesEvents folds
   each series into one event first (its score is the series wins) and
   the bracket treats a series like a football game: final once someone
   has won it. A series under way but between games is `begun`, so the
   round reads as under way. Seeds 1 and 2 in each league skip the Wild
   Card (byes, from the final standings like the NFL's 1 seeds).

   The WNBA plays series too (first round best of 3, semifinals 5, Finals
   7): eight teams seeded 1-8 league-wide, no conferences and no byes.

   A series still being played carries its tally (`series` on each of
   snapshot's games, latest stage only: a replayed stage can't know the
   tally back then), and the ladder writes it in place of the pair's "v"
   once a game is in ("1-0", read left to right like the chips), so it
   costs no room. seriesLine says the same in words for screen readers.
   Any league whose events come through seriesEvents gets this (MLB, WNBA).

   MLB's ladder is also split down the middle (`sides`): AL teams on the
   left half of every rung, NL on the right, each half laid out on its own
   (rungRows), so the two leagues read as columns under an AL / NL label
   and the World Series pair meets in the middle.
   ============================================================ */

const NFL = {
  key: 'nfl', fieldSize: 14, byeSeeds: 1,
  rounds: ['Wild Card', 'Divisional', 'Conference', 'Super Bowl'],
  roundShort: ['WC', 'DIV', 'CONF', 'SB'],
  rungs: ['Wild Card', 'Divisional', 'Conference', 'Super Bowl', 'Champion'],
  stages: ['Field set', 'After Wild Card', 'After Divisional', 'After title games', 'Champion'],
  gamesPerRound: [6, 4, 2, 1],
  champTitle: 'Super Bowl champions',
  // A rule's label → the round a team has to enter for it (`win`: win the last one).
  rules: [
    { re: /win (the )?super bowl/i, win: true },
    { re: /make (the )?super bowl/i, reach: 4 },
    { re: /conference championship/i, reach: 3 }
  ],
  roundOf(evt){
    const h = evt.headline || '';
    if(/pro bowl/i.test(h)) return 0;
    if(/super bowl/i.test(h)) return 4;
    if(/wild ?card/i.test(h)) return 1;
    if(/divisional/i.test(h)) return 2;
    if(/championship/i.test(h)) return 3;
    return { 1: 1, 2: 2, 3: 3, 5: 4 }[evt.week] || 0;
  },
  groupOf(evt){ const m = /^(AFC|NFC)\b/.exec(evt.headline || ''); return m ? m[1] : ''; },
  noteOf(evt, round){
    if(round === 4) return (evt.headline || 'Super Bowl').trim();
    if(round === 3) return `${this.groupOf(evt)} Championship`.trim();
    return '';
  }
};

const CFB = {
  key: 'cfb', fieldSize: 12,
  rounds: ['First round', 'Quarterfinals', 'Semifinals', 'National Championship'],
  roundShort: ['R1', 'QF', 'SF', 'NC'],
  rungs: ['First round', 'Quarterfinal', 'Semifinal', 'Final', 'Champion'],
  stages: ['Field set', 'After first round', 'After quarterfinals', 'After semifinals', 'Champion'],
  gamesPerRound: [4, 4, 2, 1],
  champTitle: 'National champions', byLocation: true,
  rules: [
    { re: /win (the )?national championship/i, win: true },
    { re: /national championship/i, reach: 4 },
    { re: /semifinal/i, reach: 3 },
    { re: /make the cfp|college football playoff/i, reach: 0 }
  ],
  roundOf(evt){
    const h = evt.headline || '';
    if(!/college football playoff/i.test(h)) return 0;
    if(/national championship/i.test(h)) return 4;
    if(/semifinal/i.test(h)) return 3;
    if(/quarterfinal/i.test(h)) return 2;
    if(/first round/i.test(h)) return 1;
    return 0;
  },
  groupOf(){ return ''; },
  noteOf(evt, round){
    if(round === 4) return 'National Championship';
    const m = /(Rose|Sugar|Orange|Cotton|Fiesta|Peach) Bowl/i.exec(evt.headline || '');
    return m ? m[0] : '';
  }
};

// The NCAA men's tournament: 68 teams, the First Four, then six rounds.
// Each round is a rung, the first one ("Tournament") holding the First
// Four too. ESPN's headlines read "NCAA Men's Basketball Championship -
// East Region - 1st Round"; the seed is ESPN's rank on the game.
const MCBB = {
  key: 'mcbb', fieldSize: 68,
  rounds: ['Round of 64', 'Round of 32', 'Sweet 16', 'Elite Eight', 'Final Four', 'National Championship'],
  roundShort: ['R64', 'R32', 'S16', 'E8', 'F4', 'NC'],
  rungs: ['Tournament', 'Round of 32', 'Sweet 16', 'Elite Eight', 'Final Four', 'Title game', 'Champion'],
  stages: ['Field set', 'After Round of 64', 'After Round of 32', 'After Sweet 16', 'After Elite Eight', 'After Final Four', 'Champion'],
  gamesPerRound: [32, 16, 8, 4, 2, 1],
  champTitle: 'National champions', byLocation: true,
  rules: [
    { re: /win (the )?national championship/i, win: true },
    { re: /don.t make (the )?ncaa tournament/i, miss: true },
    { re: /national championship game/i, reach: 6 },
    { re: /elite eight/i, reach: 4 },
    { re: /make (the )?ncaa tournament/i, reach: 0 }
  ],
  roundOf(evt){
    const h = evt.headline || '';
    if(!/basketball championship/i.test(h)) return 0;
    if(/national championship/i.test(h)) return 6;
    if(/final four/i.test(h)) return 5;
    if(/elite (8|eight)/i.test(h)) return 4;
    if(/sweet (16|sixteen)/i.test(h)) return 3;
    if(/2nd round|second round/i.test(h)) return 2;
    if(/1st round|first round|first four/i.test(h)) return 1;
    return 0;
  },
  playIn(evt){ return /first four/i.test(evt.headline || ''); },
  groupOf(evt){ const m = /- (\w+) Region/i.exec(evt.headline || ''); return m ? m[1] : ''; },
  noteOf(evt, round){
    if(round === 6) return 'National Championship';
    return this.playIn(evt) ? 'First Four' : '';
  }
};

// MLB: 12 teams, the Wild Card Series (best of 3), Division Series (5),
// LCS and World Series (7). Each "game" here is a whole series
// (seriesEvents), its headline the round: "ALWC", "NLDS", "ALCS",
// "World Series". The rules are the ones js/playoff-series-math.js reads.
const MLB = {
  key: 'mlb', fieldSize: 12, byeSeeds: 2, series: true, seriesNeed: [2, 3, 4, 4],
  rounds: ['Wild Card', 'Division Series', 'LCS', 'World Series'],
  roundShort: ['WC', 'DS', 'LCS', 'WS'],
  rungs: ['Wild Card', 'Division Series', 'LCS', 'World Series', 'Champion'],
  stages: ['Field set', 'After Wild Card', 'After Division Series', 'After LCS', 'Champion'],
  gamesPerRound: [4, 4, 2, 1],
  champTitle: 'World Series champions', word: 'Postseason', sides: ['AL', 'NL'],
  rules: [
    { re: /win (the )?world series/i, win: true },
    { re: /make (the )?world series/i, reach: 4 },
    { re: /\blcs\b/i, reach: 3 }
  ],
  roundOf(evt){
    const h = evt.headline || '';
    if(/world series/i.test(h)) return 4;
    if(/\b(AL|NL)CS\b/.test(h)) return 3;
    if(/\b(AL|NL)DS\b/.test(h)) return 2;
    if(/\b(AL|NL)WC\b|wild ?card/i.test(h)) return 1;
    return 0;
  },
  groupOf(evt){ const m = /^(AL|NL)/.exec(evt.headline || ''); return m ? m[1] : ''; },
  noteOf(evt, round){ return round === 4 ? 'World Series' : ''; }
};

// WNBA: 8 teams seeded league-wide, first round (best of 3), semifinals
// (5) and the Finals (7), each a series like MLB's. ESPN's headlines are
// "First Round - Game 1", "Semifinals" (2025: "WNBA Semifinals") and
// "WNBA Finals" (once "WNBA FINALS"). Checked against the 2025 playoffs
// and the 2026 ones under way (2026-10-04).
const WNBA = {
  key: 'wnba', fieldSize: 8, series: true, seriesNeed: [2, 3, 4],
  rounds: ['First Round', 'Semifinals', 'Finals'],
  roundShort: ['R1', 'SF', 'F'],
  rungs: ['First Round', 'Semifinals', 'Finals', 'Champion'],
  stages: ['Field set', 'After first round', 'After semifinals', 'Champion'],
  gamesPerRound: [4, 2, 1],
  champTitle: 'WNBA champions',
  rules: [
    { re: /win (the )?finals/i, win: true },
    { re: /reach (the )?finals/i, reach: 3 },
    { re: /semifinals/i, reach: 2 }
  ],
  roundOf(evt){
    const h = evt.headline || '';
    if(/semifinals/i.test(h)) return 2;
    if(/finals/i.test(h)) return 3;
    if(/first round/i.test(h)) return 1;
    return 0;
  },
  groupOf(){ return ''; },
  noteOf(evt, round){ return round === 3 ? 'WNBA Finals' : ''; }
};

export const POSTSEASON_LEAGUES = { nfl: NFL, cfb: CFB, mcbb: MCBB, mlb: MLB, wnba: WNBA };

// The league's last round, which is also its Champion rung and the stage
// the champion is crowned on (4 for football, 6 for the NCAA Tournament).
export function finalRound(leagueKey){
  const L = POSTSEASON_LEAGUES[leagueKey];
  return L ? L.rounds.length : 0;
}

// The rules a postseason run can score, in the order they're listed, each
// with the round it needs: { label, pts, reach } or { label, pts, win: true }.
export function milestonesFor(leagueKey, rules){
  const L = POSTSEASON_LEAGUES[leagueKey];
  if(!L) return [];
  return (rules || []).filter(r => !r.rankAuto).map(r => {
    const m = L.rules.find(x => x.re.test(r.label));
    return m && !m.miss ? { label: r.label, pts: r.pts, ...(m.win ? { win: true } : { reach: m.reach }) } : null;
  }).filter(Boolean);
}

// Is this rule the one for a team that isn't in the field at all (the
// NCAA's "Don't make NCAA tournament")? Not a milestone of any team on
// the ladder: js/postseason.js scores it from who's missing.
export function isMissRule(leagueKey, rule){
  const L = POSTSEASON_LEAGUES[leagueKey];
  const m = L && rule && L.rules.find(x => x.re.test(rule.label));
  return !!(m && m.miss);
}

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : null; };

// One event from ESPN's site scoreboard → the fields the bracket needs. A
// side not decided yet (ESPN's "TBD") has no id.
export function parseScoreboardEvent(event){
  const comp = event && event.competitions && event.competitions[0];
  if(!comp) return null;
  const type = (comp.status && comp.status.type) || (event.status && event.status.type) || {};
  const note = (comp.notes || []).find(n => n.headline);
  const sides = (comp.competitors || []).map(c => {
    const t = c.team || {};
    const id = String(t.id || c.id || '');
    const known = /^\d+$/.test(id) && Number(id) > 0 && (t.abbreviation || '') !== 'TBD';
    const overall = (c.records || []).find(r => r.type === 'total' || r.name === 'overall');
    const rank = c.curatedRank && num(c.curatedRank.current);
    return {
      id: known ? id : null,
      abbr: t.abbreviation || '', location: t.location || '', name: t.name || t.shortDisplayName || '',
      displayName: t.displayName || '', logo: t.logo || null,
      score: c.score !== undefined && c.score !== '' ? num(c.score) : null,
      winner: !!c.winner, home: c.homeAway === 'home',
      rank: rank && rank < 99 ? rank : null,
      record: overall ? overall.summary : null
    };
  });
  // A playoff series' tally as of this game (MLB, seriesEvents):
  // { need, done, wins: { espnId: n } }.
  const ser = comp.series && comp.series.type === 'playoff' ? comp.series : null;
  return {
    id: String(event.id), date: event.date, headline: note ? note.headline : '',
    week: event.week ? num(event.week.number) : null,
    state: type.state || 'pre', detail: type.detail || type.shortDetail || '',
    sides,
    ...(ser ? { series: {
      need: ser.totalCompetitions ? Math.ceil(ser.totalCompetitions / 2) : null, done: !!ser.completed,
      wins: Object.fromEntries((ser.competitors || []).map(c => [String(c.id), Number(c.wins) || 0]))
    } } : {})
  };
}

// MLB / WNBA: one event per game → one per series, in parseScoreboardEvent's
// shape, so buildBracket reads a series like a single game. A series is
// its round ("ALDS", from "ALDS - Game 2") and its two teams. Its sides'
// scores are series wins: the best of ESPN's tally on its latest game and
// the finished games counted here (a missed day can't lose a win). It's
// final ('post') once a side has the wins it needs, live ('in') while one
// of its games is, and `begun` from its first pitch.
export function seriesEvents(leagueKey, events){
  const L = POSTSEASON_LEAGUES[leagueKey];
  const series = new Map();
  (events || []).forEach(evt => {
    if(!evt || evt.sides.length !== 2) return;
    const round = L.roundOf(evt);
    if(!round) return;
    const ids = evt.sides.map(s => s.id);
    const key = `${round}:${ids.slice().sort().join('-')}`;
    const s = series.get(key) || series.set(key, { round, games: [] }).get(key);
    s.games.push(evt);
  });
  return [...series.values()].map(({ round, games }) => {
    games.sort((x, y) => String(x.date).localeCompare(String(y.date)));
    const first = games[0], last = games[games.length - 1];
    const counted = {};
    games.filter(g => g.state === 'post').forEach(g => {
      const w = g.sides.find(x => x.winner) || null;
      if(w && w.id) counted[w.id] = (counted[w.id] || 0) + 1;
    });
    const tally = (games.slice().reverse().find(g => g.series) || {}).series || null;
    const need = (tally && tally.need) || (L.seriesNeed || [])[round - 1] || 4;
    const sides = first.sides.map(sd => {
      const wins = sd.id ? Math.max(counted[sd.id] || 0, (tally && tally.wins[sd.id]) || 0) : 0;
      return { ...sd, score: wins, winner: wins >= need };
    });
    const done = sides.some(sd => sd.winner);
    return {
      id: first.id, date: first.date, headline: (first.headline || '').split(' - ')[0],
      week: null, detail: '', sides, need,
      state: done ? 'post' : games.some(g => g.state === 'in') ? 'in' : 'pre',
      begun: games.some(g => g.state !== 'pre'),
      lastDate: last.date
    };
  });
}

// The playoff seeds per conference (the NFL's 1-7, MLB's 1-6 per league)
// from a season's final standings (ESPN's site standings, `playoffSeed`):
// { espnId: { seed, conf, record, … } }.
export function parseNflSeeds(data, maxSeed = 7){
  const seeds = {};
  ((data && data.children) || []).forEach(conf => {
    ((conf.standings && conf.standings.entries) || []).forEach(e => {
      const stat = name => (e.stats || []).find(s => s.name === name);
      const seed = num(stat('playoffSeed') && stat('playoffSeed').value);
      if(!seed || seed > maxSeed || !e.team) return;
      const overall = (e.stats || []).find(s => s.type === 'total' || s.name === 'overall');
      const logo = (e.team.logos || [])[0];
      seeds[String(e.team.id)] = {
        seed, conf: conf.abbreviation || '', record: overall ? overall.displayValue : null,
        abbr: e.team.abbreviation || '', location: e.team.location || '', name: e.team.name || '',
        displayName: e.team.displayName || '', logo: logo ? logo.href : null
      };
    });
  });
  return seeds;
}

// Events (parseScoreboardEvent) →{ league, games, teams, byes }, or null
// before the field is set (no first-round game with both sides decided).
// seeds: NFL and MLB, { espnId: { seed, conf, record } } from the final
// regular-season standings; CFB reads its seed off ESPN's CFP rank. MLB's
// events are series (seriesEvents).
export function buildBracket(leagueKey, events, seeds = {}){
  const L = POSTSEASON_LEAGUES[leagueKey];
  if(!L) return null;
  const teams = {};
  const games = [];
  (events || []).forEach(evt => {
    if(!evt || evt.sides.length !== 2) return;
    const round = L.roundOf(evt);
    if(!round) return;
    const playIn = !!(L.playIn && L.playIn(evt));
    const [a, b] = evt.sides;
    [a, b].forEach(s => {
      if(!s.id) return;
      const t = teams[s.id] || (teams[s.id] = { id: s.id, abbr: s.abbr, location: s.location, name: s.name, displayName: s.displayName, logo: s.logo, seed: null, conf: '', record: null });
      const seed = seeds[s.id];
      if(seed){
        t.seed = seed.seed; t.conf = seed.conf || t.conf; t.record = seed.record || t.record;
      } else if(s.rank && (t.seed === null || round <= 2)) t.seed = s.rank;
      if(!t.record && s.record) t.record = s.record;
      if(!t.conf) t.conf = L.groupOf(evt);
      if(!t.logo && s.logo) t.logo = s.logo;
    });
    const final = evt.state === 'post' && a.score !== null && b.score !== null && !!(a.id && b.id);
    const winner = final ? (a.winner ? a.id : b.winner ? b.id : (a.score > b.score ? a.id : b.id)) : null;
    const live = evt.state === 'in';
    games.push({
      id: evt.id, date: evt.date, round, playIn, group: L.groupOf(evt), note: L.noteOf(evt, round),
      a: a.id, b: b.id, scoreA: a.score, scoreB: b.score,
      final, live, begun: final || live || !!evt.begun, winner,
      ot: final && /OT/.test(evt.detail || ''),
      // A series (seriesEvents): the wins it takes; its scores are series wins.
      need: evt.need || null
    });
  });
  const firstRound = games.filter(g => g.round === 1);
  if(!firstRound.some(g => g.a && g.b)) return null;
  games.sort((x, y) => x.round - y.round || String(x.date).localeCompare(String(y.date)));
  // A bye: in the field with no first-round game. The NFL's 1 seeds and
  // MLB's 1 and 2 seeds (`byeSeeds`) are known from the standings before
  // their first game is set. (The First Four are first-round games here,
  // so the NCAA has no byes.)
  const inRound1 = new Set(firstRound.flatMap(g => [g.a, g.b]).filter(Boolean));
  if(L.byeSeeds){
    Object.entries(seeds).forEach(([id, s]) => {
      if(s.seed <= L.byeSeeds && !teams[id]) teams[id] = { id, abbr: s.abbr || '', location: s.location || '', name: s.name || '', displayName: s.displayName || '', logo: s.logo || null, seed: s.seed, conf: s.conf || '', record: s.record || null };
    });
  }
  const byes = Object.keys(teams).filter(id => !inRound1.has(id));
  return { league: leagueKey, games, teams, byes };
}

// How many rounds are over (0 to the final round): the stage the ladder
// opens on.
export function latestStage(bracket){
  const L = POSTSEASON_LEAGUES[bracket.league];
  let s = 0;
  for(let r = 1; r <= L.rounds.length; r++){
    const round = bracket.games.filter(g => g.round === r && !g.playIn);
    if(round.length < L.gamesPerRound[r - 1] || !round.every(g => g.final)) break;
    s = r;
  }
  return s;
}

// Has any postseason game kicked off? The Standings card opens on
// Postseason from then on.
export function postseasonStarted(bracket){
  return !!bracket && bracket.games.some(g => g.begun);
}

// What the Home banner calls the postseason right now: the round being
// played or up next (the ladder's frontier), 'First Four' while the
// NCAA's play-in games are all that's on, 'Champion' once it's over, and
// null before any game has started (the field is just set).
export function currentRoundName(bracket){
  const L = POSTSEASON_LEAGUES[bracket.league];
  const latest = latestStage(bracket);
  if(latest === L.rounds.length) return 'Champion';
  if(!postseasonStarted(bracket)) return null;
  const next = bracket.games.filter(g => g.round === latest + 1);
  const playInLeft = next.some(g => g.playIn && !g.final);
  const mainStarted = next.some(g => !g.playIn && g.begun);
  return playInLeft && !mainStarted ? 'First Four' : L.rounds[latest];
}

// When the title game was played (its scheduled start), or null.
export function titleGameDate(bracket){
  const g = bracket.games.find(x => x.round === POSTSEASON_LEAGUES[bracket.league].rounds.length && x.final);
  return g ? new Date(g.date) : null;
}

// Everything the views need at one stage. opts: { rules, ownerOf(team) →
// { teamKey, owner } | null, drafters: [{ id, name }], me }.
export function snapshot(bracket, stage, { rules = [], ownerOf = () => null, drafters = [], me = null } = {}){
  const L = POSTSEASON_LEAGUES[bracket.league];
  const N = L.rounds.length;
  const latest = latestStage(bracket);
  stage = Math.max(0, Math.min(latest, stage));
  const isLatest = stage === latest;
  // A game counts at this stage once its round is over, or (at the latest
  // stage) as soon as it's final.
  const counts = g => g.final && (g.round <= stage || (isLatest && g.round === stage + 1));
  const milestones = milestonesFor(bracket.league, rules);
  const nameOf = id => (drafters.find(d => d.id === id) || {}).name || null;

  const byId = {};
  Object.values(bracket.teams).forEach(t => {
    const o = ownerOf(t) || {};
    byId[t.id] = {
      ...t, teamKey: o.teamKey || null, owner: o.owner || null, ownerName: o.owner ? nameOf(o.owner) : null,
      mine: !!o.owner && o.owner === me, isBye: bracket.byes.includes(t.id),
      outRound: null, outPlayIn: false, wonRound: 0, path: []
    };
  });
  bracket.games.filter(counts).forEach(g => {
    const loser = g.winner === g.a ? g.b : g.a;
    if(byId[loser]){ byId[loser].outRound = g.round; byId[loser].outPlayIn = g.playIn; }
    // A First Four win only gets a team into the Round of 64.
    if(byId[g.winner] && !g.playIn) byId[g.winner].wonRound = Math.max(byId[g.winner].wonRound, g.round);
  });

  const teams = Object.values(byId);
  teams.forEach(t => {
    t.alive = t.outRound === null;
    // The furthest round this team is in: one past its last win, a bye
    // starts in round 2, and an eliminated team stays in the round it lost.
    t.entered = t.alive ? Math.max(t.wonRound + 1, t.isBye ? 2 : 1) : t.outRound;
    t.champion = t.alive && t.wonRound === N;
    t.justOut = !t.alive && (t.outRound === stage || (isLatest && t.outRound === stage + 1));
    t.bye = t.isBye && stage === 0;
    t.rung = t.champion ? N : t.entered - 1;
  });
  const seen = id => byId[id] && byId[id].entered;

  const games = bracket.games.map(g => {
    const final = counts(g);
    // A side is shown once that team has reached this round (at this stage).
    const side = (id, score) => ({ team: id && seen(id) >= g.round ? byId[id] : null, score: final ? score : null, won: final && id === g.winner, lost: final && !!g.winner && id !== g.winner });
    // A series still being played, at the latest stage: its tally so far.
    const series = isLatest && g.need && !final && g.a && g.b
      ? { need: g.need, top: g.scoreA || 0, bot: g.scoreB || 0, wins: { [g.a]: g.scoreA || 0, [g.b]: g.scoreB || 0 } } : null;
    return { ...g, final, live: isLatest && g.live, series, roundName: g.playIn ? 'First Four' : L.rounds[g.round - 1], top: side(g.a, g.scoreA), bot: side(g.b, g.scoreB) };
  });
  games.forEach(g => [g.top, g.bot].forEach(s => { if(s.team && g.round <= s.team.entered) s.team.path.push(g); }));

  teams.forEach(t => {
    t.milestones = milestones.map(m => {
      const got = m.win ? t.champion : t.entered >= m.reach;
      const possible = got || t.alive;
      return { ...m, got, possible, state: got ? 'Locked' : possible ? 'In play' : 'Missed' };
    });
    t.banked = t.milestones.filter(m => m.got).reduce((s, m) => s + m.pts, 0);
    t.inPlay = t.milestones.filter(m => !m.got && m.possible).reduce((s, m) => s + m.pts, 0);
    t.status = t.champion ? 'Champion' : !t.alive ? `Out · ${t.outPlayIn ? 'FF' : L.roundShort[t.outRound - 1]}` : t.bye ? 'Bye' : 'Alive';
    const next = t.alive && !t.champion ? t.path.find(g => !g.final) : null;
    t.next = next ? { opp: (next.top.team === t ? next.bot : next.top).team, round: next.roundName, live: next.live } : null;
  });

  const board = drafters.map(d => {
    const own = teams.filter(t => t.owner === d.id);
    return {
      ...d, me: d.id === me, teams: own,
      alive: own.filter(t => t.alive), inField: own.length > 0,
      banked: own.reduce((s, t) => s + t.banked, 0),
      inPlay: own.reduce((s, t) => s + t.inPlay, 0)
    };
  }).sort((a, b) => (b.alive.length > 0) - (a.alive.length > 0) || (b.banked + b.inPlay) - (a.banked + a.inPlay) || b.banked - a.banked);

  const champ = teams.find(t => t.champion) || null;
  const started = games.filter(g => g.round === stage + 1 && (g.final || g.live || (isLatest && g.begun)));
  const midRound = isLatest && stage < N && started.length > 0;
  // Only First Four games so far: that's what's under way.
  const roundNow = started.length && started.every(g => g.playIn) ? 'First Four' : L.rounds[stage];
  return {
    league: bracket.league, L, N, stage, latest, isLatest, games, teams, byId, drafters: board, champ, milestones,
    stageLabel: champ ? `Champion: ${(L.byLocation ? champ.location : champ.name) || champ.abbr}` : midRound ? `${roundNow} under way` : L.stages[stage]
  };
}

// The highest rung anyone has reached (0 first round … 4 Champion): the
// ladder only shows rungs up to it, so it grows a rung as each round is
// decided instead of opening on empty space. Byes put the field set at 1.
export function topRung(teams){
  return teams.reduce((m, t) => Math.max(m, t.rung), 0);
}

// The games still to be played between two teams on the same rung, as
// [higher seed, lower seed] pairs: the ladder sits them side by side on a
// shared backing. A game counts once both sides are known at this stage.
// Each pair also carries its game (`pair.game`), for the series line.
export function matchups(teams, games){
  const byId = Object.fromEntries(teams.map(t => [t.id, t]));
  return (games || []).filter(g => !g.final && g.top.team && g.bot.team).map(g => {
    const a = byId[g.top.team.id], b = byId[g.bot.team.id];
    if(!a || !b || a.rung !== b.rung || a.rung !== g.round - 1) return null;
    return Object.assign([a, b].sort((x, y) => (x.seed ?? 99) - (y.seed ?? 99)), { game: g });
  }).filter(Boolean);
}

// A series still being played (snapshot's `series`) in words, or null for
// a game that isn't a series: "Best of 5" before the first win, then
// "Tied 1-1" or "NYY leads 2-1".
export function seriesLine(game){
  const s = game && game.series;
  if(!s) return null;
  if(!s.top && !s.bot) return `Best of ${s.need * 2 - 1}`;
  if(s.top === s.bot) return `Tied ${s.top}\u2013${s.bot}`;
  const lead = s.top > s.bot ? game.top.team : game.bot.team;
  return `${(lead && lead.abbr) || ''} leads ${Math.max(s.top, s.bot)}\u2013${Math.min(s.top, s.bot)}`.trim();
}

// The chips on each rung, in rows: { rung: [[team, …], …] }. Within a rung
// the two sides of each game still to play sit together (matchups), games
// and lone teams in order of conference (the NCAA's region), then best seed.
// Up to six chips share a row; more wrap into as many rows as it takes, as
// even as they can be without splitting a game. With `sides` (MLB's AL and
// NL) each half of the rung is laid out on its own, three chips to a half
// row, and `fx` says where each chip sits (its half's own share).
const PER_ROW = 6;
export const ROW_H = 40;
function rungRows(teams, games, sides = null, perRow = PER_ROW){
  if(sides) return splitRows(teams, games, sides);
  const seed = t => t.seed ?? 99;
  const pairs = matchups(teams, games);
  const paired = new Set(pairs.flat().map(t => t.id));
  const byRung = {};
  pairs.forEach(p => { (byRung[p[0].rung] = byRung[p[0].rung] || []).push(p); });
  teams.filter(t => !paired.has(t.id)).forEach(t => { (byRung[t.rung] = byRung[t.rung] || []).push([t]); });
  const out = {};
  Object.entries(byRung).forEach(([k, units]) => {
    units.sort((a, b) => (a[0].conf || '').localeCompare(b[0].conf || '') || seed(a[0]) - seed(b[0]) || a[0].abbr.localeCompare(b[0].abbr));
    const total = units.reduce((n, u) => n + u.length, 0);
    const want = Math.ceil(total / perRow);
    const even = Math.ceil(total / want);
    const rows = [[]];
    units.forEach(u => {
      const row = rows[rows.length - 1];
      // Two rows split at the halfway mark (football's ladder); three or
      // more also never let a game push a row past six.
      if(row.length && ((rows.length < want && row.length >= even) || (want > 2 && row.length + u.length > perRow))) rows.push([]);
      rows[rows.length - 1].push(...u);
    });
    out[k] = rows;
  });
  return out;
}

// rungRows for a league split into halves: each half's rows (PER_ROW / 2
// to a row) side by side, row r of the rung holding row r of each half. A
// team whose side isn't known sits in the first half. A pair across the
// halves (the World Series) is a lone team in each, so it meets in the middle.
function splitRows(teams, games, sides){
  const half = t => Math.max(0, sides.indexOf(t.conf));
  const parts = sides.map((_, h) => rungRows(teams.filter(t => half(t) === h), games.filter(g => [g.top.team, g.bot.team].every(x => !x || half(x) === h)), null, Math.floor(PER_ROW / sides.length)));
  const out = {}, fx = {};
  const ks = new Set(parts.flatMap(p => Object.keys(p)));
  ks.forEach(k => {
    const n = Math.max(...parts.map(p => (p[k] || []).length));
    out[k] = Array.from({ length: n }, (_, r) => parts.flatMap(p => (p[k] || [])[r] || []));
    parts.forEach((p, h) => (p[k] || []).forEach(row => row.forEach((t, i) => {
      fx[t.id] = (h + (i + 0.5) / row.length) / sides.length;
    })));
  });
  out.fx = fx;
  return out;
}

// Each rung's height and its top (px from the ladder's top), rungs top to
// bottom from `top` (topRung) to the first round, and the ladder's
// height. A rung is `rungH` tall unless its chips need three rows or more
// (the NCAA's first rung, with every drafted team in the field on it).
// A rung above `top` waits one rungH above the ladder.
export function ladderGeometry(teams, { rungH = 84, top = 4, games = [], rungs = 5, sides = null } = {}){
  const { fx, ...rows } = rungRows(teams, games, sides);
  const heights = [], tops = [];
  for(let k = 0; k < rungs; k++){
    const n = rows[k] ? rows[k].length : 0;
    heights[k] = n > 2 ? 8 + n * ROW_H : rungH;
  }
  let y = 0;
  for(let k = rungs - 1; k >= 0; k--){
    if(k > top){ tops[k] = -rungH; continue; }
    tops[k] = y;
    y += heights[k];
  }
  return { heights, tops, height: y, rows, fx: fx || null };
}

// Where each team's chip sits on the ladder: `fx`, its center as a share of
// the chip lane's width (the rung labels sit to its right), and `y`, px from
// the ladder's top, row by row on its rung (rungRows, ladderGeometry).
// `crown` ({ x, y } px): where the champion's chip sits on the Champion
// rung (`champRung`) instead, as the logo of the crown card that rung becomes.
export function ladderLayout(teams, { rungH = 84, top = 4, games = [], crown = null, champRung = 4, sides = null } = {}){
  const geo = ladderGeometry(teams, { rungH, top, games, rungs: champRung + 1, sides });
  const pos = {};
  Object.entries(geo.rows).forEach(([k, rows]) => {
    const y0 = geo.tops[k] ?? (top - Number(k)) * rungH;
    rows.forEach((row, r) => row.forEach((t, i) => {
      pos[t.id] = crown && Number(k) === champRung
        ? { fx: 0, x: crown.x, y: y0 + crown.y }
        : { fx: geo.fx ? geo.fx[t.id] : (i + 0.5) / row.length, y: y0 + (rows.length >= 2 ? 4 + r * ROW_H : 26) };
    }));
  });
  return pos;
}
