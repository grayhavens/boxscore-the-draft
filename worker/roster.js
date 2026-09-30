/* ============================================================
   CONFIRMED SPOTS (roster@<group>): the admin page turns a spot claim
   into a real drafter without a deploy. Confirming (confirmClaim in
   worker/claims.js) gives the claim's person, under a name the admin can
   edit first, the next spot js/groups.js marks `open: true`, keeping that
   spot's id, and drops the claim. applyRoster (js/groups.js) is how
   everything reads it: the app at boot (js/roster.js), the landing page's
   open count, chat and draft alerts, and the admin page.

   KV: roster@<group> -> { <drafterId>: { name, email, at } }

   Routes:
     GET /roster?group=      public: { assigned: { <id>: { name } } },
                             names only, never emails
     (admin, worker/system-admin.js)
     POST /api/admin/claims/confirm  { group, id, name, welcome } -> fill a
                                     spot (and send the welcome email)
     POST /api/admin/roster/release  { group, drafter }  -> free it again
   ============================================================ */
import { GROUPS, applyRoster } from '../js/groups.js';

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

// Groups with no open spot in js/groups.js skip the KV read entirely. A
// failed read falls back to the placeholders: callers are alerts, which
// shouldn't fail over a name.
export async function effectiveDrafters(env, group){
  const drafters = GROUPS[group].drafters;
  if(!drafters.some(d => d.open)) return drafters;
  try {
    return applyRoster(drafters, await loadAssigned(env, group));
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
  const assigned = await loadAssigned(env, group);
  const names = {};
  for(const [id, a] of Object.entries(assigned)) names[id] = { name: a.name };
  return json({ assigned: names }, 200, { ...headers, 'Cache-Control': 'no-store' });
}
