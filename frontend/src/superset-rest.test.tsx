import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';

import { App } from './app';
import { fixClock, mockApi } from './test/api';
import { enableAutoStart, openPage } from './test/nav';

// #481: in a superset the rest timer starts only after the last exercise of a round.
async function openEditor() {
  fixClock();
  mockApi(() => []);
  const user = userEvent.setup();
  render(<App />);
  await openPage('Day log', user);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await enableAutoStart(user); // #508: the setting lives on the Settings page
  await user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  return user;
}
const dialog = () => screen.getByRole('dialog');
const timer = () => document.querySelector('[data-slot=rest-timer]')?.textContent ?? '';
const done = (n: number) => within(dialog()).getByRole('button', { name: `Set ${n} done` });
async function group(user: ReturnType<typeof userEvent.setup>, set: number, value: string) {
  const toggle = within(dialog()).getByRole('button', {
    name: new RegExp(`Superset for set ${set}`),
  });
  await user.click(toggle);
  await user.selectOptions(within(dialog()).getByLabelText('Superset group'), value);
  await user.click(toggle);
}
async function prepare() {
  const user = await openEditor();
  const names = ['Bench press', 'Row', 'Squat'];
  document
    .querySelectorAll('input[role="combobox"][id$="-exercise"]')
    .forEach((el, i) => fireEvent.change(el, { target: { value: names[i] } }));
  return user;
}

beforeEach(() => localStorage.clear());

test('the rest starts after the last exercise of a superset round, not after the first', async () => {
  const user = await prepare();
  await group(user, 1, '1');
  await group(user, 2, '1');
  expect(within(dialog()).getByRole('button', { name: /Superset for set 1/ })).toHaveTextContent(
    'Superset 1',
  );
  await user.click(done(1));
  expect(timer(), 'the first exercise of the round does not rest').not.toMatch(/left/);
  await user.click(done(2));
  expect(timer(), 'the last exercise of the round starts the rest').toMatch(/left/);
});

test('a set outside a superset, or ungrouped again, rests after every set', async () => {
  const user = await prepare();
  await user.click(done(3));
  expect(timer()).toMatch(/left/);
});

test('a group of one exercise is rejected on save with a message', async () => {
  const user = await prepare();
  await group(user, 1, '1');
  fireEvent.submit(dialog().querySelector('form')!);
  expect(
    await screen.findByText(/Superset 1 needs at least two different exercises/),
  ).toBeInTheDocument();
  void user;
});
