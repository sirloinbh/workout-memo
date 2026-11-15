import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { type ApiRequest, json, mockApi } from '../test/api';
import type { CardioSession } from './api';
import { CardioPanel } from './cardio-panel';
import broken from './fixtures/broken.tcx?raw';
import ride from './fixtures/garmin-ride.gpx?raw';
import run from './fixtures/garmin-run.tcx?raw';

// #119: the activity file import inside the cardio panel.
const today = '2026-11-08';
const stored = (session: Partial<CardioSession>): CardioSession => ({
  id: 1,
  date: '2026-11-02',
  start_time: null,
  kind: 'running',
  duration_sec: 1200,
  distance_km: 4,
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
  pace_sec_per_km: 300,
  speed_kmh: 12,
  ...session,
});
const files = () => [
  new File([run], 'run.tcx', { type: 'application/xml' }),
  new File([ride], 'ride.gpx', { type: 'application/gpx+xml' }),
  new File([broken], 'broken.tcx'),
];

function setup(existing: CardioSession[], answer?: (request: ApiRequest) => unknown) {
  const api = mockApi((request) => {
    if (request.method === 'POST' && request.url.pathname === '/api/cardio-sessions/import')
      return answer?.(request) ?? json({ sessions: [{ id: 9 }, { id: 10 }] }, 201);
    // The panel's period (from 11-01) is empty; the import's duplicate range gets `existing`.
    return request.url.searchParams.get('to') === '2026-11-08' ? [] : existing;
  });
  render(<CardioPanel from="2026-11-01" to="2026-11-08" today={today} workouts={[]} />);
  return api;
}
async function choose(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Import file' }));
  const card = screen.getByRole('region', { name: 'Import activity file' });
  await user.upload(within(card).getByLabelText('Activity file (TCX/GPX)'), files());
  await within(card).findByRole('region', { name: 'Import preview' });
  return card;
}
const imports = (requests: ApiRequest[]) =>
  requests.filter((r) => r.url.pathname === '/api/cardio-sessions/import');

test('previews the files in start order, names an unreadable one and leaves a look-alike unchecked', async () => {
  const user = userEvent.setup();
  // Typed by hand the same morning: 4.0 km against the file's 4.006 km, no start time.
  const api = setup([stored({})]);
  const card = await choose(user);
  expect(within(card).getByText(/broken\.tcx: Could not read the file/)).toBeInTheDocument();
  expect(within(card).getByText(/GPX files do not record pauses/)).toBeInTheDocument();

  const first = within(card).getByRole('checkbox', { name: 'Save row 1' });
  expect(first).not.toBeChecked();
  expect(first).toBeEnabled();
  expect(
    within(card).getByText('Possible duplicate: existing record 2026-11-02 Running 20:00'),
  ).toBeInTheDocument();
  expect(within(card).getByRole('checkbox', { name: 'Save row 2' })).toBeChecked();
  expect(within(card).getByLabelText('Row 1 date')).toHaveValue('2026-11-02');
  expect(within(card).getByLabelText('Row 1 start time')).toHaveValue('07:10');
  expect(within(card).getByLabelText('Row 2 type')).toHaveValue('outdoor_cycling');
  expect(within(card).getByText('20:10 · 4.006 km · Avg heart rate 145')).toBeInTheDocument();
  // The duplicate check read a day around the files' dates.
  expect(
    api.requests.some(
      (r) =>
        r.url.searchParams.get('from') === '2026-11-01' &&
        r.url.searchParams.get('to') === '2026-11-05',
    ),
  ).toBe(true);

  // Only the checked ride is sent.
  await user.click(within(card).getByRole('button', { name: 'Save 1 selected' }));
  await waitFor(() => expect(imports(api.requests)).toHaveLength(1));
  expect(imports(api.requests)[0].body).toEqual({
    sessions: [
      expect.objectContaining({
        kind: 'outdoor_cycling',
        date: '2026-11-04',
        start_time: '06:30',
        duration_sec: 150,
        distance_km: 0.334,
        source: 'file',
        external_id: '2026-11-03T21:30:00Z',
      }),
    ],
  });
});

