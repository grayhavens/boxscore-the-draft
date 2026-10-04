/* ============================================================
   PERIGON NEWS (news@<league>): the "More news" stories under a team's
   ESPN headlines, from Perigon's articles search. A proof of concept.

   Why a scheduled batch. Perigon's free tier is about 150 calls a
   month, so no call may depend on a person opening a page. A daily cron
   (wrangler.toml [triggers]) walks a fixed list of search chunks
   round-robin, a few per run (js/news-math.js builds the chunks: one OR
   query of full team names each), matches every article back to the
   teams it names, and stores the result in KV. Every browser reads KV,
   so ten users and a thousand cost the same.

   KV:
     news@<league>  { at, teams: { <teamKey>: [{ id, title, url, source, at }] } }
                    one record per league key (nfl, epl, cfb, ...), newest first
     news@meta      { cursor, month, calls }
                    where the round-robin stands and this month's calls

   Budget. `calls` counts every request made this UTC month, failures
   included, and the run stops at MONTHLY_CAP (under the 150 so a manual
   refresh or a retry can't tip it over). With about 19 chunks and 4 a
   day, every chunk is refreshed roughly every five days.

   Routes:
     GET  /news/<league>   public: { teams } for that league ({} until the
                           first run, or when PERIGON_API_KEY is unset)
     POST /news/refresh    commissioner password: runs one batch now and
                           answers what it did; same budget rules

   The key is a worker secret (PERIGON_API_KEY) and Perigon takes it as a
   query parameter, so it travels in the upstream URL only. Every upstream
   GET goes through cachedUpstreamFetch like the rest of the worker.
   ============================================================ */
import { THE_DRAFT_LATEST } from '../js/seasons/the-draft.js';
import { newsTeams, newsChunks, matchTeams, parseArticle, mergeTeamNews } from '../js/news-math.js';

const PERIGON_ARTICLES = 'https://api.perigon.io/v1/articles/all';
const CHUNKS_PER_RUN = 4;
const MONTHLY_CAP = 140;
const LOOKBACK_DAYS = 3;
// Matches one run's repeat visits: a manual refresh right after the cron
// re-reads the same chunk from the edge cache instead of spending again.
export const PERIGON_TTL_SECONDS = 6 * 60 * 60;

const TEAMS = newsTeams(THE_DRAFT_LATEST.TEAM_META);
const CHUNKS = newsChunks(TEAMS);
const LEAGUE_KEYS = [...new Set(TEAMS.map(t => t.leagueKey))];

export function newsKey(league){
  return `news@${league}`;
}

const META_KEY = 'news@meta';

function monthOf(now){
  return new Date(now).toISOString().slice(0, 7);
}

async function loadMeta(env, now){
  const stored = await env.LEAGUE_FACTS.get(META_KEY, 'json');
  const month = monthOf(now);
  // A new month starts a fresh count; the cursor carries on.
  return { cursor: Number(stored && stored.cursor) || 0, month, calls: stored && stored.month === month ? Number(stored.calls) || 0 : 0 };
}

function searchUrl(chunk, env, now){
  const from = new Date(now - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    q: chunk.q, category: 'Sports', language: 'en', sortBy: 'date', size: '100', showReprints: 'false', from, apiKey: env.PERIGON_API_KEY
  });
  return `${PERIGON_ARTICLES}?${params}`;
}

// Runs up to `runs` chunks from the cursor. Answers what happened; never
// throws (a failed call stops the batch and leaves the cursor on that
// chunk, so the next run retries it).
export async function refreshNews(env, ctx, { cachedUpstreamFetch, now = Date.now(), runs = CHUNKS_PER_RUN }){
  if(!env.PERIGON_API_KEY) return { ok: false, reason: 'no-key' };
  const meta = await loadMeta(env, now);
  const result = { ok: true, chunks: 0, calls: 0, articles: 0, matched: 0, stoppedAt: null };
  const fresh = {}; // leagueKey -> teamKey -> articles

  for(let i = 0; i < runs; i++){
    if(meta.calls >= MONTHLY_CAP){ result.stoppedAt = 'cap'; break; }
    const chunk = CHUNKS[meta.cursor % CHUNKS.length];
    meta.calls++;
    result.calls++;
    let body = null;
    try {
      const res = await cachedUpstreamFetch(searchUrl(chunk, env, now), PERIGON_TTL_SECONDS, {}, ctx);
      if(res.ok) body = await res.json();
      else result.stoppedAt = `http-${res.status}`;
    } catch (e){
      result.stoppedAt = 'fetch-failed';
    }
    if(!body){ break; }

    const teams = TEAMS.filter(t => t.bucket === chunk.bucket);
    for(const raw of Array.isArray(body.articles) ? body.articles : []){
      const article = parseArticle(raw);
      if(!article) continue;
      result.articles++;
      const keys = matchTeams(article, teams);
      if(keys.length) result.matched++;
      for(const key of keys){
        const league = teams.find(t => t.key === key).leagueKey;
        ((fresh[league] || (fresh[league] = {}))[key] || (fresh[league][key] = [])).push(article);
      }
    }
    meta.cursor = (meta.cursor + 1) % CHUNKS.length;
    result.chunks++;
  }

  for(const [league, byTeam] of Object.entries(fresh)){
    const stored = (await env.LEAGUE_FACTS.get(newsKey(league), 'json')) || { teams: {} };
    for(const [key, articles] of Object.entries(byTeam)) stored.teams[key] = mergeTeamNews(stored.teams[key] || [], articles, now);
    stored.at = now;
    await env.LEAGUE_FACTS.put(newsKey(league), JSON.stringify(stored));
  }
  await env.LEAGUE_FACTS.put(META_KEY, JSON.stringify(meta));
  result.callsThisMonth = meta.calls;
  return result;
}

export async function handleNews(request, url, env, ctx, headers, { json, isAuthorized, cachedUpstreamFetch, group }){
  if(url.pathname === '/news/refresh'){
    if(request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
    if(!await isAuthorized(request, env, group)) return new Response('Unauthorized', { status: 401, headers });
    return json(await refreshNews(env, ctx, { cachedUpstreamFetch }), 200, { ...headers, 'Cache-Control': 'no-store' });
  }
  if(request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
  const league = url.pathname.slice('/news/'.length);
  if(!LEAGUE_KEYS.includes(league)) return new Response('Unknown league', { status: 404, headers });
  const stored = env.PERIGON_API_KEY ? await env.LEAGUE_FACTS.get(newsKey(league), 'json') : null;
  return json({ teams: stored ? stored.teams : {}, at: stored ? stored.at : null }, 200, { ...headers, 'Cache-Control': 'public, max-age=900' });
}
