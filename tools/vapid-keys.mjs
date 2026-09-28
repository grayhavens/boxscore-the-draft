// Makes the VAPID key pair push notifications are signed with (see
// worker/web-push.js). Run once, then store both as worker secrets:
//
//   node tools/vapid-keys.mjs
//   cd worker
//   npx wrangler secret put VAPID_PUBLIC_KEY    (paste the public key)
//   npx wrangler secret put VAPID_PRIVATE_KEY   (paste the private key)
//
// Keep the pair for good: a new pair invalidates every device's
// subscription, and each drafter would have to turn alerts on again.
import { b64urlEncode } from '../worker/web-push.js';

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const publicKey = b64urlEncode(await crypto.subtle.exportKey('raw', pair.publicKey));
const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;

console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
