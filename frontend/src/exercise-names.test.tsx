import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { Combobox } from './components/combobox';
import { filterOptions } from './components/combobox-filter';
import { candidateNames, similarName } from './exercise-name-match';
import { fixClock, json, mockApi } from './test/api';
import { openPage } from './test/nav';

// #124: exercise name autocomplete (journal and goals) and similar-name hints.

test('options match ignoring spaces and case, skip the exact value and stop at eight', () => {
  const names = ['Benchpress', 'Incline Bench Press', 'Pec Deck', 'Squat'];
  expect(filterOptions(names, 'Bench Pr')).toEqual(['Benchpress', 'Incline Bench Press']);
  expect(filterOptions(names, 'pec')).toEqual(['Pec Deck']);
  expect(filterOptions(names, 'Benchpress')).toEqual(['Incline Bench Press']);
  expect(filterOptions(names, '')).toEqual(names);
  expect(
    filterOptions(
      Array.from({ length: 20 }, (_, i) => `Exercise${i}`),
      'Exercise',
    ),
  ).toHaveLength(8);
});

test('candidates keep the server order and add local names once', () => {
  const server = [
    { name: 'Squat', uses: 3, last_used: '2026-11-09' },
    { name: 'Benchpress', uses: 9, last_used: '2026-11-01' },
  ];
  expect(candidateNames(server, ['Benchpress', ' Leg Press ', '', 'Squat'])).toEqual([
    'Squat',
    'Benchpress',
    'Leg Press',
  ]);
});

test('a similar name differs only in spaces or case; an exact name is not similar', () => {
  const names = ['Benchpress', 'Lat Pulldown'];
  expect(similarName('Bench Press', names)).toBe('Benchpress');
  expect(similarName(' lat pulldown ', names)).toBe('Lat Pulldown');
  expect(similarName('Benchpress', names)).toBeNull();
  expect(similarName('Bench', names)).toBeNull();
  expect(similarName('  ', names)).toBeNull();
});

function Field({ onSubmit }: { onSubmit: () => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <label htmlFor="name">Exercise name</label>
      <Combobox
        id="name"
        value={value}
        onValueChange={setValue}
        options={['Benchpress', 'Incline Benchpress', 'Squat']}
        listLabel="Previously used names"
      />
    </form>
  );
}

test('the field is a combobox: arrows move, Enter picks without submitting, Esc only closes the list', async () => {
  const submit = vi.fn();
  const user = userEvent.setup();
  render(<Field onSubmit={submit} />);
  const input = screen.getByRole('combobox', { name: 'Exercise name' });
  expect(input).toHaveAttribute('aria-expanded', 'false');

  await user.type(input, 'Bench');
  const list = screen.getByRole('listbox', { name: 'Previously used names' });
  expect(input).toHaveAttribute('aria-expanded', 'true');
  expect(input).toHaveAttribute('aria-controls', list.id);
  expect(
    within(list)
      .getAllByRole('option')
      .map((o) => o.textContent),
  ).toEqual(['Benchpress', 'Incline Benchpress']);

  await user.keyboard('{ArrowDown}{ArrowDown}');
  const second = within(list).getByRole('option', { name: 'Incline Benchpress' });
  expect(second).toHaveAttribute('aria-selected', 'true');
  expect(input).toHaveAttribute('aria-activedescendant', second.id);
  await user.keyboard('{Enter}');
  expect(input).toHaveValue('Incline Benchpress');
  expect(submit).not.toHaveBeenCalled();
  expect(input).toHaveAttribute('aria-expanded', 'false');

  // Esc closes the list and stops there: a dialog around the field must stay open.
  const outer = vi.fn();
  document.addEventListener('keydown', outer, { capture: true });
  await user.clear(input);
  await user.type(input, 'Sq');
  expect(input).toHaveAttribute('aria-expanded', 'true');
  await user.keyboard('{Escape}');
  expect(input).toHaveAttribute('aria-expanded', 'false');
  expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
  // With the list closed, Esc reaches the dialog as before.
  await user.keyboard('{Escape}');
  expect(outer).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
  document.removeEventListener('keydown', outer, { capture: true });

  // A new name is kept as typed, and a tap on an option picks it.
  await user.clear(input);
  await user.type(input, 'New exercise');
  expect(input).toHaveValue('New exercise');
  await user.clear(input);
  await user.type(input, 'Sq');
  await user.click(screen.getByRole('option', { name: 'Squat' }));
  expect(input).toHaveValue('Squat');
  expect(input).toHaveFocus();
});

