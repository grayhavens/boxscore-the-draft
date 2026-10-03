/* ============================================================
   "My points" alerts: when the activity feed logs something that moves
   a drafter's points (worker/rundown-proxy.js handleActivity), each
   drafter it touched gets one alert on the devices that opted in
   (Settings -> Alerts, js/push.js).

   Events are detected in the browser and land here already cleaned
   (cleanActivityEvent). Only events new to the stored feed alert, and
   one landed PUT is one alert per drafter however many events it
   carried, so a busy night of results doesn't buzz anyone ten times.
   Rank moves only alert for 1st place: smaller shuffles ride along with
   nearly every rule change and would just be noise. And only once a day
   (Central time, like the Race chart): a drafter already alerted about a
   rank move that day by an earlier PUT isn't alerted about another.

   Pure (no KV, no fetch) so tests/points-alert.test.mjs can check it.
   ============================================================ */

export const POINTS_ALERT_URL = './?view=overall&seg=activity';
// A client clock far off, or a feed replayed late, shouldn't alert.
export const POINTS_ALERT_MAX_AGE_MS = 6 * 60 * 60 * 1000;

import { historyDay } from '../js/race-math.js';

const signed = n => (n > 0 ? '+' : '−') + Math.abs(n);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// What one event means for one drafter, or null when it doesn't touch them.
function partFor(e, drafterId){
  if(e.type === 'rank'){
    if(e.drafterId !== drafterId) return null;
    const m = (e.moves || []).find(x => x.id === drafterId);
    return m && (m.from === 1 || m.to === 1) ? { e, pts: 0, live: false } : null;
  }
  const d = (e.deltas || []).find(x => x.id === drafterId);
  if(!d || !d.pts) return null;
  return { e, pts: d.pts, live: e.type !== 'lock' };
}

function singleBody(part){
  const { e, pts } = part;
  if(e.type === 'rank') return 'See where everyone stands.';
  if(e.type === 'lock') return `${signed(pts)} locked in for you.`;
  return `${signed(pts)} live ${Math.abs(pts) === 1 ? 'point' : 'points'} for you.`;
}

// [{ drafterId, payload }] for a batch of new events. `earlier` is the
// feed as it stood before them, for the once-a-day rank rule.
export function pointsAlerts(events, drafterIds, now = Date.now(), earlier = []){
  const fresh = events.filter(e => e && typeof e.ts === 'number' && now - e.ts <= POINTS_ALERT_MAX_AGE_MS);
  const rankDays = drafterId => new Set(earlier.filter(e => e && e.type === 'rank' && typeof e.ts === 'number' && partFor(e, drafterId))
    .map(e => historyDay(e.ts)));
  const out = [];
  drafterIds.forEach(drafterId => {
    const alerted = rankDays(drafterId);
    const parts = fresh.map(e => partFor(e, drafterId)).filter(Boolean).filter(p => {
      if(p.e.type !== 'rank') return true;
      const day = historyDay(p.e.ts);
      if(alerted.has(day)) return false;
      alerted.add(day);
      return true;
    });
    if(!parts.length) return;
    let title, body;
    if(parts.length === 1){
      title = parts[0].e.title;
      body = singleBody(parts[0]);
    } else {
      const live = parts.filter(p => p.live).reduce((s, p) => s + p.pts, 0);
      const locked = parts.filter(p => p.e.type === 'lock').reduce((s, p) => s + p.pts, 0);
      const net = [live ? `${signed(live)} live` : '', locked ? `${signed(locked)} locked in` : ''].filter(Boolean).join(', ');
      title = `${plural(parts.length, 'change')} to your points`;
      body = `${net ? net + '. ' : ''}${parts[0].e.title}, and ${parts.length - 1} more.`;
    }
    out.push({ drafterId, payload: { kind: 'points', title, body, url: POINTS_ALERT_URL, tag: 'points' } });
  });
  return out;
}
