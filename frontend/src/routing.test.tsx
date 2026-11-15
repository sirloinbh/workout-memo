import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #62: pages are URLs and journal data comes from TanStack Query.
function mount(path = '/', failWorkouts = false) {
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
      api.requests.filter((r) => r.method === 'GET' && r.url.pathname === '/api/workouts').length,
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

test('an unknown address falls back to the dashboard', async () => {
  mount('/no-such-page');
  await waitFor(() => expect(window.location.pathname).toBe('/'));
  expect(current()).toBe('Dashboard');
});

test('menu links change the URL and browser back returns to the previous page', async () => {
  const ui = mount();
  await openPage('My Goals', ui.user);
  expect(window.location.pathname).toBe('/goals');
  await openPage('Machine Library', ui.user);
  expect(window.location.pathname).toBe('/machines');
  act(() => window.history.back());
  await waitFor(() => expect(window.location.pathname).toBe('/goals'));
  await waitFor(() => expect(current()).toBe('My Goals'));
});

test('switching pages reuses the loaded period instead of fetching it again', async () => {
  const ui = mount();
  await waitFor(() => expect(ui.workoutLoads()).toBe(1));
  await openPage('My Goals', ui.user);
  await openPage('Workout journal', ui.user);
  await openPage('Dashboard', ui.user);
  expect(ui.workoutLoads()).toBe(1);
});

test('a failed load is reported and Reconnect reloads the selected period', async () => {
  const ui = mount('/', true);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('Storage connection failed');
  ui.recover();
  await ui.user.click(within(alert).getByRole('button', { name: 'Reconnect' }));
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(ui.workoutLoads()).toBe(2);
});
