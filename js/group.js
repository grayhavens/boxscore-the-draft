/* ============================================================
   Which group (friend-group league, see js/groups.js) this page load
   is showing, resolved once at module load from the hostname:
   <id>.boxscore.space. Everywhere else it's The Draft, except that local
   dev and Pages previews may pick another with ?group=<id>.

   Browser-only; js/groups.js holds the registry the worker shares.
   ============================================================ */
import { GROUPS, LEGACY_GROUP_ID, chooseGroupId } from './groups.js';
import { loadRoster } from './roster.js';
import { loadSports } from './group-sports.js';
import { ensureAccess, accessCode } from './access.js';

function resolveActiveGroupId(){
  let hostname = '', fromUrl = null;
  try {
    hostname = window.location.hostname;
    fromUrl = new URLSearchParams(window.location.search).get('group');
  } catch (e){}
  return chooseGroupId({ hostname, fromUrl });
}

export const ACTIVE_GROUP_ID = resolveActiveGroupId();
export const ACTIVE_GROUP = GROUPS[ACTIVE_GROUP_ID];

// The group's invite code (js/access.js): taken from the invite link, or
// asked for once, before anything below reads group state.
await ensureAccess(ACTIVE_GROUP_ID, ACTIVE_GROUP.name);

// Real names for spots confirmed on the admin page, before anything reads
// ACTIVE_GROUP.drafters, and the sports set on the Commissioner page,
// before the draft classes are built from them. Both are instant from the
// last copy seen, and only a device's first launch waits on the network
// (briefly). See js/roster.js and js/group-sports.js.
await Promise.all([loadRoster(ACTIVE_GROUP_ID), loadSports(ACTIVE_GROUP_ID)]);
export const IS_LEGACY_GROUP = ACTIVE_GROUP_ID === LEGACY_GROUP_ID;

// Adds ?group= to a worker URL for any group but The Draft, whose worker
// state predates groups and is what an absent param means, plus the
// group's invite code as ?gc= when this device has one (worker/access-code.js).
export function withGroupQuery(url){
  const code = accessCode();
  const params = [...(IS_LEGACY_GROUP ? [] : [`group=${ACTIVE_GROUP_ID}`]), ...(code ? [`gc=${encodeURIComponent(code)}`] : [])];
  if(!params.length) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${params.join('&')}`;
}
