/* ============================================================
   Draft time poll: before the commissioner sets the live draft's start,
   they can offer two or three candidate times (Commissioner → Draft,
   js/admin.js) and every drafter marks the ones they can make on Home's
   draft card (renderDraftHome in js/board.js).

   A poll is { options: [epoch ms, ...], votes: { <drafterId>: [epoch ms, ...] } }.
   An option is its own id: the time itself. A drafter's answer is every
   offered time they can make; an empty list is an answer too ("none of
   these work"), and no entry at all means they haven't answered.

   Pure, and shared by the browser, the draft room Durable Object
   (worker/draft-room.js, which stores the poll beside the schedule) and
   Node tests.
   ============================================================ */
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 3;

const isTime = at => Number.isSafeInteger(at) && at > 0;

// The commissioner's candidate times, in order and without repeats. null
// when it isn't two or three real times.
export function parsePollOptions(options){
  if(!Array.isArray(options) || !options.every(isTime)) return null;
  const unique = [...new Set(options)].sort((a, b) => a - b);
  return unique.length >= POLL_MIN_OPTIONS && unique.length <= POLL_MAX_OPTIONS ? unique : null;
}

// One drafter's answer, narrowed to the times actually on offer. null
// when it's malformed.
export function parsePollVote(poll, picks){
  if(!poll || !Array.isArray(picks) || !picks.every(isTime)) return null;
  return poll.options.filter(at => picks.includes(at));
}

// The commissioner changed the times. An answer survives only if it still
// names a time on offer: someone whose times all went away (or who said
// none worked) should be asked again rather than counted as a no.
export function replacePollOptions(poll, options){
  const votes = {};
  for(const [drafter, picks] of Object.entries((poll && poll.votes) || {})){
    const kept = picks.filter(at => options.includes(at));
    if(kept.length) votes[drafter] = kept;
  }
  return { options, votes };
}

// Who can make each time, who can make none, and who hasn't answered,
// all in roster order. Answers from anyone not in `drafterIds` are left
// out.
export function pollTally(poll, drafterIds){
  const answered = drafterIds.filter(id => Array.isArray(poll.votes[id]));
  return {
    options: poll.options.map(at => ({ at, voters: answered.filter(id => poll.votes[id].includes(at)) })),
    none: answered.filter(id => !poll.votes[id].length),
    waiting: drafterIds.filter(id => !answered.includes(id))
  };
}
