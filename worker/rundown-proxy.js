/* ============================================================
   DASHBOARD WORKER (Cloudflare Worker)

   Three unrelated jobs live here, all because they need something
   server-side that GitHub Pages (pure static hosting) can't do:

   1. THERUNDOWN PROXY — TheRundown's API key is personal to your
      account and must never ship in client-side JS (unlike
      TheSportsDB's old public "123" test key) — see
      https://docs.therundown.io/authentication. This holds that key
      server-side as a secret and forwards a small allowlist of
      read-only requests to TheRundown on the dashboard's behalf.

   2. LEAGUE FACTS STORE — the "who won the FA Cup" style facts, manual
      point adjustments, and regular-season locks (js/season-lock.js)
      marked/computed from the dashboard need to be visible to everyone
      looking at the dashboard, not just saved in one person's browser
      (localStorage can't do that). This stores one JSON blob per
      league (three flavors: facts, adjustments, and lock) in Workers
      KV and hands it back to whoever asks. Reads (GET) stay open to
      anyone — every drafter needs to see current facts/adjustments/
      lock state. Writes (PUT) require the X-Admin-Password header to
      match the ADMIN_PASSWORD secret — basic, shared-secret protection
      appropriate for a friend-group
      app, not real per-user auth.

   3. FAVORITES STORE — a lightweight sibling to League Facts above:
      one JSON array of team keys per drafter (js/favorites.js), so a
      favorited team follows that drafter across devices instead of
      living in one browser's localStorage. Unlike League Facts/
      Adjustments, writes are deliberately left open, no
      X-Admin-Password — a drafter's own favorites list isn't shared
      scoring data, so it doesn't need the same protection, and
      requiring the admin password just to star a team would be the
      wrong trust tier for it.

   4. THESPORTSDB PROXY — once on the premium tier, the API key is a
      real paid credential (unlike the free "123" key, which is
      public and meant to be embedded client-side) and must never
      ship in client-side JS either. Forwards a small allowlist of
      team/schedule requests to TheSportsDB's V2 API (header auth,
      https://www.thesportsdb.com/api/v2/json) on the dashboard's
      behalf, plus one V1 (key embedded in the URL path, like the old
      free key) admin route for one-off league lookups. The league
      TABLE route that used to live here (V1's lookuptable.php, for
      EPL standings) is retired — EPL standings moved to ESPN's hidden
      API (js/espn.js), which is CORS-open and needs no proxy at all.
      See docs/espn-migration-plan.md.

   5. NFLVERSE PROXY — nflverse-data (github.com/nflverse/nflverse-data,
      a public GitHub release, no key at all) is the source for NFL
      injuries and real depth-chart data (js/nflverse.js), filling a
      gap ESPN's hidden API doesn't cover (its /teams/{id}/depthchart
      endpoint returns empty for every team — see the comment that used
      to sit next to NFL_POSITION_ORDER in js/team-page.js). This isn't
      here for a private key — GitHub's release assets have no CORS
      headers at all, so a browser fetch fails outright regardless of
      key. Two routes, two different shapes of problem:
        - /nflverse/injuries: the season's injuries CSV is small
          (well under 1MB even late in a season), so this is a normal
          cachedUpstreamFetch pass-through, just parsed to JSON and
          filtered to the latest week server-side.
        - /nflverse/depth-chart: the season's depth-chart CSV is NOT
          small — it's every daily snapshot since the previous
          offseason appended together (500k+ rows, ~50MB, confirmed
          2026-09-17), because nflverse's own pipeline never rewrites
          the file, only appends to it. Downloading/parsing that whole
          thing per request isn't viable. But the file is sorted with
          the newest snapshot FIRST (confirmed live) and one snapshot
          is ~2,200 rows (~300KB) — so this reads the response as a
          stream and stops (cancels the reader) the moment a row's `dt`
          differs from the first row's `dt`, giving the full current
          snapshot for every team without ever downloading the other
          49+MB. See fetchLatestDepthChartSnapshot below — re-verify
          the "newest first" ordering assumption if nflverse ever
          changes their pipeline (that assumption is what makes this
          safe; if it silently flipped, this would instead return the
          OLDEST snapshot, not error out, so it's worth a periodic
          spot-check against a fresh curl of the file's first few rows).

   6. CHAT ROOM — real-time text chat for the whole group (js/chat.js).
      Lives in a Durable Object (worker/chat-room.js, re-exported below
      so wrangler can bind it), not KV: chat needs instant fan-out to
      every open connection, which KV's eventual consistency can't do.
      This file only routes /chat/ws to that one shared room. Same
      no-auth trust tier as favorites, but the WebSocket upgrade does
      check the Origin header so only the dashboard's own pages connect.

   EDGE CACHING — every proxied GET is cached in Workers' shared edge
   cache (caches.default), keyed on the upstream URL alone, with a TTL
   matched to how fast that data actually changes (see CACHE_TTL_SECONDS
   below). This exists because the client-side TTLs in js/api.js and js/standings-epl.js only
   protect a single browser: with several drafters loading the dashboard
   at once (e.g. everyone checking scores during a Saturday college
   football slate), each browser was independently re-hitting TheRundown
   on its own schedule, multiplying real upstream calls by however many
   tabs were open. That's how 36 "requests" blew a 20,000/day data-point
   budget in one sitting — this collapses concurrent/near-concurrent
   requests for the same data into one upstream fetch, shared by everyone.

   Deploy (from this worker/ directory):
     npx wrangler login
     npx wrangler secret put THERUNDOWN_API_KEY
     npx wrangler secret put SPORTSDB_API_KEY
     npx wrangler secret put ADMIN_PASSWORD
     npx wrangler kv namespace create LEAGUE_FACTS
     (paste the printed id into wrangler.toml's kv_namespaces block)
     npx wrangler deploy
   Then set DASHBOARD_WORKER_BASE in js/api.js to the deployed
   *.workers.dev URL wrangler prints out.
   ============================================================ */

