/* ============================================================
   POINTS HISTORY (history@<group>:<season>): one sample per day of every
   drafter's projected and locked points, for the Points tab's Race chart
   (docs/points-race-plan.md).

   Scoring only exists in the browser, so nothing here computes points.
   The sample rides along on the Activity PUT (js/activity.js ->
   handleActivity in worker/rundown-proxy.js): whenever an app lands a
   newer snapshot with totals it computed itself (not ones carried
   forward from the last snapshot), it also sends
   { season, p: { <id>: projected }, l: { <id>: locked } } and that
   becomes the entry for the day of the snapshot's dataAt. A later write
   the same day replaces it, so each day keeps its latest numbers. A day
   nobody opened the app has no entry; the chart holds the last value.

   KV: history[@<group>]:<season> -> { days: [{ d: 'YYYY-MM-DD', p, l }] }
   (The Draft keeps the bare prefix, like every other group-owned key.)
   Days are Central time (historyDay in js/race-math.js), oldest first.

   Routes:
     GET /points/history?group=&season=   public: { days }
     (written only through PUT /activity)
   ============================================================ */

import { historyDay } from '../js/race-math.js';

export { historyDay };
export const HISTORY_MAX_DAYS = 550;   // a class runs Aug to Oct of the next year
const LEGACY_SEASON = '2026';

export function historyKey(prefix, season){
  return `${prefix}:${season}`;
}

function cleanTotals(obj, drafterIds){
  if(!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  for(const id of drafterIds){
    const v = obj[id];
    if(!Number.isInteger(v) || Math.abs(v) > 10000) return null;
    out[id] = v;
  }
  return out;
}

// A sample only counts when it has every drafter's projected AND locked
// points: a partial one would read as someone dropping to zero.
export function parseSample(sample, drafterIds){
  if(!sample || typeof sample !== 'object') return null;
  if(typeof sample.season !== 'string' || !/^\d{4}$/.test(sample.season)) return null;
  const p = cleanTotals(sample.p, drafterIds);
  const l = cleanTotals(sample.l, drafterIds);
  if(!p || !l) return null;
  return { season: sample.season, p, l };
}

// Same day replaces, a new day is inserted in order, oldest days fall off.
export function mergeSample(history, day, sample){
  const days = (history && Array.isArray(history.days) ? history.days : []).filter(x => x.d !== day);
  days.push({ d: day, p: sample.p, l: sample.l });
  days.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { days: days.slice(-HISTORY_MAX_DAYS) };
}

export async function recordSample(env, prefix, sample, dataAt){
  const key = historyKey(prefix, sample.season);
  const stored = await env.LEAGUE_FACTS.get(key, 'json');
  await env.LEAGUE_FACTS.put(key, JSON.stringify(mergeSample(stored, historyDay(dataAt), sample)));
}

export async function handlePointsHistory(request, url, env, prefix, headers, { json }){
  if(request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
  const season = url.searchParams.get('season') || LEGACY_SEASON;
  if(!/^\d{4}$/.test(season)) return new Response('Bad season', { status: 400, headers });
  const stored = await env.LEAGUE_FACTS.get(historyKey(prefix, season), 'json');
  return json({ days: stored && Array.isArray(stored.days) ? stored.days : [] }, 200, { ...headers, 'Cache-Control': 'public, max-age=60' });
}
