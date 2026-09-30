/* ============================================================
   The Boxscore landing page (landing.html): the platform's front door
   at boxscore.space, listing the groups in LANDING_GROUPS below with a
   link to each one's app, plus "How it works", the scoring rules and
   spot claims.
   ============================================================ */
import { GROUPS, GROUP_DOMAIN, groupAppUrl, openSpots, groupCaps } from './groups.js';
import { initExplainer } from './landing-explainer.js';
import { setScoringRules } from './scoring-sheet.js';
import { preDraftClass } from './seasons/pre-draft.js';
import { loadRoster } from './roster.js';
import { chatWorkerBase } from './worker-base.js';

const host = window.location.hostname;

initExplainer(document.getElementById('hiw'));

// The groups the landing lists, in order: the ones still looking for
// people. A group left off (The Draft, mid-season) still works at its own
// subdomain and on the admin page; it just isn't advertised here.
const LANDING_GROUPS = ['seasonticket'];

// "How scoring works" shows the rules the first group listed will play
// by: its pre-draft class, the same one its app shows before its draft.
const { LEAGUES, LEAGUE_SCORING } = preDraftClass(groupCaps(LANDING_GROUPS[0]));
setScoringRules(LEAGUES, LEAGUE_SCORING);

// A group still filling its roster is a recruiting card: the claim form
// and no link into its app, since everyone who lands here then is a
// prospect, not a member. Once its last open spot is filled
// (js/groups.js) it's a plain link to its app again.
// Confirmed spots count as filled (js/roster.js), so the open count and
// the switch back to a plain link follow the admin page, not just
// js/groups.js. The explainer above is already running while this waits.
await Promise.all(LANDING_GROUPS.map(loadRoster));

const groupsEl = document.getElementById('landing-groups');
const shown = LANDING_GROUPS.map(id => GROUPS[id]);
groupsEl.innerHTML = shown.map(g => {
  const open = openSpots(g.id).length;
  if(!open) return `
  <a class="set-row landing-group" href="${groupAppUrl(g.id, host)}">
    <span class="set-row-text">
      <span class="set-row-title">${g.name}</span>
      <span class="set-row-sub">${g.id}.${GROUP_DOMAIN}</span>
    </span>
    <span class="set-chev">&rsaquo;</span>
  </a>`;
  return `
  <div class="landing-recruit" data-group="${g.id}">
    <div class="landing-recruit-head">
      <span class="landing-recruit-name">${g.name}</span>
      <span class="landing-recruit-count">${open} of ${g.drafters.length} spots open</span>
    </div>
    <form class="landing-claim-form" novalidate>
      <p class="landing-claim-lead">Want in? Send your name and email and the commissioner will reach out before the draft.</p>
      <input name="name" type="text" maxlength="40" autocomplete="name" placeholder="Your name" required>
      <input name="email" type="email" maxlength="80" autocomplete="email" inputmode="email" placeholder="Email" required>
      <button type="submit" class="modal-cta">Claim a spot</button>
      <p class="landing-claim-msg" role="status"></p>
    </form>
    <p class="landing-claim-done" hidden><strong>Spot claimed.</strong> The commissioner will be in touch.</p>
  </div>`;
}).join('');

// The heading and footer follow what's listed: joining while every group
// shown is recruiting, opening your app once any of them is live.
const anyLive = shown.some(g => !openSpots(g.id).length);
document.getElementById('landing-groups-label').textContent = anyLive ? 'Groups' : 'Join a league';
document.getElementById('landing-foot').hidden = !anyLive;

// ---- Claiming an open spot (worker/claims.js) ----
// A request, not a roster change: it shows on the admin page, where
// confirming it fills a spot. On localhost it goes to `wrangler dev`.
const CLAIM_BASE = chatWorkerBase();
const CLAIMED_KEY = 'bx-claimed'; // group ids this browser already claimed in, just to say so

function claimedGroups(){
  try { return JSON.parse(localStorage.getItem(CLAIMED_KEY) || '[]'); } catch (e){ return []; }
}

