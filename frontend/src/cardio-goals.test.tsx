import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

// #116: cardio goals on the My Goals page. The server's judgment is shown as given. Today is
// Thursday 2026-10-15 in Seoul, so the current week is 10-12 ~ 10-18.
const weekly = {
  id: 1,
  goal_type: 'distance',
  kind: 'running',
  period: 'week',
  target_distance_km: 15,
  target_duration_sec: null,
  target_count: null,
  start_date: '2026-10-05',
  deadline: '2026-10-25',
  achieved: false,
  progress: {
    kind: 'period',
    current: { start: '2026-10-12', end: '2026-10-18', value: 9.5, achieved: false },
    periods: [
      { start: '2026-10-05', end: '2026-10-11', value: 16, achieved: true },
      { start: '2026-10-12', end: '2026-10-18', value: 9.5, achieved: false },
      { start: '2026-10-19', end: '2026-10-25', value: 0, achieved: false },
    ],
    periods_achieved: 1,
  },
};
const fiveK = {
  id: 2,
  goal_type: 'record_time',
  kind: 'running',
  period: null,
  target_distance_km: 5,
  target_duration_sec: 1800,
  target_count: null,
  start_date: '2026-10-01',
  deadline: '2026-12-31',
  achieved: true,
  progress: { kind: 'record', best: 1750 },
};
const ended = {
  ...weekly,
  id: 3,
  goal_type: 'count',
  kind: null,
  target_distance_km: null,
  target_count: 3,
  deadline: '2026-10-11',
  progress: { ...weekly.progress, current: null, periods: weekly.progress.periods.slice(0, 1) },
};

function mount(goals: unknown[]) {
  fixClock();
  vi.stubGlobal('confirm', () => true);
  const posted: unknown[] = [];
  const api = mockApi(({ method, url, body }) => {
    if (url.pathname === '/api/cardio-goals' && method === 'POST') {
      posted.push(body);
      return { id: 9, ...(body as object) };
    }
    if (url.pathname.startsWith('/api/cardio-goals/') && method === 'DELETE') {
      const id = Number(url.pathname.split('/').at(-1));
      goals = goals.filter((g) => (g as { id: number }).id !== id);
      return { ok: true };
    }
    if (url.pathname === '/api/cardio-goals') return goals;
    return [];
  });
  return { user: userEvent.setup(), posted, requests: api.requests };
}
const section = () => screen.getByRole('region', { name: 'Cardio goals' });
const card = (name: string) =>
  within(section())
    .getByRole('heading', { level: 3, name })
    .closest<HTMLElement>('[data-slot="cardio-goal"]')!;

test('cardio goals show the current period, achieved periods and records', async () => {
  const ui = mount([weekly, fiveK, ended]);
  render(<App />);
  await openPage('My Goals', ui.user);
  await within(section()).findByRole('heading', { level: 3, name: 'Weekly running 15 km' });

  const week = card('Weekly running 15 km');
  expect(within(week).getByText('In progress')).toHaveAttribute('data-slot', 'badge');
  expect(week.textContent).toMatch(/This week 9\.5 km \/ 15 km/);
  expect(
    within(week).getByRole('progressbar', { name: 'Weekly running 15 km progress this week' }),
  ).toHaveAttribute('aria-valuenow', '63');
  expect(week.textContent).toMatch(/Weeks achieved 1 \/ 3 total/);

  const record = card('Running 5 km within 30:00');
  expect(within(record).getByText('Achieved')).toBeInTheDocument();
  expect(record.textContent).toMatch(/Fastest record 29:10/);

  // After the deadline there is no current period: Period ended with the period summary only.
  const over = card('Weekly cardio 3 sessions');
  expect(within(over).getByText('Period ended')).toBeInTheDocument();
  expect(within(over).queryByRole('progressbar')).toBeNull();
  expect(over.textContent).toMatch(/Weeks achieved 1 \/ 1 total/);
});

