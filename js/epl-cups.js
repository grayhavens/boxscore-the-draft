/* ============================================================
   EPL cup finals and European spots as scoring ("Win League Cup", "Win FA
   Cup", "Make Champions League (any stage)", "Make Europa League"), so those
   rules need no commissioner mark. The math is js/epl-cups-math.js; this
   file asks ESPN and keeps the answer.

   A cup: from February of the class's second year, read the competition's
   calendar for the final's day, fetch that day, and keep the winner for good
   once the final is over. A UEFA competition: once its league phase has
   started (September), its table lists the clubs in it; read hourly, since
   the Europa League's field grows as Champions League clubs and playoff
   winners drop in. Each answer is dropped unless it is the class's own season
   (the calendar's final ends in the class's second year).
   getLeagueRuleTeams (js/league-facts.js) unions the answer with the
   commissioner's marks (a cup winner replaces them: it is exclusive); null
   here means "marks only".
   ============================================================ */
import { PRE_DRAFT, leagueOf } from './data.js';
import { fetchEspnSoccerCalendar, fetchEspnUefaStandings, fetchEspnScoreboardDay } from './espn.js';
import { findEplTeamKeyByEspnName } from './standings-epl.js';
import { standingsDataChanged } from './board.js';
import { eplCupRule, finalDays, cupWinner, leaguePhaseClubs } from './epl-cups-math.js';

const state = {}; // slug -> { names: [ESPN names], at, loading, failedAt, done }
const HOUR = 60 * 60 * 1000;

// The season's first year: "'26/'27 Season" → 2026.
function classYear(){
  const m = /'(\d{2})/.exec(leagueOf('epl').season || '');
  return m ? 2000 + Number(m[1]) : null;
}

const savedKey = (slug, year) => `bxEplCup:${slug}:${year}`;

async function loadCup(slug, year){
  const cal = await fetchEspnSoccerCalendar(slug);
  const entry = cal && cal.leagues && cal.leagues[0] && (cal.leagues[0].calendar || []).find(c => /^final$/i.test(c.label || ''));
  if(!entry || new Date(entry.endDate).getUTCFullYear() !== year + 1) return { names: [], failed: !cal };
  for(const day of finalDays(cal.leagues[0].calendar)){
    const data = await fetchEspnScoreboardDay(`soccer/${slug}`, day);
    if(!data) return { names: [], failed: true };
    const winner = cupWinner(data.events);
    if(winner) return { names: [winner], done: true };
  }
  return { names: [] };
}

async function loadTable(slug, year){
  const data = await fetchEspnUefaStandings(slug, year);
  const names = leaguePhaseClubs(data);
  // Before the draw ESPN's table is empty or a stub.
  return { names: names.length >= 30 ? names : [], failed: !data };
}

function ensure(rule, year){
  const s = state[rule.slug] || (state[rule.slug] = { names: [], at: 0, loading: false, failedAt: 0, done: false });
  if(s.done === false && s.at === 0){
    try { const saved = JSON.parse(localStorage.getItem(savedKey(rule.slug, year))); if(saved){ s.names = saved; s.done = true; s.at = Date.now(); } } catch (e){}
  }
  if(s.loading || s.done || Date.now() - s.failedAt < 5 * 60 * 1000 || Date.now() - s.at < HOUR) return s;
  s.loading = true;
  (rule.kind === 'cup' ? loadCup(rule.slug, year) : loadTable(rule.slug, year)).then(r => {
    s.loading = false; s.at = Date.now(); s.names = r.names;
    if(r.failed) s.failedAt = Date.now();
    if(r.done){ s.done = true; try { localStorage.setItem(savedKey(rule.slug, year), JSON.stringify(r.names)); } catch (e){} }
    standingsDataChanged();
  }, () => { s.loading = false; s.failedAt = Date.now(); });
  return s;
}

// The drafted clubs that have earned one of the cup or European rules, or
// null when this isn't one (or it is too early to ask).
export function eplCupRuleTeams(key, rule){
  if(key !== 'epl' || PRE_DRAFT) return null;
  const spec = eplCupRule(rule.label);
  const year = classYear();
  if(!spec || !year) return null;
  const opens = spec.kind === 'cup' ? Date.UTC(year + 1, 1, 1) : Date.UTC(year, 8, 1);
  if(Date.now() < opens) return null;
  const s = ensure(spec, year);
  return s.names.length ? s.names.map(findEplTeamKeyByEspnName).filter(Boolean) : null;
}
