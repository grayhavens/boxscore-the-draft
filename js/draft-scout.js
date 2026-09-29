/* ============================================================
   Scouting for the draft room's team sheet (js/draft.js): a pool team's
   previous season (record, finish, how its postseason went), its record
   so far in the season it's being drafted for, and title/conference/
   division odds.

   Which seasons: a class drafted in September of NEXT_DRAFT_YEAR scores
   NFL/CFB/EPL seasons starting that fall and NBA/NHL/CBB seasons ending
   the next spring (ESPN numbers those by the year they end), and MLB/WNBA
   the following summer. That "scoring season" is the one a record so far
   and odds are shown for; the season before it is "last season". Asked
   for by explicit year, never ESPN's "current" season, which was wrong
   for MLB and CBB when checked (2026-09-29).

   All from ESPN (js/espn.js): one standings call per league and season,
   one futures call per league, and one postseason schedule call per team
   opened. A finished season never changes, so it's kept in localStorage
   for good; a season still being played is refetched after 30 minutes.

   scoutTeam() is synchronous: it returns what's known right now and
   starts whatever is missing, calling onUpdate as each piece lands.
   ============================================================ */
import { fetchEspnSeasonStandings, fetchEspnTeamPostseason, fetchEspnFutures, fetchEspnRegularSeasonEnd } from './espn.js';
import { NEXT_DRAFT_YEAR } from './seasons/index.js';
import { teamGroup } from './draft-groups.js';

// offset: scoring season = NEXT_DRAFT_YEAR + offset (ESPN numbering).
// split: how a two-year season is labeled — 'start' if ESPN numbers it
// by the year it starts (EPL), 'end' if by the year it ends.
const LEAGUES = {
  nfl: { site: 'football/nfl', core: 'football/leagues/nfl', offset: 0, title: /super bowl/i, titleLabel: 'Win Super Bowl', titlePhrase: 'win the Super Bowl', post: 'Playoffs', none: 'Missed the playoffs' },
  cfb: { site: 'football/college-football', core: 'football/leagues/college-football', offset: 0, title: /^NCAA\(F\) - Championship$/i, titleLabel: 'Win national title', college: true, post: 'Postseason', none: 'No bowl game', titlePhrase: 'win the national title', absent: 'Not in FBS' },
  epl: { site: 'soccer/eng.1', core: 'soccer/leagues/eng.1', offset: 0, split: 'start', title: /premier league/i, titleLabel: 'Win the league', titlePhrase: 'win the league', table: true, absent: 'Not in the Premier League' },
  nba: { site: 'basketball/nba', core: 'basketball/leagues/nba', offset: 1, split: 'end', title: /^NBA - Winner$/i, titleLabel: 'Win NBA title', titlePhrase: 'win the NBA title', post: 'Playoffs', none: 'Missed the playoffs' },
  nhl: { site: 'hockey/nhl', core: 'hockey/leagues/nhl', offset: 1, split: 'end', title: /stanley cup/i, titleLabel: 'Win Stanley Cup', titlePhrase: 'win the Stanley Cup', points: true, post: 'Playoffs', none: 'Missed the playoffs' },
  mlb: { site: 'baseball/mlb', core: 'baseball/leagues/mlb', offset: 1, title: /world series/i, titleLabel: 'Win World Series', titlePhrase: 'win the World Series', post: 'Playoffs', none: 'Missed the playoffs' },
  wnba: { site: 'basketball/wnba', core: 'basketball/leagues/wnba', offset: 1, title: /^WNBA.*(winner|champion)/i, titleLabel: 'Win WNBA title', titlePhrase: 'win the WNBA title', post: 'Playoffs', none: 'Missed the playoffs' },
  mcbb: { site: 'basketball/mens-college-basketball', core: 'basketball/leagues/mens-college-basketball', offset: 1, split: 'end', title: /^NCAA\(B\) - Winner$/i, titleLabel: 'Win national title', college: true, post: 'Postseason', none: 'No postseason', titlePhrase: 'win the national title', absent: 'Not in Division I' }
};

// Futures that aren't a team winning its title, conference or division.
const NOT_TEAM_MARKET = /in-season|most|playoff|heisman|award|trophy|mvp|fcs|rookie|coach|player|yards|reach|semifinal/i;

const LIVE_TTL = 30 * 60 * 1000;
const ODDS_TTL = 6 * 60 * 60 * 1000;
const RETRY_MS = 60 * 1000;
const LS_PREFIX = 'bxScout:';

const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Pool names ESPN spells differently.
const NAME_ALIASES = { bucs: 'buccaneers', blazers: 'trailblazers' };

// ---- Cache ----

const mem = new Map(); // key -> { data, at, ttl, loading, failedAt }

function readStored(key){
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (e){ return null; }
}

