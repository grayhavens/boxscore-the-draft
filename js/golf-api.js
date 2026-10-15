/* ============================================================
   PGA Tour fetches for the browser. Parsing is js/golf.js (shared with
   the worker); this only decides where each piece comes from:
   - finished events: condensed here once and kept on the device (the
     worker's /golf/season route can't read ESPN: it 403s Workers);
   - the event being played: ESPN's leaderboard, straight from the
     browser (open CORS), since it changes by the minute;
   - a golfer's official season totals: ESPN's per-golfer record;
   - the tour's news feed, one read shared by every golfer's page.
   Each is held in memory for its TTL, and a failed fetch returns null
   without being cached. See docs/golf-plan.md.
   ============================================================ */
import { DASHBOARD_WORKER_BASE, chatWorkerBase } from './worker-base.js';
import { fetchJSON } from './utils.js';
import {
  golfScoreboardUrl, golfCalendarUrl, golfLeaderboardUrl, golferRecordUrl, GOLF_NEWS_URL,
  parseLeaderboard, parseGolferRecord, parseLeagueLogo, pickWeekEvent, weekEventsToCheck, parseCalendar,
  fedexSeasonEvents, updateSeason, isDone, golferStories
} from './golf.js';

const SEASON_TTL_MS = 10 * 60 * 1000;      // matches the worker's edge cache
const LEADERBOARD_TTL_MS = 60 * 1000;      // live scoring
const RECORD_TTL_MS = 30 * 60 * 1000;      // FedEx points move once an event ends
const NEWS_TTL_MS = 15 * 60 * 1000;

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

// { season, events, golfers, complete }: the FedEx Cup season, built here.
// ESPN answers 403 to Cloudflare Workers (checked 2026-10-15), so the
// worker's /golf/season/<year> can't do this. The calendar is one ~12KB
// read, finished events are condensed once (updateSeason, js/golf.js) and
// kept in localStorage for good since a finished event never changes, and
// only the event in progress is read again. The first run on a device
// reads every finished leaderboard (~300KB each, six at a time).
const SEASON_STORE_KEY = year => `boxscore-golf-season-${year}`;
const SEASON_FETCH_POOL = 6;

function readStoredSeason(year){
  try { return JSON.parse(localStorage.getItem(SEASON_STORE_KEY(year))) || {}; } catch(e){ return {}; }
}
function writeStoredSeason(year, stored){
  try { localStorage.setItem(SEASON_STORE_KEY(year), JSON.stringify(stored)); } catch(e){ /* full or blocked: rebuilt next time */ }
}

async function buildGolfSeason(season){
  const calendarData = await fetchJSON(golfCalendarUrl(season));
  if(!calendarData) return null;
  const calendar = parseCalendar(calendarData);
  if(!calendar.length) return null;
  const stored = readStoredSeason(season);
  const now = Date.now();
  // Read what's missing a few at a time; updateSeason then condenses from
  // this map instead of one leaderboard after another.
  const todo = fedexSeasonEvents(calendar).filter(e => !isDone(stored[e.id]) && e.start && Date.parse(e.start) <= now);
  const boards = {};
  for(let i = 0; i < todo.length; i += SEASON_FETCH_POOL){
    await Promise.all(todo.slice(i, i + SEASON_FETCH_POOL).map(e =>
      fetchJSON(golfLeaderboardUrl(e.id)).then(d => { boards[e.id] = d; }).catch(() => {})));
  }
  const result = await updateSeason({
    calendar, stored, now,
    fetchLeaderboard: id => boards[id] ? Promise.resolve(boards[id]) : Promise.reject(new Error('missing')),
    maxFetch: todo.length
  });
  if(result.changed) writeStoredSeason(season, result.stored);
  return { season, events: result.events, golfers: result.golfers, complete: result.complete };
}

export function fetchGolfSeason(season){
  return cached(`season:${season}`, SEASON_TTL_MS, () => buildGolfSeason(season));
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
    const data = await fetchJSON(golfCalendarUrl(season));
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

// The tour's newest stories, raw: golferNews (js/golf.js) picks one
// golfer's out of them.
export function fetchGolfNews(){
  return cached('news', NEWS_TTL_MS, () => fetchJSON(GOLF_NEWS_URL));
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

// The tour-wide RSS stories the worker merges (worker/golf.js), shared by
// every golfer's page; null when it didn't load.
export function fetchGolfTourNews(){
  if(!DASHBOARD_WORKER_BASE) return Promise.resolve(null);
  return cached('tour-news', NEWS_TTL_MS, async () => {
    const data = await fetchJSON(`${chatWorkerBase()}/golf/news`);
    return data && Array.isArray(data.articles) ? data.articles : null;
  });
}

// More stories about one golfer ([{ title, url, source, at }] or null).
export function fetchGolferMoreNews(athleteId, name){
  return fetchGolfTourNews().then(stories => (stories ? golferStories(stories, name) : null));
}
