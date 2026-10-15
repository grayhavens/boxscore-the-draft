// settingsRowHtml (js/ui.js): the one markup for a .set-row tile, so
// Settings, the Home draft card and the tour's alert rows stay alike.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { settingsRowHtml } from '../js/ui.js';

test('a tap row is a button with title, sub and chevron, text escaped', () => {
  const html = settingsRowHtml({ title: 'Commissioner', sub: 'Draft & scoring', onclick: "switchView('admin')", chevron: true });
  assert.match(html, /^<button type="button" class="set-row" onclick="switchView\('admin'\)">/);
  assert.match(html, /<span class="set-row-sub">Draft &amp; scoring<\/span>/);
  assert.match(html, /<span class="set-chev">&rsaquo;<\/span><\/button>$/);
});

test('without onclick it is a plain row and leaves out an empty sub', () => {
  const html = settingsRowHtml({ title: 'Notifications are blocked' });
  assert.match(html, /^<div class="set-row">/);
  assert.doesNotMatch(html, /set-row-sub|set-chev/);
});

test('switchOn makes a switch row that a screen can repaint by key', () => {
  const on = settingsRowHtml({ title: 'Unread badge', onclick: 'x()', switchOn: true, switchKey: 'chatBadge' });
  assert.match(on, /data-switch="chatBadge" role="switch" aria-checked="true"/);
  assert.match(on, /<span class="switch on" aria-hidden="true"><\/span>/);
  const off = settingsRowHtml({ title: 'Mentions', onclick: 'x()', switchOn: false });
  assert.match(off, /role="switch" aria-checked="false"/);
  assert.doesNotMatch(off, /data-switch/);
});
