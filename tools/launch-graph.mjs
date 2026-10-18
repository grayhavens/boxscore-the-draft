#!/usr/bin/env node
/* ============================================================
   What a launch loads: the modules js/board.js reaches through static
   imports, how deep the chain goes, and the modules loaded later on
   first use (dynamic import()). tests/launch-graph.test.mjs uses it to
   hold the launch to a budget and keep sw.js's hand-kept SHELL_FILES in
   step with the code.

     node tools/launch-graph.mjs

   Why it exists: with no bundler, every module the launch imports is a
   file the phone asks for, and each level of the import chain is another
   round trip before the last one arrives. The 2026-10-17 optimization
   review (docs/optimization-report.md, Phase 1 #2) found nothing
   checking either: a stray static import of a rarely used module (the
   draft room, the console) puts it back in every launch
   (docs/lazy-load-plan.md), and a module missing from SHELL_FILES runs
   uncached, so a slow launch could mix versions (sw.js).

   It reads the source with regular expressions, not a parser: the repo's
   imports are plain one-statement forms (`import … from './x.js'`,
   `export … from`, `import './x.js'`, `import('./x.js')`), and the test
   fails loudly if one isn't found.
   ============================================================ */
import { readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const ENTRY = 'js/board.js';

const STATIC_RE = /(?:^|[;\s])(?:import|export)\s+(?:[^'"`;]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/gm;
const DYNAMIC_RE = /\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g;

function source(file){
  // Comments go first: the long header comments quote import lines.
  return readFileSync(resolve(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}
const rel = (from, spec) => relative(ROOT, resolve(ROOT, dirname(from), spec));

export function staticImports(file){
  return [...source(file).matchAll(STATIC_RE)].map(m => rel(file, m[1]));
}
export function dynamicImports(file){
  return [...source(file).matchAll(DYNAMIC_RE)].map(m => rel(file, m[1]));
}

// Every module reachable from `entries` through static imports, with the
// round trip it's found on (the entry is 1; a module is found once its
// shallowest importer has arrived).
export function staticGraph(entries){
  const depth = new Map();
  let level = entries.map(f => [f, 1]);
  while(level.length){
    const next = [];
    for(const [file, d] of level){
      if(depth.has(file)) continue;
      depth.set(file, d);
      for(const dep of staticImports(file)) if(!depth.has(dep)) next.push([dep, d + 1]);
    }
    level = next;
  }
  return depth;
}

// The launch: board.js's static graph.
export function launchGraph(){
  return staticGraph([ENTRY]);
}

// Modules loaded on first use: every dynamic import() reachable from the
// launch (and from those modules in turn), with their own static graphs,
// minus what the launch already has.
export function lazyModules(launch = launchGraph()){
  const lazy = new Set();
  const seen = new Set();
  let frontier = [...launch.keys()];
  while(frontier.length){
    const next = [];
    for(const file of frontier){
      if(seen.has(file)) continue;
      seen.add(file);
      for(const target of dynamicImports(file)){
        for(const dep of staticGraph([target]).keys()){
          if(!launch.has(dep) && !lazy.has(dep)){ lazy.add(dep); next.push(dep); }
        }
      }
    }
    frontier = next;
  }
  return lazy;
}

// sw.js's SHELL_FILES, as repo paths ('./' is index.html).
export function shellFiles(){
  const sw = readFileSync(resolve(ROOT, 'sw.js'), 'utf8');
  const list = sw.match(/const SHELL_FILES = \[([\s\S]*?)\];/);
  if(!list) throw new Error('SHELL_FILES not found in sw.js');
  return [...list[1].matchAll(/'([^']+)'/g)].map(m => m[1].replace(/^\.\//, '') || 'index.html');
}

export const kb = files => Math.round([...files].reduce((sum, f) => sum + statSync(resolve(ROOT, f)).size, 0) / 1024);
export const exists = file => existsSync(resolve(ROOT, file));

if(process.argv[1] === fileURLToPath(import.meta.url)){
  const launch = launchGraph();
  const perDepth = {};
  launch.forEach(d => { perDepth[d] = (perDepth[d] || 0) + 1; });
  const lazy = lazyModules(launch);
  console.log(`Launch: ${launch.size} modules, ${kb(launch.keys())} KB, ${Math.max(...launch.values())} round trips deep`);
  console.log(`  modules per round trip: ${Object.entries(perDepth).map(([d, n]) => `${d}:${n}`).join(' ')}`);
  console.log(`On first use: ${lazy.size} modules, ${kb(lazy)} KB`);
}
