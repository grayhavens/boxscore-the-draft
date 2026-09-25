/* ============================================================
   A minimal .xlsx writer: enough for a few plain tables with a bold
   header row, frozen panes and column widths, and nothing more.

   An .xlsx is a zip of SpreadsheetML files. Rather than load a ~1 MB
   spreadsheet library for one download, this writes those few XML files
   and packs them in an uncompressed ("stored") zip, which Excel,
   Numbers and Google Sheets all open. Pure (no DOM), so Node tests can
   check its output.

     buildXlsx([{ name, rows, widths?, freeze?: { rows, cols }, boldCols? }])
       -> Uint8Array

   `rows` is an array of arrays of cells: a string, a number, null/'' for
   an empty cell, or { v, bold } to style one cell. The first row is
   always bold (the header); `boldCols` also bolds the first N columns.
   ============================================================ */

const enc = new TextEncoder();

// XML 1.0 can't carry most control characters at all, even escaped.
const xmlText = s => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Column index (0-based) -> letters: 0 -> A, 26 -> AA.
export function colName(i){
  let s = '';
  for(i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s;
  return s;
}

// Excel's sheet-name rules: 31 characters, none of []:*?/\ and unique.
function sheetNames(sheets){
  const used = new Set();
  return sheets.map((sh, i) => {
    let base = String(sh.name || `Sheet${i + 1}`).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || `Sheet${i + 1}`;
    let name = base, n = 2;
    while(used.has(name.toLowerCase())) name = `${base.slice(0, 28)} ${n++}`;
    used.add(name.toLowerCase());
    return name;
  });
}

function cellXml(ref, cell, bold){
  const v = cell && typeof cell === 'object' ? cell.v : cell;
  const b = bold || !!(cell && typeof cell === 'object' && cell.bold);
  const s = b ? ' s="1"' : '';
  if(v === null || v === undefined || v === '') return b ? `<c r="${ref}"${s}/>` : '';
  if(typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlText(v)}</t></is></c>`;
}

function sheetXml(sh){
  const rows = sh.rows || [];
  const fr = (sh.freeze && sh.freeze.rows) || 0, fc = (sh.freeze && sh.freeze.cols) || 0;
  let view = '<sheetView workbookViewId="0"/>';
  if(fr || fc){
    const pane = fr && fc ? 'bottomRight' : fr ? 'bottomLeft' : 'topRight';
    view = `<sheetView workbookViewId="0"><pane${fc ? ` xSplit="${fc}"` : ''}${fr ? ` ySplit="${fr}"` : ''} topLeftCell="${colName(fc)}${fr + 1}" activePane="${pane}" state="frozen"/></sheetView>`;
  }
  const cols = sh.widths && sh.widths.length
    ? `<cols>${sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const body = rows.map((row, r) =>
    `<row r="${r + 1}">${(row || []).map((cell, c) => cellXml(`${colName(c)}${r + 1}`, cell, r === 0 || c < (sh.boldCols || 0))).join('')}</row>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews>${view}</sheetViews>${cols}<sheetData>${body}</sheetData></worksheet>`;
}

function workbookFiles(sheets){
  const names = sheetNames(sheets);
  const files = [
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${
      sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${
      names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
      sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')
    }<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    // Style 0 is the default; style 1 is bold.
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`]
  ];
  sheets.forEach((sh, i) => files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sh)]));
  return files;
}

// ---- zip (stored, no compression) ----

let crcTable = null;
function crc32(bytes){
  if(!crcTable){
    crcTable = new Uint32Array(256);
    for(let n = 0; n < 256; n++){
      let c = n;
      for(let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xFFFFFFFF;
  for(let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

export function zipStored(entries){
  const DOS_TIME = 0, DOS_DATE = (1 << 5) | 1;   // 1980-01-01: the output doesn't depend on the clock
  const locals = [], centrals = [];
  let offset = 0;
  entries.forEach(([name, data]) => {
    const nameBytes = enc.encode(name);
    const body = typeof data === 'string' ? enc.encode(data) : data;
    const crc = crc32(body);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true);  // UTF-8 names
    lv.setUint16(8, 0, true); lv.setUint16(10, DOS_TIME, true); lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true); lv.setUint32(18, body.length, true); lv.setUint32(22, body.length, true);
    lv.setUint16(26, nameBytes.length, true); lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);
    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true); cv.setUint16(12, DOS_TIME, true); cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true); cv.setUint32(20, body.length, true); cv.setUint32(24, body.length, true);
    cv.setUint16(28, nameBytes.length, true); cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);
    locals.push(local, body); centrals.push(central);
    offset += local.length + body.length;
  });
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const parts = locals.concat(centrals, [end]);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  parts.forEach(p => { out.set(p, at); at += p.length; });
  return out;
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function buildXlsx(sheets){
  return zipStored(workbookFiles(sheets));
}
