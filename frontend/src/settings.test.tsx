import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';

import { App } from './app';
import { restTimerKey } from './rest-timer';
import { fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

// #508: one page for every preference.
beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/settings');
});

function mount() {
  fixClock();
  mockApi(() => []);
  render(<App />);
}

test('the page shows the rest timer, notification and data sections', async () => {
  mount();
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  const main = within(screen.getByRole('main'));
  expect(main.getByText('Rest timer')).toBeInTheDocument();
  expect(main.getByRole('spinbutton', { name: 'Rest time (sec)' })).toBeInTheDocument();
  expect(main.getByRole('switch', { name: 'Auto-start when a set is done' })).toBeInTheDocument();
  expect(main.getByRole('spinbutton', { name: 'Lower body rest (sec)' })).toBeInTheDocument();
  expect(main.getByText('Notifications')).toBeInTheDocument();
  expect(main.getByRole('link', { name: 'Backup & Export' })).toHaveAttribute('href', '/backup');
  expect(main.getByRole('link', { name: 'Machine Library' })).toHaveAttribute('href', '/machines');
});

test('changing a rest setting is stored in this browser, as it was in the editor', async () => {
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('switch', { name: 'Auto-start when a set is done' }));
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(restTimerKey) ?? '{}')).toMatchObject({
      autoStart: true,
    }),
  );
});

test('the dashboard no longer holds the weekly summary switch', async () => {
  mount();
  const user = userEvent.setup();
  await openPage('Dashboard', user);
  await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  expect(screen.queryByRole('switch', { name: /weekly summary/i })).toBeNull();
});
