/* ============================================================
   INTEREST (/interest): someone on the landing page (js/landing.js) who
   isn't joining an open group yet says they're interested in Boxscore:
   name, email, whether they'd start a group or join one, and an optional
   note. Platform business, not a group's, so it's one list for the whole
   platform. It shows on the admin page's Platform view
   (worker/system-admin.js, js/system-admin.js), which can dismiss an
   entry once it's been followed up; the platform admin also gets an email
   for each one, the same way as spot claims (CLAIM_ALERT_EMAIL and
   RESEND_API_KEY, worker/claims.js).

   Public and unauthenticated, so it's bounded the same way as /claim: our
   origins only, a few per IP per hour, a cap on how many wait at once,
   and short plain-text fields.

   KV: interest          -> [{ id, name, email, kind, note, at }], newest first
       interestrate:<ip> -> count, expiring after an hour
   ============================================================ */
import { GROUP_DOMAIN } from '../js/groups.js';
import { claimAlertEnabled } from './claims.js';
import { WELCOME_FROM } from './welcome-email.js';

const RESEND_SEND = 'https://api.resend.com/emails';

export const INTEREST_KEY = 'interest';
export const MAX_PENDING_INTEREST = 100;
export const INTEREST_PER_IP_PER_HOUR = 3;
export const INTEREST_LIMITS = { name: 40, email: 80, note: 500 };
// What they'd like: start a group of their own, or join one.
export const INTEREST_KINDS = ['start', 'join'];
// Same loose check as worker/claims.js: a way to reach the person.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// { interest } with trimmed, length-capped text, or { error } naming the
// first missing or bad field ('name' or 'email'). The note keeps its line
// breaks (at most two in a row); everything else is one line. An unknown
// kind is 'start'. Pure so tests/interest.test.mjs can run it.
export function parseInterest(body){
  if(!body || typeof body !== 'object') return { error: 'name' };
  const line = (v, max) => typeof v === 'string'
    ? v.replace(/[\s\u0000-\u001F\u007F]+/g, ' ').trim().slice(0, max)
    : '';
  const name = line(body.name, INTEREST_LIMITS.name);
  if(!name) return { error: 'name' };
  const email = line(body.email, INTEREST_LIMITS.email).replace(/ /g, '');
  if(!EMAIL.test(email)) return { error: 'email' };
  const note = typeof body.note === 'string'
    ? body.note.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000B-\u001F\u007F]+/g, ' ')
      .split('\n').map(l => l.replace(/ +/g, ' ').trim()).join('\n')
      .replace(/\n{3,}/g, '\n\n').trim().slice(0, INTEREST_LIMITS.note)
    : '';
  const kind = INTEREST_KINDS.includes(body.kind) ? body.kind : 'start';
  return { interest: { name, email, kind, note } };
}

export async function loadInterest(env){
  const stored = await env.LEAGUE_FACTS.get(INTEREST_KEY, 'json');
  return Array.isArray(stored) ? stored : [];
}

export async function dismissInterest(env, id){
  const list = await loadInterest(env);
  const kept = list.filter(e => e.id !== id);
  if(kept.length === list.length) return null;
  if(kept.length) await env.LEAGUE_FACTS.put(INTEREST_KEY, JSON.stringify(kept));
  else await env.LEAGUE_FACTS.delete(INTEREST_KEY);
  return list.find(e => e.id === id);
}

// Close enough for a nuisance cap (see worker/claims.js).
async function overRateLimit(env, request){
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const key = `interestrate:${ip}`;
  const count = Number(await env.LEAGUE_FACTS.get(key)) || 0;
  if(count >= INTEREST_PER_IP_PER_HOUR) return true;
  await env.LEAGUE_FACTS.put(key, String(count + 1), { expirationTtl: 60 * 60 });
  return false;
}

export async function handleInterest(request, env, headers, { isAllowedOrigin, json, waitUntil }){
  if(request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
  if(!isAllowedOrigin(request.headers.get('Origin') || '')) return new Response('Forbidden', { status: 403, headers });

  let parsed;
  try { parsed = parseInterest(await request.json()); } catch (e){ parsed = { error: 'name' }; }
  if(parsed.error) return json({ error: parsed.error }, 400, headers);

  const list = await loadInterest(env);
  if(list.length >= MAX_PENDING_INTEREST) return json({ error: 'busy' }, 429, headers);
  if(await overRateLimit(env, request)) return json({ error: 'rate' }, 429, headers);

  const entry = { id: crypto.randomUUID(), ...parsed.interest, at: Date.now() };
  await env.LEAGUE_FACTS.put(INTEREST_KEY, JSON.stringify([entry, ...list]));

  // After the response: it's saved, and a Resend hiccup shouldn't fail it.
  const alert = sendInterestAlert(env, entry, list.length + 1);
  if(waitUntil) waitUntil(alert);
  else await alert;

  return json({ ok: true }, 200, headers);
}

// The admin page's Platform view (no ?group=).
export const PLATFORM_ADMIN_LINK = `https://${GROUP_DOMAIN}/admin?group=platform`;

const KIND_TEXT = { start: 'wants to start a group', join: 'wants to join a group' };

// The Resend message for a new entry, sent to `to`. Replies go to the
// person. Pure so tests/interest.test.mjs can run it.
export function interestAlertMessage(entry, { to, pending }){
  const waiting = `${pending} ${pending === 1 ? 'person' : 'people'} on the list`;
  const what = KIND_TEXT[entry.kind] || KIND_TEXT.start;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const note = entry.note ? `\n\n"${entry.note}"` : '';
  return {
    from: WELCOME_FROM,
    to: [to],
    reply_to: entry.email,
    subject: `${entry.name} is interested in Boxscore`,
    text: `${entry.name} (${entry.email}) ${what}.${note}\n\n${waiting}\nSee them all: ${PLATFORM_ADMIN_LINK}\n`,
    html: `<p><strong>${esc(entry.name)}</strong> (<a href="mailto:${esc(entry.email)}">${esc(entry.email)}</a>) ${what}.</p>`
      + (entry.note ? `<blockquote style="margin:0 0 12px;padding-left:12px;border-left:3px solid #ddd;color:#444">${esc(entry.note).replace(/\n/g, '<br>')}</blockquote>` : '')
      + `<p style="color:#666">${esc(waiting)}</p>`
      + `<p><a href="${esc(PLATFORM_ADMIN_LINK)}">See them on the admin page</a></p>`
  };
}

// Best effort: never throws, and the entry stands whether or not it sends.
export async function sendInterestAlert(env, entry, pending){
  if(!claimAlertEnabled(env)) return false;
  try {
    const res = await fetch(RESEND_SEND, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(interestAlertMessage(entry, { to: env.CLAIM_ALERT_EMAIL, pending }))
    });
    if(!res.ok) console.warn('interest alert failed', res.status);
    return res.ok;
  } catch (e){
    console.warn('interest alert failed', e);
    return false;
  }
}
