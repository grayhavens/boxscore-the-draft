/* ============================================================
   What has to happen before a group's next draft, as checklists with a
   state per step. Pure (inputs in, rows out), so Node tests cover the
   rules and both pages render from the same answers:

   - commissionerChecklist: the group's own steps, on the Commissioner
     page's Group settings screen (js/admin.js). Each row says where the
     step is done: Sports, the draft room, the rehearsal room, a league's
     Scoring screen, or the room check run right there.
   - ownerChecklist: the app owner's steps, which change files in the
     code (saved ESPN team lists, the draft rankings, season outlooks, the
     golfer pool), on the system admin page's Platform view
     (js/system-admin.js), with the command that does each.

   The written version, with the order and timing, is "Before draft day"
   in docs/draft-room-plan.md. Rows: { key, state, title, detail, action }
     state   'ok' (done), 'warn' (needs doing now), 'mute' (not yet due,
             or nothing to do)
     action  { kind, label } or null; the page maps `kind` to a handler
   Copy is plain text; the pages escape it.
   ============================================================ */

const DAY = 86400000;
// The draft week: the room check and league locks matter from here.
const DRAFT_WEEK_DAYS = 7;

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// ---- The commissioner's steps ----

// status       the live room's /draft/status (null while loading)
// rehearsal    the group rehearsal room's /draft/status, or null
// sports       { drafted, scoresOnly } counts
// leagues      [{ key, label, locked }] scoring leagues that lock from standings
// check        { ok, at, detail } from the last room check, or null
// nextLabel    the coming draft ('2027/2028')
export function commissionerChecklist({ status, rehearsal, sports, leagues, check, nextLabel, now = Date.now() }){
  const rows = [];
  const st = status;
  const soon = !!(st && st.scheduledAt && st.scheduledAt > now && st.scheduledAt - now < DRAFT_WEEK_DAYS * DAY);

  // 1. Sports and picks: the next room's caps. Editable until the draft starts.
  rows.push({
    key: 'sports',
    state: sports && sports.drafted ? 'ok' : 'warn',
    title: 'Sports and picks',
    detail: sports
      ? `${plural(sports.drafted, 'sport')} drafted${sports.scoresOnly ? `, ${sports.scoresOnly} scores only` : ''}. Locked once the draft starts.`
      : 'Which sports the group drafts, and how many picks each.',
    action: { kind: 'sports', label: 'Open Sports' }
  });

  // 2. The room: last season's board still in it, or the lobby's setup.
  if(st && st.phase === 'done'){
    rows.push({
      key: 'room',
      state: 'warn',
      title: 'Last draft’s board is still in the room',
      detail: 'Reset it from the draft room’s commissioner bar when you’re ready to set up the next draft. The board is saved first, so nobody loses their teams.',
      action: { kind: 'room', label: 'Open draft room' }
    });
  } else if(st && st.phase === 'lobby'){
    const todo = [st.poolSize === 0 ? 'load the team pool' : '', st.ordered === false ? 'run the lottery' : ''].filter(Boolean);
    rows.push({
      key: 'room',
      state: todo.length ? (soon ? 'warn' : 'mute') : 'ok',
      title: 'Draft room',
      detail: todo.length
        ? `Still to do in the lobby: ${todo.join(' and ')}. Run the lottery with everyone watching.`
        : `Team pool loaded (${st.poolSize} teams) and the order is set.`,
      action: { kind: 'room', label: 'Open draft room' }
    });
  } else if(st && st.phase === 'draft'){
    rows.push({ key: 'room', state: 'ok', title: 'Draft room', detail: 'The draft is under way.', action: { kind: 'room', label: 'Open draft room' } });
  }

  // 3. Draft time: set, or a poll waiting on answers. A finished room's
  // time is the last draft's, so only a future one counts as set.
  if(st && st.phase !== 'draft'){
    const future = !!st.scheduledAt && st.scheduledAt > now;
    const passed = st.phase === 'lobby' && !!st.scheduledAt && !future;
    rows.push({
      key: 'time',
      state: future ? 'ok' : (st.poll || st.phase === 'lobby') ? 'warn' : 'mute',
      title: 'Draft time',
      detail: passed ? 'That time has passed. Set a new one below.'
        : future ? 'Set, and counting down on everyone’s Home.'
        : st.poll ? 'The poll is open on everyone’s Home. Pick a time below once they’ve answered.'
        : 'Run a poll or set the time below.',
      action: null
    });
  }

  // 4. A group rehearsal, run in the shared rehearsal room.
  const r = rehearsal;
  rows.push({
    key: 'rehearsal',
    state: r && r.phase === 'done' ? 'ok' : soon ? 'warn' : 'mute',
    title: 'Group rehearsal',
    detail: !r ? 'A dry run in the shared rehearsal room, with whoever can make it.'
      : r.phase === 'done' ? 'The rehearsal room has a finished draft. Run another any time.'
      : r.phase === 'draft' ? 'A rehearsal is running now.'
      : 'Not run yet. Anyone in the rehearsal room can start it.',
    action: { kind: 'rehearsal', label: 'Open rehearsal room' }
  });

  // 5. Finished leagues locked before the last pick: the new class goes live
  // the moment the draft ends, and only leagues locked by then keep their
  // final standings for the old one.
  if(leagues && leagues.length){
    const open = leagues.filter(l => !l.locked);
    rows.push({
      key: 'locks',
      state: !open.length ? 'ok' : soon ? 'warn' : 'mute',
      title: 'Finished leagues locked',
      detail: !open.length ? `All ${leagues.length} lock from standings and are locked.`
        : `${leagues.length - open.length} of ${leagues.length} locked. Still live: ${open.map(l => l.label).join(', ')}. Each locks itself when ESPN confirms its season is over; lock any that has finished before the last pick.`,
      action: open.length ? { kind: `league:${open[0].key}`, label: `Open ${open[0].label}` } : null
    });
  }

  // 6. The day-of check: the room answers, connects, and takes the password.
  rows.push({
    key: 'check',
    state: check ? (check.ok ? 'ok' : 'warn') : soon ? 'warn' : 'mute',
    title: 'Check the draft room',
    detail: check ? check.detail : 'Run it on draft day: the room answers, connects and accepts your password.',
    action: { kind: 'check', label: check ? 'Check again' : 'Run check' }
  });

  return rows;
}

