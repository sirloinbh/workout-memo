import { expect, test } from 'vitest';

import type { CardioKind } from '../contract';
import { bucketsOf, kindsOf, runningPaces, totalsOf, weekStart } from './stats';

let id = 0;
const s = (
  date: string,
  kind: CardioKind,
  duration_sec: number,
  distance_km: number | null,
  start_time: string | null = null,
) => ({ id: ++id, date, kind, duration_sec, distance_km, start_time });
const pick = (buckets: ReturnType<typeof bucketsOf>) =>
  buckets.map(({ label, start, distance_km, duration_sec, count }) => ({
    label,
    start,
    distance_km,
    duration_sec,
    count,
  }));

test('weeks start on Monday: a Sunday ends its week and the next Monday starts a new one', () => {
  expect(weekStart('2026-11-08')).toBe('2026-11-02'); // Sunday
  expect(weekStart('2026-11-09')).toBe('2026-11-09'); // Monday
  expect(weekStart('2026-11-04')).toBe('2026-11-02');
  expect(weekStart('2026-01-01')).toBe('2025-12-29'); // across a year

  const sessions = [
    s('2026-11-02', 'running', 1800, 5), // Monday
    s('2026-11-08', 'running', 1200, 3.1), // Sunday, same week
    s('2026-11-09', 'walking', 3000, null), // Monday, next week
  ];
  // The period starts on a Wednesday: the first week is still the calendar week from 10/26.
  expect(pick(bucketsOf(sessions, '2026-10-28', '2026-11-10', 'week'))).toEqual([
    { label: '10/26', start: '2026-10-26', distance_km: 0, duration_sec: 0, count: 0 },
    { label: '11/2', start: '2026-11-02', distance_km: 8.1, duration_sec: 3000, count: 2 },
    // No distance: time and count only, never a guessed distance.
    { label: '11/9', start: '2026-11-09', distance_km: 0, duration_sec: 3000, count: 1 },
  ]);
});

test('only sessions inside from..to count, even in a week that reaches outside it', () => {
  const sessions = [s('2026-11-01', 'running', 900, 2), s('2026-11-03', 'running', 1800, 5)];
  const [week] = bucketsOf(sessions, '2026-11-02', '2026-11-08', 'week');
  expect(week).toMatchObject({ start: '2026-11-02', count: 1, distance_km: 5 });
  // 10/26~11/1 holds 11/1, but the period starts on 11/2.
  expect(bucketsOf(sessions, '2026-11-01', '2026-11-08', 'week')[0]).toMatchObject({
    start: '2026-10-26',
    count: 1,
  });
});

test('monthly totals per calendar month, labelled with the year when the period spans years', () => {
  const sessions = [
    s('2026-10-31', 'running', 1800, 5.02),
    s('2026-11-01', 'running', 2400, 6),
    s('2026-11-30', 'swimming', 2400, 1.5),
  ];
  expect(pick(bucketsOf(sessions, '2026-10-15', '2026-12-05', 'month'))).toEqual([
    { label: 'Oct', start: '2026-10-01', distance_km: 5.02, duration_sec: 1800, count: 1 },
    { label: 'Nov', start: '2026-11-01', distance_km: 7.5, duration_sec: 4800, count: 2 },
    { label: 'Dec', start: '2026-12-01', distance_km: 0, duration_sec: 0, count: 0 },
  ]);
  expect(
    bucketsOf([], '2025-12-20', '2026-01-10', 'month').map((b) => [b.label, b.start, b.end]),
  ).toEqual([
    ['25.12', '2025-12-01', '2026-01-01'],
    ['26.1', '2026-01-01', '2026-02-01'],
  ]);
});

test('totals and kinds: sums without float noise, kinds in list order', () => {
  const sessions = [
    s('2026-11-03', 'swimming', 2400, 1.5),
    s('2026-11-04', 'running', 1800, 5.02),
    s('2026-11-05', 'running', 1000, 3.1),
    s('2026-11-06', 'indoor_cycling', 3600, null),
  ];
  expect(totalsOf(sessions)).toEqual({ distance_km: 9.62, duration_sec: 8800, count: 4 });
  expect(kindsOf(sessions)).toEqual(['running', 'indoor_cycling', 'swimming']);
});

test('running pace trend: date order, other kinds and sessions without distance left out', () => {
  const sessions = [
    s('2026-11-07', 'running', 1830, 5.02, '07:30'),
    s('2026-11-07', 'running', 600, null), // no distance: no pace
    s('2026-11-03', 'running', 1500, 5),
    s('2026-11-07', 'running', 1200, 4, '06:00'),
    s('2026-11-04', 'walking', 3000, 4),
  ];
  expect(runningPaces(sessions).map((p) => [p.date, Math.round(p.pace)])).toEqual([
    ['2026-11-03', 300],
    ['2026-11-07', 300],
    ['2026-11-07', 365],
  ]);
});
