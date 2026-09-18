/* ============================================================
   NFLVERSE: NFL injuries + real depth-chart data, sourced from
   github.com/nflverse/nflverse-data (public GitHub release, no key)
   via worker/rundown-proxy.js's /nflverse/injuries and
   /nflverse/depth-chart routes — see that worker file's NFLVERSE PROXY
   header section for why a proxy is needed here at all (GitHub's
   release assets have no CORS headers, so a direct browser fetch fails
   regardless of key).

   Both routes already return one JSON object keyed by team abbreviation
   covering every NFL team, so — same as espnNflStandingsCache in
   js/standings-nfl.js — this is ONE shared fetch each, not one per
   team: whichever NFL team page is opened first triggers both, and
   every other NFL team then reads from the same cache for free.
   ============================================================ */
import { DASHBOARD_WORKER_BASE } from './api.js';
import { fetchJSON } from './utils.js';

// nflverse's team abbreviations match this app's own TEAM_META.badgeText
// verbatim for every NFL team except the Rams — nflverse says "LA",
// this app says "LAR" (checked against a live pull of all 32 teams,
// 2026-09-17). Mirrors the NFL_ESPN_ABBR_OVERRIDES idea in
// js/standings-nfl.js, just the nflverse direction.
const NFLVERSE_ABBR_OVERRIDES = {
  LAR: 'LA'
};

export function nflverseTeamAbbr(meta){
  return NFLVERSE_ABBR_OVERRIDES[meta.badgeText] || meta.badgeText;
}

// Matched to the worker's own CACHE_TTL_SECONDS.nflverseInjuries/
// nflverseDepthChart (worker/rundown-proxy.js) — same "one freshness
// decision, not two that can drift" discipline as every other cache
// pair in this app (see the checklist in js/standings-nfl.js's header).
const NFLVERSE_INJURIES_TTL_MS = 2 * 60 * 60 * 1000;
const NFLVERSE_DEPTH_CHART_TTL_MS = 3 * 60 * 60 * 1000;

const NFLVERSE_INJURIES_CACHE_KEY = 'teamDashboardNflverseInjuriesCache';
const NFLVERSE_DEPTH_CHART_CACHE_KEY = 'teamDashboardNflverseDepthChartCache';

export const nflverseInjuriesCache = { byTeam: null, fetchedAt: null, loading: false };
export const nflverseDepthChartCache = { byTeam: null, fetchedAt: null, loading: false };
let injuriesPromise = null;
let depthChartPromise = null;

function isFresh(cache, ttlMs){
  return !!cache.byTeam && !!cache.fetchedAt && (Date.now() - cache.fetchedAt) < ttlMs;
}

function saveCache(key, cache){
  try { localStorage.setItem(key, JSON.stringify(cache)); } catch (e){}
}

function loadCache(key, cache){
  try {
    const raw = localStorage.getItem(key);
    if(!raw) return;
    const parsed = JSON.parse(raw);
    if(parsed && parsed.byTeam){
      cache.byTeam = parsed.byTeam;
      cache.fetchedAt = parsed.fetchedAt || null;
    }
  } catch (e){}
}

export function loadNflverseCaches(){
  loadCache(NFLVERSE_INJURIES_CACHE_KEY, nflverseInjuriesCache);
  loadCache(NFLVERSE_DEPTH_CHART_CACHE_KEY, nflverseDepthChartCache);
}

export function fetchNflverseInjuriesCached(){
  if(nflverseInjuriesCache.loading) return injuriesPromise;
  if(isFresh(nflverseInjuriesCache, NFLVERSE_INJURIES_TTL_MS)) return Promise.resolve();
  if(!DASHBOARD_WORKER_BASE) return Promise.resolve();

  nflverseInjuriesCache.loading = true;
  injuriesPromise = (async () => {
    const byTeam = await fetchJSON(`${DASHBOARD_WORKER_BASE}/nflverse/injuries`);
    nflverseInjuriesCache.loading = false;
    if(byTeam){
      nflverseInjuriesCache.byTeam = byTeam;
      nflverseInjuriesCache.fetchedAt = Date.now();
      saveCache(NFLVERSE_INJURIES_CACHE_KEY, nflverseInjuriesCache);
    }
  })();
  return injuriesPromise;
}

export function fetchNflverseDepthChartCached(){
  if(nflverseDepthChartCache.loading) return depthChartPromise;
  if(isFresh(nflverseDepthChartCache, NFLVERSE_DEPTH_CHART_TTL_MS)) return Promise.resolve();
  if(!DASHBOARD_WORKER_BASE) return Promise.resolve();

  nflverseDepthChartCache.loading = true;
  depthChartPromise = (async () => {
    const byTeam = await fetchJSON(`${DASHBOARD_WORKER_BASE}/nflverse/depth-chart`);
    nflverseDepthChartCache.loading = false;
    if(byTeam){
      nflverseDepthChartCache.byTeam = byTeam;
      nflverseDepthChartCache.fetchedAt = Date.now();
      saveCache(NFLVERSE_DEPTH_CHART_CACHE_KEY, nflverseDepthChartCache);
    }
  })();
  return depthChartPromise;
}

export function getTeamDepthChart(meta){
  const byTeam = nflverseDepthChartCache.byTeam;
  if(!byTeam) return [];
  return byTeam[nflverseTeamAbbr(meta)] || [];
}

export function getTeamInjuries(meta){
  const byTeam = nflverseInjuriesCache.byTeam;
  if(!byTeam) return [];
  return byTeam[nflverseTeamAbbr(meta)] || [];
}

function normalizeName(name){
  return (name || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Real report_status ('Out'/'Doubtful'/'Questionable') for an ESPN
// roster player, or null if nflverse has no injury row for them this
// week. Joined primarily via espn_id (depth chart carries both espn_id
// and gsis_id, so it's the bridge between ESPN's roster ids and
// nflverse's own gsis-keyed injury rows); falls back to a normalized
// full-name match for the (rare) player hurt but not on the depth
// chart's ~69 charted slots per team.
export function nflverseInjuryStatus(rosterPlayer, meta){
  const injuries = getTeamInjuries(meta);
  if(!injuries.length) return null;

  const depthChart = getTeamDepthChart(meta);
  const dcRow = depthChart.find(r => String(r.espn_id) === String(rosterPlayer.id));
  if(dcRow && dcRow.gsis_id){
    const byGsis = injuries.find(r => r.gsis_id === dcRow.gsis_id);
    if(byGsis) return byGsis.report_status || null;
  }

  const wanted = normalizeName(rosterPlayer.name);
  const byName = wanted && injuries.find(r => normalizeName(r.full_name) === wanted);
  return byName ? (byName.report_status || null) : null;
}
