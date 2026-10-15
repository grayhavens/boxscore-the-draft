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

   NOTE 2026-10-15: ESPN answers 403 to Workers (every URL, any User-Agent),
   so this route 502s and the browser builds the season instead
   (js/golf-api.js buildGolfSeason). updateSeason lives in js/golf.js.

   The calendar comes from ?dates=<year>0101 (golfCalendarUrl): the
   plain ?dates=<year> scoreboard is 27-34MB and made this route 502.

     GET /golf/news  public: { articles: [{ title, url, source, at, text }] }
       The tour-wide RSS feeds in GOLF_NEWS_FEEDS (js/golf.js), merged,
       newest first, cached NEWS_TTL_SECONDS. The page picks a golfer's
       stories out of it (golferStories). ESPN's golf news ignores
       per-golfer filters and Google News 503s Workers (2026-10-15).
       One feed failing just leaves its stories out.

   Response edge-cached SEASON_TTL_SECONDS (a short time while
   incomplete, so the next request carries on filling).
   ============================================================ */
import { golfCalendarUrl, golfLeaderboardUrl, parseCalendar, GOLF_NEWS_FEEDS, parseRssFeed, mergeNewsFeeds, MAX_FETCH_PER_REQUEST, updateSeason } from '../js/golf.js';

export { MAX_FETCH_PER_REQUEST, updateSeason };
const SEASON_TTL_SECONDS = 10 * 60;
const INCOMPLETE_TTL_SECONDS = 15;
const CALENDAR_TTL_SECONDS = 6 * 60 * 60;   // the schedule changes a few times a year
const NEWS_TTL_SECONDS = 30 * 60;
const LEADERBOARD_TTL_SECONDS = 2 * 60;     // only read for events due or in progress

export function golfSeasonKey(season){
  return `golf:${season}`;
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
    const res = await cachedUpstreamFetch(u, ttl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, ctx);
    if(!res.ok) throw new Error(`upstream ${res.status}`);
    return res.json();
  };
  let calendar;
  try {
    calendar = parseCalendar(await fetchJson(golfCalendarUrl(season), CALENDAR_TTL_SECONDS));
  } catch (e){
    console.error('[golf] calendar failed', season, e && e.message);
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

export async function handleGolfNews(request, url, headers, ctx, { cachedUpstreamFetch, json }){
  if(request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
  if(url.pathname !== '/golf/news') return new Response('Not found', { status: 404, headers });
  const lists = await Promise.all(GOLF_NEWS_FEEDS.map(async feed => {
    try {
      const res = await cachedUpstreamFetch(feed.url, NEWS_TTL_SECONDS, { headers: { 'User-Agent': 'Mozilla/5.0' } }, ctx);
      if(!res.ok) throw new Error(`${res.status}`);
      return parseRssFeed(await res.text(), feed.source);
    } catch (e){
      console.error('[golf] news feed failed', feed.source, e && e.message);
      return [];
    }
  }));
  const articles = mergeNewsFeeds(lists);
  if(!articles.length) return json({ error: 'upstream' }, 502, headers);
  return json({ articles }, 200, headers);
}
