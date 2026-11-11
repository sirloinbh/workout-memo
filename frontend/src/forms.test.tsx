import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #64: forms validate with the shared contract before anything is sent.
function mount() {
  fixClock();
  const api = mockApi(({ method, url }) => {
    if (method === 'POST') return json({ id: 1, version: 1 }, 201);
    if (url.pathname === '/api/routine-progress') return { today: '2026-10-15', routine: null };
    return [];
  });
  const user = userEvent.setup();
  render(<App />);
  return {
    user,
    posts: (path: string) =>
      api.requests.filter((r) => r.method === 'POST' && r.url.pathname === path),
  };
}
const loaded = () => waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
// The message is linked to the field: aria-invalid plus aria-describedby.
function expectInvalid(field: HTMLElement, message: string) {
  expect(field).toHaveAttribute('aria-invalid', 'true');
  expect(field).toHaveAccessibleDescription(message);
}

test('the goal form shows per-field messages and sends nothing until valid', async () => {
  const ui = mount();
  await loaded();
  await openPage('My Goals', ui.user);
  await ui.user.click(screen.getByRole('button', { name: 'Add goal' }));
  const dialog = screen.getByRole('dialog', { name: 'Progressive overload goals' });
  const save = within(dialog).getByRole('button', { name: 'Save goal' });
  await ui.user.click(save);
  expectInvalid(await within(dialog).findByLabelText('Exercise name'), 'Enter an exercise name');
  expectInvalid(
    within(dialog).getByLabelText('Goal total weight (kg)'),
    'Enter the goal total weight as a number',
  );
  expect(ui.posts('/api/goals')).toHaveLength(0);

  await ui.user.type(within(dialog).getByLabelText('Exercise name'), 'Benchpress');
  await ui.user.type(within(dialog).getByLabelText('Goal total weight (kg)'), '80');
  fireEvent.change(within(dialog).getByLabelText('Start date'), {
    target: { value: '2026-10-20' },
  });
  fireEvent.change(within(dialog).getByLabelText('End date'), { target: { value: '2026-10-19' } });
  await ui.user.click(save);
  expectInvalid(
    await within(dialog).findByLabelText('End date'),
    'The end date must be the same as or after the start date',
  );
  expect(within(dialog).getByLabelText('Exercise name')).not.toHaveAttribute('aria-invalid');
  expect(ui.posts('/api/goals')).toHaveLength(0);

  fireEvent.change(within(dialog).getByLabelText('End date'), { target: { value: '2026-12-31' } });
  await ui.user.click(save);
  await waitFor(() => expect(ui.posts('/api/goals')).toHaveLength(1));
  expect(ui.posts('/api/goals')[0].body).toEqual({
    exercise: 'Benchpress',
    target_weight: 80,
    target_reps: 10,
    start_date: '2026-10-20',
    deadline: '2026-12-31',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('the journal form marks the invalid set fields and keeps the input unsent', async () => {
  const ui = mount();
  await loaded();
  await ui.user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  const dialog = screen.getByRole('dialog', { name: 'New workout record' });
  await ui.user.type(within(dialog).getByLabelText('Journal title'), 'Lower body');
  const names = within(dialog).getAllByLabelText('Exercise name');
  const weights = within(dialog).getAllByLabelText('Total weight kg');
  fireEvent.change(names[0], { target: { value: 'Squat' } });
  fireEvent.change(weights[0], { target: { value: '100000' } });
  fireEvent.change(names[2], { target: { value: 'Lunge' } });
  // Bypasses native constraints so the contract itself is what rejects the input.
  fireEvent.submit(dialog.querySelector('form')!);
  expectInvalid(
    await within(dialog)
      .findAllByLabelText('Total weight kg')
      .then((w) => w[0]),
    'Enter a total weight from 0 to 99999 kg',
  );
  expectInvalid(within(dialog).getAllByLabelText('Exercise name')[1], 'Enter an exercise name');
  expect(within(dialog).getAllByLabelText('Exercise name')[0]).not.toHaveAttribute('aria-invalid');
  expect(within(dialog).getByRole('status')).toHaveTextContent('Check your input');
  expect(ui.posts('/api/workouts')).toHaveLength(0);

  fireEvent.change(within(dialog).getAllByLabelText('Total weight kg')[0], {
    target: { value: '100' },
  });
  fireEvent.change(within(dialog).getAllByLabelText('Exercise name')[1], {
    target: { value: 'Squat' },
  });
  fireEvent.submit(dialog.querySelector('form')!);
  await waitFor(() => expect(ui.posts('/api/workouts')).toHaveLength(1));
  expect((ui.posts('/api/workouts')[0].body as { sets: unknown[] }).sets).toHaveLength(3);
});

test('the machine form requires a brand before registering', async () => {
  const ui = mount();
  await loaded();
  await openPage('Machine Library', ui.user);
  await ui.user.click(screen.getByRole('button', { name: 'Add machine' }));
  const dialog = screen.getByRole('dialog', { name: 'Add machine' });
  fireEvent.submit(dialog.querySelector('form')!);
  expectInvalid(await within(dialog).findByLabelText('Brand'), 'Choose a brand');
  expectInvalid(within(dialog).getByLabelText('Machine name'), 'Enter a machine name');
  expect(ui.posts('/api/machines')).toHaveLength(0);
});
