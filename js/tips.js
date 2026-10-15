/* ============================================================
   One-time tips for the gestures nothing on screen points to
   (docs/ux-improvements-plan.md, item 11): hold a chat message to react,
   swipe between your teams on a team page, pull down to refresh.

   Each tip shows once per device, the first time someone reaches the
   place it's about (a `bx-tip:<id>` flag in localStorage, like
   bx-ptp-open). It goes away when it's tapped, when the gesture is done
   (tipDone), or after TIP_MS. Only on a touch phone layout: on a wide
   screen or with a mouse these gestures either don't exist or have their
   own affordances. A tip that can't be seen right now (a sheet is open,
   another tip is up) waits for the next visit rather than being spent.

   The pill is tipHtml (js/ui.js), floated at the top of the screen over
   the tab bar and under sheets (--z-tip). It rises in with --dur-ui /
   --ease-out when canAnimateLive(); otherwise it's just there.
   ============================================================ */
import { tipHtml } from './ui.js';
import { canAnimateLive } from './motion.js';
import { isWide } from './wide-query.js';

const TIP_MS = 8000;
const seenKey = id => `bx-tip:${id}`;

let shown = null; // { id, el, timer }

function seen(id){
  try { return localStorage.getItem(seenKey(id)) === '1'; } catch (e){ return true; }
}

function markSeen(id){
  try { localStorage.setItem(seenKey(id), '1'); } catch (e){}
}

const touchPhone = () => !isWide() && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
// lockBodyScroll (js/utils.js) pins the body while a sheet is open.
const sheetOpen = () => document.body.style.position === 'fixed';

export function showTip(id, text){
  if(shown || seen(id) || !touchPhone() || sheetOpen()) return;
  markSeen(id);
  const wrap = document.createElement('div');
  wrap.innerHTML = tipHtml({ text, onclose: 'hideTip()' });
  const el = wrap.firstElementChild;
  if(canAnimateLive()) el.classList.add('tip-in');
  document.body.appendChild(el);
  shown = { id, el, timer: setTimeout(hideTip, TIP_MS) };
}

export function hideTip(){
  if(!shown) return;
  clearTimeout(shown.timer);
  shown.el.remove();
  shown = null;
}
window.hideTip = hideTip;

// The gesture was done: it no longer needs teaching, shown or not.
export function tipDone(id){
  markSeen(id);
  if(shown && shown.id === id) hideTip();
}
