/* ============================================================
   Postseason ladder math (Standings → NFL/CFB/CBB → Postseason): pure, no
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
   ============================================================ */

const NFL = {
  key: 'nfl', fieldSize: 14,
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

export const POSTSEASON_LEAGUES = { nfl: NFL, cfb: CFB, mcbb: MCBB };

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
  return {
    id: String(event.id), date: event.date, headline: note ? note.headline : '',
    week: event.week ? num(event.week.number) : null,
    state: type.state || 'pre', detail: type.detail || type.shortDetail || '',
    sides
  };
}

// The NFL's seeds 1-7 per conference from a season's final standings
// (ESPN's site standings, `playoffSeed`): { espnId: { seed, conf, record, … } }.
export function parseNflSeeds(data){
  const seeds = {};
  ((data && data.children) || []).forEach(conf => {
    ((conf.standings && conf.standings.entries) || []).forEach(e => {
      const stat = name => (e.stats || []).find(s => s.name === name);
      const seed = num(stat('playoffSeed') && stat('playoffSeed').value);
      if(!seed || seed > 7 || !e.team) return;
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
// seeds: NFL only, { espnId: { seed, conf, record } } from the final
// regular-season standings; CFB reads its seed off ESPN's CFP rank.
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
    games.push({
      id: evt.id, date: evt.date, round, playIn, group: L.groupOf(evt), note: L.noteOf(evt, round),
      a: a.id, b: b.id, scoreA: a.score, scoreB: b.score,
      final, live: evt.state === 'in', winner,
      ot: final && /OT/.test(evt.detail || '')
    });
  });
  const firstRound = games.filter(g => g.round === 1);
  if(!firstRound.some(g => g.a && g.b)) return null;
  games.sort((x, y) => x.round - y.round || String(x.date).localeCompare(String(y.date)));
  // A bye: in the field with no first-round game. The NFL's 1 seeds are
  // known from the standings before their first game is set. (The First
  // Four are first-round games here, so the NCAA has no byes.)
  const inRound1 = new Set(firstRound.flatMap(g => [g.a, g.b]).filter(Boolean));
  if(leagueKey === 'nfl'){
    Object.entries(seeds).forEach(([id, s]) => {
      if(s.seed === 1 && !teams[id]) teams[id] = { id, abbr: s.abbr || '', location: s.location || '', name: s.name || '', displayName: s.displayName || '', logo: s.logo || null, seed: 1, conf: s.conf || '', record: s.record || null };
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
  return !!bracket && bracket.games.some(g => g.final || g.live);
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
  const mainStarted = next.some(g => !g.playIn && (g.final || g.live));
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
    return { ...g, final, live: isLatest && g.live, roundName: g.playIn ? 'First Four' : L.rounds[g.round - 1], top: side(g.a, g.scoreA), bot: side(g.b, g.scoreB) };
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
  const started = games.filter(g => g.round === stage + 1 && (g.final || g.live));
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
export function matchups(teams, games){
  const byId = Object.fromEntries(teams.map(t => [t.id, t]));
  return (games || []).filter(g => !g.final && g.top.team && g.bot.team).map(g => {
    const a = byId[g.top.team.id], b = byId[g.bot.team.id];
    if(!a || !b || a.rung !== b.rung || a.rung !== g.round - 1) return null;
    return [a, b].sort((x, y) => (x.seed ?? 99) - (y.seed ?? 99));
  }).filter(Boolean);
}

// The chips on each rung, in rows: { rung: [[team, …], …] }. Within a rung
// the two sides of each game still to play sit together (matchups), games
// and lone teams in order of conference (the NCAA's region), then best seed.
// Up to six chips share a row; more wrap into as many rows as it takes, as
// even as they can be without splitting a game.
const PER_ROW = 6;
export const ROW_H = 40;
function rungRows(teams, games){
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
    const want = Math.ceil(total / PER_ROW);
    const even = Math.ceil(total / want);
    const rows = [[]];
    units.forEach(u => {
      const row = rows[rows.length - 1];
      // Two rows split at the halfway mark (football's ladder); three or
      // more also never let a game push a row past six.
      if(row.length && ((rows.length < want && row.length >= even) || (want > 2 && row.length + u.length > PER_ROW))) rows.push([]);
      rows[rows.length - 1].push(...u);
    });
    out[k] = rows;
  });
  return out;
}

// Each rung's height and its top (px from the ladder's top), rungs top to
// bottom from `top` (topRung) to the first round, and the ladder's
// height. A rung is `rungH` tall unless its chips need three rows or more
// (the NCAA's first rung, with every drafted team in the field on it).
// A rung above `top` waits one rungH above the ladder.
export function ladderGeometry(teams, { rungH = 84, top = 4, games = [], rungs = 5 } = {}){
  const rows = rungRows(teams, games);
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
  return { heights, tops, height: y, rows };
}

// Where each team's chip sits on the ladder: `fx`, its center as a share of
// the chip lane's width (the rung labels sit to its right), and `y`, px from
// the ladder's top, row by row on its rung (rungRows, ladderGeometry).
// `crown` ({ x, y } px): where the champion's chip sits on the Champion
// rung (`champRung`) instead, as the logo of the crown card that rung becomes.
export function ladderLayout(teams, { rungH = 84, top = 4, games = [], crown = null, champRung = 4 } = {}){
  const geo = ladderGeometry(teams, { rungH, top, games, rungs: champRung + 1 });
  const pos = {};
  Object.entries(geo.rows).forEach(([k, rows]) => {
    const y0 = geo.tops[k] ?? (top - Number(k)) * rungH;
    rows.forEach((row, r) => row.forEach((t, i) => {
      pos[t.id] = crown && Number(k) === champRung
        ? { fx: 0, x: crown.x, y: y0 + crown.y }
        : { fx: (i + 0.5) / row.length, y: y0 + (rows.length >= 2 ? 4 + r * ROW_H : 26) };
    }));
  });
  return pos;
}
