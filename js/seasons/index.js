/* ============================================================
   Registry of draft classes. A "season" here is one September draft
   and everything drafted in it — NOT one calendar year of play: the
   2026 class covers NFL/CFB '26, EPL/NBA/NHL/CBB '26/27 and MLB/WNBA
   '27, so it is still live in fall 2027 when the next draft happens.

   Add a class by creating js/seasons/<year>.js (exporting TEAM_META,
   LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES — the draft
   export script generates it) and adding it below, oldest first.
   ============================================================ */
import * as s2026 from './2026.js';

export const SEASONS = {
  '2026': { id: '2026', label: '2026 Draft', ...s2026 }
};

export const SEASON_IDS = Object.keys(SEASONS);
export const LATEST_SEASON_ID = SEASON_IDS[SEASON_IDS.length - 1];

// The class that predates seasons: its storage keys (localStorage and
// worker KV) were never namespaced, and stay that way so nothing had to
// be migrated. See js/season.js's scopedKey/withSeasonQuery.
export const LEGACY_SEASON_ID = '2026';
