// Design tokens stay in css/tokens.css (docs/design-system-plan.md, Step 4).
//
// Fails if css/style.css or any js/*.js file has a raw hex or rgb()/rgba()
// color that isn't on the allowlist below. Use a token instead
// (var(--accent), rgba(var(--ink-rgb), 0.06), …), adding one to
// css/tokens.css if nothing fits. The allowlist is today's exceptions,
// counted, so it can only shrink: moving one of these to a token means
// taking it off the list, and any new raw color fails.
//
// Also checks that the JS mirrors of the motion curves (js/utils.js, for the
// Web Animations API) match the --ease-* tokens.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

const ALLOWED = {
  // Mask gradients (#000 = fully shown), the crest drop shadow, the launch
  // splash's own light-theme colors, the static sample badge in the guide,
  // and the landing explainer's gold foil and sparkle art.
  'css/style.css': {
    '#000': 9, 'rgba(0,0,0,0.55)': 1, 'rgba(255,255,255,0.12)': 1, '#F4F3EF': 2, '#0B0C0F': 2,
    '#0076B6': 1, '#B0B7BC': 1, '#B8862B': 1, '#F6D985': 2, '#E2B84A': 1, '#C7952F': 1,
    'rgba(255,255,255,0.85)': 1, 'rgba(217,180,91,0.7)': 1, 'rgba(0,0,0,0.35)': 1
  },
  // Pool tile colors for write-ins and golfers (data, stored in the draft state).
  'js/draft-engine.js': { '#3A3B42': 1 },
  'js/draft-pool.js': { '#1E5B3F': 1 },
  // League chart colors (also --league-* now; move over with the draft room's
  // screen), the tile text color picked against a team's own color, and a
  // muted fallback.
  'js/draft.js': {
    '#826AC8': 1, '#91C86A': 1, '#B57FC0': 1, '#6FBFC6': 1, '#6AC87A': 1, '#A8B36A': 1,
    '#C86AA1': 1, '#C58C6A': 1, '#6AB7A0': 1, '#94969E': 2, '#F3F4F6': 1, '#000000': 1, '#FFFFFF': 1
  },
  'js/golf-view.js': { '#FFFFFF': 1 },
  // <meta name="theme-color"> values: a meta tag can't read a CSS variable.
  'js/identity.js': { '#0A0B0D': 2, '#F4F3EF': 2 },
  'js/settings.js': { '#0A0B0D': 1, '#F4F3EF': 1 },
  // Real teams' colors in the landing page's "How it works" animation.
  'js/landing-explainer.js': {
    '#2E8A5C': 1, '#0076B6': 2, '#C8102E': 3, '#860038': 1, '#FEE123': 1, '#2E5CB8': 1, '#2F5BC9': 1,
    '#FFB612': 2, '#FEC524': 1, '#F74902': 1, '#8A6BAF': 1, '#E6E7EB': 1, '#FFC425': 1, '#8C1D1D': 1,
    '#CEB888': 1, '#008E97': 1, '#CE1126': 1, '#2A6FB5': 1, '#AB0003': 1, '#AB0520': 1, '#4A6FA5': 1,
    '#B0B7BC': 1, '#203731': 1, '#FFFFFF': 2, '#EF0107': 1
  },
  // Fallback for an ESPN standings zone with no color of its own.
  'js/live-data.js': { '#94969E': 1 },
  // League chart colors (also --league-* now; move over with the Points screen).
  'js/overall.js': {
    '#826AC8': 1, '#C86AA1': 1, '#91C86A': 1, '#C58C6A': 1, '#B57FC0': 1, '#6FBFC6': 1, '#6AC87A': 1, '#A8B36A': 1
  },
  // Fallback hero accent for a team with none of its own.
  'js/team-page.js': { '#D9B45B': 1 },
  // CHECK_ICON_SVG's stroke.
  'js/utils.js': { '#0A0B0D': 1 },
  // The welcome email: email clients can't use CSS variables, so it inlines the palette.
  'js/welcome-template.js': {
    '#0A0B0D': 2, '#16171B': 1, '#26272C': 1, '#F3F4F6': 1, '#94969E': 1, '#64666E': 1, '#D9B45B': 1
  }
};

