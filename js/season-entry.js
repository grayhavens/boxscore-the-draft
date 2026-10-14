/* ============================================================
   "Enter the season": the moment a drafter steps from a finished draft
   into the app with their new teams. js/live-class.js builds the new
   class on this device as soon as the draft is done; this is the screen
   that covers that build and then hands over to it.

   - Building: a full-screen layer (seasonEntryHtml in js/ui.js). The
     drafter's teams wait as faint slots and drop in as the gold bar
     passes their picks, so the bar is visibly filling their roster. The
     bar follows the real build (picks placed of the board's total), and
     with motion on it never runs faster than MIN_BUILD_MS, so a build
     that's already done still reads as a moment rather than a flash.
   - Ready: "Your 2027 season is set", Enter and Not now. Enter fades the
     layer out, clears the launch splash's once-per-session mark and
     reloads onto Home with your own board (?view=board&team=<you>), so
     the splash plays again and flies the logo into the header as the new
     season appears. Not now just closes it; the class is stored, so the
     next launch opens on it anyway.
   - Failed (ESPN or the worker didn't answer): it says it's still setting
     up and keeps waiting; live-class retries on a later status answer.

   When it opens: by itself anywhere in the app, except the draft room,
   where people stay on the finished board until they tap the Draft
   Complete card's Enter button (js/draft.js), which calls
   window.openSeasonEntry. Once per class: Not now isn't asked again
   this session.

   Reduced motion: no fades, no crest drop, no minimum time; the bar just
   shows where the build is.
   ============================================================ */
import { subscribeLiveClass, liveClassState } from './live-class.js';
import { seasonEntryHtml, buttonHtml } from './ui.js';
import { fxOn, play } from './motion-fx.js';
import { teamBadgeHtml, reducedMotion, lockBodyScroll, unlockBodyScroll } from './utils.js';
import { currentProfileId } from './identity.js';
import { LATEST_SEASON_ID } from './seasons/index.js';

// With motion on, the bar takes at least this long to fill.
const MIN_BUILD_MS = 2600;
const TICK_MS = 80;

let root = null;
let openedAt = 0;
let shown = 0;          // the bar as drawn, 0-100
let timer = null;
let dismissed = null;   // the year Not now was tapped for

const inDraftRoom = () => new URLSearchParams(location.search).get('view') === 'draft';
const slow = () => fxOn() && !reducedMotion();

export function initSeasonEntry(){
  window.openSeasonEntry = openSeasonEntry;
  window.enterSeason = enterSeason;
  window.closeSeasonEntry = closeSeasonEntry;
  const consider = s => {
    if(root){ tick(); return; }
    if((s.phase === 'building' || s.phase === 'ready') && !inDraftRoom() && s.year !== dismissed) openSeasonEntry();
  };
  subscribeLiveClass(consider);
  consider(liveClassState());
}

export function openSeasonEntry(){
  const s = liveClassState();
  if(root || s.phase === 'idle') return;
  openedAt = performance.now();
  shown = 0;
  const crests = wellsHtml(s.mine);
  document.body.insertAdjacentHTML('beforeend', seasonEntryHtml({
    eyebrow: 'Draft complete',
    title: titleFor(s, false),
    crestsHtml: crests,
    pct: 0,
    ctaHtml: buttonHtml({ label: 'Enter Boxscore', onclick: 'enterSeason()', cls: 'se-enter' })
      + buttonHtml({ label: 'Not now', variant: 'secondary', onclick: 'closeSeasonEntry()' })
  }));
  root = document.getElementById('season-entry');
  root.addEventListener('keydown', e => { if(e.key === 'Escape') closeSeasonEntry(); });
  lockBodyScroll();
  clearInterval(timer);
  timer = setInterval(tick, TICK_MS);
  tick();
}

// An empty well per pick; its badge (the class's own TEAM_META entry,
// the same badge Home shows) drops in once the bar passes it.
const wellsHtml = mine => mine.map(m => `<span class="se-crest" data-slot="${Number(m.slot)}"></span>`).join('');

