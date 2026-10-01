/* ============================================================
   A GROUP'S SPORTS (sports@<group>): which sports a group shows and
   drafts, set on the Commissioner page (js/admin.js) with no deploy. The
   shape and its rules are js/sports.js.

   KV: sports@<group> -> { sports: { <league>: 0 | n }, at: epoch ms }

   Routes:
     GET /sports?group=   public like /roster (the landing page reads
                          it too): { sports, at }, or { sports: null }
                          when the group has none and js/groups.js decides
     PUT /sports?group=   { sports } -> saves it; commissioner password.
                          Answers { sports, at }.

   Draft rooms read the drafted sports as their caps (liveGroupCaps),
   applied only while a room is in the lobby. Saving also hands them to
   the live room and the Settings mock room straight away, so a lobby
   that's open updates without anyone reconnecting. KV reads can lag a
   write by up to a minute elsewhere, so `at` travels with the caps and a
   room never goes back to an older record than one it has applied.
   ============================================================ */
import { groupCaps } from '../js/groups.js';
import { parseSports, sportsCaps } from '../js/sports.js';

// The rooms a save updates at once. Any other room picks it up the next
// time someone connects.
const SYNCED_ROOMS = ['main', 'mock-1'];

export function sportsKey(group){
  return `sports@${group}`;
}

export async function loadSports(env, group){
  const stored = await env.LEAGUE_FACTS.get(sportsKey(group), 'json');
  const sports = stored && parseSports(stored.sports);
  return sports ? { sports, at: Number(stored.at) || 0 } : null;
}

// A draft room's caps: { caps, at }. `at` is 0 when they come from
// js/groups.js; caps null means the room's own defaults.
export async function liveGroupCaps(env, group){
  let record = null;
  try { record = await loadSports(env, group); } catch (e){}
  return record ? { caps: sportsCaps(record.sports), at: record.at } : { caps: groupCaps(group), at: 0 };
}

export async function handleSports(request, url, env, group, headers, { json, isAuthorized, draftRoomStub }){
  if(request.method === 'GET'){
    const record = await loadSports(env, group);
    return json(record || { sports: null }, 200, { ...headers, 'Cache-Control': 'no-store' });
  }
  if(request.method !== 'PUT') return new Response('Method not allowed', { status: 405, headers });
  if(!await isAuthorized(request, env, group)) return new Response('Unauthorized', { status: 401, headers });
  let body;
  try { body = await request.json(); } catch (e){ body = null; }
  const sports = parseSports(body && body.sports);
  if(!sports) return new Response('Expected { sports: { <league>: 0..5 } } with one drafted', { status: 400, headers });
  const record = { sports, at: Date.now() };
  await env.LEAGUE_FACTS.put(sportsKey(group), JSON.stringify(record));

  const caps = JSON.stringify({ caps: sportsCaps(sports), at: record.at });
  await Promise.all(SYNCED_ROOMS.map(async room => {
    const roomUrl = new URL(url);
    roomUrl.searchParams.set('room', room);
    const stub = draftRoomStub(roomUrl, env, group);
    try {
      await stub.fetch(new Request(new URL('/caps' + roomUrl.search, url), { method: 'PUT', body: caps }));
    } catch (e){}
  }));
  // The live room's edge-cached status carries the pick count.
  // Built the way the app asks for it (js/admin.js), so the key matches.
  const statusUrl = new URL(`/draft/status?room=main${url.search ? `&${url.search.slice(1)}` : ''}`, url);
  await caches.default.delete(new Request(statusUrl.toString(), { method: 'GET' })).catch(() => {});
  return json(record, 200, { ...headers, 'Cache-Control': 'no-store' });
}
