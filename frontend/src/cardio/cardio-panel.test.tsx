import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { type ApiRequest, deferred, fixClock, json, mockApi } from '../test/api';
import type { CardioSession } from './api';
import { CardioPanel } from './cardio-panel';

const today = '2026-11-08';
const base = {
  start_time: null,
  avg_heart_rate: null,
  max_heart_rate: null,
  calories_kcal: null,
  elevation_gain_m: null,
  avg_cadence: null,
  effort: null,
  workout_id: null,
  source: 'manual',
  external_id: null,
  memo: '',
} as const;

// Shaped like GET /api/cardio-sessions answers: newest first, pace and speed computed.
const fixture = (): CardioSession[] => [
  {
    ...base,
    id: 1,
    date: '2026-11-07',
    start_time: '07:30',
    kind: 'running',
    duration_sec: 1830,
    distance_km: 5.02,
    avg_heart_rate: 150,
    effort: 'medium',
    source: 'garmin',
    external_id: 'garmin-1',
    memo: 'Han River',
    pace_sec_per_km: 364.5,
    speed_kmh: 9.88,
  },
  {
    ...base,
    id: 2,
    date: '2026-11-06',
    kind: 'swimming',
    duration_sec: 2400,
    distance_km: 1.5,
    // Linked to the strength workout of the day before.
    workout_id: 8,
    pace_sec_per_km: 1600,
    speed_kmh: 2.25,
  },
  {
    ...base,
    id: 3,
    date: '2026-11-05',
    kind: 'indoor_cycling',
    duration_sec: 3725,
    distance_km: null,
    pace_sec_per_km: null,
    speed_kmh: null,
  },
];

const workouts = [
  { id: 7, date: '2026-11-08', title: 'Lower body' },
  { id: 8, date: '2026-11-07', title: 'Upper body' },
];

function mount(respond?: (request: ApiRequest) => unknown) {
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  const sessions = fixture();
  const api = mockApi((request) => {
    const custom = respond?.(request);
    if (custom !== undefined) return custom;
    if (request.method === 'GET') return sessions;
    if (request.method === 'POST')
      return json({ ...base, id: 9, ...(request.body as object) }, 201);
    if (request.method === 'PUT') return { ...base, id: 1, ...(request.body as object) };
    return { ok: true };
  });
  render(<CardioPanel from="2026-11-02" to={today} today={today} workouts={workouts} />);
  return api;
}

const list = () => screen.findByRole('list', { name: 'Cardio records' });
const dialog = () => screen.getByRole('dialog');
const field = (name: string) => within(dialog()).getByRole('textbox', { name });

test('lists the period with duration, distance, pace and speed; no pace without distance', async () => {
  const { requests } = mount();
  const rows = within(await list()).getAllByRole('listitem');
  expect(requests[0].url.pathname).toBe('/api/cardio-sessions');
  expect(requests[0].url.search).toBe('?from=2026-11-02&to=2026-11-08');
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent('2026-11-07 Running');
  expect(rows[0]).toHaveTextContent('Effort Medium');
  expect(rows[0]).toHaveTextContent('30:30 · 5.02 km · 6:05/km · 9.9 km/h');
  expect(rows[0]).toHaveTextContent('Han River');
  // Swimming: distance in metres, pace and speed still per km.
  expect(rows[1]).toHaveTextContent('2026-11-06 Swimming');
  expect(rows[1]).toHaveTextContent('40:00 · 1,500 m · 26:40/km · 2.3 km/h');
  expect(rows[2]).toHaveTextContent('2026-11-05 Indoor cycling');
  expect(rows[2]).toHaveTextContent('1:02:05 · No distance');
  expect(rows[2]).not.toHaveTextContent('/km');
  expect(rows[2]).not.toHaveTextContent('km/h');
});

