/* ============================================================
   Bottom sheets (.modal-overlay) and the scroll lock behind them. No
   group or league data, so the landing page (js/landing.js) can open
   one too; js/utils.js re-exports all of it for the app.
   ============================================================ */

// One place for the reduced-motion check every animation defers to; with
// it on, the app behaves exactly as it did before any of the motion work.
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- Modal scroll lock ----
// Pins the page in place behind the modal (rather than just hiding
// overflow) so iOS Safari can't rubber-band-scroll the background
// while a modal is open. Restores the exact scroll position on close.
// The page itself stays put under the sheet's dimmed overlay — no
// recede/scale, which read as the background jumping.
let lockedScrollY = 0;

export function lockBodyScroll(){
  lockedScrollY = window.scrollY;
  document.body.style.position = 'fixed';
  document.body.style.top = `-${lockedScrollY}px`;
  document.body.style.width = '100%';
}

export function unlockBodyScroll(){
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, lockedScrollY);
}

// ---- Sheet open/close ----
// Every .modal-overlay opens and closes through these. On phones (with
// motion allowed) the sheet slides up on the iOS sheet curve and its rows
// stagger in while .entering is on; closing slides it down (.closing)
// before dropping .open. Elsewhere both are the old instant toggle.
// Scroll locking stays with the callers.
const SHEET_ENTER_MS = 900; // the slide plus the last row's stagger
export const SHEET_EASE = 'cubic-bezier(0.32,0.72,0,1)'; // matches --ease-sheet

const sheetMotion = () => !reducedMotion() && window.matchMedia(SHEET_BREAKPOINT).matches;

// Open and not on its way out: a closing sheet still carries .open for
// the length of its slide, but counts as closed to everything else.
export function isSheetOpen(overlay){
  return !!overlay && overlay.classList.contains('open') && !overlay.classList.contains('closing');
}

// Clears whatever a drag or a swipe-dismiss left inline.
function clearSheetInline(overlay, sheet){
  overlay.style.backgroundColor = '';
  if(sheet){
    sheet.style.transition = '';
    sheet.style.transform = '';
    sheet.style.animationDuration = '';
    sheet.style.animationTimingFunction = '';
  }
}

export function openSheetOverlay(overlay){
  if(!overlay || isSheetOpen(overlay)) return;
  overlay._sheetClose = null;
  const sheet = overlay.querySelector('.modal');
  clearSheetInline(overlay, sheet);
  if(sheet) watchSheetHeight(sheet);
  overlay.classList.remove('closing');
  overlay.classList.add('open', 'entering');
  clearTimeout(overlay._sheetEnter);
  overlay._sheetEnter = setTimeout(() => overlay.classList.remove('entering'), SHEET_ENTER_MS);
}

export function closeSheetOverlay(overlay){
  if(!isSheetOpen(overlay)) return;
  const sheet = overlay.querySelector('.modal');
  const token = overlay._sheetClose = {};
  const done = () => {
    if(overlay._sheetClose !== token) return;
    overlay._sheetClose = null;
    overlay.classList.remove('open', 'closing', 'entering');
    clearSheetInline(overlay, sheet);
  };
  clearTimeout(overlay._sheetEnter);
  if(sheet){
    sheet._h = null;
    if(sheet._hAnim){ sheet._hAnim.cancel(); sheet._hAnim = null; }
  }
  if(!sheet || !sheetMotion()){ done(); return; }
  overlay.classList.remove('entering');
  overlay.classList.add('closing');
  const onEnd = e => {
    if(e.target !== sheet) return;
    sheet.removeEventListener('animationend', onEnd);
    done();
  };
  sheet.addEventListener('animationend', onEnd);
  setTimeout(done, 450); // safety net if animationend never fires
}

// ---- Sheet height follows its content ----
// Most sheets fill in after they open (a skeleton swapped for the real
// thing once a fetch lands), and left alone the sheet would jump straight
// to its new height — mid-slide, even. Instead any content change while
// it's open glides the height from where it was to where it's going.
// The MutationObserver runs before the browser paints the change, so the
// first frame is still the old height; the ResizeObserver keeps the
// "old height" current between changes. A change in the same task that
// opened the sheet (_h still null) is part of opening it, not animated.
const SHEET_HEIGHT_MS = 420;

function watchSheetHeight(sheet){
  sheet._h = null;
  if(sheet._hWatch || typeof ResizeObserver === 'undefined') return;
  sheet._hWatch = true;
  new ResizeObserver(() => {
    if(!sheet._hAnim && isSheetOpen(sheet.closest('.modal-overlay'))) sheet._h = sheet.offsetHeight;
  }).observe(sheet);
  new MutationObserver(() => {
    const overlay = sheet.closest('.modal-overlay');
    if(sheet._h === null || !isSheetOpen(overlay) || sheet._dragging || !sheetMotion()) return;
    const from = sheet._hAnim ? sheet.offsetHeight : sheet._h;
    if(sheet._hAnim){ sheet._hAnim.cancel(); sheet._hAnim = null; }
    const to = sheet.offsetHeight;
    sheet._h = to;
    if(Math.abs(to - from) < 2) return;
    const anim = sheet._hAnim = sheet.animate(
      [{ height: from + 'px' }, { height: to + 'px' }],
      { duration: SHEET_HEIGHT_MS, easing: SHEET_EASE }
    );
    anim.onfinish = () => { if(sheet._hAnim === anim){ sheet._hAnim = null; sheet._h = sheet.offsetHeight; } };
  }).observe(sheet, { childList: true, subtree: true, characterData: true });
}

