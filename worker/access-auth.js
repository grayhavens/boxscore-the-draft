/* ============================================================
   CLOUDFLARE ACCESS CHECK for the system admin routes (/api/admin/*).

   Access sits in front of boxscore.space/admin and /api/admin/* and does
   the actual login (see "System admin" in CLAUDE.md). A request it lets
   through carries a signed JWT in the Cf-Access-Jwt-Assertion header.
   The worker checks that JWT itself rather than trusting that Access ran,
   because the same worker code also answers on its public *.workers.dev
   address, where nothing sits in front of it.

   Checks: RS256 signature against the team's published keys, `aud` is
   this Access application's AUD tag, `iss` is the team domain, and it
   hasn't expired. Config is two worker secrets: ACCESS_TEAM_DOMAIN
   (e.g. boxscore.cloudflareaccess.com) and ACCESS_AUD.

   Pure WebCrypto + fetch, so Node tests can import it with a stubbed
   key fetch (tests/access-auth.test.mjs).
   ============================================================ */

const CERTS_TTL_MS = 60 * 60 * 1000;
let certsCache = null; // { url, keys, at } per isolate

function b64urlBytes(str){
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

function b64urlJson(str){
  return JSON.parse(new TextDecoder().decode(b64urlBytes(str)));
}

async function teamKeys(teamDomain, fetchCerts, now){
  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  if(certsCache && certsCache.url === url && now - certsCache.at < CERTS_TTL_MS) return certsCache.keys;
  const keys = (await fetchCerts(url)).keys || [];
  certsCache = { url, keys, at: now };
  return keys;
}

// Resolves to the token's payload (it carries `email`) or null.
export async function verifyAccessJwt(token, { teamDomain, aud, now = Date.now(), fetchCerts = defaultFetchCerts } = {}){
  if(!token || !teamDomain || !aud) return null;
  const parts = token.split('.');
  if(parts.length !== 3) return null;
  let header, payload;
  try {
    header = b64urlJson(parts[0]);
    payload = b64urlJson(parts[1]);
  } catch (e){
    return null;
  }
  if(header.alg !== 'RS256') return null;

  let keys = await teamKeys(teamDomain, fetchCerts, now);
  // A key rotated in since the last fetch: refetch once.
  if(!keys.some(k => k.kid === header.kid)){
    certsCache = null;
    keys = await teamKeys(teamDomain, fetchCerts, now);
  }
  const jwk = keys.find(k => k.kid === header.kid);
  if(!jwk) return null;

  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), signed)) return null;

  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if(!auds.includes(aud)) return null;
  if(payload.iss !== `https://${teamDomain}`) return null;
  if(typeof payload.exp !== 'number' || payload.exp * 1000 <= now) return null;
  return payload;
}

async function defaultFetchCerts(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error(`Access certs ${res.status}`);
  return res.json();
}

// For tests: forget the cached keys between cases.
export function resetAccessKeyCache(){ certsCache = null; }
