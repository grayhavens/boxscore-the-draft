/* Pull to refresh (docs/motion-plan.md, Phase 5). An installed iOS PWA has
   no native pull-to-refresh, so this is one: at the top of a view, pull the
   page down and the Boxscore mark builds in the gap above it (the launch
   splash's own mark, its build scrubbed by the pull). Let go past the
   threshold and the page rests there while the mark turns and the data
   refreshes (opts.refresh); then it springs back and any row whose text
   changed flashes gold. Let go short of it and it just springs back.

   It has to share the screen with ordinary scrolling, so it stays out of
   the way: the non-passive touchmove listener (the only way to stop iOS's
   own rubber band) is added only once a touch starts at the very top of a
   view that allows it, and a pull only engages after a mostly vertical,
   downward drag of a few pixels. With reduced motion the page still
   follows the finger and the refresh still happens; the mark just shows
   whole, without the build, the turn or the spring. */

import { fxOn, flashTint } from './motion-fx.js';
import { EASE_OUT, EASE_SPRING, EASE_IN_OUT } from './utils.js';

const THRESHOLD = 64;      // pull that refreshes on release, and where the page rests meanwhile
const MAX = 96;            // the page never moves further than this
const RESIST = 120;        // finger travel for ~63% of MAX: the rubber band
const ENGAGE = 8;          // downward travel before a touch counts as a pull
const BUILD_MS = 700;      // the mark's build timeline, scrubbed by the pull
const MIN_SPIN_MS = 800;   // a refresh shows at least this long, so it reads
const MAX_WAIT_MS = 8000;  // and never holds the page longer than this

// Rows that flash when a refresh changed them, and how each is recognized
// across the re-render.
const ROW_SEL = '.team, .tg-row, .standings-row, .ob-table-row, .ob-ladder-row, .form-item';
const rowKey = (el, i) => el.dataset.game || el.dataset.id
  || (el.querySelector('.status-slot') && el.querySelector('.status-slot').id)
  || el.getAttribute('onclick') || `#${i}`;
const rowText = el => el.textContent.replace(/\s+/g, ' ').trim();

let opts = null;
let ptr = null;            // the fixed indicator holding the mark
let state = 'idle';        // 'idle' | 'pulling' | 'refreshing'
let view = null, startX = 0, startY = 0, dist = 0, build = [];

export function initPullToRefresh(options){
  opts = options;
  document.addEventListener('touchstart', onStart, { passive: true });
}

function indicator(){
  if(ptr) return ptr;
  ptr = document.createElement('div');
  ptr.className = 'ptr';
  ptr.setAttribute('aria-hidden', 'true');
  ptr.innerHTML = '<div class="ptr-mark"><div class="ls-logo"><div class="ls-tl"><i></i></div><div class="ls-br"><i></i></div><div class="ls-sq"></div></div></div>';
  document.body.appendChild(ptr);
  return ptr;
}

function onStart(event){
  if(state !== 'idle' || event.touches.length !== 1 || window.scrollY > 0 || !opts.canPull()) return;
  startX = event.touches[0].clientX;
  startY = event.touches[0].clientY;
  dist = 0;
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  document.addEventListener('touchcancel', onEnd);
}

function stopTracking(){
  document.removeEventListener('touchmove', onMove);
  document.removeEventListener('touchend', onEnd);
  document.removeEventListener('touchcancel', onEnd);
}

function onMove(event){
  const t = event.touches[0];
  const dy = t.clientY - startY, dx = t.clientX - startX;
  if(state === 'idle'){
    // Upward, sideways, or the page scrolled after all: an ordinary scroll.
    if(dy < -4 || Math.abs(dx) > 12 || window.scrollY > 0){ stopTracking(); return; }
    if(dy < ENGAGE || Math.abs(dx) > dy) return;
    beginPull();
  }
  event.preventDefault();
  dist = dy > 0 ? MAX * (1 - Math.exp(-dy / RESIST)) : 0;
  paint();
}

function onEnd(){
  stopTracking();
  if(state !== 'pulling') return;
  if(dist >= THRESHOLD - 0.5) runRefresh();
  else release();
}

