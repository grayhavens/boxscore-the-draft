/* ============================================================
   Feature guide: how Boxscore works, in two places that read from the
   SECTIONS and APP_ROWS lists below.

   - The guide page (#view-guide, Settings -> How Boxscore works): three
     short sections on what's different from a normal fantasy league
     (you draft teams; teams score on how they finish; live vs locked
     points), each with a still picture of the app, then "Around the
     app", one row per tab and setting. Reopenable any time.
   - The tour: a few swipeable one-line cards in the first-run welcome
     sheet (js/identity.js), shown right after a new device picks its
     name: the entries marked `tour`, with their `tourLead`. In a phone
     browser the welcome opens on the Add to Home Screen steps, and the
     name pick and tour only follow "Continue in browser"; otherwise they
     run in the Home Screen app on its first open. Its last card turns on
     alerts where the device can get them.

   Adding a feature: usually one APP_ROWS line, a sentence long. Keep the
   whole page short: the reader has done a fantasy draft and only needs
   what's different here. `pre` is the text used instead while this group
   hasn't held its first draft (ACTIVE_SEASON.preDraft).
   ============================================================ */
import { ACTIVE_GROUP, ACTIVE_GROUP_ID } from './group.js';
import { groupCaps } from './groups.js';
import { DEFAULT_CAPS } from './draft-rules.js';
import { SPORT_KEYS } from './sports.js';
import { FILTER_CHIP_LABELS } from './league-labels.js';
import { preDraftClass } from './seasons/pre-draft.js';
import { paintSceneStill } from './landing-explainer.js';
import { ACTIVE_SEASON } from './season.js';
import { PUSH_KINDS, loadPushConfig, pushAvailability, pushPrefs, setPushPref } from './push.js';

import { buttonHtml, backLinkHtml, switchHtml } from './ui.js';
const svg = body => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

// The first five match the tab bar's icons (index.html).
const ICONS = {
  home: svg('<rect x="3" y="3" width="8" height="8" rx="2"></rect><rect x="13" y="3" width="8" height="8" rx="2"></rect><rect x="3" y="13" width="8" height="8" rx="2"></rect><rect x="13" y="13" width="8" height="8" rx="2"></rect>'),
  scores: svg('<path d="M6 4v16"></path><circle cx="6" cy="8" r="1.9" fill="currentColor" stroke="none"></circle><circle cx="6" cy="16" r="1.9" fill="currentColor" stroke="none"></circle><path d="M11 8h9"></path><path d="M11 16h6"></path>'),
  chat: svg('<path d="M21 11.5a8.4 8.4 0 0 1-12.2 7.5L3.5 20.5l1.6-4.9A8.4 8.4 0 1 1 21 11.5z"></path>'),
  standings: svg('<path d="M4 6.5h15.5"></path><path d="M4 12h10.5"></path><path d="M4 17.5h6"></path>'),
  points: svg('<path d="M9.5 21v-9.5h5V21"></path><path d="M3 21v-6h6.5"></path><path d="M14.5 21H21v-8h-6.5"></path><path d="M12 3l1.6 2.6L16.5 6l-2 2.1.5 2.9-3-1.5-3 1.5.5-2.9L7.5 6l2.9-.4z"></path>'),
  draft: svg('<rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M8 8h8"></path><path d="M8 12h8"></path><path d="M8 16h5"></path>'),
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.7 21a2 2 0 0 1-3.4 0"></path>'),
  gear: svg('<circle cx="12" cy="12" r="3"></circle><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"></path>')
};

// The draft's shape for this group: picks per league (its caps, or the
// standard setup's), for the copy and the board picture.
const DRAFTED_LEAGUES = ACTIVE_SEASON.LEAGUES.filter(l => !l.scoresOnly).map(l => l.key);
const CAPS = (() => {
  const base = groupCaps(ACTIVE_GROUP_ID) || DEFAULT_CAPS;
  const caps = {};
  DRAFTED_LEAGUES.forEach(k => { if(base[k] > 0) caps[k] = base[k]; });
  return Object.keys(caps).length ? caps : { ...DEFAULT_CAPS };
})();
const leagueLabel = k => FILTER_CHIP_LABELS[k] || (ACTIVE_SEASON.LEAGUES.find(l => l.key === k) || {}).label || k.toUpperCase();
const ROUNDS = Object.values(CAPS).reduce((a, b) => a + b, 0);
const CAPS_LINE = SPORT_KEYS.filter(k => CAPS[k]).map(k => `${CAPS[k]} ${leagueLabel(k)}`).join(', ');
const HAS_GOLF = ACTIVE_SEASON.LEAGUES.some(l => l.key === 'pga');

