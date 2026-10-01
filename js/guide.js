/* ============================================================
   Feature guide: what the app can do, in two places that read from the
   one GUIDE list below.

   - The tour: a few swipeable one-line cards in the first-run welcome
     sheet (js/identity.js), shown right after a new device picks its
     name. In a phone browser the welcome opens on the Add to Home Screen
     steps, and the name pick and tour only follow "Continue in browser";
     otherwise they run in the Home Screen app on its first open. Its
     last card turns on alerts where the device can get them.
   - The guide page (#view-guide, Settings -> How Boxscore works): every
     entry, each with a button that jumps to it. Reopenable any time.

   Adding a feature: add one entry to GUIDE. `tour: true` puts it in the
   tour too (keep that to four or so); the tour shows only its `lead`,
   the guide page adds the `points`. `pre` is the text used instead
   while this group hasn't held its first draft (ACTIVE_SEASON.preDraft),
   when Home and Points are still empty and nothing shows a drafter.
   ============================================================ */
import { ACTIVE_GROUP } from './group.js';
import { ACTIVE_SEASON } from './season.js';
import { PUSH_KINDS, loadPushConfig, pushAvailability, pushPrefs, setPushPref } from './push.js';
import { CHEVRON_LEFT_SVG } from './utils.js';

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

// { id, icon, title, lead, points[], pre?: { lead, points }, go: [label, js], tour? }
// `go` is an inline onclick; every target is already a window global.
const GUIDE = [
  {
    id: 'home', icon: 'home', tour: true, title: 'Your teams',
    lead: 'Home is your board: every team you drafted, grouped by league, with its latest form and next game.',
    points: [
      'Tap any team for its page: schedule, news, squad and stats.',
      'Star a team on its page to keep it on your board even if someone else drafted it.',
      'Tap a drafter on Points to see their board.'
    ],
    pre: {
      lead: 'Home is your board. Until the draft it shows when the draft starts, or asks which times you can make while the commissioner is still choosing, plus the way into the mock and live rooms; after, it fills in with every team you drafted, grouped by league.',
      points: [
        'Tap any team for its page: schedule, news, squad and stats.',
        'Star a team on its page to keep it on your board even if someone else drafted it.'
      ]
    },
    go: ['Go to Home', "switchView('board')"]
  },
  {
    id: 'scores', icon: 'scores', tour: true, title: 'Scores',
    lead: 'Every drafted team’s games for the day, live ones first.',
    points: [
      'Use the arrows to look back at results or ahead at the schedule.',
      'Narrow it to drafted teams or your favorites.',
      'Tap a game for its details and highlights.'
    ],
    pre: {
      lead: 'Every game across the 8 leagues for the day, live ones first.',
      points: [
        'Use the arrows to look back at results or ahead at the schedule.',
        'Narrow it to your favorites.',
        'Tap a game for its details and highlights.'
      ]
    },
    go: ['Go to Scores', "switchView('live-now')"]
  },
  {
    id: 'standings', icon: 'standings', title: 'Standings',
    lead: 'The real tables for all 8 leagues, with every team tagged by who drafted it.',
    points: [
      'Switch between League (the real table) and Drafted (each drafter’s teams together).',
      'MLB and WNBA show last season until their next one starts. Those results don’t count yet.'
    ],
    pre: {
      lead: 'The real tables for all 8 leagues. Tap any team for its page.',
      points: [
        'After the draft, every team gets tagged with who drafted it, and a Drafted view puts each drafter’s teams together.',
        'MLB and WNBA show last season until their next one starts.'
      ]
    },
    go: ['Go to Standings', "switchView('standings')"]
  },
  {
    id: 'points', icon: 'points', tour: true, title: 'Points',
    lead: 'The leaderboard: where every drafter stands if every season ended today.',
    points: [
      'Points come from where teams finish, not single games: division titles, best records, playoffs and titles, minus points for finishing last.',
      'Each league also pays +5 to the drafter whose teams have the best combined record.',
      'Live points can still change until a league’s season ends. Locked points are final.',
      'Race charts everyone’s points (or rank) over the season. Drag across it to see any day, tap a month to zoom, or Replay the season so far.',
      'Tap a drafter for their breakdown, or Compare to go head to head. Activity shows who moved.'
    ],
    go: ['Go to Points', "switchView('overall')"]
  },
  {
    id: 'scoring', icon: 'points', title: 'Scoring rules',
    lead: 'Every league’s point values in one place, one league at a time.',
    points: ['Also reachable from the Scoring chip on the Points tab.'],
    go: ['See the rules', 'openScoringSheet()']
  },
  {
    id: 'chat', icon: 'chat', tour: true, title: 'Chat',
    lead: `A group chat for ${ACTIVE_GROUP.name}, the button in the middle of the tab bar.`,
    points: [
      'Tap a message to react to it.',
      'Use the GIF button to send a GIF.',
      'Share to chat in a game’s box score posts the score as it stands. Its live line catches up once the game moves on.',
      'The Chat tab shows how many messages you haven’t read.'
    ],
    go: ['Go to Chat', "switchView('chat')"]
  },
  {
    id: 'draft', icon: 'draft', title: 'Draft room',
    lead: `${ACTIVE_GROUP.name}’s snake draft happens right in Boxscore. Find it under Settings, then Draft, or on Home once the next one is scheduled.`,
    points: [
      'Mock Draft is always open: practice against bots whenever you like.',
      'While the commissioner is choosing a time, Home asks which of their options you can make. Tap every one that works.',
      'Once the commissioner sets the next draft’s time, Home counts down to it, and your phone tells you if alerts are on.',
      'While the real draft is live, a banner on every page takes you back to it.',
      'Can’t make it, or stepping away? Turn on Auto-draft (under My queue, in My team on a phone, or in the lobby) and the room picks for you a few seconds after you’re up: your top queued team that fits, else the best one left.',
      'Tap any team, in the list, the board or a roster, for a quick outlook, its last season, its record so far and its title odds.',
      'Tap Scoring under the room’s title to check what each league’s teams are worth.',
      'Download the board as a spreadsheet once it’s done.'
    ],
    pre: {
      lead: `${ACTIVE_GROUP.name} drafts right here in Boxscore. The Mock Draft and the live draft are both on Home.`,
      points: [
        'Try Mock Draft any time to practice against bots and learn how it works.',
        'Tap any team for a quick outlook, its last season, its record so far and its title odds.',
        'Tap Scoring under the room’s title to check what each league’s teams are worth.',
        'Home shows when the live draft starts, once the commissioner sets the time.',
        'On draft day, a banner on every page takes you into the live room.',
        'Can’t make the draft? Star teams into your queue and turn on Auto-draft in the room, and it picks for you.',
        'Turn on draft alerts so your phone tells you when you’re on the clock.'
      ]
    },
    go: ['Open the draft', 'openDraftPicker()']
  },
  {
    id: 'alerts', icon: 'bell', title: 'Alerts',
    lead: 'Your phone can tell you when you’re on the clock in the draft, when your teams gain or lose points, when someone posts in chat, and when the draft’s time is set.',
    points: [
      'Turn them on in Settings, under Alerts. Each device is set up on its own.',
      'On iPhone, alerts only work in the app added to your Home Screen.'
    ],
    pre: {
      lead: 'Your phone can tell you when you’re on the clock in the draft, when someone posts in chat, and when the draft’s time is set.',
      points: [
        'Turn them on in Settings, under Alerts. Each device is set up on its own.',
        'On iPhone, alerts only work in the app added to your Home Screen.',
        'Once the season starts there’s one for your points too.'
      ]
    },
    go: ['Set up alerts', 'guideOpenAlerts()']
  },
  {
    id: 'settings', icon: 'gear', title: 'Settings',
    lead: 'The gear at the top of every page.',
    points: [
      'Switch who you are on this device, pick light or dark, and choose which tab the app opens to.',
      'Add the app to your Home Screen so it opens full screen, like a real app.'
    ],
    go: ['Back to Settings', 'backToSettings()']
  }
];

