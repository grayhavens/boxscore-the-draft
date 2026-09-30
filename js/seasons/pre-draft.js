/* ============================================================
   The class a group gets before its first draft: the same league tabs
   and scoring as The Draft's newest class, and its teams as a catalog
   with the owners taken off, so Scores, Standings and team pages all
   work before anyone has drafted. Every team is favoriteOnly (see
   js/seasons/2026.js): nobody owns it, it's on your Home board only if
   you star it, and every points path already leaves it out.
   Pure (caps in, class out), so the landing page builds the recruiting
   group's scoring rules from it too (js/landing.js).
   ============================================================ */
import { THE_DRAFT_LATEST } from './the-draft.js';
import { pgaCatalog, PGA_SCORING } from './pga.js';

// The Draft's keys carry their drafter ("drew_mancity"), which would
// show up in this group's team page URLs; these are "epl_mancity".
function catalogKey(key, meta){
  const team = meta.draftTeamId && key.startsWith(`${meta.draftTeamId}_`) ? key.slice(meta.draftTeamId.length + 1) : key;
  return `${meta.leagueKey}_${team}`;
}

// `caps`: the group's (groupCaps in js/groups.js), or null for every one
// of The Draft's sports.
export function preDraftClass(caps){
  const base = THE_DRAFT_LATEST;
  const drafts = league => !caps || caps[league] > 0;
  const TEAM_META = {};
  const rekey = {};
  Object.entries(base.TEAM_META).forEach(([key, meta]) => {
    if(!drafts(meta.leagueKey)) return;
    const { draftTeamId, ...rest } = meta;
    rekey[key] = catalogKey(key, meta);
    TEAM_META[rekey[key]] = { ...rest, favoriteOnly: true };
  });
  const LEAGUES = base.LEAGUES.filter(l => drafts(l.key)).map(l => ({ ...l, teams: l.teams.map(k => rekey[k]) }));
  let LEAGUE_SCORING = base.LEAGUE_SCORING;
  let PRIOR_SEASON_DISPLAY_LEAGUES = base.PRIOR_SEASON_DISPLAY_LEAGUES;
  // Golfers aren't in The Draft's classes: a group with PGA Tour in its
  // caps gets the golfer pool (js/seasons/pga.js). Golf's season is the
  // calendar year after the draft, so until then it shows last season.
  if(caps && caps.pga > 0){
    const pga = pgaCatalog(`'${String(Number(base.id) + 1).slice(-2)} Season`);
    Object.assign(TEAM_META, pga.TEAM_META);
    LEAGUES.push(pga.league);
    LEAGUE_SCORING = { ...LEAGUE_SCORING, pga: PGA_SCORING };
    PRIOR_SEASON_DISPLAY_LEAGUES = PRIOR_SEASON_DISPLAY_LEAGUES.concat('pga');
  }
  return {
    id: base.id,
    label: base.label,
    preDraft: true,
    TEAM_META,
    LEAGUES,
    LEAGUE_SCORING,
    PRIOR_SEASON_DISPLAY_LEAGUES
  };
}
