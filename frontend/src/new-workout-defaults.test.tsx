import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import type { Progress } from './progress-data';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #82: a new journal defaults to today (Asia/Seoul), a date title and today's routine sets.
// The device clock is 2026-10-14 UTC while Seoul is already Thursday 2026-10-15.
const today = '2026-10-15';
const machines = [
  {
    id: 5,
    brand_id: 1,
    brand: 'Hammer',
    name: 'Leg Press',
    base_weight: 50,
    notes: '',
    official_status: null,
  },
];
const exercise = (name: string, machine_id: number | null, sets: number, weight: number) => ({
  exercise: name,
  machine_id,
  sets,
  weight,
  reps: 10,
  base: { sets, weight, reps: 10 },
});
const target = {
  order: 1,
  week: 1,
  is_deload: false,
  split_index: 0,
  split_name: 'Lower body',
  change: null,
  // Machine 99 is no longer in the machine list, so it falls back to a free exercise.
  exercises: [exercise('Leg Press', 5, 2, 150), exercise('Squat', 99, 1, 100)],
};
const withRoutine = (todayPlan: Progress['today_plan']): Progress => ({
  today,
  routine: { id: 7, name: '12-week routine' },
  start_date: today,
  status: 'active',
  today_plan: todayPlan,
  this_week: [],
  weeks: [],
  previous: {},
});

function mount(progress: Progress) {
  fixClock();
  const api = mockApi(({ method, url }) => {
    if (url.pathname === '/api/routine-progress') return progress;
    if (url.pathname === '/api/machines') return machines;
    if (url.pathname === '/api/workouts' && method === 'POST')
      return json({ id: 1, version: 1 }, 201);
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  return { user, requests: api.requests };
}
const dialog = () =>
  screen.getByRole('region', { name: /New workout record|Edit workout journal/ });
const inputs = (label: string) =>
  within(dialog()).getAllByLabelText<HTMLInputElement | HTMLSelectElement>(label);
const values = (label: string) => inputs(label).map((e) => e.value);
async function openEditor(user: ReturnType<typeof userEvent.setup>) {
  await openPage('Day log', user);
  await waitFor(() =>
    expect(document.querySelector('[aria-label="Routine goals"]')?.textContent ?? '').not.toMatch(
      /Loading/,
    ),
  );
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
}

test('a new journal is dated today with a date title even when another day is browsed', async () => {
  const ui = mount({ today, routine: null });
  await openPage('Day log', ui.user);
  fireEvent.change(screen.getByLabelText('Reference date'), { target: { value: '2026-09-01' } });
  expect(screen.getByLabelText('Reference date')).toHaveValue('2026-09-01');
  await openEditor(ui.user);
  expect(inputs('Workout date')[0]).toHaveValue(today);
  expect(inputs('Journal title')[0]).toHaveValue('Thu, Oct 15');
  // Without a routine the journal starts with three empty sets as before (#28), as one exercise (#531).
  expect(values('Exercise name')).toEqual(['']);
  expect(values('Total weight kg')).toHaveLength(3);
  // Defaults stay editable.
  await ui.user.clear(inputs('Journal title')[0]);
  await ui.user.type(inputs('Journal title')[0], 'Lower body day');
  expect(inputs('Journal title')[0]).toHaveValue('Lower body day');
});

test("today's routine fills the sets with exercise, machine, total kg and reps", async () => {
  const ui = mount(withRoutine({ date: today, week: 1, rest: false, target }));
  await openEditor(ui.user);
  // #531: the two Leg Press sets share one name and machine.
  expect(values('Exercise name')).toEqual(['Leg Press', 'Squat']);
  expect(values('Machine')).toEqual(['5', '']);
  expect(values('Total weight kg')).toEqual(['150', '150', '100']);
  expect(values('Reps')).toEqual(['10', '10', '10']);
  expect(inputs('Journal title')[0]).toHaveValue('Thu, Oct 15');
  fireEvent.submit(dialog().querySelector('form')!);
  await waitFor(() =>
    expect(ui.requests.some((r) => r.method === 'POST' && r.path === '/api/workouts')).toBe(true),
  );
  const body = ui.requests.find((r) => r.method === 'POST' && r.path === '/api/workouts')!.body as {
    date: string;
    title: string;
    sets: { machine_id: number | null; completed: boolean }[];
  };
  expect(body.date).toBe(today);
  expect(body.title).toBe('Thu, Oct 15');
  expect(body.sets.map((s) => s.machine_id)).toEqual([5, 5, null]);
  // Planned sets are not performed until the user marks them.
  expect(body.sets.every((s) => !s.completed)).toBe(true);
});

test('a rest day starts with three empty sets', async () => {
  const ui = mount(withRoutine({ date: today, week: 1, rest: true, target: null }));
  await openEditor(ui.user);
  expect(values('Exercise name')).toEqual(['']);
  expect(values('Machine')).toEqual(['']);
  expect(values('Total weight kg')).toHaveLength(3);
});

// #525: the log page header shows only the date, the weekday and today's routine.
test('log page header shows the date, weekday and routine without slogans', async () => {
  const { user } = mount(withRoutine(null));
  await openPage('Day log', user);
  const heading = await screen.findByRole('heading', { level: 1 });
  expect(heading.textContent).toBe('Thu, Oct 15');
  const header = heading.closest<HTMLElement>('[data-slot="page-header"]')!;
  await within(header).findByText('12-week routine');
  expect(screen.queryByText('YOUR PROGRESS, IN FOCUS')).toBeNull();
  expect(screen.queryByText('One more step today')).toBeNull();
  expect(screen.queryByText('Every set holds a better you than yesterday.')).toBeNull();
});