// The draft card moves to the front of the tour while there's nothing
// on Home or Points yet.
function entries({ tourOnly = false } = {}){
  const pre = !!ACTIVE_SEASON.preDraft;
  let list = GUIDE.map(g => (pre && g.pre) ? { ...g, ...g.pre } : g);
  if(tourOnly){
    list = list.filter(g => g.tour || (pre && g.id === 'draft'));
    if(pre) list.sort((a, b) => (b.id === 'draft') - (a.id === 'draft'));
  }
  return list;
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
          <span class="switch ${prefs[kind] ? 'on' : ''}" aria-hidden="true"></span>
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
        ${i > 0 ? `<button type="button" class="modal-cta secondary" onclick="guideTourStep(-1)">Back</button>` : ''}
        <button type="button" class="modal-cta" onclick="${last ? 'guideTourDone()' : 'guideTourStep(1)'}">${last ? 'Done' : 'Next'}</button>
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

export function renderGuidePage(){
  const el = document.getElementById('guide-content');
  if(!el) return;
  const pre = !!ACTIVE_SEASON.preDraft;
  el.innerHTML = `
    <div class="set-head">
      <div class="page-header">
        <div class="page-header-top"><h1>How Boxscore works</h1></div>
        <div class="page-sub">${pre
          ? `Everything Boxscore does for ${ACTIVE_GROUP.name}. Your board and the leaderboard fill in after ${ACTIVE_GROUP.name}’s first draft.`
          : `Everything Boxscore does for ${ACTIVE_GROUP.name}, and where to find it.`}</div>
      </div>
      <div class="ob-back-row">
        <button type="button" class="ob-back" onclick="backToSettings()">${CHEVRON_LEFT_SVG}Settings</button>
      </div>
    </div>
    ${entries().map(g => `
      <section class="guide-entry" id="guide-${g.id}">
        <div class="guide-entry-head">
          <span class="guide-entry-icon">${ICONS[g.icon]}</span>
          <h2 class="guide-entry-title">${g.title}</h2>
        </div>
        <p class="guide-entry-lead">${g.lead}</p>
        ${pointsHtml(g.points)}
        <button type="button" class="guide-go" onclick="${g.go[1]}">${g.go[0]} <span aria-hidden="true">&rsaquo;</span></button>
      </section>`).join('')}
  `;
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
