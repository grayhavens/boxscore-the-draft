/* ============================================================
   College football bowls and conference titles as scoring ("Make a bowl
   game", "Win a bowl game", "Win conference"), so those rules need no
   commissioner mark. The math is js/cfb-bowls-math.js; this file asks ESPN
   (a day at a time, js/espn-days.js) and keeps the answer. Starts December 1
   of the class's season; getLeagueRuleTeams (js/league-facts.js) unions the
   answer with the commissioner's marks, and null here means "marks only".
   ============================================================ */
import { LEAGUES, PRE_DRAFT, leagueOf } from './data.js';
import { loadDays } from './espn-days.js';
import { findCfbTeamKeyByLocation } from './utils.js';
import { standingsDataChanged } from './board.js';
import { bowlDates, parseBowlEvent, bowlReach, bowlTeamsEarning } from './cfb-bowls-math.js';

const state = { reach: null, at: 0, loading: false, failedAt: 0, done: false };

// The season's own year: "'26 Season" → 2026.
function classYear(){
  const m = /'(\d{2})/.exec(leagueOf('cfb').season || '');
  return m ? 2000 + Number(m[1]) : null;
}

function ensure(year){
  if(state.loading || Date.now() - state.failedAt < 5 * 60 * 1000) return;
  // Once the last bowl is in, a result can't change: look again rarely.
  const ttl = state.done ? 6 * 60 * 60 * 1000 : 10 * 60 * 1000;
  if(state.reach && Date.now() - state.at < ttl) return;
  state.loading = true;
  loadDays({ store: 'bxBowlDay', key: 'cfb', sportPath: 'football/college-football', extra: '&groups=80', parse: parseBowlEvent }, bowlDates(year)).then(({ games, failed }) => {
    const seen = new Set();
    state.reach = bowlReach(games.filter(g => !seen.has(g.id) && seen.add(g.id)));
    state.done = !failed && new Date() > new Date(Date.UTC(year + 1, 0, 4));
    state.loading = false; state.at = Date.now();
    if(failed) state.failedAt = Date.now();
    standingsDataChanged();
  }, () => { state.loading = false; state.failedAt = Date.now(); });
}

// The drafted teams that have earned one of the bowl or conference-title
// rules, or null when this isn't one (or there's no answer yet).
export function bowlRuleTeams(key, rule){
  if(key !== 'cfb' || PRE_DRAFT || !LEAGUES.some(l => l.key === 'cfb')) return null;
  const year = classYear();
  if(!year || !bowlDates(year).length) return null;
  ensure(year);
  if(!state.reach) return null;
  const ids = bowlTeamsEarning(rule.label, state.reach);
  return ids && ids.map(id => findCfbTeamKeyByLocation(state.reach[id].location)).filter(Boolean);
}