// ---- Bottom-sheet swipe-to-dismiss ----
// The mobile sheet's drag handle (.modal::before in css/style.css) is
// otherwise just a visual affordance with nothing behind it — this is
// what actually makes dragging it down close the sheet. Only active at
// the same breakpoint the CSS turns .modal into a bottom sheet; on
// desktop it's a centered dialog with no "down" to drag toward.
//
// The drag starts when the sheet's content is scrolled to the top — at
// touchstart, or later in the same touch once a scroll up reaches the
// top — and only for a mostly-vertical pull, so horizontal scrollers
// inside the sheet (linescores, chips) never move it. While dragging,
// the backdrop lightens with the finger. A dismiss hands the sheet straight to the close animation
// from wherever the finger left it, timed off the flick's speed.
const SHEET_BREAKPOINT = '(max-width: 700px)';
const SHEET_DISMISS_DISTANCE = 0.3;  // fraction of the sheet's height dragged down
const SHEET_DISMISS_VELOCITY = 0.5;  // or a flick faster than this (px/ms), regardless of distance
const SHEET_DIRECTION_SLOP = 6;      // px of movement before a touch commits to a direction
const OVERLAY_DIM = 0.6;             // .modal-overlay's backdrop alpha

export function enableSheetSwipeToDismiss(sheetEl, closeFn){
  if(!sheetEl || sheetEl.dataset.swipeBound) return;
  sheetEl.dataset.swipeBound = '1';

  let tracking = false, dragging = false, decided = false;
  let startX = 0, startY = 0, lastY = 0, dragY = 0, sheetHeight = 0;
  let overlay = null, samples = [];

  const setDrag = (delta) => {
    const p = Math.min(1, delta / sheetHeight);
    sheetEl.style.transform = delta > 0 ? `translateY(${delta}px)` : '';
    if(overlay) overlay.style.backgroundColor = `rgba(var(--overlay-rgb), ${(OVERLAY_DIM * (1 - p)).toFixed(3)})`;
  };

  const endDrag = () => {
    dragging = false;
    sheetEl._dragging = false;
    sheetEl.style.transition = '';
  };

  const snapBack = () => {
    endDrag();
    sheetEl.style.transform = '';
    if(overlay) overlay.style.backgroundColor = '';
  };

  const beginDrag = (y) => {
    dragging = true;
    sheetEl._dragging = true;
    dragY = y;
    samples = [[performance.now(), y]];
    sheetHeight = sheetEl.getBoundingClientRect().height || 1;
    overlay = sheetEl.closest('.modal-overlay');
    sheetEl.style.transition = 'none';
  };

  sheetEl.addEventListener('touchstart', (e) => {
    tracking = false;
    if(e.touches.length !== 1 || !window.matchMedia(SHEET_BREAKPOINT).matches) return;
    tracking = true;
    decided = false;
    startX = e.touches[0].clientX;
    startY = lastY = e.touches[0].clientY;
  }, { passive: true });

  sheetEl.addEventListener('touchmove', (e) => {
    if(!tracking) return;
    if(e.touches.length !== 1){ tracking = false; if(dragging) snapBack(); return; }
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    const prevY = lastY;
    lastY = y;

    if(!decided){
      const dx = Math.abs(x - startX), dy = Math.abs(y - startY);
      if(dx < SHEET_DIRECTION_SLOP && dy < SHEET_DIRECTION_SLOP) return;
      decided = true;
      if(dx > dy){ tracking = false; return; } // a horizontal swipe — leave it alone
    }

    if(!dragging){
      // Pull down with the content at its top: the sheet takes over. Only
      // while the touch is still cancelable — once iOS has committed to a
      // native scroll it ignores preventDefault, and moving the sheet too
      // would double up with the content's own rubber-band.
      if(y <= prevY || sheetEl.scrollTop > 0 || !e.cancelable) return;
      beginDrag(prevY);
    }

    const delta = y - dragY;
    if(delta <= 0){
      // Back up past the resting position: stop dragging and let the
      // content scroll from here instead of fighting it.
      snapBack();
      return;
    }
    e.preventDefault();
    samples.push([performance.now(), y]);
    if(samples.length > 6) samples.shift();
    setDrag(delta);
  }, { passive: false });

  const onTouchEnd = (e) => {
    tracking = false;
    if(!dragging) return;
    const endY = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0].clientY : lastY;
    const delta = endY - dragY;
    // Release velocity off the last ~100ms of movement, not the whole
    // drag, so a slow pull ending in a flick still counts as a flick.
    const now = performance.now();
    const recent = samples.filter(s => now - s[0] < 100);
    const first = recent[0] || samples[0];
    const velocity = first ? (endY - first[1]) / Math.max(16, now - first[0]) : 0;

    if(delta > 0 && (delta > sheetHeight * SHEET_DISMISS_DISTANCE || velocity > SHEET_DISMISS_VELOCITY)){
      endDrag();
      // Carry the finger's speed into the close: the rest of the way off
      // screen at (at least) the release velocity, clamped to feel sane.
      const remaining = Math.max(0, sheetHeight - delta);
      const ms = Math.round(Math.min(320, Math.max(160, remaining / Math.max(velocity, 1.2))));
      sheetEl.style.animationDuration = ms + 'ms';
      sheetEl.style.animationTimingFunction = 'cubic-bezier(0.2,0.6,0.35,1)';
      closeFn();
    } else {
      snapBack();
    }
  };
  sheetEl.addEventListener('touchend', onTouchEnd);
  sheetEl.addEventListener('touchcancel', () => { tracking = false; if(dragging) snapBack(); });
}
