/* Android back button and gesture. The app never touched browser history
   (views, sheets and the team page all swap in place), so on Android the
   system Back left the installed app from anywhere, even from an open
   sheet. This gives Back the same job as the on-screen back button: it
   closes the top sheet, else taps the page's own Back (.ob-back, from
   backLinkHtml), else leaves the app as before.

   How: one history entry is held per "backable" thing on screen (each
   open sheet, plus the pushed page when there is one). A MutationObserver
   on class changes keeps that count in step: opening something pushes an
   entry; closing it by its own button walks the entry back (history.go,
   whose popstate is ignored). A real Back pops an entry and runs the
   action. A sheet that refuses to close (the welcome's name step) just
   gets its entry pushed again by the next sync.

   Android only, for now: iPhone has no Back button and its edge swipe has
   never been tested against this. A leaf module (no imports). */

const OPEN_SHEET = '.modal-overlay.open:not(.closing)';
const PAGE_BACK = '.board > .view.active .ob-back';

let pushed = 0;     // history entries this module added and hasn't popped
let ignore = 0;     // popstates caused by our own history.go()
let queued = false;

const isAndroid = () => /Android/.test(navigator.userAgent || '');

const topSheet = () => {
  const open = document.querySelectorAll(OPEN_SHEET);
  return open.length ? open[open.length - 1] : null;
};

const pageBack = () => {
  const btn = document.querySelector(PAGE_BACK);
  return btn && btn.offsetParent !== null ? btn : null;
};

const wanted = () => document.querySelectorAll(OPEN_SHEET).length + (pageBack() ? 1 : 0);

function sync(){
  queued = false;
  const want = wanted();
  if(want > pushed){
    for(; pushed < want; pushed++) history.pushState(null, '', location.href);
  } else if(want < pushed){
    ignore++;
    history.go(want - pushed);
    pushed = want;
  }
}

function schedule(){
  if(queued) return;
  queued = true;
  requestAnimationFrame(sync);
}

function onPop(){
  if(ignore > 0){ ignore--; return; }
  if(pushed === 0) return;
  pushed--;
  const sheet = topSheet();
  if(sheet){
    // Every overlay closes through its own backdrop handler (it also
    // unlocks scroll), which only reacts to a click on the overlay itself.
    sheet.click();
  } else {
    const back = pageBack();
    if(back) back.click();
  }
  schedule();
}

export function initBackButton(){
  if(!isAndroid() || !window.history || !history.pushState) return;
  window.addEventListener('popstate', onPop);
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  schedule();
}
