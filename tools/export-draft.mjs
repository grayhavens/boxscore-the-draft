#!/usr/bin/env node
/* ============================================================
   Export a finished draft into the next season's data file.

     node tools/export-draft.mjs                       # real room ("main"), next year, from the newest season
     node tools/export-draft.mjs --group seasonticket  # another group's room, writes js/seasons/seasonticket-<year>.js
     node tools/export-draft.mjs --result http://localhost:8787/draft/result?room=mock-1 --dry-run
     node tools/export-draft.mjs --result saved-result.json --year 2027 --overrides overrides.json

   Options
     --group <id>          the friend group whose draft this is (default: The Draft). Uses that group's
                           drafters and caps, reads its room, and writes js/seasons/<group>-<year>.js
     --result <url|file>   the DraftRoom's /draft/result JSON (default: the deployed worker, room "main")
     --year <yyyy>         the new class's year (default: newest season + 1)
     --prev <yyyy>         season to copy team entries and scoring from (default: newest season)
     --overrides <file>    JSON { "league:Team Name": "<espnTeamId>" } for teams ESPN can't place unaided
     --out <file>          write the season module here instead of js/seasons/<year>.js
                           (registry and service worker are left alone when --out is used)
     --dry-run             print the report and the file, write nothing
     --allow-partial       accept an unfinished draft (for rehearsals)
     --offline             skip ESPN; teams not in the previous season are reported unresolved

   Writes js/seasons/<year>.js, registers it in js/seasons/the-draft.js and
   adds it to sw.js's shell list. For another group the class is
   js/seasons/<group>-<year>.js, registered in js/seasons/<group>.js (created
   on its first export) and listed in js/seasons/index.js. A group's first
   class copies team entries and scoring from The Draft's newest class and
   takes The Draft's newest year (what its pre-draft class shows). Nothing is deployed: review the diff
   and commit. See docs/draft-room-plan.md.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LEGACY_GROUP_ID, GROUPS, isKnownGroup, drafterIdsFor, groupCaps } from '../js/groups.js';
import { buildSeason, fetchEspnTeams, renderSeasonModule, updateRegistry, seasonFileFor, renderGroupRegistry, updateIndexRegistry, addShellFiles } from './draft-export-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKER = 'https://team-dashboard-rundown-proxy.boxscore.workers.dev';

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
const group = args.group || LEGACY_GROUP_ID;
if(!isKnownGroup(group)) throw new Error(`unknown group "${group}" (have ${Object.keys(GROUPS).join(', ')})`);
const legacy = group === LEGACY_GROUP_ID;
// The Draft sends no group param (legacy room names); every other group names itself.
const DEFAULT_RESULT = `${WORKER}/draft/result?room=main${legacy ? '' : `&group=${group}`}`;

const theDraftRegistry = fs.readFileSync(path.join(root, 'js/seasons/the-draft.js'), 'utf8');
const yearsIn = src => [...src.matchAll(/import \* as s(\d+) from/g)].map(m => Number(m[1])).sort((a, b) => a - b);
const theDraftYears = yearsIn(theDraftRegistry);
const registryPath = path.join(root, legacy ? 'js/seasons/the-draft.js' : `js/seasons/${group}.js`);
const registrySource = fs.existsSync(registryPath) ? fs.readFileSync(registryPath, 'utf8') : null;
const existingYears = registrySource ? yearsIn(registrySource) : [];

// A group with no class yet starts from The Draft's newest (its pre-draft
// class borrows that id, js/seasons/index.js), so the first class is that year.
const firstClass = !existingYears.length;
const prevYear = Number(args.prev || (firstClass ? theDraftYears[theDraftYears.length - 1] : existingYears[existingYears.length - 1]));
const year = Number(args.year || (firstClass ? prevYear : prevYear + 1));
const prevFile = legacy || firstClass ? `${prevYear}.js` : seasonFileFor(group, prevYear, LEGACY_GROUP_ID);
if(!args.prev && !firstClass && !existingYears.includes(prevYear)) throw new Error(`no season file for ${prevYear} (have ${existingYears.join(', ')})`);
if(existingYears.includes(year) && !args.out) throw new Error(`js/seasons/${seasonFileFor(group, year, LEGACY_GROUP_ID)} already exists — pass --out to write elsewhere, or delete it first`);

const prev = await import(pathToFileURL(path.join(root, `js/seasons/${prevFile}`)).href);
const { DRAFT_TEAMS } = await import(pathToFileURL(path.join(root, 'js/data.js')).href);
const source = args.result || DEFAULT_RESULT;
const result = await loadResult(source);
const overrides = args.overrides ? JSON.parse(fs.readFileSync(args.overrides, 'utf8')) : {};

const built = await buildSeason({
  result, prev, year,
  drafterIds: legacy ? DRAFT_TEAMS.map(d => d.id) : drafterIdsFor(group),
  espn: args.flags.has('offline') ? async () => { throw new Error('offline'); } : league => fetchEspnTeams(league),
  overrides,
  allowPartial: args.flags.has('allow-partial'),
  onlyDrafted: !legacy && !!groupCaps(group)
});

const total = Object.keys(built.meta).length;
console.log(`${GROUPS[group].name} draft ${year} from ${source}\n  ${result.picks.length} picks -> ${total} team entries (previous season: ${prevYear})`);
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

const file = renderSeasonModule({ built, year, prevYear, roomLabel: source.replace(/^https?:\/\/[^/]+/, '') || source, generatedOn: new Date().toISOString().slice(0, 10), prevFile: `./${prevFile}`, addPgaScoring: built.leagues.some(l => l.key === 'pga') && !(prev.LEAGUE_SCORING && prev.LEAGUE_SCORING.pga) });
if(args.flags.has('dry-run')){
  console.log('\n--dry-run: nothing written. First lines of the file:\n');
  console.log(file.split('\n').slice(0, 24).join('\n'));
  process.exit(0);
}
const seasonFile = seasonFileFor(group, year, LEGACY_GROUP_ID);
const out = args.out ? path.resolve(args.out) : path.join(root, `js/seasons/${seasonFile}`);
fs.writeFileSync(out, file);
console.log(`\nWrote ${path.relative(root, out)}`);
if(!args.out){
  const swPath = path.join(root, 'sw.js');
  let sw = fs.readFileSync(swPath, 'utf8');
  if(legacy){
    fs.writeFileSync(registryPath, updateRegistry(registrySource, year));
    sw = addShellFiles(sw, [seasonFile], seasonFileFor(group, prevYear, LEGACY_GROUP_ID));
    console.log(`Registered ${year} in js/seasons/the-draft.js and sw.js. Review \`git diff\`, then commit.`);
  } else {
    fs.writeFileSync(registryPath, registrySource ? updateRegistry(registrySource, year, seasonFile) : renderGroupRegistry({ group, name: GROUPS[group].name, year }));
    const indexPath = path.join(root, 'js/seasons/index.js');
    fs.writeFileSync(indexPath, updateIndexRegistry(fs.readFileSync(indexPath, 'utf8'), group));
    sw = addShellFiles(sw, [`${group}.js`, seasonFile], 'pre-draft.js');
    console.log(`Registered ${year} in js/seasons/${group}.js, js/seasons/index.js and sw.js. Review \`git diff\`, then commit.`);
  }
  fs.writeFileSync(swPath, sw);
}
