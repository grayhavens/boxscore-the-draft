/* ============================================================
   Builds a draft class from a finished draft (the DraftRoom's
   /draft/result JSON): every drafter's TEAM_META entries and the league
   tabs. Pure logic plus one injectable ESPN lookup, so it runs in three
   places with the same result:
   - the app, the moment a draft ends (js/live-class.js), which is how a
     group sees its new teams without anyone exporting or deploying;
   - tools/export-draft.mjs, which writes the same class out as a
     reviewed, committed js/seasons/ file (tools/draft-export-lib.mjs);
   - Node tests (tests/draft-export.test.mjs) with a stubbed ESPN.
   Keys come out the same in all three, so points saved against the live
   class carry over when it's exported.

   What it does with each drafted team:
   1. Looks it up by league + name in the previous season's TEAM_META
      and copies that entry (live-data ids, colors, badge — everything
      the app already knows), swapping in the new owner.
   2. Otherwise (a team nobody owned last year: a promoted club, an
      expansion team, a write-in school) it is resolved against ESPN's
      team list and an entry is generated from that. Generated entries
      are flagged in the file and in the report for a human to glance at.
   3. If ESPN can't place it (or finds it ambiguous), the export reports
      it as unresolved and refuses to write anything until the
      commissioner supplies an override (a team name -> ESPN id map).
      The app (fallbackToPool) builds a plain entry from the pick's own
      pool record instead, so a write-in still shows up.

   The app finds a team's live data mostly by NAME (see live-data.js:
   pro leagues match ESPN rows by nickname, CFB by school/location) and
   College Basketball by a static espnTeamId, so a generated entry needs
   `name` in the same style as the existing ones: nickname for pro
   leagues, school for college, ESPN's short club name for the EPL.
   ============================================================ */
import { COLLEGE, entryFromEspn, entryFromGolfer, entryFromPool } from './seasons/team-entry.js';

export { entryFromEspn, entryFromGolfer, entryFromPool };


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

// Tab labels for a league no earlier class had.
const NEW_LEAGUE_LABELS = { pga: 'PGA Tour' };

const ESPN_TEAMS_BASE = 'https://site.web.api.espn.com/apis/site/v2/sports';

export const normalize = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');

export function slugify(name){
  return String(name).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '').slice(0, 40);
}

// ---- ESPN ----

