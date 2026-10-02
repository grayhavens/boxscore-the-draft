/* ============================================================
   WEB PUSH — draft "you're on the clock", chat, chat mention and "my points" alerts
   (worker/points-alert.js) that reach a drafter's phone even when
   Boxscore isn't open (js/push.js subscribes, sw.js shows them).

   Standard Web Push, written against WebCrypto with no dependencies
   (the worker has no package.json):
   - VAPID (RFC 8292): every push carries a short-lived ES256 JWT signed
     with the app's private key, so push services know it's us. The key
     pair lives in two worker secrets, VAPID_PUBLIC_KEY and
     VAPID_PRIVATE_KEY (base64url; `node tools/vapid-keys.mjs` makes a
     pair). No secrets = push is off: /push/config answers null and the
     Settings toggle stays hidden.
   - Payload encryption (RFC 8291, aes128gcm): the push service only ever
     sees ciphertext, readable by the one browser that subscribed.

   Subscriptions are stored per drafter in LEAGUE_FACTS KV (a drafter can
   have a few devices), keyed like every other group-owned blob: The
   Draft's are `push:<drafter>`, another group's `push@<group>:<drafter>`.
   Same no-auth trust tier as favorites: whoever says they're a drafter
   can register a device for that drafter. Endpoints are pinned to the
   big browser push services, so the worker never POSTs anywhere else.

   Pure module (WebCrypto + fetch + KV only) so the chat and draft Durable
   Objects can import it, and Node tests can check the crypto
   (tests/web-push.test.mjs).
   ============================================================ */
import { LEGACY_GROUP_ID } from '../js/groups.js';

export const MAX_DEVICES_PER_DRAFTER = 5;
const JWT_LIFETIME_S = 12 * 60 * 60;
const RECORD_SIZE = 4096;

// Apple (iOS/macOS Safari), Google (Chrome, Edge on Android), Mozilla
// (Firefox) and Microsoft (Edge on Windows).
const PUSH_HOSTS = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

export const PUSH_KINDS = ['chat', 'draft', 'points', 'mention'];

export function pushKvKey(group, drafterId){
  return `${group === LEGACY_GROUP_ID ? 'push' : `push@${group}`}:${drafterId}`;
}

// ---- base64url ----

