/* UI helpers: one function per Boxscore design-system component, each
   returning an HTML string with exactly the class structure the matching
   component renders (docs/design-system/components.css, options from
   components/*.types.ts.txt). Text arguments are escaped here; arguments
   named `html` or `onclick` are trusted markup the caller builds and
   escapes itself.

   Helpers land here as screens move over (docs/design-system-plan.md, Step
   3). A component the app doesn't render yet gets its helper together with
   its first screen, so nothing here is untested markup. Still to come:
   filter chips, scope chip, tag, icon button, live dot, team badge and row,
   league card, game card, points table, split bar, activity row, banner,
   sheet, settings row and page header. The segmented control (and the count
   badge inside it) already live in js/utils.js (segmentedControlHtml), which
   matches the recipe; they move here with the first screen that needs them.

   Keep this a leaf module (only escape.js and icons.js): js/access.js uses
   it at boot, before js/data.js may be imported. */

import { escapeHtml } from './escape.js';
import { ICONS } from './icons.js';

// The app's stroke icons (Icon). Sized by CSS unless `size` is given.
export function iconHtml(name, { size = null, strokeWidth = null } = {}){
  const icon = ICONS[name];
  if(!icon) return '';
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return `<svg viewBox="0 0 24 24"${dims} fill="none" stroke="currentColor" stroke-width="${strokeWidth || icon.sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.b}</svg>`;
}

// Button: the gold full-width CTA (primary) or the hairline outline
// (secondary). `icon` is an icon name; `iconSvg` takes any other SVG.
// `cls` adds a screen's own layout class (margins, a grid slot).
export function buttonHtml({ label = '', html = null, variant = 'primary', icon = null, iconSvg = null, onclick = null, type = 'button', cls = '', disabled = false } = {}){
  const classes = ['modal-cta', variant === 'secondary' ? 'secondary' : '', cls].filter(Boolean).join(' ');
  const glyph = iconSvg || (icon ? iconHtml(icon) : '');
  return `<button type="${type}" class="${classes}"${onclick ? ` onclick="${onclick}"` : ''}${disabled ? ' disabled' : ''}>${glyph}${html !== null ? html : escapeHtml(label)}</button>`;
}

// BackLink: chevron plus the name of the screen you go back to ("‹ Points").
export function backLinkHtml({ label, onclick }){
  return `<button type="button" class="ob-back" onclick="${onclick}">${iconHtml('chevron-left')}${escapeHtml(label)}</button>`;
}

// Switch: 44×26, gold when on. Pass `onclick` for a real control, or leave
// it out for the decorative one inside a row that is itself the button.
export function switchHtml({ on = false, label = '', onclick = null } = {}){
  if(!onclick) return `<span class="switch${on ? ' on' : ''}" aria-hidden="true"></span>`;
  return `<button type="button" class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${escapeHtml(label)}" onclick="${onclick}"></button>`;
}

// A small solid-gold pill that floats over a panel for a moment, e.g. the
// draft board's "Round 2 · order flips" (docs/motion-plan.md). Not in the
// design system yet.
export function floatPillHtml({ label }){
  return `<div class="float-pill" role="status">${escapeHtml(label)}</div>`;
}
