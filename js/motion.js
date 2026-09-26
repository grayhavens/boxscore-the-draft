/* Navigation motion: the directional tab slide (switchView in
   js/board.js) and the team page push/pop (js/team-page.js), both on same-document View Transitions. The
   keyframes live in css/style.css ("View transitions"); `html[data-nav]`
   picks which ones play. Without View Transitions, or with reduced
   motion on, `navigate` just runs the DOM update — today's behavior.

   Nothing animates until board.js calls enableNavMotion() after boot,
   so restoring a ?view= deep link lands instantly (and never fights the
   launch splash). */

import { reducedMotion } from './utils.js';

let enabled = false;
let current = null;

export function enableNavMotion(){ enabled = true; }

export function canAnimateNav(){
  return enabled && !!document.startViewTransition && !reducedMotion();
}

// kind: 'fwd' | 'back' (tab slide), 'push' | 'pop' (team page), or null
// for a plain crossfade.
export function navigate(kind, update){
  if(!canAnimateNav()){ update(); return; }
  const root = document.documentElement;
  if(kind) root.dataset.nav = kind; else delete root.dataset.nav;
  const vt = document.startViewTransition(update);
  current = vt;
  // A quick second tap skips this transition (AbortError), and a resize
  // or hidden page can abort it (InvalidStateError). Either way the DOM
  // update still runs; only the animation is dropped, so don't let
  // `ready` surface as an unhandled rejection.
  vt.ready.catch(() => {});
  const cleanup = () => {
    // A newer transition skips this one; leave its data-nav alone.
    if(current === vt){ delete root.dataset.nav; current = null; }
  };
  vt.finished.then(cleanup, cleanup);
}