function showClaimed(box){
  box.querySelector('.landing-claim-form').hidden = true;
  box.querySelector('.landing-claim-done').hidden = false;
}

const claimed = claimedGroups();
groupsEl.querySelectorAll('.landing-recruit').forEach(box => {
  if(claimed.includes(box.dataset.group)) showClaimed(box);
});

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same loose check as worker/claims.js
const CLAIM_ERRORS = {
  name: 'Add your name first.',
  email: 'Add an email so the commissioner can reach you.',
  409: 'Those spots just filled up.',
  429: 'Too many claims right now. Try again in a bit.'
};

groupsEl.addEventListener('submit', async e => {
  const form = e.target.closest('.landing-claim-form');
  if(!form) return;
  e.preventDefault();
  const box = form.closest('.landing-recruit'), msg = form.querySelector('.landing-claim-msg');
  const submit = form.querySelector('[type=submit]');
  const name = form.elements.name.value.trim();
  const email = form.elements.email.value.trim();
  if(!name){ msg.textContent = CLAIM_ERRORS.name; form.elements.name.focus(); return; }
  if(!EMAIL.test(email)){ msg.textContent = CLAIM_ERRORS.email; form.elements.email.focus(); return; }
  submit.disabled = true;
  msg.textContent = 'Sending…';
  try {
    const res = await fetch(`${CLAIM_BASE}/claim?group=${encodeURIComponent(box.dataset.group)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email })
    });
    if(res.ok){
      try { localStorage.setItem(CLAIMED_KEY, JSON.stringify([...new Set([...claimedGroups(), box.dataset.group])])); } catch (err){}
      showClaimed(box);
      return;
    }
    const code = res.status === 400 ? ((await res.json().catch(() => ({}))).error || 'name') : res.status;
    msg.textContent = CLAIM_ERRORS[code] || 'That didn’t go through. Try again.';
  } catch (err){
    msg.textContent = 'Couldn’t reach Boxscore. Check your connection and try again.';
  }
  submit.disabled = false;
});

// ---- Opening a group: logo → center → the group's launch splash ----
// The landing and each group are different origins, so no cross-document
// View Transition or shared sessionStorage. Instead this page ends on the
// exact frame the group's splash shows once its mark is built (200px,
// centered, raised 26px, on the splash ground) and navigates with
// #splash=handoff; js/launch-splash.js starts from that frame. The old
// page stays painted until the new one's first paint, so there's no seam.
const IO = 'cubic-bezier(0.65,0,0.35,1)', EO = 'cubic-bezier(0.22,1,0.36,1)';
const handoff = document.getElementById('landing-handoff');
const logo = document.querySelector('.landing-logo');
const main = document.querySelector('.landing-main');
let anims = [], timer = 0;

groupsEl.addEventListener('click', e => {
  const link = e.target.closest('.landing-group');
  if(!link || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  if(anims.length) return;
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduce || !handoff || !logo || !handoff.animate){ location.href = link.href; return; }

  const r = logo.getBoundingClientRect();
  const dx = r.left + r.width / 2 - innerWidth / 2, dy = r.top + r.height / 2 - innerHeight / 2;
  const s = r.width / 200; // the header PNG is the whole 200px icon box, scaled down
  handoff.hidden = false;
  logo.style.visibility = 'hidden';
  anims = [
    handoff.querySelector('.ls-logo').animate(
      [{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: 'translate(0px,-26px) scale(1)' }],
      { duration: 640, easing: IO, fill: 'both' }),
    handoff.querySelector('.ls-bg').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, delay: 140, easing: EO, fill: 'both' }),
    main.animate([{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 260, easing: EO, fill: 'both' })
  ];
  // Leave the overlay up: its last frame holds until the group page paints.
  timer = setTimeout(() => { location.href = link.href + '#splash=handoff'; }, 700);
});

// Back/forward cache: coming back must show the landing, not a frozen splash.
window.addEventListener('pageshow', e => {
  if(!e.persisted) return;
  clearTimeout(timer);
  anims.forEach(a => a.cancel());
  anims = [];
  if(handoff) handoff.hidden = true;
  if(logo) logo.style.visibility = '';
});
