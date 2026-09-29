/* ============================================================
   COMMISSIONER SECRETS: a group's password, or a signed token for it.

   Every commissioner check (League Facts writes, /admin/verify, the draft
   room's `auth` frame) takes one opaque string from the client and asks
   checkCommissionerSecret whether it's good for that group. It's good if
   it's the group's password (ADMIN_PASSWORD / ADMIN_PASSWORD_<GROUP>), or
   a token the system admin page minted for that group.

   Token: `bxc1.<group>.<expiresAtMs>.<sig>`, sig = HMAC-SHA256 keyed with
   the group's own password over `<group>.<expiresAtMs>`. So the system
   admin can open any group as commissioner without ever seeing its
   password, a token only works for the group it names, and rotating a
   group's password cancels every token for it. The group app stores it
   exactly where it stores a typed password (js/utils.js), so nothing
   client-side knows the difference.

   Pure WebCrypto, no Worker APIs, so Node tests can import it
   (tests/commissioner-token.test.mjs).
   ============================================================ */

export const COMMISSIONER_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

const PREFIX = 'bxc1';
const enc = new TextEncoder();

function b64url(bytes){
  let s = '';
  for(const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Constant-time, so a wrong guess can't be timed character by character.
export function safeEqual(a, b){
  if(typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for(let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(password, message){
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message))));
}

export async function makeCommissionerToken(password, group, expiresAt){
  return `${PREFIX}.${group}.${expiresAt}.${await sign(password, `${group}.${expiresAt}`)}`;
}

// `password` is the group's secret (undefined when it was never set, in
// which case nothing authorizes).
export async function checkCommissionerSecret(supplied, password, group, now = Date.now()){
  if(!password || typeof supplied !== 'string' || !supplied) return false;
  if(safeEqual(supplied, password)) return true;
  const parts = supplied.split('.');
  if(parts.length !== 4 || parts[0] !== PREFIX || parts[1] !== group) return false;
  const expiresAt = Number(parts[2]);
  if(!Number.isInteger(expiresAt) || expiresAt <= now) return false;
  return safeEqual(parts[3], await sign(password, `${group}.${parts[2]}`));
}