// Comments can mention a color ("e.g. #81D6AC") without using one.
const stripComments = (src, css) => css
  ? src.replace(/\/\*[\s\S]*?\*\//g, '')
  : src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
// A hex color, not an id selector (#dr-clock), an HTML entity (&#8217;) or a
// template (#${…}); or rgb()/rgba() with literal numbers (rgba(var(--ink-rgb), …) is fine).
const COLOR = /(?<![\w&$-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])|rgba?\(\s*\d[^)]*\)/g;

function rawColors(file){
  const found = {};
  for(const m of stripComments(read(file), file.endsWith('.css')).match(COLOR) || []){
    const key = m.replace(/\s+/g, '');
    found[key] = (found[key] || 0) + 1;
  }
  return found;
}

const files = ['css/style.css', ...fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).sort().map(f => `js/${f}`)];

test('no raw colors outside css/tokens.css beyond the allowlist', () => {
  const problems = [];
  for(const file of files){
    const found = rawColors(file), allowed = ALLOWED[file] || {};
    for(const [color, n] of Object.entries(found)){
      const ok = allowed[color] || 0;
      if(n > ok) problems.push(`${file}: ${color} ×${n}${ok ? ` (${ok} allowed)` : ''}`);
    }
  }
  assert.deepEqual(problems, [], `Raw colors found. Use a token from css/tokens.css instead (var(--…)):\n  ${problems.join('\n  ')}`);
});

test('allowlist has no stale entries', () => {
  const stale = [];
  for(const [file, allowed] of Object.entries(ALLOWED)){
    const found = fs.existsSync(path.join(ROOT, file)) ? rawColors(file) : {};
    for(const [color, n] of Object.entries(allowed)){
      if((found[color] || 0) < n) stale.push(`${file}: ${color} allows ${n}, found ${found[color] || 0}`);
    }
  }
  assert.deepEqual(stale, [], `Lower these allowlist counts in tests/design-tokens.test.mjs:\n  ${stale.join('\n  ')}`);
});

test('JS motion curves match the --ease-* tokens', () => {
  const tokens = read('css/tokens.css'), utils = read('js/utils.js');
  const norm = v => v.replace(/\s+/g, '');
  const pairs = { EASE_OUT: '--ease-out', EASE_SPRING: '--ease-spring', EASE_IN_OUT: '--ease-in-out', EASE_PUSH: '--ease-push', EASE_IN: '--ease-in' };
  for(const [js, css] of Object.entries(pairs)){
    const t = tokens.match(new RegExp(`${css}:\\s*([^;]+);`));
    const u = utils.match(new RegExp(`export const ${js} = '([^']+)'`));
    assert.ok(t, `${css} missing from css/tokens.css`);
    assert.ok(u, `${js} missing from js/utils.js`);
    assert.equal(norm(u[1]), norm(t[1]), `${js} in js/utils.js doesn't match ${css} in css/tokens.css`);
  }
  // js/sheet.js keeps its own copy of the sheet curve (it imports nothing).
  const sheet = read('js/sheet.js').match(/export const SHEET_EASE = '([^']+)'/);
  const t = tokens.match(/--ease-sheet:\s*([^;]+);/);
  assert.ok(sheet && t, 'SHEET_EASE or --ease-sheet missing');
  assert.equal(norm(sheet[1]), norm(t[1]), "SHEET_EASE in js/sheet.js doesn't match --ease-sheet in css/tokens.css");
});

test('custom properties on :root are defined only in css/tokens.css', () => {
  const css = stripComments(read('css/style.css'), true);
  const rootBlocks = css.match(/(^|\})\s*(?::root|html)(?:\[data-theme="[a-z]+"\])?\s*\{[^}]*\}/g) || [];
  const defs = rootBlocks.flatMap(b => b.match(/--[\w-]+\s*:/g) || []);
  assert.deepEqual(defs, [], 'Move these :root custom properties into css/tokens.css');
});

test('the delight pass tokens are defined (docs/delight-plan.md)', () => {
  const tokens = read('css/tokens.css');
  for(const name of ['--orb-blur', '--orb-opacity', '--orb-opacity-soft', '--crest-shadow']){
    assert.match(tokens, new RegExp(`${name}:\\s*[^;]+;`), `${name} missing from css/tokens.css`);
  }
});
