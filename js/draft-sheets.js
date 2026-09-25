/* ============================================================
   The draft board as a spreadsheet: three sheets built from the room's
   state, for the "Download board" button (js/draft.js).

     Picks    one row per slot in draft order, including slots not yet
              picked (with who owns them), so a mid-draft copy is enough
              to finish the draft somewhere else
     Board    rounds down, drafters across, like the board on screen
     Rosters  each drafter's teams, grouped by league

   Pure (no DOM, no app data): display names come in through `names`,
   so Node tests can run it. See js/xlsx.js for the file format.
   ============================================================ */
import { totalPicks, totalRounds, ownerOf, naturalOwner, pickLabel, teamById } from './draft-rules.js';
import { buildXlsx } from './xlsx.js';

const plain = { drafterName: id => id, leagueLabel: key => key.toUpperCase(), groupLabel: () => '' };

export function draftSheets(state, names = {}){
  const nm = { ...plain, ...names };
  const { config, order, overrides, picks, pool } = state;
  const drafters = order || config.drafters;
  const n = drafters.length;
  const total = totalPicks(config);
  const leagues = Object.keys(config.caps).filter(k => config.caps[k] > 0);
  const owner = slot => order ? ownerOf(slot, order, overrides) : (picks[slot] && picks[slot].by);
  const pickedTeam = slot => picks[slot] ? teamById(pool, picks[slot].team) : null;
  const teamLabel = t => `${t.name} (${nm.leagueLabel(t.league)})`;

  const pickRows = [['Overall', 'Pick', 'Round', 'Drafter', 'Team', 'League', 'Conference / Division', 'Rank', 'Note']];
  for(let slot = 0; slot < total; slot++){
    const p = picks[slot];
    if(!order && !p) continue;
    const t = pickedTeam(slot);
    const notes = [];
    if(order && owner(slot) !== naturalOwner(slot, order)) notes.push(`Traded from ${nm.drafterName(naturalOwner(slot, order))}`);
    if(p && p.proxy) notes.push('Picked by commissioner');
    if(p && p.edited) notes.push('Changed by commissioner');
    pickRows.push([
      slot + 1, pickLabel(slot, n), Math.floor(slot / n) + 1, nm.drafterName(owner(slot)),
      t ? t.name : '', t ? nm.leagueLabel(t.league) : '', t ? nm.groupLabel(t) : '',
      t && Number.isFinite(t.rank) ? t.rank : '', notes.join('; ')
    ]);
  }

  // Columns follow the snake's natural owner, as on screen; a traded slot
  // says who it went to.
  const boardRows = [['Round'].concat(drafters.map(nm.drafterName))];
  if(order){
    for(let r = 0; r < totalRounds(config.caps); r++){
      const row = [`${r + 1} ${r % 2 === 0 ? '→' : '←'}`];
      for(let c = 0; c < n; c++){
        const slot = r * n + (r % 2 === 0 ? c : n - 1 - c);
        const t = pickedTeam(slot);
        const to = owner(slot) !== order[c] ? `→ ${nm.drafterName(owner(slot))}` : '';
        row.push([t ? teamLabel(t) : '', to].filter(Boolean).join(' '));
      }
      boardRows.push(row);
    }
  }

  const rosters = Object.fromEntries(drafters.map(id => [id, {}]));
  Object.keys(picks).map(Number).sort((a, b) => a - b).forEach(slot => {
    const t = pickedTeam(slot), who = owner(slot);
    if(!t || !rosters[who]) return;
    (rosters[who][t.league] || (rosters[who][t.league] = [])).push(t.name);
  });
  const rosterRows = [['League'].concat(drafters.map(nm.drafterName))];
  leagues.forEach(lg => {
    const rows = Math.max(config.caps[lg], ...drafters.map(id => (rosters[id][lg] || []).length));
    for(let i = 0; i < rows; i++){
      rosterRows.push([i === 0 ? { v: nm.leagueLabel(lg), bold: true } : ''].concat(drafters.map(id => (rosters[id][lg] || [])[i] || '')));
    }
  });

  const across = Array(n).fill(24);
  return [
    { name: 'Picks', rows: pickRows, widths: [8, 7, 7, 16, 26, 8, 22, 6, 30], freeze: { rows: 1 } },
    { name: 'Board', rows: boardRows, widths: [8].concat(across), freeze: { rows: 1, cols: 1 }, boldCols: 1 },
    { name: 'Rosters', rows: rosterRows, widths: [9].concat(across), freeze: { rows: 1, cols: 1 } }
  ];
}

export function draftXlsx(state, names){
  return buildXlsx(draftSheets(state, names));
}
