/* ============================================================
   Turns a finished draft (the DraftRoom's /draft/result JSON) into the
   next season's data file (js/seasons/<year>.js) — the "handoff" half
   of docs/draft-room-plan.md. Pure logic, no file or network access of
   its own (the CLI, tools/export-draft.mjs, does that), so it is fully
   unit-tested (tests/draft-export.test.mjs) with a stubbed ESPN lookup.

   What it does with each drafted team:
   1. Looks it up by league + name in the previous season's TEAM_META
      and copies that entry (live-data ids, colors, badge — everything
      the app already knows), swapping in the new owner.
   2. Otherwise (a team nobody owned last year: a promoted club, an
      expansion team, a write-in school) it is resolved against ESPN's
      team list and an entry is generated from that. Generated entries
      are flagged in the file and in the report for a human to glance at.
   3. If ESPN can't place it (or finds it ambiguous), it is reported as
      unresolved and the export refuses to write anything until the
      commissioner supplies an override (a team name -> ESPN id map).

   The app finds a team's live data mostly by NAME (see live-data.js:
   pro leagues match ESPN rows by nickname, CFB by school/location) and
   College Basketball by a static espnTeamId, so a generated entry needs
   `name` in the same style as the existing ones: nickname for pro
   leagues, school for college, ESPN's short club name for the EPL.
   ============================================================ */

export const ESPN_SPORT_PATH = {
  epl: 'soccer/eng.1',
  nfl: 'football/nfl',
  nba: 'basketball/nba',
  nhl: 'hockey/nhl',
  mlb: 'baseball/mlb',
  wnba: 'basketball/wnba',
  cfb: 'football/college-football',
  mcbb: 'basketball/mens-college-basketball'
};

const ESPN_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports';
const COLLEGE = new Set(['cfb', 'mcbb']);

export const normalize = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

export function slugify(name){
  return String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '').slice(0, 40);
}

// ---- ESPN ----

// One league's whole team list, normalized to the few fields we use.
// `fetchImpl` is injectable for tests.
export async function fetchEspnTeams(league, fetchImpl = fetch){
  const path = ESPN_SPORT_PATH[league];
  if(!path) throw new Error(`no ESPN path for league ${league}`);
  const res = await fetchImpl(`${ESPN_BASE}/${path}/teams?limit=1000`);
  if(!res.ok) throw new Error(`ESPN ${league} teams: HTTP ${res.status}`);
  const json = await res.json();
  const raw = ((json.sports || [])[0] || {}).leagues;
  const teams = (((raw || [])[0] || {}).teams || []).map(t => t.team).filter(Boolean);
  return teams.map(t => ({
    id: String(t.id),
    name: t.name || '',
    location: t.location || '',
    displayName: t.displayName || '',
    shortDisplayName: t.shortDisplayName || '',
    abbr: t.abbreviation || '',
    color: /^[0-9a-f]{6}$/i.test(t.color || '') ? t.color.toLowerCase() : null,
    logo: (t.logos && t.logos[0] && t.logos[0].href) || null
  }));
}

// Finds one team by the name the draft used. Returns { team } on a single
// confident match, { ambiguous: [...] } if several tie, or { none, suggestions }.
export function findEspnTeam(list, league, name){
  const target = normalize(name);
  const keysOf = t => COLLEGE.has(league)
    ? [t.location, t.displayName, t.shortDisplayName]
    : [t.name, t.displayName, t.shortDisplayName, t.location && t.name && `${t.location} ${t.name}`];
  const passes = [
    t => keysOf(t).some(k => normalize(k) === target),
    // A school typed as "Oregon" against displayName "Oregon Ducks": only if it's the sole word-boundary prefix.
    t => normalize(t.displayName).startsWith(target) && t.displayName.toLowerCase().startsWith(String(name).toLowerCase() + ' ')
  ];
  for(const pass of passes){
    const hits = list.filter(pass);
    if(hits.length === 1) return { team: hits[0] };
    if(hits.length > 1) return { ambiguous: hits.slice(0, 6) };
  }
  const suggestions = list
    .map(t => ({ t, score: similarity(target, normalize(COLLEGE.has(league) ? t.location : t.name)) }))
    .filter(x => x.score > 0.5).sort((a, b) => b.score - a.score).slice(0, 3).map(x => x.t);
  return { none: true, suggestions };
}

function similarity(a, b){
  if(!a || !b) return 0;
  if(a === b) return 1;
  if(a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) / Math.max(a.length, b.length) + 0.3;
  let same = 0;
  for(const ch of new Set(a)) if(b.includes(ch)) same++;
  return same / Math.max(new Set(a).size, new Set(b).size);
}

// ---- Entries ----

