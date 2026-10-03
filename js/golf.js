/* ============================================================
   PGA Tour data: pure parsers for ESPN's golf endpoints, shared by the
   browser (js/golf-api.js) and the worker (worker/golf.js), so no DOM,
   no fetch, no imports. See docs/golf-plan.md.

   Endpoints (all open CORS, no key; shapes confirmed 2026-09-29):
   - Scoreboard  site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard[?dates=<year>]
                 leagues[0].calendar is the whole season: { id, label, startDate, endDate }.
   - Leaderboard site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga&event=<id>
                 ~300KB for a full field, so the browser only pulls the event
                 being played; finished events come condensed from the worker.
   - Record      sports.core.api.espn.com/v2/sports/golf/leagues/pga/seasons/<yr>/types/2/athletes/<id>/records/0
                 one golfer's official season totals (FedEx points, wins, …),
                 ~10KB. 404 until the golfer has played that season. The
                 league-wide standings are 5.7MB, so they're never fetched.

   Quirks worth knowing:
   - Use the site.web.api host: site.api.espn.com answers 403 to a
     request with no browser User-Agent, which is what the worker sends.
   - competitors aren't in leaderboard order; sortOrder is.
   - A missed cut, a withdrawal and a DQ are all STATUS_CUT; displayValue
     ("CUT" / "WD" / "DQ") tells them apart.
   - Team events (Zurich Classic) have competitors with team + roster
     instead of athlete; each roster player gets the team's finish.
   - A cancelled event (The Sentry, 2026) has no competitors at all.
   - The FedEx Cup season ends with the TOUR Championship; everything
     after it on the calendar (fall events, Presidents/Ryder Cup) doesn't
     count here.
   ============================================================ */

export const GOLF_SCOREBOARD_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard';
export const GOLF_LEADERBOARD_URL = 'https://site.web.api.espn.com/apis/site/v2/sports/golf/leaderboard?league=pga';
const GOLF_CORE_BASE = 'https://sports.core.api.espn.com/v2/sports/golf/leagues/pga';

export function golfScoreboardUrl(season){
  return season ? `${GOLF_SCOREBOARD_URL}?dates=${season}` : GOLF_SCOREBOARD_URL;
}

export function golfLeaderboardUrl(eventId){
  return `${GOLF_LEADERBOARD_URL}&event=${encodeURIComponent(eventId)}`;
}

export function golferRecordUrl(athleteId, season){
  return `${GOLF_CORE_BASE}/seasons/${season}/types/2/athletes/${encodeURIComponent(athleteId)}/records/0`;
}

export function golferHeadshotUrl(athleteId){
  return `https://a.espncdn.com/i/headshots/golf/players/full/${athleteId}.png`;
}

const TOUR_CHAMPIONSHIP = /^tour championship$/i;

