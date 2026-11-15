import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';

import { App } from './app';
import { fixClock, json, mockApi } from './test/api';

// #84: a completed set starts the rest of its exercise kind. Single-joint comes from the
// machine library, lower/upper body from the user's body part mapping (#32).
const machines = [
  {
    id: 5,
    brand_id: 1,
    brand: 'Hammer',
    name: 'Leg Extension',
    base_weight: 10,
    notes: '',
    single_joint: true,
  },
  {
    id: 6,
    brand_id: 1,
    brand: 'Hammer',
    name: 'Leg Press',
    base_weight: 50,
    notes: '',
    single_joint: false,
  },
];
const bodyParts = [
  { exercise: 'squat', body_parts: ['하체-앞'] },
  { exercise: 'benchpress', body_parts: ['가슴'] },
  { exercise: 'leg extension', body_parts: ['하체-앞'] },
  { exercise: 'crunch', body_parts: ['복근'] },
];

function mount() {
  fixClock();
  vi.stubGlobal('confirm', () => true);
  const api = mockApi(({ method, url }) => {
    if (url.pathname === '/api/machines') return machines;
    if (url.pathname === '/api/exercise-body-parts') return bodyParts;
    if (method === 'POST' || method === 'PUT') return json({ id: 1, version: 1 }, 201);
    return [];
  });
  const user = userEvent.setup();
  const view = render(<App />);
  return { user, view, requests: api.requests };
}
const timer = () => document.querySelector('[data-slot=rest-timer]')?.textContent ?? '';
const dialog = () => screen.getByRole('dialog');
async function openWith(ui: ReturnType<typeof mount>, exercise: string, machine = '') {
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await waitFor(() =>
    expect(ui.requests.some((r) => r.path === '/api/exercise-body-parts')).toBe(true),
  );
  await ui.user.click(screen.getAllByRole('button', { name: 'Log workout' })[0]);
  const auto = within(dialog()).getByLabelText('Auto-start when a set is done');
  if (auto.getAttribute('aria-checked') !== 'true') await ui.user.click(auto);
  fireEvent.change(within(dialog()).getAllByLabelText('Exercise name')[0], {
    target: { value: exercise },
  });
  if (machine)
    fireEvent.change(within(dialog()).getAllByLabelText('Machine')[0], {
      target: { value: machine },
    });
}
async function completeFirst(ui: ReturnType<typeof mount>) {
  await ui.user.click(screen.getByRole('button', { name: 'Set 1 done' }));
}

test.each([
  ['Squat', '', '2:30', 'lower body'],
  ['Benchpress', '', '2:00', 'upper body'],
  ['Leg Extension', '5', '1:30', 'single-joint machine wins over lower body'],
  ['  Squat ', '6', '2:30', 'a machine that is not single-joint uses the body part'],
])('%s starts a %s rest (%s)', async (exercise, machine, shown) => {
  const ui = mount();
  await openWith(ui, exercise, machine);
  await completeFirst(ui);
  expect(timer()).toMatch(new RegExp(`${shown} left`));
});

test('exercises without a kind keep the configured rest', async () => {
  const ui = mount();
  await openWith(ui, 'Crunch');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Rest time (sec)' }), {
    target: { value: '45' },
  });
  await completeFirst(ui);
  expect(timer()).toMatch(/0:45 left/);
});

test('per-kind rests can be changed and are kept in this browser', async () => {
  const first = mount();
  await openWith(first, 'Squat');
  expect(screen.getByRole('spinbutton', { name: 'Lower body rest (sec)' })).toHaveValue(150);
  expect(screen.getByRole('spinbutton', { name: 'Upper body rest (sec)' })).toHaveValue(120);
  expect(screen.getByRole('spinbutton', { name: 'Single-joint rest (sec)' })).toHaveValue(90);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Lower body rest (sec)' }), {
    target: { value: '180' },
  });
  // Invalid values are ignored instead of replacing the stored rest.
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Upper body rest (sec)' }), {
    target: { value: '3' },
  });
  first.view.unmount();
  // Reload: the journal draft is restored and the per-kind rests come from storage.
  const second = mount();
  await waitFor(() =>
    expect(second.requests.some((r) => r.path === '/api/exercise-body-parts')).toBe(true),
  );
  await second.user.click(await screen.findByRole('button', { name: /Restore/ }));
  expect(screen.getByRole('spinbutton', { name: 'Lower body rest (sec)' })).toHaveValue(180);
  expect(screen.getByRole('spinbutton', { name: 'Upper body rest (sec)' })).toHaveValue(120);
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await completeFirst(second);
  expect(timer()).toMatch(/3:00 left/);
});

test('the machine form saves the single-joint flag', async () => {
  const ui = mount();
  await waitFor(() => expect(screen.queryByText('Loading records…')).toBeNull());
  await ui.user.click(screen.getByRole('link', { name: 'Machine Library' }));
  await waitFor(() => expect(document.body.textContent).toMatch(/Hammer · Single-joint/));
  await ui.user.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
  const box = within(dialog()).getByLabelText(/Single-joint exercise machine/);
  expect(box).not.toBeChecked();
  await ui.user.click(box);
  fireEvent.submit(dialog().querySelector('form')!);
  await waitFor(() => expect(ui.requests.some((r) => r.method === 'PUT')).toBe(true));
  const put = ui.requests.find((r) => r.method === 'PUT')!;
  expect(put.path).toBe('/api/machines/6');
  expect((put.body as { single_joint: boolean }).single_joint).toBe(true);
});
