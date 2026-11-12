import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from '../app';
import { fixClock, json, mockApi } from '../test/api';
import { openPage } from '../test/nav';
import type { CardioRecords, CardioSession } from './api';

// #115 PR ③: the journal's Strength/Cardio tab and the dashboard's cardio card, in the whole app.
// The fixed clock is 2026-10-15 (Thursday) in Seoul, so the default week is 10/12..10/18.
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
const running = (id: number, date: string, duration_sec: number, distance_km: number) => ({
  ...base,
  id,
  date,
  kind: 'running' as const,
  duration_sec,
  distance_km,
  pace_sec_per_km: duration_sec / distance_km,
  speed_kmh: distance_km / (duration_sec / 3600),
});

function mount(path: string, initial: CardioSession[] = [], options: { failList?: boolean } = {}) {
  fixClock();
  window.history.replaceState(null, '', path);
  let sessions = structuredClone(initial);
  const api = mockApi(({ method, url, body }) => {
    if (url.pathname === '/api/routine-progress') return { today: '2026-10-15', routine: null };
    if (url.pathname === '/api/cardio-sessions/records') {
      const longest = [...sessions]
        .sort((a, b) => b.distance_km! - a.distance_km!)
        .slice(0, 1)
        .map(({ id, date, kind, distance_km, duration_sec }) => ({
          id,
          date,
          kind,
          distance_km: distance_km!,
          duration_sec,
        }));
      const records: CardioRecords = { longest, best5k: null, best10k: null };
      return records;
    }
    if (url.pathname === '/api/cardio-sessions' && method === 'POST') {
      const created: CardioSession = { ...running(sessions.length + 100, '', 0, 1) };
      Object.assign(created, body);
      sessions = [created, ...sessions];
      return json(created, 201);
    }
    if (url.pathname === '/api/cardio-sessions' && options.failList)
      return json({ error: 'Could not load cardio records' }, 500);
    if (url.pathname === '/api/cardio-sessions') {
      const from = url.searchParams.get('from')!;
      const to = url.searchParams.get('to')!;
      return sessions.filter((s) => s.date >= from && s.date <= to);
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  const gets = (path: string) =>
    api.requests.filter((r) => r.method === 'GET' && r.url.pathname === path);
  return { user, api, gets };
}
const kinds = () => screen.getByRole('radiogroup', { name: 'Record type' });
const kind = (name: string) => within(kinds()).getByRole('radio', { name });
const statCard = (label: string) =>
  screen
    .queryAllByText(
      (_, el) => el?.getAttribute('data-slot') === 'stat' && el.textContent.startsWith(label),
    )
    .at(0);

test('the journal opens on Strength and Cardio is kept in the address with back and forward', async () => {
  const ui = mount('/journal');
  expect(kind('Strength')).toHaveAttribute('aria-checked', 'true');
  expect(window.location.search).toBe('');
  expect(screen.getByRole('button', { name: 'Log workout' })).toBeInTheDocument();
  expect(await screen.findByRole('heading', { name: /Workout records/ })).toBeInTheDocument();

  await ui.user.click(kind('Cardio'));
  expect(window.location.search).toBe('?tab=cardio');
  expect(
    await screen.findByRole('heading', { name: 'No cardio records in the selected period' }),
  ).toBeInTheDocument();
  // The panel's own button is the page's main action; the strength list and cards are gone.
  expect(screen.getByRole('button', { name: 'Add cardio record' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Log workout' })).toBeNull();
  expect(statCard('Total volume')).toBeUndefined();
  expect(screen.getByRole('region', { name: 'Cardio stats' })).toBeInTheDocument();
  expect(ui.gets('/api/cardio-sessions').at(-1)!.url.search).toBe('?from=2026-10-12&to=2026-10-18');

  act(() => window.history.back());
  await waitFor(() => expect(kind('Strength')).toHaveAttribute('aria-checked', 'true'));
  expect(screen.queryByRole('region', { name: 'Cardio stats' })).toBeNull();
  act(() => window.history.forward());
  await waitFor(() => expect(kind('Cardio')).toHaveAttribute('aria-checked', 'true'));
  expect(window.location.search).toBe('?tab=cardio');
});

test('the cardio tab uses the journal period, and changing it keeps the tab', async () => {
  const ui = mount('/journal?tab=cardio&from=2026-10-01&to=2026-10-10', [
    running(1, '2026-10-05', 1800, 5),
    running(2, '2026-10-14', 1200, 3),
  ]);
  expect(kind('Cardio')).toHaveAttribute('aria-checked', 'true');
  const list = await screen.findByRole('list', { name: 'Cardio records' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(1);
  expect(list).toHaveTextContent('6:00/km');
  const stats = screen.getByRole('region', { name: 'Cardio stats' });
  expect(stats).toHaveTextContent('2026-10-01 ~ 2026-10-10');
  expect(within(stats).getByLabelText('Period total')).toHaveTextContent('5 km');
  expect(ui.gets('/api/cardio-sessions')[0].url.search).toBe('?from=2026-10-01&to=2026-10-10');

  // A preset clears the range from the address but keeps the tab.
  await ui.user.click(screen.getByRole('radio', { name: '1 week' }));
  await waitFor(() => expect(window.location.search).toBe('?tab=cardio'));
  await waitFor(() =>
    expect(within(screen.getByLabelText('Period total')).getByText('3 km')).toBeInTheDocument(),
  );
  expect(ui.gets('/api/cardio-sessions').at(-1)!.url.search).toBe('?from=2026-10-12&to=2026-10-18');

  // Other pages drop the journal's tab (the preset above already cleared the range).
  await openPage('Dashboard', ui.user);
  expect(window.location.search).toBe('');
});

test('saving a cardio record refreshes the statistics and the personal records', async () => {
  const ui = mount('/journal?tab=cardio');
  expect(
    await screen.findByRole('heading', {
      name: 'No cardio records to summarize in the selected period',
    }),
  ).toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: 'No personal records yet' }),
  ).toBeInTheDocument();
  expect(ui.gets('/api/cardio-sessions/records')).toHaveLength(1);

  await ui.user.click(screen.getByRole('button', { name: 'Add cardio record' }));
  const dialog = screen.getByRole('dialog');
  await ui.user.type(within(dialog).getByRole('textbox', { name: 'Workout time minutes' }), '30');
  await ui.user.type(within(dialog).getByRole('textbox', { name: 'Distance km' }), '5');
  await ui.user.click(within(dialog).getByRole('button', { name: 'Save cardio record' }));

  await waitFor(() =>
    expect(within(screen.getByLabelText('Period total')).getByText('5 km')).toBeInTheDocument(),
  );
  expect(within(screen.getByLabelText('Period total')).getByText('30:00')).toBeInTheDocument();
  expect(await screen.findByRole('list', { name: 'Personal records' })).toHaveTextContent(
    'Longest running distance',
  );
  expect(ui.gets('/api/cardio-sessions/records')).toHaveLength(2);
});

test('the dashboard shows one cardio card only when the period has a session', async () => {
  const ui = mount('/', [running(1, '2026-10-13', 1800, 5), running(2, '2026-10-14', 3725, 3.2)]);
  await waitFor(() => expect(statCard('Cardio')).toBeDefined());
  const card = statCard('Cardio')!;
  expect(card.querySelector('[data-slot=stat-value]')).toHaveTextContent('8.2km');
  expect(card).toHaveTextContent('2 sessions · 1:32:05');
  expect(ui.gets('/api/cardio-sessions')).toHaveLength(1);

  // The day alone (10/15) has none: the card goes away.
  await ui.user.click(screen.getByRole('radio', { name: '1 day' }));
  await waitFor(() => expect(ui.gets('/api/cardio-sessions').length).toBeGreaterThan(1));
  await waitFor(() => expect(statCard('Cardio')).toBeUndefined());
  // The journal does not ask for the dashboard summary.
  const before = ui.gets('/api/cardio-sessions').length;
  await openPage('Workout journal', ui.user);
  expect(ui.gets('/api/cardio-sessions')).toHaveLength(before);
});

test('a directly chosen range goes with the dashboard link, the journal tab does not', async () => {
  const ui = mount('/journal?tab=cardio&from=2026-10-01&to=2026-10-10');
  expect(await screen.findByRole('region', { name: 'Cardio stats' })).toBeInTheDocument();
  await openPage('Dashboard', ui.user);
  expect(window.location.search).toBe('?from=2026-10-01&to=2026-10-10');
});

test('a failed first load shows the panel alert, not a "no sessions" statistics screen', async () => {
  mount('/journal?tab=cardio', [], { failList: true });
  expect(await screen.findByText('Could not load cardio records')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Cardio stats' })).toBeNull();
  expect(
    screen.queryByRole('heading', {
      name: 'No cardio records to summarize in the selected period',
    }),
  ).toBeNull();
});

test('the dashboard card leads with the count when no session has a distance', async () => {
  mount('/', [
    {
      ...base,
      id: 1,
      date: '2026-10-14',
      kind: 'indoor_cycling',
      duration_sec: 2700,
      distance_km: null,
      pace_sec_per_km: null,
      speed_kmh: null,
    },
  ]);
  await waitFor(() => expect(statCard('Cardio')).toBeDefined());
  const card = statCard('Cardio')!;
  expect(card).toHaveTextContent('1 session');
  expect(card).toHaveTextContent('45:00 · No distance');
  expect(card).not.toHaveTextContent('0 km');
});

test('a period change keeps the statistics mounted: the chosen metric stays and records are not reloaded', async () => {
  const ui = mount('/journal?tab=cardio&from=2026-10-01&to=2026-10-10', [
    running(1, '2026-10-05', 1800, 5),
    running(2, '2026-10-14', 1200, 3),
  ]);
  const metric = async () =>
    within(await screen.findByRole('radiogroup', { name: 'Metric' })).getByRole('radio', {
      name: 'Time',
    });
  await ui.user.click(await metric());
  await waitFor(() => expect(ui.gets('/api/cardio-sessions/records')).toHaveLength(1));
  // Switch to the 1 week preset: the list reloads for 10/12..10/18.
  await ui.user.click(screen.getByRole('radio', { name: '1 week' }));
  await waitFor(() =>
    expect(within(screen.getByLabelText('Period total')).getByText('3 km')).toBeInTheDocument(),
  );
  expect(await metric()).toHaveAttribute('aria-checked', 'true');
  expect(ui.gets('/api/cardio-sessions/records')).toHaveLength(1);
});
