/* ============================================================
   PGA Tour fetches for the browser. Parsing is js/golf.js (shared with
   the worker); this only decides where each piece comes from:
   - finished events: the worker's condensed season (/golf/season/<year>,
     worker/golf.js), one small request instead of ~35 leaderboards;
   - the event being played: ESPN's leaderboard, straight from the
     browser (open CORS), since it changes by the minute;
   - a golfer's official season totals: ESPN's per-golfer record.
   Each is held in memory for its TTL, and a failed fetch returns null
   without being cached. See docs/golf-plan.md.
   ============================================================ */
import { DASHBOARD_WORKER_BASE, chatWorkerBase } from './worker-base.js';
import { fetchJSON } from './utils.js';
import {
  golfScoreboardUrl, golfLeaderboardUrl, golferRecordUrl,
  parseLeaderboard, parseGolferRecord, parseLeagueLogo, pickWeekEvent, weekEventsToCheck, parseCalendar
} from './golf.js';

const SEASON_TTL_MS = 10 * 60 * 1000;      // matches the worker's edge cache
const LEADERBOARD_TTL_MS = 60 * 1000;      // live scoring
const RECORD_TTL_MS = 30 * 60 * 1000;      // FedEx points move once an event ends

const memo = new Map(); // key -> { at, promise }

function cached(key, ttl, load){
  const hit = memo.get(key);
  if(hit && Date.now() - hit.at < ttl) return hit.promise;
  const promise = load().then(v => {
    if(v == null) memo.delete(key);
    return v;
  });
  memo.set(key, { at: Date.now(), promise });
  return promise;
}

// { season, events, complete }: see worker/golf.js.
export function fetchGolfSeason(season){
  if(!DASHBOARD_WORKER_BASE) return Promise.resolve(null);
  // chatWorkerBase: wrangler dev on localhost, so a local change to
  // worker/golf.js is what the local app reads.
  return cached(`season:${season}`, SEASON_TTL_MS, () => fetchJSON(`${chatWorkerBase()}/golf/season/${season}`));
}

// Whether each event looked at is a major, and the week's main event:
// { eventId: { major, primary } }. Fixed for an event, so kept for the
// session.
const weekFlags = {};

// The event being played now, or the next one: ESPN's scoreboard picks
// the week. A week with more than one event (an opposite-field event
// beside The Open) lists them in no useful order, so each one's
// leaderboard is read once to find the major, or the main event
// (pickWeekEvent, js/golf.js). `logo` is the PGA Tour's, per theme.
export function fetchCurrentGolfEvent(){
  return cached('current', LEADERBOARD_TTL_MS, async () => {
    const data = await fetchJSON(golfScoreboardUrl());
    const events = (data && Array.isArray(data.events) ? data.events : [])
      .map(e => ({ id: String(e.id), name: e.name, start: e.date || null, end: e.endDate || null }));
    await Promise.all(weekEventsToCheck(events, weekFlags).map(id => fetchGolfLeaderboard(id).then(b => {
      if(b) weekFlags[id] = { major: b.major, primary: b.primary };
    })));
    const event = pickWeekEvent(events, weekFlags);
    return event ? { ...event, logo: parseLeagueLogo(data) } : null;
  });
}

// A season's schedule, straight from ESPN (the major replay on Home,
// js/golf-view.js).
export function fetchGolfCalendar(season){
  return cached(`calendar:${season}`, SEASON_TTL_MS, async () => {
    const data = await fetchJSON(golfScoreboardUrl(season));
    return data ? parseCalendar(data) : null;
  });
}

export function fetchGolfLeaderboard(eventId){
  return cached(`leaderboard:${eventId}`, LEADERBOARD_TTL_MS, async () => {
    const data = await fetchJSON(golfLeaderboardUrl(eventId));
    return data ? parseLeaderboard(data) : null;
  });
}

// Official season totals; null before the golfer's first start of it.
export function fetchGolferRecord(athleteId, season){
  return cached(`record:${season}:${athleteId}`, RECORD_TTL_MS, async () => {
    const data = await fetchJSON(golferRecordUrl(athleteId, season));
    return data ? parseGolferRecord(data) : null;
  });
}

// The events on ESPN's scoreboard for one day (YYYYMMDD): whichever
// tournament(s) that week, with no results. js/golf-view.js checks the
// day against each one's dates, since a Monday still lists last week's.
export function fetchGolfEventsOn(yyyymmdd){
  return cached(`day:${yyyymmdd}`, LEADERBOARD_TTL_MS, async () => {
    const data = await fetchJSON(`${golfScoreboardUrl()}?dates=${yyyymmdd}`);
    if(!data || !Array.isArray(data.events)) return null;
    return data.events.map(e => ({
      id: String(e.id),
      name: e.name,
      start: e.date || null,
      end: e.endDate || null,
      status: e.status && e.status.type && e.status.type.name === 'STATUS_CANCELED' ? 'canceled' : (e.status && e.status.type && e.status.type.state) || 'pre'
    }));
  });
}
