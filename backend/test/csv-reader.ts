import assert from 'node:assert/strict';

// Minimal RFC 4180 reader used only to prove what a spreadsheet would read back.
export function parseCsv(input: string) {
  assert.ok(
    input.startsWith(String.fromCharCode(0xfeff)),
    'UTF-8 BOM lets spreadsheets detect Korean text',
  );
  const text = input.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += c;
  }
  assert.equal(quoted, false, 'Every quoted cell is closed');
  assert.equal(cell, '', 'Every record ends with CRLF');
  assert.equal(row.length, 0);
  return rows;
}
