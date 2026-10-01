/* UI helpers: one function per Boxscore design-system component, each
   returning an HTML string with exactly the class structure the matching
   component renders (docs/design-system/components.css, options from
   components/*.types.ts.txt). Text arguments are escaped here; arguments
   named `html` or `onclick` are trusted markup the caller builds and
   escapes itself.

   Helpers land here as screens move over (docs/design-system-plan.md, Step
   3). A component the app doesn't render yet gets its helper together with
   its first screen, so nothing here is untested markup. Still to come:
   filter chips, scope chip, tag, the ghost icon button, live dot, team badge and row,
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
// `cls` adds a screen's own layout class.
export function backLinkHtml({ label, onclick, cls = '' }){
  return `<button type="button" class="ob-back${cls ? ` ${cls}` : ''}" onclick="${onclick}">${iconHtml('chevron-left')}${escapeHtml(label)}</button>`;
}

// IconButton: a round icon-only control (filled: 30px, fill-soft). `label`
// is its accessible name; `cls` adds a screen's own layout class.
export function iconButtonHtml({ icon, label, onclick, cls = '' }){
  return `<button type="button" class="icon-btn${cls ? ` ${cls}` : ''}" onclick="${onclick}" aria-label="${escapeHtml(label)}">${iconHtml(icon)}</button>`;
}

// Switch: 44×26, gold when on. Pass `onclick` for a real control, or leave
// it out for the decorative one inside a row that is itself the button.
export function switchHtml({ on = false, label = '', onclick = null } = {}){
  if(!onclick) return `<span class="switch${on ? ' on' : ''}" aria-hidden="true"></span>`;
  return `<button type="button" class="switch${on ? ' on' : ''}" role="switch" aria-checked="${!!on}" aria-label="${escapeHtml(label)}" onclick="${onclick}"></button>`;
}

// Tag: one shape for every status pill (10px/800 uppercase). Variants:
// live, locked, lock-in, risk, win, pre, post, complete, on-live, or none
// for the neutral one.
export function tagHtml({ label, variant = '' }){
  return `<span class="status-tag${variant ? ` ${variant}` : ''}">${escapeHtml(label)}</span>`;
}

// GameCard: one game on the Scores day-timeline. A time gutter (`time`
// over `sub`, both trusted HTML; `timeTone` 'live' or 'pre' colors them),
// the rail with its status node, and the card with an optional eyebrow
// `tag` ({ text, cls }) over the two sides. Each side:
//   { name, owner?, rank?, dim?, badgeHtml, badgeOnclick?, badgeLabel?,
//     favHtml?, scoreHtml, afterHtml? }
// An `owner` marks a drafted team: its badge is a button (badgeOnclick)
// and its owner shows after the name. scoreHtml is trusted (the Scores
// tab's odometer builds it); afterHtml follows the score (the W chip).
export function gameCardHtml({ id = null, state, time, sub = '', timeTone = null, tag = null, away, home, onclick = null, cls = '' }){
  const rail = `<div class="tg-rail"><div class="tg-rail-top${timeTone ? ` ${timeTone}` : ''}">${time}</div>${sub ? `<div class="tg-rail-bot${timeTone === 'pre' ? ' pre' : ''}">${sub}</div>` : ''}</div>`;
  const classes = ['tg-row', onclick ? 'clickable' : '', cls].filter(Boolean).join(' ');
  return `<div class="${classes}"${id ? ` data-game="${escapeHtml(id)}"` : ''}${onclick ? ` onclick="${onclick}"` : ''}>${rail}<span class="tg-line"></span><span class="tg-node ${state}"></span><div class="tg-card ${state}">${tag ? `<div class="tg-tag ${tag.cls}">${escapeHtml(tag.text)}</div>` : ''}${gameSideHtml(away)}${gameSideHtml(home)}</div></div>`;
}

function gameSideHtml(side){
  const rank = side.rank ? `<span class="tg-rank" aria-label="Ranked ${side.rank}">${side.rank}</span>` : '';
  const name = `<span class="tg-name${side.dim ? ' dim' : ''}">${escapeHtml(side.name)}</span>`;
  const after = side.afterHtml || '';
  if(!side.owner && !side.badgeOnclick){
    return `<div class="tg-side">${side.badgeHtml}<div class="tg-label">${rank}${name}</div>${side.scoreHtml}${after}</div>`;
  }
  const badge = `<button type="button" class="tg-badge-btn" onclick="${side.badgeOnclick}" aria-label="${escapeHtml(side.badgeLabel || side.name)}">${side.badgeHtml}</button>`;
  return `<div class="tg-side">${badge}<div class="tg-label">${rank}${name}<span class="tg-owner">${escapeHtml(side.owner || '')}</span></div>${side.favHtml || ''}${side.scoreHtml}${after}</div>`;
}

// The league section a run of GameCards sits in: label and a hairline rule
// (the app's own .tg-section-head structure, which the recipe flattens).
export function gameSectionHtml({ label, html }){
  return `<div class="tg-section"><div class="tg-section-head"><span class="tg-section-label">${escapeHtml(label)}</span><span class="tg-section-rule"></span></div>${html}</div>`;
}

// "+1" that floats up off a score that just changed (docs/motion-plan.md,
// Phase 2). Lives only for the effect. Not in the design system yet.
export function scoreBumpHtml({ n }){
  return `<span class="score-bump" aria-hidden="true">+${n}</span>`;
}

// A small solid-gold pill that floats over a panel for a moment, e.g. the
// draft board's "Round 2 · order flips" (docs/motion-plan.md). Not in the
// design system yet.
export function floatPillHtml({ label }){
  return `<div class="float-pill" role="status">${escapeHtml(label)}</div>`;
}
