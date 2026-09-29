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
                                   alert devices and secrets (present or
                                   missing, never values)
     POST /api/admin/commissioner  { group } -> a 12-hour commissioner
                                   token for that group
                                   (worker/commissioner-token.js)
     POST /api/admin/push          { group, drafter, message } -> a test
                                   alert to one drafter's devices, or with
                                   drafter null an announcement to the
                                   whole group

   The room and key naming lives in rundown-proxy.js, which passes it in
   as `deps` rather than this module importing the entry point.
   ============================================================ */
import { GROUPS, GROUP_IDS, isKnownGroup, adminSecretName } from '../js/groups.js';
import { verifyAccessJwt } from './access-auth.js';
import { makeCommissionerToken, COMMISSIONER_TOKEN_TTL_MS } from './commissioner-token.js';
import { loadDevices, pushEnabled, pushToDrafters } from './web-push.js';

const DEV_ORIGIN = 'http://localhost:8934';
const MAX_MESSAGE_LENGTH = 200;

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

async function stubJson(stub, path){
  try {
    const res = await stub.fetch(new Request(`https://room${path}`));
    return res.ok ? await res.json() : null;
  } catch (e){
    return null;
  }
}

async function groupStatus(env, id, deps){
  const group = GROUPS[id];
  const [draft, chat, activity, drafters] = await Promise.all([
    stubJson(deps.draftRoomStub(new URL('https://room/?room=main'), env, id), '/status'),
    stubJson(deps.chatRoomStub(env, id), '/summary'),
    env.LEAGUE_FACTS.get(deps.activityKey(id), 'json'),
    Promise.all(group.drafters.map(async d => {
      const devices = await loadDevices(env, id, d.id);
      return {
        id: d.id,
        name: d.name,
        devices: devices.length,
        chat: devices.filter(x => x.prefs && x.prefs.chat).length,
        draft: devices.filter(x => x.prefs && x.prefs.draft).length,
        lastRegistered: devices.reduce((m, x) => Math.max(m, x.at || 0), 0) || null
      };
    }))
  ]);
  const events = activity && Array.isArray(activity.events) ? activity.events : [];
  return {
    id,
    name: group.name,
    commissionerPassword: !!env[adminSecretName(id)],
    draft,
    chat,
    activity: { events: events.length, lastTs: events.length ? events[0].ts : null },
    drafters
  };
}

async function handleStatus(env, deps, identity){
  return json({
    you: identity.email,
    platform: {
      secrets: {
        push: pushEnabled(env),
        gifs: !!env.KLIPY_APP_KEY,
        rundown: !!env.THERUNDOWN_API_KEY,
        sportsdb: !!env.SPORTSDB_API_KEY
      }
    },
    groups: await Promise.all(GROUP_IDS.map(id => groupStatus(env, id, deps)))
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

async function handleCommissioner(request, env){
  const body = await readBody(request);
  if(!body) return json({ error: 'bad_group' }, 400);
  const password = env[adminSecretName(body.group)];
  if(!password) return json({ error: 'no_password' }, 409);
  const expiresAt = Date.now() + COMMISSIONER_TOKEN_TTL_MS;
  return json({ token: await makeCommissionerToken(password, body.group, expiresAt), expiresAt });
}

async function handlePush(request, env){
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
  return json(await pushToDrafters(env, body.group, recipients, null, payload, { ttl: 24 * 60 * 60 }));
}

export async function handleSystemAdmin(request, url, env, deps){
  if(request.method === 'OPTIONS') return devCors(url, env, new Response(null, { status: 204 }));

  const identity = await adminIdentity(request, url, env);
  if(!identity){
    const configured = env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD;
    return devCors(url, env, json({ error: configured ? 'unauthorized' : 'access_not_configured' }, configured ? 401 : 503));
  }

  const route = url.pathname.slice('/api/admin'.length);
  let response;
  if(route === '/status' && request.method === 'GET'){
    response = await handleStatus(env, deps, identity);
  } else if(request.method === 'POST' && (route === '/commissioner' || route === '/push')){
    // The Access cookie rides along on any request to this origin, so a
    // write must come from the admin page itself, not another site.
    const origin = request.headers.get('Origin');
    if(origin !== url.origin && !(isDevBypass(url, env) && origin === DEV_ORIGIN)){
      response = json({ error: 'forbidden' }, 403);
    } else {
      response = route === '/commissioner' ? await handleCommissioner(request, env) : await handlePush(request, env);
    }
  } else {
    response = json({ error: 'not_found' }, 404);
  }
  return devCors(url, env, response);
}
