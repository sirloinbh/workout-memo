import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';

import { App } from './app';
import { plateSettingsKey } from './plates';
import { fixClock, mockApi } from './test/api';
import { openPage } from './test/nav';

// #479: the set input shows which plates to load on each side of the bar.
async function openEditor() {
  fixClock();
  mockApi(() => []);
  const user = userEvent.setup();
  render(<App />);
  await openPage('Workout journal', user);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  return user;
}
const dialog = () => screen.getByRole('dialog');
const setWeight = (kg: string) =>
  fireEvent.change(within(dialog()).getAllByLabelText('Total weight kg')[0], {
    target: { value: kg },
  });
const firstPlates = () => dialog().querySelector<HTMLElement>('[data-slot=plate-calculator]')!;

beforeEach(() => localStorage.removeItem(plateSettingsKey));

test('the plate split follows the weight entered', async () => {
  await openEditor();
  setWeight('100');
  expect(firstPlates()).toHaveTextContent('Each side: 1 × 25 kg + 1 × 15 kg');
  setWeight('20');
  expect(firstPlates()).toHaveTextContent('No plates, just the bar');
  setWeight('15');
  expect(firstPlates()).toHaveTextContent('below the 20 kg bar');
  setWeight('21');
  expect(firstPlates()).toHaveTextContent('Cannot be made with these plates. Closest: 20 kg');
});

test('bar weight and plates are editable and kept on the phone', async () => {
  const user = await openEditor();
  setWeight('39');
  const box = within(firstPlates());
  fireEvent.change(box.getByLabelText('Bar weight (kg)'), { target: { value: '15' } });
  fireEvent.change(box.getByLabelText('Plates (kg, comma separated)'), {
    target: { value: '10, 2' },
  });
  await user.click(box.getByRole('button', { name: 'Use these plates' }));
  expect(firstPlates()).toHaveTextContent('Each side: 1 × 10 kg + 1 × 2 kg');
  expect(JSON.parse(localStorage.getItem(plateSettingsKey)!)).toEqual({
    format: 1,
    bar: 15,
    plates: [10, 2],
  });
  await user.click(box.getByRole('button', { name: 'Default plates' }));
  expect(JSON.parse(localStorage.getItem(plateSettingsKey)!).bar).toBe(20);
});

test('invalid plate settings cannot be saved', async () => {
  await openEditor();
  const box = within(firstPlates());
  fireEvent.change(box.getByLabelText('Plates (kg, comma separated)'), {
    target: { value: 'abc' },
  });
  expect(box.getByRole('button', { name: 'Use these plates' })).toBeDisabled();
});
