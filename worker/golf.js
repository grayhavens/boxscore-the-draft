/* ============================================================
   PGA TOUR SEASON RESULTS: one compact record of every finished FedEx
   Cup event, so a golfer's recent finishes, wins and FedEx points never
   need the browser to pull ~35 leaderboards of ~300KB each. The event
   being played is still read live from ESPN in the browser
   (js/golf-api.js). Parsing lives in js/golf.js, shared with the app.

   KV: golf:<season> -> { <eventId>: condensed event } (condenseLeaderboard
   in js/golf.js), holding only finished and cancelled events, which
   never change once done.

   Route:
     GET /golf/season/<year>  public: { season, events, golfers, complete }
       events: the FedEx Cup season in calendar order. Finished ones
       carry `results`; the one in progress carries its results so far;
       the rest are { id, name, start, end, status: 'pre' }.
       golfers: { athleteId: [name, flag code] } for everyone in them.
       complete: false while finished events are still being filled in.
       Each request condenses at most MAX_FETCH_PER_REQUEST of them (a
       leaderboard is ~300KB to parse), so building a season from
       scratch mid-season takes a few requests; from January it's one
       event a week.

   Response edge-cached SEASON_TTL_SECONDS (a short time while
   incomplete, so the next request carries on filling).
   ============================================================ */
import { golfScoreboardUrl, golfLeaderboardUrl, parseCalendar, fedexSeasonEvents, condenseLeaderboard } from '../js/golf.js';

export const MAX_FETCH_PER_REQUEST = 4;
const SEASON_TTL_SECONDS = 10 * 60;
const INCOMPLETE_TTL_SECONDS = 15;
const CALENDAR_TTL_SECONDS = 6 * 60 * 60;   // the schedule changes a few times a year
const LEADERBOARD_TTL_SECONDS = 2 * 60;     // only read for events due or in progress

export function golfSeasonKey(season){
  return `golf:${season}`;
}

const isDone = e => e && (e.status === 'post' || e.status === 'canceled');

// One pass over the season: condense whichever events have reached
// their end date but aren't stored yet (oldest first, at most maxFetch),
// keeping those now final. Pure apart from fetchLeaderboard, so tests
// drive it with fixtures.
export async function updateSeason({ calendar, stored, now, fetchLeaderboard, maxFetch = MAX_FETCH_PER_REQUEST }){
  const events = fedexSeasonEvents(calendar);
  const next = { ...stored };
  const live = {};
  const due = events.filter(e => !isDone(next[e.id]) && e.start && Date.parse(e.start) <= now);
  let changed = false;
  for(const e of due.slice(0, maxFetch)){
    const condensed = await fetchLeaderboard(e.id).then(condenseLeaderboard).catch(() => null);
    if(!condensed) continue;
    if(isDone(condensed)){
      next[e.id] = condensed;
      changed = true;
    } else {
      live[e.id] = condensed;
    }
  }
  // Still to fill: a past event (its calendar end has gone by) that
  // isn't stored. An event in progress doesn't count.
  const complete = !events.some(e => !isDone(next[e.id]) && e.end && Date.parse(e.end) < now && !live[e.id]);
  // Names go out once for the season rather than with every event.
  const golfers = {};
  const out = events.map(e => {
    const c = next[e.id] || live[e.id];
    if(!c) return { id: e.id, name: e.name, start: e.start, end: e.end, status: 'pre' };
    const { golfers: names, ...rest } = c;
    Object.assign(golfers, names);
    return rest;
  });
  return { stored: next, changed, complete, events: out, golfers };
}

export async function handleGolfSeason(request, url, env, headers, ctx, { cachedUpstreamFetch, json }){
  if(request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
  const match = url.pathname.match(/^\/golf\/season\/(20\d\d)$/);
  if(!match) return new Response('Not found', { status: 404, headers });
  const season = Number(match[1]);

  const cache = caches.default;
  const cacheKey = new Request(`${url.origin}/golf/season/${season}`, { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if(cached) return new Response(await cached.text(), { headers: { ...headers, 'Content-Type': 'application/json' } });

  const fetchJson = async (u, ttl) => {
    const res = await cachedUpstreamFetch(u, ttl, {}, ctx);
    if(!res.ok) throw new Error(`upstream ${res.status}`);
    return res.json();
  };
  let calendar;
  try {
    calendar = parseCalendar(await fetchJson(golfScoreboardUrl(season), CALENDAR_TTL_SECONDS));
  } catch (e){
    return json({ error: 'upstream' }, 502, headers);
  }
  const stored = (await env.LEAGUE_FACTS.get(golfSeasonKey(season), 'json')) || {};
  const result = await updateSeason({
    calendar,
    stored,
    now: Date.now(),
    fetchLeaderboard: id => fetchJson(golfLeaderboardUrl(id), LEADERBOARD_TTL_SECONDS)
  });
  if(result.changed) await env.LEAGUE_FACTS.put(golfSeasonKey(season), JSON.stringify(result.stored));

  const body = JSON.stringify({ season, events: result.events, golfers: result.golfers, complete: result.complete });
  const ttl = result.complete ? SEASON_TTL_SECONDS : INCOMPLETE_TTL_SECONDS;
  ctx.waitUntil(cache.put(cacheKey, new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` }
  })));
  return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json' } });
}
