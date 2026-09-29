// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAccessJwt, resetAccessKeyCache } from '../worker/access-auth.js';

const TEAM = 'boxscore.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const NOW = Date.UTC(2026, 8, 28, 12);

const b64url = bytes => Buffer.from(bytes).toString('base64url');
const b64json = obj => b64url(new TextEncoder().encode(JSON.stringify(obj)));

async function keyPair(){
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
  return { privateKey: pair.privateKey, jwk };
}

async function jwt(privateKey, payload, header = { alg: 'RS256', kid: 'k1' }){
  const signed = `${b64json(header)}.${b64json(payload)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(signed));
  return `${signed}.${b64url(new Uint8Array(sig))}`;
}

const good = { aud: [AUD], iss: `https://${TEAM}`, exp: NOW / 1000 + 600, email: 'me@example.com' };

async function setup(){
  resetAccessKeyCache();
  const { privateKey, jwk } = await keyPair();
  const opts = { teamDomain: TEAM, aud: AUD, now: NOW, fetchCerts: async () => ({ keys: [jwk] }) };
  return { privateKey, opts };
}

test('a valid Access token passes and carries the email', async () => {
  const { privateKey, opts } = await setup();
  const payload = await verifyAccessJwt(await jwt(privateKey, good), opts);
  assert.equal(payload.email, 'me@example.com');
});

test('wrong audience, issuer or an expired token fails', async () => {
  const { privateKey, opts } = await setup();
  assert.equal(await verifyAccessJwt(await jwt(privateKey, { ...good, aud: ['other'] }), opts), null);
  assert.equal(await verifyAccessJwt(await jwt(privateKey, { ...good, iss: 'https://evil.cloudflareaccess.com' }), opts), null);
  assert.equal(await verifyAccessJwt(await jwt(privateKey, { ...good, exp: NOW / 1000 - 1 }), opts), null);
});

test('a token signed by another key, or tampered with, fails', async () => {
  const { opts } = await setup();
  const other = await keyPair();
  assert.equal(await verifyAccessJwt(await jwt(other.privateKey, good), opts), null);

  const { privateKey, opts: opts2 } = await setup();
  const [h, , s] = (await jwt(privateKey, good)).split('.');
  assert.equal(await verifyAccessJwt(`${h}.${b64json({ ...good, email: 'x@evil.com' })}.${s}`, opts2), null);
});

test('missing token, missing config or a non-RS256 header fails', async () => {
  const { privateKey, opts } = await setup();
  assert.equal(await verifyAccessJwt(null, opts), null);
  assert.equal(await verifyAccessJwt(await jwt(privateKey, good), { ...opts, aud: undefined }), null);
  assert.equal(await verifyAccessJwt(await jwt(privateKey, good, { alg: 'none', kid: 'k1' }), opts), null);
});