test('a new cardio goal sends only the targets of its type', async () => {
  const ui = mount([]);
  render(<App />);
  await openPage('My Goals', ui.user);
  await within(section()).findByText('No cardio goals');

  await ui.user.click(screen.getByRole('button', { name: 'Add cardio goal' }));
  const dialog = screen.getByRole('dialog', { name: 'Cardio goals' });
  // A time record without a kind is stopped on the screen; nothing is sent.
  await ui.user.selectOptions(within(dialog).getByLabelText('Goal type'), 'record_time');
  await ui.user.type(within(dialog).getByLabelText('Goal distance (km)'), '5');
  await ui.user.type(within(dialog).getByLabelText('Goal time (min)'), '29');
  await ui.user.type(within(dialog).getByLabelText('Goal time (sec)'), '30');
  await ui.user.click(within(dialog).getByRole('button', { name: 'Save cardio goal' }));
  expect(
    await within(dialog).findByText('Choose one exercise type for a record goal'),
  ).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Workout type')).toHaveAttribute('aria-invalid', 'true');
  expect(ui.posted).toEqual([]);

  // Seconds above 59 are stopped too; both time fields are marked.
  await ui.user.selectOptions(within(dialog).getByLabelText('Workout type'), 'running');
  await ui.user.clear(within(dialog).getByLabelText('Goal time (sec)'));
  await ui.user.type(within(dialog).getByLabelText('Goal time (sec)'), '90');
  await ui.user.click(within(dialog).getByRole('button', { name: 'Save cardio goal' }));
  expect(
    await within(dialog).findByText(
      'Enter minutes (whole number, 0 or more) and seconds (whole number, 0–59)',
    ),
  ).toBeInTheDocument();
  expect(within(dialog).getByLabelText('Goal time (sec)')).toHaveAttribute('aria-invalid', 'true');
  expect(ui.posted).toEqual([]);
  await ui.user.clear(within(dialog).getByLabelText('Goal time (sec)'));
  await ui.user.type(within(dialog).getByLabelText('Goal time (sec)'), '30');
  await ui.user.click(within(dialog).getByRole('button', { name: 'Save cardio goal' }));
  await waitFor(() => expect(ui.posted).toHaveLength(1));
  expect(ui.posted[0]).toEqual({
    goal_type: 'record_time',
    kind: 'running',
    period: null,
    target_distance_km: 5,
    target_duration_sec: 1770,
    target_count: null,
    start_date: '2026-10-15',
    deadline: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Cardio goals' })).toBeNull());
  expect(within(section()).getByText('Cardio goal saved.')).toBeInTheDocument();

  // A weekly count for every kind keeps the period and leaves distance and time empty.
  await ui.user.click(screen.getByRole('button', { name: 'Add cardio goal' }));
  const next = screen.getByRole('dialog', { name: 'Cardio goals' });
  await ui.user.selectOptions(within(next).getByLabelText('Goal type'), 'count');
  await ui.user.type(within(next).getByLabelText('Goal sessions'), '3');
  await ui.user.click(within(next).getByRole('button', { name: 'Save cardio goal' }));
  await waitFor(() => expect(ui.posted).toHaveLength(2));
  expect(ui.posted[1]).toMatchObject({
    goal_type: 'count',
    kind: null,
    period: 'week',
    target_distance_km: null,
    target_duration_sec: null,
    target_count: 3,
  });
});

test('deleting a cardio goal removes only that card', async () => {
  const ui = mount([weekly, fiveK]);
  render(<App />);
  await openPage('My Goals', ui.user);
  await within(section()).findByRole('heading', { level: 3, name: 'Weekly running 15 km' });
  await ui.user.click(screen.getByRole('button', { name: 'Delete Weekly running 15 km goal' }));
  await waitFor(() =>
    expect(within(section()).queryByRole('heading', { name: 'Weekly running 15 km' })).toBeNull(),
  );
  expect(card('Running 5 km within 30:00')).toBeInTheDocument();
  expect(ui.requests.some((r) => r.method === 'DELETE' && r.path === '/api/cardio-goals/1')).toBe(
    true,
  );
});

// Distances follow the cardio session screen (#115): swimming in metres.
test('a swimming goal reads its distance in metres', async () => {
  const ui = mount([
    {
      ...fiveK,
      id: 4,
      goal_type: 'longest_distance',
      kind: 'swimming',
      target_distance_km: 1.5,
      target_duration_sec: null,
      achieved: false,
      progress: { kind: 'record', best: 1.2 },
    },
  ]);
  render(<App />);
  await openPage('My Goals', ui.user);
  const swim = card(
    (
      await within(section()).findByRole('heading', {
        level: 3,
        name: 'Swimming 1,500 m in one session',
      })
    ).textContent,
  );
  expect(swim.textContent).toMatch(/Longest distance 1,200 m/);
});

// Swimming distance is typed in metres and stored in km, like the session form (#252).
test('a swimming goal takes metres and switching kinds keeps the same distance', async () => {
  const ui = mount([]);
  render(<App />);
  await openPage('My Goals', ui.user);
  await within(section()).findByText('No cardio goals');
  await ui.user.click(screen.getByRole('button', { name: 'Add cardio goal' }));
  const dialog = screen.getByRole('dialog', { name: 'Cardio goals' });
  await ui.user.selectOptions(within(dialog).getByLabelText('Goal type'), 'longest_distance');
  await ui.user.selectOptions(within(dialog).getByLabelText('Workout type'), 'running');
  await ui.user.type(within(dialog).getByLabelText('Goal distance (km)'), '1.5');
  // Running 1.5 km becomes swimming 1500 m, and back.
  await ui.user.selectOptions(within(dialog).getByLabelText('Workout type'), 'swimming');
  expect(within(dialog).getByLabelText('Goal distance (m)')).toHaveValue('1500');
  await ui.user.selectOptions(within(dialog).getByLabelText('Workout type'), 'rowing');
  expect(within(dialog).getByLabelText('Goal distance (km)')).toHaveValue('1.5');
  await ui.user.selectOptions(within(dialog).getByLabelText('Workout type'), 'swimming');

  // Metres must be whole.
  const metres = within(dialog).getByLabelText('Goal distance (m)');
  await ui.user.clear(metres);
  await ui.user.type(metres, '1500.5');
  await ui.user.click(within(dialog).getByRole('button', { name: 'Save cardio goal' }));
  expect(
    await within(dialog).findByText(
      'Enter a swimming goal distance as a whole number from 1 to 10,000,000 m',
    ),
  ).toBeInTheDocument();
  expect(ui.posted).toEqual([]);

  await ui.user.clear(metres);
  await ui.user.type(metres, '1500');
  await ui.user.click(within(dialog).getByRole('button', { name: 'Save cardio goal' }));
  await waitFor(() => expect(ui.posted).toHaveLength(1));
  expect(ui.posted[0]).toMatchObject({
    goal_type: 'longest_distance',
    kind: 'swimming',
    target_distance_km: 1.5,
  });
});

// #251: an achieved goal offers the server's next goal; it fills the add form, nothing is saved
// until the user confirms. Goals not achieved never ask for one.
test('an achieved goal offers its next goal and fills the add form with it', async () => {
  const next = {
    goal_type: 'record_time',
    kind: 'running',
    period: null,
    target_distance_km: 5,
    target_duration_sec: 1745,
    target_count: null,
    start_date: '2026-10-15',
    deadline: '2027-01-14',
  };
  fixClock();
  vi.stubGlobal('confirm', () => true);
  const posted: unknown[] = [];
  const api = mockApi(({ method, url, body }) => {
    if (url.pathname === '/api/cardio-goals/2/suggestion') return { goal_id: 2, suggestion: next };
    if (url.pathname === '/api/cardio-goals' && method === 'POST') {
      posted.push(body);
      return { id: 9, ...(body as object) };
    }
    if (url.pathname === '/api/cardio-goals') return [weekly, fiveK];
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await openPage('My Goals', user);
  const offer = await within(card('Running 5 km within 30:00')).findByRole('button', {
    name: 'Next goal: Running 5 km within 29:05',
  });
  // The weekly goal is not achieved: no suggestion request, no button.
  expect(
    within(card('Weekly running 15 km')).queryByRole('button', { name: /^Next goal/ }),
  ).toBeNull();
  expect(api.requests.some((r) => r.path === '/api/cardio-goals/1/suggestion')).toBe(false);

  await user.click(offer);
  const dialog = screen.getByRole('dialog', { name: 'Cardio goals' });
  expect(within(dialog).getByLabelText('Goal type')).toHaveValue('record_time');
  expect(within(dialog).getByLabelText('Workout type')).toHaveValue('running');
  expect(within(dialog).getByLabelText('Goal distance (km)')).toHaveValue('5');
  expect(within(dialog).getByLabelText('Goal time (min)')).toHaveValue('29');
  expect(within(dialog).getByLabelText('Goal time (sec)')).toHaveValue('5');
  expect(within(dialog).getByLabelText('End date')).toHaveValue('2027-01-14');
  expect(posted).toEqual([]);
  await user.click(within(dialog).getByRole('button', { name: 'Save cardio goal' }));
  await waitFor(() => expect(posted).toEqual([next]));
});
