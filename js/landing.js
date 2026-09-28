/* ============================================================
   The Boxscore landing page (landing.html): the platform's front door
   at boxscore.space, listing every group in js/groups.js with a link to
   its app. A new group shows up here on its own.
   ============================================================ */
import { GROUPS, GROUP_DOMAIN, groupAppUrl } from './groups.js';

const host = window.location.hostname;

document.getElementById('landing-groups').innerHTML = Object.values(GROUPS).map(g => `
  <a class="set-row landing-group" href="${groupAppUrl(g.id, host)}">
    <span class="set-row-text">
      <span class="set-row-title">${g.name}</span>
      <span class="set-row-sub">${g.id}.${GROUP_DOMAIN}</span>
    </span>
    <span class="set-chev">&rsaquo;</span>
  </a>`).join('');
