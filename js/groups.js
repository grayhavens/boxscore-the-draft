/* ============================================================
   The friend groups ("leagues" on screen) that Boxscore hosts. Each one
   is a fully separate set of 10 drafters with its own rosters, chat,
   draft room, facts, favorites and commissioner password — the same app
   and the same worker, just a different group id folded into every
   storage key and room name.

   Code calls these "groups" because "league" already means EPL / NFL /
   etc. everywhere else in js/ (leagueKey, LEAGUES, LEAGUE_SCORING).

   Each group lives on its own subdomain: <id>.boxscore.space. A separate
   origin also gives it separate installs, localStorage and service
   worker, so nothing browser-side has to be namespaced by group.

   The Draft is the legacy group: it predates groups, so its storage keys
   (worker KV, the chat room, draft rooms) were never namespaced and stay
   that way — no migration. It is also what every non-boxscore.space host
   (boxscorethedraft.pages.dev, localhost) shows by default.

   Pure data + helpers with no DOM or Worker APIs, because the worker
   (worker/rundown-proxy.js, worker/draft-room.js) imports it too — the
   drafter ids it accepts come from here.
   ============================================================ */

export const LEGACY_GROUP_ID = 'thedraft';

export const GROUP_DOMAIN = 'boxscore.space';

export const GROUPS = {
  thedraft: {
    id: 'thedraft',
    name: 'The Draft',
    drafters: [
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
    ]
  },
  // Season Ticket, the second group (seasonticket.boxscore.space). Its id
  // is its subdomain and part of every one of its storage keys, so it must
  // not change once people use it. Drafter ids get saved with every chat
  // message, pick and favorite, so settle each one before Season Ticket's
  // first chat or draft. Josh is the only sure spot; the other nine are
  // open until people claim them: `open: true` puts a claim form on the
  // landing page (js/landing.js, worker/claims.js). Confirming a claim on
  // the admin page fills the next open spot without a deploy (the
  // `roster@<group>` KV record, worker/roster.js), keeping that spot's id;
  // applyRoster below is how both the worker and the app read it. Setting
  // a name here and dropping `open` still works too, and wins.
  seasonticket: {
    id: 'seasonticket',
    name: 'Season Ticket',
    // Which sports this group drafts, and how many picks each: see
    // groupCaps below. Same as The Draft for now; PGA Tour golfers
    // (pga: 3) join once the golfer pool exists (docs/golf-plan.md).
    caps: { epl: 2, nfl: 3, nba: 3, nhl: 3, mlb: 3, wnba: 1, cfb: 3, mcbb: 3 },
    drafters: [
      { id:'josh', name:'Josh' },        // commissioner
      { id:'draftertwo', name:'Drafter 2', open: true },
      { id:'drafterthree', name:'Drafter 3', open: true },
      { id:'drafterfour', name:'Drafter 4', open: true },
      { id:'drafterfive', name:'Drafter 5', open: true },
      { id:'draftersix', name:'Drafter 6', open: true },
      { id:'drafterseven', name:'Drafter 7', open: true },
      { id:'draftereight', name:'Drafter 8', open: true },
      { id:'drafternine', name:'Drafter 9', open: true },
      { id:'drafterten', name:'Drafter 10', open: true }
    ]
  }
};

export const GROUP_IDS = Object.keys(GROUPS);

// Roster spots nobody has taken yet (`open: true` above). In the browser,
// js/roster.js has already applied confirmed spots (see applyRoster) by
// the time anything calls this; the worker uses worker/roster.js instead.
export function openSpots(groupId){
  return isKnownGroup(groupId) ? GROUPS[groupId].drafters.filter(d => d.open) : [];
}

// A group's drafters with confirmed spots applied. `assigned` is the
// roster@<group> record, { <drafterId>: { name, ... } }; it only ever
// fills a spot this file marks open, keeping the spot's id, so everything
// keyed by drafter id (chat, picks, favorites) is untouched. Pure, and
// returns new objects: the worker shares module state across requests.
export function applyRoster(drafters, assigned){
  return drafters.map(d => {
    const a = d.open && assigned && assigned[d.id];
    return a ? { id: d.id, name: a.name } : d;
  });
}

export function isKnownGroup(id){
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(GROUPS, id);
}

export function drafterIdsFor(groupId){
  return GROUPS[groupId].drafters.map(d => d.id);
}

// The sports a group drafts and the picks each drafter makes in each,
// by league key ({ epl: 2, nfl: 3, … }; key order is the draft room's
// display order). null means the draft room's default, DEFAULT_CAPS in
// js/draft-rules.js — The Draft has no `caps`, so its rooms never
// change under it. The draft room applies a group's caps to any room
// still in the lobby (syncCaps in js/draft-engine.js), and a pre-draft
// group's league tabs are this list (js/seasons/index.js). Once a group
// has drafted, its class file's LEAGUES decides what it shows.
export function groupCaps(groupId){
  return (isKnownGroup(groupId) && GROUPS[groupId].caps) || null;
}

// <id>.boxscore.space -> id, for a known group only. Anything else
// (the bare domain, www, pages.dev, localhost) -> null.
export function groupIdFromHost(hostname){
  const suffix = '.' + GROUP_DOMAIN;
  if(typeof hostname !== 'string' || !hostname.endsWith(suffix)) return null;
  const sub = hostname.slice(0, -suffix.length);
  return isKnownGroup(sub) ? sub : null;
}

// Hosts where ?group= may pick a group, so another league can be tried
// without its subdomain: local dev and Pages preview deploys. Never the
// production hosts, where one origin must always mean one group (its
// localStorage isn't namespaced by group).
export function allowsGroupOverride(hostname){
  return hostname === 'localhost' || hostname === '127.0.0.1' ||
    (typeof hostname === 'string' && hostname.endsWith('.boxscorethedraft.pages.dev'));
}

// The platform's own address, the bare domain (and www): it's no group's
// app, so index.html sends it to the Boxscore landing page (landing.html,
// js/landing.js), which lists every group.
export function isPlatformHost(hostname){
  return hostname === GROUP_DOMAIN || hostname === `www.${GROUP_DOMAIN}`;
}

// Where a group's app lives, for the landing page's links: its subdomain,
// or on dev and preview hosts this same host with ?group=.
export function groupAppUrl(groupId, hostname){
  if(allowsGroupOverride(hostname)) return `index.html?group=${groupId}`;
  return `https://${groupId}.${GROUP_DOMAIN}/`;
}

// Pure so it can be unit-tested (tests/groups.test.mjs).
export function chooseGroupId({ hostname, fromUrl }){
  const fromHost = groupIdFromHost(hostname);
  if(fromHost) return fromHost;
  if(allowsGroupOverride(hostname) && isKnownGroup(fromUrl)) return fromUrl;
  return LEGACY_GROUP_ID;
}

// The worker secret holding a group's commissioner password. The Draft
// keeps the original ADMIN_PASSWORD; every other group has its own, e.g.
// ADMIN_PASSWORD_SEASONTICKET (`npx wrangler secret put ADMIN_PASSWORD_SEASONTICKET`).
export function adminSecretName(groupId){
  return groupId === LEGACY_GROUP_ID ? 'ADMIN_PASSWORD' : `ADMIN_PASSWORD_${groupId.toUpperCase()}`;
}