// Written for someone who's done a fantasy draft before but not this
// kind: what's different, in as few words as it takes. Sections carry a
// still picture of the app (`shot`: a scene of the landing page's tour,
// js/landing-explainer.js, drawn for this group's setup, at progress
// `shotAt`); "Around the app" is one row per tab and setting.
//
// { id, icon, title, lead, points?, shot?, shotAt?, go?: [label, js], tour?, tourLead?, pre?: {…}, when? }
// `tour: true` puts it in the welcome tour (its `tourLead`, else `lead`);
// `pre` replaces fields while this group hasn't held its first draft;
// `when` leaves it out for a group it doesn't apply to. `go` is an inline
// onclick; every target is already a window global.
const SECTIONS = [
  {
    id: 'draft', icon: 'draft', tour: true, title: 'Draft teams, not players',
    lead: `It’s a snake draft like any fantasy draft, except every pick is a whole real team. ${ROUNDS} rounds, across ${Object.keys(CAPS).length} leagues.`,
    tourLead: 'A snake draft like any fantasy draft, except every pick is a whole real team, across every league.',
    points: [
      `Everyone takes the same mix: ${CAPS_LINE}.`,
      'Practice in Mock Draft any time. Can’t make the real one? Auto-draft picks for you.'
    ],
    shot: 'board',
    go: ['Open the draft', 'openDraftPicker()']
  },
  {
    id: 'scoring', icon: 'points', tour: true, title: 'Teams score on how they finish',
    lead: 'No weekly matchups, no player stats. A team earns points for where its season ends: playoff runs, titles, top records. Finishing last costs you.',
    tourLead: 'No weekly matchups or player stats. Teams earn points for where their season ends: playoffs, titles, top records.',
    points: [
      'Each league also pays +5 to whoever’s teams have the best combined record.',
      'A team’s page shows what it’s worth to you and what it’s still chasing.'
    ],
    shot: 'team',
    go: ['See every rule', 'openScoringSheet()']
  },
  {
    id: 'points', icon: 'points', tour: true, title: 'Blue is live, gold is locked',
    lead: 'Live points (blue) are what you’d get if every season ended today, so they move with the standings. When a league’s season ends, its points lock (gold).',
    tourLead: 'Live points (blue) move with the standings. When a league’s season ends, its points lock (gold).',
    points: ['Every league adds up to one total. Most points when the last season ends wins.'],
    shot: 'lock', shotAt: 0.4,
    go: ['Go to Points', "switchView('overall')"]
  }
];

const APP_ROWS = [
  {
    id: 'home', icon: 'home', title: 'Home',
    lead: 'Your teams, their form and next game. Tap any team for its page.',
    pre: { lead: 'The draft countdown and the way in. Your teams show here after.' },
    go: ['Go to Home', "switchView('board')"]
  },
  {
    id: 'scores', icon: 'scores', title: 'Scores',
    lead: 'Every game with a drafted team, live ones first. Tap one for the box score.',
    pre: { lead: 'Every game across your leagues, live ones first.' },
    go: ['Go to Scores', "switchView('live-now')"]
  },
  {
    id: 'chat', icon: 'chat', tour: true, title: 'Chat',
    lead: 'Your group’s chat. Hold a message to react, type @ to tag someone.',
    tourLead: `${ACTIVE_GROUP.name}’s own group chat, in the middle of the tab bar.`,
    go: ['Go to Chat', "switchView('chat')"]
  },
  {
    id: 'standings', icon: 'standings', title: 'Standings',
    lead: 'The real tables, every team tagged with who drafted it. Playoff brackets once they’re set.',
    pre: { lead: 'The real tables for every league.' },
    go: ['Go to Standings', "switchView('standings')"]
  },
  {
    id: 'overall', icon: 'points', title: 'Points',
    lead: 'The leaderboard, the season race, and each drafter’s breakdown.',
    pre: { lead: 'The leaderboard, once the draft is done.' },
    go: ['Go to Points', "switchView('overall')"]
  },
  {
    id: 'golf', icon: 'standings', title: 'PGA Tour', when: () => HAS_GOLF,
    lead: 'Golfers score from where they finish. Majors are worth the most and get a card on Home that week.',
    go: ['Go to Standings', "switchView('standings')"]
  },
  {
    id: 'alerts', icon: 'bell', title: 'Alerts',
    lead: 'Your turn in the draft, points that move, chat. On iPhone, only in the Home Screen app; on Android, in Chrome or the installed app.',
    go: ['Set up alerts', 'guideOpenAlerts()']
  },
  {
    id: 'settings', icon: 'gear', title: 'Settings',
    lead: 'The gear up top: who you are, light or dark, the tab the app opens to.',
    go: ['Back to Settings', 'backToSettings()']
  }
];

