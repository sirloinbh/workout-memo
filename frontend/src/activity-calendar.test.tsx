import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { json, mockApi } from './test/api';
import { dailyVolumes, monthGrid, shadeLevel, shiftMonth, weekStreaks } from './workspace/activity';
import { ActivityCalendar } from './workspace/activity-calendar';
import type { Workout } from './workspace/model';

const w = (date: string, weight = 100, reps = 5, completed = true): Workout => ({
  id: 1,
  date,
  title: '',
  notes: '',
  sets: [{ exercise: 'Squat', machine_id: null, weight, reps, notes: '', completed }],
});

test('the month grid starts on Monday and pads the edges', () => {
  // 2026-11-01 is a Sunday, so the first week starts on Monday 2026-10-26.
  const weeks = monthGrid('2026-11');
  expect(weeks[0][0]).toEqual({ date: '2026-10-26', inMonth: false });
  expect(weeks[0][6]).toEqual({ date: '2026-11-01', inMonth: true });
  expect(weeks.at(-1)![6].date).toBe('2026-12-06');
  expect(weeks.every((week) => week.length === 7)).toBe(true);
  expect(weeks.flat().filter((d) => d.inMonth)).toHaveLength(30);
});

test('month edges: February in a leap year and a Monday start', () => {
  const feb = monthGrid('2028-02');
  expect(feb.flat().filter((d) => d.inMonth)).toHaveLength(29);
  expect(monthGrid('2026-06')[0][0]).toEqual({ date: '2026-06-01', inMonth: true });
  expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
});

test('daily volume sums same-day workouts and ignores workouts without completed sets', () => {
  const map = dailyVolumes([
    w('2026-11-02T00:00:00.000Z'),
    w('2026-11-02', 50, 2),
    w('2026-11-03', 100, 5, false),
  ]);
  expect(map.get('2026-11-02')).toBe(600);
  expect(map.has('2026-11-03')).toBe(false);
});

test('shade levels scale with the busiest day', () => {
  expect(shadeLevel(undefined, 100)).toBe(0);
  expect(shadeLevel(1, 100)).toBe(1);
  expect(shadeLevel(100, 100)).toBe(4);
  expect(shadeLevel(0, 0)).toBe(1);
});

test('streak counts consecutive Monday-based weeks', () => {
  // Weeks of 10-12, 10-19, 10-26 and 11-02 (Sunday 11-08 belongs to the week of 11-02).
  const dates = ['2026-10-14', '2026-10-19', '2026-10-31', '2026-11-08'];
  expect(weekStreaks(dates, '2026-11-09')).toEqual({ current: 4, best: 4 });
});

test('the current streak survives a week with no workout yet, but breaks after a missed week', () => {
  const dates = ['2026-10-26', '2026-11-02'];
  expect(weekStreaks(dates, '2026-11-10').current).toBe(2); // week of 11-09 is still running
  expect(weekStreaks(dates, '2026-11-17')).toEqual({ current: 0, best: 2 });
});

test('no workouts gives no streak', () => {
  expect(weekStreaks([], '2026-11-25')).toEqual({ current: 0, best: 0 });
});

function setup(workouts: Workout[]) {
  mockApi(() => json(workouts));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ActivityCalendar now="2026-11-25" />
    </QueryClientProvider>,
  );
}

test('shows shaded days, the streak and month navigation', async () => {
  setup([w('2026-11-02'), w('2026-11-17', 200, 5), w('2026-10-20')]);
  const card = await screen.findByTestId('activity-calendar');
  expect(within(card).getByText(/Streak: 1 week in a row/)).toBeTruthy();
  expect(card.querySelector('[data-date="2026-11-17"]')?.getAttribute('data-level')).toBe('4');
  expect(card.querySelector('[data-date="2026-11-02"]')?.getAttribute('data-level')).toBe('2');
  expect(card.querySelector('[data-date="2026-11-03"]')?.getAttribute('data-level')).toBe('0');
  expect(within(card).getByText('2 workout days')).toBeTruthy();
  expect(within(card).getByRole('button', { name: 'Next month' })).toHaveProperty('disabled', true);
  await userEvent.click(within(card).getByRole('button', { name: 'Previous month' }));
  expect(within(card).getByText('Oct 2026')).toBeTruthy();
  expect(within(card).getByText('1 workout day')).toBeTruthy();
});

test('an empty month renders without shaded days', async () => {
  setup([]);
  const card = await screen.findByTestId('activity-calendar');
  expect(within(card).getByText('0 workout days')).toBeTruthy();
  expect(card.querySelectorAll('[data-level]:not([data-level="0"])')).toHaveLength(0);
});
