import { expect, test } from 'vitest';

import { checkRange, maxRangeDays, parseRange, rangeBuckets, rangeDays } from './date-range';

// #85: a directly chosen range includes both ends and is at most 371 days.
test('range length includes both ends', () => {
  expect(rangeDays('2026-10-15', '2026-10-15')).toBe(1);
  expect(rangeDays('2026-10-01', '2026-10-31')).toBe(31);
  expect(rangeDays('2024-02-28', '2024-03-01')).toBe(3);
});

test('invalid ranges are reported per field', () => {
  expect(checkRange('2026-10-01', '2026-10-10')).toEqual({});
  expect(checkRange('2026-10-10', '2026-10-10')).toEqual({});
  expect(checkRange('', '')).toEqual({ from: '시작일을 입력하세요', to: '종료일을 입력하세요' });
  expect(checkRange('2026-02-30', '2026-03-01').from).toBe('올바른 시작일을 입력하세요');
  expect(checkRange('2026-10-10', '2026-10-09')).toEqual({
    to: '종료일은 시작일과 같거나 이후여야 합니다',
  });
  const last = new Date(Date.UTC(2025, 0, maxRangeDays)).toISOString().slice(0, 10);
  expect(checkRange('2025-01-01', last)).toEqual({});
  const over = new Date(Date.UTC(2025, 0, maxRangeDays + 1)).toISOString().slice(0, 10);
  expect(checkRange('2025-01-01', over).to).toMatch(/최대 371일/);
});

test('only a complete valid range from the address is used', () => {
  expect(parseRange('2026-10-01', '2026-10-10')).toEqual({ from: '2026-10-01', to: '2026-10-10' });
  expect(parseRange('2026-10-01', null)).toBeNull();
  expect(parseRange('2026-10-10', '2026-10-01')).toBeNull();
  expect(parseRange('oops', '2026-10-01')).toBeNull();
});

test('charts group by day up to 31 days, by week up to 92 days, otherwise by month', () => {
  const daily = rangeBuckets('2026-10-01', '2026-10-31');
  expect(daily).toHaveLength(31);
  expect(daily[0]).toEqual({ start: '2026-10-01', end: '2026-10-02', label: '10/1' });
  expect(daily.at(-1)!.end).toBe('2026-11-01');

  const weekly = rangeBuckets('2026-10-01', '2026-11-01'); // 32 days
  expect(weekly.map((b) => b.label)).toEqual(['10/1', '10/8', '10/15', '10/22', '10/29']);
  expect(weekly.at(-1)).toEqual({ start: '2026-10-29', end: '2026-11-02', label: '10/29' });
  expect(rangeBuckets('2026-01-01', '2026-04-02')).toHaveLength(14); // 92 days

  const monthly = rangeBuckets('2026-01-15', '2026-04-20');
  expect(monthly).toEqual([
    { start: '2026-01-15', end: '2026-02-01', label: '1월' },
    { start: '2026-02-01', end: '2026-03-01', label: '2월' },
    { start: '2026-03-01', end: '2026-04-01', label: '3월' },
    { start: '2026-04-01', end: '2026-04-21', label: '4월' },
  ]);
  expect(rangeBuckets('2025-11-10', '2026-02-20').map((b) => b.label)).toEqual([
    '25.11',
    '25.12',
    '26.1',
    '26.2',
  ]);
});