// Wrangler needs the Durable Object class exported from the entry module.
export { ChatRoom } from './chat-room.js';

const RUNDOWN_BASE = 'https://api.therundown.io/api/v2';
const SPORTSDB_V2_BASE = 'https://www.thesportsdb.com/api/v2/json';
const SPORTSDB_V1_BASE = 'https://www.thesportsdb.com/api/v1/json';
const NFLVERSE_RELEASES_BASE = 'https://github.com/nflverse/nflverse-data/releases/download';

// nflverse names its injuries/depth_charts release assets by the season
// they cover (e.g. depth_charts_2026.csv), and that file appears (and
// starts filling with real data) as soon as the new league year opens
// in March — confirmed live: depth_charts_2026.csv's earliest rows are
// dated 2026-03-22. So the cutover to the new season's filename tracks
// March, not September (when games actually start), avoiding a manual
// yearly bump.
function currentNflverseSeason(){
  const now = new Date();
  return now.getUTCMonth() >= 2 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

// Update this list if the dashboard's deployed origin changes (e.g. a
// custom domain). The localhost entry is only here for local dev preview
// and is harmless in production — it just lets a local `python -m
// http.server` load this worker too.
const ALLOWED_ORIGINS = [
  'https://boxscorethedraft.pages.dev',
  'http://localhost:8934'
];

// Cloudflare Pages also serves every branch/preview deploy from its own
// throwaway subdomain (e.g. https://<hash>.boxscorethedraft.pages.dev) —
// match those too so preview deployments aren't broken by CORS.
const ALLOWED_ORIGIN_SUFFIX = '.boxscorethedraft.pages.dev';

// League keys that are allowed to have a facts blob — mirrors the
// leagueKey values in js/data.js. Keeping an allowlist here (rather
// than accepting any string) keeps the KV keyspace bounded.
const KNOWN_LEAGUES = ['epl', 'nfl', 'nba', 'nhl', 'mlb', 'wnba', 'cfb', 'mcbb'];

// Drafter ids allowed to have a favorites blob — mirrors DRAFT_TEAMS in
// js/data.js. Same purpose as KNOWN_LEAGUES above: bounds the KV
// keyspace to real values instead of accepting any string.
const KNOWN_DRAFT_TEAM_IDS = ['josh', 'isaac', 'drew', 'douglas', 'collin', 'erichylok', 'patrick', 'peter', 'ericprister', 'donny'];

function isAllowedOrigin(origin){
  return ALLOWED_ORIGINS.includes(origin) ||
    (origin.startsWith('https://') && origin.endsWith(ALLOWED_ORIGIN_SUFFIX));
}

function corsHeaders(origin){
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
    'Vary': 'Origin'
  };
}

