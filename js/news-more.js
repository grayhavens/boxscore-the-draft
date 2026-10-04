/* ============================================================
   MORE NEWS: stories from beyond ESPN (Perigon), shown under a team's
   ESPN headlines on its page. The worker fills them in on a daily
   schedule (worker/news.js), so this is ONE cheap read per league, shared
   by every team of that league, and never an upstream search of its own.

   Degrades quietly: an unset worker URL, an old worker without the route,
   or a worker with no Perigon key all end the same way, with no stories
   and no section. Matching teams to articles happens in the worker
   (js/news-math.js); this file only fetches and remembers.
   ============================================================ */
import { DASHBOARD_WORKER_BASE } from './worker-base.js';
import { fetchJSON, retryPending } from './utils.js';
import { isFreshAt } from './cache-fresh.js';

// Matched to the worker's Cache-Control max-age on /news/<league>.
const MORE_NEWS_TTL_MS = 15 * 60 * 1000;

const byLeague = {}; // leagueKey -> { teams, fetchedAt, failedAt, promise }

// Resolves to the league's { teamKey: [stories] }, or null when there is
// nothing to show (failed or switched off).
export function fetchMoreNewsCached(leagueKey){
  if(!DASHBOARD_WORKER_BASE) return Promise.resolve(null);
  const entry = byLeague[leagueKey] || (byLeague[leagueKey] = { teams: null, fetchedAt: 0, failedAt: 0, promise: null });
  if(entry.promise) return entry.promise;
  if(entry.teams && isFreshAt(entry.fetchedAt, MORE_NEWS_TTL_MS)) return Promise.resolve(entry.teams);
  if(!entry.teams && retryPending(entry)) return Promise.resolve(null);

  entry.promise = fetchJSON(`${DASHBOARD_WORKER_BASE}/news/${encodeURIComponent(leagueKey)}`).then(data => {
    entry.promise = null;
    if(!data || !data.teams){ entry.failedAt = Date.now(); return entry.teams; }
    entry.teams = data.teams;
    entry.fetchedAt = Date.now();
    return entry.teams;
  });
  return entry.promise;
}

// Only web links open from a story card.
export function safeStoryUrl(url){
  return /^https?:\/\//i.test(url || '') ? url : null;
}
