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

// The 10 people in the fantasy draft. Every team in TEAM_META
// belongs to exactly one of these via its draftTeamId field.
export const DRAFT_TEAMS = [
  { id:'josh', name:'Josh' },
  { id:'isaac', name:'Isaac' },
  { id:'drew', name:'Drew' },
  { id:'douglas', name:'Douglas' },
  { id:'collin', name:'Collin' },
  { id:'erichylok', name:'Eric H' },
  { id:'patrick', name:'Patrick' },
  { id:'peter', name:'Peter' },
  { id:'ericprister', name:'Eric P' },
  { id:'donny', name:'Donny' }
];

export const { TEAM_META, LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES } = ACTIVE_SEASON;
