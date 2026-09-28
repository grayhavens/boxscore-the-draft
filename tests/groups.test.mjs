// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, LEGACY_GROUP_ID, chooseGroupId, groupIdFromHost, adminSecretName, drafterIdsFor, isPlatformHost, groupAppUrl } from '../js/groups.js';

test('a group subdomain picks that group', () => {
  assert.equal(chooseGroupId({ hostname: 'thedraft.boxscore.space', fromUrl: null }), 'thedraft');
  assert.equal(chooseGroupId({ hostname: 'seasonticket.boxscore.space', fromUrl: null }), 'seasonticket');
});

test('everything else is The Draft', () => {
  assert.equal(chooseGroupId({ hostname: 'boxscorethedraft.pages.dev', fromUrl: null }), LEGACY_GROUP_ID);
  assert.equal(chooseGroupId({ hostname: 'www.boxscore.space', fromUrl: null }), LEGACY_GROUP_ID);
  assert.equal(chooseGroupId({ hostname: 'boxscore.space', fromUrl: null }), LEGACY_GROUP_ID);
  assert.equal(groupIdFromHost('seasonticket.boxscore.space.evil.com'), null);
});

test('?group= only works on dev and preview hosts, and only for a known group', () => {
  assert.equal(chooseGroupId({ hostname: 'localhost', fromUrl: 'seasonticket' }), 'seasonticket');
  assert.equal(chooseGroupId({ hostname: 'abc123.boxscorethedraft.pages.dev', fromUrl: 'seasonticket' }), 'seasonticket');
  assert.equal(chooseGroupId({ hostname: 'localhost', fromUrl: 'nope' }), LEGACY_GROUP_ID);
  assert.equal(chooseGroupId({ hostname: 'boxscorethedraft.pages.dev', fromUrl: 'seasonticket' }), LEGACY_GROUP_ID);
  assert.equal(chooseGroupId({ hostname: 'thedraft.boxscore.space', fromUrl: 'seasonticket' }), 'thedraft');
});

test('The Draft keeps the original password secret', () => {
  assert.equal(adminSecretName('thedraft'), 'ADMIN_PASSWORD');
  assert.equal(adminSecretName('seasonticket'), 'ADMIN_PASSWORD_SEASONTICKET');
});

test('every group has 10 unique, letters-only drafter ids (the worker routes match [a-z]+)', () => {
  Object.keys(GROUPS).forEach(id => {
    const ids = drafterIdsFor(id);
    assert.equal(ids.length, 10, id);
    assert.equal(new Set(ids).size, 10, id);
    ids.forEach(d => assert.match(d, /^[a-z]+$/, `${id}/${d}`));
    assert.match(id, /^[a-z0-9]+$/, id);
  });
});

test('the bare domain is the platform, not a group', () => {
  assert.equal(isPlatformHost('boxscore.space'), true);
  assert.equal(isPlatformHost('www.boxscore.space'), true);
  assert.equal(isPlatformHost('thedraft.boxscore.space'), false);
  assert.equal(isPlatformHost('localhost'), false);
});

test('landing page links go to each group’s subdomain, or ?group= on dev hosts', () => {
  assert.equal(groupAppUrl('seasonticket', 'boxscore.space'), 'https://seasonticket.boxscore.space/');
  assert.equal(groupAppUrl('seasonticket', 'localhost'), 'index.html?group=seasonticket');
  assert.equal(groupAppUrl('thedraft', 'abc123.boxscorethedraft.pages.dev'), 'index.html?group=thedraft');
});
