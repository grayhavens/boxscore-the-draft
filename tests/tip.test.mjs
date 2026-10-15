// tipHtml (js/ui.js): the one-time gesture hint's markup (js/tips.js shows it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tipHtml } from '../js/ui.js';

test('a tip is one dismissable pill with escaped text and a labelled ×', () => {
  const html = tipHtml({ text: 'Hold a message to <react>', onclose: 'hideTip()' });
  assert.match(html, /^<div class="tip" role="status" onclick="hideTip\(\)">/);
  assert.match(html, /<span class="tip-text">Hold a message to &lt;react&gt;<\/span>/);
  assert.match(html, /<button type="button" class="tip-close" aria-label="Dismiss"><svg/);
});
