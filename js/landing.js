/* ============================================================
   The Boxscore landing page (landing.html): the platform's front door
   at boxscore.space (docs/delight-plan.md, Phase 5). A hero over two
   drifting rows of the recruiting group's teams, the "How it works"
   scroll tour (js/landing-explainer.js), the groups in LANDING_GROUPS
   below as cards with a spots meter and spot claims, and the FAQ.

   Motion: the hero rises once the launch splash hands off, sections rise
   in the first time they're 35% in view, and opening a group grows the
   splash ground out of its card. Reduced motion shows everything still.
   ============================================================ */
import { GROUPS, GROUP_DOMAIN, groupAppUrl, openSpots } from './groups.js';
import { DEFAULT_CAPS } from './draft-rules.js';
import { SPORT_KEYS, SPORT_LABELS, MAX_SPORT_PICKS } from './sports.js';
import { initTour } from './landing-explainer.js';
import { setScoringRules } from './scoring-sheet.js';
import { preDraftClass } from './seasons/pre-draft.js';
import { loadRoster } from './roster.js';
import { chatWorkerBase } from './worker-base.js';
import { escapeHtml } from './escape.js';
import { DRAFT_RANKS, NAME_ALIASES } from './draft-ranks.js';

import { buttonHtml, teamBadgeHtml, teamOrbHtml, spotsMeterHtml, sportPicksHtml } from './ui.js';
const host = window.location.hostname;
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
document.body.classList.toggle('ld-still', !!reduce);
if(reduce) document.body.classList.remove('ld-wait');

// The groups the landing lists, in order: the ones still looking for
// people. A group left off (The Draft, mid-season) still works at its own
// subdomain and on the admin page; it just isn't advertised here.
const LANDING_GROUPS = ['seasonticket'];
// This page never shows a real group's address: the tour's sample browser
// window gets a made-up one, and group cards show no address at all.
const SAMPLE_URL = `yourfriends.${GROUP_DOMAIN}`;

// This is the platform's page, not any one group's: everything it says
// about sports and picks is the standard setup, the draft room's default
// (DEFAULT_CAPS in js/draft-rules.js), which a group's commissioner can
// change. Only the group cards below are about real groups.
const caps = { ...DEFAULT_CAPS };
const shown = [];
// "How scoring works": the standard setup's rules (its pre-draft class).
const { LEAGUES, LEAGUE_SCORING } = preDraftClass(caps, shown);
setScoringRules(LEAGUES, LEAGUE_SCORING);
// Every sport's teams, for the tour's sample teams and the badge rows.
const catalog = preDraftClass(null);

// The sports this page talks about: the standard setup's. Anything it
// leaves off, golf for now, isn't mentioned.
const drafted = SPORT_KEYS.filter(k => caps[k] > 0);
const LANDING_SPORTS = SPORT_KEYS.filter(k => drafted.includes(k) || shown.includes(k));

// ---- Hero ----
// "Up to" the standard setup's league count: a group may draft fewer.
document.getElementById('ld-league-count').textContent = String(drafted.length || SPORT_KEYS.length);
// The lines rise once the launch splash (js/launch-splash.js) is done, so
// they're seen, not played behind it. No splash this session: rise now.
const heroIn = () => document.body.classList.replace('ld-wait', 'ld-in');
if(document.getElementById('launch-splash')) window.addEventListener('bx-splash-done', heroIn, { once: true });
else requestAnimationFrame(heroIn);

