/* ============================================================
   SPOT CLAIMS (/claim): someone on the landing page (js/landing.js) asks
   for one of a group's open roster spots (`open: true` in js/groups.js).
   A claim is a request: it's kept in KV and shows at the top of the admin
   page (worker/system-admin.js), which can dismiss it or confirm it.
   Confirming (confirmClaim, bottom of this file) fills the next open spot
   (worker/roster.js). No push alert: alerts belong to a group, and a claim
   is platform business. Instead the platform admin gets an email
   (sendClaimAlert) with who it was and a link to the admin page, when the
   CLAIM_ALERT_EMAIL and RESEND_API_KEY worker secrets are set.

   Public and unauthenticated, so it's bounded every way it can be: our
   origins only, a group must have an open spot, a few claims per IP per
   hour, a cap on how many wait at once, and short plain-text fields.

   KV: claims@<group> -> [{ id, name, email, at }], newest first
       claimrate:<ip>  -> count, expiring after an hour
   ============================================================ */
import { GROUPS, GROUP_DOMAIN, applyRoster } from '../js/groups.js';
import { effectiveDrafters, loadAssigned, saveAssigned } from './roster.js';
import { WELCOME_FROM } from './welcome-email.js';

const RESEND_SEND = 'https://api.resend.com/emails';

export const MAX_PENDING_CLAIMS = 25;
export const CLAIMS_PER_IP_PER_HOUR = 3;
export const CLAIM_LIMITS = { name: 40, email: 80 };
// Deliberately loose: something@something.tld. The point is a way to
// reach the person, not RFC 5322.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export async function handleClaim(request, env, group, headers, { isAllowedOrigin, json, waitUntil }){
  if(request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
  if(!isAllowedOrigin(request.headers.get('Origin') || '')) return new Response('Forbidden', { status: 403, headers });
  const open = (await effectiveDrafters(env, group)).filter(d => d.open).length;
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

  // After the response: the claim is already saved, and a Resend hiccup
  // shouldn't fail it or slow the landing page down.
  const alert = sendClaimAlert(env, group, entry, { pending: claims.length + 1, open });
  if(waitUntil) waitUntil(alert);
  else await alert;

  return json({ ok: true }, 200, headers);
}

export function claimAlertEnabled(env){
  return !!(env.RESEND_API_KEY && env.CLAIM_ALERT_EMAIL && EMAIL.test(env.CLAIM_ALERT_EMAIL));
}

// The admin page opens on this group (js/system-admin.js reads ?group=).
export function adminLink(group){
  return `https://${GROUP_DOMAIN}/admin?group=${encodeURIComponent(group)}`;
}

// The Resend message for a new claim, sent to `to`. Replies go to the
// person who claimed. Pure so tests/claims.test.mjs can run it.
export function claimAlertMessage(group, entry, { to, pending, open }){
  const groupName = GROUPS[group].name;
  const link = adminLink(group);
  const waiting = `${pending} claim${pending === 1 ? '' : 's'} waiting · ${open} spot${open === 1 ? '' : 's'} open`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  return {
    from: WELCOME_FROM,
    to: [to],
    reply_to: entry.email,
    subject: `${entry.name} claimed a spot in ${groupName}`,
    text: `${entry.name} (${entry.email}) claimed a spot in ${groupName}.\n${waiting}\n\nReview it: ${link}\n`,
    html: `<p><strong>${esc(entry.name)}</strong> (<a href="mailto:${esc(entry.email)}">${esc(entry.email)}</a>) claimed a spot in ${esc(groupName)}.</p>`
      + `<p style="color:#666">${esc(waiting)}</p>`
      + `<p><a href="${esc(link)}">Review it on the admin page</a></p>`
  };
}

// Best effort: never throws, and a claim stands whether or not it sends.
export async function sendClaimAlert(env, group, entry, counts){
  if(!claimAlertEnabled(env)) return false;
  try {
    const res = await fetch(RESEND_SEND, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(claimAlertMessage(group, entry, { to: env.CLAIM_ALERT_EMAIL, ...counts }))
    });
    if(!res.ok) console.warn('claim alert failed', res.status);
    return res.ok;
  } catch (e){
    console.warn('claim alert failed', e);
    return false;
  }
}

// The admin's edited name: one line, trimmed, capped like a claim's.
export function cleanName(name){
  return typeof name === 'string'
    ? name.replace(/[\s\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, CLAIM_LIMITS.name)
    : '';
}

// Confirming a claim (admin page): its person gets the next open spot
// (worker/roster.js) under `rawName`, and the claim is dropped.
// { drafter, name } or { error }: 'name' (blank), 'taken' (another drafter
// already has that name, which would make the name pickers ambiguous),
// 'claim' (already confirmed or dismissed), 'full' (no open spot left).
export async function confirmClaim(env, group, claimId, rawName){
  const name = cleanName(rawName);
  if(!name) return { error: 'name' };
  const [claims, assigned] = await Promise.all([loadClaims(env, group), loadAssigned(env, group)]);
  const claim = claims.find(c => c.id === claimId);
  if(!claim) return { error: 'claim' };
  const drafters = applyRoster(GROUPS[group].drafters, assigned);
  if(drafters.some(d => !d.open && d.name.toLowerCase() === name.toLowerCase())) return { error: 'taken' };
  const spot = drafters.find(d => d.open);
  if(!spot) return { error: 'full' };

  assigned[spot.id] = { name, email: claim.email || claim.contact || '', at: Date.now() };
  await saveAssigned(env, group, assigned);
  const rest = claims.filter(c => c.id !== claimId);
  if(rest.length) await env.LEAGUE_FACTS.put(claimsKey(group), JSON.stringify(rest));
  else await env.LEAGUE_FACTS.delete(claimsKey(group));
  return { drafter: spot.id, name };
}
