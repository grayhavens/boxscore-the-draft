/* ============================================================
   NBA / NHL / MLB playoff rounds as scoring (conference finals / LCS, the
   final, the title), so those rules need no commissioner mark. The math is
   js/playoff-series-math.js; this file asks ESPN and keeps the answer.

   ESPN answers one day per request, so a postseason is sampled: every third
   day of the late rounds (enough to see every series), then the days after
   the last final-round game one by one until someone has won it. A day more
   than two days old is final, so it's saved on the device for good and a
   later visit only asks about recent days. Nothing is fetched before the
   class's playoffs could have reached those rounds, or for MLB while it's
   still showing a prior season (PRIOR_SEASON_DISPLAY_LEAGUES).

   getLeagueRuleTeams (js/league-facts.js) unions the answer with the
   commissioner's marks; null here means "no answer, marks only".
   ============================================================ */
import { LEAGUE_SCORING, PRE_DRAFT, PRIOR_SEASON_DISPLAY_LEAGUES, leagueOf } from './data.js';
import { loadDays } from './espn-days.js';
import { findDraftedTeamByName } from './utils.js';
import { standingsDataChanged } from './board.js';
import {
  PLAYOFF_SERIES_LEAGUES, parseSeriesEvent, playoffDates, playoffReach, finalFollowUps, teamsEarning
} from './playoff-series-math.js';

const PATHS = { nba: 'basketball/nba', nhl: 'hockey/nhl', mlb: 'baseball/mlb' };

const state = {};

// The year a class's playoffs happen in: the last year in its season label
// ("'26/'27 Season" → 2027, "'27 Season" → 2027).
function classYear(key){
  const years = [...(leagueOf(key).season || '').matchAll(/'(\d{2})/g)];
  return years.length ? 2000 + Number(years[years.length - 1][1]) : null;
}

const loadPlayoffDays = (key, days) => loadDays({ store: 'bxPlayoffDay', key, sportPath: PATHS[key], extra: '', parse: parseSeriesEvent }, days);

async function refresh(key, year, s){
  const first = await loadPlayoffDays(key, playoffDates(key, year));
  const follow = await loadPlayoffDays(key, finalFollowUps(key, first.games));
  const seen = new Set();
  const games = [...first.games, ...follow.games].filter(g => !seen.has(g.id) && seen.add(g.id));
  s.reach = playoffReach(key, games);
  s.done = Object.values(s.reach).some(t => t.champion);
  s.failed = first.failed || follow.failed;
}

function ensure(key, year){
  const s = state[key] || (state[key] = { year, reach: null, done: false, at: 0, loading: false, failedAt: 0 });
  if(s.loading || Date.now() - s.failedAt < 5 * 60 * 1000) return s;
  const ttl = s.done ? 6 * 60 * 60 * 1000 : 10 * 60 * 1000;
  if(s.reach && Date.now() - s.at < ttl) return s;
  s.loading = true;
  refresh(key, year, s).then(() => {
    s.loading = false; s.at = Date.now();
    if(s.failed) s.failedAt = Date.now();
    standingsDataChanged();
  }, () => { s.loading = false; s.failedAt = Date.now(); });
  return s;
}

// The drafted teams that have earned one of the league's playoff-run rules,
// or null when this isn't one (or there's no answer yet).
export function playoffRuleTeams(key, rule){
  if(!PLAYOFF_SERIES_LEAGUES[key] || PRE_DRAFT || PRIOR_SEASON_DISPLAY_LEAGUES.includes(key)) return null;
  const year = classYear(key);
  if(!year || !playoffDates(key, year).length) return null;
  const s = ensure(key, year);
  if(!s.reach) return null;
  const ids = teamsEarning(key, LEAGUE_SCORING[key].rules, rule.label, s.reach);
  if(!ids) return null;
  return ids.map(id => findDraftedTeamByName(key, s.reach[id].name)).filter(Boolean);
}
