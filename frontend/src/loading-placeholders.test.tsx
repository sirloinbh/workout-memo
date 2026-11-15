import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { deferred, fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

// #173: while a page's first load is pending it shows placeholders in a busy region and keeps
// the loading line for screen readers only; once the data arrives both go away.
const cases = [
  {
    page: 'Exercise Analysis',
    api: '/api/analysis',
    slot: 'skeleton-card',
    text: 'Loading analysis…',
  },
  {
    page: 'Body records',
    api: '/api/body-measurements',
    slot: 'skeleton-list',
    text: 'Loading records…',
  },
  {
    page: 'Routine Builder',
    api: '/api/routines',
    slot: 'skeleton-list',
    text: 'Loading routines…',
  },
  {
    page: 'Workout journal',
    api: '/api/workouts',
    slot: 'skeleton-list',
    text: 'Loading records…',
  },
  {
    page: 'Workout journal',
    api: '/api/routine-progress',
    slot: 'skeleton-text',
    text: 'Loading routine goals…',
  },
];

test.each(cases)(
  '$page shows placeholders while it first loads',
  async ({ page, api, slot, text }) => {
    fixClock();
    const pending = deferred();
    mockApi(async ({ url }) => {
      if (url.pathname === api) await pending.promise;
      if (url.pathname === '/api/analysis')
        return { exercises: [], weeks: [], today: '2026-10-15' };
      return [];
    });
    const user = userEvent.setup();
    render(<App />);
    await openPage(page, user);

    const busy = await waitFor(() => {
      const region = document.querySelector(`[aria-busy="true"]:has([data-slot="${slot}"])`);
      expect(region).not.toBeNull();
      return region!;
    });
    // The busy region is named (project-standards docs/ui-components.md "Loading screens").
    expect(busy.getAttribute('aria-label')).toBeTruthy();
    expect(screen.getByText(text)).toHaveClass('sr-only');
    // The placeholders are decoration; assistive tech hears only the status line.
    for (const el of busy.querySelectorAll('[data-slot="skeleton"]'))
      expect(el).toHaveAttribute('aria-hidden', 'true');

    pending.resolve();
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    expect(screen.queryByText(text)).toBeNull();
  },
);

// #173: a save that is waiting shows a small spinner on its disabled button.
test('the body record save button shows a spinner while it saves', async () => {
  fixClock();
  const saved = deferred();
  mockApi(async ({ method, url }) => {
    if (url.pathname === '/api/body-measurements' && method === 'POST') {
      await saved.promise;
      return { id: 1, date: '2026-10-15' };
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await openPage('Body records', user);
  await user.click(await screen.findByRole('button', { name: 'Add body record' }));
  await user.type(screen.getByLabelText(/^Weight/), '70');
  await user.click(screen.getByRole('button', { name: 'Save body record' }));

  const saving = await screen.findByRole('button', { name: 'Saving…' });
  expect(saving).toBeDisabled();
  expect(saving.querySelector('[data-slot="spinner"]')).toHaveAttribute('aria-hidden', 'true');
  saved.resolve();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving…' })).toBeNull());
});

// #173: the journal editor's save button and its status line show a spinner while saving.
test('the journal save button and status line show a spinner while it saves', async () => {
  fixClock();
  const saved = deferred();
  mockApi(async ({ method, url }) => {
    if (url.pathname === '/api/workouts' && method === 'POST') {
      await saved.promise;
      return { id: 42, version: 1 };
    }
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  fireEvent.change(document.querySelector('input[maxlength="120"]')!, {
    target: { value: 'Lower body' },
  });
  for (const name of document.querySelectorAll('input[role="combobox"][id$="-exercise"]'))
    fireEvent.change(name, { target: { value: 'Squat' } });
  fireEvent.submit(document.querySelector('form')!);

  const saving = await screen.findByRole('button', { name: 'Saving…' });
  expect(saving).toBeDisabled();
  expect(saving.querySelector('[data-slot="spinner"]')).toHaveAttribute('aria-hidden', 'true');
  const line = screen.getAllByText('Saving…').find((el) => el.dataset.slot === 'notice')!;
  expect(line).toHaveAttribute('role', 'status');
  expect(line.parentElement!.querySelector('[data-slot="spinner"]')).toHaveAttribute(
    'aria-hidden',
    'true',
  );
  saved.resolve();
  await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
  expect(document.querySelector('[data-slot="spinner"]')).toBeNull();
});