test('an activity imported before cannot be checked', async () => {
  const user = userEvent.setup();
  setup([stored({ source: 'file', external_id: '2026-11-01T22:10:05Z', start_time: '07:10' })]);
  const card = await choose(user);
  expect(within(card).getByRole('checkbox', { name: 'Save row 1' })).toBeDisabled();
  expect(within(card).getByText('Already imported (2026-11-02 07:10 Running)')).toBeInTheDocument();
});

test('edits a row in the form without saving it, then saves the edited values', async () => {
  const user = userEvent.setup();
  const api = setup([]);
  const card = await choose(user);
  await user.selectOptions(within(card).getByLabelText('Row 2 type'), 'indoor_cycling');
  await user.click(within(card).getByRole('button', { name: 'Edit row 1' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit imported record' });
  const memo = within(dialog).getByLabelText('Memo (optional)');
  expect(memo).toHaveValue('Morning Han River');
  await user.clear(memo);
  await user.type(memo, 'Race');
  await user.click(within(dialog).getByRole('button', { name: 'Apply to preview' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  // The form sent nothing on its own.
  expect(api.requests.filter((r) => r.method !== 'GET')).toHaveLength(0);

  await user.click(within(card).getByRole('button', { name: 'Save 2 selected' }));
  await waitFor(() => expect(imports(api.requests)).toHaveLength(1));
  const sent = (imports(api.requests)[0].body as { sessions: { memo: string; kind: string }[] })
    .sessions;
  expect(sent.map((s) => [s.kind, s.memo])).toEqual([
    ['running', 'Race'],
    ['indoor_cycling', ''],
  ]);
  expect(await screen.findByText('Imported 2 cardio records')).toBeInTheDocument();
});

test('of two files with the same id, either can be chosen, but not both', async () => {
  const user = userEvent.setup();
  mockApi(() => []);
  render(<CardioPanel from="2026-11-01" to="2026-11-08" today={today} workouts={[]} />);
  await user.click(await screen.findByRole('button', { name: 'Import file' }));
  const card = screen.getByRole('region', { name: 'Import activity file' });
  // The card opens on its file chooser.
  expect(within(card).getByLabelText('Activity file (TCX/GPX)')).toHaveFocus();
  // The same run as GPX, starting at the same second.
  const gpx = `<gpx><trk><type>running</type><trkseg>
    <trkpt lat="37.5" lon="127"><time>2026-11-01T22:10:05Z</time></trkpt>
    <trkpt lat="37.53" lon="127"><time>2026-11-01T22:31:05Z</time></trkpt></trkseg></trk></gpx>`;
  await user.upload(within(card).getByLabelText('Activity file (TCX/GPX)'), [
    new File([gpx], 'run.gpx'),
    new File([run], 'run.tcx'),
  ]);
  await within(card).findByRole('region', { name: 'Import preview' });
  const first = within(card).getByRole('checkbox', { name: 'Save row 1' });
  const second = within(card).getByRole('checkbox', { name: 'Save row 2' });
  expect(first).toBeChecked();
  expect(second).toBeDisabled();
  expect(within(card).getByText(/Same activity as row 1/)).toBeInTheDocument();

  // Clearing the GPX row lets the TCX row (timer time, pauses left out) be chosen instead.
  await user.click(first);
  expect(second).toBeEnabled();
  expect(second).not.toBeChecked();
  await user.click(second);
  expect(second).toBeChecked();
  expect(within(card).getByRole('button', { name: 'Save 1 selected' })).toBeEnabled();

  // Closing returns focus to the button that opened the card.
  await user.click(within(card).getByRole('button', { name: 'Close' }));
  expect(screen.getByRole('button', { name: 'Import file' })).toHaveFocus();
});

test('fixing an earlier twin does not take over the row the user chose', async () => {
  const user = userEvent.setup();
  mockApi(() => []);
  render(<CardioPanel from="2026-11-01" to="2026-11-08" today={today} workouts={[]} />);
  await user.click(await screen.findByRole('button', { name: 'Import file' }));
  const card = screen.getByRole('region', { name: 'Import activity file' });
  // A GPX of the same run with one point: no duration, so the row is invalid at first.
  const gpx = `<gpx><trk><type>running</type><trkseg>
    <trkpt lat="37.5" lon="127"><time>2026-11-01T22:10:05Z</time></trkpt></trkseg></trk></gpx>`;
  await user.upload(within(card).getByLabelText('Activity file (TCX/GPX)'), [
    new File([gpx], 'run.gpx'),
    new File([run], 'run.tcx'),
  ]);
  await within(card).findByRole('region', { name: 'Import preview' });
  const first = within(card).getByRole('checkbox', { name: 'Save row 1' });
  const second = within(card).getByRole('checkbox', { name: 'Save row 2' });
  expect(first).toBeDisabled();
  // The TCX row is a look-alike of the GPX row, so it starts unchecked; the user chooses it.
  expect(second).not.toBeChecked();
  await user.click(second);
  expect(second).toBeChecked();

  // Fixing the GPX row makes it savable, but it is not chosen over the user's choice.
  await user.click(within(card).getByRole('button', { name: 'Edit row 1' }));
  const dialog = await screen.findByRole('dialog', { name: 'Edit imported record' });
  await user.type(within(dialog).getByRole('textbox', { name: 'Workout time minutes' }), '20');
  await user.click(within(dialog).getByRole('button', { name: 'Apply to preview' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(first).toBeEnabled();
  expect(first).not.toBeChecked();
  expect(second).toBeChecked();
});

test('a 409 reads the stored sessions again, so the row turns into "already imported"', async () => {
  const user = userEvent.setup();
  // Imported meanwhile in another tab: the range answers it only after the refused save.
  let savedElsewhere = false;
  mockApi((request) => {
    if (request.method === 'POST')
      return json(
        {
          error: '1 record has a problem, so nothing was saved',
          rows: [{ index: 0, message: 'This activity was already imported' }],
        },
        409,
      );
    if (request.url.searchParams.get('to') === '2026-11-08' || !savedElsewhere) return [];
    return [stored({ source: 'file', external_id: '2026-11-01T22:10:05Z', start_time: '07:10' })];
  });
  render(<CardioPanel from="2026-11-01" to="2026-11-08" today={today} workouts={[]} />);
  const card = await choose(user);
  savedElsewhere = true;
  await user.click(within(card).getByRole('button', { name: 'Save 2 selected' }));
  // The row keeps the server's reason and can no longer be chosen; the other row still can.
  await waitFor(() =>
    expect(within(card).getByRole('checkbox', { name: 'Save row 1' })).toBeDisabled(),
  );
  expect(within(card).getByText('This activity was already imported')).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Save 1 selected' })).toBeEnabled();
});

test('a refused import keeps every row and shows the reason on the refused one', async () => {
  const user = userEvent.setup();
  const api = setup([], () =>
    json(
      {
        error: '1 record has a problem, so nothing was saved',
        rows: [{ index: 1, message: 'This activity was already imported' }],
      },
      409,
    ),
  );
  const card = await choose(user);
  await user.click(within(card).getByRole('button', { name: 'Save 2 selected' }));
  expect(
    await within(card).findByText(/nothing was saved\. See the Check column/),
  ).toBeInTheDocument();
  const rows = within(card).getAllByRole('row');
  expect(within(rows[2]).getByText('This activity was already imported')).toBeInTheDocument();
  expect(within(rows[1]).getByText('Ready to save')).toBeInTheDocument();
  expect(imports(api.requests)).toHaveLength(1);
});
