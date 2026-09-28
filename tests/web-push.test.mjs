// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptPayload, vapidAuthorization, parseSubscription, pushKvKey, b64urlDecode, b64urlEncode } from '../worker/web-push.js';

async function importP256(publicB64, privateB64, usage){
  const pub = b64urlDecode(publicB64);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64urlEncode(pub.slice(1, 33)), y: b64urlEncode(pub.slice(33, 65)) };
  const alg = usage === 'ecdh' ? { name: 'ECDH', namedCurve: 'P-256' } : { name: 'ECDSA', namedCurve: 'P-256' };
  const publicKey = await crypto.subtle.importKey('jwk', jwk, alg, true, usage === 'ecdh' ? [] : ['verify']);
  const privateKey = privateB64 && await crypto.subtle.importKey('jwk', { ...jwk, d: privateB64 }, alg, true, usage === 'ecdh' ? ['deriveBits'] : ['sign']);
  return { publicKey, privateKey };
}

// RFC 8291 Appendix A: the worked example, byte for byte.
test('encryption matches the RFC 8291 test vector', async () => {
  const localKeys = await importP256(
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw', 'ecdh');
  const device = {
    p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg'
  };
  const body = await encryptPayload(device, 'When I grow up, I want to be a watermelon', {
    salt: b64urlDecode('DGv6ra1nlYgDCS1FRnbzlw'), localKeys
  });
  assert.equal(b64urlEncode(body),
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
});

test('the VAPID header is a JWT the public key verifies, for the endpoint\'s origin', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const env = {
    VAPID_PUBLIC_KEY: b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey)),
    VAPID_PRIVATE_KEY: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d
  };
  const header = await vapidAuthorization(env, 'https://web.push.apple.com/QGabc123', 1000);
  const [, jwt, k] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(k, env.VAPID_PUBLIC_KEY);
  const [h, c, sig] = jwt.split('.');
  const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(c)));
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.equal(claims.exp, 1000 + 12 * 60 * 60);
  const { publicKey } = await importP256(env.VAPID_PUBLIC_KEY, null, 'ecdsa');
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, b64urlDecode(sig), new TextEncoder().encode(`${h}.${c}`)));
});

const keys = {
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg'
};

test('only real push-service endpoints with well-formed keys are accepted', () => {
  assert.ok(parseSubscription({ endpoint: 'https://web.push.apple.com/QGabc', keys }));
  assert.ok(parseSubscription({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys }));
  assert.ok(parseSubscription({ endpoint: 'https://wns2-by3p.notify.windows.com/w/?token=abc', keys }));
  assert.equal(parseSubscription({ endpoint: 'https://evil.example.com/push', keys }), null);
  assert.equal(parseSubscription({ endpoint: 'http://fcm.googleapis.com/fcm/send/abc', keys }), null);
  assert.equal(parseSubscription({ endpoint: 'https://web.push.apple.com.evil.com/x', keys }), null);
  assert.equal(parseSubscription({ endpoint: 'https://web.push.apple.com/x', keys: { ...keys, auth: 'short' } }), null);
  assert.equal(parseSubscription(null), null);
});

test('The Draft keeps a bare key prefix; other groups are namespaced', () => {
  assert.equal(pushKvKey('thedraft', 'josh'), 'push:josh');
  assert.equal(pushKvKey('seasonticket', 'drafterone'), 'push@seasonticket:drafterone');
});
