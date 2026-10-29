import { expect, test } from 'vitest';

import {
  detectColumns,
  normalizeDate,
  normalizeNumber,
  parseCsv,
  rowFromText,
  rowsFromCsv,
} from './inbody';

// #89: parsing never guesses; unreadable values stay empty.
test('CSV keeps quotes, BOM, CRLF and finds the delimiter', () => {
  const bom = String.fromCharCode(0xfeff);
  expect(parseCsv(bom + '날짜,메모\r\n2026-10-01,"쉼표, ""따옴표"""\r\n\r\n')).toEqual([
    ['날짜', '메모'],
    ['2026-10-01', '쉼표, "따옴표"'],
  ]);
  expect(parseCsv('Date;Weight\n2026.10.01;72.4')).toEqual([
    ['Date', 'Weight'],
    ['2026.10.01', '72.4'],
  ]);
  expect(parseCsv('Date\tWeight\n20261001\t72.4')[1]).toEqual(['20261001', '72.4']);
});

test('columns are found by Korean or English header names, never from pounds', () => {
  expect(
    detectColumns(['측정일시', '체중(kg)', '골격근량(kg)', '체지방률(%)', '체지방량(kg)']),
  ).toEqual({
    date: 0,
    body_weight_kg: 1,
    body_fat_percent: 3,
    skeletal_muscle_kg: 2,
  });
  expect(detectColumns(['Date', 'Weight', 'PBF', 'SMM'])).toEqual({
    date: 0,
    body_weight_kg: 1,
    body_fat_percent: 2,
    skeletal_muscle_kg: 3,
  });
  expect(detectColumns(['Date', 'Weight (lb)', '근육량']).body_weight_kg).toBeNull();
  expect(detectColumns(['Date', 'Weight (lb)', '근육량']).skeletal_muscle_kg).toBeNull();
});

test('dates and numbers are normalized only when unambiguous', () => {
  for (const [value, expected] of [
    ['2026-10-01', '2026-10-01'],
    ['2026.10.1.', '2026-10-01'],
    ['2026/10/01 07:30', '2026-10-01'],
    ['20261001', '2026-10-01'],
    ['20261001073000', '2026-10-01'],
    ['10/01/2026', ''],
    ['2026-02-30', ''],
    ['', ''],
  ])
    expect(normalizeDate(value), value).toBe(expected);
  for (const [value, expected] of [
    ['72.4', '72.4'],
    ['72.4kg', '72.4'],
    ['18.3 %', '18.3'],
    ['-', ''],
    ['', ''],
    ['약 70', ''],
  ])
    expect(normalizeNumber(value), value).toBe(expected);
});

test('CSV rows follow the chosen columns and keep missing values empty', () => {
  const cells = parseCsv('날짜,체중,체지방률\n2026-10-01,72.4,18.3\n2026-10-08,-,18.1\n잘못,71,');
  const rows = rowsFromCsv(cells, detectColumns(cells[0]));
  expect(rows).toEqual([
    {
      date: '2026-10-01',
      body_weight_kg: '72.4',
      body_fat_percent: '18.3',
      skeletal_muscle_kg: '',
    },
    { date: '2026-10-08', body_weight_kg: '', body_fat_percent: '18.1', skeletal_muscle_kg: '' },
    { date: '', body_weight_kg: '71', body_fat_percent: '', skeletal_muscle_kg: '' },
  ]);
});

test('a result sheet photo yields only values that follow their labels', () => {
  const text = [
    'InBody 570  측정일시 2026.10.15 07:42',
    '체수분 (L) 40.1',
    '체중 (kg) 72.4 55.6 ~ 75.2',
    '골격근량 (kg) 33.1',
    '체지방량 (kg) 13.2',
    '체지방률 (%) 18.3',
    '체중조절 -3.2 kg',
  ].join('\n');
  expect(rowFromText(text)).toEqual({
    date: '2026-10-15',
    body_weight_kg: '72.4',
    body_fat_percent: '18.3',
    skeletal_muscle_kg: '33.1',
  });
  expect(rowFromText('Weight 70.2\nnoise')).toEqual({
    date: '',
    body_weight_kg: '70.2',
    body_fat_percent: '',
    skeletal_muscle_kg: '',
  });
});
