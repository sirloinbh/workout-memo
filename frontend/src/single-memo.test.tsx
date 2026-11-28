import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';

// #532: one memo per workout, written when finishing it. Set memos saved earlier are kept and shown, not edited.
beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

const oldWorkout = {
  id: 7,
  version: 2,
  date: '2026-10-15',
  title: 'Legs',
  notes: 'Felt strong',
  feedback: null,
  sets: [
    {
      exercise: 'Squat',
      machine_id: null,
      weight: 100,
      reps: 5,
      notes: 'Left knee clicked',
      completed: true,
    },
    { exercise: 'Squat', machine_id: null, weight: 100, reps: 5, notes: '', completed: true },
  ],
};

function mount() {
  fixClock();
  const api = mockApi(({ method, url }) => {
    if (method === 'PUT' || method === 'POST') return json({ id: 7, version: 3 }, 201);
    return url.pathname === '/api/workouts' ? structuredClone([oldWorkout]) : [];
  });
  render(<App />);
  return { api, user: userEvent.setup() };
}

test('a new workout has no set memo field, only the workout memo', async () => {
  const { user } = mount();
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  const editor = screen.getByRole('region', { name: 'New workout record' });
  expect(within(editor).queryByLabelText(/Set memo/)).toBeNull();
  expect(within(editor).getAllByLabelText('Workout memo')).toHaveLength(1);
});

test('an older set memo stays visible read-only and is saved unchanged, together with the workout memo', async () => {
  const { api, user } = mount();
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await user.click(await screen.findByRole('button', { name: 'Edit' }));
  const editor = screen.getByRole('region', { name: 'Edit workout journal' });
  expect(within(editor).getByText(/Earlier set memo: Left knee clicked/)).toBeInTheDocument();
  expect(within(editor).queryByRole('textbox', { name: /Set memo/ })).toBeNull();
  const memo = within(editor).getByLabelText('Workout memo');
  await user.clear(memo);
  await user.type(memo, 'New memo');
  // A new set does not copy the older set's memo.
  await user.click(within(editor).getByRole('button', { name: 'Add set' }));
  await user.click(within(editor).getByRole('button', { name: 'Save record' }));
  await waitFor(() => expect(api.requests.some((r) => r.method === 'PUT')).toBe(true));
  const body = api.requests.find((r) => r.method === 'PUT')!.body as {
    notes: string;
    sets: { notes: string }[];
  };
  expect(body.notes).toBe('New memo');
  expect(body.sets.map((s) => s.notes)).toEqual(['Left knee clicked', '', '']);
});
