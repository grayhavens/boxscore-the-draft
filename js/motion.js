/* Navigation motion: the directional tab slide (switchView in
   js/board.js) and the team page push/pop with its shared badge
   (js/team-page.js), both on same-document View Transitions. The
   keyframes live in css/style.css ("View transitions"); `html[data-nav]`
   picks which ones play. Without View Transitions, or with reduced
   motion on, `navigate` just runs the DOM update — today's behavior.

   Nothing animates until board.js calls enableNavMotion() after boot,
   so restoring a ?view= deep link lands instantly (and never fights the
   launch splash). */

let enabled = false;
let current = null;

export function enableNavMotion(){ enabled = true; }

export function canAnimateNav(){
  return enabled && !!document.startViewTransition
    && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// kind: 'fwd' | 'back' (tab slide), 'push' | 'pop' (team page), or null
// for a plain crossfade. `shared` is { from, to } for the badge morph:
// `from` is the element in the current page, `to()` finds its twin once
// `update` has run. A view-transition-name must be unique on the page at
// any moment, so each end carries it only for its own snapshot.
export function navigate(kind, update, shared){
  if(!canAnimateNav()){ update(); return; }
  const root = document.documentElement;
  const from = shared && shared.from;
  let to = null;
  if(kind) root.dataset.nav = kind; else delete root.dataset.nav;
  if(from) from.style.viewTransitionName = 'team-badge';
  const vt = document.startViewTransition(() => {
    if(from) from.style.viewTransitionName = '';
    update();
    to = shared && shared.to ? shared.to() : null;
    if(to) to.style.viewTransitionName = 'team-badge';
  });
  current = vt;
  const cleanup = () => {
    if(from) from.style.viewTransitionName = '';
    if(to) to.style.viewTransitionName = '';
    // A newer transition skips this one; leave its data-nav alone.
    if(current === vt){ delete root.dataset.nav; current = null; }
  };
  vt.finished.then(cleanup, cleanup);
}

// First element matching `selector` that's actually laid out — Standings
// keeps the League and Person lists in the DOM together, and a hidden
// (display:none) element can't take part in a transition.
export function firstVisible(selector){
  for(const el of document.querySelectorAll(selector)){
    if(el.getClientRects().length) return el;
  }
  return null;
}
