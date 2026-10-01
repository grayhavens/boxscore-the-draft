/* UI helpers: one function per Boxscore design-system component, each
   returning an HTML string with exactly the class structure the matching
   component renders (docs/design-system/components.css). Escape text from
   users or the API with escapeHtml.

   Step 2 of docs/design-system-plan.md fills this in (buttons, chips,
   segmented controls, team badges and rows, sheets, …). For now it holds
   the new pieces the motion plan needs, which the design system doesn't
   have yet. */

import { escapeHtml } from './utils.js';

// A small solid-gold pill that floats over a panel for a moment, e.g. the
// draft board's "Round 2 · order flips" (docs/motion-plan.md). Not in the
// design system yet.
export function floatPillHtml({ label }){
  return `<div class="float-pill" role="status">${escapeHtml(label)}</div>`;
}