function writeStored(key, entry){
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify({ data: entry.data, at: entry.at, ttl: entry.ttl })); } catch (e){ /* full or blocked: memory only */ }
}

// `ttlFor(data)` decides how long a result stays good (Infinity = forever).
function cached(key, loader, ttlFor, onUpdate){
  let entry = mem.get(key);
  if(!entry){
    const stored = readStored(key);
    entry = stored ? { data: stored.data, at: stored.at, ttl: stored.ttl ?? Infinity } : { data: undefined };
    mem.set(key, entry);
  }
  const fresh = entry.data !== undefined && (entry.ttl === Infinity || entry.ttl === null || Date.now() - entry.at < entry.ttl);
  const retryWait = entry.failedAt && Date.now() - entry.failedAt < RETRY_MS;
  if(!fresh && !entry.loading && !retryWait){
    entry.loading = true;
    loader().then(data => {
      entry.loading = false;
      if(data == null){ entry.failedAt = Date.now(); if(entry.data === undefined) entry.data = null; }
      else {
        entry.data = data; entry.at = Date.now(); entry.ttl = ttlFor(data); entry.failedAt = null;
        writeStored(key, entry);
      }
      if(onUpdate) onUpdate();
    });
  }
  return { data: entry.data, loading: entry.data === undefined };
}

const finished = endDate => !!endDate && Date.parse(endDate) < Date.now();

// ---- Loaders ----

// Only what the sheet reads, so a 365-team CBB table stays small in storage.
function trimStandings(st){
  if(!st) return null;
  return {
    year: st.year, label: st.label, endDate: st.endDate,
    rows: st.rows.map(r => ({
      id: r.id, name: r.name, displayName: r.displayName, location: r.location,
      group: r.group, parent: r.parent, overall: r.overall, note: r.note,
      winPercent: r.stats.winPercent ?? null, points: r.stats.points ?? null, rank: r.stats.rank ?? null,
      wins: r.stats.wins ?? null, losses: r.stats.losses ?? null, ties: r.stats.ties ?? null, otLosses: r.stats.otLosses ?? null,
      conf: r.display['vs. Conf.'] || null
    }))
  };
}

function standings(league, year, onUpdate){
  const cfg = LEAGUES[league];
  return cached(`st:${league}:${year}`,
    () => fetchEspnSeasonStandings(cfg.site, year).then(trimStandings),
    st => finished(st.endDate) ? Infinity : LIVE_TTL, onUpdate);
}

function futures(league, year, onUpdate){
  const cfg = LEAGUES[league];
  return cached(`fu:${league}:${year}`,
    () => fetchEspnFutures(cfg.core, year).then(list => list && list.filter(f => !NOT_TEAM_MARKET.test(f.name))),
    () => ODDS_TTL, onUpdate);
}

// Fixed once the schedule is out, so kept for good. The EPL has no
// separate regular season (its table is the whole season).
function regularSeasonEnd(league, year, onUpdate){
  const cfg = LEAGUES[league];
  if(cfg.table) return { data: null, loading: false };
  return cached(`re:${league}:${year}`, () => fetchEspnRegularSeasonEnd(cfg.core, year), () => Infinity, onUpdate);
}

function postseason(league, teamId, year, seasonDone, onUpdate){
  const cfg = LEAGUES[league];
  return cached(`po:${league}:${teamId}:${year}`,
    () => fetchEspnTeamPostseason(cfg.site, teamId, year),
    () => seasonDone ? Infinity : LIVE_TTL, onUpdate);
}

// ---- Reading the data ----

function findRow(st, team){
  if(!st) return null;
  if(team.espnTeamId){
    const byId = st.rows.find(r => r.id === String(team.espnTeamId));
    if(byId) return byId;
  }
  const key = NAME_ALIASES[norm(team.name)] || norm(team.name);
  const exact = st.rows.find(r => [r.name, r.displayName, r.location].some(n => norm(n) === key));
  if(exact) return exact;
  // EPL clubs are sometimes held by a shortened name ("Nottingham").
  return LEAGUES[team.league].table ? st.rows.find(r => norm(r.displayName).startsWith(key)) || null : null;
}

function seasonLabel(league, year){
  const split = LEAGUES[league].split;
  const yy = n => String(n % 100).padStart(2, '0');
  if(split === 'start') return `'${yy(year)}/'${yy(year + 1)}`;
  if(split === 'end') return `'${yy(year - 1)}/'${yy(year)}`;
  return `'${yy(year)}`;
}

