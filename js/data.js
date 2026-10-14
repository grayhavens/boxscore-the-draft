/* ============================================================
   Board content: the drafters, plus the active draft class's teams,
   leagues, and scoring rules. The class-specific data lives one file
   per draft in js/seasons/ (registry in js/seasons/index.js) — edit
   that file to add/remove a team or league. This module re-exports
   whichever class js/season.js resolved, so everything else in js/
   just reads TEAM_META / LEAGUES / etc. from here and never needs to
   know which class it is.
   ============================================================ */
import { ACTIVE_SEASON } from './season.js';
import { ACTIVE_GROUP } from './group.js';
import { SEASON_PHASE_CACHE_KEY, SPRING_START_LEAGUES, priorSeasonLeagues } from './season-overlap.js';

// The 10 people in this group's fantasy draft (js/groups.js — each
// group/league has its own). Every team in TEAM_META belongs to exactly
// one of these via its draftTeamId field.
export const DRAFT_TEAMS = ACTIVE_GROUP.drafters;

export const { TEAM_META, LEAGUES, LEAGUE_SCORING } = ACTIVE_SEASON;

// The leagues still showing the season before the class's own, so not
// scoring yet: MLB and the WNBA from the September draft until their
// spring. The class lists them; each drops off by itself once its class
// season's regular season has begun, by ESPN's calendar as
// js/season-phase.js last saved it (js/season-overlap.js). Read once at
// boot: the switch shows on the first launch after that day.
function savedEspnSeasons(){
  const seasons = {};
  SPRING_START_LEAGUES.forEach(key => {
    try {
      const saved = JSON.parse(localStorage.getItem(`${SEASON_PHASE_CACHE_KEY}:${key}`));
      const data = saved && saved.data;
      if(!data || !data.year) return;
      const regular = (data.types || []).find(t => t.type === 2);
      seasons[key] = { year: data.year, regularStart: regular ? regular.startDate : null };
    } catch (e){}
  });
  return seasons;
}
export const PRIOR_SEASON_DISPLAY_LEAGUES = priorSeasonLeagues(ACTIVE_SEASON.PRIOR_SEASON_DISPLAY_LEAGUES, LEAGUES, savedEspnSeasons());

// True until this group holds its first draft (js/seasons/index.js):
// every team is on the board but nobody owns one yet, so nothing shows
// a drafter — no owner labels, no Drafted standings or Scores scope.
export const PRE_DRAFT = !!ACTIVE_SEASON.preDraft;

// A league of the active class, or an empty one when this group doesn't
// draft it (groupCaps in js/groups.js), so each league's standings
// module can run for a league the group left out.
export function leagueOf(key){
  return LEAGUES.find(l => l.key === key) || { key, teams: [] };
}

// A league the group shows scores for without drafting it (js/sports.js):
// nobody owns its teams, so nothing drafter-shaped shows for it.
export function isScoresOnly(key){
  return !!leagueOf(key).scoresOnly;
}
