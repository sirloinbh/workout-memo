import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, test } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';
import { setGroups, type SetRow, withoutSetKeys, withSetKeys } from './workspace/model';

// #531: the exercise name (and machine) is entered once per exercise; its sets share it.
const set = (exercise: string, extra: Partial<SetRow> = {}): SetRow => ({
  exercise,
  machine_id: null,
  weight: 50,
  reps: 10,
  notes: '',
  ...extra,
});
const groupNames = (sets: SetRow[]) =>
  setGroups(withSetKeys({ sets }).sets).map((g) => g.indexes.map((i) => sets[i].exercise));

test('an old workout groups consecutive equal names; the same name apart stays two exercises', () => {
  const sets = [set('Squat'), set('squat '), set('Row'), set('Squat')];
  expect(groupNames(sets)).toEqual([['Squat', 'squat '], ['Row'], ['Squat']]);
});

test('blank sets that follow each other start as one exercise', () => {
  expect(setGroups(withSetKeys({ sets: [set(''), set(''), set('')] }).sets)).toHaveLength(1);
});

test('the group id is client-only: saving strips it', () => {
  const keyed = withSetKeys({ sets: [set('Squat')] });
  expect(keyed.sets[0]._group).toBeTruthy();
  expect(Object.keys(withoutSetKeys(keyed).sets[0])).not.toContain('_group');
  expect(Object.keys(withoutSetKeys(keyed).sets[0])).not.toContain('_key');
});

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

test('the editor shows one name per exercise, a new set adds no name, and saving sends it on every set', async () => {
  fixClock();
  const api = mockApi(({ method }) => (method === 'POST' ? json({ id: 9, version: 1 }, 201) : []));
  const user = userEvent.setup();
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  const editor = screen.getByRole('region', { name: 'New workout record' });
  expect(within(editor).getAllByLabelText('Exercise name')).toHaveLength(1);
  expect(within(editor).getAllByLabelText('Total weight kg')).toHaveLength(3);
  await user.click(within(editor).getByRole('button', { name: 'Add set' }));
  expect(within(editor).getAllByLabelText('Total weight kg')).toHaveLength(4);
  expect(
    within(editor).getAllByLabelText('Exercise name'),
    'adding a set adds no name',
  ).toHaveLength(1);
  await user.click(within(editor).getByRole('button', { name: 'Add another exercise' }));
  const names = within(editor).getAllByLabelText('Exercise name');
  expect(names).toHaveLength(2);
  fireEvent.change(names[0], { target: { value: 'Squat' } });
  fireEvent.change(names[1], { target: { value: 'Row' } });
  fireEvent.submit(editor.querySelector('form')!);
  await waitFor(() =>
    expect(api.requests.some((r) => r.method === 'POST' && r.path === '/api/workouts')).toBe(true),
  );
  const body = api.requests.find((r) => r.method === 'POST' && r.path === '/api/workouts')!
    .body as { sets: Record<string, unknown>[] };
  expect(body.sets.map((s) => s.exercise)).toEqual(['Squat', 'Squat', 'Squat', 'Squat', 'Row']);
  expect(body.sets.every((s) => !('_group' in s) && !('_key' in s))).toBe(true);
});