function ordinal(n){
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function shortGroup(name){
  return String(name || '')
    .replace(/^American League /, 'AL ').replace(/^National League /, 'NL ')
    .replace(/^Eastern\b/, 'East').replace(/^Western\b/, 'West')
    .replace(/ (Division|Conference)$/, '').trim();
}

// "14-3" (NHL's "53-22-7, 113 PTS" keeps just the record). The NBA's
// division-level table has no `overall`, so it's built from wins/losses.
function recordOf(league, row){
  const overall = String(row.overall || '').split(',')[0].trim();
  if(overall) return overall;
  if(row.wins == null || row.losses == null) return '';
  if(LEAGUES[league].points) return `${row.wins}-${row.losses}-${row.otLosses || 0}`;
  return row.ties ? `${row.wins}-${row.losses}-${row.ties}` : `${row.wins}-${row.losses}`;
}

const gamesIn = record => (String(record).match(/\d+/g) || []).reduce((n, x) => n + Number(x), 0);

function finishOf(league, st, row){
  const cfg = LEAGUES[league];
  if(cfg.table) return row.rank ? { value: ordinal(row.rank), label: 'finish' } : null;
  // Independents (Notre Dame) have no conference record to show.
  if(cfg.college) return row.conf && gamesIn(row.conf) ? { value: row.conf, label: 'conf. record' } : null;
  const peers = st.rows.filter(r => r.group === row.group && r.parent === row.parent);
  const score = r => cfg.points ? (r.points || 0) * 1000 + (r.winPercent || 0) : (r.winPercent || 0);
  peers.sort((a, b) => score(b) - score(a));
  const at = peers.indexOf(row);
  return at < 0 ? null : { value: `${ordinal(at + 1)} ${shortGroup(row.group)}`, label: 'finish' };
}

// ESPN's round names, trimmed for "Lost in the ___": "ALDS - Game 4" ->
// "ALDS", "NFC Wild Card Playoffs" -> "NFC Wild Card", "NCAA Men's
// Basketball Championship - East Region - Elite 8" -> "Elite 8", "College
// Football Playoff National Championship Presented by AT&T" -> "CFP
// National Championship".
function roundName(headline){
  let parts = String(headline || '').split(' - ').map(p => p.trim())
    .filter(p => p && !/^game \d+/i.test(p) && !/region$/i.test(p));
  if(parts.length > 1 && /^ncaa .*championship$/i.test(parts[0])) parts = parts.slice(1);
  return parts.join(' ')
    .replace(/\s+presented by .*$/i, '')
    .replace(/\s+at the .*$/i, '')
    .replace(/\s+game$/i, '')
    .replace(/\s+playoffs?$/i, '')
    .replace(/^College Football Playoff\b/, 'CFP')
    .replace(/^(AL|NL)WC$/, '$1 Wild Card')
    .replace(/^Super Bowl [LXVI]+$/, 'Super Bowl')
    .trim();
}

function postseasonText(league, games, seasonOver){
  const cfg = LEAGUES[league];
  if(!games.length) return seasonOver ? cfg.none : null;
  const next = games.find(g => !g.completed);
  if(next) return `Playing in the ${roundName(next.headline)}`;
  const last = games[games.length - 1];
  return `${last.won ? 'Won' : 'Lost in'} the ${roundName(last.headline)}`;
}

// American odds -> implied chance: +270 -> 0.27, -125 -> 0.56.
function impliedChance(odds){
  const n = Number(String(odds).replace('+', ''));
  if(!n) return 0;
  return n > 0 ? 100 / (n + 100) : -n / (-n + 100);
}

function oddsFor(league, team, espnId, markets){
  const cfg = LEAGUES[league];
  const g = teamGroup(team);
  const out = [];
  const lineIn = f => f.lines.find(l => l.teamId === espnId);
  const title = markets.find(f => cfg.title.test(f.name) && lineIn(f));
  if(title){
    // Where the team sits in that market: 1 = the favorite.
    const ranked = title.lines.slice().sort((a, b) => impliedChance(b.odds) - impliedChance(a.odds));
    const rank = ranked.findIndex(l => l.teamId === espnId) + 1;
    out.push({ label: cfg.titleLabel, odds: lineIn(title).odds, rank, of: ranked.length, title: true });
  }
  const rest = markets.filter(f => f !== title && !cfg.title.test(f.name) && lineIn(f));
  const conf = rest.find(f => !/division/i.test(f.name));
  if(conf){
    const name = g && g.conf;
    out.push({ label: name ? (/^(East|West)$/.test(name) ? `Win the ${name}` : `Win ${name}`) : 'Win conference', odds: lineIn(conf).odds });
  }
  const div = rest.find(f => /division/i.test(f.name));
  if(div){
    const name = g && g.div;
    out.push({ label: name ? `Win ${name}${name.includes(' ') ? '' : ' division'}` : 'Win division', odds: lineIn(div).odds });
  }
  return out;
}

// ---- Public ----

export const hasScouting = team => !!(team && LEAGUES[team.league] && !team.custom);

// The sheet's view of one pool team. Each part is `undefined` while
// loading and `null` when ESPN has nothing for it.
// Shape: { lastLabel, nowLabel, recordLabel, last: { record, finish: { value, label },
// ongoing, post, postLabel, points, note } | { absent }, now: { record },
// odds: [{ label, odds }] }
export function scoutTeam(team, onUpdate){
  if(!hasScouting(team)) return null;
  const cfg = LEAGUES[team.league];
  const nowYear = NEXT_DRAFT_YEAR + cfg.offset;
  const lastYear = nowYear - 1;
  // EPL records are wins-draws-losses, labeled that way as on its team modal.
  const out = { lastLabel: seasonLabel(team.league, lastYear), nowLabel: seasonLabel(team.league, nowYear), recordLabel: cfg.table ? 'W-D-L' : 'record' };

  const lastSt = standings(team.league, lastYear, onUpdate);
  const nowSt = standings(team.league, nowYear, onUpdate);
  const lastRow = findRow(lastSt.data, team);
  const nowRow = findRow(nowSt.data, team);
  const espnId = team.espnTeamId ? String(team.espnTeamId) : (lastRow || nowRow || {}).id;

  if(lastSt.loading) out.last = undefined;
  else if(!lastSt.data) out.last = null;
  else if(!lastRow){
    // Wasn't in the league (a promoted EPL club, an FCS school).
    out.last = { absent: cfg.absent || 'No record' };
  } else {
    // `ongoing`: last season's regular season is still being played (a
    // draft held well before the one it's for, e.g. a spring mock). Judged
    // by the regular season's end, not the season's, which runs through
    // the playoffs: a team that missed them is done while they're played.
    const regEnd = regularSeasonEnd(team.league, lastYear, onUpdate);
    const regularOver = regEnd.data ? finished(regEnd.data) : finished(lastSt.data.endDate);
    const finish = finishOf(team.league, lastSt.data, lastRow);
    out.last = { record: recordOf(team.league, lastRow), finish, ongoing: !regularOver };
    if(cfg.table){
      out.last.points = lastRow.points;
      out.last.note = lastRow.note;
    } else if(espnId){
      const po = postseason(team.league, espnId, lastYear, finished(lastSt.data.endDate), onUpdate);
      if(po.data && po.data.length) out.last.ongoing = false;
      out.last.postLabel = cfg.post;
      out.last.post = po.loading || regEnd.loading ? undefined : (po.data ? postseasonText(team.league, po.data, regularOver) : null);
    }
  }

  // Only once games have been played: a season that hasn't started comes
  // back as an all-0-0 table.
  if(nowSt.loading) out.now = undefined;
  else {
    const record = nowRow ? recordOf(team.league, nowRow) : '';
    out.now = gamesIn(record) > 0 ? { record } : null;
  }

  const fu = futures(team.league, nowYear, onUpdate);
  if(fu.loading) out.odds = undefined;
  else out.odds = fu.data && espnId ? oddsFor(team.league, team, espnId, fu.data) : [];

  return out;
}

// The sheet's outlook when there's no written one for this draft (see
// js/draft-outlooks.js): a sentence or two built from the numbers, e.g.
// "Coming off 11-6 (1st NFC East) in '25, lost in the NFC Wild Card.
// Books have them 9th of 32 to win the Super Bowl (+1700)." Empty while
// the numbers are still loading.
export function scoutSummary(team, sc){
  if(!sc || sc.last === undefined) return '';
  const cfg = LEAGUES[team.league];
  const lc = str => str.charAt(0).toLowerCase() + str.slice(1);
  const parts = [];
  const last = sc.last;
  if(last && last.absent) parts.push(`${last.absent} in ${sc.lastLabel}.`);
  else if(last && last.record){
    const detail = [];
    if(last.finish) detail.push(last.finish.label === 'conf. record' ? `${last.finish.value} in conference` : last.finish.value);
    if(last.points != null) detail.push(`${last.points} pts`);
    const record = `${last.record}${detail.length ? ` (${detail.join(', ')})` : ''}`;
    if(last.ongoing) parts.push(`Sits at ${record} in ${sc.lastLabel} so far.`);
    else parts.push(`Coming off ${record} in ${sc.lastLabel}${last.post ? `, ${lc(last.post)}` : ''}${last.note ? `, qualifying for the ${last.note}` : ''}.`);
  }
  if(sc.now) parts.push(`${sc.now.record} so far in ${sc.nowLabel}.`);
  const title = (sc.odds || []).find(o => o.title);
  if(title && title.rank) parts.push(`Books have them ${ordinal(title.rank)} of ${title.of} to ${cfg.titlePhrase} (${title.odds}).`);
  return parts.join(' ');
}