test('an empty period shows the empty state', async () => {
  mount((request) => (request.method === 'GET' ? [] : undefined));
  expect(
    await screen.findByRole('heading', { name: 'No cardio records in the selected period' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Cardio records' })).toBeNull();
});

test('a failed load shows the error with a reconnect action', async () => {
  let fail = true;
  mount((request) =>
    request.method === 'GET' && fail ? json({ error: 'Server error' }, 500) : undefined,
  );
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Server error');
  fail = false;
  await userEvent.click(within(alert).getByRole('button', { name: 'Reconnect' }));
  expect(await list()).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('creating sends the core fields as POST and reloads the list', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: 'Add cardio record' }));
  expect(screen.getByRole('heading', { name: 'New cardio record' })).toBeInTheDocument();
  // Only the core fields show at first.
  const more = within(dialog()).getByRole('button', { name: 'Show more fields' });
  expect(more).toHaveAttribute('aria-expanded', 'false');
  expect(
    within(dialog()).queryByRole('textbox', { name: 'Average heart rate bpm (optional)' }),
  ).toBeNull();

  await user.selectOptions(within(dialog()).getByLabelText('Type'), 'Swimming');
  await user.type(field('Workout time minutes'), '40');
  await user.type(field('Workout time seconds'), '5');
  // Swimming distance is typed in metres and saved in km.
  expect(within(dialog()).queryByRole('textbox', { name: 'Distance km' })).toBeNull();
  await user.type(field('Distance m'), '1500');
  expect(dialog()).toHaveTextContent(
    'Enter swimming distance in m. It is converted to km when saved.',
  );
  expect(dialog()).not.toHaveTextContent('1,500 m is 1.5');
  await user.click(within(dialog()).getByRole('button', { name: 'Hard' }));
  await user.type(within(dialog()).getByLabelText('Memo (optional)'), 'Freestyle');
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const post = requests.find((r) => r.method === 'POST')!;
  expect(post.path).toBe('/api/cardio-sessions');
  expect(post.body).toEqual({
    date: today,
    kind: 'swimming',
    duration_sec: 2405,
    distance_km: 1.5,
    avg_heart_rate: null,
    max_heart_rate: null,
    calories_kcal: null,
    elevation_gain_m: null,
    avg_cadence: null,
    effort: 'hard',
    start_time: null,
    workout_id: null,
    memo: 'Freestyle',
    source: 'manual',
    external_id: null,
  });
  expect(screen.getByRole('status')).toHaveTextContent('Cardio record saved');
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(2);
});

test('more input reveals the optional fields and links a same-day workout', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: 'Add cardio record' }));
  const more = within(dialog()).getByRole('button', { name: 'Show more fields' });
  await user.click(more);
  expect(more).toHaveAttribute('aria-expanded', 'true');
  await user.type(field('Workout time minutes'), '30');
  await user.type(field('Average heart rate bpm (optional)'), '140');
  await user.type(field('Max heart rate bpm (optional)'), '172');
  await user.type(field('Calories kcal (optional)'), '320');
  await user.type(field('Elevation gain m (optional)'), '25');
  await user.type(field('Cadence /min (optional)'), '170');
  await user.type(within(dialog()).getByLabelText('Start time (optional)'), '06:45');
  const link = within(dialog()).getByLabelText('Strength journal to link');
  // Only the workout on the session's date (today) is offered.
  expect(
    within(link)
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['Not linked', 'Lower body']);
  await user.selectOptions(link, 'Lower body');
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));

  await waitFor(() => expect(requests.some((r) => r.method === 'POST')).toBe(true));
  expect(requests.find((r) => r.method === 'POST')!.body).toMatchObject({
    duration_sec: 1800,
    avg_heart_rate: 140,
    max_heart_rate: 172,
    calories_kcal: 320,
    elevation_gain_m: 25,
    avg_cadence: 170,
    start_time: '06:45',
    workout_id: 7,
  });
});

test('nothing is sent for a future date, zero time or an invalid heart rate', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: 'Add cardio record' }));
  const date = within(dialog()).getByLabelText('Date');
  // jsdom does not simulate typing into a date input reliably; set the value directly.
  fireEvent.change(date, { target: { value: '2026-11-09' } });
  await user.type(field('Workout time minutes'), '0');
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));

  expect(date).toHaveAttribute('aria-invalid', 'true');
  expect(dialog()).toHaveTextContent('The cardio record date cannot be after today');
  expect(field('Workout time minutes')).toHaveAttribute('aria-invalid', 'true');
  expect(field('Workout time minutes')).toHaveAccessibleDescription(
    'The workout time must be at least 1 second',
  );

  // A heart-rate error opens the collapsed section so the message is visible.
  fireEvent.change(date, { target: { value: today } });
  await user.type(field('Workout time minutes'), '5');
  await user.click(within(dialog()).getByRole('button', { name: 'Show more fields' }));
  await user.type(field('Average heart rate bpm (optional)'), '20');
  await user.click(within(dialog()).getByRole('button', { name: 'Show more fields' }));
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));
  expect(within(dialog()).getByRole('button', { name: 'Show more fields' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(field('Average heart rate bpm (optional)')).toHaveAccessibleDescription(
    'Enter an average heart rate as a whole number from 30 to 250 bpm',
  );
  await user.clear(field('Average heart rate bpm (optional)'));
  await user.type(field('Average heart rate bpm (optional)'), '150');
  await user.type(field('Max heart rate bpm (optional)'), '140');
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));
  expect(field('Max heart rate bpm (optional)')).toHaveAccessibleDescription(
    'Max heart rate cannot be lower than average heart rate',
  );

  // Text that Number() would read but nobody types as a number ("1e3", "0x10") is a field
  // error, and the heart-rate cross check still shows while another field fails.
  await user.type(field('Distance km'), '1e3');
  await user.type(field('Calories kcal (optional)'), '0x10');
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));
  expect(field('Distance km')).toHaveAccessibleDescription('Enter the distance as a number');
  expect(field('Calories kcal (optional)')).toHaveAccessibleDescription(/as a number/);
  expect(field('Max heart rate bpm (optional)')).toHaveAccessibleDescription(
    'Max heart rate cannot be lower than average heart rate',
  );
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});

