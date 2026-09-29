/* ============================================================
   SPOT CLAIMS (/claim): someone on the landing page (js/landing.js) asks
   for one of a group's open roster spots (`open: true` in js/groups.js).
   Nothing about the roster changes here — a claim is a request: it's kept
   in KV for the admin page (worker/system-admin.js lists and dismisses
   them) and alerts the platform owner's devices (PLATFORM_OWNER). Filling
   the spot is still an edit to js/groups.js.

   Public and unauthenticated, so it's bounded every way it can be: our
   origins only, a group must have an open spot, a few claims per IP per
   hour, a cap on how many wait at once, and short plain-text fields.

   KV: claims@<group> -> [{ id, name, email, at }], newest first
       claimrate:<ip>  -> count, expiring after an hour
   ============================================================ */
import { GROUPS, PLATFORM_OWNER, openSpots } from '../js/groups.js';
import { pushToDrafters } from './web-push.js';

export const MAX_PENDING_CLAIMS = 25;
export const CLAIMS_PER_IP_PER_HOUR = 3;
export const CLAIM_LIMITS = { name: 40, email: 80 };
// Deliberately loose: something@something.tld. The point is a way to
// reach the person, not RFC 5322.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_URL = 'https://boxscore.space/admin';

export function claimsKey(group){
  return `claims@${group}`;
}

// { claim } with trimmed, one-line, length-capped text, or { error }
// naming the first missing or bad field ('name' or 'email'). Pure so
// tests/claims.test.mjs can run it.
export function parseClaim(body){
  if(!body || typeof body !== 'object') return { error: 'name' };
  const clean = (v, max) => typeof v === 'string'
    ? v.replace(/[\s\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, max)
    : '';
  const name = clean(body.name, CLAIM_LIMITS.name);
  if(!name) return { error: 'name' };
  const email = clean(body.email, CLAIM_LIMITS.email).replace(/ /g, '');
  if(!EMAIL.test(email)) return { error: 'email' };
  return { claim: { name, email } };
}

export async function loadClaims(env, group){
  const stored = await env.LEAGUE_FACTS.get(claimsKey(group), 'json');
  return Array.isArray(stored) ? stored : [];
}

export async function dismissClaim(env, group, id){
  const claims = await loadClaims(env, group);
  const kept = claims.filter(c => c.id !== id);
  if(kept.length === claims.length) return false;
  if(kept.length) await env.LEAGUE_FACTS.put(claimsKey(group), JSON.stringify(kept));
  else await env.LEAGUE_FACTS.delete(claimsKey(group));
  return true;
}

// KV is eventually consistent, so two bursts from one IP at the same
// moment can both slip under the limit; close enough for a nuisance cap.
async function overRateLimit(env, request){
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `claimrate:${ip}`;
  const count = Number(await env.LEAGUE_FACTS.get(key)) || 0;
  if(count >= CLAIMS_PER_IP_PER_HOUR) return true;
  await env.LEAGUE_FACTS.put(key, String(count + 1), { expirationTtl: 60 * 60 });
  return false;
}

export async function handleClaim(request, env, group, headers, { isAllowedOrigin, json }){
  if(request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
  if(!isAllowedOrigin(request.headers.get('Origin') || '')) return new Response('Forbidden', { status: 403, headers });
  const open = openSpots(group).length;
  if(!open) return json({ error: 'full' }, 409, headers);

  let parsed;
  try { parsed = parseClaim(await request.json()); } catch (e){ parsed = { error: 'name' }; }
  if(parsed.error) return json({ error: parsed.error }, 400, headers);
  const claim = parsed.claim;

  const claims = await loadClaims(env, group);
  if(claims.length >= MAX_PENDING_CLAIMS) return json({ error: 'busy' }, 429, headers);
  if(await overRateLimit(env, request)) return json({ error: 'rate' }, 429, headers);

  const entry = { id: crypto.randomUUID(), ...claim, at: Date.now() };
  await env.LEAGUE_FACTS.put(claimsKey(group), JSON.stringify([entry, ...claims]));

  const groupName = GROUPS[group].name;
  await pushToDrafters(env, PLATFORM_OWNER.group, [PLATFORM_OWNER.drafter], null, {
    kind: 'claim',
    title: `${groupName}: spot claimed`,
    body: `${claim.name} (${claim.email}) wants in. ${open} open spot${open === 1 ? '' : 's'}.`,
    url: ADMIN_URL,
    tag: `claim-${entry.id}` // one notification per claim, none replacing another
  }, { ttl: 24 * 60 * 60 });

  return json({ ok: true }, 200, headers);
}
