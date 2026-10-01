/* ============================================================
   Registry of draft classes. A "season" here is one September draft
   and everything drafted in it — NOT one calendar year of play: the
   2026 class covers NFL/CFB '26, EPL/NBA/NHL/CBB '26/27 and MLB/WNBA
   '27, so it is still live in fall 2027 when the next draft happens.

   Classes belong to a group (friend-group league, js/groups.js). The
   Draft's are listed in js/seasons/the-draft.js (tools/export-draft.mjs
   appends to it); a group that hasn't drafted gets a pre-draft class
   (js/seasons/pre-draft.js). The exports below are the ACTIVE group's
   classes, so every importer keeps reading SEASONS / LATEST_SEASON_ID
   without knowing which group it is.
   ============================================================ */
import { ACTIVE_GROUP_ID, IS_LEGACY_GROUP } from '../group.js';
import { groupCaps, groupShown } from '../groups.js';
import { THE_DRAFT_SEASONS, THE_DRAFT_LATEST } from './the-draft.js';
import { preDraftClass, withScoresOnly } from './pre-draft.js';

// Every other group's classes, by group id. A group with none yet gets
// its pre-draft class (js/seasons/pre-draft.js).
const OTHER_GROUP_SEASONS = {};

const DRAFTED = IS_LEGACY_GROUP ? THE_DRAFT_SEASONS : OTHER_GROUP_SEASONS[ACTIVE_GROUP_ID];

// The newest drafted class also shows the sports the group follows
// without drafting them (js/sports.js, set on the Commissioner page).
// Older classes stay as they were drafted.
function withShown(seasons){
  const ids = Object.keys(seasons);
  const latest = ids[ids.length - 1];
  return { ...seasons, [latest]: withScoresOnly(seasons[latest], groupShown(ACTIVE_GROUP_ID)) };
}

export const SEASONS = DRAFTED
  ? withShown(DRAFTED)
  : { [THE_DRAFT_LATEST.id]: preDraftClass(groupCaps(ACTIVE_GROUP_ID), groupShown(ACTIVE_GROUP_ID)) };

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
