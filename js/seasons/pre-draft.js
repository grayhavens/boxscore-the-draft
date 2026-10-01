/* ============================================================
   The class a group gets before its first draft: the same league tabs
   and scoring as The Draft's newest class, and its teams as a catalog
   with the owners taken off, so Scores, Standings and team pages all
   work before anyone has drafted. Every team is favoriteOnly (see
   js/seasons/2026.js): nobody owns it, it's on your Home board only if
   you star it, and every points path already leaves it out.
   Pure (caps in, class out), so the landing page builds the recruiting
   group's scoring rules from it too (js/landing.js). withScoresOnly adds
   the same catalog's leagues to a drafted class, for sports a group
   shows without drafting them (js/sports.js).
   ============================================================ */
import { THE_DRAFT_LATEST } from './the-draft.js';
import { pgaCatalog, PGA_SCORING } from './pga.js';

// The Draft's keys carry their drafter ("drew_mancity"), which would
// show up in this group's team page URLs; these are "epl_mancity".
function catalogKey(key, meta){
  const team = meta.draftTeamId && key.startsWith(`${meta.draftTeamId}_`) ? key.slice(meta.draftTeamId.length + 1) : key;
  return `${meta.leagueKey}_${team}`;
}

// The Draft's newest class's teams in one league, as a catalog: rekeyed
// and favoriteOnly, with PGA Tour's golfers (js/seasons/pga.js) since
// they're in none of The Draft's classes. `seasonLabel` is golf's.
function catalogLeague(key, seasonLabel){
  const base = THE_DRAFT_LATEST;
  if(key === 'pga') return pgaCatalog(seasonLabel);
  const league = base.LEAGUES.find(l => l.key === key);
  if(!league) return null;
  const TEAM_META = {};
  const teams = league.teams.map(teamKey => {
    const { draftTeamId, ...rest } = base.TEAM_META[teamKey];
    const k = catalogKey(teamKey, base.TEAM_META[teamKey]);
    TEAM_META[k] = { ...rest, favoriteOnly: true };
    return k;
  });
  return { TEAM_META, league: { ...league, teams } };
}

// Golf's season is the calendar year after a class's draft.
const golfSeasonLabel = id => `'${String(Number(id) + 1).slice(-2)} Season`;

// `caps`: the group's (groupCaps in js/groups.js), or null for every one
// of The Draft's sports. `shown`: sports it shows without drafting
// (groupShown), which get no scoring rules.
export function preDraftClass(caps, shown = []){
  const base = THE_DRAFT_LATEST;
  const drafts = league => !caps || caps[league] > 0;
  const shows = league => drafts(league) || shown.includes(league);
  const keys = base.LEAGUES.map(l => l.key).concat('pga').filter(shows);
  const TEAM_META = {};
  const LEAGUES = [];
  keys.forEach(key => {
    const entry = catalogLeague(key, golfSeasonLabel(base.id));
    Object.assign(TEAM_META, entry.TEAM_META);
    LEAGUES.push(drafts(key) ? entry.league : { ...entry.league, scoresOnly: true });
  });
  const LEAGUE_SCORING = {};
  keys.filter(drafts).forEach(key => { LEAGUE_SCORING[key] = key === 'pga' ? PGA_SCORING : base.LEAGUE_SCORING[key]; });
  // Until golf's season starts it shows last season.
  const PRIOR_SEASON_DISPLAY_LEAGUES = base.PRIOR_SEASON_DISPLAY_LEAGUES.filter(shows).concat(keys.includes('pga') ? ['pga'] : []);
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

// A drafted class plus the sports its group shows without drafting
// (groupShown): each one it didn't draft is added from the catalog, all
// favorites and no scoring rules, marked `scoresOnly`. Its own leagues
// always stay, since they still score.
export function withScoresOnly(cls, shown){
  const extra = shown.filter(key => !cls.LEAGUES.some(l => l.key === key));
  if(!extra.length) return cls;
  const TEAM_META = { ...cls.TEAM_META };
  const LEAGUES = cls.LEAGUES.slice();
  extra.forEach(key => {
    const entry = catalogLeague(key, golfSeasonLabel(cls.id));
    if(!entry) return;
    Object.assign(TEAM_META, entry.TEAM_META);
    LEAGUES.push({ ...entry.league, scoresOnly: true });
  });
  return { ...cls, TEAM_META, LEAGUES };
}