function json(data, status, headers){
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

// Basic shared-secret check for every write (PUT) to the League Facts
// store, and for /admin/verify — see the header comment's LEAGUE FACTS
// STORE section for why this is deliberately simple rather than real
// per-user auth. env.ADMIN_PASSWORD is unset in any environment that
// hasn't run `wrangler secret put ADMIN_PASSWORD` yet; treat that as
// "nothing can authorize" rather than silently allowing every write.
function isAuthorized(request, env){
  const supplied = request.headers.get('X-Admin-Password');
  return !!env.ADMIN_PASSWORD && supplied === env.ADMIN_PASSWORD;
}

/* ---- Adding a new league or upstream endpoint: keep this scalable ----
   1. If the credential behind it is private/paid (not a public test
      key like TheSportsDB's old "123"), it MUST be proxied through
      this Worker, never shipped in client JS — add a new proxyTo/
      handle function pair mirroring the ones below.
   2. Every new upstream fetch MUST go through cachedUpstreamFetch, not
      a bare fetch() — add its TTL to CACHE_TTL_SECONDS below rather
      than hardcoding a number inline. Pick that TTL to match whatever
      TTL you're also about to use client-side (see the matching
      checklist next to RUNDOWN_CACHE_TTL_MS in js/api.js) — one
      freshness decision, not two that can quietly drift apart.
   3. Add the new league's key to KNOWN_LEAGUES only if it needs the
      League Facts feature (shared cross-viewer marks) — most new
      leagues won't need this on day one.
   4. If an endpoint's real response shape is unverified (no confirmed
      docs, or docs that don't match reality — see the V1/V2 standings
      note above), curl it directly with a real key and confirm the
      shape before any client code gets built against it. */

// How long each upstream shape is trusted in the edge cache before a
// fresh fetch is made — matched to the client-side TTLs (RUNDOWN_CACHE_TTL_MS
// in js/api.js, TEAM_INFO_TTL_MS in js/live-data.js, EPL_STANDINGS_TTL_MS in
// js/standings-epl.js) so this layer never serves staler data than a single
// browser would already tolerate; it only stops N browsers from each
// re-fetching the same
// thing independently.
const CACHE_TTL_SECONDS = {
  rundownEvents: 60,           // a day's slate barely changes minute to minute
  rundownTeams: 60 * 60,       // one-off/occasional lookups, not polled on a schedule
  sportsdbTeam: 24 * 60 * 60,  // sport/founded/stadium/colors — effectively static
  sportsdbSchedule: 60,        // last-result / next-fixture, refreshed on the same cadence as rundownEvents
  nflverseInjuries: 2 * 60 * 60,   // practice reports land a few times during a game week (Wed-Fri), not continuously
  nflverseDepthChart: 3 * 60 * 60  // teams post depth-chart moves less often than injury reports
};

// Shared building block for every proxy below: check the edge cache
// first (keyed on the upstream URL only — never the incoming request,
// whose Origin header varies per caller and would otherwise fragment
// the cache key for no reason), and on a miss fetch + cache the result
// for ttlSeconds before returning it. ctx.waitUntil lets the cache
// write finish after the response has already gone back to the client.
async function cachedUpstreamFetch(upstreamUrl, ttlSeconds, fetchOptions, ctx){
  const cache = caches.default;
  const cacheKey = new Request(upstreamUrl, { method: 'GET' });

  const cached = await cache.match(cacheKey);
  if(cached) return cached;

  const upstream = await fetch(upstreamUrl, fetchOptions);
  if(upstream.ok){
    const toReturn = new Response(upstream.body, upstream);
    const toCache = toReturn.clone();
    toCache.headers.set('Cache-Control', `public, max-age=${ttlSeconds}`);
    ctx.waitUntil(cache.put(cacheKey, toCache));
    return toReturn;
  }
  // Never cache an error response — a transient upstream failure
  // shouldn't get pinned in the shared cache for everyone.
  return upstream;
}

async function proxyToRundown(rundownPath, env, headers, ttlSeconds, ctx){
  const upstream = await cachedUpstreamFetch(`${RUNDOWN_BASE}${rundownPath}`, ttlSeconds, {
    headers: { 'X-TheRundown-Key': env.THERUNDOWN_API_KEY }
  }, ctx);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

async function handleRundownEvents(request, url, env, headers, ctx){
  if(request.method !== 'GET'){
    return new Response('Method not allowed', { status: 405, headers });
  }

  // Only forward the shapes we need right now:
  //   /events/{sportId}/{yyyy-mm-dd}  ->  TheRundown's
  //   /sports/{sportId}/events/{yyyy-mm-dd}
  // Extend this allowlist deliberately rather than proxying
  // arbitrary paths — the key behind it is a paid resource.
  const match = url.pathname.match(/^\/events\/(\d+)\/(\d{4}-\d{2}-\d{2})$/);
  if(!match) return new Response('Not found', { status: 404, headers });
  const [, sportId, date] = match;
  // market_ids=1 (moneyline only) — we only ever read team/score/status
  // off this response, never odds, so this trims the market/price rows
  // TheRundown would otherwise bundle in by default. TheRundown's free
  // tier meters by "data points" (not request count) and a full
  // multi-sportsbook markets payload burns through that budget fast —
  // confirmed 2026-09-10 when 36 unfiltered requests exhausted the
  // 20,000/day cap. Effectiveness of this filter is unverified until
  // the next UTC day's quota resets. The edge cache above (see
  // CACHE_TTL_SECONDS) also now collapses every viewer's request for
  // the same sportId+date into one upstream call instead of one per
  // browser, which is the bigger lever on that same budget.
  return proxyToRundown(`/sports/${sportId}/events/${date}?market_ids=1`, env, headers, CACHE_TTL_SECONDS.rundownEvents, ctx);
}

async function handleRundownTeams(request, url, env, headers, ctx){
  if(request.method !== 'GET'){
    return new Response('Method not allowed', { status: 405, headers });
  }

  // /teams/{sportId} -> TheRundown's /sports/{sportId}/teams
  // Two uses: (1) one-off/occasional — building & spot-checking the
  // rundownTeamId mapping in js/data.js — and (2) the CFB Standings tab
  // (js/standings-cfb.js's fetchCfbRecords), which reads the "record" field this
  // response carries per team. TheSportsDB has no real standings data
  // for college football (see the migration plan), so this is the
  // actual source for that view — one shared fetch for the whole
  // league, same as eplStandingsCache, not one call per team.
  const match = url.pathname.match(/^\/teams\/(\d+)$/);
  if(!match) return new Response('Not found', { status: 404, headers });
  const [, sportId] = match;
  return proxyToRundown(`/sports/${sportId}/teams`, env, headers, CACHE_TTL_SECONDS.rundownTeams, ctx);
}

async function proxyToSportsDbV2(sportsdbPath, env, headers, ttlSeconds, ctx){
  const upstream = await cachedUpstreamFetch(`${SPORTSDB_V2_BASE}${sportsdbPath}`, ttlSeconds, {
    headers: { 'X-API-KEY': env.SPORTSDB_API_KEY }
  }, ctx);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

async function proxyToSportsDbV1(sportsdbPath, env, headers, ttlSeconds, ctx){
  // V1 takes the key as a URL segment (same shape as the old public
  // "123" key), not a header — this just substitutes the real premium
  // key in that same slot. The key ends up embedded in the edge cache's
  // key too, but that cache is internal to this Worker (never exposed
  // to a caller), so it's the same exposure as the outbound fetch itself.
  const upstream = await cachedUpstreamFetch(`${SPORTSDB_V1_BASE}/${env.SPORTSDB_API_KEY}${sportsdbPath}`, ttlSeconds, {}, ctx);
  const body = await upstream.text();
  return new Response(body, {
    status: upstream.status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

async function handleSportsDb(request, url, env, headers, ctx){
  if(request.method !== 'GET'){
    return new Response('Method not allowed', { status: 405, headers });
  }

  // Deliberately narrow allowlist — extend it only as new pieces of
  // js/api.js actually need them, same discipline as the TheRundown
  // routes above. Paths chosen from TheSportsDB's V2 docs; response
  // shapes were unverified as of writing (see the migration plan) —
  // curl these directly to confirm before building any client code
  // against them.
  let match;

  // /sportsdb/search-team/{name} -> TheSportsDB's /search/team/{name}
  // One-off/occasional use, same as /teams/{sportId} above: building &
  // spot-checking the sportsdbId mapping for new teams in js/data.js
  // (currently College Football), not called on every app load. Routed
  // through here (premium key, its own rate limit) rather than hitting
  // the free "123" test key directly — that key is shared globally by
  // every developer using TheSportsDB's demo tier and gets saturated
  // fast, confirmed 2026-09-10 while looking up CFB team IDs.
  if((match = url.pathname.match(/^\/sportsdb\/search-team\/([^/]+)$/))){
    return proxyToSportsDbV2(`/search/team/${match[1]}`, env, headers, CACHE_TTL_SECONDS.sportsdbTeam, ctx);
  }
  // /sportsdb/leagues-by-sport/{sport} -> TheSportsDB's V1
  // search_all_leagues.php?s={sport} — one-off admin lookup, same
  // reasoning as search-team above: used to check what leagues/
  // divisions actually exist for a sport (e.g. whether individual CFB
  // conferences are modeled as their own league, distinct from the
  // umbrella "NCAA Division 1") before building any client code
  // around an assumption about the data.
  if((match = url.pathname.match(/^\/sportsdb\/leagues-by-sport\/([^/]+)$/))){
    return proxyToSportsDbV1(`/search_all_leagues.php?s=${match[1]}`, env, headers, CACHE_TTL_SECONDS.sportsdbTeam, ctx);
  }
  if((match = url.pathname.match(/^\/sportsdb\/team\/(\d+)$/))){
    return proxyToSportsDbV2(`/lookup/team/${match[1]}`, env, headers, CACHE_TTL_SECONDS.sportsdbTeam, ctx);
  }
  if((match = url.pathname.match(/^\/sportsdb\/schedule-next\/(\d+)$/))){
    return proxyToSportsDbV2(`/schedule/next/team/${match[1]}`, env, headers, CACHE_TTL_SECONDS.sportsdbSchedule, ctx);
  }
  if((match = url.pathname.match(/^\/sportsdb\/schedule-previous\/(\d+)$/))){
    return proxyToSportsDbV2(`/schedule/previous/team/${match[1]}`, env, headers, CACHE_TTL_SECONDS.sportsdbSchedule, ctx);
  }

  return new Response('Not found', { status: 404, headers });
}

// Minimal CSV -> array-of-objects parser. Deliberately not a general-
// purpose one (no quoted-field/embedded-comma handling) — verified live
// against real injuries/depth_charts rows (player names, injury
// descriptions, position labels) that none of the fields nflverse
// actually populates in these two files contain a comma or a quote.
// Re-verify that assumption before reusing this for any other
// nflverse file.
function parseCsv(text){
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if(!lines.length) return [];
  const headers = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i] : ''; });
    return row;
  });
}

function groupByTeam(rows){
  const byTeam = {};
  rows.forEach(row => {
    const team = row.team;
    if(!team) return;
    (byTeam[team] || (byTeam[team] = [])).push(row);
  });
  return byTeam;
}

// /nflverse/injuries — the whole season file is small enough (well
// under 1MB, confirmed live) to proxy+cache wholesale like any other
// route here, then parse+filter to the latest week server-side so the
// client only ever gets "this week's report", not every week back to
// preseason.
async function handleNflverseInjuries(request, env, headers, ctx){
  if(request.method !== 'GET'){
    return new Response('Method not allowed', { status: 405, headers });
  }
  const season = currentNflverseSeason();
  const upstream = await cachedUpstreamFetch(
    `${NFLVERSE_RELEASES_BASE}/injuries/injuries_${season}.csv`,
    CACHE_TTL_SECONDS.nflverseInjuries,
    {},
    ctx
  );
  if(!upstream.ok){
    return json({}, 200, headers);
  }
  const rows = parseCsv(await upstream.text());
  const latestWeek = rows.reduce((max, r) => Math.max(max, parseInt(r.week, 10) || 0), 0);
  const latest = rows.filter(r => (parseInt(r.week, 10) || 0) === latestWeek);
  return json(groupByTeam(latest), 200, headers);
}

// /nflverse/depth-chart — see the header comment's NFLVERSE PROXY
// section for why this can't be a plain cachedUpstreamFetch pass-
// through. Reads the upstream response as a stream and stops as soon
// as a row's `dt` differs from the very first data row's `dt` (the
// file is newest-snapshot-first), so this only ever pulls down one
// day's ~300KB snapshot rather than the full ~50MB history — bounded
// regardless of whether the range hint below is honored.
async function fetchLatestDepthChartSnapshot(season){
  const upstreamUrl = `${NFLVERSE_RELEASES_BASE}/depth_charts/depth_charts_${season}.csv`;
  // Range is an optimization, not a requirement — the streaming
  // early-cancel below is what actually bounds the work if this isn't
  // honored (e.g. dropped across the redirect to GitHub's signed
  // asset URL).
  const upstream = await fetch(upstreamUrl, { headers: { Range: 'bytes=0-1048576' } });
  if(!upstream.ok && upstream.status !== 206){
    return [];
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffered = '';
  let header = null;
  let latestDt = null;
  const rows = [];
  const SAFETY_ROW_CAP = 5000; // ~2x a full 32-team snapshot — a real stop condition should hit first

  try {
    while(rows.length < SAFETY_ROW_CAP){
      const { done, value } = await reader.read();
      if(value) buffered += decoder.decode(value, { stream: true });

      let newlineIdx;
      while((newlineIdx = buffered.indexOf('\n')) !== -1){
        const line = buffered.slice(0, newlineIdx).replace(/\r$/, '');
        buffered = buffered.slice(newlineIdx + 1);
        if(!line) continue;

        if(!header){
          header = line.split(',');
          continue;
        }
        const cells = line.split(',');
        const row = {};
        header.forEach((h, i) => { row[h] = cells[i] !== undefined ? cells[i] : ''; });

        if(latestDt === null) latestDt = row.dt;
        if(row.dt !== latestDt){
          await reader.cancel();
          return rows;
        }
        rows.push(row);
      }

      if(done) return rows;
    }
  } finally {
    try { await reader.cancel(); } catch(e){}
  }
  return rows;
}

async function handleNflverseDepthChart(request, env, headers, ctx){
  if(request.method !== 'GET'){
    return new Response('Method not allowed', { status: 405, headers });
  }

  const cache = caches.default;
  // Synthetic cache key (this route has no meaningful upstream URL to
  // key on the way cachedUpstreamFetch does — the real upstream is
  // read as a bounded stream, not passed through) — same "shared
  // across every caller" intent as everywhere else in this file.
  const cacheKey = new Request('https://nflverse-cache.internal/depth-chart', { method: 'GET' });
  const cached = await cache.match(cacheKey);
  if(cached) return new Response(cached.body, { status: 200, headers: { ...headers, 'Content-Type': 'application/json' } });

  const rows = await fetchLatestDepthChartSnapshot(currentNflverseSeason());
  const body = JSON.stringify(groupByTeam(rows));
  const toCache = new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS.nflverseDepthChart}` } });
  ctx.waitUntil(cache.put(cacheKey, toCache));
  return json(groupByTeam(rows), 200, headers);
}

// Shared by handleLeagueFacts and handleAdjustments — both are "one JSON
// object per league, in the LEAGUE_FACTS KV namespace, GET public / PUT
// password-gated", just under a different key prefix and PUT body shape.
async function handleKvBlob(request, env, leagueKey, headers, kvKeyPrefix, validateBody){
  if(!KNOWN_LEAGUES.includes(leagueKey)){
    return new Response('Not found', { status: 404, headers });
  }
  const kvKey = `${kvKeyPrefix}:${leagueKey}`;

  if(request.method === 'GET'){
    const stored = await env.LEAGUE_FACTS.get(kvKey, 'json');
    return json(stored || {}, 200, headers);
  }

  if(request.method === 'PUT'){
    if(!isAuthorized(request, env)){
      return new Response('Unauthorized', { status: 401, headers });
    }
    let body;
    try {
      body = await request.json();
    } catch (e){
      return new Response('Invalid JSON body', { status: 400, headers });
    }
    if(!body || typeof body !== 'object' || Array.isArray(body) || !validateBody(body)){
      return new Response('Expected a JSON object', { status: 400, headers });
    }
    await env.LEAGUE_FACTS.put(kvKey, JSON.stringify(body));
    return json(body, 200, headers);
  }

  return new Response('Method not allowed', { status: 405, headers });
}

// Expected shape: { [ruleLabel]: [teamKey, ...] }. The client (which
// knows each rule's exclusive/rankAuto behavior) computes the full
// object and PUTs it wholesale — this just stores whatever it's given,
// so keep the validation limited to "is this the shape we expect".
function handleLeagueFacts(request, env, leagueKey, headers){
  return handleKvBlob(request, env, leagueKey, headers, 'facts', () => true);
}

// Expected shape: { [teamKey]: { pts: number, note: string } } — a flat
// manual point delta per team for whatever a rule can't express, plus a
// short note so a future viewer knows why. Same wholesale-PUT contract
// as facts above.
function handleAdjustments(request, env, leagueKey, headers){
  return handleKvBlob(request, env, leagueKey, headers, 'adjustments', body =>
    Object.values(body).every(v => v && typeof v === 'object' && typeof v.pts === 'number')
  );
}

// Expected shape: { lockedAt: isoString, rules: { [ruleLabel]: [teamKey,
// ...] } } — a one-time frozen snapshot of a league's rankAuto rules,
// written once its regular season is confirmed over (js/season-lock.js)
// so those rules stop reading the live ESPN table (which moves into the
// postseason, then next season's 0-0 table, after that point). Same
// wholesale-PUT contract as facts/adjustments above — the client
// computes the full object and PUTs it, this just stores whatever shape
// it expects. An empty {} is valid for both directions: as a GET
// response it means "never locked yet" (handleKvBlob already returns
// that for any key with nothing stored); as a PUT body it's
// unlockLeague's own "clear the lock" request (js/season-lock.js) —
// the safety valve for an accidental Force Lock, same admin-gated write
// as everything else here.
function handleSeasonLock(request, env, leagueKey, headers){
  return handleKvBlob(request, env, leagueKey, headers, 'lock', body =>
    Object.keys(body).length === 0 ||
    (typeof body.lockedAt === 'string' && body.rules && typeof body.rules === 'object' && !Array.isArray(body.rules))
  );
}

// Open GET/PUT, unlike handleKvBlob above — see the header comment's
// FAVORITES STORE section for why this deliberately skips the
// X-Admin-Password gate. Expected PUT body: a plain array of team keys
// (js/data.js's TEAM_META keys); the client computes the full list and
// PUTs it wholesale, so validation here is just "is this the shape we
// expect", same discipline as every other KV write in this file.
async function handleFavorites(request, env, draftTeamId, headers){
  if(!KNOWN_DRAFT_TEAM_IDS.includes(draftTeamId)){
    return new Response('Not found', { status: 404, headers });
  }
  const kvKey = `favorites:${draftTeamId}`;

  if(request.method === 'GET'){
    const stored = await env.LEAGUE_FACTS.get(kvKey, 'json');
    return json(Array.isArray(stored) ? stored : [], 200, headers);
  }

  if(request.method === 'PUT'){
    let body;
    try {
      body = await request.json();
    } catch (e){
      return new Response('Invalid JSON body', { status: 400, headers });
    }
    if(!Array.isArray(body) || !body.every(k => typeof k === 'string')){
      return new Response('Expected an array of team keys', { status: 400, headers });
    }
    await env.LEAGUE_FACTS.put(kvKey, JSON.stringify(body));
    return json(body, 200, headers);
  }

  return new Response('Method not allowed', { status: 405, headers });
}

// WebSocket upgrades aren't subject to CORS, so a browser will happily
// open one from any origin — check Origin ourselves, same allowlist as
// every other route here. Every drafter connects to the same room.
function handleChatSocket(request, env){
  if(request.headers.get('Upgrade') !== 'websocket'){
    return new Response('Expected a WebSocket upgrade', { status: 426 });
  }
  if(!isAllowedOrigin(request.headers.get('Origin') || '')){
    return new Response('Forbidden', { status: 403 });
  }
  return env.CHAT_ROOM.get(env.CHAT_ROOM.idFromName('main')).fetch(request);
}

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin);

    if(request.method === 'OPTIONS'){
      return new Response(null, { headers });
    }

    if(url.pathname === '/admin/verify'){
      if(request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
      return isAuthorized(request, env)
        ? json({ ok: true }, 200, headers)
        : new Response('Unauthorized', { status: 401, headers });
    }

    if(url.pathname === '/chat/ws') return handleChatSocket(request, env);

    const factsMatch = url.pathname.match(/^\/facts\/([a-z]+)$/);
    if(factsMatch) return handleLeagueFacts(request, env, factsMatch[1], headers);

    const adjustmentsMatch = url.pathname.match(/^\/adjustments\/([a-z]+)$/);
    if(adjustmentsMatch) return handleAdjustments(request, env, adjustmentsMatch[1], headers);

    const lockMatch = url.pathname.match(/^\/lock\/([a-z]+)$/);
    if(lockMatch) return handleSeasonLock(request, env, lockMatch[1], headers);

    const favoritesMatch = url.pathname.match(/^\/favorites\/([a-z]+)$/);
    if(favoritesMatch) return handleFavorites(request, env, favoritesMatch[1], headers);

    if(url.pathname.startsWith('/sportsdb/')) return handleSportsDb(request, url, env, headers, ctx);

    if(url.pathname === '/nflverse/injuries') return handleNflverseInjuries(request, env, headers, ctx);

    if(url.pathname === '/nflverse/depth-chart') return handleNflverseDepthChart(request, env, headers, ctx);

    if(url.pathname.startsWith('/teams/')) return handleRundownTeams(request, url, env, headers, ctx);

    return handleRundownEvents(request, url, env, headers, ctx);
  }
};