function beginPull(){
  state = 'pulling';
  view = opts.view();
  const el = indicator();
  // The build, paused, so the pull can scrub it: the brackets slide in
  // from their corners, then the orange square pops.
  build.forEach(a => a.cancel());
  build = [];
  if(fxOn()){
    const logo = el.querySelector('.ls-logo');
    const tl = logo.querySelector('.ls-tl'), br = logo.querySelector('.ls-br'), sq = logo.querySelector('.ls-sq');
    const part = (node, from, start, end, easing = EASE_OUT) => node.animate(
      [{ transform: from, offset: 0 }, { transform: from, offset: start }, { transform: 'none', offset: end }, { transform: 'none', offset: 1 }],
      { duration: BUILD_MS, fill: 'both', easing });
    build = [
      part(tl, 'translate(-100%, -100%)', 0, 0.6),
      part(tl.firstElementChild, 'translate(100%, 100%)', 0, 0.6),
      part(br, 'translate(100%, 100%)', 0.12, 0.72),
      part(br.firstElementChild, 'translate(-100%, -100%)', 0.12, 0.72),
      part(sq, 'scale(0)', 0.55, 1, EASE_SPRING)
    ];
    build.forEach(a => a.pause());
  }
}

function paint(){
  if(view) view.style.transform = dist ? `translateY(${dist}px)` : '';
  if(!ptr) return;
  ptr.style.opacity = String(Math.min(1, dist / 28));
  const p = Math.min(1, dist / THRESHOLD);
  build.forEach(a => { a.currentTime = p * BUILD_MS; });
}

// Spring the page back to the top and hide the mark.
function settle(from){
  const target = view;
  const done = () => {
    if(target) target.style.transform = '';
    if(ptr) ptr.style.opacity = '0';
    build.forEach(a => a.cancel());
    build = [];
    dist = 0;
    state = 'idle';
  };
  if(!fxOn() || !target){ done(); return; }
  target.style.transform = '';
  const back = target.animate([{ transform: `translateY(${from}px)` }, { transform: 'none' }], { duration: 420, easing: EASE_OUT });
  if(ptr){
    const shown = Number(ptr.style.opacity) || 0;
    ptr.style.opacity = '0';
    if(shown) ptr.animate([{ opacity: shown }, { opacity: 0 }], { duration: 200 });
  }
  back.finished.then(done, done);
}

function release(){
  settle(dist);
}

async function runRefresh(){
  state = 'refreshing';
  // Rest at the threshold, finish building the mark, and turn it until the
  // refresh lands.
  const from = dist;
  dist = THRESHOLD;
  if(view && fxOn()) view.animate([{ transform: `translateY(${from}px)` }, { transform: `translateY(${THRESHOLD}px)` }], { duration: 200, easing: EASE_OUT });
  paint();
  build.forEach(a => { a.currentTime = BUILD_MS; });
  const spin = fxOn() && ptr ? ptr.querySelector('.ls-logo').animate(
    [{ transform: 'rotate(0deg)' }, { transform: 'rotate(180deg)' }],
    { duration: 520, easing: EASE_IN_OUT, iterations: Infinity }) : null;

  const before = snapshot();
  const started = Date.now();
  try {
    await Promise.race([Promise.resolve(opts.refresh()), new Promise(r => setTimeout(r, MAX_WAIT_MS))]);
  } catch (e){
    console.error('[Refresh]', e);
  }
  const left = MIN_SPIN_MS - (Date.now() - started);
  if(left > 0) await new Promise(r => setTimeout(r, left));
  if(spin) spin.cancel();
  settle(THRESHOLD);
  flashChanged(before);
}

// The visible rows' text, by key, so the rows a refresh changed can flash.
function snapshot(){
  const map = new Map();
  if(view) view.querySelectorAll(ROW_SEL).forEach((el, i) => map.set(rowKey(el, i), rowText(el)));
  return map;
}

function flashChanged(before){
  const current = opts.view();
  if(!current || !fxOn()) return;
  current.querySelectorAll(ROW_SEL).forEach((el, i) => {
    const was = before.get(rowKey(el, i));
    if(was !== undefined && was !== rowText(el)) flashTint(el, { tint: 'var(--accent-soft)', from: 1, duration: 1400, delay: 200 });
  });
}
