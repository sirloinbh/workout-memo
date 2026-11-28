import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';

import { App } from './app';
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

test('the page shows the notification and data sections', async () => {
  mount();
  expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  const main = within(screen.getByRole('main'));
  expect(main.queryByText('Rest timer')).toBeNull();
  expect(main.getByText('Notifications')).toBeInTheDocument();
  expect(main.getByRole('link', { name: 'Backup & Export' })).toHaveAttribute('href', '/backup');
  expect(main.getByRole('link', { name: 'Machine Library' })).toHaveAttribute('href', '/machines');
});

test('the dashboard no longer holds the weekly summary switch', async () => {
  mount();
  const user = userEvent.setup();
  await openPage('Dashboard', user);
  await waitFor(() => expect(window.location.pathname).toBe('/dashboard'));
  expect(screen.queryByRole('switch', { name: /weekly summary/i })).toBeNull();
});
