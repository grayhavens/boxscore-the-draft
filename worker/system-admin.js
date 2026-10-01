/* ============================================================
   SYSTEM ADMIN API (/api/admin/*): the platform owner's view across every
   group, used by the admin page (admin.html, js/system-admin.js) at
   boxscore.space/admin.

   Reached as a worker route on boxscore.space/api/admin/* (wrangler.toml),
   same origin as the page, behind Cloudflare Access. Every request must
   carry a valid Access JWT (worker/access-auth.js) — the routes also exist
   on the public *.workers.dev address, where they answer 401. Locally,
   ADMIN_DEV_BYPASS=1 skips Access (the admin-worker config in
   .claude/launch.json sets it) — but only while ACCESS_AUD is unset, so
   it can't open the door on the deployed worker, which has Access set up.

     GET  /api/admin/status        every group's draft, chat, activity,
                                   points history, alert devices and
                                   secrets (present or missing, never
                                   values), the version this worker was
                                   deployed with, and the admin log
     GET  /api/admin/chat/recent?group=  the chat room's latest messages
     POST /api/admin/commissioner  { group } -> a 12-hour commissioner
                                   token for that group
                                   (worker/commissioner-token.js)
     POST /api/admin/push          { group, drafter, message } -> a test
                                   alert to one drafter's devices, or with
                                   drafter null an announcement to the
                                   whole group
     POST /api/admin/push/remove   { group, drafter, device } -> drop one
                                   alert device (its id from /status)
     POST /api/admin/claims/dismiss { group, id } -> drop one spot claim
                                   (worker/claims.js); /status lists them
     POST /api/admin/claims/confirm { group, id, name, welcome } -> give the
                                   claim's person the next open spot under
                                   `name`; with welcome { subject, body }
                                   they're sent the welcome email too, and
                                   the answer's `welcome` says how it went
     POST /api/admin/roster/add    { group, name, email, welcome } -> the
                                   same with no claim
     POST /api/admin/roster/edit   { group, drafter, name, email } -> fix a
                                   confirmed spot's name or email
     POST /api/admin/roster/release { group, drafter } -> undo a confirmed
                                   spot (worker/roster.js)
     POST /api/admin/welcome       { group, drafters, subject, body, test }
                                   -> the welcome email to confirmed people
                                   (worker/welcome-email.js)
     POST /api/admin/access        { group, action } -> the group's invite
                                   code: rotate (new code, soft mode),
                                   enforce, soften or clear
                                   (worker/access-code.js); /status carries it
     POST /api/admin/email         { group, drafter, email } -> a named
                                   spot's email, for the welcome email
     POST /api/admin/chat/delete   { group, id } -> delete a chat message
                                   for everyone (worker/chat-room.js)

   Every POST that changes or sends something adds a line to the admin
   log (worker/admin-log.js).

   The room and key naming lives in rundown-proxy.js, which passes it in
   as `deps` rather than this module importing the entry point.
   ============================================================ */
import { GROUPS, GROUP_IDS, isKnownGroup, adminSecretName } from '../js/groups.js';
import { APP_VERSION } from '../js/version.js';
import { verifyAccessJwt } from './access-auth.js';
import { makeCommissionerToken, COMMISSIONER_TOKEN_TTL_MS } from './commissioner-token.js';
import { loadDevices, removeDevice, deviceId, pushService, pushEnabled, pushToDrafters } from './web-push.js';
import { claimAlertEnabled } from './claims.js';
import { loadAccess, changeAccess } from './access-code.js';
import { loadWelcomed, clearWelcomed, loadEmails, welcomeContacts, sendWelcome, setDrafterEmail, welcomeEnabled } from './welcome-email.js';
import { historyKey } from './points-history.js';
import { loadAdminLog, logAdminAction } from './admin-log.js';

const DEV_ORIGIN = 'http://localhost:8934';
const MAX_MESSAGE_LENGTH = 200;
const STATUS_LOG_LINES = 100;
const POST_ROUTES = ['/commissioner', '/push', '/push/remove', '/claims/dismiss', '/claims/confirm', '/roster/add', '/roster/edit',
  '/roster/release', '/welcome', '/email', '/access', '/chat/delete'];