// The season's events, in date order.
export function parseCalendar(scoreboard){
  const league = scoreboard && Array.isArray(scoreboard.leagues) && scoreboard.leagues[0];
  const cal = (league && Array.isArray(league.calendar)) ? league.calendar : [];
  return cal
    .filter(c => c && c.id && c.label)
    .map(c => ({ id: String(c.id), name: c.label, start: c.startDate || null, end: c.endDate || null }))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

// The events that count: the FedEx Cup season, through the TOUR
// Championship. Without one on the calendar (not announced yet) that's
// every event.
export function fedexSeasonEvents(calendar){
  const final = calendar.find(e => TOUR_CHAMPIONSHIP.test(e.name));
  if(!final || !final.end) return calendar.slice();
  return calendar.filter(e => e.end && e.end <= final.end);
}

export function isTourChampionship(name){
  return TOUR_CHAMPIONSHIP.test(String(name || '').trim());
}

// "T14" -> 14, "1" -> 1, "CUT"/"WD"/"-" -> null.
export function finishPosition(label){
  const m = /^T?(\d+)$/.exec(String(label || ''));
  return m ? Number(m[1]) : null;
}

// Only a real missed cut; a withdrawal or DQ isn't one.
export function isMissedCut(label){
  return label === 'CUT';
}

function statValue(competitor, name){
  const s = (competitor.statistics || []).find(x => x && x.name === name);
  return s && typeof s.value === 'number' ? s.value : null;
}

function statusOf(event){
  const t = event && event.status && event.status.type;
  if(!t) return 'pre';
  if(t.name === 'STATUS_CANCELED' || t.name === 'STATUS_POSTPONED') return 'canceled';
  return t.state === 'post' || t.completed ? 'post' : t.state === 'in' ? 'in' : 'pre';
}

// The finish shown for a competitor: "1", "T14", or CUT / WD / DQ.
function finishLabel(c){
  const st = c.status || {};
  const type = st.type || {};
  if(type.name === 'STATUS_CUT') return st.displayValue || 'CUT';
  const pos = st.position && st.position.displayName;
  if(pos && pos !== '-') return pos;
  return st.displayValue || null;
}

// Who a competitor row is: one golfer, or both players of a team.
function athletesOf(c){
  if(c.athlete && c.athlete.id) return [c.athlete];
  if(Array.isArray(c.roster)){
    return c.roster
      .map(r => r.athlete ? { ...r.athlete, id: String(r.athlete.id || r.playerId) } : (r.playerId ? { id: String(r.playerId) } : null))
      .filter(Boolean);
  }
  return [];
}

function eventOf(leaderboard){
  return leaderboard && Array.isArray(leaderboard.events) ? leaderboard.events[0] : null;
}

function competitorsOf(event){
  const comp = event && Array.isArray(event.competitions) ? event.competitions[0] : null;
  const list = comp && Array.isArray(comp.competitors) ? comp.competitors : [];
  return list.slice().sort((a, b) => (a.sortOrder ?? 1e9) - (b.sortOrder ?? 1e9));
}

function flagCode(athlete){
  const m = /countries\/500\/([a-z]+)\.png/.exec((athlete.flag && athlete.flag.href) || '');
  return m ? m[1] : '';
}

// One event reduced to what the season needs: every golfer's finish and
// FedEx points. `results` is { athleteId: [finish, cupPoints] }, compact
// because the worker keeps a whole season of these in one KV record;
// `golfers` is { athleteId: [name, flag code] }, which the worker folds
// into one list for the whole season (worker/golf.js).
export function condenseLeaderboard(leaderboard){
  const event = eventOf(leaderboard);
  if(!event) return null;
  const results = {};
  const golfers = {};
  competitorsOf(event).forEach(c => {
    const label = finishLabel(c);
    let pts = statValue(c, 'cupPoints') || 0;
    // A team event's winners each get the full winner's points (400 at
    // the Zurich Classic), but ESPN's team row carries half. Every other
    // team finish matches the official totals as it is (checked 2026).
    if(!c.athlete && label === '1') pts *= 2;
    athletesOf(c).forEach(a => {
      results[String(a.id)] = [label, pts];
      if(a.displayName) golfers[String(a.id)] = [a.displayName, flagCode(a)];
    });
  });
  return {
    id: String(event.id),
    name: event.name || '',
    start: event.date || null,
    end: event.endDate || null,
    major: !!(event.tournament && event.tournament.major),
    tourChampionship: isTourChampionship(event.name),
    team: competitorsOf(event).some(c => !c.athlete && Array.isArray(c.roster)),
    status: statusOf(event),
    results,
    golfers
  };
}

// The event being played (or about to be), for the live view: every
// golfer's place, score to par, today's round and holes played.
export function parseLeaderboard(leaderboard){
  const event = eventOf(leaderboard);
  if(!event) return null;
  const comp = event.competitions && event.competitions[0];
  const period = comp && comp.status && comp.status.period;
  const players = [];
  competitorsOf(event).forEach(c => {
    const st = c.status || {};
    const rounds = (c.linescores || []).filter(l => l && typeof l.period === 'number');
    const today = rounds.find(l => l.period === st.period) || null;
    athletesOf(c).forEach(a => players.push({
      id: String(a.id),
      name: a.displayName || '',
      shortName: a.shortName || a.displayName || '',
      headshot: (a.headshot && a.headshot.href) || golferHeadshotUrl(a.id),
      flag: (a.flag && a.flag.href) || null,
      country: (a.flag && a.flag.alt) || null,
      team: c.team ? c.team.displayName : null,
      finish: finishLabel(c),
      position: finishPosition(finishLabel(c)),
      toPar: (c.score && c.score.displayValue) || null,
      today: today ? today.displayValue || null : null,
      thru: st.displayThru || (st.thru != null ? String(st.thru) : null),
      teeTime: st.teeTime || null,
      state: (st.type && st.type.state) || null,
      rounds: rounds.map(l => (typeof l.value === 'number' ? l.value : null)),
      cupPoints: statValue(c, 'cupPoints'),
      earnings: typeof c.earnings === 'number' ? c.earnings : null
    }));
  });
  const t = event.tournament || {};
  return {
    id: String(event.id),
    name: event.name || '',
    start: event.date || null,
    end: event.endDate || null,
    status: statusOf(event),
    detail: (event.status && event.status.type && (event.status.type.shortDetail || event.status.type.detail)) || null,
    round: typeof period === 'number' ? period : null,
    rounds: t.numberOfRounds || 4,
    major: !!t.major,
    cutRound: t.cutRound || 0,
    purse: event.displayPurse || null,
    players
  };
}

// A golfer's official season totals (the Record endpoint above).
export function parseGolferRecord(record){
  const stats = {};
  (record && Array.isArray(record.stats) ? record.stats : []).forEach(s => {
    if(s && typeof s.value === 'number') stats[s.name] = s.value;
  });
  return {
    cupPoints: stats.cupPoints || 0,
    events: stats.tournamentsPlayed || 0,
    wins: stats.wins || 0,
    topTens: stats.topTenFinishes || 0,
    cutsMade: stats.cutsMade || 0,
    scoringAverage: stats.scoringAverage || null
  };
}

// One golfer's season from the condensed events, oldest first: where
// they finished in each event they played.
export function golferResults(events, athleteId){
  const id = String(athleteId);
  return events
    .filter(e => e.results && e.results[id])
    .map(e => ({ id: e.id, name: e.name, end: e.end, major: e.major, tourChampionship: e.tourChampionship, finish: e.results[id][0], cupPoints: e.results[id][1] }));
}

// FedEx points summed from the condensed events, highest first, as
// [{ id, points, rank }]. Within a point or two of the official
// standings (ESPN rounds split points per event). Official totals come
// from parseGolferRecord; this ranks the field.
export function fedexTable(events){
  const pts = {};
  events.forEach(e => Object.entries(e.results || {}).forEach(([id, r]) => { pts[id] = (pts[id] || 0) + (r[1] || 0); }));
  const rows = Object.entries(pts).map(([id, points]) => ({ id, points })).sort((a, b) => b.points - a.points);
  rows.forEach((r, i) => { r.rank = i > 0 && r.points === rows[i - 1].points ? rows[i - 1].rank : i + 1; });
  return rows;
}

// How many times a golfer hit each `golfAuto` rule (js/seasons/pga.js)
// over the finished events. Finish tiers don't stack except as the plan
// says (docs/golf-plan.md): a major win is also a tournament win and a
// top 10; a top 10 is not also a top 20. A withdrawal or DQ isn't a
// missed cut, and an event the golfer didn't start counts for nothing.
export function golferAwardCounts(events, athleteId){
  const n = { win: 0, majorWin: 0, majorTop10: 0, majorTop20: 0, majorMissedCut: 0, missedCut: 0, tourChampionship: 0, fedexCup: 0 };
  golferResults(events.filter(e => e.status !== 'canceled' && e.status !== 'pre' && e.status !== 'in'), athleteId).forEach(r => {
    const pos = finishPosition(r.finish);
    if(isMissedCut(r.finish)){ n[r.major ? 'majorMissedCut' : 'missedCut']++; return; }
    if(pos === null) return;
    if(r.tourChampionship){ n.tourChampionship++; if(pos === 1) n.fedexCup++; }
    if(pos === 1) n.win++;
    if(r.major){
      if(pos === 1) n.majorWin++;
      if(pos <= 10) n.majorTop10++;
      else if(pos <= 20) n.majorTop20++;
    }
  });
  return n;
}

// Whether the TOUR Championship has been played: the season is over.
export function fedexSeasonDone(events){
  return events.some(e => e.tourChampionship && e.status === 'post');
}
