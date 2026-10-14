#!/usr/bin/env node
/* ============================================================
   Saves ESPN's team lists into the app (js/seasons/espn-teams.js), for
   building a draft class: every team a draft can take that no earlier
   class had (a promoted club, a school nobody drafted last year) gets
   its name, nickname, colors and crest from here.

     node tools/espn-teams.mjs              # fetch every league, write the file
     node tools/espn-teams.mjs --dry-run    # fetch and report, write nothing

   Why a saved copy instead of asking ESPN at draft time: the app builds
   the new class on each device the moment a draft ends (js/live-class.js),
   and ESPN's /teams lists can't be read from a browser (no CORS headers)
   or from the Cloudflare worker (ESPN answers it 403). A saved copy also
   means every device, and tools/export-draft.mjs, build from the same
   data, so team keys agree.

   Run it before each season's drafts (docs/draft-room-plan.md, "Before
   next season's drafts"), read the report of teams added and removed
   since the last run, then commit the file. It's loaded only while a
   class is being built, never at boot.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ESPN_SPORT_PATH, fetchEspnTeams } from '../js/draft-class.js';
import { renderEspnTeamsModule, LOGO_PREFIX } from './draft-export-lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'js/seasons/espn-teams.js');
const dryRun = process.argv.includes('--dry-run');

let previous = {};
if(fs.existsSync(OUT)){
  try { previous = (await import(pathToFileURL(OUT).href)).ESPN_TEAMS || {}; } catch (e){ previous = {}; }
}

const lists = {};
for(const league of Object.keys(ESPN_SPORT_PATH)){
  const teams = await fetchEspnTeams(league);
  if(!teams.length) throw new Error(`ESPN returned no ${league} teams; not writing anything`);
  lists[league] = teams.sort((a, b) => Number(a.id) - Number(b.id));
  const before = new Map((previous[league] || []).map(row => [String(row[0]), row[3]]));
  const now = new Map(teams.map(t => [t.id, t.displayName]));
  const added = [...now].filter(([id]) => !before.has(id)).map(([, n]) => n);
  const removed = [...before].filter(([id]) => !now.has(id)).map(([, n]) => n);
  console.log(`${league.padEnd(5)} ${String(teams.length).padStart(4)} teams` + (previous[league] ? `  +${added.length} -${removed.length}` : '  (new)'));
  if(previous[league]){
    if(added.length) console.log(`        added: ${added.slice(0, 20).join(', ')}${added.length > 20 ? ', …' : ''}`);
    if(removed.length) console.log(`        removed: ${removed.slice(0, 20).join(', ')}${removed.length > 20 ? ', …' : ''}`);
  }
}

const file = renderEspnTeamsModule({ lists, fetchedOn: new Date().toISOString().slice(0, 10) });
if(dryRun){
  console.log(`\n--dry-run: nothing written (${Math.round(file.length / 1024)} KB).`);
} else {
  fs.writeFileSync(OUT, file);
  console.log(`\nWrote ${path.relative(root, OUT)} (${Math.round(file.length / 1024)} KB). Crests not under ${LOGO_PREFIX} are kept whole. Review \`git diff --stat\`, then commit.`);
}