function resolve(list){
  const pre = !!ACTIVE_SEASON.preDraft;
  return list.filter(g => !g.when || g.when()).map(g => (pre && g.pre) ? { ...g, ...g.pre } : g);
}

// The welcome tour: the three ideas, then Chat.
function entries({ tourOnly = false } = {}){
  const list = [...resolve(SECTIONS), ...resolve(APP_ROWS)];
  return tourOnly ? list.filter(g => g.tour).map(g => ({ ...g, lead: g.tourLead || g.lead })) : list;
}

const pointsHtml = points => `<ul class="guide-points">${points.map(p => `<li>${p}</li>`).join('')}</ul>`;

/* ---- The tour (inside #welcome-content) ---- */

let tour = null; // { el, cards, i, drafter, onDone, note }

// Rendered from js/identity.js right after the name pick. Waits (briefly)
// for the worker's push config so the card count is right from the start.
export async function startTour(el, { drafter, onDone }){
  await Promise.race([loadPushConfig(), new Promise(r => setTimeout(r, 1500))]);
  const cards = entries({ tourOnly: true });
  // Only where alerts can be turned on right here: in a phone browser
  // they'd need the Home Screen app, which the welcome just offered.
  if(pushAvailability() === 'ready') cards.push({ id: 'alerts-card' });
  tour = { el, cards, i: 0, drafter, onDone, note: '' };
  enableSwipe(el);
  paintTour();
}

function tourCardBody(card){
  // Kept compact (no big icon, no row subtitles, the Settings pointer in
  // its sentence) so it fits the same sheet height as the one-line cards.
  if(card.id === 'alerts-card'){
    const prefs = pushPrefs();
    return `
      <div class="welcome-title">Turn on alerts</div>
      <div class="welcome-sub">Know when you’re on the clock${ACTIVE_SEASON.preDraft ? '' : ', your points move,'} or someone posts. Change these, and find more help, in <b>Settings</b>.</div>
      <div class="guide-alert-rows">${PUSH_KINDS.map(([kind, title]) => `
        <button type="button" class="set-row" role="switch" aria-checked="${prefs[kind]}" onclick="guideTogglePush('${kind}')">
          <span class="set-row-text"><span class="set-row-title">${title}</span></span>
          ${switchHtml({ on: prefs[kind] })}
        </button>`).join('')}</div>
      ${tour.note ? `<div class="welcome-note">${tour.note}</div>` : ''}`;
  }
  return `
    <div class="guide-card-icon">${ICONS[card.icon]}</div>
    <div class="welcome-title">${card.title}</div>
    <div class="welcome-sub">${card.lead}</div>`;
}

function paintTour(){
  const { el, cards, i } = tour;
  const last = i === cards.length - 1;
  el.dataset.step = 'tour';
  el.innerHTML = `
    <div class="welcome-head guide-card">
      <div class="welcome-eyebrow">${i + 1} of ${cards.length}</div>
      ${tourCardBody(cards[i])}
      ${last && cards[i].id !== 'alerts-card' ? '<div class="welcome-note">More any time in <b>Settings</b> (the gear up top), under <b>How Boxscore works</b>.</div>' : ''}
    </div>
    <div class="guide-foot">
      <div class="guide-dots" aria-hidden="true">${cards.map((_, j) => `<span class="${j === i ? 'on' : ''}"></span>`).join('')}</div>
      <div class="welcome-actions guide-actions">
        ${i > 0 ? buttonHtml({ label: 'Back', variant: 'secondary', onclick: 'guideTourStep(-1)' }) : ''}
        ${buttonHtml({ label: last ? 'Done' : 'Next', onclick: last ? 'guideTourDone()' : 'guideTourStep(1)' })}
      </div>
      ${last ? '' : '<button type="button" class="welcome-skip" onclick="guideTourDone()">Skip the tour</button>'}
    </div>
  `;
  el.scrollTop = 0;
}

