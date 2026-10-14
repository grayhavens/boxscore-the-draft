/* ============================================================
   TEAM_META entries for a team a draft class didn't copy from an
   earlier class: built from ESPN's team list, from a drafted golfer's
   pool record, or from any team's pool record when ESPN can't place it.
   Used by js/draft-class.js (the app's live class and
   tools/export-draft.mjs). Kept with the season data because what it
   makes is team data: each team's own colors, plus the badge text color
   picked against them.
   ============================================================ */

export const COLLEGE = new Set(['cfb', 'mcbb']);

// A crest URL that's safe to put in an attribute as is: entries built in
// the app (a live class) come from the draft board, not a reviewed file.
const safeUrl = url => (/^https:\/\/[^\s"'<>`]+$/.test(String(url || '')) ? String(url) : null);

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
  if(safeUrl(espn.logo)) entry.badgeUrl = safeUrl(espn.logo);
  return entry;
}

// A drafted PGA Tour golfer. Golfers are never looked up on ESPN's team
// lists: the pool entry already carries the athlete id and headshot
// (js/draft-pool.js).
export function entryFromGolfer(drafter, team){
  const accent = /^#[0-9a-f]{6}$/i.test(team.color || '') ? team.color.toUpperCase() : '#1E5B3F';
  const entry = {
    name: team.name,
    leagueKey: 'pga',
    draftTeamId: drafter,
    kind: 'golfer',
    boardSub: 'PGA Tour',
    sub: 'PGA Tour',
    accent,
    badgeStyle: `background:${accent}; color:${textOn(accent)};`,
    badgeText: team.abbr || team.name.slice(0, 3).toUpperCase(),
    sportsdbId: null,
    espnAthleteId: String(team.espnAthleteId)
  };
  if(safeUrl(team.badgeUrl)) entry.badgeUrl = safeUrl(team.badgeUrl);
  return entry;
}

// A team ESPN couldn't place, from the pick's own pool record
// (js/draft-pool.js: name, abbr, color, and an ESPN id and crest when the
// ranking knows them). Only the app uses it (fallbackToPool), so a
// write-in still lands on its drafter's roster.
export function entryFromPool(league, drafter, team){
  const accent = /^#[0-9a-f]{6}$/i.test(team.color || '') ? team.color.toUpperCase() : '#444444';
  const entry = {
    name: team.name,
    leagueKey: league,
    draftTeamId: drafter,
    boardSub: league === 'epl' ? 'Premier League' : '',
    sub: '',
    accent,
    badgeStyle: `background:${accent}; color:${textOn(accent)};`,
    badgeText: team.abbr || String(team.name).slice(0, 4).toUpperCase(),
    sportsdbId: null
  };
  if(league === 'cfb') entry.recentLabel = 'Results So Far';
  if(team.espnTeamId) entry.espnTeamId = String(team.espnTeamId);
  if(safeUrl(team.badgeUrl)) entry.badgeUrl = safeUrl(team.badgeUrl);
  return entry;
}
