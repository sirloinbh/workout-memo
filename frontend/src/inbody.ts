// #89: InBody results brought in from an exported file or a photo of the result sheet.
// Nothing is saved here: values become an editable preview and only the rows the user
// confirms are saved through the normal body measurement API. Values are never guessed;
// what cannot be read stays empty (NULL).

export type Target = 'date' | 'body_weight_kg' | 'body_fat_percent' | 'skeletal_muscle_kg';
export const targets: Target[] = [
  'date',
  'body_weight_kg',
  'body_fat_percent',
  'skeletal_muscle_kg',
];
export type PreviewRow = Record<Target, string>;

// Header names seen in Korean and English exports. Matching ignores case, spaces and
// punctuation; a header naming pounds is never mapped to a kg value.
const headerNames: Record<Target, string[]> = {
  date: [
    '날짜',
    '측정일',
    '측정일자',
    '측정일시',
    '검사일',
    '검사일자',
    'date',
    'testdate',
    'datetimes',
    'datetime',
  ],
  body_weight_kg: ['체중', '몸무게', 'weight', 'bodyweight'],
  body_fat_percent: [
    '체지방률',
    'pbf',
    'percentbodyfat',
    'bodyfatpercent',
    'bodyfat%',
    'fatpercent',
  ],
  skeletal_muscle_kg: ['골격근량', 'smm', 'skeletalmusclemass', 'skeletalmuscle'],
};
const normalize = (header: string) =>
  header
    .toLowerCase()
    .replace(/\((kg|%)\)|kg$/g, '')
    .replace(/[\s_\-.()[\]]/g, '');

export function detectColumns(headers: string[]): Record<Target, number | null> {
  const found = {} as Record<Target, number | null>;
  for (const target of targets) {
    const index = headers.findIndex((h) => {
      if (/\blbs?\b|파운드/i.test(h)) return false;
      return headerNames[target].includes(normalize(h));
    });
    found[target] = index < 0 ? null : index;
  }
  return found;
}

// RFC 4180 style CSV with a BOM, quotes, CRLF and comma, semicolon or tab delimiters.
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') cell += source[i++];
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v.trim() !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows.map((r) => r.map((v) => v.trim()));
}

// YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD or YYYYMMDD, optionally followed by a time.
// Anything else is left empty for the user instead of being reinterpreted.
export function normalizeDate(value: string): string {
  const m =
    /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})\.?(?:[ T].*)?$/.exec(value.trim()) ??
    /^(\d{4})(\d{2})(\d{2})(?:\d{4,6})?$/.exec(value.trim());
  if (!m) return '';
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const d = new Date(iso + 'T00:00:00Z');
  return !Number.isNaN(+d) && d.toISOString().slice(0, 10) === iso ? iso : '';
}

// A number with an optional unit ("72.4kg", "18.3 %"). Empty, dashes or text stay empty.
export function normalizeNumber(value: string): string {
  const m = /^(\d+(?:\.\d+)?)\s*(kg|%)?$/i.exec(value.trim());
  return m ? m[1] : '';
}

export function rowsFromCsv(cells: string[][], columns: Record<Target, number | null>) {
  return cells.slice(1).map((r): PreviewRow => ({
    date: columns.date === null ? '' : normalizeDate(r[columns.date] ?? ''),
    body_weight_kg:
      columns.body_weight_kg === null ? '' : normalizeNumber(r[columns.body_weight_kg] ?? ''),
    body_fat_percent:
      columns.body_fat_percent === null ? '' : normalizeNumber(r[columns.body_fat_percent] ?? ''),
    skeletal_muscle_kg:
      columns.skeletal_muscle_kg === null
        ? ''
        : normalizeNumber(r[columns.skeletal_muscle_kg] ?? ''),
  }));
}

// Text recognized from a result sheet photo. A value is taken only when it directly
// follows its label on the same line; ambiguous or missing labels stay empty.
export function rowFromText(text: string): PreviewRow {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  const valueAfter = (labels: RegExp) => {
    for (const line of lines) {
      const m = new RegExp(
        `(?:${labels.source})\\s*(?:\\([^)]*\\))?\\s*[:：]?\\s*(\\d{1,3}(?:\\.\\d{1,2})?)`,
        'i',
      ).exec(line);
      if (m) return m[1];
    }
    return '';
  };
  let date = '';
  for (const line of lines) {
    const m = /(\d{4}[-./]\d{1,2}[-./]\d{1,2})/.exec(line);
    if (m && (date = normalizeDate(m[1]))) break;
  }
  return {
    date,
    body_weight_kg: valueAfter(/체중|weight/),
    body_fat_percent: valueAfter(/체지방률|percent body fat|pbf/),
    skeletal_muscle_kg: valueAfter(/골격근량|skeletal muscle mass|smm/),
  };
}
