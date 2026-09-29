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
  parseCalendar, fedexSeasonEvents, parseLeaderboard, parseGolferRecord
} from './golf.js';

const SEASON_TTL_MS = 10 * 60 * 1000;      // matches the worker's edge cache
const SCHEDULE_TTL_MS = 6 * 60 * 60 * 1000;
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

// The FedEx Cup season's events, from ESPN's calendar (no results).
export function fetchGolfSchedule(season){
  return cached(`schedule:${season || 'now'}`, SCHEDULE_TTL_MS, async () => {
    const data = await fetchJSON(golfScoreboardUrl(season));
    return data ? fedexSeasonEvents(parseCalendar(data)) : null;
  });
}

// The event being played now, or the next one: ESPN's scoreboard picks it.
export function fetchCurrentGolfEvent(){
  return cached('current', LEADERBOARD_TTL_MS, async () => {
    const data = await fetchJSON(golfScoreboardUrl());
    const event = data && Array.isArray(data.events) ? data.events[0] : null;
    return event ? { id: String(event.id), name: event.name, start: event.date || null, end: event.endDate || null } : null;
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
