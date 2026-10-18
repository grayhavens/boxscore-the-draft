// What a launch loads (tools/launch-graph.mjs): held to a budget, and
// sw.js's hand-kept SHELL_FILES kept in step with the code, so a missing
// file can't run uncached and mix versions on a slow launch.
// docs/optimization-report.md, Phase 1 #2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT, ENTRY, launchGraph, lazyModules, shellFiles, staticImports, kb, exists } from '../tools/launch-graph.mjs';

// The Draft's launch, measured 2026-10-18: 108 modules, 1,620 KB, 5 round
// trips. Room for ordinary growth; a jump past it means something rare
// got imported statically (docs/lazy-load-plan.md). Raise it on purpose,
// in the same PR, when a new module really belongs at launch.
const BUDGET = { modules: 115, kb: 1700, depth: 5 };

// Loaded on first use but deliberately not installed: ESPN's team lists
// (js/live-class.js, once, right after a draft, online by nature).
const NOT_INSTALLED = new Set(['js/seasons/espn-teams.js']);

const launch = launchGraph();
const lazy = lazyModules(launch);
const shell = new Set(shellFiles());

test('the import scan finds board.js\'s imports (the regex still matches the code)', () => {
  assert.ok(staticImports(ENTRY).length > 40, 'expected board.js to import dozens of modules');
  assert.ok(lazy.has('js/draft.js') && lazy.has('js/admin.js'), 'expected the draft room and console as first-use modules');
});

test(`launch stays within budget (${BUDGET.modules} modules, ${BUDGET.kb} KB, ${BUDGET.depth} round trips)`, () => {
  assert.ok(launch.size <= BUDGET.modules, `launch is ${launch.size} modules`);
  assert.ok(kb(launch.keys()) <= BUDGET.kb, `launch is ${kb(launch.keys())} KB`);
  assert.ok(Math.max(...launch.values()) <= BUDGET.depth, `launch is ${Math.max(...launch.values())} round trips deep`);
});

test('the draft room, console and guide stills stay off the launch', () => {
  for(const file of ['js/draft.js', 'js/admin.js', 'js/landing-explainer.js', 'js/seasons/seasonticket.js']){
    assert.ok(!launch.has(file), `${file} is imported statically`);
  }
});

test('every launch module is in SHELL_FILES', () => {
  assert.deepEqual([...launch.keys()].filter(f => !shell.has(f)), []);
});

test('every first-use module is in SHELL_FILES (or deliberately left out)', () => {
  assert.deepEqual([...lazy].filter(f => !shell.has(f) && !NOT_INSTALLED.has(f)), []);
});

test('index.html\'s scripts and stylesheets are in SHELL_FILES', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const local = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*rel="stylesheet"[^>]*\shref)="([^":]+)"/g)].map(m => m[1]);
  assert.ok(local.includes('js/board.js') && local.includes('css/style.css'));
  assert.deepEqual(local.filter(f => !shell.has(f)), []);
});

test('every SHELL_FILES entry exists', () => {
  assert.deepEqual([...shell].filter(f => !exists(f)), []);
});

test('SHELL_FILES lists no script the app no longer loads', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf8');
  const classic = new Set([...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]));
  const stale = [...shell].filter(f => f.endsWith('.js') && !launch.has(f) && !lazy.has(f) && !classic.has(f) && f !== 'sw.js');
  assert.deepEqual(stale, []);
});