function textOn(hex){
  const n = parseInt(hex.replace('#', ''), 16);
  const lum = (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum > 0.62 ? '#000000' : '#FFFFFF';
}

// A TEAM_META entry built from ESPN alone, in the existing style.
export function entryFromEspn(league, drafter, espn){
  const accent = espn.color ? '#' + espn.color.toUpperCase() : '#444444';
  const college = COLLEGE.has(league);
  const entry = {
    name: college ? espn.location : espn.name,
    leagueKey: league,
    draftTeamId: drafter,
    boardSub: league === 'epl' ? 'Premier League' : (college ? espn.name : espn.location),
    sub: league === 'epl' ? '' : (college ? espn.name : espn.location),
    accent,
    badgeStyle: `background:${accent}; color:${textOn(accent)};`,
    badgeText: espn.abbr || espn.name.slice(0, 4).toUpperCase(),
    sportsdbId: null
  };
  if(league === 'cfb') entry.recentLabel = 'Results So Far';
  entry.espnTeamId = espn.id;
  if(espn.logo) entry.badgeUrl = espn.logo;
  return entry;
}

// The previous season's entry for this team, minus anything owner-specific.
function fromTemplate(template, drafter){
  const { draftTeamId, favoriteOnly, ...rest } = template;
  const entry = { name: rest.name, leagueKey: rest.leagueKey, draftTeamId: drafter };
  Object.keys(rest).forEach(k => { if(!(k in entry)) entry[k] = rest[k]; });
  return entry;
}

function seasonLabel(league, year){
  const yy = n => String(n).slice(-2);
  if(league === 'nfl' || league === 'cfb') return `'${yy(year)} Season`;
  if(league === 'mlb' || league === 'wnba') return `'${yy(year + 1)} Season`;
  return `'${yy(year)}/'${yy(year + 1)} Season`;
}

// ---- The export ----

// result:      the /draft/result JSON
// prev:        the previous season's { TEAM_META, LEAGUES, PRIOR_SEASON_DISPLAY_LEAGUES }
// year:        the new class's year (e.g. 2027)
// drafterIds:  who is allowed to own teams (DRAFT_TEAMS ids)
// espn:        async (league) => normalized team list (fetchEspnTeams, or a stub)
// overrides:   { 'league:Name': espnTeamId } for teams ESPN couldn't place unaided
export async function buildSeason({ result, prev, year, drafterIds, espn, overrides = {}, allowPartial = false }){
  const problems = [];
  const notes = [];
  const picks = (result.picks || []).slice().sort((a, b) => a.slot - b.slot);
  const caps = (result.config && result.config.caps) || {};
  const total = Object.values(caps).reduce((s, n) => s + n, 0) * ((result.config && result.config.drafters) || []).length;

  if(!result.complete && !allowPartial) problems.push('The draft is not complete (phase: ' + result.phase + ').');
  if(result.complete && picks.length !== total) problems.push(`Expected ${total} picks, found ${picks.length}.`);

  // Roster sanity: every drafter at exactly their caps.
  const counts = {};
  picks.forEach(p => {
    if(!drafterIds.includes(p.drafter)) problems.push(`Pick ${p.slot + 1} belongs to unknown drafter "${p.drafter}".`);
    if(!p.team) { problems.push(`Pick ${p.slot + 1} has no team record.`); return; }
    const c = counts[p.drafter] || (counts[p.drafter] = {});
    c[p.team.league] = (c[p.team.league] || 0) + 1;
  });
  if(result.complete){
    (result.config.drafters || []).forEach(d => {
      Object.keys(caps).forEach(lg => {
        const have = (counts[d] || {})[lg] || 0;
        if(have !== caps[lg]) problems.push(`${d} has ${have} ${lg} teams, expected ${caps[lg]}.`);
      });
    });
  }
  const seenTeams = new Set();
  picks.forEach(p => {
    if(p.team && seenTeams.has(p.team.id)) problems.push(`Team ${p.team.id} was drafted twice.`);
    if(p.team) seenTeams.add(p.team.id);
  });

  const templates = new Map();
  const templatesByEspn = new Map();
  Object.values(prev.TEAM_META).forEach(m => {
    if(m.favoriteOnly) return;
    templates.set(`${m.leagueKey}:${normalize(m.name)}`, m);
    if(m.espnTeamId) templatesByEspn.set(`${m.leagueKey}:${m.espnTeamId}`, m);
  });

  const espnLists = {};
  const listFor = async league => espnLists[league] || (espnLists[league] = await espn(league));

  const meta = {};
  const keysByLeague = {};
  const usedKeys = new Set();
  const generated = [];
  const unresolved = [];

  for(const p of picks){
    if(!p.team) continue;
    const { league, name } = p.team;
    const template = (p.team.espnTeamId && templatesByEspn.get(`${league}:${p.team.espnTeamId}`)) || templates.get(`${league}:${normalize(name)}`);
    let entry;
    if(template){
      entry = fromTemplate(template, p.drafter);
    } else {
      let hit = null;
      const forced = overrides[`${league}:${name}`] || p.team.espnTeamId;
      let list;
      try { list = await listFor(league); } catch (e){ list = null; notes.push(`ESPN ${league} lookup failed: ${e.message}`); }
      if(list){
        if(forced) hit = list.find(t => t.id === String(forced)) || null;
        if(!hit){
          const found = findEspnTeam(list, league, name);
          if(found.team) hit = found.team;
          else unresolved.push({ pick: p.slot + 1, league, name, drafter: p.drafter, candidates: (found.ambiguous || found.suggestions || []).map(t => `${t.displayName} (${t.id})`) });
        }
      } else {
        unresolved.push({ pick: p.slot + 1, league, name, drafter: p.drafter, candidates: [] });
      }
      if(!hit) continue;
      entry = entryFromEspn(league, p.drafter, hit);
      generated.push({ pick: p.slot + 1, league, drafter: p.drafter, drafted: name, name: entry.name, espnTeamId: hit.id });
      entry.__generated = true;
    }

    // `<owner>_<slug>`; the same school in two leagues for one owner gets a
    // league suffix on the second (the existing convention: donny_louisville_cbb).
    let key = `${p.drafter}_${slugify(entry.name)}`;
    if(usedKeys.has(key)) key += league === 'mcbb' ? '_cbb' : `_${league}`;
    const base = key;
    for(let n = 2; usedKeys.has(key); n++) key = `${base}_${n}`;
    usedKeys.add(key);
    meta[key] = entry;
    (keysByLeague[league] || (keysByLeague[league] = [])).push(key);
  }

  if(unresolved.length){
    unresolved.forEach(u => problems.push(`Could not place pick ${u.pick} (${u.league}: ${u.name}, ${u.drafter}) on ESPN.${u.candidates.length ? ' Did you mean: ' + u.candidates.join('; ') + '?' : ''}`));
  }

  // Favorite-only teams (nobody's roster) carry over untouched, at the end of their league.
  const favorites = Object.entries(prev.TEAM_META).filter(([, m]) => m.favoriteOnly);
  const leagues = prev.LEAGUES.map(l => {
    const teams = (keysByLeague[l.key] || []).slice();
    favorites.forEach(([key, m]) => { if(m.leagueKey === l.key){ meta[key] = m; teams.push(key); } });
    return { key: l.key, label: l.label, season: seasonLabel(l.key, year), teams };
  });

  return { ok: problems.length === 0, problems, notes, meta, leagues, generated, unresolved, priorSeasonLeagues: prev.PRIOR_SEASON_DISPLAY_LEAGUES || [] };
}

// ---- Serialization (matches the hand-written style of js/data.js) ----

// Single quotes like the rest of the codebase, switching to double quotes
// for a string that contains an apostrophe ("'27 Season").
const q = v => {
  const str = String(v);
  if(str.includes("'") && !str.includes('"') && !str.includes('\\')) return `"${str}"`;
  return `'${str.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
};
const val = v => (v === null ? 'null' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : q(v));

function entryLine(key, entry){
  const { __generated, ...rest } = entry;
  const body = Object.keys(rest).map(k => `${k}:${val(rest[k])}`).join(', ');
  return `  ${key}: { ${body} }`;
}

export function renderSeasonModule({ built, year, prevYear, roomLabel, generatedOn }){
  const keys = Object.keys(built.meta);
  const lines = keys.map((k, i) => entryLine(k, built.meta[k]) + (i < keys.length - 1 ? ',' : '') + (built.meta[k].__generated ? ' // generated from ESPN — check name/colors' : ''));
  const leagues = built.leagues.map(l => `  { key:${q(l.key)}, label:${q(l.label)}, season:${q(l.season)}, teams:[${l.teams.map(q).join(', ')}] }`).join(',\n');
  return `/* ============================================================
   The ${year} draft class: every drafter's teams and the league tab
   order. Generated by tools/export-draft.mjs on ${generatedOn} from
   ${roomLabel} — review the diff, then commit. Entries marked
   "generated from ESPN" were not in the ${prevYear} class, so their
   name/colors/badge come from ESPN rather than a hand-checked entry.
   Scoring rules start as a copy of the ${prevYear} class's; give this
   class its own LEAGUE_SCORING here if the rules change.
   ============================================================ */
import { LEAGUE_SCORING as PREVIOUS_SCORING } from './${prevYear}.js';

export const TEAM_META = {
${lines.join('\n')}
};

export const LEAGUES = [
${leagues}
];

export const PRIOR_SEASON_DISPLAY_LEAGUES = [${built.priorSeasonLeagues.map(q).join(', ')}];

export const LEAGUE_SCORING = PREVIOUS_SCORING;
`;
}

// Adds the new class to the registry (js/seasons/index.js) — idempotent.
export function updateRegistry(source, year){
  if(source.includes(`'./${year}.js'`)) return source;
  const importLine = `import * as s${year} from './${year}.js';`;
  const importRe = /^import \* as s\d+ from '\.\/\d+\.js';$/gm;
  let last = null, m;
  while((m = importRe.exec(source))) last = m;
  if(!last) throw new Error('could not find the season imports in js/seasons/index.js');
  let out = source.slice(0, last.index + last[0].length) + '\n' + importLine + source.slice(last.index + last[0].length);
  const entryRe = /(  '\d+': \{ id: '\d+', label: '[^']*', \.\.\.s\d+ \})(\n\};)/;
  if(!entryRe.test(out)) throw new Error('could not find the SEASONS map in js/seasons/index.js');
  out = out.replace(entryRe, `$1,\n  '${year}': { id: '${year}', label: '${year} Draft', ...s${year} }$2`);
  return out;
}
