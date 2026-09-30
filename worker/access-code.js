/* ============================================================
   GROUP INVITE CODE (access@<group>): a light gate that keeps outsiders out
   of a group's own state (chat, draft room, activity, favorites, facts,
   points history, push). Not a login: one shared code per group, in an
   invite link, entered once per device. The static site and ESPN data stay
   public (the browser calls ESPN directly, so they can't be gated); the
   landing page, /claim and /roster stay open, since recruiting needs them.

   KV: access@<group> -> { code, enforce, at }
     code     normalized (lowercase a-z 0-9 and dashes), e.g. maple-river-42
     enforce  false = soft mode: a missing or wrong code is let through
              (and logged), so the link can go out before anything breaks;
              true = group routes answer 401 without the right code
   No record, or no code, means the group is open, as before.

   The client sends the code as ?gc= on every group-scoped call
   (js/group.js's withGroupQuery), a query param because a WebSocket can't
   set headers. js/access.js is the client half.

   Routes:
     GET /access/check?group=&gc=   public: { required, ok }. required is
                                    whether this group is enforcing a code,
                                    ok whether the supplied one is good.
     (admin, worker/system-admin.js)
     POST /api/admin/access  { group, action } action is rotate (a new code,
                             soft mode), enforce / soften, or clear

   Records are read through a short per-isolate cache so the gate costs no
   KV read per request; a change shows within CACHE_MS.
   ============================================================ */
import { safeEqual } from './commissioner-token.js';

const CACHE_MS = 30 * 1000;
const cache = new Map();   // group -> { at, record }

const WORDS = [
  'maple', 'river', 'cedar', 'falcon', 'harbor', 'summit', 'copper', 'willow', 'ember', 'meadow',
  'anchor', 'raven', 'clover', 'granite', 'lantern', 'orchard', 'pebble', 'quartz', 'saddle', 'thistle',
  'velvet', 'walnut', 'yonder', 'zephyr', 'bishop', 'canyon', 'dune', 'fjord', 'glacier', 'heron'
];

export const accessKey = group => `access@${group}`;

export function normalizeCode(value){
  if(typeof value !== 'string') return '';
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// Two words and a number, easy to read out or type: maple-river-42.
export function generateCode(random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32){
  const a = Math.floor(random() * WORDS.length);
  // The second word is drawn from the rest, so the two always differ.
  const b = (a + 1 + Math.floor(random() * (WORDS.length - 1))) % WORDS.length;
  return `${WORDS[a]}-${WORDS[b]}-${10 + Math.floor(random() * 90)}`;
}

// What to do with a request: required says whether the group is enforcing,
// ok whether the supplied code is the group's, and allowed whether the
// request goes through (soft mode, and groups with no code, allow everyone).
export function accessDecision(record, supplied){
  const code = record && typeof record.code === 'string' ? record.code : '';
  if(!code) return { required: false, ok: true, allowed: true };
  const ok = safeEqual(normalizeCode(supplied), code);
  const required = !!record.enforce;
  return { required, ok, allowed: ok || !required };
}

export async function loadAccess(env, group, now = Date.now()){
  const hit = cache.get(group);
  if(hit && now - hit.at < CACHE_MS) return hit.record;
  const stored = await env.LEAGUE_FACTS.get(accessKey(group), 'json');
  const record = stored && typeof stored === 'object' && typeof stored.code === 'string' && stored.code
    ? { code: stored.code, enforce: !!stored.enforce, at: stored.at || null }
    : null;
  cache.set(group, { at: now, record });
  return record;
}

async function saveAccess(env, group, record){
  if(record) await env.LEAGUE_FACTS.put(accessKey(group), JSON.stringify(record));
  else await env.LEAGUE_FACTS.delete(accessKey(group));
  cache.set(group, { at: Date.now(), record });
}

// Admin actions. A new code starts in soft mode so the link can be sent
// before anyone is locked out; enforcing is its own step.
export async function changeAccess(env, group, action){
  const current = await loadAccess(env, group, 0);
  if(action === 'rotate'){
    const record = { code: generateCode(), enforce: false, at: Date.now() };
    await saveAccess(env, group, record);
    return { ok: true, access: record };
  }
  if(action === 'clear'){
    await saveAccess(env, group, null);
    return { ok: true, access: null };
  }
  if(action === 'enforce' || action === 'soften'){
    if(!current) return { error: 'no_code' };
    const record = { ...current, enforce: action === 'enforce' };
    await saveAccess(env, group, record);
    return { ok: true, access: record };
  }
  return { error: 'bad_action' };
}

// The gate for group-owned routes. Null lets the request through; a
// Response turns it away. Soft mode logs what it would have refused.
export async function gateRequest(env, group, url, headers){
  const decision = accessDecision(await loadAccess(env, group), url.searchParams.get('gc'));
  if(decision.allowed){
    if(!decision.ok) console.warn(`[access] ${group} ${url.pathname}: no valid code (soft mode)`);
    return null;
  }
  return new Response('Access code required', { status: 401, headers });
}

export async function handleAccessCheck(request, url, env, group, headers, { json }){
  if(request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
  const { required, ok } = accessDecision(await loadAccess(env, group), url.searchParams.get('gc'));
  return json({ required, ok }, 200, { ...headers, 'Cache-Control': 'no-store' });
}
