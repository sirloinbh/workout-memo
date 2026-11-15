import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { deferred, json, mockApi } from '../test/api';
import type { CardioRecords as Records, CardioSession } from './api';
import { CardioRecords } from './cardio-records';
import { CardioStats } from './cardio-stats';

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
  pace_sec_per_km: null,
  speed_kmh: null,
} as const;
let id = 0;
const session = (
  date: string,
  kind: CardioSession['kind'],
  duration_sec: number,
  distance_km: number | null,
): CardioSession => ({ ...base, id: ++id, date, kind, duration_sec, distance_km });

// 11/2 is a Monday and 11/8 a Sunday; 11/9 starts the next week.
const sessions = [
  session('2026-11-09', 'running', 1500, 5),
  session('2026-11-08', 'swimming', 2400, 1.5),
  session('2026-11-08', 'running', 600, null),
  session('2026-11-03', 'running', 1830, 5.02),
];
const noRecords: Records = { longest: [], best5k: null, best10k: null };

function renderStats(list = sessions, records: Records | Response = noRecords) {
  const api = mockApi(() => records);
  render(<CardioStats from="2026-11-02" to="2026-11-15" sessions={list} />);
  return api;
}
const chart = (name: RegExp) =>
  screen.getAllByRole('img').find((el) => name.test(el.getAttribute('aria-label') ?? ''))!;

test('weekly totals split on the Monday boundary, for all kinds and per kind', async () => {
  renderStats();
  const totals = screen.getByLabelText('Period total');
  // 11.52 km: swimming's 1.5 km counts in km here; the session without distance adds nothing.
  expect(within(totals).getByText('11.52 km')).toBeInTheDocument();
  expect(within(totals).getByText('1:45:30')).toBeInTheDocument();
  expect(within(totals).getByText('4 sessions')).toBeInTheDocument();

  expect(chart(/^Total weekly distance/)).toHaveAttribute(
    'aria-label',
    'Total weekly distance: week of 11/2 6.52 km, week of 11/9 5 km',
  );
  // Per kind: swimming stays in metres.
  expect(chart(/^Running weekly distance/)).toHaveAttribute(
    'aria-label',
    'Running weekly distance: week of 11/2 5.02 km, week of 11/9 5 km',
  );
  expect(chart(/^Swimming weekly distance/)).toHaveAttribute(
    'aria-label',
    'Swimming weekly distance: week of 11/2 1,500 m, week of 11/9 0 m',
  );

  await userEvent.click(screen.getByRole('radio', { name: 'Sessions' }));
  expect(chart(/^Total weekly sessions/)).toHaveAttribute(
    'aria-label',
    'Total weekly sessions: week of 11/2 3 sessions, week of 11/9 1 session',
  );
  await userEvent.click(screen.getByRole('radio', { name: 'Time' }));
  expect(chart(/^Running weekly time/)).toHaveAttribute(
    'aria-label',
    'Running weekly time: week of 11/2 40:30, week of 11/9 25:00',
  );
});