test('switching to and from swimming keeps the typed distance in m or km', async () => {
  const user = userEvent.setup();
  mount();
  await list();
  await user.click(screen.getByRole('button', { name: 'Add cardio record' }));
  const kind = within(dialog()).getByLabelText('Type');
  await user.type(field('Distance km'), '5');
  await user.selectOptions(kind, 'Swimming');
  expect(field('Distance m')).toHaveValue('5000');
  expect(within(dialog()).getByText('Distance m (optional)')).toBeInTheDocument();
  await user.clear(field('Distance m'));
  await user.type(field('Distance m'), '1500');
  await user.selectOptions(kind, 'Running');
  expect(field('Distance km')).toHaveValue('1.5');
  // Between two km kinds nothing changes.
  await user.selectOptions(kind, 'Walking');
  expect(field('Distance km')).toHaveValue('1.5');
  // A decimal km value becomes whole metres; empty and unreadable text stay as typed.
  await user.clear(field('Distance km'));
  await user.type(field('Distance km'), '5.5');
  await user.selectOptions(kind, 'Swimming');
  expect(field('Distance m')).toHaveValue('5500');
  await user.clear(field('Distance m'));
  await user.selectOptions(kind, 'Running');
  expect(field('Distance km')).toHaveValue('');
  await user.type(field('Distance km'), 'abc');
  await user.selectOptions(kind, 'Swimming');
  expect(field('Distance m')).toHaveValue('abc');
});

test('a thousands comma is never read as a decimal point', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: 'Add cardio record' }));
  await user.type(field('Workout time minutes'), '30');
  await user.selectOptions(within(dialog()).getByLabelText('Type'), 'Swimming');
  // "1,000" means one thousand metres here; it must not be saved as 1 m (0.001 km).
  await user.type(field('Distance m'), '1,000');
  await user.click(within(dialog()).getByRole('button', { name: 'Show more fields' }));
  await user.type(field('Calories kcal (optional)'), '1,000');
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));
  expect(field('Distance m')).toHaveAttribute('aria-invalid', 'true');
  expect(field('Calories kcal (optional)')).toHaveAccessibleDescription(/as a number/);
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});

test('a swimming distance must be whole metres', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(screen.getByRole('button', { name: 'Add cardio record' }));
  await user.selectOptions(within(dialog()).getByLabelText('Type'), 'Swimming');
  await user.type(field('Workout time minutes'), '30');
  await user.type(field('Distance m'), '1500.5');
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));
  expect(field('Distance m')).toHaveAccessibleDescription(
    'Enter a swimming distance as a whole number from 1 to 1,000,000 m',
  );
  expect(requests.some((r) => r.method === 'POST')).toBe(false);
});

test('editing a swim session shows metres and keeps its link to another day', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(
    screen.getByRole('button', { name: 'Edit cardio record 2026-11-06 Swimming 40:00' }),
  );
  expect(field('Distance m')).toHaveValue('1500');
  const link = within(dialog()).getByLabelText('Strength journal to link');
  expect(link).toHaveValue('8');
  expect(dialog()).toHaveTextContent(
    'Linked to the strength journal for another date (2026-11-07).',
  );
  expect(dialog()).not.toHaveTextContent('There is no strength journal to link on this date.');
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const put = requests.find((r) => r.method === 'PUT')!;
  expect(put.path).toBe('/api/cardio-sessions/2');
  expect(put.body).toMatchObject({ kind: 'swimming', distance_km: 1.5, workout_id: 8 });
});