function mount() {
  fixClock();
  const api = mockApi(({ method, url }) => {
    if (url.pathname === '/api/exercise-names')
      return [
        { name: 'Benchpress', uses: 5, last_used: '2026-10-14' },
        { name: 'Squat', uses: 8, last_used: '2026-10-10' },
      ];
    if (url.pathname === '/api/goals' && method === 'POST') return json({ id: 1 }, 201);
    if (url.pathname === '/api/workouts' && method === 'POST')
      return json({ id: 42, version: 1 }, 201);
    return [];
  });
  return { user: userEvent.setup(), requests: api.requests };
}

test('journal sets suggest earlier names and offer the existing spelling of a similar one', async () => {
  const ui = mount();
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await ui.user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  const dialog = screen.getByRole('dialog');
  const first = within(dialog).getAllByRole('combobox', { name: 'Exercise name' })[0];

  await ui.user.type(first, 'Sq');
  await ui.user.click(await within(dialog).findByRole('option', { name: 'Squat' }));
  expect(first).toHaveValue('Squat');

  await ui.user.clear(first);
  await ui.user.type(first, 'Bench Press');
  const hint = await within(dialog).findByText(/Replace with the existing name ‘Benchpress’\?/);
  expect(first).toHaveValue('Bench Press'); // Nothing changes until the user agrees.
  await ui.user.click(within(hint).getByRole('button', { name: 'Replace' }));
  expect(first).toHaveValue('Benchpress');
  expect(within(dialog).queryByText(/Replace with the existing name/)).toBeNull();
});

test('the goal form picks a suggestion and saves the existing spelling', async () => {
  const ui = mount();
  render(<App />);
  await openPage('My Goals', ui.user);
  await ui.user.click(screen.getByRole('button', { name: 'Add goal' }));
  const dialog = screen.getByRole('dialog');
  const input = within(dialog).getByRole('combobox', { name: 'Exercise name' });
  await ui.user.type(input, 'Bench');
  await ui.user.click(await within(dialog).findByRole('option', { name: 'Benchpress' }));
  expect(input).toHaveValue('Benchpress');
  fireEvent.change(within(dialog).getByLabelText('Goal total weight (kg)'), {
    target: { value: '80' },
  });
  await ui.user.click(within(dialog).getByRole('button', { name: /Save goal/ }));
  await waitFor(() =>
    expect(ui.requests.find((r) => r.method === 'POST' && r.path === '/api/goals')?.body).toEqual(
      expect.objectContaining({ exercise: 'Benchpress', target_weight: 80 }),
    ),
  );
});

function Wrapped() {
  const [value, setValue] = useState('');
  return (
    // The journal and goal forms wrap the field in its <label>, like this.
    // eslint-disable-next-line jsx-a11y-x/label-has-associated-control
    <label>
      Exercise name
      <Combobox
        value={value}
        onValueChange={setValue}
        options={['Squat', 'Front Squat']}
        listLabel="Previously used names"
      />
    </label>
  );
}

test('a tapped option closes the list even inside a label and when other options still match', async () => {
  const user = userEvent.setup();
  render(<Wrapped />);
  const input = screen.getByRole('combobox', { name: 'Exercise name' });
  await user.type(input, 'Sq');
  await user.click(screen.getByRole('option', { name: 'Squat' }));
  expect(input).toHaveValue('Squat');
  // "Front Squat" still contains the value, yet the list stays closed after the pick.
  expect(input).toHaveAttribute('aria-expanded', 'false');
});

test('the similar-name live region exists before its message so the message is announced', async () => {
  const ui = mount();
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await ui.user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  const dialog = screen.getByRole('dialog');
  const first = within(dialog).getAllByRole('combobox', { name: 'Exercise name' })[0];
  const region = first.closest('div:not([data-slot])')!.querySelector('[aria-live="polite"]')!;
  expect(region).toHaveClass('sr-only');
  expect(region).toBeEmptyDOMElement();
  await ui.user.type(first, 'Bench Press');
  await waitFor(() =>
    expect(region.textContent).toMatch(/Replace with the existing name ‘Benchpress’/),
  );
  expect(region).not.toHaveClass('sr-only');
});
