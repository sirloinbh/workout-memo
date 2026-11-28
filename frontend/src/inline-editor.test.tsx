import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';

import { App } from './app';
import { fixClock, mockApi } from './test/api';

// #530: the workout editor opens on the page, not in a dialog.
beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

async function open() {
  fixClock();
  mockApi(() => []);
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  const trigger = screen.getAllByRole('button', { name: 'Log workout' })[0];
  await user.click(trigger);
  return { user, trigger };
}

test('opening the editor adds a page section, not a dialog, and focuses its heading', async () => {
  await open();
  const editor = screen.getByRole('region', { name: 'New workout record' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(editor.querySelector('form')).not.toBeNull();
  expect(screen.getByRole('heading', { name: 'New workout record' })).toHaveFocus();
});

test('the close button closes the editor and keeps focus on the page', async () => {
  const { user } = await open();
  await user.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('region', { name: 'New workout record' })).toBeNull();
  expect(screen.getByRole('main')).toHaveFocus();
});

test('Escape closes the editor', async () => {
  const { user } = await open();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('region', { name: 'New workout record' })).toBeNull();
  expect(screen.getByRole('main')).toHaveFocus();
});
