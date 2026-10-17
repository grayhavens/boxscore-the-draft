// Type follows the iPhone's text size, and nothing reads smaller than 11px
// (Apple's Caption 2). See the type-size comment in css/tokens.css and the
// html rule at the top of css/style.css.
//
// Checks that every --fs-* token is in rem (so it scales with
// -apple-system-body) and is at least 11px at the default 17px body size,
// and that css/style.css sets no literal font size under 11px. The
// exceptions are monograms inside fixed-size crests and tiles (badge
// initials, draft tiles), which are part of the crest rather than text to
// read, and the landing tour's miniature screens, which are drawings of
// the app at reduced scale.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const BODY_PX = 17;
const FLOOR_PX = 11;

// px at the default body size for a token value, or null when it isn't one we read.
function tokenPx(value){
  const v = value.trim();
  if(v === '1rem') return BODY_PX;
  let m = v.match(/^calc\(\s*([\d.]+)rem\s*\/\s*17\s*\)$/);
  if(m) return Number(m[1]);
  m = v.match(/^([\d.]+)rem$/);
  if(m) return Number(m[1]) * BODY_PX;
  return null;
}

test('every --fs-* token scales with the body size and is 11px or more', () => {
  const css = read('css/tokens.css');
  const tokens = [...css.matchAll(/--fs-([\w-]+):\s*([^;]+);/g)];
  assert.ok(tokens.length > 10, 'found the type tokens');
  const problems = [];
  for(const [, name, value] of tokens){
    if(name === 'tab'){
      // The tab bar's labels stay fixed, like the system's.
      if(value.trim() !== '10px') problems.push(`--fs-tab: ${value} (expected 10px)`);
      continue;
    }
    const px = tokenPx(value);
    if(px === null) problems.push(`--fs-${name}: ${value} isn't in rem`);
    else if(px < FLOOR_PX) problems.push(`--fs-${name}: ${px}px is under ${FLOOR_PX}px`);
  }
  assert.deepEqual(problems, []);
});

const MONOGRAM = /badge|tile|\.tour-|ls-/;

test('no literal font size under 11px outside crest monograms', () => {
  const css = read('css/style.css');
  const problems = [];
  for(const [, selector, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
    for(const [, px] of body.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?([\d.]+)px/g)){
      if(Number(px) >= FLOOR_PX || MONOGRAM.test(selector)) continue;
      problems.push(`${selector.trim()} → ${px}px`);
    }
  }
  assert.deepEqual(problems, []);
});