// ---- The app owner's steps ----

// Due from August 1 through October (draft season) when it was last done
// before July 1 of this year. Outside that window it's never due.
export function seasonalDue(lastIso, now = Date.now()){
  const today = new Date(now);
  const year = today.getFullYear();
  const inSeason = today >= new Date(year, 7, 1) && today < new Date(year, 10, 1);
  if(!inSeason) return false;
  if(!lastIso) return true;
  return new Date(`${lastIso}T12:00:00`) < new Date(year, 6, 1);
}

const dateLabel = iso => iso
  ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : 'never';

// espnFetched     ESPN_TEAMS_FETCHED ('2026-10-13')
// ranksChanged    when js/draft-ranks.js was last changed (DRAFT_RANKS_CHECKED)
// outlooks        { [year]: { count, latest } } from DRAFT_OUTLOOKS
// golferSeason    GOLFER_POOL_SEASON; golfers: whether any group drafts them
export function ownerChecklist({ espnFetched, ranksChanged, outlooks = {}, golferSeason, golfers = false, now = Date.now() }){
  const year = new Date(now).getFullYear();
  const rows = [];
  rows.push({
    key: 'espn',
    state: seasonalDue(espnFetched, now) ? 'warn' : 'ok',
    title: 'ESPN team lists',
    detail: `Saved ${dateLabel(espnFetched)}. New teams in a draft class get their names and crests from these.`,
    command: 'node tools/espn-teams.mjs'
  });
  rows.push({
    key: 'ranks',
    state: seasonalDue(ranksChanged, now) ? 'warn' : 'ok',
    title: 'Draft rankings',
    detail: `Last checked ${dateLabel(ranksChanged)}. The EPL’s promoted and relegated clubs, any WNBA expansion team, and the order.`,
    command: 'js/draft-ranks.js (by hand)'
  });
  const mine = outlooks[year] || null;
  const inSeason = seasonalDue(null, now);
  rows.push({
    key: 'outlooks',
    state: mine && mine.count ? 'ok' : inSeason ? 'warn' : 'mute',
    title: 'Season outlooks',
    detail: mine && mine.count
      ? `${plural(mine.count, 'team')} written for ${year}, latest ${dateLabel(mine.latest)}.`
      : `None written for ${year} yet. The draft room falls back to each team’s numbers.`,
    command: 'node tools/outlooks.mjs facts --missing'
  });
  rows.push({
    key: 'golfers',
    state: !golfers ? 'mute' : golferSeason < year && inSeason ? 'warn' : 'ok',
    title: 'Golfer pool',
    detail: golfers ? `Built from the ${golferSeason} FedEx Cup season.` : `No group drafts golfers. Built from the ${golferSeason} season.`,
    command: 'node tools/golfer-pool.mjs'
  });
  return rows;
}

// Every class's outlook count and newest date, for ownerChecklist.
export function outlookSummary(outlooksByYear){
  const out = {};
  Object.entries(outlooksByYear || {}).forEach(([year, teams]) => {
    const dates = Object.values(teams).map(t => t && t.at).filter(Boolean).sort();
    out[year] = { count: Object.keys(teams).length, latest: dates[dates.length - 1] || null };
  });
  return out;
}
