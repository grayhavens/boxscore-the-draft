/* ============================================================
   Which group (friend-group league, see js/groups.js) this page load
   is showing, resolved once at module load from the hostname:
   <id>.boxscore.space. Everywhere else it's The Draft, except that local
   dev and Pages previews may pick another with ?group=<id>.

   Browser-only; js/groups.js holds the registry the worker shares.
   ============================================================ */
import { GROUPS, LEGACY_GROUP_ID, chooseGroupId } from './groups.js';

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
export const IS_LEGACY_GROUP = ACTIVE_GROUP_ID === LEGACY_GROUP_ID;

// Adds ?group= to a worker URL for any group but The Draft, whose worker
// state predates groups and is what an absent param means.
export function withGroupQuery(url){
  if(IS_LEGACY_GROUP) return url;
  return `${url}${url.includes('?') ? '&' : '?'}group=${ACTIVE_GROUP_ID}`;
}
