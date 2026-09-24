#!/usr/bin/env node
/* ============================================================
   Export a finished draft into the next season's data file.

     node tools/export-draft.mjs                       # real room ("main"), next year, from the newest season
     node tools/export-draft.mjs --result http://localhost:8787/draft/result?room=mock-1 --dry-run
     node tools/export-draft.mjs --result saved-result.json --year 2027 --overrides overrides.json

   Options
     --result <url|file>   the DraftRoom's /draft/result JSON (default: the deployed worker, room "main")
     --year <yyyy>         the new class's year (default: newest season + 1)
     --prev <yyyy>         season to copy team entries and scoring from (default: newest season)
     --overrides <file>    JSON { "league:Team Name": "<espnTeamId>" } for teams ESPN can't place unaided
     --out <file>          write the season module here instead of js/seasons/<year>.js
                           (registry and service worker are left alone when --out is used)
     --dry-run             print the report and the file, write nothing
     --allow-partial       accept an unfinished draft (for rehearsals)
     --offline             skip ESPN; teams not in the previous season are reported unresolved

   Writes js/seasons/<year>.js, registers it in js/seasons/index.js and
   adds it to sw.js's shell list. Nothing is deployed: review the diff
   and commit. See docs/draft-room-plan.md.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildSeason, fetchEspnTeams, renderSeasonModule, updateRegistry } from './draft-export-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_RESULT = 'https://team-dashboard-rundown-proxy.boxscore.workers.dev/draft/result?room=main';

function parseArgs(argv){
  const args = { flags: new Set() };
  for(let i = 0; i < argv.length; i++){
    const a = argv[i];
    if(!a.startsWith('--')) continue;
    const key = a.slice(2);
    if(['dry-run', 'allow-partial', 'offline'].includes(key)) args.flags.add(key);
    else args[key] = argv[++i];
  }
  return args;
}

async function loadResult(source){
  if(/^https?:\/\//.test(source)){
    const res = await fetch(source, { headers: { Origin: 'https://boxscorethedraft.pages.dev' } });
    if(!res.ok) throw new Error(`fetching the draft result: HTTP ${res.status}`);
    return res.json();
  }
  return JSON.parse(fs.readFileSync(source, 'utf8'));
}

const args = parseArgs(process.argv.slice(2));
const registrySource = fs.readFileSync(path.join(root, 'js/seasons/index.js'), 'utf8');
const existingYears = [...registrySource.matchAll(/import \* as s(\d+) from/g)].map(m => Number(m[1])).sort((a, b) => a - b);
const prevYear = Number(args.prev || existingYears[existingYears.length - 1]);
const year = Number(args.year || prevYear + 1);
if(!existingYears.includes(prevYear)) throw new Error(`no season file for ${prevYear} (have ${existingYears.join(', ')})`);
if(existingYears.includes(year) && !args.out) throw new Error(`js/seasons/${year}.js already exists — pass --out to write elsewhere, or delete it first`);

const prev = await import(pathToFileURL(path.join(root, `js/seasons/${prevYear}.js`)).href);
const { DRAFT_TEAMS } = await import(pathToFileURL(path.join(root, 'js/data.js')).href);
const source = args.result || DEFAULT_RESULT;
const result = await loadResult(source);
const overrides = args.overrides ? JSON.parse(fs.readFileSync(args.overrides, 'utf8')) : {};

const built = await buildSeason({
  result, prev, year,
  drafterIds: DRAFT_TEAMS.map(d => d.id),
  espn: args.flags.has('offline') ? async () => { throw new Error('offline'); } : league => fetchEspnTeams(league),
  overrides,
  allowPartial: args.flags.has('allow-partial')
});

const total = Object.keys(built.meta).length;
console.log(`Draft ${year} from ${source}\n  ${result.picks.length} picks -> ${total} team entries (previous season: ${prevYear})`);
if(built.generated.length){
  console.log(`\nGenerated from ESPN (not in the ${prevYear} class) — glance at these:`);
  built.generated.forEach(g => console.log(`  pick ${g.pick}  ${g.league.padEnd(4)} ${g.drafter.padEnd(11)} drafted "${g.drafted}" -> ${g.name} (ESPN ${g.espnTeamId})`));
}
built.notes.forEach(n => console.log('  note: ' + n));
if(!built.ok){
  console.error('\nNot exporting — fix these first:');
  built.problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}

const file = renderSeasonModule({ built, year, prevYear, roomLabel: source.replace(/^https?:\/\/[^/]+/, '') || source, generatedOn: new Date().toISOString().slice(0, 10) });
if(args.flags.has('dry-run')){
  console.log('\n--dry-run: nothing written. First lines of the file:\n');
  console.log(file.split('\n').slice(0, 24).join('\n'));
  process.exit(0);
}
const out = args.out ? path.resolve(args.out) : path.join(root, `js/seasons/${year}.js`);
fs.writeFileSync(out, file);
console.log(`\nWrote ${path.relative(root, out)}`);
if(!args.out){
  fs.writeFileSync(path.join(root, 'js/seasons/index.js'), updateRegistry(registrySource, year));
  const swPath = path.join(root, 'sw.js');
  const sw = fs.readFileSync(swPath, 'utf8');
  if(!sw.includes(`./js/seasons/${year}.js`)){
    fs.writeFileSync(swPath, sw.replace(`  './js/seasons/${prevYear}.js',\n`, `  './js/seasons/${prevYear}.js',\n  './js/seasons/${year}.js',\n`));
  }
  console.log(`Registered ${year} in js/seasons/index.js and sw.js. Review \`git diff\`, then commit.`);
}