test('monthly view and the per-kind table', async () => {
  renderStats();
  await userEvent.click(screen.getByRole('radio', { name: 'Monthly' }));
  expect(chart(/^Total monthly distance/)).toHaveAttribute(
    'aria-label',
    'Total monthly distance: Nov 11.52 km',
  );

  const table = screen.getByRole('table', { name: 'Totals by type' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows.map((r) => r.textContent)).toEqual([
    'Running3 sessions1:05:3010.02 km',
    'Swimming1 session40:001,500 m',
  ]);
});

test('running pace trend skips sessions without distance', () => {
  renderStats();
  // 1830 s / 5.02 km = 6:05/km, 1500 s / 5 km = 5:00/km; the 600 s run has no distance.
  expect(chart(/^Running pace/)).toHaveAttribute(
    'aria-label',
    'Running pace trend (higher is faster): 2026-11-03 6:05/km, 2026-11-09 5:00/km',
  );
  expect(screen.getByText('Fastest 5:00/km')).toBeInTheDocument();
  // The SVG stretches with the width; the dots use a non-scaling stroke so they stay round (#263).
  const dots = chart(/^Running pace/).querySelectorAll('[data-slot="chart-dot"]');
  expect(dots).toHaveLength(2);
  expect(chart(/^Running pace/).querySelector('circle')).toBeNull();
  for (const dot of dots) expect(dot).toHaveClass('[vector-effect:non-scaling-stroke]');
});

test('one kind only: no per-kind charts; no running distance: a pace note instead of a chart', () => {
  renderStats([session('2026-11-04', 'indoor_cycling', 3600, null)]);
  expect(screen.queryByRole('heading', { name: /Weekly .+ by type/ })).not.toBeInTheDocument();
  expect(screen.getByText('No records with a distance')).toBeInTheDocument();
  expect(
    screen.getByText('No running records with a distance, so the pace cannot be calculated'),
  ).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Totals by type' })).toHaveTextContent('No distance');
});

test('an empty period shows the common EmptyState', async () => {
  renderStats([]);
  expect(
    screen.getByRole('heading', { name: 'No cardio records to summarize in the selected period' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: 'No personal records yet' }),
  ).toBeInTheDocument();
});

test('records: loaded from the records endpoint, swim distance in m, missing bests explained', async () => {
  const api = mockApi((): Records => ({
    longest: [
      { kind: 'running', id: 1, date: '2026-10-26', distance_km: 21.1, duration_sec: 7380 },
      { kind: 'swimming', id: 2, date: '2026-10-02', distance_km: 1.5, duration_sec: 2400 },
    ],
    best5k: { id: 3, date: '2026-11-02', distance_km: 5.02, duration_sec: 1470 },
    best10k: null,
  }));
  render(<CardioRecords />);
  const list = await screen.findByRole('list', { name: 'Personal records' });
  expect(api.requests.map((r) => r.path)).toEqual(['/api/cardio-sessions/records']);
  const items = within(list).getAllByRole('listitem');
  expect(items.map((i) => i.textContent)).toEqual([
    '5 km best24:305.02 km · 4:53/km · 12.3 km/h · 2026-11-02',
    '10 km best9.8~10.2 km No running records',
    'Longest running distance21.1 km2:03:00 · 2026-10-26',
    'Longest swimming distance1,500 m40:00 · 2026-10-02',
  ]);
});

test('records: a failed load shows an alert with Reconnect and retries', async () => {
  let fail = true;
  mockApi(() => (fail ? json({ error: 'Cannot connect to the server' }, 500) : noRecords));
  render(<CardioRecords />);
  expect(await screen.findByRole('alert')).toHaveTextContent('Cannot connect to the server');
  fail = false;
  await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
  expect(
    await screen.findByRole('heading', { name: 'No personal records yet' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('sessions outside the period never count, in totals or per kind', () => {
  // A wider list than the period (e.g. a stale one): 10/30 must not reach any figure.
  renderStats([...sessions, session('2026-10-30', 'rowing', 3600, 10)]);
  const totals = screen.getByLabelText('Period total');
  expect(within(totals).getByText('11.52 km')).toBeInTheDocument();
  expect(within(totals).getByText('4 sessions')).toBeInTheDocument();
  expect(screen.queryByText('Rowing')).toBeNull();
});

test('a new period starts again from its default unit; a chosen unit holds within a period', async () => {
  const user = userEvent.setup();
  mockApi(() => noRecords);
  const { rerender } = render(
    <CardioStats from="2026-11-02" to="2026-11-15" sessions={sessions} />,
  );
  expect(chart(/^Total weekly distance/)).toBeInTheDocument();
  await user.click(screen.getByRole('radio', { name: 'Monthly' }));
  expect(chart(/^Total monthly distance/)).toBeInTheDocument();
  // Same period again: the choice stays.
  rerender(<CardioStats from="2026-11-02" to="2026-11-15" sessions={sessions} />);
  expect(chart(/^Total monthly distance/)).toBeInTheDocument();
  // A short new period goes back to weekly; a year-long one starts monthly.
  rerender(<CardioStats from="2026-11-09" to="2026-11-15" sessions={sessions} />);
  expect(chart(/^Total weekly distance/)).toBeInTheDocument();
  rerender(<CardioStats from="2025-11-16" to="2026-11-15" sessions={sessions} />);
  expect(chart(/^Total monthly distance/)).toBeInTheDocument();
});

// #173: the first load shows placeholders in named busy regions; the status line stays for
// screen readers only, and both go away once the data arrives.
test('stats and records show placeholders while they first load', async () => {
  const records = deferred<Records>();
  mockApi(() => records.promise);
  const { rerender } = render(
    <CardioStats from="2026-11-02" to="2026-11-15" sessions={[]} pending />,
  );
  const stats = screen.getByRole('generic', { name: 'Cardio stats', busy: true });
  expect(stats.querySelector('[data-slot="skeleton-card"]')).not.toBeNull();
  expect(screen.getByText('Loading stats…')).toHaveClass('sr-only');
  const list = screen.getByRole('generic', { name: 'Personal records', busy: true });
  expect(list.querySelector('[data-slot="skeleton-list"]')).not.toBeNull();
  expect(within(list).getByText('Loading records…')).toHaveClass('sr-only');

  rerender(<CardioStats from="2026-11-02" to="2026-11-15" sessions={sessions} />);
  records.resolve(noRecords);
  await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
});
