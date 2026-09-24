// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseSeasonId } from '../js/season.js';

const ids = ['2026', '2027'];

test('the URL wins over everything, but only for a known class', () => {
  assert.equal(chooseSeasonId({ fromUrl: '2026', saved: { id: '2027', latest: '2027' }, ids, latest: '2027' }), '2026');
  assert.equal(chooseSeasonId({ fromUrl: '1999', saved: null, ids, latest: '2027' }), '2027');
});

test('a saved choice holds while the newest class is the one it was made under', () => {
  assert.equal(chooseSeasonId({ fromUrl: null, saved: { id: '2026', latest: '2027' }, ids, latest: '2027' }), '2026');
});

test('a saved choice expires when a newer class ships, so nobody is stranded on an old one', () => {
  assert.equal(chooseSeasonId({ fromUrl: null, saved: { id: '2026', latest: '2026' }, ids: ['2026', '2027'], latest: '2027' }), '2027');
});

test('no choice, an unknown class or junk falls back to the newest', () => {
  assert.equal(chooseSeasonId({ fromUrl: null, saved: null, ids, latest: '2027' }), '2027');
  assert.equal(chooseSeasonId({ fromUrl: null, saved: { id: '1999', latest: '2027' }, ids, latest: '2027' }), '2027');
  assert.equal(chooseSeasonId({ fromUrl: null, saved: {}, ids, latest: '2027' }), '2027');
  assert.equal(chooseSeasonId({ fromUrl: '', saved: null, ids: ['2026'], latest: '2026' }), '2026');
});
