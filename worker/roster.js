/* ============================================================
   CONFIRMED SPOTS (roster@<group>): the admin page turns a spot claim
   into a real drafter without a deploy. Confirming (confirmClaim in
   worker/claims.js) gives the claim's person, under a name the admin can
   edit first, the next spot js/groups.js marks `open: true`, keeping that
   spot's id, and drops the claim. applyRoster (js/groups.js) is how
   everything reads it: the app at boot (js/roster.js), the landing page's
   open count, chat and draft alerts, and the admin page.

   KV: roster@<group> -> { <drafterId>: { name, email, at } }
       size@<group>   -> { size, at }  how many spots the group runs with
                         (applySize in js/groups.js drops open spots off
                         the end); set on the admin page, only while the
                         group's draft is still in the lobby

   Routes:
     GET /roster?group=      public: { assigned: { <id>: { name } }, size },
                             names only, never emails; size is null until
                             the admin sets one
     (admin, worker/system-admin.js)
     POST /api/admin/claims/confirm  { group, id, name, welcome } -> fill a
                                     spot (and send the welcome email)
     POST /api/admin/roster/release  { group, drafter }  -> free it again
     POST /api/admin/roster/size     { group, size }     -> how many spots
   ============================================================ */
import { GROUPS, applyRoster, applySize } from '../js/groups.js';

export function rosterKey(group){
  return `roster@${group}`;
}

export async function loadAssigned(env, group){
  const stored = await env.LEAGUE_FACTS.get(rosterKey(group), 'json');
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

export async function saveAssigned(env, group, assigned){
  if(Object.keys(assigned).length) await env.LEAGUE_FACTS.put(rosterKey(group), JSON.stringify(assigned));
  else await env.LEAGUE_FACTS.delete(rosterKey(group));
}

export function sizeKey(group){
  return `size@${group}`;
}

// { size, at } or null when the admin never set one.
export async function loadSize(env, group){
  const stored = await env.LEAGUE_FACTS.get(sizeKey(group), 'json');
  return stored && Number.isInteger(stored.size) ? { size: stored.size, at: Number(stored.at) || 0 } : null;
}

export async function saveSize(env, group, size, at){
  await env.LEAGUE_FACTS.put(sizeKey(group), JSON.stringify({ size, at }));
}

// The spots a group runs with: names applied, then trimmed to its size.
// `size` can be handed in (a save not yet visible to KV reads).
export async function activeRoster(env, group, assigned, size){
  const drafters = applyRoster(GROUPS[group].drafters, assigned || await loadAssigned(env, group));
  return applySize(drafters, size === undefined ? ((await loadSize(env, group)) || {}).size : size);
}

// Groups with no open spot in js/groups.js skip the KV read entirely (a
// full roster can't be trimmed either). A failed read falls back to the
// placeholders: callers are alerts, which shouldn't fail over a name.
export async function effectiveDrafters(env, group){
  const drafters = GROUPS[group].drafters;
  if(!drafters.some(d => d.open)) return drafters;
  try {
    return await activeRoster(env, group);
  } catch (e){
    return drafters;
  }
}

// Undo: the spot goes back to open under its placeholder name. Only a
// confirmed spot can be released; a name set in js/groups.js can't.
export async function releaseSpot(env, group, drafterId){
  const assigned = await loadAssigned(env, group);
  if(!assigned[drafterId]) return false;
  delete assigned[drafterId];
  await saveAssigned(env, group, assigned);
  return true;
}

export async function handleRoster(request, env, group, headers, { json }){
  if(request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
  const [assigned, size] = await Promise.all([loadAssigned(env, group), loadSize(env, group)]);
  const names = {};
  for(const [id, a] of Object.entries(assigned)) names[id] = { name: a.name };
  return json({ assigned: names, size: size ? size.size : null }, 200, { ...headers, 'Cache-Control': 'no-store' });
}
