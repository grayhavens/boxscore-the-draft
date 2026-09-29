/* ============================================================
   Registry of draft classes. A "season" here is one September draft
   and everything drafted in it — NOT one calendar year of play: the
   2026 class covers NFL/CFB '26, EPL/NBA/NHL/CBB '26/27 and MLB/WNBA
   '27, so it is still live in fall 2027 when the next draft happens.

   Add a class by creating js/seasons/<year>.js (exporting TEAM_META,
   LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES — the draft
   export script generates it) and adding it below, oldest first.

   Classes belong to a group (friend-group league, js/groups.js). The
   map right below is The Draft's; tools/export-draft.mjs appends to it.
   The exports at the bottom are the ACTIVE group's classes, so every
   importer keeps reading SEASONS / LATEST_SEASON_ID without knowing
   which group it is.
   ============================================================ */
import * as s2026 from './2026.js';
import { ACTIVE_GROUP_ID, IS_LEGACY_GROUP } from '../group.js';

const THE_DRAFT_SEASONS = {
  '2026': { id: '2026', label: '2026 Draft', ...s2026 }
};

// Every other group's classes, by group id. A group with none yet (it
// hasn't held its first draft) gets a pre-draft class instead: the same
// league tabs and scoring as The Draft's newest class, and its teams as
// a catalog with the owners taken off, so Scores, Standings and team
// pages all work before anyone has drafted. Every team is favoriteOnly
// (see js/seasons/2026.js): nobody owns it, it's on your Home board only
// if you star it, and every points path already leaves it out.
const OTHER_GROUP_SEASONS = {};

const THE_DRAFT_LATEST = Object.values(THE_DRAFT_SEASONS).pop();

// The Draft's keys carry their drafter ("drew_mancity"), which would
// show up in this group's team page URLs; these are "epl_mancity".
function catalogKey(key, meta){
  const team = meta.draftTeamId && key.startsWith(`${meta.draftTeamId}_`) ? key.slice(meta.draftTeamId.length + 1) : key;
  return `${meta.leagueKey}_${team}`;
}

function preDraftSeasons(){
  const base = THE_DRAFT_LATEST;
  const TEAM_META = {};
  const rekey = {};
  Object.entries(base.TEAM_META).forEach(([key, meta]) => {
    const { draftTeamId, ...rest } = meta;
    rekey[key] = catalogKey(key, meta);
    TEAM_META[rekey[key]] = { ...rest, favoriteOnly: true };
  });
  return {
    [base.id]: {
      id: base.id,
      label: base.label,
      preDraft: true,
      TEAM_META,
      LEAGUES: base.LEAGUES.map(l => ({ ...l, teams: l.teams.map(k => rekey[k]) })),
      LEAGUE_SCORING: base.LEAGUE_SCORING,
      PRIOR_SEASON_DISPLAY_LEAGUES: base.PRIOR_SEASON_DISPLAY_LEAGUES
    }
  };
}

export const SEASONS = IS_LEGACY_GROUP
  ? THE_DRAFT_SEASONS
  : (OTHER_GROUP_SEASONS[ACTIVE_GROUP_ID] || preDraftSeasons());

export const SEASON_IDS = Object.keys(SEASONS);
export const LATEST_SEASON_ID = SEASON_IDS[SEASON_IDS.length - 1];

// The draft that's coming up. A group that hasn't drafted yet is about to
// hold its pre-draft class's draft (The Draft's newest id, borrowed);
// everyone else's next draft is the year after their newest class. A
// class spans two seasons of play, hence "2026/2027".
export const NEXT_DRAFT_YEAR = SEASONS[LATEST_SEASON_ID].preDraft
  ? Number(LATEST_SEASON_ID)
  : Number(LATEST_SEASON_ID) + 1;
export const NEXT_DRAFT_LABEL = `${NEXT_DRAFT_YEAR}/${NEXT_DRAFT_YEAR + 1}`;

// Team metadata (names, badges, the ids live data hangs off) is the same
// whoever drafted a team, so the draft pool (js/draft-pool.js) always
// builds from The Draft's newest class — a new group's first draft has no
// TEAM_META of its own to build from.
export const TEAM_CATALOG_SEASON = THE_DRAFT_LATEST;

// The class that predates seasons: its storage keys (localStorage and
// worker KV) were never namespaced, and stay that way so nothing had to
// be migrated. See js/season.js's scopedKey/withScopeQuery.
export const LEGACY_SEASON_ID = '2026';
