/* ============================================================
   The Draft's draft classes, oldest first. Add a class by creating
   js/seasons/<year>.js (exporting TEAM_META, LEAGUES, LEAGUE_SCORING,
   PRIOR_SEASON_DISPLAY_LEAGUES — tools/export-draft.mjs generates it
   and appends it here). No group code, so the landing page can read
   the newest class's rules (js/seasons/pre-draft.js).
   ============================================================ */
import * as s2026 from './2026.js';

export const THE_DRAFT_SEASONS = {
  '2026': { id: '2026', label: '2026 Draft', ...s2026 }
};

export const THE_DRAFT_LATEST = Object.values(THE_DRAFT_SEASONS).pop();