// A team's crest URL, or null. Like crestSrc in js/utils.js: the bright
// rendering of a dark, thin-lined crest (badgeUrlDark) where there is one.
const crestOf = t => {
  const url = t.badgeUrlDark || t.badgeUrl;
  return url && url.startsWith('https://') ? url : null;
};
// Badge rows: the standard setup's leagues, each one's top
// teams by the draft room's consensus ranking (js/draft-ranks.js) that
// the catalog has a crest for, alternating leagues so each row mixes
// sports. Each row is doubled so translateX(-50%) loops.
const PER_LEAGUE = 5;
const squash = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const teamsOf = key => {
  const league = catalog.LEAGUES.find(l => l.key === key);
  const teams = league ? league.teams.map(k => catalog.TEAM_META[k]).filter(Boolean) : [];
  const byName = new Map(teams.map(t => [squash(t.name), t]));
  const ranked = (DRAFT_RANKS[key] || '').split(';').filter(Boolean).map(row => {
    const name = squash(row.split(',')[1]);
    return byName.get((NAME_ALIASES[key] || {})[name] || name);
  });
  return ranked.filter(t => t && crestOf(t));
};
const driftTeams = [];
const rankedTeams = Object.fromEntries(drafted.map(k => [k, teamsOf(k)]));
for(let i = 0; i < PER_LEAGUE; i++) drafted.forEach(k => { const t = rankedTeams[k][i]; if(t) driftTeams.push(t); });
const driftBadge = t => teamBadgeHtml({
  crestSrc: crestOf(t),
  name: t.name, style: t.badgeStyle || '', text: t.badgeText || '', person: t.kind === 'golfer'
});
const rows = [driftTeams.filter((_, i) => i % 2 === 0), driftTeams.filter((_, i) => i % 2 === 1)];
document.getElementById('ld-drift').innerHTML = rows.filter(r => r.length).map((r, i) => {
  const html = r.map(driftBadge).join('');
  return `<div class="ld-track${i ? ' rev' : ''}">${html}${html}</div>`;
}).join('');

// "Find your group": down to the group cards.
document.getElementById('ld-find').addEventListener('click', () => {
  const label = document.getElementById('landing-groups-label');
  window.scrollTo({ top: label.getBoundingClientRect().top + scrollY - 24, behavior: reduce ? 'auto' : 'smooth' });
});