export function b64urlEncode(bytes){
  let s = '';
  for(const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(str){
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for(let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

function concat(...parts){
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for(const p of parts){ out.set(p, at); at += p.length; }
  return out;
}

const utf8 = s => new TextEncoder().encode(s);

// ---- Subscriptions ----

// A browser PushSubscription's JSON, checked and flattened. null for
// anything that isn't one, or points at a host that isn't a push service.
export function parseSubscription(sub){
  if(!sub || typeof sub !== 'object' || typeof sub.endpoint !== 'string' || sub.endpoint.length > 1000) return null;
  let url;
  try { url = new URL(sub.endpoint); } catch (e){ return null; }
  if(url.protocol !== 'https:' || !PUSH_HOSTS.some(re => re.test(url.hostname))) return null;
  const keys = sub.keys || {};
  const ok = (v, len) => {
    if(typeof v !== 'string' || !/^[A-Za-z0-9_-]+={0,2}$/.test(v)) return false;
    try { return b64urlDecode(v.replace(/=+$/, '')).length === len; } catch (e){ return false; }
  };
  if(!ok(keys.p256dh, 65) || !ok(keys.auth, 16)) return null;
  return { endpoint: sub.endpoint, p256dh: keys.p256dh.replace(/=+$/, ''), auth: keys.auth.replace(/=+$/, '') };
}

// `mention` is left out when the device never set it (an app version
// from before mentions), so wantsAlert can tell "never asked" from "off".
export function parsePrefs(prefs){
  const out = {};
  PUSH_KINDS.forEach(k => { out[k] = !!(prefs && prefs[k]); });
  if(!prefs || typeof prefs.mention !== 'boolean') delete out.mention;
  return out;
}

// Whether a device with these prefs gets a `kind` alert. Mentions are on
// for any device with alerts on that never chose: being tagged is a
// direct ask, and every device registered before mentions existed would
// otherwise miss them until someone found the new switch.
export function wantsAlert(prefs, kind){
  if(!prefs) return false;
  if(kind === 'mention' && typeof prefs.mention !== 'boolean') return Object.values(prefs).some(Boolean);
  return !!prefs[kind];
}

export async function loadDevices(env, group, drafterId){
  const stored = await env.LEAGUE_FACTS.get(pushKvKey(group, drafterId), 'json');
  return Array.isArray(stored) ? stored : [];
}

async function saveDevices(env, group, drafterId, devices){
  const key = pushKvKey(group, drafterId);
  if(devices.length) await env.LEAGUE_FACTS.put(key, JSON.stringify(devices));
  else await env.LEAGUE_FACTS.delete(key);
}

// Adds or updates this device (matched by endpoint), newest first, and
// drops the oldest past MAX_DEVICES_PER_DRAFTER.
export async function saveDevice(env, group, drafterId, sub, prefs){
  const devices = (await loadDevices(env, group, drafterId)).filter(d => d.endpoint !== sub.endpoint);
  devices.unshift({ ...sub, prefs, at: Date.now() });
  await saveDevices(env, group, drafterId, devices.slice(0, MAX_DEVICES_PER_DRAFTER));
}

export async function removeDevice(env, group, drafterId, endpoint){
  const devices = await loadDevices(env, group, drafterId);
  const kept = devices.filter(d => d.endpoint !== endpoint);
  if(kept.length !== devices.length) await saveDevices(env, group, drafterId, kept);
}

// For the admin page (worker/system-admin.js), which lists devices without
// ever seeing an endpoint: a short id hashed from it, and which push
// service it's on (so which kind of device it is).
export async function deviceId(endpoint){
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint)));
  return [...hash.slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const PUSH_SERVICES = [
  [/(^|\.)push\.apple\.com$/, 'Apple'],
  [/(^|\.)googleapis\.com$/, 'Chrome'],
  [/(^|\.)mozilla\.com$/, 'Firefox'],
  [/(^|\.)notify\.windows\.com$/, 'Windows']
];

export function pushService(endpoint){
  let hostname = '';
  try { hostname = new URL(endpoint).hostname; } catch (e){ return 'Unknown'; }
  const hit = PUSH_SERVICES.find(([re]) => re.test(hostname));
  return hit ? hit[1] : hostname;
}

// ---- VAPID ----

async function vapidSigningKey(env){
  const pub = b64urlDecode(env.VAPID_PUBLIC_KEY);
  return crypto.subtle.importKey('jwk', {
    kty: 'EC', crv: 'P-256', ext: true,
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: env.VAPID_PRIVATE_KEY
  }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

// WebCrypto's ECDSA signature is already raw r||s, which is exactly the
// JWS ES256 encoding.
export async function vapidAuthorization(env, endpoint, nowS = Math.floor(Date.now() / 1000)){
  const header = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64urlEncode(utf8(JSON.stringify({
    aud: new URL(endpoint).origin,
    exp: nowS + JWT_LIFETIME_S,
    sub: env.VAPID_SUBJECT || 'https://boxscore.space'
  })));
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidSigningKey(env), utf8(unsigned));
  return `vapid t=${unsigned}.${b64urlEncode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

// ---- Payload encryption (RFC 8291 / RFC 8188 aes128gcm) ----

async function hkdf(salt, ikm, info, bytes){
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

// One record, no padding: the payloads here are a few hundred bytes.
// `salt` and `localKeys` are only passed by tests, to get fixed output.
export async function encryptPayload(device, plaintext, { salt, localKeys } = {}){
  const uaPublic = b64urlDecode(device.p256dh);
  const authSecret = b64urlDecode(device.auth);
  salt = salt || crypto.getRandomValues(new Uint8Array(16));
  localKeys = localKeys || await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', localKeys.publicKey));

  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, localKeys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(utf8('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12);

  const body = typeof plaintext === 'string' ? utf8(plaintext) : plaintext;
  if(body.length + 17 > RECORD_SIZE) throw new Error('push payload too large');
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 marks the last (only) record.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, concat(body, new Uint8Array([2]))));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, RECORD_SIZE);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

// ---- Sending ----

export function pushEnabled(env){
  return !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.LEAGUE_FACTS);
}

// POSTs one push. Resolves to the push service's status (201 = accepted;
// 404/410 = that subscription is gone for good).
export async function sendPush(env, device, payload, { ttl = 60 * 60, urgency = 'high', topic } = {}){
  const headers = {
    'Authorization': await vapidAuthorization(env, device.endpoint),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    'TTL': String(ttl),
    'Urgency': urgency
  };
  // A queued push with the same topic replaces the older one at the push
  // service, so a phone that was offline gets one, not twenty.
  if(topic) headers['Topic'] = topic;
  const res = await fetch(device.endpoint, { method: 'POST', headers, body: await encryptPayload(device, JSON.stringify(payload)) });
  return res.status;
}

// Sends `payload` to every device of every drafter in `drafterIds` that
// opted into `kind` (every registered device when `kind` is null, for the
// system admin's test alerts and announcements), and forgets devices the
// push service says are gone. Resolves to counts for the admin page.
// Never throws: an alert failing must not break a chat send or a pick.
export async function pushToDrafters(env, group, drafterIds, kind, payload, options){
  const stats = { devices: 0, sent: 0, failed: 0, removed: 0 };
  if(!pushEnabled(env) || !drafterIds.length) return stats;
  await Promise.all(drafterIds.map(async drafterId => {
    try {
      const devices = await loadDevices(env, group, drafterId);
      const gone = [];
      await Promise.all(devices.filter(d => kind === null || wantsAlert(d.prefs, kind)).map(async device => {
        stats.devices += 1;
        try {
          const status = await sendPush(env, device, payload, options);
          if(status >= 200 && status < 300) stats.sent += 1;
          else stats.failed += 1;
          if(status === 404 || status === 410) gone.push(device.endpoint);
        } catch (e){
          stats.failed += 1;
          console.error('[push] send failed', e);
        }
      }));
      if(gone.length){
        stats.removed += gone.length;
        await saveDevices(env, group, drafterId, (await loadDevices(env, group, drafterId)).filter(d => !gone.includes(d.endpoint)));
      }
    } catch (e){
      console.error('[push] drafter failed', drafterId, e);
    }
  }));
  return stats;
}
