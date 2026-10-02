/* Gestures: one pointer drag with an axis lock, shared by the team page's
   swipe between teams and pull to stretch (and later the Since last night
   stack and chat's swipe to reply, docs/delight-plan.md).

   The decisions (which axis, whether a release commits) are pure functions
   so Node tests can check them (tests/gestures.test.mjs). This module
   imports nothing: callers pass the distances from js/utils.js (MOVE_SLOP,
   SWIPE_COMMIT, FLING_VELOCITY, RUBBER_BAND), which can't load in Node.

   Anything that swipes sideways sets `touch-action: pan-y` so the page
   still scrolls. A vertical drag the page would otherwise scroll (pull to
   stretch at the top) is claimed by cancelling touchmove once the axis is
   locked; the browser only starts scrolling past its own slop, which is
   wider than MOVE_SLOP. */

// The axis a drag has moved along once it's past `slop`, or null before.
export function lockAxis(dx, dy, slop){
  if(Math.hypot(dx, dy) < slop) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

// Where a release lands: 1 or -1 (the drag's direction) when it went past
// `commit` px or was thrown at `fling` px/ms or faster, 0 to snap back.
export function releaseDirection(d, v, { commit, fling = Infinity }){
  if(!d) return 0;
  if(Math.abs(d) >= commit) return Math.sign(d);
  if(Math.abs(v) >= fling && Math.sign(v) === Math.sign(d)) return Math.sign(d);
  return 0;
}

// Velocity (px/ms) over the last `windowMs` of [{ t, x, y }] samples.
export function velocity(samples, axis, windowMs = 100){
  if(samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = samples[0];
  for(let i = samples.length - 2; i >= 0; i--){
    first = samples[i];
    if(last.t - samples[i].t >= windowMs) break;
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last[axis] - first[axis]) / dt : 0;
}

// Pointer drag on `el` with an axis lock. Nothing is claimed until the
// pointer has moved `slop` px and `accept(axis, { dx, dy })` says yes;
// before that, taps and scrolls go through untouched. Once claimed:
// onStart(axis), onMove(axis, { dx, dy }), then onEnd(axis, { dx, dy, vx,
// vy, cancelled }). A drag swallows the click that follows it. `ignore` is
// a selector for children that never start one (buttons). Returns detach().
export function attachDrag(el, { slop, accept = () => true, ignore = null, onStart = () => {}, onMove = () => {}, onEnd = () => {} }){
  let g = null;           // { id, x, y, mode: 'wait' | 'x' | 'y' | 'off', samples }
  let swallowUntil = 0;

  const down = e => {
    if(g || !e.isPrimary || e.button > 0) return;
    if(ignore && e.target.closest(ignore)) return;
    g = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'wait', samples: [] };
  };
  const move = e => {
    if(!g || e.pointerId !== g.id || g.mode === 'off') return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if(g.mode === 'wait'){
      const axis = lockAxis(dx, dy, slop);
      if(!axis) return;
      if(!accept(axis, { dx, dy })){ g.mode = 'off'; return; }
      g.mode = axis;
      try{ el.setPointerCapture(g.id); }catch(err){}
      onStart(axis);
    }
    g.samples.push({ t: e.timeStamp, x: dx, y: dy });
    if(g.samples.length > 12) g.samples.shift();
    onMove(g.mode, { dx, dy });
  };
  const up = e => {
    if(!g || e.pointerId !== g.id) return;
    const done = g;
    g = null;
    if(done.mode !== 'x' && done.mode !== 'y') return;
    try{ el.releasePointerCapture(done.id); }catch(err){}
    swallowUntil = performance.now() + 400;
    const s = done.samples[done.samples.length - 1] || { x: 0, y: 0 };
    onEnd(done.mode, {
      dx: s.x, dy: s.y,
      vx: velocity(done.samples, 'x'), vy: velocity(done.samples, 'y'),
      cancelled: e.type === 'pointercancel'
    });
  };
  // Once a drag owns the touch, the page mustn't scroll under it.
  const touchMove = e => { if(g && (g.mode === 'x' || g.mode === 'y')) e.preventDefault(); };
  const click = e => {
    if(performance.now() < swallowUntil){ e.stopPropagation(); e.preventDefault(); swallowUntil = 0; }
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('touchmove', touchMove, { passive: false });
  el.addEventListener('click', click, true);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('touchmove', touchMove);
    el.removeEventListener('click', click, true);
  };
}