// One league's whole team list, normalized to the few fields we use.
// `fetchImpl` is injectable for tests. Node only in practice: ESPN's
// /teams can't be read from a browser (no CORS) or the worker (403), so
// the app reads the saved copy (espnTeamsFromSnapshot).
export async function fetchEspnTeams(league, fetchImpl = fetch){
  const path = ESPN_SPORT_PATH[league];
  if(!path) throw new Error(`no ESPN path for league ${league}`);
  const res = await fetchImpl(`${ESPN_TEAMS_BASE}/${path}/teams?limit=1000`);
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

// ---- The saved copy (js/seasons/espn-teams.js, tools/espn-teams.mjs) ----

// Most crests live here; the saved copy keeps only the rest of the path.
export const ESPN_LOGO_PREFIX = 'https://a.espncdn.com/i/teamlogos/';
// One saved row: [id, name, location, displayName, shortDisplayName, abbr, color, logo].
export const ESPN_ROW_FIELDS = ['id', 'name', 'location', 'displayName', 'shortDisplayName', 'abbr', 'color', 'logo'];

// One league's teams from the saved copy, in fetchEspnTeams's shape, or
// null when the copy doesn't have that league.
export function espnTeamsFromSnapshot(snapshot, league){
  const rows = snapshot && snapshot[league];
  if(!Array.isArray(rows)) return null;
  return rows.map(row => {
    const t = {};
    ESPN_ROW_FIELDS.forEach((field, i) => { t[field] = row[i] ?? (field === 'color' || field === 'logo' ? null : ''); });
    t.id = String(t.id);
    if(t.logo && !/^https:\/\//.test(t.logo)) t.logo = ESPN_LOGO_PREFIX + t.logo;
    return t;
  });
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

// ---- Entries (built in js/seasons/team-entry.js) ----

// The previous season's entry for this team, minus anything owner-specific.
function fromTemplate(template, drafter){
  const { draftTeamId, favoriteOnly, ...rest } = template;
  const entry = { name: rest.name, leagueKey: rest.leagueKey, draftTeamId: drafter };
  Object.keys(rest).forEach(k => { if(!(k in entry)) entry[k] = rest[k]; });
  return entry;
}

export function seasonLabel(league, year){
  const yy = n => String(n).slice(-2);
  if(league === 'nfl' || league === 'cfb') return `'${yy(year)} Season`;
  if(league === 'mlb' || league === 'wnba' || league === 'pga') return `'${yy(year + 1)} Season`;
  return `'${yy(year)}/'${yy(year + 1)} Season`;
}

// ---- The export ----

// result:      the /draft/result JSON
// prev:        the previous season's { TEAM_META, LEAGUES, PRIOR_SEASON_DISPLAY_LEAGUES }
// year:        the new class's year (e.g. 2027)
// drafterIds:  who is allowed to own teams (DRAFT_TEAMS ids)
// espn:        async (league) => normalized team list (fetchEspnTeams, or a stub)
// overrides:   { 'league:Name': espnTeamId } for teams ESPN couldn't place unaided
// fallbackToPool: a team ESPN can't place gets entryFromPool instead of
// blocking (the app's live class). A league whose ESPN list didn't load is
// still unresolved, and listed in `espnFailed`, so the app can try again.
// onProgress: (done, total, pick, entry) after each pick, with the
// TEAM_META entry it got (null if it couldn't be placed), for the app's
// "building your season" screen (js/season-entry.js).
// onlyDrafted: keep only the leagues the draft's caps include (a group that
// doesn't draft every sport; its undrafted sports come back as scores-only
// tabs from the Commissioner page, js/seasons/index.js).
export async function buildSeason({ result, prev, year, drafterIds, espn, overrides = {}, allowPartial = false, onlyDrafted = false, fallbackToPool = false, onProgress = null }){
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
  const espnFailed = [];

  for(const [index, p] of picks.entries()){
    let placed = null;
    try {
      if(!p.team) continue;
      const { league, name } = p.team;
      const template = (p.team.espnTeamId && templatesByEspn.get(`${league}:${p.team.espnTeamId}`)) || templates.get(`${league}:${normalize(name)}`);
      let entry;
      if(league === 'pga' && p.team.espnAthleteId){
        entry = entryFromGolfer(p.drafter, p.team);
      } else if(template){
        entry = fromTemplate(template, p.drafter);
      } else {
        let hit = null;
        const forced = overrides[`${league}:${name}`] || p.team.espnTeamId;
        let list;
        try { list = await listFor(league); } catch (e){
          list = null;
          if(!espnFailed.includes(league)){ espnFailed.push(league); notes.push(`ESPN ${league} lookup failed: ${e.message}`); }
        }
        if(list){
          if(forced) hit = list.find(t => t.id === String(forced)) || null;
          if(!hit){
            const found = findEspnTeam(list, league, name);
            if(found.team) hit = found.team;
            else if(fallbackToPool) entry = entryFromPool(league, p.drafter, p.team);
            else unresolved.push({ pick: p.slot + 1, league, name, drafter: p.drafter, candidates: (found.ambiguous || found.suggestions || []).map(t => `${t.displayName} (${t.id})`) });
          }
        } else {
          unresolved.push({ pick: p.slot + 1, league, name, drafter: p.drafter, candidates: [] });
        }
        if(!hit && !entry) continue;
        if(hit) entry = entryFromEspn(league, p.drafter, hit);
        generated.push({ pick: p.slot + 1, league, drafter: p.drafter, drafted: name, name: entry.name, espnTeamId: hit ? hit.id : (entry.espnTeamId || null) });
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
      placed = entry;
      (keysByLeague[league] || (keysByLeague[league] = [])).push(key);
    } finally {
      if(onProgress) onProgress(index + 1, picks.length, p, placed);
    }
  }

  if(unresolved.length){
    unresolved.forEach(u => problems.push(`Could not place pick ${u.pick} (${u.league}: ${u.name}, ${u.drafter}) on ESPN.${u.candidates.length ? ' Did you mean: ' + u.candidates.join('; ') + '?' : ''}`));
  }

  // Favorite-only teams (nobody's roster) carry over untouched, at the end of their league.
  const favorites = Object.entries(prev.TEAM_META).filter(([, m]) => m.favoriteOnly);
  const leagues = prev.LEAGUES.filter(l => !onlyDrafted || caps[l.key] > 0).map(l => {
    const teams = (keysByLeague[l.key] || []).slice();
    favorites.forEach(([key, m]) => { if(m.leagueKey === l.key){ meta[key] = m; teams.push(key); } });
    return { key: l.key, label: l.label, season: seasonLabel(l.key, year), teams };
  });
  // A league the draft had but the previous class didn't (PGA Tour, for a
  // group whose caps add it) goes last. Golf's next season starts in
  // January, so until then it shows last season's results as not counting.
  const priorSeasonLeagues = (prev.PRIOR_SEASON_DISPLAY_LEAGUES || []).slice();
  Object.keys(keysByLeague).forEach(key => {
    if(leagues.some(l => l.key === key)) return;
    leagues.push({ key, label: NEW_LEAGUE_LABELS[key] || key.toUpperCase(), season: seasonLabel(key, year), teams: keysByLeague[key].slice() });
    if(key === 'pga' && !priorSeasonLeagues.includes(key)) priorSeasonLeagues.push(key);
  });

  return { ok: problems.length === 0, problems, notes, meta, leagues, generated, unresolved, espnFailed, priorSeasonLeagues };
}

// ---- The app's live classes (js/live-class.js) ----

const yearOf = ms => new Date(ms).getUTCFullYear();

// Which classes this device should (re)build, oldest first, from the
// live room's status: the board it's showing once it's done (year =
// its last pick's year) and the boards it archived (`boards`, years).
// Only years after the newest committed class; the current board again
// when its seq moved (a pick edited afterwards); an archived one only if
// it isn't built yet. `stored`: this device's records (js/live-class-store.js).
export function liveClassesToBuild(status, latestCommitted, stored){
  if(!status) return [];
  const current = status.phase === 'done' && Number.isFinite(status.finishedAt) ? yearOf(status.finishedAt) : null;
  const years = new Set((Array.isArray(status.boards) ? status.boards : []).filter(Number.isFinite));
  if(current !== null) years.add(current);
  const have = new Map((stored || []).map(r => [Number(r.year), r]));
  return [...years].sort((a, b) => a - b)
    .filter(y => latestCommitted === null || y > latestCommitted)
    .filter(y => y === current ? !have.has(y) || have.get(y).seq !== status.seq : !have.has(y))
    .map(year => ({ year, current: year === current }));
}

// A stored record as a class, the shape js/seasons/ modules export.
// Scoring is copied from the class it was built against (`base`), like
// the export does, adding PGA Tour's if it drafted golfers.
export function liveClassObject(rec, base, pgaScoring){
  const scoring = (base && base.LEAGUE_SCORING) || {};
  const drafted = rec.leagues.map(l => l.key);
  return {
    id: String(rec.year),
    label: `${rec.year} Draft`,
    live: true,
    TEAM_META: rec.meta,
    LEAGUES: rec.leagues,
    LEAGUE_SCORING: drafted.includes('pga') && !scoring.pga ? { ...scoring, pga: pgaScoring } : scoring,
    PRIOR_SEASON_DISPLAY_LEAGUES: rec.priorSeasonLeagues || []
  };
}

// Every stored record newer than the newest committed class, as classes,
// each built on the one before it (`base` for the first: the newest
// committed class, or The Draft's newest for a group's first draft).
export function liveClassChain(recs, base, latestCommitted, pgaScoring){
  const out = [];
  let prev = base;
  recs.filter(r => latestCommitted === null || Number(r.year) > latestCommitted)
    .sort((a, b) => a.year - b.year)
    .forEach(rec => { prev = liveClassObject(rec, prev, pgaScoring); out.push(prev); });
  return out;
}
