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

// The 10 people in this group's fantasy draft (js/groups.js — each
// group/league has its own). Every team in TEAM_META belongs to exactly
// one of these via its draftTeamId field.
export const DRAFT_TEAMS = ACTIVE_GROUP.drafters;

export const { TEAM_META, LEAGUES, LEAGUE_SCORING, PRIOR_SEASON_DISPLAY_LEAGUES } = ACTIVE_SEASON;