window.guideTourStep = delta => {
  if(!tour) return;
  const i = tour.i + delta;
  if(i < 0 || i >= tour.cards.length) return;
  tour.i = i;
  tour.note = '';
  paintTour();
};

window.guideTourDone = () => {
  if(!tour) return;
  const { onDone } = tour;
  tour = null;
  onDone();
};

// Same as Settings' Alerts switches (js/identity.js togglePushPref):
// setPushPref runs straight from the tap so iOS shows its permission prompt.
let pushBusy = false;
window.guideTogglePush = async kind => {
  if(!tour || pushBusy) return;
  pushBusy = true;
  tour.note = '';
  try {
    await setPushPref(tour.drafter, kind, !pushPrefs()[kind]);
  } catch (e){
    if(tour) tour.note = e.message === 'permission' ? 'Alerts need notification permission.' : 'Couldn’t reach Boxscore. Try again in a moment.';
  }
  pushBusy = false;
  if(tour) paintTour();
};

// Horizontal swipe moves between cards; mostly-vertical drags are left
// to scrolling and the sheet's own swipe-to-dismiss.
let swipeBound = false;
function enableSwipe(el){
  if(swipeBound) return;
  swipeBound = true;
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => {
    if(!tour || e.touches.length !== 1){ x0 = null; return; }
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, { passive: true });
  el.addEventListener('touchend', e => {
    if(!tour || x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if(Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    window.guideTourStep(dx < 0 ? 1 : -1);
  }, { passive: true });
}

// A sheet closed some other way (tapping outside) ends the tour.
export function endTour(){ tour = null; }

/* ---- The guide page (#view-guide) ---- */

// The setup the pictures are drawn for: this group's picks, from every
// sport's teams (built once, on first open).
let shotSetup = null;
const setupForShots = () => shotSetup || (shotSetup = { caps: CAPS, shown: [], catalog: preDraftClass(null) });

const goHtml = go => `<button type="button" class="guide-go" onclick="${go[1]}">${go[0]} <span aria-hidden="true">&rsaquo;</span></button>`;

// `backLabel`: where the back link returns (closeGuide in js/board.js):
// Settings, or Home before the draft.
export function renderGuidePage({ backLabel = 'Settings' } = {}){
  const el = document.getElementById('guide-content');
  if(!el) return;
  el.innerHTML = `
    <div class="set-head">
      <div class="page-header">
        <div class="page-header-top"><h1>How Boxscore works</h1></div>
        <div class="page-sub">Fantasy sports, but every pick is a whole team, from every league.</div>
      </div>
      <div class="ob-back-row">
        ${backLinkHtml({ label: backLabel, onclick: 'closeGuide()' })}
      </div>
    </div>
    ${resolve(SECTIONS).map((g, i) => `
      <section class="guide-entry" id="guide-${g.id}">
        <div class="guide-step">${i + 1}</div>
        <h2 class="guide-entry-title">${g.title}</h2>
        <p class="guide-entry-lead">${g.lead}</p>
        ${g.points ? pointsHtml(g.points) : ''}
        ${g.shot ? `<div class="guide-shot" data-scene="${g.shot}" data-at="${g.shotAt ?? 1}"></div>` : ''}
        ${g.go ? goHtml(g.go) : ''}
      </section>`).join('')}
    <section class="guide-entry guide-app" id="guide-app">
      <h2 class="guide-entry-title">Around the app</h2>
      <div class="guide-rows">${resolve(APP_ROWS).map(r => `
        <button type="button" class="guide-row" id="guide-${r.id}" onclick="${r.go[1]}">
          <span class="guide-entry-icon">${ICONS[r.icon]}</span>
          <span class="guide-row-text"><b>${r.title}</b><span>${r.lead}</span></span>
          <span class="guide-row-go" aria-hidden="true">&rsaquo;</span>
        </button>`).join('')}</div>
    </section>
  `;
  el.querySelectorAll('.guide-shot').forEach(node => paintSceneStill(node, node.dataset.scene, setupForShots(), Number(node.dataset.at)));
}

// The Alerts entry's button: back to Settings, scrolled to its Alerts
// section (which only fills in once the worker's push config is loaded).
window.guideOpenAlerts = () => {
  window.backToSettings();
  loadPushConfig().then(() => setTimeout(() => {
    const el = document.getElementById('set-alerts');
    if(el && el.firstElementChild) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, 350));
};
