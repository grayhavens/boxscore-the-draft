// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { welcomeHtml, welcomeText } from '../js/welcome-template.js';
import { fillTemplate, buildMessages, sendWelcome, welcomeKey, welcomeContacts, setDrafterEmail, loadEmails, WELCOME_FROM } from '../worker/welcome-email.js';

function fakeEnv(extra = {}){
  const store = new Map();
  return {
    store,
    RESEND_API_KEY: 're_test',
    LEAGUE_FACTS: {
      async get(key, type){ const v = store.get(key); return v === undefined ? null : type === 'json' ? JSON.parse(v) : v; },
      async put(key, value){ store.set(key, value); },
      async delete(key){ store.delete(key); }
    },
    ...extra
  };
}

const assigned = {
  draftertwo: { name: 'Sam', email: 'sam@example.com', at: 1 },
  drafterthree: { name: 'Alex', email: 'alex@example.com', at: 2 }
};
const contacts = welcomeContacts('seasonticket', assigned, {});
const request = { drafters: ['draftertwo', 'drafterthree'], subject: 'Welcome to {group}', body: 'Hi {name},\n\nOpen {link}' };

function stubFetch(t, response = { data: [] }, status = 200){
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(response), { status });
  });
  return calls;
}

test('fillTemplate fills known placeholders only', () => {
  assert.equal(fillTemplate('Hi {name} in {group} at {link} {other}', { name: 'Sam', group: 'G', link: 'L' }), 'Hi Sam in G at L {other}');
});

test('welcomeHtml escapes, splits paragraphs, links URLs and adds the button', () => {
  const html = welcomeHtml({ groupName: 'A&B', link: 'https://ab.boxscore.space', subject: 'Hi', text: 'A <b>\nline\n\nGo to https://x.boxscore.space.' });
  assert.match(html, /<p[^>]*>A &lt;b&gt;<br>line<\/p>/);
  assert.match(html, /<a href="https:\/\/x\.boxscore\.space"[^>]*>https:\/\/x\.boxscore\.space<\/a>\.<\/p>/);
  assert.match(html, /<a href="https:\/\/ab\.boxscore\.space"[^>]*>Open A&amp;B<\/a>/);
  assert.doesNotMatch(html, /<b>/);
});

test('welcomeText adds the app link only when the message lacks it', () => {
  assert.equal(welcomeText({ groupName: 'G', link: 'https://g.boxscore.space', text: 'Hi' }), 'Hi\n\nOpen G: https://g.boxscore.space');
  assert.equal(welcomeText({ groupName: 'G', link: 'https://g.boxscore.space', text: 'Go https://g.boxscore.space' }), 'Go https://g.boxscore.space');
});

test('buildMessages makes one filled message per person', () => {
  const msgs = buildMessages('seasonticket', [{ name: 'Sam', email: 'sam@example.com' }], { ...request, replyTo: 'me@example.com' });
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0].to, ['sam@example.com']);
  assert.equal(msgs[0].from, WELCOME_FROM);
  assert.equal(msgs[0].subject, 'Welcome to Season Ticket');
  assert.equal(msgs[0].text, 'Hi Sam,\n\nOpen https://seasonticket.boxscore.space');
  assert.equal(msgs[0].reply_to, 'me@example.com');
});

test('sendWelcome batches everyone and records who got it', async t => {
  const calls = stubFetch(t);
  const env = fakeEnv();
  const result = await sendWelcome(env, 'seasonticket', contacts, request, 'me@example.com');
  assert.deepEqual(result, { ok: true, sent: 2, test: false });
  assert.equal(calls[0].url, 'https://api.resend.com/emails/batch');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test');
  assert.deepEqual(calls[0].body.map(m => m.to[0]), ['sam@example.com', 'alex@example.com']);
  assert.deepEqual(Object.keys(JSON.parse(env.store.get(welcomeKey('seasonticket')))), ['draftertwo', 'drafterthree']);
});

test('a test send goes only to the admin and records nothing', async t => {
  const calls = stubFetch(t);
  const env = fakeEnv();
  const result = await sendWelcome(env, 'seasonticket', contacts, { ...request, test: true }, 'me@example.com');
  assert.equal(result.sent, 1);
  assert.deepEqual(calls[0].body[0].to, ['me@example.com']);
  assert.equal(calls[0].body[0].subject, '[Test] Welcome to Season Ticket');
  assert.match(calls[0].body[0].text, /^Hi Sam,/);
  assert.equal(env.store.size, 0);
});

test('sendWelcome refuses bad input without calling Resend', async t => {
  const calls = stubFetch(t);
  assert.deepEqual(await sendWelcome(fakeEnv({ RESEND_API_KEY: '' }), 'seasonticket', contacts, request, ''), { error: 'no_key' });
  assert.deepEqual(await sendWelcome(fakeEnv(), 'seasonticket', contacts, { ...request, body: ' ' }, ''), { error: 'empty' });
  assert.deepEqual(await sendWelcome(fakeEnv(), 'seasonticket', contacts, { ...request, drafters: ['josh'] }, ''), { error: 'bad_drafters' });
  assert.deepEqual(await sendWelcome(fakeEnv(), 'seasonticket', contacts, { ...request, test: true }, 'local dev'), { error: 'no_admin_email' });
  assert.equal(calls.length, 0);
});

test('a Resend error comes back with its message and records nothing', async t => {
  stubFetch(t, { message: 'domain not verified' }, 403);
  const env = fakeEnv();
  assert.deepEqual(await sendWelcome(env, 'seasonticket', contacts, request, ''), { error: 'resend', detail: 'domain not verified' });
  assert.equal(env.store.size, 0);
});

test('welcomeContacts takes named spots from the emails record and confirmed spots from their claim', () => {
  const c = welcomeContacts('seasonticket', { ...assigned, drafterfour: { name: 'No Mail', email: '' } },
    { josh: 'josh@example.com', draftertwo: 'ignored@example.com', drafterfive: 'open@example.com' });
  assert.deepEqual(c, {
    josh: { name: 'Josh', email: 'josh@example.com' },
    draftertwo: { name: 'Sam', email: 'sam@example.com' },
    drafterthree: { name: 'Alex', email: 'alex@example.com' }
  });
});

test('setDrafterEmail sets and clears a named spot only', async () => {
  const env = fakeEnv();
  assert.deepEqual(await setDrafterEmail(env, 'seasonticket', 'josh', ' josh@example.com '), { ok: true, email: 'josh@example.com' });
  assert.deepEqual(await loadEmails(env, 'seasonticket'), { josh: 'josh@example.com' });
  assert.deepEqual(await setDrafterEmail(env, 'seasonticket', 'draftertwo', 'x@example.com'), { error: 'bad_drafter' });
  assert.deepEqual(await setDrafterEmail(env, 'seasonticket', 'josh', 'nope'), { error: 'email' });
  assert.deepEqual(await setDrafterEmail(env, 'seasonticket', 'josh', ''), { ok: true, email: '' });
  assert.equal(env.store.size, 0);
});
