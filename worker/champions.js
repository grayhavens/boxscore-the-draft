/* ============================================================
   LEAGUE HISTORY (champions[@<group>]): each finished season's final
   standings, recorded by the commissioner (js/admin.js, History) and
   shown on Points -> History (js/history.js). The season shape and its
   checks are js/champions.js, shared with the app.

   KV: champions[@<group>] -> { seasons: [season], at }, newest first.

   Routes:
     GET    /champions?group=          { seasons }; behind the invite code
                                       like the rest of a group's state
     PUT    /champions?group=          { season } -> adds it, or replaces
                                       the one with its id; commissioner
     DELETE /champions?group=&id=2025  removes one; commissioner

   Recording the season the app just played ('app') for the first time
   tells the whole group, on every device with alerts on (like the draft
   time: once a year, and everyone wants it). Typing in an old season
   doesn't.
   ============================================================ */
import { parseSeason, upsertSeason, championsOf, namesText, seasonIdOk } from '../js/champions.js';

export function championsKey(prefix){
  return `${prefix}:seasons`;
}

export async function loadSeasons(env, prefix){
  const stored = await env.LEAGUE_FACTS.get(championsKey(prefix), 'json');
  return stored && Array.isArray(stored.seasons) ? stored.seasons : [];
}

// The alert for a season the app just finished, or null.
export function championAlert(season){
  if(season.source !== 'app') return null;
  const names = championsOf(season).map(s => s.name);
  const shared = names.length > 1;
  return {
    kind: 'champion',
    title: `${namesText(names)} ${shared ? 'share' : 'wins'} the ${season.label}`,
    body: 'The final standings are in. See them on Points.',
    url: './?view=overall&seg=history',
    tag: 'champion'
  };
}

export async function handleChampions(request, url, env, group, headers, { json, isAuthorized, drafterIds, prefix, push, log }){
  const key = championsKey(prefix);
  if(request.method === 'GET'){
    return json({ seasons: await loadSeasons(env, prefix) }, 200, { ...headers, 'Cache-Control': 'no-store' });
  }
  if(request.method !== 'PUT' && request.method !== 'DELETE') return new Response('Method not allowed', { status: 405, headers });
  if(!await isAuthorized(request, env, group)) return new Response('Unauthorized', { status: 401, headers });

  const seasons = await loadSeasons(env, prefix);
  if(request.method === 'DELETE'){
    const id = url.searchParams.get('id') || '';
    if(!seasonIdOk(id)) return new Response('Expected ?id=<year>', { status: 400, headers });
    const gone = seasons.find(s => s.id === id);
    const next = seasons.filter(s => s.id !== id);
    await env.LEAGUE_FACTS.put(key, JSON.stringify({ seasons: next, at: Date.now() }));
    if(gone) log(`History: removed the ${gone.label}`);
    return json({ seasons: next }, 200, headers);
  }

  let body;
  try { body = await request.json(); } catch (e){ body = null; }
  const season = parseSeason(body && body.season, drafterIds);
  if(!season) return new Response('Expected { season: { id, label, source, standings: [{ id, name, pts }] } }', { status: 400, headers });
  season.at = Date.now();
  const existed = seasons.some(s => s.id === season.id);
  const next = upsertSeason(seasons, season);
  await env.LEAGUE_FACTS.put(key, JSON.stringify({ seasons: next, at: season.at }));
  log(`History: ${existed ? 'updated' : 'recorded'} the ${season.label} (${namesText(championsOf(season).map(s => s.name))} 1st)`);
  const alert = existed ? null : championAlert(season);
  if(alert) push(alert);
  return json({ seasons: next }, 200, headers);
}