function titleFor(s, ready){
  const yours = currentProfileId && s.mine.length;
  if(ready) return yours ? `Your ${s.year} season is set` : `The ${s.year} season is set`;
  // A class this device is already showing, rebuilt after a pick was edited.
  if(String(s.year) === String(LATEST_SEASON_ID)) return `Updating the ${s.year} rosters`;
  return yours ? `Building your ${s.year} season` : `Building the ${s.year} season`;
}

function stepFor(s, ready, pct){
  if(s.phase === 'failed') return 'Still setting up. Trying again shortly.';
  if(ready) return s.mine.length ? `${s.mine.length} teams, ready when you are.` : `${s.teams} teams across the group.`;
  if(!s.total) return 'Reading the board';
  if(s.mine.length){
    const placed = s.mine.filter(t => t.entry && pct >= ((t.slot + 1) / s.total) * 100).length;
    return `Setting up your teams: ${placed} of ${s.mine.length}`;
  }
  return `Placing teams: ${Math.round((pct / 100) * s.total)} of ${s.total}`;
}

// Moves the bar toward the build's real progress (capped by time with
// motion on), drops crests whose pick it has passed, and switches to the
// ready state once the build is done and the bar is full.
function tick(){
  if(!root) return;
  const s = liveClassState();
  const real = s.phase === 'ready' ? 100 : (s.total ? (s.done / s.total) * 100 : 3);
  const cap = slow() ? ((performance.now() - openedAt) / MIN_BUILD_MS) * 100 : 100;
  shown = Math.max(shown, Math.min(real, cap));
  const ready = s.phase === 'ready' && shown >= 100;

  const bar = root.querySelector('.se-bar');
  bar.firstElementChild.style.width = `${shown}%`;
  bar.setAttribute('aria-valuenow', String(Math.round(shown)));
  // The screen can open before the board (and so your picks) has loaded.
  const box = root.querySelector('.se-crests');
  if(box.childElementCount !== s.mine.length) box.innerHTML = wellsHtml(s.mine);
  root.querySelectorAll('.se-crest:not(.placed)').forEach(el => {
    const slot = Number(el.dataset.slot);
    const pick = s.mine.find(m => m.slot === slot);
    if(!s.total || !pick || !pick.entry || shown < ((slot + 1) / s.total) * 100) return;
    el.innerHTML = teamBadgeHtml(pick.entry);
    // A frame later, so the badge transitions in from its waiting state.
    requestAnimationFrame(() => el.classList.add('placed'));
  });
  const title = titleFor(s, ready);
  const titleEl = root.querySelector('.se-title');
  if(titleEl.textContent !== title) titleEl.textContent = title;
  const step = stepFor(s, ready, shown);
  const stepEl = root.querySelector('.se-step');
  if(stepEl.textContent !== step) stepEl.textContent = step;

  // Not now is there while it's still failing, too.
  root.classList.toggle('ready', ready || s.phase === 'failed');
  root.querySelector('.se-enter').hidden = !ready;
  if(ready && !root.classList.contains('done')){
    root.classList.add('done');
    clearInterval(timer);
    if(slow()) play(root.querySelector('.se-title'), [{ opacity: 0.4, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
    root.querySelector('.se-enter').focus({ preventScroll: true });
  }
}

export function closeSeasonEntry(){
  if(!root) return;
  dismissed = liveClassState().year;
  clearInterval(timer);
  root.remove();
  root = null;
  unlockBodyScroll();
}

// Onto Home, your own board, with the launch splash playing again.
export function enterSeason(){
  if(!root) return;
  const url = new URL(location.href);
  const group = url.searchParams.get('group');
  url.search = '';
  if(group) url.searchParams.set('group', group);
  url.searchParams.set('view', 'board');
  if(currentProfileId) url.searchParams.set('team', currentProfileId);
  url.hash = '';
  const go = () => {
    try { sessionStorage.removeItem('bx-splash'); } catch (e){}
    location.replace(url.toString());
  };
  if(!slow()){ go(); return; }
  root.querySelectorAll('.se-crest.placed .badge').forEach((el, i) => play(el, [{ transform: 'none' }, { transform: 'scale(1.12)', offset: 0.35 }, { transform: 'scale(0.9)', opacity: 0 }], { duration: 420, delay: i * 25, fill: 'forwards' }));
  root.classList.add('leaving');
  setTimeout(go, 460);
}
