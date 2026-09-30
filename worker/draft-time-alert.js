/* ============================================================
   The alert everyone in a group gets when the commissioner sets (or
   moves) the live draft's start (worker/draft-room.js setSchedule).

   The worker doesn't know anyone's time zone, so the payload carries the
   time itself (`at`, epoch ms) and sw.js writes the body on the phone, in
   that phone's own zone. `body` here is only what a service worker from
   before this alert existed shows.

   It goes to every device with alerts on, whichever switches are set
   (like the system admin's announcements): it's sent once or twice a
   year, and missing it means missing the draft.
   ============================================================ */

// null when there's nothing to tell anyone: the time was cleared, saved
// again unchanged, or is already in the past.
export function draftTimeAlert(prev, at, now){
  if(at === null || at === prev || at <= now) return null;
  return {
    kind: 'draft-time',
    title: prev ? 'Draft time changed' : 'Draft time set',
    body: 'Open Boxscore to see when the live draft starts.',
    at,
    url: './',
    tag: 'draft-time'
  };
}
