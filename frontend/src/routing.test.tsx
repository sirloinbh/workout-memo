import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { findLive, queryLive } from './test/live';
import { openPage } from './test/nav';

// #62: pages are URLs and journal data comes from TanStack Query.
function mount(path = '/dashboard', failWorkouts = false) {
  fixClock();
  window.history.replaceState(null, '', path);
  let fail = failWorkouts;
  const api = mockApi(({ url }) => {
    if (url.pathname === '/api/workouts' && fail)
      return json({ error: 'Storage connection failed' }, 500);
    if (url.pathname === '/api/routine-progress') return { today: '2026-10-15', routine: null };
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  return {
    user,
    api,
    recover: () => (fail = false),
    workoutLoads: () =>
      api.requests.filter(
        (r) =>
          r.method === 'GET' &&
          r.url.pathname === '/api/workouts' &&
          !r.url.searchParams.has('view'),
      ).length,
  };
}
const menu = () => screen.getByRole('navigation', { name: 'Main menu' });
const current = () =>
  within(menu())
    .getAllByRole('link')
    .find((link) => link.getAttribute('aria-current') === 'page')?.textContent;

test('a page opened by its URL shows that page and marks it in the menu', async () => {
  mount('/routines');
  expect(await screen.findByRole('button', { name: 'Create new routine' })).toBeInTheDocument();
  expect(current()).toBe('Routine Builder');
  expect(window.location.pathname).toBe('/routines');
});

test('an unknown address falls back to the day log (#504)', async () => {
  mount('/no-such-page');
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(current()).toBe('Day log');
});

test('the old journal address redirects to the day log and keeps its query (#504)', async () => {
  mount('/journal?from=2026-10-01&to=2026-10-10');
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(window.location.search).toBe('?from=2026-10-01&to=2026-10-10');
});

test('menu links change the URL and browser back returns to the previous page', async () => {
  const ui = mount();
  await openPage('My Goals', ui.user);
  expect(window.location.pathname).toBe('/goals');
  await openPage('Dashboard', ui.user);
  expect(window.location.pathname).toBe('/dashboard');
  act(() => window.history.back());
  await waitFor(() => expect(window.location.pathname).toBe('/goals'));
  await waitFor(() => expect(current()).toBe('My Goals'));
});

test('switching pages reuses the loaded period instead of fetching it again', async () => {
  const ui = mount();
  await waitFor(() => expect(ui.workoutLoads()).toBe(1));
  await openPage('My Goals', ui.user);
  await openPage('My Goals', ui.user);
  await openPage('Dashboard', ui.user);
  expect(ui.workoutLoads()).toBe(1);
});

test('a failed load is reported and Reconnect reloads the selected period', async () => {
  const ui = mount('/', true);
  const alert = await findLive('alert');
  expect(alert).toHaveTextContent('Storage connection failed');
  ui.recover();
  await ui.user.click(within(alert).getByRole('button', { name: 'Reconnect' }));
  await waitFor(() => expect(queryLive('alert')).toBeNull());
  expect(ui.workoutLoads()).toBe(2);
});

test('the app opens on the day log; the menu has no Week or 12 weeks item (#535)', async () => {
  const ui = mount('/');
  expect(current()).toBe('Day log');
  expect(await screen.findByRole('radio', { name: '1 day' })).toBeChecked();
  const labels = within(menu())
    .getAllByRole('link')
    .map((link) => link.textContent);
  expect(labels).not.toContain('Week');
  expect(labels).not.toContain('12 weeks');
  await openPage('Dashboard', ui.user);
  expect(window.location.pathname).toBe('/dashboard');
  expect(screen.getByRole('radio', { name: '1 week' })).toBeChecked();
});

test('the old Week and 12-week addresses open the dashboard on that period (#535)', async () => {
  mount('/week');
  expect(await screen.findByRole('radio', { name: '1 week' })).toBeChecked();
  expect(window.location.pathname).toBe('/dashboard');
});

test('the old 12-week address opens the dashboard on 12 weeks (#535)', async () => {
  mount('/12-weeks');
  expect(await screen.findByRole('radio', { name: '12 weeks' })).toBeChecked();
  expect(window.location.pathname).toBe('/dashboard');
});

test('Settings is the last menu item; Backup & Export and Machine Library are reached from it (#508)', async () => {
  const ui = mount();
  const labels = within(menu())
    .getAllByRole('link')
    .map((link) => link.textContent);
  expect(labels.at(-1)).toBe('Settings');
  expect(labels).not.toContain('Backup & Export');
  expect(labels).not.toContain('Machine Library');
  await openPage('Settings', ui.user);
  expect(window.location.pathname).toBe('/settings');
  await ui.user.click(screen.getByRole('link', { name: 'Machine Library' }));
  await waitFor(() => expect(window.location.pathname).toBe('/machines'));
});

test('the old Backup and Machine Library addresses still open their pages (#508)', async () => {
  mount('/backup');
  expect(await screen.findByRole('heading', { name: 'Backup & Export' })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/backup');
});
