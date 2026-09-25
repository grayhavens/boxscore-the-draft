// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { draftSheets, draftXlsx } from '../js/draft-sheets.js';
import { colName, zipStored } from '../js/xlsx.js';

const team = (id, league, rank) => ({ id, name: id.toUpperCase(), league, abbr: id, color: '#123456', ...(rank ? { rank } : {}) });
const POOL = [team('e1', 'epl', 1), team('e2', 'epl', 2), team('n1', 'nfl', 1), team('n2', 'nfl'), team('n3', 'nfl'), team('amp&"<co>', 'nfl')];

// 3 drafters x 2 rounds (epl 1 + nfl 1): slots 0-2 go a,b,c; 3-5 go c,b,a.
function state(picks, overrides = {}){
  return {
    phase: 'draft',
    config: { drafters: ['c', 'a', 'b'], caps: { epl: 1, nfl: 1 } },
    order: ['a', 'b', 'c'], overrides, picks, pool: POOL
  };
}
const names = { drafterName: id => id.toUpperCase() + 'name', leagueLabel: k => k.toUpperCase(), groupLabel: t => t.league === 'nfl' ? 'NFC East' : '' };

// Read the stored zip back: name -> text.
function unzip(bytes){
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = {};
  for(let at = 0; v.getUint32(at, true) === 0x04034b50;){
    const size = v.getUint32(at + 18, true), nameLen = v.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.subarray(at + 30, at + 30 + nameLen));
    out[name] = new TextDecoder().decode(bytes.subarray(at + 30 + nameLen, at + 30 + nameLen + size));
    at += 30 + nameLen + size;
  }
  return out;
}

test('column names', () => {
  assert.deepEqual([0, 25, 26, 27, 51, 52, 701, 702].map(colName), ['A', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
});

test('picks sheet lists every slot in order, with owners for unpicked ones', () => {
  const [picks] = draftSheets(state({ 0: { by: 'a', team: 'e1' }, 1: { by: 'b', team: 'n2', proxy: true } }), names);
  assert.equal(picks.name, 'Picks');
  assert.equal(picks.rows.length, 1 + 6);
  assert.deepEqual(picks.rows[1], [1, '1.01', 1, 'Aname', 'E1', 'EPL', '', 1, '']);
  assert.deepEqual(picks.rows[2], [2, '1.02', 1, 'Bname', 'N2', 'NFL', 'NFC East', '', 'Picked by commissioner']);
  assert.deepEqual(picks.rows[4].slice(0, 5), [4, '2.01', 2, 'Cname', '']);   // snake: round 2 starts with c
  assert.deepEqual(picks.rows[6].slice(0, 5), [6, '2.03', 2, 'Aname', '']);
});

test('a traded slot belongs to its new owner and says so', () => {
  const [picks, board, rosters] = draftSheets(state({ 3: { by: 'a', team: 'n1', edited: true } }, { 3: 'a' }), names);
  assert.equal(picks.rows[4][3], 'Aname');
  assert.equal(picks.rows[4][8], 'Traded from Cname; Changed by commissioner');
  // Board: round 2 runs right to left, so slot 3 (c's by the snake) sits in c's column, the last.
  assert.deepEqual(board.rows[0], ['Round', 'Aname', 'Bname', 'Cname']);
  assert.deepEqual(board.rows[2], ['2 ←', '', '', 'N1 (NFL) → Aname']);
  // Rosters: the team counts for a, not c.
  assert.deepEqual(rosters.rows[2], [{ v: 'NFL', bold: true }, 'N1', '', '']);
});

test('rosters group by league in cap order', () => {
  const s = state({ 0: { by: 'a', team: 'e1' }, 1: { by: 'b', team: 'e2' }, 5: { by: 'a', team: 'n3' } });
  const rosters = draftSheets(s, names)[2];
  assert.deepEqual(rosters.rows, [
    ['League', 'Aname', 'Bname', 'Cname'],
    [{ v: 'EPL', bold: true }, 'E1', 'E2', ''],
    [{ v: 'NFL', bold: true }, 'N3', '', '']
  ]);
});

test('the xlsx has three sheets and escapes text', () => {
  const files = unzip(draftXlsx(state({ 0: { by: 'a', team: 'amp&"<co>' } }), names));
  assert.ok(files['[Content_Types].xml'].includes('/xl/worksheets/sheet3.xml'));
  assert.ok(files['xl/workbook.xml'].includes('<sheet name="Picks"'));
  assert.ok(files['xl/workbook.xml'].includes('<sheet name="Rosters"'));
  const sheet1 = files['xl/worksheets/sheet1.xml'];
  assert.ok(sheet1.includes('AMP&amp;&quot;&lt;CO&gt;'));
  assert.ok(sheet1.includes('<c r="A2"><v>1</v></c>'));       // numbers stay numbers
  assert.ok(sheet1.includes('<c r="A1" s="1" t="inlineStr">'));  // header is bold
  assert.ok(sheet1.includes('state="frozen"'));
});

test('stored zip checksums are right', async () => {
  const { crc32 } = await import('node:zlib');
  if(!crc32) return;   // Node < 22
  const bytes = zipStored([['a.txt', 'hello'], ['b/c.txt', 'é']]);
  const v = new DataView(bytes.buffer);
  assert.equal(v.getUint32(14, true), crc32('hello'));
});