// FAQ: which sports, from the same lists the Commissioner page uses.
const sportList = keys => {
  const names = keys.map(k => SPORT_LABELS[k]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('');
};
document.getElementById('ld-faq-sports').textContent =
  `Your commissioner chooses from the ${sportList(LANDING_SPORTS)}, and sets how many teams everyone drafts in each, from 1 to ${MAX_SPORT_PICKS}. A league can also be scores only: it shows in the app, but nobody drafts it.`;

// The tour is decoration: if it ever throws, the rest of the page (the
// group cards and their claim forms) still has to load.
try {
  initTour(document.getElementById('tour'), { caps, shown, catalog, url: SAMPLE_URL });
} catch (err){
  console.error(err);
}

// "Your league, your rules": the standard setup, which a commissioner
// starts from and can change.
const SHORT = { epl: 'EPL', cfb: 'College FB', mcbb: 'College BB', pga: 'PGA Tour' };
document.getElementById('ld-yours-body').textContent =
  `Start with the standard setup, or make it yours: your commissioner picks the sports and how many teams each, from 1 to ${MAX_SPORT_PICKS}. Any league can be scores only, or left out.`;
document.getElementById('ld-yours-picks').innerHTML = sportPicksHtml({
  sports: LANDING_SPORTS.map(k => ({ label: SHORT[k] || SPORT_LABELS[k], picks: caps[k] > 0 ? caps[k] : shown.includes(k) ? 0 : null }))
});
// Claims and interest go to the worker; on localhost, `wrangler dev`.
const CLAIM_BASE = chatWorkerBase();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; // same loose check as worker/claims.js and worker/interest.js

// ---- Interest in Boxscore (worker/interest.js) ----
// For someone with no group to join here: name, email, start or join, and
// a note. It lands on the admin page's Platform view. On localhost it goes
// to `wrangler dev`.
const INTEREST_KEY = 'bx-interested'; // this browser already sent it, just to say so
const interestBox = document.getElementById('ld-interest');
const interestForm = interestBox.querySelector('form');
const showInterested = () => {
  interestForm.hidden = true;
  interestBox.querySelector('.landing-claim-done').hidden = false;
};
try { if(localStorage.getItem(INTEREST_KEY)) showInterested(); } catch (err){}

const INTEREST_ERRORS = {
  name: 'Add your name first.',
  email: 'Add an email so we can reach you.',
  429: 'Too many sign-ups right now. Try again in a bit.'
};
interestForm.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = interestForm.querySelector('.landing-claim-msg'), submit = interestForm.querySelector('[type=submit]');
  const f = interestForm.elements;
  const body = { name: f.name.value.trim(), email: f.email.value.trim(), kind: f.kind.value, note: f.note.value.trim() };
  if(!body.name){ msg.textContent = INTEREST_ERRORS.name; f.name.focus(); return; }
  if(!EMAIL.test(body.email)){ msg.textContent = INTEREST_ERRORS.email; f.email.focus(); return; }
  submit.disabled = true;
  msg.textContent = 'Sending…';
  try {
    const res = await fetch(`${CLAIM_BASE}/interest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if(res.ok){
      try { localStorage.setItem(INTEREST_KEY, String(Date.now())); } catch (err){}
      msg.textContent = '';
      showInterested();
      return;
    }
    const code = res.status === 400 ? ((await res.json().catch(() => ({}))).error || 'name') : res.status;
    msg.textContent = INTEREST_ERRORS[code] || 'That didn’t go through. Try again.';
  } catch (err){
    msg.textContent = 'Couldn’t reach Boxscore. Check your connection and try again.';
  }
  submit.disabled = false;
});

// A group still filling its roster is a recruiting card: the claim form
// and no link into its app, since everyone who lands here then is a
// prospect, not a member. Once its last open spot is filled
// (js/groups.js) it's a plain link to its app again.
// Confirmed spots count as filled (js/roster.js), so the open count and
// the switch back to a plain link follow the admin page, not just
// js/groups.js. The tour above is already running while this waits.
await Promise.all(LANDING_GROUPS.map(loadRoster));

const groupsEl = document.getElementById('landing-groups');
const shownGroups = LANDING_GROUPS.map(id => GROUPS[id]);
groupsEl.innerHTML = shownGroups.map(g => {
  const open = openSpots(g.id).length, total = g.drafters.length, taken = total - open;
  const meter = spotsMeterHtml({ filled: taken, total, full: !open });
  if(!open) return `
  <a class="ld-group landing-group ld-rv" href="${groupAppUrl(g.id, host)}">
    <span class="ld-group-top"><span class="ld-group-name">${escapeHtml(g.name)}</span><span class="ld-group-go">Open ›</span></span>
    ${meter}
    <span class="ld-group-meta"><span>Full</span><span>Season underway</span></span>
  </a>`;
  return `
  <div class="ld-group open ld-rv landing-recruit" data-group="${g.id}">
    ${teamOrbHtml({ color: 'var(--accent)', cls: 'ld-group-orb' })}
    <div class="ld-group-top">
      <span class="ld-group-name">${escapeHtml(g.name)}</span>
      <button type="button" class="ld-group-go ld-claim-toggle" aria-expanded="false">Claim a spot ›</button>
    </div>
    ${meter}
    <div class="ld-group-meta"><span>${taken} of ${total} spots taken</span><span class="ld-group-date" data-group="${g.id}">Draft date to be set</span></div>
    <div class="ld-claim"><div>
      <form class="landing-claim-form" novalidate>
        <p class="landing-claim-lead">Want in? Send your name and email and the commissioner will reach out before the draft.</p>
        <input name="name" type="text" maxlength="40" autocomplete="name" placeholder="Your name" required>
        <input name="email" type="email" maxlength="80" autocomplete="email" inputmode="email" placeholder="Email" required>
        ${buttonHtml({ label: 'Claim a spot', type: 'submit' })}
        <p class="landing-claim-msg" role="status"></p>
      </form>
    </div></div>
    <p class="landing-claim-done" hidden><strong>Spot claimed.</strong> The commissioner will be in touch.</p>
  </div>`;
}).join('');

// "Claim a spot ›" opens the form inside the card.
groupsEl.addEventListener('click', e => {
  const toggle = e.target.closest('.ld-claim-toggle');
  if(!toggle) return;
  const card = toggle.closest('.ld-group');
  const open = !card.classList.contains('claiming');
  card.classList.toggle('claiming', open);
  toggle.setAttribute('aria-expanded', String(open));
  if(open) setTimeout(() => card.querySelector('input[name=name]').focus({ preventScroll: true }), reduce ? 0 : 320);
});

// The draft date, from the group's live draft room (GET /draft/status,
// as Home's draft card reads it). No date, or no answer: "to be set".
groupsEl.querySelectorAll('.ld-group-date').forEach(async el => {
  try {
    const res = await fetch(`${chatWorkerBase()}/draft/status?room=main&group=${encodeURIComponent(el.dataset.group)}`, { cache: 'no-store' });
    const data = res.ok ? await res.json() : null;
    const at = data && data.scheduledAt;
    if(at && at > Date.now()) el.textContent = `Draft ${new Date(at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`;
    else if(data && data.phase && data.phase !== 'lobby') el.textContent = 'Draft underway';
  } catch (err){}
});

// Sections rise in, and spots meters fill, the first time they're 35% in view.
if(!reduce && 'IntersectionObserver' in window){
  const io = new IntersectionObserver(entries => entries.forEach(e => {
    if(!e.isIntersecting) return;
    e.target.classList.add('in');
    io.unobserve(e.target);
  }), { threshold: 0.35 });
  document.querySelectorAll('.ld-rv').forEach(el => io.observe(el));
} else {
  document.querySelectorAll('.ld-rv').forEach(el => el.classList.add('in'));
}

// The heading and footer follow what's listed: joining while every group
// shown is recruiting, opening your app once any of them is live.
const anyLive = shownGroups.some(g => !openSpots(g.id).length);
document.getElementById('landing-foot').hidden = !anyLive;

// ---- Claiming an open spot (worker/claims.js) ----
// A request, not a roster change: it shows on the admin page, where
// confirming it fills a spot. On localhost it goes to `wrangler dev`.
const CLAIMED_KEY = 'bx-claimed'; // group ids this browser already claimed in, just to say so

function claimedGroups(){
  try { return JSON.parse(localStorage.getItem(CLAIMED_KEY) || '[]'); } catch (e){ return []; }
}

function showClaimed(box){
  box.classList.remove('claiming');
  box.classList.add('claimed');
  box.querySelector('.landing-claim-form').hidden = true;
  box.querySelector('.landing-claim-done').hidden = false;
  const toggle = box.querySelector('.ld-claim-toggle');
  if(toggle) toggle.hidden = true;
}

const claimed = claimedGroups();
groupsEl.querySelectorAll('.landing-recruit').forEach(box => {
  if(claimed.includes(box.dataset.group)) showClaimed(box);
});

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

// ---- Opening a group: card → screen, logo → center → the group's splash ----
// The landing and each group are different origins, so no cross-document
// View Transition or shared sessionStorage. Instead this page ends on the
// exact frame the group's splash shows once its mark is built (200px,
// centered, raised 26px, on the splash ground) and navigates with
// #splash=handoff; js/launch-splash.js starts from that frame. The splash
// ground grows out of the tapped card (r20 → the screen's corners) while
// the header logo flies to the center. The old page stays painted until
// the new one's first paint, so there's no seam.
const IO = 'cubic-bezier(0.65,0,0.35,1)', EO = 'cubic-bezier(0.22,1,0.36,1)', SHEET = 'cubic-bezier(0.32,0.72,0,1)';
const handoff = document.getElementById('landing-handoff');
const logo = document.querySelector('.landing-logo');
const main = document.querySelector('.landing-main');
let anims = [], timer = 0;

groupsEl.addEventListener('click', e => {
  const link = e.target.closest('.landing-group');
  if(!link || link.tagName !== 'A' || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
  e.preventDefault();
  if(anims.length) return;
  if(reduce || !handoff || !logo || !handoff.animate){ location.href = link.href; return; }

  const r = logo.getBoundingClientRect(), c = link.getBoundingClientRect();
  const dx = r.left + r.width / 2 - innerWidth / 2, dy = r.top + r.height / 2 - innerHeight / 2;
  const s = r.width / 200; // the header PNG is the whole 200px icon box, scaled down
  // A phone's own screen corners; a desktop window's are square.
  const corner = innerWidth < 600 ? 44 : 0;
  const from = `inset(${c.top}px ${innerWidth - c.right}px ${innerHeight - c.bottom}px ${c.left}px round 20px)`;
  handoff.hidden = false;
  logo.style.visibility = 'hidden';
  anims = [
    handoff.querySelector('.ls-bg').animate(
      [{ clipPath: from, opacity: 1 }, { clipPath: `inset(0px 0px 0px 0px round ${corner}px)`, opacity: 1 }],
      { duration: 640, easing: SHEET, fill: 'both' }),
    handoff.querySelector('.ls-logo').animate(
      [{ transform: `translate(${dx}px,${dy}px) scale(${s})` }, { transform: 'translate(0px,-26px) scale(1)' }],
      { duration: 640, easing: IO, fill: 'both' }),
    main.animate([{ opacity: 1, transform: 'translateY(0px)' }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 260, delay: 120, easing: EO, fill: 'both' })
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
