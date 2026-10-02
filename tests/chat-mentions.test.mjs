// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { EVERYONE, findMentions, mentionSegments, parseMentions, splitRecipients, mentionsMe, activeMentionQuery, mentionOptions, MAX_MENTIONS } from '../js/chat-mentions.js';
import { parsePrefs, wantsAlert } from '../worker/web-push.js';

const PEOPLE = [
  { id: 'erichylok', name: 'Eric H' },
  { id: 'ericprister', name: 'Eric P' },
  { id: 'isaac', name: 'Isaac' },
  { id: 'eric', name: 'Eric' },
  { id: EVERYONE, name: 'everyone' }
];

test('finds tagged names, longest first, case-insensitive', () => {
  assert.deepEqual(findMentions('@Eric H and @isaac, also @Eric', PEOPLE), ['erichylok', 'isaac', 'eric']);
  assert.deepEqual(findMentions("@Isaac's pick", PEOPLE), ['isaac']);
  assert.deepEqual(findMentions('@everyone draft is at 8', PEOPLE), [EVERYONE]);
});

test('a name has to end where it ends, and an @ has to start a word', () => {
  assert.deepEqual(findMentions('@Ericson and me@Isaac', PEOPLE), []);
  assert.deepEqual(findMentions('@Isaac @Isaac', PEOPLE), ['isaac']);
  assert.deepEqual(findMentions('no tags here', PEOPLE), []);
});

test('segments only highlight the ids the message carries', () => {
  assert.deepEqual(mentionSegments('hi @Isaac and @Eric H', ['isaac'], PEOPLE), [
    { text: 'hi ' }, { text: '@Isaac', id: 'isaac' }, { text: ' and @Eric H' }
  ]);
  assert.deepEqual(mentionSegments('hi @Isaac', undefined, PEOPLE), [{ text: 'hi @Isaac' }]);
  assert.deepEqual(mentionSegments('@Isaac', ['isaac'], PEOPLE), [{ text: '@Isaac', id: 'isaac' }]);
});

test('the worker keeps real drafters, never the sender, no repeats', () => {
  const ids = ['josh', 'isaac', 'drew'];
  assert.deepEqual(parseMentions(['isaac', 'josh', 'nobody', 'isaac', 5, EVERYONE], ids, 'josh'), ['isaac', EVERYONE]);
  assert.deepEqual(parseMentions('isaac', ids, 'josh'), []);
  assert.equal(parseMentions(Array.from({ length: 20 }, (_, i) => `d${i}`), Array.from({ length: 20 }, (_, i) => `d${i}`), 'x').length, MAX_MENTIONS);
});

test('tagged recipients get the mention alert, the rest the chat one', () => {
  assert.deepEqual(splitRecipients(['isaac', 'drew', 'peter'], ['isaac']), { tagged: ['isaac'], others: ['drew', 'peter'] });
  assert.deepEqual(splitRecipients(['isaac', 'drew'], [EVERYONE]), { tagged: ['isaac', 'drew'], others: [] });
  assert.deepEqual(splitRecipients(['isaac'], undefined), { tagged: [], others: ['isaac'] });
  assert.equal(mentionsMe([EVERYONE], 'drew'), true);
  assert.equal(mentionsMe(['isaac'], 'drew'), false);
});

test('the composer list follows the @ being typed', () => {
  assert.deepEqual(activeMentionQuery('hey @Er', 7), { start: 4, query: 'Er' });
  assert.deepEqual(activeMentionQuery('@Eric H', 7), { start: 0, query: 'Eric H' });
  assert.equal(activeMentionQuery('mail me@x', 9), null);
  assert.equal(activeMentionQuery('@Isaac\nok', 9), null);
  assert.deepEqual(mentionOptions('eric ', PEOPLE).map(o => o.id), ['erichylok', 'ericprister']);
});

test('mention alerts are on for a device with alerts on that never chose', () => {
  const old = parsePrefs({ chat: true, draft: false });
  assert.equal('mention' in old, false);
  assert.equal(wantsAlert(old, 'mention'), true);
  assert.equal(wantsAlert(parsePrefs({ chat: false }), 'mention'), false);
  assert.equal(wantsAlert(parsePrefs({ chat: true, mention: false }), 'mention'), false);
  assert.equal(wantsAlert(parsePrefs({ mention: true }), 'mention'), true);
  assert.equal(wantsAlert(parsePrefs({ chat: true }), 'draft'), false);
});
