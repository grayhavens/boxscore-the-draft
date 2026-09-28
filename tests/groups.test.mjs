// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { GROUPS, LEGACY_GROUP_ID, chooseGroupId, groupIdFromHost, adminSecretName, drafterIdsFor } from '../js/groups.js';

test('a group subdomain picks that group', () => {
  assert.equal(chooseGroupId({ hostname: 'thedraft.boxscore.space', fromUrl: null }), 'thedraft');
  assert.equal(chooseGroupId({ hostname: 'league2.boxscore.space', fromUrl: null }), 'league2');
});

test('everything else is The Draft', () => {
  assert.equal(chooseGroupId({ hostname: 'boxscorethedraft.pages.dev', fromUrl: null }), LEGACY_GROUP_ID);
  assert.equal(chooseGroupId({ hostname: 'www.boxscore.space', fromUrl: null }), LEGACY_GROUP_ID);
  assert.equal(chooseGroupId({ hostname: 'boxscore.space', fromUrl: null }), LEGACY_GROUP_ID);
  assert.equal(groupIdFromHost('league2.boxscore.space.evil.com'), null);
});

test('?group= only works on dev and preview hosts, and only for a known group', () => {
  assert.equal(chooseGroupId({ hostname: 'localhost', fromUrl: 'league2' }), 'league2');
  assert.equal(chooseGroupId({ hostname: 'abc123.boxscorethedraft.pages.dev', fromUrl: 'league2' }), 'league2');
  assert.equal(chooseGroupId({ hostname: 'localhost', fromUrl: 'nope' }), LEGACY_GROUP_ID);
  assert.equal(chooseGroupId({ hostname: 'boxscorethedraft.pages.dev', fromUrl: 'league2' }), LEGACY_GROUP_ID);
  assert.equal(chooseGroupId({ hostname: 'thedraft.boxscore.space', fromUrl: 'league2' }), 'thedraft');
});

test('The Draft keeps the original password secret', () => {
  assert.equal(adminSecretName('thedraft'), 'ADMIN_PASSWORD');
  assert.equal(adminSecretName('league2'), 'ADMIN_PASSWORD_LEAGUE2');
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
