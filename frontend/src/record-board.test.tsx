import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

const best = (value: number, weight: number, reps: number, date: string) => ({
  value,
  weight,
  reps,
  date,
  ties: 1,
});

function mount(records: unknown[]) {
  fixClock();
  mockApi(({ url }) => {
    if (url.pathname === '/api/records') return { today: '2026-10-15', records };
    if (url.pathname === '/api/analysis')
      return {
        from: '2026-10-12',
        to: '2026-10-18',
        today: '2026-10-15',
        exercises: [],
        weeks: [],
      };
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  return user;
}

test('the record board lists each exercise with its best estimated 1RM, heaviest set and dates', async () => {
  const user = mount([
    {
      exercise: 'Squat',
      estimated_1rm: best(163.33, 140, 5, '2026-09-30'),
      max_weight: best(140, 140, 5, '2026-09-30'),
    },
    { exercise: 'Curl', estimated_1rm: null, max_weight: best(30, 30, 12, '2026-10-01') },
  ]);
  await openPage('Exercise Analysis', user);
  const board = await screen.findByRole('region', { name: 'Record board' });
  const table = within(board).getByRole('table');
  const rows = within(table).getAllByRole('row');
  expect(rows).toHaveLength(3);
  expect(within(rows[1]).getByText('Squat')).toBeTruthy();
  expect(within(rows[1]).getByText('163.33 kg')).toBeTruthy();
  expect(within(rows[1]).getByText('140 kg × 5')).toBeTruthy();
  expect(within(rows[2]).getByText('30 kg × 12')).toBeTruthy();
  expect(within(rows[2]).getByText('-')).toBeTruthy();
});

test('the record board says so when there are no records yet', async () => {
  const user = mount([]);
  await openPage('Exercise Analysis', user);
  const board = await screen.findByRole('region', { name: 'Record board' });
  expect(within(board).getByText('No records yet')).toBeTruthy();
});
