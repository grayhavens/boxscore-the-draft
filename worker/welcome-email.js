/* ============================================================
   WELCOME EMAIL: the admin page (js/system-admin.js) sends a group's
   people a welcome email once their spots are filled. A confirmed spot's
   email comes from its claim (the roster@<group> record,
   worker/roster.js). A spot named in js/groups.js gets one only if the
   admin adds it, kept in KV rather than that public file.

   Sent through Resend (RESEND_API_KEY worker secret) from
   admin@boxscore.space, one email per person so nobody sees the others'
   addresses, all in one batch call. Replies go to the admin's own
   Cloudflare Access email.

   The admin page writes the subject and body. {name}, {group} and {link}
   are filled in per person here; the body is plain text, sent as-is (plus
   the app link) and in the Boxscore-themed HTML of js/welcome-template.js.

   KV: welcome@<group> -> { <drafterId>: epoch ms last sent }, so the
   page can offer the email to only the people who haven't had it.
       emails@<group>  -> { <drafterId>: email } for spots named in
                          js/groups.js

   Routes (admin, worker/system-admin.js):
     POST /api/admin/welcome { group, drafters, subject, body, test }
       test: true sends one copy, as the first drafter, to the admin only.
     POST /api/admin/claims/confirm with welcome: { subject, body } sends
       it to the person just confirmed, in the same request.
     POST /api/admin/email { group, drafter, email } -> set or ('') clear
       a named spot's email
   ============================================================ */
import { GROUPS, GROUP_DOMAIN, isKnownGroup } from '../js/groups.js';
import { welcomeHtml, welcomeText } from '../js/welcome-template.js';

const RESEND_BATCH = 'https://api.resend.com/emails/batch';
export const WELCOME_FROM = 'Boxscore <admin@boxscore.space>';
export const WELCOME_LIMITS = { subject: 120, body: 5000 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function welcomeKey(group){
  return `welcome@${group}`;
}

export function loadWelcomed(env, group){
  return loadRecord(env, welcomeKey(group));
}

// A released spot (Undo on the admin page) forgets its welcome, so whoever
// is confirmed into it next isn't listed as already welcomed.
export async function clearWelcomed(env, group, drafterId){
  const welcomed = await loadWelcomed(env, group);
  if(!(drafterId in welcomed)) return;
  delete welcomed[drafterId];
  if(Object.keys(welcomed).length) await env.LEAGUE_FACTS.put(welcomeKey(group), JSON.stringify(welcomed));
  else await env.LEAGUE_FACTS.delete(welcomeKey(group));
}

export function emailsKey(group){
  return `emails@${group}`;
}

async function loadRecord(env, key){
  const stored = await env.LEAGUE_FACTS.get(key, 'json');
  return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
}

export function loadEmails(env, group){
  return loadRecord(env, emailsKey(group));
}

// Everyone in the group who can be emailed, { <drafterId>: { name, email } }:
// named spots with an added email, then confirmed spots with the claim's.
export function welcomeContacts(groupId, assigned, emails){
  const contacts = {};
  for(const d of GROUPS[groupId].drafters){
    if(!d.open && EMAIL.test(emails[d.id] || '')) contacts[d.id] = { name: d.name, email: emails[d.id] };
    const a = d.open && assigned[d.id];
    if(a && EMAIL.test(a.email || '')) contacts[d.id] = { name: a.name, email: a.email };
  }
  return contacts;
}

// Only a spot named in js/groups.js; a confirmed spot's email is its claim's.
export async function setDrafterEmail(env, groupId, drafterId, email){
  if(!isKnownGroup(groupId)) return { error: 'bad_group' };
  const spot = GROUPS[groupId].drafters.find(d => d.id === drafterId);
  if(!spot || spot.open) return { error: 'bad_drafter' };
  const value = typeof email === 'string' ? email.trim().replace(/ /g, '').slice(0, 80) : '';
  if(value && !EMAIL.test(value)) return { error: 'email' };
  const emails = await loadEmails(env, groupId);
  if(value) emails[drafterId] = value;
  else delete emails[drafterId];
  if(Object.keys(emails).length) await env.LEAGUE_FACTS.put(emailsKey(groupId), JSON.stringify(emails));
  else await env.LEAGUE_FACTS.delete(emailsKey(groupId));
  return { ok: true, email: value };
}

export function welcomeEnabled(env){
  return !!env.RESEND_API_KEY;
}

export function fillTemplate(text, vars){
  return text.replace(/\{(name|group|link)\}/g, (_, k) => vars[k] ?? '');
}

// One Resend message per recipient ({ name, email }), templates filled.
export function buildMessages(groupId, recipients, { subject, body, replyTo }){
  const vars = { group: GROUPS[groupId].name, link: `https://${groupId}.${GROUP_DOMAIN}` };
  return recipients.map(r => {
    const filled = fillTemplate(body, { ...vars, name: r.name });
    const filledSubject = fillTemplate(subject, { ...vars, name: r.name });
    const parts = { groupName: vars.group, link: vars.link, subject: filledSubject, text: filled };
    return {
      from: WELCOME_FROM,
      to: [r.email],
      subject: filledSubject,
      text: welcomeText(parts),
      html: welcomeHtml(parts),
      ...(replyTo ? { reply_to: replyTo } : {})
    };
  });
}

// { ok, sent } or { error }. `contacts` is welcomeContacts().
export async function sendWelcome(env, groupId, contacts, request, adminEmail){
  if(!welcomeEnabled(env)) return { error: 'no_key' };
  const subject = typeof request.subject === 'string' ? request.subject.trim().slice(0, WELCOME_LIMITS.subject) : '';
  const body = typeof request.body === 'string' ? request.body.trim().slice(0, WELCOME_LIMITS.body) : '';
  if(!subject || !body) return { error: 'empty' };
  const ids = Array.isArray(request.drafters) ? [...new Set(request.drafters)] : [];
  const people = ids.map(id => contacts[id] ? { id, ...contacts[id] } : null);
  if(!people.length || people.includes(null)) return { error: 'bad_drafters' };
  const replyTo = EMAIL.test(adminEmail || '') ? adminEmail : null;

  const test = !!request.test;
  if(test && !replyTo) return { error: 'no_admin_email' };
  const recipients = test ? [{ name: people[0].name, email: replyTo }] : people;
  const messages = buildMessages(groupId, recipients, { subject: test ? `[Test] ${subject}` : subject, body, replyTo });

  let res;
  try {
    res = await fetch(RESEND_BATCH, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(messages)
    });
  } catch (e){
    return { error: 'unreachable' };
  }
  if(!res.ok){
    const detail = await res.json().catch(() => ({}));
    return { error: 'resend', detail: String(detail.message || res.status).slice(0, 200) };
  }
  if(!test){
    const welcomed = await loadWelcomed(env, groupId);
    const now = Date.now();
    for(const p of people) welcomed[p.id] = now;
    await env.LEAGUE_FACTS.put(welcomeKey(groupId), JSON.stringify(welcomed));
  }
  return { ok: true, sent: messages.length, test };
}