function json(data, status = 200){
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// Not a hostname check: `wrangler dev` reports the route's host
// (boxscore.space) for these requests, not localhost.
function isDevBypass(url, env){
  return env.ADMIN_DEV_BYPASS === '1' && !env.ACCESS_AUD;
}

// Local dev's admin page is a different origin from `wrangler dev`, so it
// needs CORS; production is same-origin and gets none.
function devCors(url, env, response){
  if(!isDevBypass(url, env)) return response;
  response.headers.set('Access-Control-Allow-Origin', DEV_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

async function adminIdentity(request, url, env){
  if(isDevBypass(url, env)) return { email: 'local dev' };
  const payload = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), {
    teamDomain: env.ACCESS_TEAM_DOMAIN, aud: env.ACCESS_AUD
  });
  return payload ? { email: payload.email || '' } : null;
}

async function stubJson(stub, path, body){
  try {
    const res = await stub.fetch(new Request(`https://room${path}`, body ? { method: 'POST', body: JSON.stringify(body) } : undefined));
    return res.ok ? await res.json() : null;
  } catch (e){
    return null;
  }
}

// The group's Race chart history (worker/points-history.js): its newest
// season's day count and last day, so the page can tell whether samples
// are still landing. Null when there's none yet.
async function historyStatus(env, prefix){
  try {
    const { keys } = await env.LEAGUE_FACTS.list({ prefix: `${prefix}:` });
    const season = keys.map(k => k.name.slice(prefix.length + 1)).filter(s => /^\d{4}$/.test(s)).sort().pop();
    if(!season) return null;
    const stored = await env.LEAGUE_FACTS.get(historyKey(prefix, season), 'json');
    const days = stored && Array.isArray(stored.days) ? stored.days : [];
    return { season, days: days.length, lastDay: days.length ? days[days.length - 1].d : null };
  } catch (e){
    return null;
  }
}

async function groupStatus(env, id, deps){
  const group = GROUPS[id];
  const [draft, chat, activity, claims, assigned, roster, welcomed, emails, access, history] = await Promise.all([
    stubJson(deps.draftRoomStub(new URL('https://room/?room=main'), env, id), '/status'),
    stubJson(deps.chatRoomStub(env, id), '/summary'),
    env.LEAGUE_FACTS.get(deps.activityKey(id), 'json'),
    deps.loadClaims(env, id),
    deps.loadAssigned(env, id),
    deps.effectiveDrafters(env, id),
    loadWelcomed(env, id),
    loadEmails(env, id),
    loadAccess(env, id, 0),
    historyStatus(env, deps.historyPrefix(id))
  ]);
  const drafters = await Promise.all(roster.map(async d => {
    const devices = await loadDevices(env, id, d.id);
    return {
      id: d.id,
      name: d.name,
      open: !!d.open,
      devices: devices.length,
      chat: devices.filter(x => x.prefs && x.prefs.chat).length,
      draft: devices.filter(x => x.prefs && x.prefs.draft).length,
      points: devices.filter(x => x.prefs && x.prefs.points).length,
      lastRegistered: devices.reduce((m, x) => Math.max(m, x.at || 0), 0) || null,
      // Each device, by a hashed id: never its endpoint.
      deviceList: await Promise.all(devices.map(async x => ({
        id: await deviceId(x.endpoint),
        service: pushService(x.endpoint),
        at: x.at || null,
        chat: !!(x.prefs && x.prefs.chat),
        draft: !!(x.prefs && x.prefs.draft),
        points: !!(x.prefs && x.prefs.points)
      })))
    };
  }));
  // Confirmed spots, with the placeholder each one filled, for Undo.
  const confirmed = Object.entries(assigned)
    .map(([drafter, a]) => ({ drafter, name: a.name, email: a.email || '', at: a.at || null,
      spot: (group.drafters.find(d => d.id === drafter) || {}).name || drafter }))
    .sort((a, b) => (b.at || 0) - (a.at || 0));
  const events = activity && Array.isArray(activity.events) ? activity.events : [];
  return {
    id,
    name: group.name,
    commissionerPassword: !!env[adminSecretName(id)],
    access: access ? { code: access.code, enforce: access.enforce, at: access.at } : null,
    draft,
    chat,
    activity: {
      events: events.length,
      lastTs: events.length ? events[0].ts : null,
      // When an app last landed a scoring snapshot: stale means nobody's
      // opened the app, or saving it is failing.
      snapshotAt: activity && activity.snapshot ? activity.snapshot.dataAt : null
    },
    history,
    claims,
    confirmed,
    drafters,
    // The welcome email: who can get it and when each last did, plus the
    // spots named in js/groups.js, whose email the admin adds.
    welcome: {
      contacts: Object.entries(welcomeContacts(id, assigned, emails))
        .map(([drafter, c]) => ({ drafter, name: c.name, email: c.email, welcomedAt: welcomed[drafter] || null })),
      named: group.drafters.filter(d => !d.open).map(d => ({ drafter: d.id, name: d.name, email: emails[d.id] || '' }))
    }
  };
}

async function handleStatus(env, deps, identity){
  const [groups, log] = await Promise.all([
    Promise.all(GROUP_IDS.map(id => groupStatus(env, id, deps))),
    loadAdminLog(env)
  ]);
  return json({
    you: identity.email,
    platform: {
      workerVersion: APP_VERSION,
      secrets: {
        push: pushEnabled(env),
        gifs: !!env.KLIPY_APP_KEY,
        rundown: !!env.THERUNDOWN_API_KEY,
        sportsdb: !!env.SPORTSDB_API_KEY,
        email: welcomeEnabled(env),
        claimAlerts: claimAlertEnabled(env)
      }
    },
    groups,
    log: log.slice(0, STATUS_LOG_LINES)
  });
}

async function readBody(request){
  try {
    const body = await request.json();
    return body && typeof body === 'object' && isKnownGroup(body.group) ? body : null;
  } catch (e){
    return null;
  }
}

async function drafterName(env, deps, group, drafterId){
  const d = (await deps.effectiveDrafters(env, group)).find(x => x.id === drafterId);
  return d ? d.name : drafterId;
}

const spotName = (group, drafterId) => (GROUPS[group].drafters.find(d => d.id === drafterId) || {}).name || drafterId;
const sentLine = r => `sent to ${r.sent} of ${r.devices} device${r.devices === 1 ? '' : 's'}`;

async function handleCommissioner(request, env, log){
  const body = await readBody(request);
  if(!body) return json({ error: 'bad_group' }, 400);
  const password = env[adminSecretName(body.group)];
  if(!password) return json({ error: 'no_password' }, 409);
  const expiresAt = Date.now() + COMMISSIONER_TOKEN_TTL_MS;
  const access = await loadAccess(env, body.group, 0);
  await log(body.group, 'commissioner', 'Opened as commissioner');
  return json({ token: await makeCommissionerToken(password, body.group, expiresAt), expiresAt, code: access ? access.code : null });
}

const ACCESS_LOG = {
  rotate: (a, had) => had ? `New invite code ${a.code} (soft mode)` : `Made invite code ${a.code} (soft mode)`,
  enforce: () => 'Enforced the invite code',
  soften: () => 'Invite code back to soft mode',
  clear: () => 'Removed the invite code'
};

async function handleAccess(request, env, log){
  const body = await readBody(request);
  if(!body) return json({ error: 'bad_group' }, 400);
  const had = !!(await loadAccess(env, body.group, 0));
  const result = await changeAccess(env, body.group, body.action);
  if(!result.error) await log(body.group, 'access', ACCESS_LOG[body.action](result.access, had));
  return json(result, result.error ? (result.error === 'no_code' ? 409 : 400) : 200);
}

// The welcome email that can ride on filling a spot (confirm or add). The
// contact is built from the fill's own result rather than re-read from
// KV, which may not show the new spot yet. A failed send leaves the spot
// filled and the person unwelcomed, so the page still offers it.
async function welcomeWithSpot(env, group, result, welcome, identity){
  if(!welcome || typeof welcome !== 'object') return null;
  const contacts = welcomeContacts(group, { [result.drafter]: { name: result.name, email: result.email } }, {});
  return contacts[result.drafter]
    ? sendWelcome(env, group, contacts, { drafters: [result.drafter], subject: welcome.subject, body: welcome.body }, identity.email)
    : { error: 'no_email' };
}

const filledLine = (verb, group, r) =>
  `${verb} ${r.name}${r.email ? ` (${r.email})` : ''} as ${spotName(group, r.drafter)}`
  + (!r.welcome ? '' : r.welcome.ok ? ', welcome email sent' : ', welcome email failed');

async function handleConfirmClaim(request, env, deps, identity, log){
  const body = await readBody(request);
  if(!body || typeof body.id !== 'string') return json({ error: 'bad_request' }, 400);
  const result = await deps.confirmClaim(env, body.group, body.id, body.name);
  if(result.error) return json(result, 409);
  const welcome = await welcomeWithSpot(env, body.group, result, body.welcome, identity);
  if(welcome) result.welcome = welcome;
  await log(body.group, 'confirm', filledLine('Confirmed', body.group, result));
  return json(result);
}

async function handleAddPerson(request, env, deps, identity, log){
  const body = await readBody(request);
  if(!body) return json({ error: 'bad_request' }, 400);
  const result = await deps.addPerson(env, body.group, body.name, body.email);
  if(result.error) return json(result, result.error === 'full' || result.error === 'taken' ? 409 : 400);
  const welcome = await welcomeWithSpot(env, body.group, result, body.welcome, identity);
  if(welcome) result.welcome = welcome;
  await log(body.group, 'add', filledLine('Added', body.group, result));
  return json(result);
}

async function handleEditSpot(request, env, deps, log){
  const body = await readBody(request);
  if(!body || typeof body.drafter !== 'string') return json({ error: 'bad_request' }, 400);
  const result = await deps.editSpot(env, body.group, body.drafter, body.name, body.email);
  if(result.error) return json(result, result.error === 'taken' ? 409 : 400);
  const changes = [
    result.was.name !== result.name ? `renamed ${result.was.name} to ${result.name}` : '',
    result.was.email !== result.email ? `${result.name}'s email ${result.email ? `set to ${result.email}` : 'removed'}` : ''
  ].filter(Boolean);
  if(changes.length) await log(body.group, 'edit', changes.join('; ').replace(/^./, c => c.toUpperCase()));
  return json(result);
}

async function handleReleaseSpot(request, env, deps, log){
  const body = await readBody(request);
  if(!body || typeof body.drafter !== 'string') return json({ error: 'bad_request' }, 400);
  const person = (await deps.loadAssigned(env, body.group))[body.drafter];
  const ok = await deps.releaseSpot(env, body.group, body.drafter);
  // The spot's next person hasn't had the welcome email.
  if(ok){
    await clearWelcomed(env, body.group, body.drafter);
    await log(body.group, 'release', `Took ${person ? person.name : body.drafter} out; ${spotName(body.group, body.drafter)} is open again`);
  }
  return json({ ok });
}

async function handleDismissClaim(request, env, deps, log){
  const body = await readBody(request);
  if(!body || typeof body.id !== 'string') return json({ error: 'bad_request' }, 400);
  const claim = (await deps.loadClaims(env, body.group)).find(c => c.id === body.id);
  const ok = await deps.dismissClaim(env, body.group, body.id);
  if(ok && claim) await log(body.group, 'dismiss', `Dismissed ${claim.name}'s claim${claim.email ? ` (${claim.email})` : ''}`);
  return json({ ok });
}

async function handleWelcome(request, env, deps, identity, log){
  const body = await readBody(request);
  if(!body) return json({ error: 'bad_group' }, 400);
  const [assigned, emails] = await Promise.all([deps.loadAssigned(env, body.group), loadEmails(env, body.group)]);
  const contacts = welcomeContacts(body.group, assigned, emails);
  const result = await sendWelcome(env, body.group, contacts, body, identity.email);
  if(!result.error){
    const names = (Array.isArray(body.drafters) ? body.drafters : []).map(id => (contacts[id] || {}).name || id).join(', ');
    await log(body.group, 'welcome', body.test ? `Sent a test welcome email (written as ${names.split(', ')[0]})` : `Welcome email to ${names}`);
  }
  return json(result, result.error ? (result.error === 'resend' || result.error === 'unreachable' ? 502 : 409) : 200);
}

async function handleSetEmail(request, env, log){
  const body = await readBody(request);
  if(!body) return json({ error: 'bad_group' }, 400);
  const result = await setDrafterEmail(env, body.group, body.drafter, body.email);
  if(!result.error) await log(body.group, 'email', `${spotName(body.group, body.drafter)}'s email ${result.email ? `set to ${result.email}` : 'removed'}`);
  return json(result, result.error ? 400 : 200);
}

async function handlePush(request, env, deps, log){
  if(!pushEnabled(env)) return json({ error: 'push_off' }, 409);
  const body = await readBody(request);
  if(!body) return json({ error: 'bad_group' }, 400);
  const group = GROUPS[body.group];
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : '';
  const drafter = body.drafter === null || body.drafter === undefined ? null : body.drafter;
  if(drafter !== null && !group.drafters.some(d => d.id === drafter)) return json({ error: 'bad_drafter' }, 400);
  if(drafter === null && !message) return json({ error: 'empty' }, 400);

  const payload = drafter
    ? { kind: 'test', title: 'Boxscore', body: message || 'Test alert from the Boxscore admin.', url: './', tag: 'admin-test' }
    : { kind: 'announcement', title: group.name, body: message, url: './', tag: 'announcement' };
  const recipients = drafter ? [drafter] : group.drafters.map(d => d.id);
  const result = await pushToDrafters(env, body.group, recipients, null, payload, { ttl: 24 * 60 * 60 });
  await log(body.group, drafter ? 'test' : 'announce', drafter
    ? `Test alert to ${await drafterName(env, deps, body.group, drafter)}, ${sentLine(result)}`
    : `Announcement “${message}”, ${sentLine(result)}`);
  return json(result);
}

async function handleRemoveDevice(request, env, deps, log){
  const body = await readBody(request);
  if(!body || typeof body.drafter !== 'string' || typeof body.device !== 'string') return json({ error: 'bad_request' }, 400);
  const devices = await loadDevices(env, body.group, body.drafter);
  const ids = await Promise.all(devices.map(d => deviceId(d.endpoint)));
  const device = devices[ids.indexOf(body.device)];
  if(!device) return json({ ok: false });
  await removeDevice(env, body.group, body.drafter, device.endpoint);
  await log(body.group, 'device', `Removed ${await drafterName(env, deps, body.group, body.drafter)}'s ${pushService(device.endpoint)} alert device`);
  return json({ ok: true });
}

async function handleChatRecent(url, env, deps){
  const group = url.searchParams.get('group');
  if(!isKnownGroup(group)) return json({ error: 'bad_group' }, 400);
  const data = await stubJson(deps.chatRoomStub(env, group), '/recent');
  return data ? json(data) : json({ error: 'unreachable' }, 502);
}

async function handleChatDelete(request, env, deps, log){
  const body = await readBody(request);
  if(!body || !Number.isInteger(body.id)) return json({ error: 'bad_request' }, 400);
  const result = await stubJson(deps.chatRoomStub(env, body.group), '/delete', { id: body.id });
  if(!result) return json({ error: 'unreachable' }, 502);
  if(result.ok){
    const m = result.message;
    const text = m.text.length > 80 ? `${m.text.slice(0, 79)}…` : m.text;
    await log(body.group, 'chat', `Deleted ${await drafterName(env, deps, body.group, m.from)}'s chat message${text ? ` “${text}”` : ''}`);
  }
  return json({ ok: !!result.ok });
}

export async function handleSystemAdmin(request, url, env, deps){
  if(request.method === 'OPTIONS') return devCors(url, env, new Response(null, { status: 204 }));

  const identity = await adminIdentity(request, url, env);
  if(!identity){
    const configured = env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD;
    return devCors(url, env, json({ error: configured ? 'unauthorized' : 'access_not_configured' }, configured ? 401 : 503));
  }
  const log = (group, action, text) => logAdminAction(env, { who: identity.email, group, action, text });

  const route = url.pathname.slice('/api/admin'.length);
  let response;
  if(route === '/status' && request.method === 'GET'){
    response = await handleStatus(env, deps, identity);
  } else if(route === '/chat/recent' && request.method === 'GET'){
    response = await handleChatRecent(url, env, deps);
  } else if(request.method === 'POST' && POST_ROUTES.includes(route)){
    // The Access cookie rides along on any request to this origin, so a
    // write must come from the admin page itself, not another site.
    const origin = request.headers.get('Origin');
    if(origin !== url.origin && !(isDevBypass(url, env) && origin === DEV_ORIGIN)){
      response = json({ error: 'forbidden' }, 403);
    } else {
      response = route === '/commissioner' ? await handleCommissioner(request, env, log)
        : route === '/push' ? await handlePush(request, env, deps, log)
        : route === '/push/remove' ? await handleRemoveDevice(request, env, deps, log)
        : route === '/claims/confirm' ? await handleConfirmClaim(request, env, deps, identity, log)
        : route === '/roster/add' ? await handleAddPerson(request, env, deps, identity, log)
        : route === '/roster/edit' ? await handleEditSpot(request, env, deps, log)
        : route === '/roster/release' ? await handleReleaseSpot(request, env, deps, log)
        : route === '/welcome' ? await handleWelcome(request, env, deps, identity, log)
        : route === '/email' ? await handleSetEmail(request, env, log)
        : route === '/access' ? await handleAccess(request, env, log)
        : route === '/chat/delete' ? await handleChatDelete(request, env, deps, log)
        : await handleDismissClaim(request, env, deps, log);
    }
  } else {
    response = json({ error: 'not_found' }, 404);
  }
  return devCors(url, env, response);
}
