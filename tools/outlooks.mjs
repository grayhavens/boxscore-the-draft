#!/usr/bin/env node
/* ============================================================
   Helper for writing the draft room's season outlooks (js/draft-outlooks.js)
   by hand, or in a Claude Code session: no API key, no dependencies.

   1. See each team's facts (the same ESPN numbers its sheet shows) and
      which ones still need an outlook:
        node tools/outlooks.mjs facts [--league nfl] [--missing] [--group seasonticket]
   2. Write the outlooks into a JSON file, { "<poolId>": "text", ... }, and
      merge it in (stamped with today's date; other teams are untouched):
        node tools/outlooks.mjs apply outlooks.json [--group seasonticket]

   --group picks whose next draft the outlooks are for, which sets the
   draft class they're filed under (seasonticket -> 2026, thedraft -> 2027).
   Read the diff before committing.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(root, 'js/draft-outlooks.js');
const MAX_LENGTH = 480;

const args = process.argv.slice(2);
const command = args[0];
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};
const GROUP = option('group', 'seasonticket');

if(command !== 'facts' && command !== 'apply'){
  console.error('Usage: node tools/outlooks.mjs facts [--league <key>] [--missing] | apply <file.json>  [--group <id>]');
  process.exit(1);
}

// The app's modules, loaded as the browser would for that group.
const memory = new Map();
globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, v), removeItem: k => memory.delete(k) };
globalThis.window = globalThis;
globalThis.location = new URL(`http://localhost/?group=${encodeURIComponent(GROUP)}`);
globalThis.document = { documentElement: { classList: { add(){}, remove(){} } }, addEventListener(){}, getElementById(){ return null; } };

const appModule = rel => import(pathToFileURL(path.join(root, 'js', rel)).href);
const { ACTIVE_GROUP_ID } = await appModule('group.js');
if(ACTIVE_GROUP_ID !== GROUP){
  console.error(`Unknown group "${GROUP}" (see js/groups.js).`);
  process.exit(1);
}
const { NEXT_DRAFT_YEAR, TEAM_CATALOG_SEASON } = await appModule('seasons/index.js');
const { buildDraftPool } = await appModule('draft-pool.js');
const { scoutTeam, hasScouting } = await appModule('draft-scout.js');
const { DRAFT_OUTLOOKS } = await appModule('draft-outlooks.js');

const CLASS = String(NEXT_DRAFT_YEAR);
const pool = buildDraftPool().filter(hasScouting);

// ---- facts ----

// scoutTeam answers from cache and fetches in the background; poll until
// everything it can load has landed (or give up after 20s).
async function scout(team){
  const done = sc => sc && sc.last !== undefined && sc.odds !== undefined && !(sc.last && sc.last.postLabel && sc.last.post === undefined);
  for(let i = 0; i < 80; i++){
    const sc = scoutTeam(team);
    if(done(sc)) return sc;
    await new Promise(r => setTimeout(r, 250));
  }
  return scoutTeam(team);
}

function factsLine(team, sc){
  const bits = [];
  if(team.rank) bits.push(`#${team.rank} ranked`);
  const last = sc.last;
  if(last && last.absent) bits.push(`${sc.lastLabel}: ${last.absent}`);
  else if(last){
    const detail = [last.record];
    if(last.finish) detail.push(`${last.finish.label} ${last.finish.value}`);
    if(last.points != null) detail.push(`${last.points} pts`);
    if(last.note) detail.push(last.note);
    if(last.post) detail.push(last.post);
    bits.push(`${sc.lastLabel}${last.ongoing ? ' (in progress)' : ''}: ${detail.join(', ')}`);
  }
  if(sc.now) bits.push(`${sc.nowLabel} so far: ${sc.now.record}`);
  (sc.odds || []).forEach(o => bits.push(`${o.label} ${o.odds}${o.rank ? ` (${o.rank}/${o.of})` : ''}`));
  return bits.join(' | ');
}

if(command === 'facts'){
  const league = option('league', null);
  const missingOnly = args.includes('--missing');
  const have = DRAFT_OUTLOOKS[CLASS] || {};
  let teams = pool.filter(t => !league || t.league === league);
  if(missingOnly) teams = teams.filter(t => !have[t.id]);
  console.log(`${teams.length} teams, ${CLASS} draft class (${GROUP}).`);
  const leagues = [...new Set(teams.map(t => t.league))];
  for(const key of leagues){
    const scoring = TEAM_CATALOG_SEASON.LEAGUE_SCORING[key];
    console.log(`\n== ${key}`);
    if(scoring){
      const rules = scoring.rules.map(r => `${r.label} ${r.pts > 0 ? '+' : ''}${r.pts}`);
      if(scoring.bonus) rules.push(`bonus: ${scoring.bonus.label} +${scoring.bonus.pts}`);
      console.log(`scoring: ${rules.join('; ')}`);
    }
    const inLeague = teams.filter(t => t.league === key);
    const facts = await Promise.all(inLeague.map(async t => [t, await scout(t)]));
    facts.forEach(([t, sc]) => console.log(`${t.id}${have[t.id] ? ' [has outlook]' : ''} — ${t.name} — ${factsLine(t, sc)}`));
  }
  process.exit(0);
}

// ---- apply ----

const file = args[1];
if(!file || !fs.existsSync(file)){
  console.error('apply needs a JSON file: { "<poolId>": "outlook text", ... }');
  process.exit(1);
}
const incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
const ids = new Set(pool.map(t => t.id));
const problems = [];
Object.entries(incoming).forEach(([id, text]) => {
  if(!ids.has(id)) problems.push(`${id}: not a pool team id`);
  else if(typeof text !== 'string' || !text.trim()) problems.push(`${id}: empty`);
  else if(text.length > MAX_LENGTH) problems.push(`${id}: ${text.length} characters (max ${MAX_LENGTH})`);
});
if(problems.length){
  console.error(`Nothing written; fix these first:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const outlooks = structuredClone(DRAFT_OUTLOOKS);
const today = new Date().toISOString().slice(0, 10);
outlooks[CLASS] = { ...(outlooks[CLASS] || {}) };
Object.entries(incoming).forEach(([id, text]) => { outlooks[CLASS][id] = { text: text.replace(/\s+/g, ' ').trim(), at: today }; });

const sorted = Object.fromEntries(Object.keys(outlooks).sort().map(year =>
  [year, Object.fromEntries(Object.keys(outlooks[year]).sort().map(id => [id, outlooks[year][id]]))]));
const source = fs.readFileSync(OUT_FILE, 'utf8');
const header = source.slice(0, source.indexOf('export const DRAFT_OUTLOOKS'));
fs.writeFileSync(OUT_FILE, `${header}export const DRAFT_OUTLOOKS = ${JSON.stringify(sorted, null, 2)};\n`);
console.log(`Wrote ${Object.keys(incoming).length} outlooks to js/draft-outlooks.js (${CLASS} class, ${Object.keys(outlooks[CLASS]).length} total).`);
process.exit(0);
