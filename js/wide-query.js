/* The wide layout's two breakpoints (docs/desktop-redesign-brief.md), in
   one place for the JS that has to branch on them. css/style.css repeats
   the same widths in its "Wide layout" media queries.
   - Wide (900px and up, iPad landscape and desktop): the team rail and the
     top header replace the bottom tab bar, and the team page lays out in
     columns. Under 900px (phones, iPad Split View, iPad mini portrait)
     it's the phone app.
   - Dock (1280px and up): chat is a column on the right instead of a
     slide-over panel.
   A leaf module (no imports) so js/team-page.js and js/wide.js can both
   read it without importing each other. */

export const WIDE_MQ = window.matchMedia('(min-width: 900px)');
export const DOCK_MQ = window.matchMedia('(min-width: 1280px)');

export const isWide = () => WIDE_MQ.matches;
export const isDock = () => DOCK_MQ.matches;

// Runs `fn` whenever either breakpoint is crossed (an iPad rotating, a
// window resized).
export function onWideChange(fn){
  WIDE_MQ.addEventListener('change', fn);
  DOCK_MQ.addEventListener('change', fn);
}