test('two sessions of one kind on one day get distinct button names', async () => {
  const twin = (id: number, extra: Partial<CardioSession>): CardioSession => ({
    ...base,
    id,
    date: '2026-11-07',
    kind: 'running',
    duration_sec: 1830,
    distance_km: null,
    pace_sec_per_km: null,
    speed_kmh: null,
    ...extra,
  });
  mount((request) =>
    request.method === 'GET'
      ? [twin(1, { start_time: '07:30' }), twin(2, { start_time: '19:00' }), twin(3, {})]
      : undefined,
  );
  await list();
  for (const name of [
    'Edit cardio record 2026-11-07 07:30 Running',
    'Edit cardio record 2026-11-07 19:00 Running',
    'Edit cardio record 2026-11-07 Running 30:30',
    'Delete cardio record 2026-11-07 Running 30:30',
  ])
    expect(screen.getByRole('button', { name })).toBeInTheDocument();
});

test('editing an imported session PUTs the whole record with its source and external id', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  await user.click(
    screen.getByRole('button', { name: 'Edit cardio record 2026-11-07 07:30 Running' }),
  );
  expect(screen.getByRole('heading', { name: 'Edit cardio record' })).toBeInTheDocument();
  // The stored values are filled in; extra values open the more section.
  expect(field('Workout time hours')).toHaveValue('');
  expect(field('Workout time minutes')).toHaveValue('30');
  expect(field('Workout time seconds')).toHaveValue('30');
  expect(field('Distance km')).toHaveValue('5.02');
  expect(within(dialog()).getByRole('button', { name: 'Show more fields' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(within(dialog()).getByRole('button', { name: 'Medium' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await user.clear(field('Workout time seconds'));
  await user.type(field('Workout time seconds'), '0');
  // Pressing the chosen effort again clears it.
  await user.click(within(dialog()).getByRole('button', { name: 'Medium' }));
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const put = requests.find((r) => r.method === 'PUT')!;
  expect(put.path).toBe('/api/cardio-sessions/1');
  expect(put.body).toEqual({
    date: '2026-11-07',
    kind: 'running',
    duration_sec: 1800,
    distance_km: 5.02,
    avg_heart_rate: 150,
    max_heart_rate: null,
    calories_kcal: null,
    elevation_gain_m: null,
    avg_cadence: null,
    effort: null,
    start_time: '07:30',
    workout_id: null,
    memo: 'Han River',
    source: 'garmin',
    external_id: 'garmin-1',
  });
});

test('a server refusal such as a 409 duplicate stays in the open form', async () => {
  const user = userEvent.setup();
  const { requests } = mount((request) =>
    request.method === 'PUT'
      ? json({ error: 'A cardio record with the same source and external ID already exists' }, 409)
      : undefined,
  );
  await list();
  await user.click(
    screen.getByRole('button', { name: 'Edit cardio record 2026-11-07 07:30 Running' }),
  );
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));
  expect(await within(dialog()).findByRole('alert')).toHaveTextContent(
    'A cardio record with the same source and external ID already exists',
  );
  expect(field('Workout time minutes')).toHaveValue('30');
  expect(within(dialog()).getByRole('button', { name: 'Save cardio record' })).toBeEnabled();
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(1);
});

test('deleting asks first, then removes and reloads; cancelling sends nothing', async () => {
  const user = userEvent.setup();
  const { requests } = mount();
  await list();
  const confirm = vi.mocked(window.confirm);
  confirm.mockReturnValueOnce(false);
  await user.click(
    screen.getByRole('button', { name: 'Delete cardio record 2026-11-06 Swimming 40:00' }),
  );
  expect(confirm).toHaveBeenLastCalledWith('Delete the 2026-11-06 Swimming 40:00 cardio record?');
  expect(requests.some((r) => r.method === 'DELETE')).toBe(false);

  await user.click(
    screen.getByRole('button', { name: 'Delete cardio record 2026-11-06 Swimming 40:00' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('Cardio record deleted');
  const removed = requests.find((r) => r.method === 'DELETE')!;
  expect(removed.path).toBe('/api/cardio-sessions/2');
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(2);
});

test('a failed delete shows its own error, keeps the row and does not reload', async () => {
  const user = userEvent.setup();
  const { requests } = mount((request) =>
    request.method === 'DELETE' ? json({ error: 'Could not delete' }, 500) : undefined,
  );
  await list();
  await user.click(
    screen.getByRole('button', { name: 'Delete cardio record 2026-11-06 Swimming 40:00' }),
  );
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Could not delete');
  // Not the load failure banner: there is nothing to reconnect.
  expect(within(alert).queryByRole('button', { name: 'Reconnect' })).toBeNull();
  expect(screen.queryByRole('status')).toBeNull();
  expect(
    screen.getByRole('button', { name: 'Delete cardio record 2026-11-06 Swimming 40:00' }),
  ).toBeInTheDocument();
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(1);
});

test('deleting a session already removed elsewhere (404) says so and reloads', async () => {
  const user = userEvent.setup();
  let gone = false;
  const { requests } = mount((request) => {
    if (request.method === 'DELETE') {
      gone = true;
      return json({ error: 'Cardio record not found' }, 404);
    }
    if (request.method === 'GET' && gone) return fixture().filter((s) => s.id !== 2);
    return undefined;
  });
  await list();
  await user.click(
    screen.getByRole('button', { name: 'Delete cardio record 2026-11-06 Swimming 40:00' }),
  );
  expect(await screen.findByRole('status')).toHaveTextContent('This record was already deleted');
  await waitFor(() =>
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(2),
  );
  expect(screen.queryByRole('alert')).toBeNull();
  expect(requests.filter((r) => r.method === 'GET')).toHaveLength(2);
});

test('a reload after saving keeps the list on screen until the answer arrives', async () => {
  const user = userEvent.setup();
  const reload = deferred<CardioSession[]>();
  let gets = 0;
  mount((request) => {
    if (request.method !== 'GET') return undefined;
    gets += 1;
    return gets === 1 ? fixture() : reload.promise;
  });
  await list();
  await user.click(
    screen.getByRole('button', { name: 'Edit cardio record 2026-11-07 07:30 Running' }),
  );
  await user.click(within(dialog()).getByRole('button', { name: 'Save cardio record' }));
  await waitFor(() => expect(gets).toBe(2));
  expect(screen.queryByText('Loading records…')).toBeNull();
  expect(screen.getByRole('list', { name: 'Cardio records' })).toBeInTheDocument();
  reload.resolve(fixture());
});

test('a new period clears the old rows and ignores a late answer for the old period', async () => {
  vi.stubGlobal(
    'confirm',
    vi.fn(() => true),
  );
  const old = deferred<CardioSession[]>();
  const fresh = deferred<CardioSession[]>();
  const { requests } = mockApi((request) =>
    request.url.searchParams.get('from') === '2026-10-26' ? old.promise : fresh.promise,
  );
  const { rerender } = render(
    <CardioPanel from="2026-10-26" to="2026-11-01" today={today} workouts={workouts} />,
  );
  expect(screen.getByText('Loading records…')).toBeInTheDocument();
  rerender(<CardioPanel from="2026-11-02" to={today} today={today} workouts={workouts} />);
  await waitFor(() => expect(requests).toHaveLength(2));
  fresh.resolve(fixture().slice(0, 1));
  expect(await list()).toBeInTheDocument();
  // The old period answers last: it must not replace the new period's list.
  old.resolve(fixture());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);

  // Switching again shows the loading line, not the previous period's rows.
  const next = deferred<CardioSession[]>();
  mockApi(() => next.promise);
  rerender(<CardioPanel from="2026-11-09" to="2026-11-15" today={today} workouts={workouts} />);
  expect(screen.getByText('Loading records…')).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Cardio records' })).toBeNull();
  next.resolve([]);
  expect(
    await screen.findByRole('heading', { name: 'No cardio records in the selected period' }),
  ).toBeInTheDocument();
});

test('without a pinned today the form uses the Seoul date, not the device date', async () => {
  // 00:30 on 2026-10-15 in Seoul is still 2026-10-14 on the UTC device clock.
  fixClock();
  mockApi(() => []);
  const user = userEvent.setup();
  render(<CardioPanel from="2026-10-13" to="2026-10-19" workouts={[]} />);
  await screen.findByRole('heading', { name: 'No cardio records in the selected period' });
  await user.click(screen.getByRole('button', { name: 'Add cardio record' }));
  const date = within(dialog()).getByLabelText('Date');
  expect(date).toHaveValue('2026-10-15');
  expect(date).toHaveAttribute('max', '2026-10-15');
});
