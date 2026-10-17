// Home's priority rule (js/home-stack-math.js): one order for everything
// that can sit above your teams, two at most, the rest folded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { orderHomeItems, foldSummary, HOME_STACK_MAX } from '../js/home-stack-math.js';

const item = (id, tier, extra = {}) => ({ id, tier, title: id, html: `<i>${id}</i>`, ...extra });
const ids = list => list.map(it => it.id);

test('two at most, by default', () => {
  assert.equal(HOME_STACK_MAX, 2);
});

test('the written order: draft, champion, counting, last season, not counting', () => {
  const { shown, folded } = orderHomeItems([
    item('mlb', 'no-points', { state: 'live' }),
    item('overlap', 'last-season'),
    item('nfl', 'counts', { state: 'live' }),
    item('champ', 'champion'),
    item('draft', 'draft')
  ]);
  assert.deepEqual(ids(shown), ['draft', 'champ']);
  assert.deepEqual(ids(folded), ['nfl', 'overlap', 'mlb']);
});

test('the Draft card is always shown, even with a crowd behind it', () => {
  const items = [item('a', 'counts', { state: 'live' }), item('b', 'counts', { state: 'live' }), item('draft', 'draft')];
  assert.equal(orderHomeItems(items).shown[0].id, 'draft');
  assert.deepEqual(ids(orderHomeItems(items, { max: 1 }).shown), ['draft']);
});

test('within a tier: under way, then field set, then the champion week', () => {
  const { shown, folded } = orderHomeItems([
    item('done', 'counts', { state: 'done' }),
    item('set', 'counts', { state: 'set' }),
    item('live', 'counts', { state: 'live' })
  ]);
  assert.deepEqual(ids(shown), ['live', 'set']);
  assert.deepEqual(ids(folded), ['done']);
});

test('ties: a team of yours still alive first, then the league tab order', () => {
  const { shown } = orderHomeItems([
    item('cfb', 'counts', { state: 'live', order: 1 }),
    item('nfl', 'counts', { state: 'live', order: 0 }),
    item('mcbb', 'counts', { state: 'live', order: 2, mineAlive: true })
  ]);
  assert.deepEqual(ids(shown), ['mcbb', 'nfl']);
});

test('two or fewer: nothing folds; empty items are skipped', () => {
  const r = orderHomeItems([item('a', 'no-points'), null, { id: 'empty', tier: 'counts', html: '' }, item('b', 'last-season')]);
  assert.deepEqual(ids(r.shown), ['b', 'a']);
  assert.deepEqual(r.folded, []);
  assert.deepEqual(orderHomeItems(undefined), { shown: [], folded: [] });
});

test('the fold row counts and names what it holds, in order', () => {
  const { folded } = orderHomeItems([
    item('draft', 'draft'), item('MLB Postseason', 'no-points', { state: 'live', order: 4 }),
    item('WNBA Playoffs', 'no-points', { state: 'live', order: 5 }), item('2026/27 is still being played', 'last-season')
  ]);
  assert.deepEqual(foldSummary(folded), { title: 'More right now (2)', sub: 'MLB Postseason · WNBA Playoffs' });
});
